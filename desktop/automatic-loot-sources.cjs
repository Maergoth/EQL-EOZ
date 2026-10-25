'use strict';
// Native-only, append-only publication of fresh log drop relationships. Raw log
// lines and player names never become candidate fields or publication metadata.
const crypto=require('node:crypto');
const {normalizeWikiSubmissionText}=require('./wiki-client.cjs');
const MAX_PENDING=64,MAX_RECENT=1000,MAX_SEEN=4000;
const FRESH_MS=10000,KILL_MS=60000,QUEUE_MS=60000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const modules=()=>Promise.all([import('../app/contribution-model.js'),import('../app/wiki-identity.js'),import('../app/generated-pets.js')]);
const sameUser=(a,b)=>a?.id===b?.id&&a?.name===b?.name;
const errorText=error=>String(error?.message||'The drop source needs review.').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,400);
function distance(a,b){if(Math.abs(a.length-b.length)>2)return 3;let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===b[j-1]?0:1));row=next;}return row[b.length];}

class AutomaticLootSources{
    constructor({client,onResult=()=>{},onDeferred=()=>{},now=Date.now}={}){
        if(!client)throw Error('Automatic loot sources require the native wiki client.');
        this.client=client;this.onResult=onResult;this.onDeferred=onDeferred;this.now=now;
        this.chain=Promise.resolve();this.pending=0;this.epoch=0;this.disposed=false;
        this.seen=new Set();this.completed=new Set();this.kills=new Map();this.cursors=new Map();
    }
    cancel(){this.epoch++;this.kills.clear();this.cursors.clear();}
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
        if(!titles.size){
            const ranked=found.rawCandidates.map(page=>{const other=normalizeWikiIdentity(page.title),d=distance(key,other);return{title:page.title,d,score:1-d/Math.max(key.length,other.length)};}).filter(page=>page.d<=2&&key.length>=8&&page.score>=.88).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title));
            if(ranked.length&&ranked[1]&&ranked[0].score-ranked[1].score<.08)throw Error('Several wiki titles could match this source. Choose its destination in Contribute.');
            if(ranked.length)titles.add(ranked[0].title);
        }
        if(titles.size>8)throw Error('Too many matching wiki titles need review.');
        const pages=new Map();for(const title of titles){const page=await this.client.page(title,{resolveRedirects:true});if(page.missing||page.redirect)throw Error('The wiki destination changed during lookup.');pages.set(page.title,page);}
        if(pages.size>1)throw Error('The wiki has competing destination pages. Choose one in Contribute.');
        if(!pages.size){if(missing&&found.exact.length&&found.exact.every(page=>page.missing))return{title:name,missing:true,content:''};throw Error('The '+kind+' page is not available on the wiki. Review it in Contribute.');}
        const page=[...pages.values()][0],pattern=kind==='item'?/\{\{\s*Itempage\b/i:kind==='npc'?/\{\{\s*Namedmobpage\b/i:/\bzoneTopTable\b|\[\[\s*Category\s*:\s*Zones\b/i;
        if(!pattern.test(page.content||''))throw Error('The matched destination is not a supported '+kind+' page. Review it in Contribute.');
        return page;
    }
    async process(record,epoch){
        const [{contributionTitle,patchContributionRelationship},{normalizeWikiIdentity,itemExaltationBaseIdentity},{classifyNpcEvidence,isOwnedPetName}]=await modules();
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
        const relations=(Array.isArray(record.relations)?record.relations:[]).filter(relation=>relation.type==='drop-source'&&relation.name&&normalizeWikiIdentity(relation.zone)===normalizeWikiIdentity(zone)&&relation.instance===instance&&(!relation.item||normalizeWikiIdentity(itemExaltationBaseIdentity(relation.item))===normalizeWikiIdentity(itemName))&&['explicit-corpse','recent-kill'].includes(relation.evidence)).slice(0,4);
        const results=[];
        for(const relation of relations){
            if(isOwnedPetName(relation.name)||/^(?:you|yourself|unknown|\?)$/i.test(relation.name))continue;
            if(relation.evidence==='recent-kill'){const kill=this.kills.get(keyFor(relation.name));if(!kill||kill.cursor>=input.cursor||at<kill.at||at-kill.at>KILL_MS)continue;}
            let context={observationId:record.id,item:itemName,npc:contributionTitle(relation.name),zone,instance};
            try{
                current();const account=await this.client.expectedUser();
                const [item,npc,zonePage]=await Promise.all([this.resolve(itemName,'item'),this.resolve(relation.name,'npc',{missing:true}),this.resolve(zone,'zone')]);current();
                if(!classifyNpcEvidence(npc.title,{membership:npc.missing?'missing':'present'}).eligible)throw Error('Player pets cannot be recorded as drop sources.');
                const relationKey=hash(JSON.stringify([account.user,item.title,npc.title,zonePage.title,instance]));context={...context,item:item.title,npc:npc.title,zone:zonePage.title,relationKey};
                if(this.completed.has(relationKey)){results.push({...context,status:'unchanged'});continue;}
                await this.client.load();
                const prior=[...this.client.plans.values()].find(plan=>plan.automaticSource?.relationKey===relationKey);
                if(prior){if(prior.status==='submitted'){this.bounded(this.completed,relationKey);results.push({...context,status:'unchanged',plan:prior});continue;}throw Error('A previous source update needs review before retrying.');}
                const candidate={id:'loot-source-'+hash(record.id+'|'+relationKey).slice(0,48),kind:'item',name:item.title,title:item.title,intent:'update',membership:'present',reasons:['missing-source'],zone:zonePage.title,instance,era:'',fields:{},sources:[{npc:npc.title,zone:zonePage.title,instance,confirmed:true,sourceEvidence:relation.evidence}],relations:[]};
                const checkPlan=plan=>{
                    if(!sameUser(plan.expectedUser,account.user)||plan.blockers?.length||plan.attachment||!Array.isArray(plan.pages)||!plan.pages.length||plan.pages.length>3||plan.pages.filter(page=>page.role==='primary'&&page.title===item.title).length!==1||new Set(plan.pages.map(page=>page.title)).size!==plan.pages.length)throw Error('The source update requires manual review.');
                    for(const page of plan.pages){
                        if(page.operation!=='replace-reviewed')throw Error('Automatic source observations cannot create or replace unrelated pages.');
                        const base={itemTitle:item.title,npcTitle:npc.title,zoneTitle:zonePage.title,instance,lootKind:plan.lootClassifications?.[item.title]?.kind,preserveExisting:true};let expected;
                        if(page.title===item.title&&page.role==='primary')expected=patchContributionRelationship(page.beforeText,{...base,role:'item-source'}).text;
                        else if(!npc.missing&&page.title===npc.title&&page.role==='npc-loot')expected=patchContributionRelationship(page.beforeText,{...base,role:'npc-loot'}).text;
                        else if(page.title===zonePage.title&&['zone-population','zone-loot'].includes(page.role)){expected=patchContributionRelationship(page.beforeText,{...base,role:'zone-population'}).text;expected=patchContributionRelationship(expected,{...base,role:'zone-loot'}).text;}
                        else throw Error('An unrelated page change was excluded from automatic publication.');
                        if(normalizeWikiSubmissionText(expected)!==page.afterText)throw Error('This plan contains changes beyond appending the observed source.');
                    }
                };
                let plan=await this.client.preparePlan({candidate,relatedPages:[],matchesReviewed:true});current();checkPlan(plan);
                const stored=this.client.plans.get(plan.id);if(!stored)throw Error('The prepared source update was not saved.');
                stored.automaticSource={relationKey,observationId:record.id,itemTitle:item.title,npcTitle:npc.title,zoneTitle:zonePage.title,instance,evidence:relation.evidence,account:{...account.user}};stored.reviewDigest=this.client.digest(stored);await this.client.persist();plan={...plan,reviewDigest:stored.reviewDigest};
                const beforeWrite=async()=>{current();checkPlan(stored);await this.client.expectedUser(account.user);current();};
                const result=await this.client.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest},{beforeWrite});
                if(result.status!=='submitted')throw Object.assign(Error('The wiki did not confirm every source link. Review the saved result in Contribute.'),{plan:result});
                this.bounded(this.completed,relationKey);results.push(this.notify(this.onResult,{...context,status:'submitted',plan:result,pageUrl:this.client.origin+'/'+encodeURIComponent(item.title.replace(/ /g,'_'))}));
            }catch(error){results.push(this.notify(this.onDeferred,{...context,status:'deferred',reason:errorText(error),...(error.plan?{plan:error.plan}:{})}));}
        }
        return{accepted:Boolean(results.length),results};
    }
}
module.exports={AutomaticLootSources};
