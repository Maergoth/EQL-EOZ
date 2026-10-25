import {createWikiResolver,itemExaltationBaseIdentity,normalizeWikiIdentity} from './wiki-identity.js';
import {contributionRelationshipStatus} from './contribution-presentation.js';

export function automaticSourceReceiptKey(value,{pack={},resolver=createWikiResolver(pack)}={}){
    const names=[['item',value.itemTitle||value.item],['npc',value.npcTitle||value.npc],['zone',value.zoneTitle||value.zone]];
    if(!['normal','raid'].includes(value.instance))return null;
    const identities=names.map(([kind,raw])=>{
        if(typeof raw!=='string'||!raw.trim()||raw.length>240)return '';
        const name=kind==='item'?itemExaltationBaseIdentity(raw):raw,resolved=resolver.resolve(kind,name);
        return resolved.membership==='ambiguous'?'':normalizeWikiIdentity(resolved.canonicalTitle||name);
    });
    return identities.every(Boolean)?JSON.stringify([...identities,value.instance]):null;
}
export function automaticSourceDraftKeys(candidate,{pack={},resolver=createWikiResolver(pack)}={}){
    if(candidate?.membership!=='present'||candidate.intent==='create'||candidate.manual||candidate.planId||candidate.playerText||candidate.attachment||candidate.baseRecovery||candidate.baseVerification||candidate.spawnRequest||
        !['needs-review',''].includes(candidate.status||'')||candidate.reasons?.length!==1||candidate.reasons[0]!=='missing-source'||
        Object.values(candidate.fields||{}).some(field=>field?.edited===true||field?.confirmed===true)||
        (candidate.sources||[]).some(source=>source.edited===true||source.confirmed===true))return null;
    let facts=[];
    if(candidate.kind==='item')facts=(candidate.sources||[]).filter(source=>source.sourceEvidence==='explicit-corpse').map(source=>({item:candidate.title||candidate.name,npc:source.npc,zone:source.zone,instance:source.instance||candidate.instance}));
    else if(candidate.kind==='npc')facts=(candidate.fields.knownLoot?.value||[]).map(item=>({item,npc:candidate.title||candidate.name,zone:candidate.zone,instance:candidate.instance}));
    else if(candidate.kind==='zone'){
        const loot=candidate.fields.knownLoot?.value||[];
        facts=(candidate.relations||[]).filter(relation=>relation.type==='drop-source'&&relation.evidence==='explicit-corpse').map(relation=>({item:relation.item,npc:relation.name,zone:relation.zone,instance:relation.instance||candidate.instance}));
        if(loot.some(item=>!facts.some(fact=>normalizeWikiIdentity(itemExaltationBaseIdentity(fact.item))===normalizeWikiIdentity(itemExaltationBaseIdentity(item)))))return null;
    }
    if(!facts.length)return null;
    const keys=[];
    for(const fact of facts){
        const key=automaticSourceReceiptKey(fact,{resolver});if(!key)return null;
        if(contributionRelationshipStatus(candidate,{role:'item-source',...fact},{resolver})!=='recorded')keys.push(key);
    }
    return [...new Set(keys)];
}
export function automaticSourceDraftComplete(candidate,receipts,options){
    const keys=automaticSourceDraftKeys(candidate,options),recorded=new Set(receipts);
    return Boolean(keys?.length)&&keys.every(key=>recorded.has(key));
}
