import {createWikiResolver,normalizeWikiIdentity,itemBaseIdentity} from './wiki-identity.js';
import {classifyNpcEvidence} from './generated-pets.js';

// Correlation only: no raw source path, player name, chat or screen data leaves
// this collector. Known/ignored/submitted wiki entities are intentionally kept.
const clean=(value,max=230)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export function dropObservationToken(value){
    let a=2166136261,b=3335557771,c=2246822519,d=3266489917;
    for(const char of String(value??'').slice(0,4096)){const x=char.charCodeAt(0);a=Math.imul(a^x,16777619);b=Math.imul(b^x,2246822519);c=Math.imul(c^x,3266489917);d=Math.imul(d^x,668265263);}
    return [a,b,c,d].map(value=>(value>>>0).toString(16).padStart(8,'0')).join('');
}
export function collectDropObservation(event,context={}, {now=Date.now(),freshnessMs=10000}={}){
    if(context.live!==true||!['kill','loot'].includes(event?.type))return null;
    const at=Number.isFinite(context.at)?context.at:event.at;
    if(!Number.isFinite(at)||at<0||now-at>freshnessMs||at-now>2000)return null;
    const players=new Set((context.playerNames||[]).map(normalizeWikiIdentity));players.add('you');players.add('yourself');
    const resolver=context.resolver||createWikiResolver(context.pack||{}),zone=clean(context.zone||event.zone),npcRaw=clean(event.type==='kill'?event.victim:event.source),item=event.type==='loot'?clean(event.item):'';
    if(event.isPlayer===true||event.victimIsPlayer===true||event.targetType==='player'||event.isPet===true)return null;
    const known=resolver.resolve('npc',npcRaw),npcEligible=npcRaw&&!players.has(normalizeWikiIdentity(npcRaw))&&classifyNpcEvidence(npcRaw,known).eligible;
    if(event.type==='kill'&&!npcEligible)return null;
    let npc=npcEligible&&!/^unknown$/i.test(npcRaw)?npcRaw:'',sourceKind=event.type==='kill'?'kill-line':event.sourceEvidence?.kind;
    if(!['explicit-corpse','explicit-source','recent-kill','encounter-target'].includes(sourceKind)||!npc){if(event.type==='loot'){sourceKind='unknown';npc='';}}
    if(event.type==='loot'&&!item)return null;
    const quantity=event.type==='kill'?1:event.quantity??1;if(!Number.isInteger(quantity)||quantity<1||quantity>1000)return null;
    const sequence=Number.isSafeInteger(context.cursor)&&context.cursor>=0?context.cursor:Number.isSafeInteger(event.id)&&event.id>=0?event.id:null;
    // A source cursor identifies repeated delivery without merging two real
    // same-name kills in the same second. A live caller should always supply it.
    if(sequence===null)return null;
    const sourceToken=dropObservationToken(context.logId||'current-log'),sessionToken=dropObservationToken(context.sessionId||'current-session'),observedAt=new Date(at).toISOString();
    const result={id:'obs-'+dropObservationToken(JSON.stringify([sourceToken,sessionToken,at,sequence,event.type,npcRaw,item,quantity])),kind:event.type,observedAt,zone,npc,item,quantity,instance:['normal','raid'].includes(context.instance)?context.instance:'unknown',sourceKind,sourceToken,sessionToken,sequence};
    const server=clean(context.server,80);if(server)result.server=server;
    for(const [kind,name,key]of [['zone',zone,'zoneTitle'],['npc',npc,'npcTitle'],['item',item,'itemTitle']]){const resolved=resolver.resolve(kind,name);if(resolved.membership==='present'&&resolved.canonicalTitle)result[key]=clean(resolved.canonicalTitle);}
    const tier=event.type==='loot'?itemBaseIdentity(item).tier:null;if(tier!==null)result.tier=tier;
    const catalogVersion=clean(context.catalogVersion||context.pack?.meta?.manifestVersion||context.pack?.meta?.version,120);if(catalogVersion)result.catalogVersion=catalogVersion;
    return result;
}
