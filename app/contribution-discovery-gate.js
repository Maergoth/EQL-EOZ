import {normalizeWikiIdentity} from './wiki-identity.js';

const gapReasons=new Set(['missing-page','missing-population','missing-source','tier0-verification']);
const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,240);
const relationKeys=['type','name','npc','item','zone','instance','evidence'];
const relation=value=>Object.fromEntries(relationKeys.filter(key=>typeof value?.[key]==='string').map(key=>[key,clean(value[key])]));
const relationKey=value=>JSON.stringify(relationKeys.map(key=>normalizeWikiIdentity(value?.[key]||'')));
export const contributionReviewPreserved=candidate=>candidate?.manual===true||Boolean(candidate?.planId&&['partial','submitted'].includes(candidate.status));

// A stored cache miss is a request to check, never proof for a visible task.
// Keep these receipts in memory: reopening the app must obtain fresh proof.
export function createContributionDiscoveryGate({verify=null,getPack=()=>({}),now=Date.now,onChange=()=>{},freshnessMs=60000}={}){
    let generation=0,disposed=false,packKey=null,timer=null;
    const receipts=new Map(),pending=new Map();
    function current(){const pack=getPack(),next=[pack,pack.items,pack.npcs,pack.zones,pack.wikiEntities,pack.meta?.version,pack.meta?.manifestVersion,pack.meta?.wikiEntitiesComplete];if(!packKey||next.some((value,index)=>value!==packKey[index])){packKey=next;clear();}return generation;}
    function projection(candidate){
        const reasons=[...new Set((candidate.reasons||[]).filter(reason=>gapReasons.has(reason)))];
        if(!reasons.length&&candidate.reasons?.includes('catalog-unknown'))reasons.push('missing-page');
        return {id:clean(candidate.id),kind:clean(candidate.kind),name:clean(candidate.title||candidate.name),zone:clean(candidate.zone),instance:clean(candidate.instance||'unknown'),reasons,relations:(candidate.relations||[]).slice(-20).map(relation)};
    }
    const key=value=>JSON.stringify(value);
    function schedule(){
        clearTimeout(timer);timer=null;
        const expires=[...receipts.values()].filter(value=>value.result.state==='missing').map(value=>value.expiresAt).filter(value=>value>now());
        if(expires.length){timer=setTimeout(()=>{timer=null;if(!disposed)onChange();},Math.max(1,Math.min(...expires)-now()+1));timer?.unref?.();}
    }
    function receipt(candidate){
        current();const request=projection(candidate),id=key(request),found=receipts.get(id);
        return {request,id,found:found&&found.expiresAt>now()?found:null};
    }
    function check(candidate){
        if(disposed||contributionReviewPreserved(candidate))return Promise.resolve(null);
        const {request,id,found}=receipt(candidate),epoch=generation;
        if(!request.reasons.length||typeof verify!=='function')return Promise.resolve(null);
        if(found)return Promise.resolve(found.result);
        if(pending.has(id))return pending.get(id);
        if(pending.size>=20)return Promise.resolve(null);
        const task=Promise.resolve().then(()=>disposed||epoch!==current()?null:verify(request)).catch(()=>null).then(result=>{
            if(disposed||epoch!==current()||pending.get(id)!==task)return null;
            pending.delete(id);
            const checkedAt=typeof result?.checkedAt==='number'?result.checkedAt:Date.parse(result?.checkedAt||'');
            const valid=result&&['missing','covered','unknown'].includes(result.state)&&Number.isFinite(checkedAt)&&checkedAt<=now()+2000&&now()-checkedAt<freshnessMs;
            const safe=valid?{...result,reasons:[...new Set((Array.isArray(result.reasons)?result.reasons:[]).filter(reason=>request.reasons.includes(reason)&&gapReasons.has(reason)))],confirmedRelations:(Array.isArray(result.confirmedRelations)?result.confirmedRelations:[]).map(relation).filter(value=>request.relations.some(input=>relationKey(input)===relationKey(value)))}:{state:'unknown',reasons:[],confirmedRelations:[],checkedAt:now()};
            if(safe.state==='missing'&&!safe.reasons.length)safe.state='unknown';
            const lifetime=safe.state==='missing'?Math.min(freshnessMs,freshnessMs-(now()-checkedAt)):safe.state==='covered'?300000:15000;
            const saved={result:safe,expiresAt:now()+Math.max(1,lifetime)};
            receipts.set(id,saved);
            // A validated redirect can supply the editor's canonical title;
            // saving that spelling does not invalidate the same checked fact.
            if(safe.state==='missing'&&clean(safe.canonicalTitle))receipts.set(key({...request,name:clean(safe.canonicalTitle)}),saved);
            while(receipts.size>400)receipts.delete(receipts.keys().next().value);
            schedule();onChange();return safe;
        });
        pending.set(id,task);return task;
    }
    function project(candidate,{request=true}={}){
        if(!candidate||disposed)return null;
        if(contributionReviewPreserved(candidate))return candidate;
        const {found}=receipt(candidate);
        if(!found){if(request)void check(candidate);return null;}
        const result=found.result;if(result.state!=='missing')return null;
        const confirmed=new Set(result.confirmedRelations.map(relationKey));
        const primary=new Set([candidate.name,candidate.title,result.canonicalTitle].filter(Boolean).map(normalizeWikiIdentity));
        const relations=(candidate.relations||[]).filter(value=>confirmed.has(relationKey(value))&&(candidate.kind==='item'?value.type==='drop-source'&&primary.has(normalizeWikiIdentity(value.item||candidate.name)):candidate.kind==='npc'?primary.has(normalizeWikiIdentity(value.npc||value.name)):primary.has(normalizeWikiIdentity(value.zone))));
        const reasons=result.reasons.filter(reason=>reason==='missing-source'?relations.some(value=>value.type==='drop-source'):reason==='missing-population'?relations.some(value=>['mob-zone','zone-population'].includes(value.type)):true);
        if(!reasons.length)return null;
        const matches=(source,value)=>normalizeWikiIdentity(source.npc||source.name)===normalizeWikiIdentity(value.name||value.npc)&&normalizeWikiIdentity(source.zone)===normalizeWikiIdentity(value.zone)&&(source.instance||'unknown')===(value.instance||'unknown');
        const sources=(candidate.sources||[]).filter(source=>relations.some(value=>value.type==='drop-source'&&matches(source,value)));
        const fields={...candidate.fields};
        for(const field of ['knownLoot','knownNPCs'])if(Array.isArray(fields[field]?.value)){
            const allowed=relations.filter(value=>field==='knownLoot'?value.type==='drop-source':['mob-zone','zone-population'].includes(value.type)).map(value=>normalizeWikiIdentity(field==='knownLoot'?value.item:value.name||value.npc));
            fields[field]={...fields[field],value:fields[field].value.filter(value=>allowed.includes(normalizeWikiIdentity(value)))};
        }
        const missingPage=reasons.includes('missing-page');
        return {...candidate,title:clean(result.canonicalTitle)||candidate.title,membership:missingPage?'missing':'present',intent:missingPage?'create':'update',reasons,relations,sources,fields};
    }
    function clear(){generation++;receipts.clear();pending.clear();clearTimeout(timer);timer=null;}
    return {project,check,state(candidate){const {id,found}=receipt(candidate);return found?.result.state||(pending.has(id)?'checking':'unverified');},signature(candidate){current();return generation+':'+key(projection(candidate));},clear,dispose(){disposed=true;clear();}};
}
