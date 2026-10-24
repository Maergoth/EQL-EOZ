// Log facts become reviewable suggestions, never an inferred spawn or wiki edit.
import { contributionNameKey } from './contribution-model.js';

export const CONTRIBUTION_QUEUE_KEY = 'eql-eye-of-zomm-contributions-v1';
export const CONTRIBUTION_QUEUE_BYTES = 1800000;
export const contributionEvidenceText = (value, max=240) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
// A local correlation token, not an account identifier or authentication hash.
// Do not persist a player's filesystem path from context.logId.
export function contributionSourceToken(value) {
    let a=2166136261,b=3335557771;
    for(const char of String(value || 'current-log').slice(0,2048)){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b^char.charCodeAt(0),2246822519);}
    return `${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
}
export function contributionMembership(pack={},kind,name='') {
    const entities=pack.wikiEntities||{},list=kind==='item'?pack.items:kind==='npc'?pack.npcs:pack.zones;
    const typed=kind==='item'?entities.items:kind==='npc'?entities.npcs:[];
    const records=[...(Array.isArray(entities.titles)?entities.titles:[]),...(Array.isArray(typed)?typed:[]),...(Array.isArray(list)?list:[])];
    const keys=new Set(records.flatMap(record=>typeof record==='string'?[record]:[record?.name,record?.title,record?.wikiTitle,...(Array.isArray(record?.aliases)?record.aliases:[])]).filter(Boolean).map(contributionNameKey));
    const base=kind==='item'?String(name).replace(/\s*\+\d+(?:\s*\([^)]*\))?\s*$/,'').trim():name;
    if(keys.has(contributionNameKey(name))||base!==name&&keys.has(contributionNameKey(base)))return 'present';
    return pack.meta?.wikiEntitiesComplete===true&&pack.meta?.sample!==true&&['items','npcs','titles'].every(key=>Array.isArray(entities[key]))?'missing':'unknown';
}
export function logContributionObservation(event,context={}, {now=Date.now(),freshnessMs=10000}={}) {
    if(!event||context.live!==true||!['consider','kill','loot','zone','location'].includes(event.type))return null;
    const at=Number.isFinite(context.at)?context.at:event.at;
    if(!Number.isFinite(at)||!Number.isFinite(now)||now-at>freshnessMs||at-now>2000)return null;
    const zone=contributionEvidenceText(event.type==='zone'?event.zone:context.zone||event.zone);
    const source=contributionSourceToken(context.logId),cursor=Number.isSafeInteger(context.cursor)&&context.cursor>=0?context.cursor:null;
    const name=contributionEvidenceText(event.type==='loot'?event.item:event.type==='kill'?event.victim:event.type==='consider'?event.target?.name:event.type==='zone'?event.zone:'');
    const identity=contributionSourceToken(JSON.stringify([event.type,name,zone,event.location||null]));
    const id=`log-${source}-${at}-${cursor??'line'}-${identity}`;
    const capturedAt=new Date(at).toISOString();
    const input={logId:source,cursor,event:event.type,zone,live:true};
    if(event.type==='location'){
        const location=Object.fromEntries(['x','y','z'].map(key=>[key,event.location?.[key]]));
        return Object.values(location).every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e8)
            ?{id,kind:'game-log',capturedAt,input,location}:null;
    }
    if(!name)return null;
    const kind=event.type==='loot'?'item':['kill','consider'].includes(event.type)?'monster':'zone';
    const fields=[{key:'name',value:name,confidence:100}],relations=[];
    const relate=(type,relatedName,evidence)=>relations.push({type,name:relatedName,zone,evidence,confirmed:false,eventId:id,at:capturedAt,...(type==='drop-source'?{item:name}:{})});
    if(event.type==='consider'&&Number.isFinite(event.target?.level))fields.push({key:'level',value:event.target.level,confidence:100});
    if(kind==='monster'&&zone){relate('mob-zone',name,event.type);relate('zone-population',name,event.type);}
    if(event.type==='loot'){
        if(Number.isSafeInteger(event.quantity)&&event.quantity>0)fields.push({key:'quantity',value:event.quantity,confidence:100});
        if(zone)relate('zone-loot',name,'loot');
        const sourceName=contributionEvidenceText(event.source),evidence=contributionEvidenceText(event.sourceEvidence?.kind,40)||'unknown';
        if(sourceName&&sourceName!=='Unknown'){
            relate('drop-source',sourceName,evidence);
            if(evidence==='explicit-corpse'&&zone){relate('mob-zone',sourceName,'explicit-corpse');relate('zone-population',sourceName,'explicit-corpse');}
        }
    }
    return {id,kind:'game-log',owner:'contribution',capturedAt,input,subject:{kind,name},fields,relations,
        evidence:{text:`Log ${event.type}: ${name}${zone?` in ${zone}`:''}${relations.filter(relation=>relation.type==='drop-source').map(relation=>`\nSource suggestion: ${relation.name} (${relation.evidence})`).join('')}`}};
}
