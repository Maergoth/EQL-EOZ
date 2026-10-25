import assert from 'node:assert/strict';
import {createContributionQueue} from '../app/contribution-queue.js';
import {createWikiDiscovery} from '../app/wiki-discovery.js';
import {CONTRIBUTION_QUEUE_KEY} from '../app/contribution-evidence.js';
import {createItemBaseReview,applyItemBaseReview} from '../app/item-base-review.js';
import {EQLogParser} from '../app/parser.js';
let clock=Date.UTC(2026,9,24,14),cursor=0;
let pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Known Cloak','Quest Token'],npcs:['Forest Warden'],titles:['Known Cloak','Quest Token','Forest Warden','Forest Glade']},items:[{name:'Known Cloak',wikiTitle:'Known Cloak',revisionId:12,dropSources:[{name:'Forest Warden',zone:'Forest Glade',instanceType:'normal'}]},{name:'Quest Token',dropSources:[{name:'Quest',zone:''}]}],npcs:[{name:'Forest Warden',zone:'Forest Glade'}],zones:[{name:'Forest Glade'}]};
const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},options={storage,getPack:()=>pack,now:()=>clock};
let q=createContributionQueue(options);
const event=(type,fields,zone='Forest Glade',instance='normal')=>{clock+=1000;return q.consumeLog({type,...fields},{live:true,zone,instance,at:clock,logId:'synthetic-source',cursor:++cursor});};
assert.equal(event('loot',{item:'KNOWN_CLOAK +5'}).candidate,null,'A bare known item is not a new contribution');
assert.equal(event('loot',{item:'Known Cloak',source:'FOREST WARDEN',sourceEvidence:{kind:'explicit-corpse'}}).candidate,null,'Existing normal source membership is canonical');
let gap=event('loot',{item:'Known Cloak',source:'a new warden',sourceEvidence:{kind:'explicit-corpse'}}).candidate;
assert.equal(gap.kind,'item');assert(gap.reasons.includes('missing-source'));assert.equal(gap.intent,'update');assert.equal(gap.canonicalTitle,'Known Cloak');assert.equal(gap.revisionId,12);
assert(q.snapshot().some(candidate=>candidate.kind==='zone'&&candidate.reasons.includes('missing-population')));
assert(q.snapshot().some(candidate=>candidate.kind==='npc'&&candidate.name==='a new warden'));
const questCount=q.snapshot().length;event('loot',{item:'Quest Token',source:'Quest',sourceEvidence:{kind:'explicit-source'}});assert.equal(q.snapshot().length,questCount,'Intentional quest/provider text is not converted to a missing NPC source');
assert(event('loot',{item:'Quest Token',source:'a different corpse',sourceEvidence:{kind:'explicit-corpse'}}).candidate.reasons.includes('missing-source'),'A genuinely distinct corpse remains reviewable');
event('loot',{item:'Known Cloak',source:'Forest Warden',sourceEvidence:{kind:'explicit-corpse'}},'Forest Glade','raid');
gap=q.snapshot().find(candidate=>candidate.kind==='item'&&candidate.name==='Known Cloak');assert(gap.relations.some(relation=>relation.instance==='raid'));

const killed=event('kill',{victim:'an unknown watcher'});assert(killed.prompt.armed);assert.equal(q.spawnStatus().candidateId,killed.prompt.candidateId);
const next=event('kill',{victim:'another unknown watcher'});assert.equal(q.spawnStatus().candidateId,next.prompt.candidateId);
const location=event('location',{location:{x:3,y:4,z:5}});assert.equal(location.locationCaptured.candidateId,next.prompt.candidateId);assert.equal(q.snapshot().find(candidate=>candidate.id===killed.prompt.candidateId).fields.location,undefined);
assert.equal(event('location',{location:{x:6,y:7,z:8}}).locationCaptured,null);
assert.equal(event('kill',{victim:'an unknown watcher'}).prompt,null,'A saved earlier request is never silently re-armed');
q=createContributionQueue(options);assert.equal(q.spawnStatus(),null);assert.equal(event('kill',{victim:'an unknown watcher'}).prompt,null,'Spawn prompts are suppressed after restart');
q.update(killed.prompt.candidateId,{status:'submitted',planId:'completed-plan'});q=createContributionQueue(options);assert.equal(event('kill',{victim:'an unknown watcher'}).prompt,null);
const discovered=[];let discovery=createWikiDiscovery({...options,getSuppression:(...args)=>q.suppression(...args),onIgnore:(...args)=>q.suppress(...args),onMissing:value=>discovered.push(value)});
assert.equal(discovery.consume({type:'kill',victim:'AN UNKNOWN WATCHER',at:clock},{live:true,zone:'Forest Glade'}),null,'Durable submitted state suppresses transient missing notices');
assert.equal(discovery.consume({type:'loot',item:'Known Cloak +5',at:clock},{live:true}),null);
const pending=discovery.consume({type:'loot',item:'Unqueued Missing Gem',at:clock},{live:true});assert(pending);discovery.ignore(pending.id);discovery=createWikiDiscovery({...options,getSuppression:(...args)=>q.suppression(...args)});assert.equal(discovery.consume({type:'loot',item:'Unqueued Missing Gem+4',at:clock},{live:true}),null,'Shared durable Ignore follows supported tier identity');
assert.equal(event('kill',{victim:'Gtik'}).candidate,null);assert.equal(event('consider',{target:{name:'Jabaner'}}).candidate,null);assert(!q.snapshot().some(candidate=>['Gtik','Jabaner'].includes(candidate.name)));
pack={...pack,npcs:[...pack.npcs,{name:'Gtik',zone:'Forest Glade'}],wikiEntities:{...pack.wikiEntities,npcs:[...pack.wikiEntities.npcs,'Gtik']}};assert.equal(event('kill',{victim:'Gtik'}).prompt,null,'Known pet-lookalike is positively present');
assert.equal(q.add({kind:'npc',name:'Gtik'},true).name,'Gtik','Manual override remains possible');
const ownedPet="A Sampleowner's pet";
pack={...pack,npcs:[...pack.npcs,{name:ownedPet,zone:'Forest Glade'}],wikiEntities:{...pack.wikiEntities,npcs:[...pack.wikiEntities.npcs,ownedPet]}};
for(const name of [ownedPet,'Sampleowner’s pet',"The corpse of Sampleowner's pet."]){
    assert.equal(event('kill',{victim:name}).candidate,null);assert.equal(event('kill',{victim:name}).prompt,null);
    assert.equal(event('consider',{target:{name,level:50}}).candidate,null);
    const priorSources=q.snapshot().find(candidate=>candidate.kind==='item'&&candidate.name==='Known Cloak').sources.length;
    event('loot',{item:'Known Cloak',source:name,sourceEvidence:{kind:'explicit-corpse'}});assert.equal(q.snapshot().find(candidate=>candidate.kind==='item'&&candidate.name==='Known Cloak').sources.length,priorSources,'Pet corpses never add an item source');
    assert.equal(discovery.consume({type:'kill',victim:name,at:clock},{live:true,zone:'Forest Glade'}),null);
}
assert.equal(q.add({kind:'npc',name:ownedPet},true),null,'An explicit owner-pet label is never a new NPC page');
assert(!q.snapshot().some(candidate=>candidate.kind==='npc'&&candidate.name.includes('Sampleowner')));
assert(!q.snapshot().some(candidate=>candidate.sources.some(source=>source.npc.includes('Sampleowner'))));
assert(event('kill',{victim:"Captain's guard"}).candidate,'A normal possessive NPC name stays eligible');
assert(event('kill',{victim:'A pet goblin'}).candidate,'Pet-like common nouns alone do not identify an owned pet');
const zoneProposal=q.consume({id:'synthetic-zone-pets',kind:'screen-read',owner:'contribution',subject:{kind:'zone',name:'Synthetic New Zone'},fields:[{key:'knownNPCs',value:[ownedPet,"Captain's guard"]}],input:{zone:'Synthetic New Zone'}});assert.deepEqual(zoneProposal.fields.knownNPCs.value,["Captain's guard"],'Observed zone NPC lists use the same pet classification');
const observedParser=new EQLogParser();observedParser.parse('[Thu Aug 20 03:10:19 2026] You have entered Synthetic Vale.');
for(const line of ["You have slain A Sampleowner's pet!",'Sampleowner’s pet glares at you threateningly -- looks like quite a gamble. (Lvl: 50)',"You slash A Sampleowner's pet for 12 points of damage."])observedParser.parse('[Thu Aug 20 03:10:23 2026] '+line);
assert.equal(observedParser.snapshot().observed.length,0,'Owned pets never enter the parser’s found-NPC state through kill, consider or damage');
observedParser.rememberNpc("Captain's guard");observedParser.rememberNpc('Gtik');assert.equal(observedParser.snapshot().observed.length,2,'Parser filtering remains limited to explicit owner-pet labels');

const ownedDrafts=[{id:'owned-untouched',kind:'npc',name:ownedPet,title:ownedPet,zone:'Forest Glade',fields:{},sources:[],relations:[],evidence:[],status:'needs-review'},
    {id:'owned-protected',kind:'npc',name:'Sampleowner’s pet',title:'Sampleowner’s pet',zone:'Forest Glade',fields:{notes:{value:'Preserve my local draft.',edited:true}},sources:[],relations:[],evidence:[],status:'needs-review'}];
const petDisk=new Map([[CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,candidates:ownedDrafts})]]),petQueue=createContributionQueue({...options,storage:{getItem:key=>petDisk.get(key),setItem:(key,value)=>petDisk.set(key,value)}});
assert.deepEqual(petQueue.archived().map(candidate=>[candidate.id,candidate.archive.reason]),[['owned-untouched','owned-pet']]);assert.deepEqual(petQueue.snapshot().map(candidate=>candidate.id),['owned-protected'],'Existing contributor edits remain private and intact');
const protectedKill=petQueue.consumeLog({type:'kill',victim:'Sampleowner’s pet'},{live:true,zone:'Forest Glade',at:clock,logId:'synthetic-owned-pet',cursor:1});assert.equal(protectedKill.prompt,null,'A preserved old pet draft cannot re-arm a spawn prompt');assert.equal(petQueue.spawnStatus(),null);

// Reconciliation keeps private original data in a bounded archive, never
// destroys edited work or genuine source/verification tasks.
const legacy=[{id:'false-positive',kind:'item',name:'Known Cloak +5',title:'Known Cloak +5',zone:'',fields:{},sources:[],relations:[],evidence:[{id:'original',text:'Synthetic untouched evidence'}],status:'needs-review'},
    {id:'pet',kind:'npc',name:'Zabekn',title:'Zabekn',zone:'Forest Glade',fields:{},sources:[],relations:[],evidence:[],spawnRequest:{status:'requested'},status:'needs-review'},
    {id:'edited',kind:'item',name:'Quest Token',title:'Quest Token',fields:{notes:{value:'Contributor-authored text',edited:true}},sources:[],relations:[],status:'needs-review'},
    {id:'inflight',kind:'item',name:'Known Cloak',title:'Known Cloak',fields:{},sources:[],relations:[],status:'partial',planId:'partial-plan'},
    {id:'real-gap',kind:'item',name:'Known Cloak',title:'Known Cloak',fields:{},sources:[],relations:[{type:'drop-source',name:'New corpse',zone:'Forest Glade',evidence:'explicit-corpse',instance:'normal'}],status:'needs-review'}];
const disk=new Map([[CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,candidates:legacy})]]),archiveStore={getItem:key=>disk.get(key),setItem:(key,value)=>disk.set(key,value)};
let clean=createContributionQueue({...options,storage:archiveStore,autoReconcile:false});const before=disk.get(CONTRIBUTION_QUEUE_KEY),dry=clean.reconcile();assert.equal(disk.get(CONTRIBUTION_QUEUE_KEY),before);assert.equal(dry.rows.find(row=>row.id==='real-gap').action,'keep');
clean.reconcile({apply:true});assert.deepEqual(clean.archived().map(candidate=>candidate.id),['false-positive','pet']);assert(clean.archived()[0].evidence.some(entry=>entry.id==='original'));assert.deepEqual(clean.snapshot().map(candidate=>candidate.id),['edited','inflight','real-gap']);const once=disk.get(CONTRIBUTION_QUEUE_KEY);clean=createContributionQueue({...options,storage:archiveStore});assert.equal(clean.reconcile({apply:true}).changed,false);assert.equal(disk.get(CONTRIBUTION_QUEUE_KEY),once);
const duplicateBase={kind:'item',name:'Missing Relic',title:'Missing Relic',fields:{hp:{value:5}},sources:[],relations:[],status:'needs-review'},dupes=[{...duplicateBase,id:'first',evidence:[{id:'first-evidence',text:'First synthetic evidence'}]},{...duplicateBase,id:'second',fields:{...duplicateBase.fields,iconId:{value:7}},evidence:[{id:'second-evidence',text:'Second synthetic evidence'}]},{...duplicateBase,id:'conflict',fields:{hp:{value:6}},evidence:[]}];
const duplicateDisk=new Map([[CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,candidates:dupes})]]);let writesFail=false;const duplicateStore={getItem:key=>duplicateDisk.get(key),setItem:(key,value)=>{if(writesFail)throw Error('Synthetic disk unavailable');duplicateDisk.set(key,value);}};const duplicates=createContributionQueue({...options,storage:duplicateStore,autoReconcile:false});assert.equal(duplicates.reconcile().rows.find(row=>row.id==='conflict').classification,'duplicate-conflict');const durableBefore=duplicateDisk.get(CONTRIBUTION_QUEUE_KEY);writesFail=true;const failedArchive=duplicates.reconcile({apply:true});assert.equal(failedArchive.applied,false);assert.equal(failedArchive.persisted,false);assert.equal(duplicates.snapshot().length,3);assert.equal(duplicates.archived().length,0);assert.equal(duplicateDisk.get(CONTRIBUTION_QUEUE_KEY),durableBefore,'Failed reconciliation rolls back its in-memory changes and preserves saved bytes');writesFail=false;duplicates.reconcile({apply:true});assert.deepEqual(duplicates.snapshot().map(candidate=>candidate.id),['first','conflict']);assert.equal(duplicates.snapshot()[0].fields.iconId.value,7);assert.equal(duplicates.snapshot()[0].evidence.length,2);assert.equal(duplicates.archived()[0].id,'second');
const protectedAttachment=q.add({kind:'item',name:'Manual Screenshot Task'},true),beforeInvalid=JSON.stringify(q.snapshot().find(candidate=>candidate.id===protectedAttachment.id));assert.throws(()=>q.update(protectedAttachment.id,{playerText:'Should not be applied',attachment:{attachmentId:'bad'}}));assert.equal(JSON.stringify(q.snapshot().find(candidate=>candidate.id===protectedAttachment.id)),beforeInvalid,'An invalid attachment cannot partially overwrite a draft');
const automaticDisk=new Map([[CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,candidates:legacy})]]),automaticStore={getItem:key=>automaticDisk.get(key),setItem:(key,value)=>automaticDisk.set(key,value)},automatic=createContributionQueue({...options,storage:automaticStore});assert.deepEqual(automatic.archived().map(candidate=>candidate.id),['false-positive','pet'],'The startup migration actually reconciles the loaded queue');assert.equal(JSON.parse(automaticDisk.get(CONTRIBUTION_QUEUE_KEY)).archive.length,2);const automaticOnce=automaticDisk.get(CONTRIBUTION_QUEUE_KEY);createContributionQueue({...options,storage:automaticStore});assert.equal(automaticDisk.get(CONTRIBUTION_QUEUE_KEY),automaticOnce,'Restarting the migrated queue is byte-idempotent');
let refreshedPack={items:[],npcs:[],zones:[]};const refreshStore=new Map(),refresh=createContributionQueue({storage:{getItem:key=>refreshStore.get(key),setItem:(key,value)=>refreshStore.set(key,value)},getPack:()=>refreshedPack,now:()=>clock});refresh.add({kind:'item',name:'Newly Known Relic'});assert.equal(refresh.snapshot().length,1);refreshedPack={meta:{wikiEntitiesComplete:true,version:'new-catalog'},wikiEntities:{items:['Newly Known Relic'],npcs:[],titles:['Newly Known Relic']},items:[{name:'Newly Known Relic',dropSources:[]}]};assert.equal(refresh.snapshot().length,0,'A replaced catalog is automatically reconciled before the next queue snapshot');assert.equal(refresh.archived().length,1);
const pendingChoice=q.add({kind:'item',name:'A pending matching choice'},true);q.update(pendingChoice.id,{title:'Known Cloak',intent:'update',matchesReviewed:false});assert.equal(createContributionQueue(options).snapshot().find(candidate=>candidate.id===pendingChoice.id).intent,'update','Reconciliation preserves an unfinished explicit matching decision');

// Actual tier-zero confirmation is independent of a stale recovery's fields.
const candidate=q.add({kind:'item',name:'Recovery Mantle',fields:{tier:4,fraction:0,hp:42}}),review=createItemBaseReview(candidate,{tier:4,fraction:0,choices:{HP:30},modifiersExcluded:true,reviewed:true});
const patch=applyItemBaseReview(candidate,review);q.update(candidate.id,{...patch,fields:{...patch.fields,statLines:{value:['HP: 30','A preserved contributor note.'],confirmed:true,edited:true}}});
const zero=(id,hp=30,extra=[])=>({id,kind:'screen-read',owner:'contribution',capturedAt:new Date(clock).toISOString(),subject:{kind:'item',name:'Recovery Mantle'},input:{generation:3},fields:[{key:'tier',value:0},{key:'hp',value:hp},...extra]});
q.consume(zero('base-read'));assert(q.tierZeroReview(candidate.id).ok);assert.throws(()=>q.confirmTierZero(candidate.id,{reviewed:true}));
const verified=q.confirmTierZero(candidate.id,{reviewed:true,modifiersExcluded:true,evidenceId:'base-read'});assert.equal(verified.baseRecovery,null);assert.equal(verified.fields.tier.value,0);assert.equal(verified.fields.hp.value,30);assert.equal(verified.baseRecoveryHistory[0].choices.HP,30);assert.deepEqual(verified.fields.statLines.value,['HP: 30','A preserved contributor note.']);assert(!verified.reasons.includes('tier0-verification'));
console.log('Contribution 0.9.8: typed source/instance gaps, automatic one-target spawn loc, durable suppression, pet filter, non-destructive idempotent archive and explicit current tier-zero transition passed.');
