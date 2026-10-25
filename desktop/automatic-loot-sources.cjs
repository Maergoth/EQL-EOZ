'use strict';
// Native-only, append-only publication of fresh log drop relationships. Raw log
// lines and player names never become candidate fields or publication metadata.
const crypto=require('node:crypto');
const MAX_PENDING=64,MAX_RECENT=1000,MAX_SEEN=4000;
const FRESH_MS=10000,KILL_MS=60000,QUEUE_MS=60000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const modules=()=>Promise.all([import('../app/contribution-model.js'),import('../app/wiki-identity.js'),import('../app/generated-pets.js'),import('../app/automatic-source-policy.js'),import('../app/contribution-coverage.js')]);
const sameUser=(a,b)=>a?.id===b?.id&&a?.name===b?.name;
const errorText=error=>String(error?.message||'The drop source needs review.').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,400);

class AutomaticLootSources{
    constructor({client,onResult=()=>{},onDeferred=()=>{},onDecision=()=>{},now=Date.now}={}){
        if(!client)throw Error('Automatic loot sources require the native wiki client.');
        this.client=client;this.onResult=onResult;this.onDeferred=onDeferred;this.onDecision=onDecision;this.now=now;
        this.chain=Promise.resolve();this.pending=0;this.epoch=0;this.disposed=false;
        this.seen=new Set();this.completed=new Set();this.kills=new Map();this.cursors=new Map();this.decisions=new Map();
    }
    cancel(){this.epoch++;this.kills.clear();this.cursors.clear();this.decisions.clear();}
    dispose(){this.disposed=true;this.cancel();this.kills.clear();}
    bounded(set,value){set.add(value);if(set.size>MAX_SEEN)set.delete(set.values().next().value);}
    notify(callback,result){try{callback(result);}catch{/* UI delivery cannot repeat a confirmed wiki edit. */}return result;}
    observe(record){
        if(this.disposed||record?.kind!=='game-log'||record.owner!=='contribution'||record.parser?.name!=='native-eq-log'||record.input?.live!==true||!['kill','loot','zone'].includes(record.input.event))return Promise.resolve({accepted:false});
        const at=Date.parse(record.capturedAt||''),source=record.input.logId,cursor=record.input.cursor;
        if(!Number.isFinite(at)||this.now()-at>FRESH_MS||at-this.now()>2000||typeof source!=='string'||!/^\w[\w-]{0,119}$/.test(source)||!Number.isSafeInteger(cursor)||cursor<0||typeof record.id!=='string'||record.id.length>240)return Promise.resolve({accepted:false});
        const previous=this.cursors.get(source);if(previous!==undefined&&cursor<=previous)return Promise.resolve({accepted:false});
        this.cursors.set(source,cursor);if(this.cursors.size>64)this.cursors.delete(this.cursors.keys().next().value);
        if(this.seen.has(record.id))return Promise.resolve({accepted:false});this.bounded(this.seen,record.id);
        if(this.pending>=MAX_PENDING)return Promise.resolve(this.notify(this.onDeferred,{observationId:record.id,status:'deferred',reason:'The automatic source queue is full. Review this discovery in Contribute.'}));
        const snapshot=JSON.parse(JSON.stringify(record)),epoch=this.epoch;this.pending++;
        const task=()=>this.process(snapshot,epoch).catch(error=>this.notify(this.onDeferred,{observationId:snapshot.id,item:snapshot.subject?.kind==='item'?snapshot.subject.name:'',status:'deferred',reason:errorText(error)})).finally(()=>{this.pending--;});
        const result=this.chain.then(task,task);this.chain=result.then(()=>{},()=>{});return result;
    }
    async resolve(name,kind,{missing=false}={}){
        const [{contributionTitle},{normalizeWikiIdentity}]=await modules();name=contributionTitle(name);
        const found=await this.client.findMatches({name,kind,requireComplete:true});
        if(found.complete!==true||!Array.isArray(found.rawCandidates)||!Array.isArray(found.exact))throw Error('The live title lookup is incomplete. Review this source manually.');
        const key=normalizeWikiIdentity(name),titles=new Set(found.exact.filter(page=>!page.missing).map(page=>page.title));
        for(const page of found.rawCandidates)if(normalizeWikiIdentity(page.title)===key)titles.add(page.title);
        // A close spelling or family name is a review hint, never automatic
        // identity evidence. Exact titles and verified redirects alone write.
        if(titles.size>8)throw Error('Too many matching wiki titles need review.');
        const pages=new Map();for(const title of titles){const page=await this.client.page(title,{resolveRedirects:true});if(page.missing||page.redirect)throw Error('The wiki destination changed during lookup.');if(page.namespace!==undefined&&page.namespace!==0||page.title?.includes(':')&&page.namespace!==0)throw Error('The wiki destination is not a verified mainspace article.');pages.set(page.title,page);}
        if(pages.size>1)throw Error('The wiki has competing destination pages. Choose one in Contribute.');
        if(!pages.size){if(missing&&found.exact.length&&found.exact.every(page=>page.missing))return{title:name,missing:true,content:''};throw Error('The '+kind+' page is not available on the wiki. Review it in Contribute.');}
        const page=[...pages.values()][0],pattern=kind==='item'?/\{\{\s*Itempage\b/i:kind==='npc'?/\{\{\s*Namedmobpage\b/i:/\bzoneTopTable\b|\[\[\s*Category\s*:\s*Zones\b/i;
        if(!pattern.test(page.content||''))throw Error('The matched destination is not a supported '+kind+' page. Review it in Contribute.');
        return page;
    }
    async process(record,epoch){
        const [{contributionTitle},{normalizeWikiIdentity,itemExaltationBaseIdentity,createWikiResolver},{classifyNpcEvidence,isOwnedPetName},{skipAutomaticSourceBackfill,skipBroadAutomaticSourceBackfill},{cachedContributionCoverage,liveContributionCoverage,validateAutomaticSourcePlan,contributionRelationKey}]=await modules();
        const input=record.input,at=Date.parse(record.capturedAt),zone=String(input.zone||'').trim(),instance=input.instance;
        const current=()=>{if(this.disposed||epoch!==this.epoch)throw Error('Automatic source updating was cancelled.');if(this.now()-at>QUEUE_MS)throw Error('This source observation is no longer fresh. Review it in Contribute.');};
        current();for(const [key,value]of this.kills)if(this.now()-value.at>KILL_MS)this.kills.delete(key);
        if(input.event==='zone'){for(const [key,value]of this.kills)if(value.source===input.logId)this.kills.delete(key);return{accepted:true};}
        if(!zone||/^(?:unknown|none|\?|loading)$/i.test(zone)||!['normal','raid'].includes(instance))return{accepted:false};
        const keyFor=name=>[input.logId,normalizeWikiIdentity(zone),instance,normalizeWikiIdentity(name)].join('|');
        if(input.event==='kill'){
            if(record.subject?.kind!=='monster'||!record.subject.name||/^(?:you|yourself)$/i.test(record.subject.name)||record.input.isPlayer||record.input.isPet||isOwnedPetName(record.subject.name))return{accepted:false};
            this.kills.set(keyFor(record.subject.name),{source:input.logId,at,cursor:input.cursor});if(this.kills.size>MAX_RECENT)this.kills.delete(this.kills.keys().next().value);return{accepted:true};
        }
        if(record.subject?.kind!=='item')return{accepted:false};
        const itemName=contributionTitle(itemExaltationBaseIdentity(record.subject.name));
        const catalog=await this.client.getItemCatalog?.();current();
        if(catalog){
            if(this.policyCatalog!==catalog){this.policyCatalog=catalog;this.policyResolver=createWikiResolver(catalog);}
        }
        const relations=(Array.isArray(record.relations)?record.relations:[]).filter(relation=>relation.type==='drop-source'&&relation.name&&normalizeWikiIdentity(relation.zone)===normalizeWikiIdentity(zone)&&relation.instance===instance&&(!relation.item||normalizeWikiIdentity(itemExaltationBaseIdentity(relation.item))===normalizeWikiIdentity(itemName))&&['explicit-corpse','recent-kill'].includes(relation.evidence)).slice(0,4);
        const results=[];
        for(const relation of relations){
            if(isOwnedPetName(relation.name)||/^(?:you|yourself|unknown|\?)$/i.test(relation.name))continue;
            if(relation.evidence==='recent-kill'){const kill=this.kills.get(keyFor(relation.name));if(!kill||kill.cursor>=input.cursor||at<kill.at||at-kill.at>KILL_MS)continue;}
            let context={observationId:record.id,item:itemName,npc:contributionTitle(relation.name),zone,instance};
            const dataset=String(catalog?.meta?.version||catalog?.meta?.manifestVersion||'')+'|'+String(catalog?.meta?.generatedAt||'')+'|'+String(catalog?.meta?.wikiRelationshipCoverageVersion||'')+'|'+String(catalog?.meta?.lootSourceCountsVersion||''),factKey=contributionRelationKey(context,{resolver:this.policyResolver||createWikiResolver({})}),memoKey=dataset+'|'+factKey;
            const remember=value=>{if(epoch!==this.epoch||!factKey)return;const bounded={item:value.item,npc:value.npc,zone:value.zone,instance:value.instance,status:value.status,decision:value.decision,reason:value.reason};this.decisions.delete(memoKey);this.decisions.set(memoKey,{value:bounded,until:this.now()+(value.decision==='covered'?60000:30000)});while(this.decisions.size>MAX_RECENT)this.decisions.delete(this.decisions.keys().next().value);};
            const quiet=(decision,reason,proofs=[])=>{const value={...context,schemaVersion:1,status:'quiet',decision,reason,relationKey:factKey,datasetVersion:String(catalog?.meta?.version||catalog?.meta?.manifestVersion||'').slice(0,120),proofs:proofs.slice(0,8).map(proof=>({wikiTitle:String(proof.wikiTitle||'').slice(0,240),revisionId:Number.isSafeInteger(proof.revisionId)?proof.revisionId:null,field:String(proof.field||'').slice(0,80),...(proof.setTitle?{setTitle:String(proof.setTitle).slice(0,240)}:{})}))};remember(value);return this.notify(this.onDecision,value);};
            try{
                current();const priorDecision=this.decisions.get(memoKey);if(priorDecision&&priorDecision.until>this.now()){results.push({...priorDecision.value,observationId:record.id,memoized:true});continue;}this.decisions.delete(memoKey);
                if(catalog){
                    const coverage=cachedContributionCoverage(catalog,context,{resolver:this.policyResolver});
                    if(coverage.state==='covered'){context={...context,...coverage.relation};results.push(quiet('covered',coverage.reason,coverage.proofs));continue;}
                    if(this.policyResolver.resolve('npc',relation.name).membership==='present'&&skipAutomaticSourceBackfill(catalog,itemName,{resolver:this.policyResolver})){results.push(quiet('routine','known-common-material'));continue;}
                    if(skipBroadAutomaticSourceBackfill(catalog,itemName,{coverage,resolver:this.policyResolver})){results.push(quiet('routine','known-common-basic-broad-source'));continue;}
                    if(['broad','unsupported'].includes(coverage.state))throw Error('The authored source or loot field covers a group or needs review before this exact source can be added.');
                }
                current();const account=await this.client.expectedUser();
                const [item,npc,zonePage]=await Promise.all([this.resolve(itemName,'item'),this.resolve(relation.name,'npc',{missing:true}),this.resolve(zone,'zone')]);current();
                if(!classifyNpcEvidence(npc.title,{membership:npc.missing?'missing':'present'}).eligible)throw Error('Player pets cannot be recorded as drop sources.');
                const relationKey=hash(JSON.stringify([account.user,item.title,npc.title,zonePage.title,instance]));context={...context,item:item.title,npc:npc.title,zone:zonePage.title,relationKey};
                const coverage=liveContributionCoverage(catalog||{},context,{resolver:this.policyResolver||createWikiResolver({}),itemPage:item,npcPage:npc});
                if(coverage.state==='covered'){results.push(quiet('covered',coverage.reason,coverage.proofs));continue;}
                if(npc.missing){results.push({...context,status:'discovery',reason:'unknown-monster'});continue;}
                if(skipBroadAutomaticSourceBackfill(catalog,itemName,{coverage,itemPage:item,resolver:this.policyResolver})){results.push(quiet('routine','known-common-basic-broad-source'));continue;}
                if(coverage.state!=='uncovered')throw Error('The monster’s authored loot field needs review before adding this source.');
                if(this.completed.has(relationKey)){results.push(quiet('covered','previous-source-publication'));continue;}
                await this.client.load();
                const prior=[...this.client.plans.values()].find(plan=>plan.automaticSource?.relationKey===relationKey);
                if(prior){if(prior.status==='submitted'){this.bounded(this.completed,relationKey);results.push({...context,status:'unchanged',plan:prior});continue;}if(prior.automaticOptOut){results.push({...context,status:'skipped',reason:prior.automaticOptOut.reason});continue;}throw Error('A previous source update needs review before retrying.');}
                const checkPlan=plan=>{
                    if(!sameUser(plan.expectedUser,account.user)||plan.automaticSource?.relationKey!==relationKey)throw Error('The source update requires manual review.');
                    validateAutomaticSourcePlan(plan,{pack:catalog,resolver:this.policyResolver});
                };
                let plan=await this.client.prepareObservedLootRelation({relation:context,itemPage:item,npcPage:npc,zonePage,account:account.user,observationId:record.id,relationKey,evidence:relation.evidence,catalog});current();checkPlan(plan);
                const stored=this.client.plans.get(plan.id);if(!stored)throw Error('The prepared source update was not saved.');
                const beforeWrite=async()=>{current();checkPlan(stored);await this.client.expectedUser(account.user);current();};
                const result=await this.client.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest},{beforeWrite,automaticPolicyPages:[item,npc,zonePage]});
                if(result.automaticOptOut){if(['covered','routine'].includes(result.automaticOptOut.decision)&&!result.pages.some(page=>['applied','unknown','failed'].includes(page.status))){results.push(quiet(result.automaticOptOut.decision,result.automaticOptOut.reason));continue;}throw Object.assign(Error(result.automaticOptOut.reason||'This saved source update needs review.'),result.pages.some(page=>['applied','unknown','failed'].includes(page.status))?{plan:result}:{});}
                if(result.status!=='submitted')throw Object.assign(Error('The wiki did not confirm every source link. Review the saved result in Contribute.'),{plan:result});
                this.bounded(this.completed,relationKey);remember({...context,status:'quiet',decision:'covered',reason:'confirmed-source-publication'});results.push(this.notify(this.onResult,{...context,status:'submitted',plan:result,pageUrl:this.client.origin+'/'+encodeURIComponent(npc.title.replace(/ /g,'_'))}));
            }catch(error){if(epoch!==this.epoch)continue;const value={...context,status:'deferred',reason:errorText(error),...(error.plan?{plan:error.plan}:{})};remember(value);results.push(this.notify(this.onDeferred,value));}
        }
        return{accepted:Boolean(results.length),results};
    }
}
module.exports={AutomaticLootSources};
