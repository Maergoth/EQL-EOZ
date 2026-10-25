// Local presentation only. Live page checks and reviewed CAS plans own writes.
import { contributionSourceIncluded } from './contribution-update.js';
import { contributionTitle, contributionItemEffects } from './contribution-model.js';
import { normalizeWikiIdentity, createWikiResolver } from './wiki-identity.js';
import { contributionSameIdentity as same, contributionInstanceMatches as instanceMatches } from './contribution-reasons.js';
import {cachedLootKindLabel} from './loot-classification.js';
const kinds={item:'Item',npc:'Monster',zone:'Zone',spell:'Spell'};
export const CONTRIBUTION_FILTERS=Object.freeze([
    {key:'new-npc',label:'New monsters'},
    {key:'new-item',label:'New items'},
    {key:'new-zone',label:'New zones'},
    {key:'missing-source',label:'Drop sources'},
    {key:'missing-population',label:'Zone populations'},
    {key:'tier0-verification',label:'Tier 0 verification'},
    {key:'review',label:'Other page reviews'}
].map(Object.freeze));
const gapLabels={'missing-source':'Drop source','missing-population':'Zone population','tier0-verification':'Tier 0 verification',review:'Check page match'};
export function contributionQueueInfo(candidate={}){
    const isNew=candidate.membership!=='present'&&(candidate.intent==='create'||candidate.membership==='missing'&&candidate.intent!=='update');
    const categories=isNew?[['npc','item','zone'].includes(candidate.kind)?`new-${candidate.kind}`:'review']:[...new Set((candidate.reasons||[]).filter(key=>Object.hasOwn(gapLabels,key)))];
    if(!categories.length)categories.push('review');
    return {kind:kinds[candidate.kind]||'Page',pageType:isNew?'New Page':'Update Page',isNew,categories,
        labels:isNew?[]:categories.map(key=>gapLabels[key]),
        priority:isNew?({npc:0,item:1,zone:2}[candidate.kind]??3):categories.includes('missing-source')?10:categories.includes('missing-population')?11:categories.includes('tier0-verification')?12:13};
}
export function visibleContributionQueue(candidates=[],enabled=CONTRIBUTION_FILTERS.map(value=>value.key)){
    const allowed=new Set(enabled);
    return candidates.map((candidate,index)=>({candidate,index,info:contributionQueueInfo(candidate)}))
        .filter(row=>row.info.categories.some(key=>allowed.has(key)))
        .sort((a,b)=>a.info.priority-b.info.priority||a.index-b.index).map(row=>row.candidate);
}
export function contributionQueueCounts(candidates=[]){
    return Object.fromEntries(CONTRIBUTION_FILTERS.map(({key})=>[key,candidates.filter(candidate=>contributionQueueInfo(candidate).categories.includes(key)).length]));
}

// These are proposed destinations, not a publish plan. Keep this projection in
// step with patchContributionPrimary and WikiClient.preparePlan. Live identity,
// existing content and review limits can still omit or block a related edit.
export function contributionRelationshipStatus(candidate={},change={}, {pack,resolver=pack?createWikiResolver(pack):null}={}){
    if(!resolver)return 'unknown';
    const zone=change.zone||candidate.zone||candidate.title||candidate.name,observed={instance:change.instance||candidate.instance};
    if(change.role==='zone-population'||change.role==='mob-zone'){
        const npc=resolver.resolve('npc',change.npc||change.subject||candidate.title||candidate.name);
        if(npc.membership==='ambiguous')return 'unknown';
        if(npc.records.some(record=>record.zone&&same(resolver,'zone',record.zone,zone)&&instanceMatches(observed,record)))return 'recorded';
        return npc.membership==='missing'||npc.records.length?'missing':'unknown';
    }
    if(!['zone-loot','npc-loot','item-source'].includes(change.role))return 'unknown';
    const item=resolver.resolve('item',change.item||change.subject),records=item.records.filter(record=>Array.isArray(record.dropSources));
    if(item.membership==='ambiguous')return 'unknown';
    if(records.some(record=>record.dropSources.some(source=>same(resolver,'zone',source.zone,zone)&&(!change.npc||same(resolver,'npc',source.name,change.npc))&&instanceMatches(observed,source))))return 'recorded';
    return item.membership==='missing'||records.length?'missing':'unknown';
}
export function contributionLootEntryInfo(candidate={},item,{pack,resolver=pack?createWikiResolver(pack):null}={}){
    const relation=(candidate.relations||[]).find(relation=>relation.type==='drop-source'&&relation.evidence==='explicit-corpse'&&normalizeWikiIdentity(relation.item)===normalizeWikiIdentity(item));
    const change={role:candidate.kind==='npc'?'npc-loot':'zone-loot',subject:item,item,npc:candidate.kind==='npc'?candidate.title||candidate.name:relation?.name,zone:candidate.kind==='zone'?candidate.title||candidate.name:candidate.zone,instance:relation?.instance||candidate.instance};
    const status=contributionRelationshipStatus(candidate,change,{resolver});
    if(status==='recorded')return {status,description:'Already recorded in cached wiki',classificationLabel:'Existing classification preserved'};
    if(candidate.kind==='zone'&&!relation&&candidate.fields?.knownLoot?.edited!==true)return {status:'needs-source',description:'Captured loot · monster source not recorded'};
    const proposed=candidate.kind==='npc'?[candidate.title||candidate.name]:(candidate.relations||[]).filter(row=>row.type==='drop-source'&&normalizeWikiIdentity(row.item)===normalizeWikiIdentity(item)).map(row=>row.name);
    const classification=pack?cachedLootKindLabel(pack,item,proposed):{label:'Classification needs complete cached wiki data'};
    return {status,description:classification.label,classificationLabel:classification.label};
}
export function contributionDestinations(candidate={}, {pack}={}){
    const destinations=new Map(),title=candidate.title||candidate.name;
    const resolver=pack?createWikiResolver(pack):null;
    const updating=candidate.intent==='update'||candidate.intent!=='create'&&candidate.membership==='present';
    const reasons=candidate.reasons||[],targeted=updating&&reasons.some(reason=>['missing-source','missing-population','tier0-verification'].includes(reason));
    const section=key=>!targeted||reasons.includes(key),field=key=>candidate.fields?.[key],titles=key=>Array.isArray(field(key)?.value)?field(key).value:[];
    const add=(rawTitle,role,subject,description,{primary=false,operation='Update if page exists',instance,item,npc,zone}={})=>{
        let pageTitle;try{pageTitle=contributionTitle(rawTitle);}catch{return;}
        const key=pageTitle,change={role,subject,description,...(instance?{instance}:{}),...(item?{item}:{}),...(npc?{npc}:{}),...(zone?{zone}:{})};
        if(contributionRelationshipStatus(candidate,change,{resolver})==='recorded')return;
        if(!destinations.has(key))destinations.set(key,{title:pageTitle,operation:primary?(updating?'Update Page':'New Page'):operation,primary,changes:[]});
        const destination=destinations.get(key);
        if(!destination.changes.some(prior=>prior.role===role&&normalizeWikiIdentity(prior.subject)===normalizeWikiIdentity(subject)&&prior.description===description))destination.changes.push(change);
    };
    try{contributionTitle(title);}catch{return [];}
    // Retain a primary target even when the draft has no selected additions.
    add(title,'primary',title,updating?'Review page changes':'Create '+(kinds[candidate.kind]||'page').toLowerCase()+' page',{primary:true});
    const zoneName=instance=>instance==='raid'?'Raid Zone':instance==='normal'?'Normal Zone':'instance to choose';
    const instanceOf=source=>['normal','raid'].includes(source?.instance)?source.instance:candidate.instance;
    const lootKind=item=>pack?cachedLootKindLabel(pack,item,candidate.kind==='npc'?[title]:[]).label:'classification checked from cached wiki data at preview';
    const lootAllowed=section('missing-source')||field('knownLoot')?.edited===true;
    if(candidate.kind==='item'){
        for(const source of (candidate.sources||[]).filter(source=>source.npc&&source.zone&&contributionSourceIncluded(source)&&(section('missing-source')||source.edited===true))){
            const instance=instanceOf(source),scope=zoneName(instance);
            add(title,'item-source',source.npc,'Add drop source: '+source.npc+' · '+source.zone+' · '+scope,{primary:true,instance,item:title,npc:source.npc,zone:source.zone});
            if(!['normal','raid'].includes(instance))continue;
            add(source.npc,'npc-loot',title,'Add '+title+' to monster loot · '+scope,{instance,item:title,npc:source.npc,zone:source.zone});
            add(source.zone,'zone-population',source.npc,'Add monster: '+source.npc+' · '+scope,{instance,npc:source.npc,zone:source.zone});
            add(source.zone,'zone-loot',title,'Add loot: '+title+' · '+scope,{instance,item:title,zone:source.zone});
        }
        if(section('tier0-verification')&&reasons.includes('tier0-verification'))add(title,'tier0-verification',title,'Verify tier 0 base statistics',{primary:true});
        for(const effect of contributionItemEffects(candidate))add(effect.name,'spell-effect',effect.name,'Create item-effect spell page if missing',{operation:'Create if missing'});
    }
    if(candidate.kind==='npc'){
        const instance=candidate.instance,scope=zoneName(instance),zone=candidate.zone;
        const reciprocalLootAllowed=!updating||!reasons.length||reasons.includes('missing-source')||field('knownLoot')?.edited===true;
        if(lootAllowed)for(const item of titles('knownLoot')){
            add(title,'npc-loot',item,'Add '+item+' · '+lootKind(item),{primary:true,instance,item,npc:title,zone});
            if(reciprocalLootAllowed&&zone&&['normal','raid'].includes(instance)){
                add(item,'item-source',title,'Add drop source: '+title+' · '+zone+' · '+scope,{instance,item,npc:title,zone});
                add(zone,'zone-loot',item,'Add '+item+' · '+lootKind(item)+' · '+scope,{instance,item,zone});
            }
        }
        if(zone&&(!updating||reasons.includes('missing-population'))){
            if(updating)add(title,'mob-zone',zone,'Add zone: '+zone,{primary:true,instance,npc:title,zone});
            if(['normal','raid'].includes(instance))add(zone,'zone-population',title,'Add monster: '+title+' · '+scope,{instance,npc:title,zone});
        }
    }
    if(candidate.kind==='zone'){
        const instance=candidate.instance,scope=zoneName(instance);
        if(section('missing-population')||field('knownNPCs')?.edited===true)for(const npc of titles('knownNPCs'))add(title,'zone-population',npc,'Add monster: '+npc+' · '+scope,{primary:true,instance,npc,zone:title});
        if(lootAllowed)for(const item of titles('knownLoot')){
            const info=contributionLootEntryInfo(candidate,item,{resolver});
            if(info.status==='needs-source')continue;
            add(title,'zone-loot',item,'Add '+item+' · '+lootKind(item)+' · '+scope,{primary:true,instance,item,zone:title});
        }
        for(const relation of candidate.relations||[]){
            if(relation.type!=='drop-source'||relation.evidence!=='explicit-corpse'||!relation.name||!relation.item||!titles('knownLoot').some(item=>normalizeWikiIdentity(item)===normalizeWikiIdentity(relation.item)))continue;
            const relatedInstance=instanceOf(relation);if(!['normal','raid'].includes(relatedInstance))continue;
            add(relation.item,'item-source',relation.name,'Add drop source: '+relation.name+' · '+title+' · '+zoneName(relatedInstance),{instance:relatedInstance,item:relation.item,npc:relation.name,zone:title});
            add(relation.name,'npc-loot',relation.item,'Add '+relation.item+' to monster loot · '+zoneName(relatedInstance),{instance:relatedInstance,item:relation.item,npc:relation.name,zone:title});
        }
    }
    // The generic description is useful only when no specific gap is known.
    for(const destination of destinations.values())if(destination.changes.length>1)destination.changes=destination.changes.filter(change=>change.role!=='primary');
    return [...destinations.values()];
}
