import {createWikiResolver,normalizeWikiIdentity,wikiPageTitleKey} from './wiki-identity.js';
import {classifyNpcEvidence} from './generated-pets.js';

// Main-renderer session state only. No wiki/catalog mutations or persistence.
export const CRAWL_MAX_DEFEATED=2048;
const clean=value=>typeof value==='string'?value.trim().slice(0,230):'';
const variant=value=>value?.instance==='raid'||value?.instanceType==='raid'||value?.raidInstance===true?'raid':value?.instance==='normal'||value?.instanceType==='normal'||value?.raidInstance===false?'normal':'unknown';
export function createCrawlMode({getPack=()=>({}),now=Date.now,maxDefeated=CRAWL_MAX_DEFEATED}={}){
    let enabled=false,revision=0,scope='',resolverPack=null,resolver=null;
    const defeated=new Set(),limit=Math.max(1,Math.min(CRAWL_MAX_DEFEATED,Math.floor(Number(maxDefeated)||CRAWL_MAX_DEFEATED)));
    const lookup=()=>{const pack=getPack()||{};if(pack!==resolverPack){resolverPack=pack;resolver=createWikiResolver(pack);}return resolver;};
    const identity=(kind,name)=>{const found=lookup().resolve(kind,clean(name));return found.membership==='ambiguous'?null:wikiPageTitleKey(found.canonicalTitle||clean(name));};
    function npcKey(npc){
        const zone=identity('zone',npc?.zone),name=identity('npc',npc?.wikiTitle||npc?.name),instance=variant(npc);
        return zone&&name&&instance!=='unknown'?JSON.stringify([zone,instance,name]):null;
    }
    function reset(){if(defeated.size){defeated.clear();revision++;}}
    function context(value={}){
        const next=JSON.stringify([identity('zone',value.zone)||'',typeof value.source==='string'?value.source.slice(0,2048):'',normalizeWikiIdentity(value.character),value.profile??'',value.session??'',value.visit??'',clean(value.instanceId)]);
        if(next!==scope){scope=next;reset();}return next;
    }
    function setEnabled(value){
        if(typeof value!=='boolean')throw Error('Choose whether Crawl mode is enabled.');
        if(value!==enabled){enabled=value;defeated.clear();revision++;}return snapshot();
    }
    function snapshot(){return {enabled,revision,defeatedCount:defeated.size};}
    function isDefeated(npc){const key=npcKey(npc);return enabled&&key!==null&&defeated.has(key);}
    function consume(event,value={},candidates=[]){
        context(value);
        if(event?.type==='zone'){reset();return null;}
        if(!enabled||value.live!==true||event?.type!=='kill')return null;
        const at=Number.isFinite(value.at)?value.at:event.at;
        if(!Number.isFinite(at)||now()-at>10000||at-now()>2000)return null;
        const victim=clean(event.victim),players=new Set(['you','yourself',value.character,...(value.playerNames||[]).slice(0,200)].map(normalizeWikiIdentity));
        if(!victim||event.isPlayer===true||event.victimIsPlayer===true||event.targetType==='player'||event.isPet===true||players.has(normalizeWikiIdentity(victim)))return null;
        const found=lookup().resolve('npc',victim);
        if(found.membership==='ambiguous'||!classifyNpcEvidence(victim,found).eligible)return null;
        const zone=identity('zone',value.zone),victimKey=identity('npc',victim),instance=variant(event)!=='unknown'?variant(event):variant(value),matches=new Map();
        if(!zone||!victimKey)return null;
        for(const npc of candidates.slice(0,10000)){
            if(!npc||identity('zone',npc.zone)!==zone||!(Array.isArray(npc.loc)&&npc.loc.length>=2&&npc.loc.slice(0,2).every(Number.isFinite)||Number(npc.dropCount)>0))continue;
            if(instance!=='unknown'&&variant(npc)!==instance)continue;
            const aliases=[npc.name,npc.wikiTitle,...(Array.isArray(npc.aliases)?npc.aliases.slice(0,32):[])].filter(Boolean);
            if(!aliases.some(name=>identity('npc',name)===victimKey||normalizeWikiIdentity(name)===normalizeWikiIdentity(victim)))continue;
            const key=npcKey(npc);if(key)matches.set(key,npc);
        }
        // Logs normally omit Normal/Raid. Never guess between same-name
        // variants or mark both; a unique current-zone identity is sufficient.
        if(matches.size!==1)return null;
        const [key,npc]=matches.entries().next().value;
        if(!defeated.has(key)){if(defeated.size>=limit)return null;defeated.add(key);revision++;}
        return {key,npc};
    }
    return {context,reset,setEnabled,snapshot,isDefeated,consume};
}
