import { contributionNameKey, findPotentialMatches } from './contribution-model.js';
import { CONTRIBUTION_QUEUE_KEY, CONTRIBUTION_QUEUE_BYTES, contributionSourceToken, logContributionObservation } from './contribution-evidence.js';

const KEY=CONTRIBUTION_QUEUE_KEY;
const clean=(value,max=240)=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim().slice(0,max);
const itemIdentity=name=>{const value=clean(name),match=value.match(/^(.+?)\s*\+(10|[0-9])$/);return match&&match[1].trim()?{name:match[1].trim(),tier:Number(match[2])}:{name:value,tier:null};};
const candidateKey=(kind,name,zone='')=>`${kind}|${contributionNameKey(kind==='item'?itemIdentity(name).name:name)}|${kind==='item'?'':contributionNameKey(zone)}`;
export function createContributionQueue({storage=globalThis.localStorage,getPack=()=>({}),onWarning=()=>{},now=Date.now}={}){
    let candidates=[],sequence=0,cursor=0,catalogCache=null,lastLog=null,armed=null,readBlocked=false;const ignored=new Set(),seenLogIds=new Set();
    const pack=()=>{try{return getPack()||{};}catch{return {};}};
    const fieldValue=value=>Array.isArray(value)?value.slice(0,200).map(item=>typeof item==='string'?clean(item,512):typeof item==='number'&&Number.isFinite(item)?item:typeof item==='boolean'?item:null).filter(item=>item!==null):typeof value==='string'?clean(value,16000):typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null?value:null;
    const validField=key=>/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)&&!['constructor','prototype','__proto__'].includes(key);
    try{const raw=storage?.getItem(KEY);if(raw){
        if(typeof raw!=='string'||new TextEncoder().encode(raw).length>CONTRIBUTION_QUEUE_BYTES)throw Error('Queue too large');
        const saved=JSON.parse(raw);if(saved.schemaVersion!==1||!Array.isArray(saved.candidates)||saved.candidates.length>200||saved.candidates.some(c=>!c||!['item','npc','zone'].includes(c.kind)||typeof c.id!=='string'||typeof c.name!=='string'))throw Error('Unsupported queue');
        candidates=saved.candidates.map(candidate=>{const key=candidateKey(candidate.kind,candidate.name,candidate.zone),aliases=[...(candidate.aliasKeys||[]),...(candidate.key&&candidate.key!==key?[candidate.key]:[])];return {...candidate,key,aliasKeys:[...new Set(aliases)].slice(-8),fields:candidate.fields&&typeof candidate.fields==='object'?candidate.fields:{},sources:Array.isArray(candidate.sources)?candidate.sources:[],relations:Array.isArray(candidate.relations)?candidate.relations.slice(-100):[],evidence:Array.isArray(candidate.evidence)?candidate.evidence:[]};});sequence=Number(saved.sequence)||0;cursor=Number(saved.cursor)||0;
        for(const key of (Array.isArray(saved.ignored)?saved.ignored:[]).slice(-2000))if(typeof key==='string'&&key.length<800)ignored.add(key);
        for(const id of (Array.isArray(saved.seenLogIds)?saved.seenLogIds:[]).slice(-2000))if(typeof id==='string'&&id.length<=240)seenLogIds.add(id);
    }}catch{readBlocked=true;onWarning('The saved contribution queue could not be read and was preserved. Recover it before saving new drafts.');}
    function save(){if(readBlocked)return false;try{const value=JSON.stringify({schemaVersion:1,sequence,cursor,candidates,ignored:[...ignored].slice(-2000),seenLogIds:[...seenLogIds].slice(-2000)});if(new TextEncoder().encode(value).length>CONTRIBUTION_QUEUE_BYTES)throw Error('Queue too large');storage?.setItem(KEY,value);return true;}catch{onWarning('Contributions remain in memory because their saved queue is full or unavailable. Review or remove drafts before closing Eye of Zomm.');return false;}}
    function rememberRelation(candidate,relation,observation){
        if(!relation||!['mob-zone','zone-population','zone-loot','drop-source','spawn-location'].includes(relation.type))return;
        const name=clean(relation.name),zone=clean(relation.zone);if(!name||!zone)return;
        const evidence=clean(relation.evidence,40),location=relation.type==='spawn-location'?relation.location:undefined;
        const item=relation.type==='drop-source'?itemIdentity(relation.item||observation?.subject?.kind==='item'&&observation.subject.name||'').name:'';
        const normalized={type:relation.type,name,zone,evidence,confirmed:false,...(item?{item}:{}),...(location?{location}: {})};
        const key=JSON.stringify([normalized.type,contributionNameKey(name),contributionNameKey(zone),evidence,item,location]);
        candidate.relations??=[];let existing=candidate.relations.find(value=>JSON.stringify([value.type,contributionNameKey(value.name),contributionNameKey(value.zone),value.evidence,value.item||'',value.location])===key);
        const id=clean(relation.eventId||observation?.id),at=clean(relation.at||observation?.capturedAt,50);
        if(!existing){if(candidate.relations.length>=100){const index=candidate.relations.findIndex(value=>value.confirmed!==true);if(index<0)return;candidate.relations.splice(index,1);}existing={...normalized,firstAt:at,lastAt:at,evidenceIds:[]};candidate.relations.push(existing);}
        if(at){if(!existing.firstAt||at<existing.firstAt)existing.firstAt=at;if(!existing.lastAt||at>existing.lastAt)existing.lastAt=at;}
        existing.evidenceIds=Array.isArray(existing.evidenceIds)?existing.evidenceIds:[];
        if(id&&!existing.evidenceIds.includes(id))existing.evidenceIds=[...existing.evidenceIds,id].slice(-8);
    }
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
        const observedName=name,identity=kind==='item'?itemIdentity(name):{name,tier:null};name=identity.name;
        if(identity.tier!==null){fields={...fields,...(!Object.hasOwn(fields,'tier')?{tier:identity.tier}:{})};if(!evidence)evidence={id:`item-name-${contributionSourceToken(observedName)}`,kind:'observed-name',capturedAt:new Date(now()).toISOString(),evidence:{text:`Observed item name: ${observedName}\nExact base identity: ${name}\nObserved tier decoration: +${identity.tier}`}};}
        const key=candidateKey(kind,name,zone),legacyKey=`${kind}|${contributionNameKey(observedName)}|${contributionNameKey(zone)}`;
        const present=membership(kind,name);
        const matchingIgnores=[...ignored].filter(value=>value===key||kind==='item'&&value.startsWith('item|')&&candidateKey('item',value.split('|')[1])===key);
        if(matchingIgnores.length&&!force)return null;if(force)for(const value of matchingIgnores)ignored.delete(value);
        let candidate=candidates.find(c=>c.key===key||c.aliasKeys?.includes(key));
        if(present==='present'&&!force&&!candidate)return null;
        if(!candidate){if(candidates.length>=200){onWarning('The contribution queue is full. Review or remove a draft to save another discovery.');return null;}candidate={id:`contribution-${++sequence}`,key,aliasKeys:[],kind,name,title:name,zone:clean(zone),instance:'unknown',era:'',playerText:'',fields:{},sources:[],relations:[],evidence:[],status:'needs-review',membership:present};candidates.push(candidate);}
        if(kind==='item'){if(!candidate.zone&&zone)candidate.zone=clean(zone);if(legacyKey!==key)candidate.aliasKeys=[...new Set([...(candidate.aliasKeys||[]),legacyKey])].slice(-8);}
        candidate.membership=present;
        for(const [key,raw] of Object.entries(fields||{}).slice(0,80)){if(!validField(key))continue;let value=fieldValue(raw);
            if(candidate.fields[key]?.edited===true)continue;
            if(['knownLoot','knownNPCs'].includes(key)&&Array.isArray(value)){const previous=Array.isArray(candidate.fields[key]?.value)?candidate.fields[key].value:[],combined=[...new Map([...previous,...value].map(item=>[contributionNameKey(item),item])).values()].slice(0,100);if(JSON.stringify(combined)!==JSON.stringify(previous))candidate.fields[key]={...candidate.fields[key],value:combined,confirmed:false};}
            else if(!candidate.fields[key]?.confirmed)candidate.fields[key]={...candidate.fields[key],value,confirmed:false};}
        if(evidence&&!candidate.evidence.some(e=>e.id===evidence.id)){const text=evidence.evidence?.text||(evidence.kind==='game-log'?`Observed ${clean(evidence.subject?.kind)}: ${clean(evidence.subject?.name)}${(Array.isArray(evidence.relations)?evidence.relations:[]).filter(relation=>relation.type==='drop-source').map(relation=>`\nReported source: ${clean(relation.name)} in ${clean(relation.zone)} (${clean(relation.evidence)})`).join('')}`:'');candidate.evidence.push({id:clean(evidence.id),at:clean(evidence.capturedAt),kind:clean(evidence.kind),text:clean(text,6000),confidence:Math.min(100,Number(evidence.confidence??evidence.fields?.[0]?.confidence)||0)});candidate.evidence=candidate.evidence.slice(-6);}
        for(const relation of (Array.isArray(relations)?relations:[]).filter(r=>r?.type==='drop-source'))if(!candidate.sources.some(s=>s.npc===relation.name&&s.zone===relation.zone&&s.sourceEvidence===relation.evidence))candidate.sources.push({npc:clean(relation.name),zone:clean(relation.zone),confirmed:false,sourceEvidence:clean(relation.evidence)});
        for(const relation of (Array.isArray(relations)?relations:[]).slice(0,100))rememberRelation(candidate,relation,evidence);
        save();return structuredClone(candidate);
    }
    function consume(observation){
        cursor=Math.max(cursor,Number(observation?.sequence)||0);
        const kind=observation?.subject?.kind==='monster'?'npc':observation?.subject?.kind;
        if(observation?.owner==='character'||!['item','npc','zone'].includes(kind)){save();return null;}
        const fields=Object.fromEntries((observation.fields||[]).filter(f=>f.key!=='name').map(f=>[f.key,f.value]));
        const itemName=kind==='item'?itemIdentity(observation.subject.name).name:null;
        const zone=observation.input?.zone||'',relations=[...(observation.relations||[])].map(relation=>relation.type==='zone-loot'?{...relation,name:itemIdentity(relation.name).name}:relation);
        // Older game-log journal records predate explicit relationship entries.
        // Replay the same observed associations, without promoting them to facts.
        if(observation.kind==='game-log'&&zone){
            if(kind==='npc'){for(const type of ['mob-zone','zone-population'])if(!relations.some(value=>value.type===type))relations.push({type,name:observation.subject.name,zone,evidence:observation.input?.event||'observed'});}
            if(kind==='item'&&!relations.some(value=>value.type==='zone-loot'))relations.push({type:'zone-loot',name:itemName,zone,evidence:'loot'});
        }
        const result=add({kind,name:observation.subject.name,zone,fields,evidence:observation,relations});
        let relatedCandidate=null;
        if(kind==='item')for(const relation of relations.filter(relation=>relation.type==='drop-source'&&relation.evidence==='explicit-corpse'&&relation.name&&relation.zone)){
            const npcRelations=[{type:'mob-zone',name:relation.name,zone:relation.zone,evidence:'explicit-corpse'},{type:'zone-population',name:relation.name,zone:relation.zone,evidence:'explicit-corpse'}];
            const proposal=add({kind:'npc',name:relation.name,zone:relation.zone,fields:{knownLoot:[itemName]},evidence:observation,relations:npcRelations});
            if(proposal)relatedCandidate=proposal;
        }
        if(zone){
            const population=relations.filter(value=>value.type==='zone-population').map(value=>value.name),loot=relations.filter(value=>value.type==='zone-loot').map(value=>value.name);
            const zoneFields={...(population.length?{knownNPCs:population}:{}),...(loot.length?{knownLoot:loot}:{})};
            if(kind!=='zone'&&(population.length||loot.length)){const proposal=add({kind:'zone',name:zone,zone,fields:zoneFields,evidence:observation,relations});if(proposal)relatedCandidate??=proposal;}
        }
        save();return result||relatedCandidate;
    }
    function consumeLog(event,context={}){
        const observation=logContributionObservation(event,context,{now:now()});
        if(!observation)return {candidate:null,prompt:null,locationCaptured:null};
        const at=Date.parse(observation.capturedAt),source=observation.input.logId,zone=observation.input.zone;
        if(armed&&(armed.source!==source||contributionNameKey(armed.zone)!==contributionNameKey(zone)||now()>armed.expiresAt))armed=null;
        if(lastLog?.source===source&&at<lastLog.at)return {candidate:null,prompt:null,locationCaptured:null};
        lastLog={source,zone,at,cursor:observation.input.cursor};
        if(seenLogIds.has(observation.id))return {candidate:null,prompt:null,locationCaptured:null};
        seenLogIds.add(observation.id);while(seenLogIds.size>2000)seenLogIds.delete(seenLogIds.values().next().value);
        if(event.type==='location'){
            const pending=armed;
            const afterBoundary=pending&&at>=Math.floor(pending.armedAt/1000)*1000&&(Number.isSafeInteger(pending.cursor)&&Number.isSafeInteger(observation.input.cursor)?observation.input.cursor>pending.cursor:at>=pending.armedAt);
            const candidate=pending&&candidates.find(value=>value.id===pending.candidateId&&value.kind==='npc'&&contributionNameKey(value.zone)===contributionNameKey(zone));
            if(!candidate||!afterBoundary){save();return {candidate:null,prompt:null,locationCaptured:null};}
            armed=null;const location=observation.location,display=[location.y,location.x,location.z].join(', ');
            const evidence={...observation,subject:{kind:'monster',name:candidate.name},evidence:{text:`Player requested the next /loc for ${candidate.name} in ${zone}: ${display}. Spawn location still requires review.`}};
            const updated=add({kind:'npc',name:candidate.name,zone,fields:{location:display},evidence,relations:[{type:'spawn-location',name:candidate.name,zone,evidence:'player-requested-next-loc',location,eventId:observation.id,at:observation.capturedAt}]});
            candidate.spawnRequest={...candidate.spawnRequest,status:'captured',capturedAt:observation.capturedAt,evidenceId:observation.id};save();
            return {candidate:updated?structuredClone(candidate):null,prompt:null,locationCaptured:{candidateId:candidate.id,name:candidate.name,zone,location,display}};
        }
        const candidate=consume(observation);let prompt=null;
        if(event.type==='kill'){
            const target=candidates.find(value=>value.kind==='npc'&&contributionNameKey(value.name)===contributionNameKey(observation.subject.name)&&contributionNameKey(value.zone)===contributionNameKey(zone));
            if(target&&!target.spawnRequest&&target.fields.location?.confirmed!==true&&target.membership!=='present'){
                target.spawnRequest={status:'requested',requestedAt:observation.capturedAt,evidenceId:observation.id};prompt={candidateId:target.id,name:target.name,zone};save();
            }
        }
        return {candidate,prompt,locationCaptured:null};
    }
    return{
        snapshot:()=>structuredClone(candidates),cursor:()=>cursor,
        add,consume,consumeLog,
        armSpawnLocation(candidateId){const candidate=candidates.find(value=>value.id===candidateId&&value.kind==='npc');if(!candidate||!lastLog?.zone||contributionNameKey(candidate.zone)!==contributionNameKey(lastLog.zone))return {ok:false,error:'Return to the monster’s zone before recording its spawn location.'};const armedAt=now();armed={candidateId,source:lastLog.source,zone:lastLog.zone,cursor:lastLog.cursor,armedAt,expiresAt:armedAt+300000};return {ok:true,candidateId,name:candidate.name,zone:candidate.zone,expiresAt:armed.expiresAt};},
        cancelSpawnLocation(){armed=null;},
        update(id,patch){const candidate=candidates.find(c=>c.id===id);if(!candidate)return null;const priorKey=candidate.key,priorTitle=contributionNameKey(candidate.title);for(const key of ['name','title','zone','instance','era','playerText','fields','sources','relations','status','matchesReviewed','planId','baseRecovery'])if(Object.hasOwn(patch,key))candidate[key]=structuredClone(patch[key]);candidate.key=candidateKey(candidate.kind,candidate.name,candidate.zone);if(priorKey!==candidate.key)candidate.aliasKeys=[...new Set([...(candidate.aliasKeys||[]),priorKey])].slice(-8);if(armed?.candidateId===id&&(priorKey!==candidate.key||priorTitle!==contributionNameKey(candidate.title)))armed=null;save();return structuredClone(candidate);},
        remove(id){const candidate=candidates.find(c=>c.id===id);if(candidate)for(const key of [candidate.key,...(candidate.aliasKeys||[])])ignored.add(key);while(ignored.size>2000)ignored.delete(ignored.values().next().value);candidates=candidates.filter(c=>c.id!==id);if(armed?.candidateId===id)armed=null;save();},
        matches(candidate){const current=pack(),entries=candidate.kind==='item'?current.items:candidate.kind==='npc'?current.npcs:current.zones;return findPotentialMatches(candidate.title||candidate.name,entries||[]);}
    };
}
