import assert from 'node:assert/strict';
import {createContributionQueue} from '../app/contribution-queue.js';
const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
let pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Existing Gem','Existing Boots'],npcs:['Goblin Alchemist'],titles:['Existing Gem','Existing Boots','Goblin Alchemist','Synthetic Vale']},items:[{name:'Existing Gem'}],npcs:[{name:'Goblin Alchemist'}],zones:[{name:'Synthetic Vale'}]};
const queue=()=>createContributionQueue({storage,getPack:()=>pack});let q=queue();
assert.equal(q.add({kind:'item',name:'Existing Gem'}),null);assert.equal(q.add({kind:'item',name:'Existing Boots +10'}),null);
const prefixed=q.add({kind:'npc',name:'a goblin alchemist',zone:'Synthetic Vale'});assert.ok(prefixed);assert.equal(prefixed.membership,'missing');
q.remove(prefixed.id);q=queue();assert.equal(q.add({kind:'npc',name:'a goblin alchemist',zone:'Synthetic Vale'}),null);assert.equal(q.consume({sequence:1,owner:'contribution',subject:{kind:'monster',name:'a goblin alchemist'},input:{zone:'Synthetic Vale'},fields:[]}),null);
assert.ok(q.add({kind:'npc',name:'a goblin alchemist',zone:'Synthetic Vale'},true));
const observation=(name,source,evidence='explicit-corpse',sequence=2)=>({id:`event-${sequence}`,sequence,owner:'contribution',kind:'game-log',subject:{kind:'item',name},input:{zone:'Synthetic Vale'},fields:[{key:'name',value:name,confidence:100}],relations:[{type:'drop-source',name:source,zone:'Synthetic Vale',evidence}],capturedAt:'2026-10-22T00:00:00Z'});
const returned=q.consume(observation('New Gem','a missing guardian'));assert.equal(returned.kind,'item');let candidates=q.snapshot(),npc=candidates.find(c=>c.name==='a missing guardian'),item=candidates.find(c=>c.name==='New Gem');assert.deepEqual(npc.fields.knownLoot,{value:['New Gem'],confirmed:false});assert.equal(npc.zone,'Synthetic Vale');assert.equal(item.sources[0].confirmed,false);assert.equal(item.sources[0].sourceEvidence,'explicit-corpse');
q.consume(observation('Another New Gem','a missing guardian','explicit-corpse',3));npc=q.snapshot().find(c=>c.id===npc.id);assert.deepEqual(npc.fields.knownLoot.value,['New Gem','Another New Gem']);assert.equal(npc.fields.knownLoot.confirmed,false);
const existingItem=q.consume(observation('Existing Gem','another missing guardian','explicit-corpse',4));assert.equal(existingItem.kind,'npc');assert.deepEqual(existingItem.fields.knownLoot.value,['Existing Gem']);
q.consume(observation('Speculative Gem','a speculative guardian','recent-kill',5));assert.equal(q.snapshot().some(c=>c.name==='a speculative guardian'),false);assert.equal(q.snapshot().find(c=>c.name==='Speculative Gem').sources[0].confirmed,false);
const before=q.snapshot().length;q.consume({sequence:6,owner:'character',subject:{kind:'item',name:'Character-only Gem'},input:{},fields:[]});assert.equal(q.snapshot().length,before);
const editing=q.snapshot().find(c=>c.name==='New Gem');q.update(editing.id,{fields:{statLines:{value:['AC: 5'],confirmed:true}}});q.add({kind:'item',name:'New Gem',zone:'Synthetic Vale',fields:{statLines:['AC: 999']}});assert.equal(q.snapshot().find(c=>c.id===editing.id).fields.statLines.value[0],'AC: 5');
q.update(editing.id,{fields:{statLines:{value:['AC: 7'],confirmed:false,edited:true}}});q=queue();q.add({kind:'item',name:'New Gem',zone:'Synthetic Vale',fields:{statLines:['AC: 999']}});assert.deepEqual(q.snapshot().find(c=>c.id===editing.id).fields.statLines,{value:['AC: 7'],confirmed:false,edited:true});
const editedNpc=q.snapshot().find(c=>c.name==='a missing guardian');q.update(editedNpc.id,{fields:{knownLoot:{value:['Player-corrected Gem'],confirmed:false,edited:true}}});q.consume(observation('Later Observed Gem','a missing guardian','explicit-corpse',7));const preservedNpc=q.snapshot().find(c=>c.id===editedNpc.id);assert.deepEqual(preservedNpc.fields.knownLoot,{value:['Player-corrected Gem'],confirmed:false,edited:true});assert.ok(preservedNpc.evidence.some(evidence=>evidence.text.includes('Later Observed Gem')));
const manual=q.add({kind:'npc',name:'a manual guardian'},true);q.update(manual.id,{zone:'Synthetic Vale',fields:{level:{value:'55',confirmed:false,edited:true}},planId:'saved-plan-id'});q.consume({sequence:8,owner:'contribution',subject:{kind:'monster',name:'a manual guardian'},input:{zone:'Synthetic Vale'},fields:[{key:'level',value:51}]});assert.equal(q.snapshot().filter(candidate=>candidate.name==='a manual guardian').length,1);assert.equal(q.snapshot().find(candidate=>candidate.id===manual.id).fields.level.value,'55');assert.equal(queue().snapshot().find(candidate=>candidate.id===manual.id).planId,'saved-plan-id');
pack={meta:{wikiEntitiesComplete:false},items:[],npcs:[],zones:[]};assert.equal(q.add({kind:'item',name:'Unknown Catalog Gem'}).membership,'unknown');
const restored=queue().snapshot();assert.ok(restored.some(c=>c.name==='New Gem'));assert.equal(restored.some(c=>c.name==='Character-only Gem'),false);
console.log('Contribution queue: exact prefix identity, upgraded-item presence, durable Ignore/replay, explicit missing-NPC source proposals, unconfirmed relationships and saved reviewed fields passed.');

const hintValues=new Map(),hintStorage={getItem:key=>hintValues.get(key),setItem:(key,value)=>hintValues.set(key,value)},hintPack={meta:{wikiEntitiesComplete:true},items:[],npcs:[],zones:[]};
let hints=createContributionQueue({storage:hintStorage,getPack:()=>hintPack});
const hinted=hints.add({kind:'item',name:'Deferred Synthetic Gem'},true);
const sources=[{npc:'A Later Guardian',zone:'Synthetic Vale',instance:'normal',confirmed:true}];
hints.update(hinted.id,{title:'Canonical Synthetic Gem',sources,status:'submitted'});
const mobHint={kind:'npc',name:'a later guardian',title:'A_later_guardian',zone:'Synthetic Vale',instance:'normal'};
assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem']);
hints=createContributionQueue({storage:hintStorage,getPack:()=>hintPack});assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem'],'Published item lookup hints survive restart without confirming mob loot');
for(const patch of [{zone:'Other Vale'},{instance:'raid'},{instance:'unknown'},{name:'Other Guardian',title:'Other Guardian'},{kind:'item'}])assert.deepEqual(hints.sourceItemHints({...mobHint,...patch}),[]);
hints.update(hinted.id,{sources:[{...sources[0],confirmed:false,edited:true,sourceEvidence:'explicit-corpse'}]});assert.deepEqual(hints.sourceItemHints(mobHint),[],'An excluded source is not offered as a lookup hint');
hints.update(hinted.id,{sources:[{...sources[0],confirmed:false,sourceEvidence:'recent-kill'}]});assert.deepEqual(hints.sourceItemHints(mobHint),[],'Inferred recent kills are not source hints');
hints.update(hinted.id,{sources:[{...sources[0],confirmed:false,sourceEvidence:'explicit-corpse'}]});assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem']);
const rawHints=JSON.parse([...hintValues.values()][0]);rawHints.archive=[rawHints.candidates[0]];rawHints.candidates=[];hintStorage.setItem('eql-eye-of-zomm-contributions-v1',JSON.stringify(rawHints));
hints=createContributionQueue({storage:hintStorage,getPack:()=>hintPack});assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem'],'Archived evidence can supply a lookup hint without re-creating a draft');

{
    const saved=new Map(),local={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},catalog={meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:[],zones:[],titles:[]},items:[],npcs:[],zones:[]};
    let now=Date.now(),queue=createContributionQueue({storage:local,getPack:()=>catalog,now:()=>now});
    const killed=queue.consumeLog({type:'kill',victim:'A synthetic notable guardian'},{live:true,at:now,cursor:1,zone:'Synthetic Vale',logId:'notable-log'}),candidate=killed.candidate;
    assert(killed.prompt?.spawnEvidenceId);assert.equal(candidate.fields.notable,undefined);
    const request={id:'spawn-'+candidate.id,candidateId:candidate.id,name:candidate.name,zone:candidate.zone,spawnEvidenceId:killed.prompt.spawnEvidenceId,previousNotable:null,notable:true};
    for(const patch of [{candidateId:'other'},{id:'spawn-other'},{name:'Other guardian'},{zone:'Other vale'},{spawnEvidenceId:'old'},{notable:'true'}])assert.equal(queue.setNpcNotable({...request,...patch}).ok,false);
    assert.equal(queue.setNpcNotable(request).ok,true);assert.equal(queue.spawnStatus().candidateId,candidate.id,'Choosing notable does not disarm /loc');
    queue=createContributionQueue({storage:local,getPack:()=>catalog,now:()=>now});let restored=queue.snapshot().find(value=>value.id===candidate.id);assert.deepEqual(restored.fields.notable,{value:true,confirmed:true,edited:true,source:'player'},'Explicit Yes survives queue reload');
    assert.equal(queue.setNpcNotable({...request,notable:false}).ok,false,'An old popup state cannot overwrite a newer confirmed choice');
    assert.equal(queue.setNpcNotable({...request,previousNotable:true,notable:false}).ok,true);restored=queue.snapshot().find(value=>value.id===candidate.id);assert.equal(restored.fields.notable.value,false,'No is an explicit saved classification');
    queue.update(candidate.id,{playerText:'Keep my edited notes',fields:{...restored.fields,HP:{value:900,confirmed:true,edited:true}}});assert.equal(queue.setNpcNotable({...request,previousNotable:false,notable:true}).ok,true);restored=queue.snapshot().find(value=>value.id===candidate.id);assert.equal(restored.playerText,'Keep my edited notes');assert.equal(restored.fields.HP.value,900,'The popup preserves other edited fields');
    for(const patch of [{planId:'saved-plan'},{planId:null,status:'partial'},{planId:null,status:'submitted'}]){queue.update(candidate.id,patch);assert.equal(queue.setNpcNotable({...request,previousNotable:true,notable:false}).ok,false,'Saved review and published work cannot be overwritten by a popup');}
    const before=queue.snapshot().find(value=>value.id===candidate.id);assert.equal(before.fields.notable.value,true);
    console.log('Notable choice: explicit Yes/No, unanswered state, exact candidate/evidence guards, durable queue and preserved edited/reviewed work passed.');
}
