import { contributionNameKey, findPotentialMatches } from './contribution-model.js';

const KEY='eql-eye-of-zomm-contributions-v1';
const clean=(value,max=240)=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim().slice(0,max);
export function createContributionQueue({storage=globalThis.localStorage,getPack=()=>({}),onWarning=()=>{}}={}){
    let candidates=[],sequence=0,cursor=0,catalogCache=null;const ignored=new Set();
    const pack=()=>{try{return getPack()||{};}catch{return {};}};
    const fieldValue=value=>Array.isArray(value)?value.slice(0,200).map(item=>typeof item==='string'?clean(item,512):typeof item==='number'&&Number.isFinite(item)?item:typeof item==='boolean'?item:null).filter(item=>item!==null):typeof value==='string'?clean(value,16000):typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null?value:null;
    const validField=key=>/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)&&!['constructor','prototype','__proto__'].includes(key);
    try{const raw=storage?.getItem(KEY);if(raw&&raw.length<1800000){const saved=JSON.parse(raw);if(saved.schemaVersion===1){candidates=(Array.isArray(saved.candidates)?saved.candidates:[]).filter(c=>c&&['item','npc','zone'].includes(c.kind)&&typeof c.id==='string'&&typeof c.name==='string').slice(-200).map(candidate=>({...candidate,key:candidate.key||`${candidate.kind}|${contributionNameKey(candidate.name)}|${contributionNameKey(candidate.zone)}`,fields:candidate.fields&&typeof candidate.fields==='object'?candidate.fields:{},sources:Array.isArray(candidate.sources)?candidate.sources:[],evidence:Array.isArray(candidate.evidence)?candidate.evidence:[]}));sequence=Number(saved.sequence)||0;cursor=Number(saved.cursor)||0;for(const key of (Array.isArray(saved.ignored)?saved.ignored:[]).slice(-2000))if(typeof key==='string'&&key.length<800)ignored.add(key);}}}catch{onWarning('The saved contribution queue could not be read.');}
    function save(){while(JSON.stringify(candidates).length>1500000&&candidates.length>1)candidates.shift();try{storage?.setItem(KEY,JSON.stringify({schemaVersion:1,sequence,cursor,candidates,ignored:[...ignored].slice(-2000)}));}catch{onWarning('Contributions remain in memory because local storage could not save them.');}}
    function membership(kind,name){const current=pack(),entities=current.wikiEntities||{};
        const version=current.meta?.manifestVersion||current.meta?.version||'';
        if(catalogCache?.pack!==current||catalogCache.entities!==entities||catalogCache.version!==version)catalogCache={pack:current,entities,version,types:new Map()};
        if(!catalogCache.types.has(kind)){
            const list=kind==='item'?current.items:kind==='npc'?current.npcs:current.zones,typed=kind==='item'?entities.items:kind==='npc'?entities.npcs:[];
            const records=[...(Array.isArray(entities.titles)?entities.titles:[]),...(Array.isArray(typed)?typed:[]),...(Array.isArray(list)?list:[])];
            catalogCache.types.set(kind,new Set(records.flatMap(record=>typeof record==='string'?[record]:[record?.name,record?.title,record?.wikiTitle,...(Array.isArray(record?.aliases)?record.aliases:[])]).filter(Boolean).map(contributionNameKey)));
        }
        const keys=catalogCache.types.get(kind);
        const baseName=kind==='item'?String(name).replace(/\s*\+\d+(?:\s*\([^)]*\))?\s*$/,'').trim():name;
        const present=keys.has(contributionNameKey(name))||baseName!==name&&keys.has(contributionNameKey(baseName));
        const complete=current.meta?.wikiEntitiesComplete===true&&current.meta?.sample!==true&&['items','npcs','titles'].every(key=>Array.isArray(entities[key]));
        return present?'present':complete?'missing':'unknown';}
    function add({kind,name,zone='',fields={},evidence=null,relations=[]},force=false){
        name=clean(name);if(!['item','npc','zone'].includes(kind)||!name)return null;
        const key=`${kind}|${contributionNameKey(name)}|${contributionNameKey(zone)}`;
        const present=membership(kind,name);
        if(ignored.has(key)&&!force)return null;if(force)ignored.delete(key);
        let candidate=candidates.find(c=>c.key===key||c.aliasKeys?.includes(key));
        if(present==='present'&&!force&&!candidate)return null;
        if(!candidate){candidate={id:`contribution-${++sequence}`,key,kind,name,title:name,zone:clean(zone),instance:'unknown',era:'',playerText:'',fields:{},sources:[],evidence:[],status:'needs-review',membership:present};candidates.push(candidate);}
        for(const [key,raw] of Object.entries(fields||{}).slice(0,80)){if(!validField(key))continue;let value=fieldValue(raw);
            if(candidate.fields[key]?.edited===true)continue;
            if(key==='knownLoot'&&Array.isArray(value)){const previous=Array.isArray(candidate.fields[key]?.value)?candidate.fields[key].value:[],combined=[...new Map([...previous,...value].map(item=>[contributionNameKey(item),item])).values()].slice(0,100);if(JSON.stringify(combined)!==JSON.stringify(previous))candidate.fields[key]={...candidate.fields[key],value:combined,confirmed:false};}
            else if(!candidate.fields[key]?.confirmed)candidate.fields[key]={...candidate.fields[key],value,confirmed:false};}
        if(evidence&&!candidate.evidence.some(e=>e.id===evidence.id)){const text=evidence.evidence?.text||(evidence.kind==='game-log'?`Observed ${clean(evidence.subject?.kind)}: ${clean(evidence.subject?.name)}${(Array.isArray(evidence.relations)?evidence.relations:[]).filter(relation=>relation.type==='drop-source').map(relation=>`\nReported source: ${clean(relation.name)} in ${clean(relation.zone)} (${clean(relation.evidence)})`).join('')}`:'');candidate.evidence.push({id:clean(evidence.id),at:clean(evidence.capturedAt),kind:clean(evidence.kind),text:clean(text,6000),confidence:Math.min(100,Number(evidence.confidence??evidence.fields?.[0]?.confidence)||0)});candidate.evidence=candidate.evidence.slice(-6);}
        for(const relation of (Array.isArray(relations)?relations:[]).filter(r=>r?.type==='drop-source'))if(!candidate.sources.some(s=>s.npc===relation.name&&s.zone===relation.zone))candidate.sources.push({npc:clean(relation.name),zone:clean(relation.zone),confirmed:false,sourceEvidence:clean(relation.evidence)});
        candidates=candidates.slice(-200);save();return structuredClone(candidate);
    }
    return{
        snapshot:()=>structuredClone(candidates),cursor:()=>cursor,
        add,
        consume(observation){
            cursor=Math.max(cursor,Number(observation?.sequence)||0);
            const kind=observation?.subject?.kind==='monster'?'npc':observation?.subject?.kind;
            if(observation?.owner==='character'||!['item','npc','zone'].includes(kind)){save();return null;}
            const fields=Object.fromEntries((observation.fields||[]).filter(f=>f.key!=='name').map(f=>[f.key,f.value]));
            const zone=observation.input?.zone||'',relations=observation.relations||[];
            const result=add({kind,name:observation.subject.name,zone,fields,evidence:observation,relations});
            let relatedCandidate=null;
            if(kind==='item')for(const relation of relations.filter(relation=>relation.type==='drop-source'&&relation.evidence==='explicit-corpse'&&relation.name&&relation.zone)){
                const proposal=add({kind:'npc',name:relation.name,zone:relation.zone,fields:{knownLoot:[observation.subject.name]},evidence:observation});
                if(proposal)relatedCandidate=proposal;
            }
            save();return result||relatedCandidate;
        },
        update(id,patch){const candidate=candidates.find(c=>c.id===id);if(!candidate)return null;const priorKey=candidate.key;for(const key of ['name','title','zone','instance','era','playerText','fields','sources','status','matchesReviewed','planId','baseRecovery'])if(Object.hasOwn(patch,key))candidate[key]=structuredClone(patch[key]);candidate.key=`${candidate.kind}|${contributionNameKey(candidate.name)}|${contributionNameKey(candidate.zone)}`;if(priorKey!==candidate.key)candidate.aliasKeys=[...new Set([...(candidate.aliasKeys||[]),priorKey])].slice(-8);save();return structuredClone(candidate);},
        remove(id){const candidate=candidates.find(c=>c.id===id);if(candidate)for(const key of [candidate.key,...(candidate.aliasKeys||[])])ignored.add(key);while(ignored.size>2000)ignored.delete(ignored.values().next().value);candidates=candidates.filter(c=>c.id!==id);save();},
        matches(candidate){const current=pack(),entries=candidate.kind==='item'?current.items:candidate.kind==='npc'?current.npcs:current.zones;return findPotentialMatches(candidate.title||candidate.name,entries||[]);}
    };
}
