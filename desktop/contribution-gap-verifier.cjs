'use strict';

// Read-only admission for automatic discovery UI. This service has no account,
// publication, journal or application-window dependency.
const API='https://eqlwiki.com/api.php';
const MAX_BODY=2*1024*1024,MAX_SOURCE=512*1024,MAX_FACTS=20,MAX_PAGES=20;
const modules=Promise.all([import('../app/wiki-identity.js'),import('../app/contribution-model.js'),import('../app/contribution-coverage.js'),import('../app/contribution-reasons.js')]);
const active=text=>String(text||'').replace(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*\/>|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*>[\s\S]*?(?:<\/\2\s*>|$)/gi,' ');
const protectedMarkup=text=>/<\/?(?:nowiki|pre|source|syntaxhighlight|ref|code)\b/i.test(String(text||''));
const ALLOWED_REASONS=new Set(['missing-page','catalog-unknown','missing-population','missing-source','tier0-verification']);
const unknown=(now=Date.now())=>({state:'unknown',reasons:[],confirmedRelations:[],unknownReasons:[],canonicalTitle:null,checkedAt:new Date(now).toISOString()});
const clone=value=>JSON.parse(JSON.stringify(value));

function projection(input,model,identity){
    if(!input||!['npc','item','zone'].includes(input.kind)||!Array.isArray(input.reasons)||input.reasons.length>10||!Array.isArray(input.relations||[])||(input.relations||[]).length>100)return null;
    try{
        const p={kind:input.kind,name:model.contributionTitle(input.kind==='item'?identity.itemExaltationBaseIdentity(input.name):input.name),zone:input.zone?model.contributionTitle(input.zone):'',instance:['normal','raid'].includes(input.instance)?input.instance:'unknown',reasons:[...new Set(input.reasons.filter(r=>ALLOWED_REASONS.has(r)))],relations:[]};
        if(!p.reasons.length)return null;
        for(const value of (input.relations||[]).slice(0,MAX_FACTS)){
            if(!value||!['drop-source','mob-zone','zone-population'].includes(value.type))continue;
            const r={type:value.type};
            for(const key of ['name','npc','item','zone'])if(typeof value[key]==='string'&&value[key])r[key]=model.contributionTitle(value[key]);
            r.instance=['normal','raid'].includes(value.instance)?value.instance:p.instance;
            r.evidence=typeof value.evidence==='string'?value.evidence.slice(0,40):'';
            p.relations.push(r);
        }
        p.overflow=(input.relations||[]).length>MAX_FACTS;
        return p;
    }catch{return null;}
}

class ContributionGapVerifier{
    constructor({getPack=async()=>({}),liveCache=null,fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=8000,jobTimeoutMs=15000}={}){
        this.getPack=getPack;this.liveCache=liveCache;this.fetch=fetchImpl;this.now=now;
        this.timeoutMs=Math.max(1,Math.min(8000,Number(timeoutMs)||8000));this.jobTimeoutMs=Math.max(1,Math.min(15000,Number(jobTimeoutMs)||15000));
        this.cache=new Map();this.pending=new Map();this.queue=[];this.controllers=new Set();this.active=0;this.generation=0;this.disposed=false;this.packSignature=null;
    }
    async check(input){
        let generation=this.generation;
        if(this.disposed)return unknown(this.now());
        const [identity,model]=await modules,p=projection(input,model,identity);
        if(!p||generation!==this.generation||this.disposed)return unknown(this.now());
        let pack;try{pack=await this.getPack();}catch{return unknown(this.now());}
        if(generation!==this.generation||this.disposed)return unknown(this.now());
        pack=pack&&typeof pack==='object'?pack:{};
        const signature=[pack.items,pack.npcs,pack.zones,pack.wikiEntities,pack.wikiRelationshipCoverage,pack.lootSets,pack.meta?.version,pack.meta?.manifestVersion,pack.meta?.generatedAt,pack.meta?.wikiRelationshipCoverageVersion];
        if(this.packSignature&&signature.some((value,index)=>value!==this.packSignature[index])){this.clear();generation=this.generation;}
        this.packSignature=signature;
        const key=JSON.stringify([pack.meta?.version||'',pack.meta?.manifestVersion||'',pack.meta?.wikiRelationshipCoverageVersion||0,p]);
        const cached=this.cache.get(key);if(cached&&cached.until>this.now()&&(cached.value.state!=='missing'||Date.parse(cached.value.checkedAt)<=this.now()+2000))return clone(cached.value);this.cache.delete(key);
        if(this.pending.has(key))return this.pending.get(key).promise;
        if(this.pending.size>=20)return unknown(this.now());
        let resolve;const promise=new Promise(done=>{resolve=done;});
        const task={p,pack,key,generation,promise,resolve};this.pending.set(key,task);this.queue.push(task);this.drain();return promise;
    }
    drain(){
        while(!this.disposed&&this.active<2&&this.queue.length){
            const task=this.queue.shift();this.active++;
            this.verify(task).catch(()=>unknown(this.now())).then(value=>{
                if(this.disposed||task.generation!==this.generation){task.resolve(unknown(this.now()));return;}
                const ttl=value.state==='missing'?60000:value.state==='covered'?300000:15000;
                const until=value.state==='missing'?Math.min(this.now()+ttl,Date.parse(value.checkedAt)+ttl):this.now()+ttl;
                this.cache.set(task.key,{value,until});while(this.cache.size>1000)this.cache.delete(this.cache.keys().next().value);
                task.resolve(clone(value));
            }).finally(()=>{if(this.pending.get(task.key)===task)this.pending.delete(task.key);this.active--;this.drain();});
        }
    }
    async verify(task,fresh=false){
        const [identity,model,coverage,reasonsModule]=await modules,{p,pack,generation}=task,resolver=identity.createWikiResolver(pack);
        const result={...unknown(this.now()),canonicalTitle:p.name,proofs:[]},missing=new Set(),uncertain=new Set(),confirmed=[];
        const facts=p.relations,local=resolver.resolve(p.kind,p.name),deadline=task.deadline??(task.deadline=this.now()+this.jobTimeoutMs),pages=new Map();
        const same=(a,b)=>identity.wikiPageTitleKey(a)===identity.wikiPageTitleKey(b);
        const read=async name=>{
            let title;try{title=model.contributionTitle(name);}catch{return null;}
            if(this.disposed||generation!==this.generation||this.now()>=deadline)return null;
            if(pages.has(title))return pages.get(title);
            if(pages.size>=MAX_PAGES)return null;
            const promise=this.page(title,identity,Math.max(1,Math.min(this.timeoutMs,deadline-this.now())),pack,fresh).then(page=>{
                if(page&&!page.missing&&Number.isSafeInteger(page.revision)&&page.fetchedAt)result.proofs.push({title:page.title,revision:page.revision,source:page.source,fetchedAt:page.fetchedAt});return page;
            });pages.set(title,promise);return promise;
        };
        const factNpc=r=>r.npc||r.name||(p.kind==='npc'?p.name:'');
        const factZone=r=>r.zone||p.zone||(p.kind==='zone'?p.name:'');
        const factItem=r=>r.item||(p.kind==='item'?p.name:'');
        const belongs=(kind,name)=>{const a=resolver.resolve(kind,name),b=resolver.resolve(kind,p.name);return a.membership!=='ambiguous'&&b.membership!=='ambiguous'&&same(a.canonicalTitle||name,b.canonicalTitle||p.name);};
        const sourceFact=r=>r.type==='drop-source'&&r.evidence==='explicit-corpse'&&factNpc(r)&&factZone(r)&&factItem(r)&&['normal','raid'].includes(r.instance)&&belongs(p.kind,p.kind==='npc'?factNpc(r):p.kind==='item'?factItem(r):factZone(r));
        const populationFact=r=>['mob-zone','zone-population'].includes(r.type)&&['kill','consider','explicit-corpse'].includes(r.evidence)&&factNpc(r)&&factZone(r)&&['normal','raid'].includes(r.instance)&&['npc','zone'].includes(p.kind)&&belongs(p.kind,p.kind==='npc'?factNpc(r):factZone(r));
        const snapshotSources=facts.filter(sourceFact);
        const allSourcesCovered=snapshotSources.length>0&&!p.overflow&&snapshotSources.length===facts.filter(r=>r.type==='drop-source').length&&snapshotSources.every(r=>coverage.cachedContributionCoverage(pack,{item:factItem(r),npc:factNpc(r),zone:factZone(r),instance:r.instance},{resolver}).state==='covered');
        const snapshotPopulation=facts.filter(populationFact),allPopulationCovered=snapshotPopulation.length>0&&!p.overflow&&snapshotPopulation.length===facts.filter(r=>['mob-zone','zone-population'].includes(r.type)).length&&snapshotPopulation.every(r=>reasonsModule.contributionNpcZoneStatus(resolver,resolver.resolve('npc',factNpc(r)).records||[],factZone(r),r)==='recorded');
        const onlyPresence=p.reasons.every(r=>['missing-page','catalog-unknown'].includes(r));
        if(onlyPresence&&['present','ambiguous'].includes(local.membership))return {...result,state:'covered',canonicalTitle:local.canonicalTitle||p.name};
        if(p.reasons.every(r=>r==='missing-source')&&allSourcesCovered)return {...result,state:'covered',canonicalTitle:local.canonicalTitle||p.name};
        if(p.reasons.every(r=>r==='missing-population')&&allPopulationCovered)return {...result,state:'covered',canonicalTitle:local.canonicalTitle||p.name};
        const primary=await read(local.canonicalTitle||p.name);
        if(!primary)return {...result,unknownReasons:[...p.reasons]};
        result.canonicalTitle=primary.title;
        for(const reason of p.reasons.filter(r=>['missing-page','catalog-unknown'].includes(r)))if(primary.missing)missing.add('missing-page');
        // If the primary article is absent, an independently observed NPC/zone
        // fact can remain attached to that new-article discovery. No source
        // relationship is inferred from the missing article.
        if(primary.missing&&p.kind==='npc')for(const r of facts.filter(populationFact))if(same(factNpc(r),p.name))confirmed.push(r);
        if(p.reasons.includes('tier0-verification')){
            if(primary.missing||!primary.content)uncertain.add('tier0-verification');
            else try{
                const selected=model.contributionScopedTemplateInfo(primary.content,'Itempage',p.instance==='raid'?'raid':'normal');
                const notes=selected.template.fields.filter(f=>f.name==='notes');
                if(notes.length>1)uncertain.add('tier0-verification');
                else if(reasonsModule.hasInferredBase({notes:active(notes[0]?.value||'')}))missing.add('tier0-verification');
            }catch{uncertain.add('tier0-verification');}
        }
        if(p.reasons.includes('missing-population')){
            const candidates=facts.filter(populationFact);if(!candidates.length||p.overflow)uncertain.add('missing-population');
            for(const r of candidates){
                const npc=p.kind==='npc'&&same(factNpc(r),p.name)?primary:await read(factNpc(r));
                const zone=p.kind==='zone'&&same(factZone(r),p.name)?primary:await read(factZone(r));
                const state=await this.population(npc,zone,r.instance,{identity,model,read,resolver});
                if(state==='missing'){missing.add('missing-population');confirmed.push(r);}else if(state==='unknown')uncertain.add('missing-population');
            }
        }
        if(p.reasons.includes('missing-source')){
            const candidates=facts.filter(sourceFact);if(!candidates.length||p.overflow)uncertain.add('missing-source');
            for(const r of candidates){
                const relation={item:factItem(r),npc:factNpc(r),zone:factZone(r),instance:r.instance};
                if(coverage.cachedContributionCoverage(pack,relation,{resolver}).state==='covered')continue;
                const itemPage=p.kind==='item'&&same(relation.item,p.name)?primary:await read(relation.item),npcPage=p.kind==='npc'&&same(relation.npc,p.name)?primary:await read(relation.npc);
                if(!itemPage||!npcPage||itemPage.missing||npcPage.missing||!itemPage.content||!npcPage.content){uncertain.add('missing-source');continue;}
                const liveRelation={...relation,item:itemPage.title,npc:npcPage.title};
                const live=coverage.liveContributionCoverage(pack,liveRelation,{itemPage,npcPage,resolver});
                if(live.state==='covered')continue;
                if(live.state!=='uncovered'){uncertain.add('missing-source');continue;}
                // Absence cannot borrow a stale finite-set snapshot. Prove
                // every selected reference is currently a direct Itempage;
                // collections/unknown expansions stay hidden for review.
                let safe=true;
                try{
                    const selected=model.contributionScopedTemplateInfo(npcPage.content,'Namedmobpage',r.instance);
                    const fields=selected.template.fields.filter(f=>['known_loot','common_loot'].includes(f.name.toLowerCase()));
                    const itemFields=model.contributionScopedTemplateInfo(itemPage.content,'Itempage',r.instance).template.fields.filter(f=>['dropsfrom','drops_from'].includes(f.name.toLowerCase()));
                    if([...fields,...itemFields].some(f=>protectedMarkup(f.value)))safe=false;
                    const refs=[...new Set(fields.flatMap(f=>model.contributionLootReferences(model.contributionLootScopeText(f.value,r.instance,selected.scope||'normal'))))];
                    if(refs.length>MAX_FACTS)safe=false;
                    for(const ref of refs){
                        const page=await read(ref);
                        if(!page||page.missing||!page.content||model.contributionTemplates(page.content,'Itempage').length!==1){safe=false;break;}
                    }
                }catch{safe=false;}
                if(safe){missing.add('missing-source');confirmed.push(r);}else uncertain.add('missing-source');
            }
        }
        if(this.disposed||generation!==this.generation)return unknown(this.now());
        result.state=missing.size?'missing':uncertain.size?'unknown':'covered';result.reasons=[...missing];result.unknownReasons=[...uncertain];
        result.confirmedRelations=[...new Map(confirmed.map(r=>[JSON.stringify(r),r])).values()].slice(0,MAX_FACTS);
        if(missing.size){
            // Retained source can prove a positive fact, but yesterday's empty
            // field cannot be relabelled as a fresh live absence. Recheck all
            // affected source pages within the original job deadline.
            const oldest=Math.min(this.now(),...result.proofs.map(proof=>Date.parse(proof.fetchedAt)));
            if(this.now()-oldest>=60000||result.proofs.some(proof=>Date.parse(proof.fetchedAt)>this.now()+2000))return fresh?{...unknown(this.now()),unknownReasons:[...p.reasons]}:this.verify(task,true);
            result.checkedAt=new Date(oldest).toISOString();
        }
        return result;
    }
    async population(npc,zone,instance,{identity,model,read,resolver}){
        if(!npc||!zone||zone.missing||!zone.title)return 'unknown';
        if(!zone.categories.includes('Zones')&&!resolver.resolve('zone',zone.title).records?.length)return 'unknown';
        if(npc.missing)return 'missing';
        if(!npc.content)return 'unknown';
        const same=(a,b)=>identity.wikiPageTitleKey(a)===identity.wikiPageTitleKey(b);
        try{
            const selected=model.contributionScopedTemplateInfo(npc.content,'Namedmobpage',instance);
            if(instance==='raid'&&selected.scope!=='raid')return 'unknown';
            if(instance==='normal'&&npc.categories.some(name=>same(name,zone.title)||resolver.resolve('zone',name).canonicalTitle===zone.title))return 'covered';
            const fields=selected.template.fields.filter(f=>f.name.toLowerCase()==='zone');if(fields.length!==1)return 'unknown';
            if(protectedMarkup(fields[0].value))return 'unknown';
            const field=active(fields[0].value).trim();
            if(/^\s*(?:\[\[\s*)?Various(?:\s*\]\])?\s*$/i.test(field))return 'covered';
            if(/^\s*(?:[?]|None)?\s*$/i.test(field))return 'missing';
            const links=[...field.matchAll(/\[\[\s*([^|\]#]+)(?:\|[^\]]*)?\]\]/g)].map(m=>m[1].trim());
            const residual=field.replace(/\[\[[^\]\n]+\]\]/g,'').replace(/<br\s*\/?>|[,;*\s]/gi,'');
            if(residual||!links.length||links.length>MAX_FACTS)return 'unknown';
            for(const link of links){
                if(same(link,zone.title))return 'covered';const page=await read(link);if(!page||page.missing)return 'unknown';if(same(page.title,zone.title))return 'covered';
                if(/\bVarious\b/i.test(page.title)||!page.categories.includes('Zones')&&!resolver.resolve('zone',page.title).records?.length)return 'unknown';
            }
            return 'missing';
        }catch{return 'unknown';}
    }
    async page(title,identity,timeoutMs,pack={},fresh=false){
        const generation=this.generation;
        if(this.liveCache)try{
            const cached=await this.liveCache.read(title,pack);
            if(this.disposed||generation!==this.generation)return null;
            const age=cached?this.now()-Date.parse(cached.fetchedAt):Infinity;
            if(cached&&age>=-2000&&(!fresh||age<60000))return {...cached,missing:false,redirected:identity.wikiPageTitleKey(cached.title)!==identity.wikiPageTitleKey(title),source:'live-cache'};
        }catch{}
        if(typeof this.fetch!=='function')return null;
        const controller=new AbortController();this.controllers.add(controller);let timer;
        const request=(async()=>{
            const [,model]=await modules;
            const url=new URL(API);for(const[k,v]of Object.entries({action:'query',prop:'revisions|categories',rvprop:'ids|content',rvslots:'main',cllimit:'500',titles:title,redirects:'1',converttitles:'1',format:'json',formatversion:'2'}))url.searchParams.set(k,v);
            const response=await this.fetch(url.href,{method:'GET',credentials:'omit',useSessionCookies:false,redirect:'error',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
            if(!response?.ok||Number(response.headers?.get?.('content-length'))>MAX_BODY)return null;
            let text;
            if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>MAX_BODY){controller.abort();void reader.cancel().catch(()=>{});return null;}chunks.push(Buffer.from(chunk.value));}text=Buffer.concat(chunks).toString('utf8');}
            else{text=await response.text();if(typeof text!=='string'||Buffer.byteLength(text)>MAX_BODY)return null;}
            const data=JSON.parse(text),pages=data?.query?.pages;if(data.error||data.warnings||data.continue||!Array.isArray(pages)||pages.length!==1)return null;
            let expected=identity.wikiPageTitleKey(title),redirected=false;const aliases=[];
            for(const field of ['normalized','converted','redirects']){
                const mappings=data.query[field]||[];if(!Array.isArray(mappings)||mappings.length>16)return null;
                for(const mapping of mappings){if(!mapping||typeof mapping.from!=='string'||typeof mapping.to!=='string'||mapping.from.length>230||mapping.to.length>230||identity.wikiPageTitleKey(mapping.from)!==expected)return null;try{model.contributionTitle(mapping.from);model.contributionTitle(mapping.to);}catch{return null;}aliases.push(mapping.from);expected=identity.wikiPageTitleKey(mapping.to);if(field==='redirects')redirected=true;}
            }
            const page=pages[0];if(!page||page.invalid||page.ns!==0||typeof page.title!=='string'||identity.wikiPageTitleKey(page.title)!==expected)return null;
            try{model.contributionTitle(page.title);}catch{return null;}
            if(page.missing===true&&!page.pageid)return {title:page.title,missing:!redirected,redirected,revision:null,content:null,categories:[]};
            if(!Number.isSafeInteger(page.pageid)||page.pageid<1||page.missing===true)return null;
            if(page.categories!==undefined&&(!Array.isArray(page.categories)||page.categories.length>500))return null;
            const categories=[];for(const category of page.categories||[]){if(typeof category?.title!=='string'||!category.title.startsWith('Category:')||category.title.length>250)return null;categories.push(category.title.slice(9));}
            const revision=page.revisions?.[0],slot=revision?.slots?.main;
            const content=Number.isSafeInteger(revision?.revid)&&revision.revid>0&&slot?.contentmodel==='wikitext'&&typeof slot.content==='string'&&Buffer.byteLength(slot.content)<=MAX_SOURCE?slot.content:null;
            const value={title:page.title,namespace:0,missing:false,redirected,revision:revision?.revid||null,content,categories:[...new Set(categories)],fetchedAt:new Date(this.now()).toISOString(),source:'public-wiki',origin:'https://eqlwiki.com'};
            if(content!==null&&this.liveCache&&!this.disposed&&generation===this.generation&&!controller.signal.aborted)try{await this.liveCache.put({title:value.title,namespace:0,revision:value.revision,content:value.content,categories:value.categories,fetchedAt:value.fetchedAt,source:value.source,origin:value.origin},{aliases:[...new Set(aliases)].slice(0,32)});}catch{}
            return {...value,source:'live-wiki'};
        })();
        try{return await Promise.race([request,new Promise(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},timeoutMs);})]);}catch{return null;}finally{clearTimeout(timer);this.controllers.delete(controller);}
    }
    clear(){this.generation++;this.cache.clear();for(const task of this.pending.values())task.resolve(unknown(this.now()));this.pending.clear();this.queue=[];for(const c of this.controllers)c.abort();}
    dispose(){this.disposed=true;this.clear();}
}
module.exports={ContributionGapVerifier};
