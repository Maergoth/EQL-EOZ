// Log facts become reviewable suggestions, never an inferred spawn or wiki edit.
import { createWikiResolver, normalizeWikiIdentity, itemBaseIdentity, itemExaltationBaseIdentity } from './wiki-identity.js';

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
    return createWikiResolver(pack).resolve(kind,name).membership;
}
export function logContributionObservation(event,context={}, {now=Date.now(),freshnessMs=10000}={}) {
    if(!event||context.live!==true||!['consider','kill','loot','zone','location','item-link'].includes(event.type))return null;
    const at=Number.isFinite(context.at)?context.at:event.at;
    if(!Number.isFinite(at)||!Number.isFinite(now)||now-at>freshnessMs||at-now>2000)return null;
    const linked=event.type==='item-link',zone=linked?'':contributionEvidenceText(event.type==='zone'?event.zone:context.zone||event.zone);
    const source=contributionSourceToken(context.logId),cursor=Number.isSafeInteger(context.cursor)&&context.cursor>=0?context.cursor:null;
    const displayName=contributionEvidenceText(event.type==='loot'||linked?event.item:event.type==='kill'?event.victim:event.type==='consider'?event.target?.name:event.type==='zone'?event.zone:''),name=linked?itemExaltationBaseIdentity(displayName):displayName;
    if(['kill','consider'].includes(event.type)&&(event.isPlayer===true||event.victimIsPlayer===true||event.targetType==='player'||event.isPet===true||['you','yourself',...(Array.isArray(context.playerNames)?context.playerNames.slice(0,200):[]).map(normalizeWikiIdentity)].includes(normalizeWikiIdentity(name))))return null;
    const identity=contributionSourceToken(JSON.stringify([event.type,name,zone,event.location||null]));
    const id=`log-${source}-${at}-${cursor??'line'}-${identity}`;
    const capturedAt=new Date(at).toISOString();
    const instance=!linked&&['normal','raid'].includes(context.instance)?context.instance:'unknown';
    const input={logId:source,cursor,event:event.type,zone,instance,live:true,...(linked?{purpose:'item-link'}:{})};
    if(event.type==='location'){
        const location=Object.fromEntries(['x','y','z'].map(key=>[key,event.location?.[key]]));
        return Object.values(location).every(value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e8)
            ?{id,kind:'game-log',capturedAt,input,location}:null;
    }
    if(!name)return null;
    const kind=event.type==='loot'||linked?'item':['kill','consider'].includes(event.type)?'monster':'zone';
    const fields=[{key:'name',value:name,confidence:100}],relations=[];
    const linkedTier=linked?itemBaseIdentity(displayName).tier:null;if(linkedTier!==null)fields.push({key:'tier',value:linkedTier,confidence:100});
    const relate=(type,relatedName,evidence)=>relations.push({type,name:relatedName,zone,instance,evidence,confirmed:false,eventId:id,at:capturedAt,...(type==='drop-source'?{item:name}:{})});
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
        evidence:{text:linked?contributionEvidenceText(event.evidence?.text,6000)||`Item linked in chat: ${displayName}`:`Log ${event.type}: ${name}${zone?` in ${zone}`:''}${relations.filter(relation=>relation.type==='drop-source').map(relation=>`\nSource suggestion: ${relation.name} (${relation.evidence})`).join('')}`}};
}
