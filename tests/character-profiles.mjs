import assert from 'node:assert/strict';
import {createCharacterProfiles,CHARACTER_PROFILES_KEY as ROSTER,CHARACTER_PROFILE_LIMITS as LIMITS} from '../app/character-profiles.js';
import {createCharacterModel,CHARACTER_STORAGE_KEY as MODEL} from '../app/character-model.js';
import {createCharacterWalkthrough,CHARACTER_WALKTHROUGH_KEY as FLOW} from '../app/character-walkthrough.js';

function memory(seed={}){
    const data=new Map(Object.entries(seed)),events=[];let failKey=null;
    return {data,events,getItem:key=>data.get(key)??null,setItem(key,value){events.push({key,value});if(key===failKey)throw Error('Synthetic quota failure');data.set(key,value);},removeItem(key){events.push({key,value:null});if(key===failKey)throw Error('Synthetic mirror failure');data.delete(key);},fail(key){failKey=key;}};
}
const json=value=>JSON.stringify({schemaVersion:1,...value});
const metadata={name:'Synthetic Keeper',server:'Test Server'};
let sequence=0;const ids=()=>`profile-${++sequence}`;
const backing=memory(),warnings=[],profiles=createCharacterProfiles({storage:backing,id:ids,onWarning:message=>warnings.push(message)});
assert.deepEqual(profiles.list(),[]);assert.equal(profiles.activeId(),null);assert.equal(backing.getItem(ROSTER),null,'opening a blank draft writes nothing');
assert.equal(profiles.register({name:'Missing server'}).ok,false);assert.equal(profiles.select('missing').ok,false);assert.equal(backing.getItem(ROSTER),null);
assert.throws(()=>profiles.storage.setItem('other-key',json({})),/Unsupported/);assert.equal(profiles.storage.getItem('other-key'),null);

const model=createCharacterModel({storage:profiles.storage,now:()=>1000});
model.setMetadata(metadata);const card=model.intake({item:{name:'Synthetic saved item',observedStats:{HP:21},evidence:[{observationId:'synthetic-read',sessionId:'fixture',at:1000,text:'Synthetic written HP 21'}]}}).candidate;
const flow=createCharacterWalkthrough({storage:profiles.storage,id:()=> 'fixture-flow',now:()=>2000});
assert.equal(profiles.list().length,0,'seeded metadata and manual inventory do not register first step');
const keeper=profiles.register(metadata);assert(keeper.ok);flow.begin();flow.advance();
const keeperModel=profiles.storage.getItem(MODEL),keeperFlow=profiles.storage.getItem(FLOW);assert.equal(profiles.activeId(),keeper.id);assert.equal(profiles.list().length,1);
assert.equal(JSON.parse(backing.getItem(ROSTER)).draft.model,null,'promotion creates a blank successor draft');
assert(profiles.newCharacter().ok);assert.equal(profiles.activeId(),null);assert.equal(profiles.storage.getItem(MODEL),null);assert.equal(backing.getItem(MODEL),null,'selecting draft updates legacy mirror immediately');
const unnamed=json({metadata:{name:'Draft name',server:''},candidates:[{id:'draft-card'}]});profiles.storage.setItem(MODEL,unnamed);
assert(profiles.select(keeper.id).ok);assert.equal(profiles.storage.getItem(MODEL),keeperModel);assert.equal(backing.getItem(FLOW),keeperFlow);
assert(profiles.newCharacter().ok);assert.equal(profiles.storage.getItem(MODEL),unnamed,'switching to New Character preserves legitimate unregistered inventory');
assert.equal(profiles.register({name:'Ｓｙｎｔｈｅｔｉｃ Ｋｅｅｐｅｒ',server:' TEST   SERVER '}).ok,false,'NFKC/case/whitespace folded duplicate is rejected');
assert.equal(profiles.storage.getItem(MODEL),unnamed,'failed registration leaves draft untouched');
const second=profiles.register({name:'Synthetic Other',server:'Test Server'});assert(second.ok);assert.notEqual(second.id,keeper.id);
const secondFlow=json({sessionId:'other-session',startedAt:3000,step:'details'});profiles.storage.setItem(FLOW,secondFlow);
assert(profiles.register({name:'Synthetic Renamed',server:'Other Server'}).ok);assert.equal(profiles.activeId(),second.id);
const defensive=profiles.list();defensive[0].name='mutated';assert.equal(profiles.list()[0].name,metadata.name);
const remounted=createCharacterProfiles({storage:backing,id:ids});assert.equal(remounted.activeId(),second.id);assert.equal(remounted.storage.getItem(MODEL),unnamed);assert.equal(remounted.storage.getItem(FLOW),secondFlow);
assert(remounted.select(keeper.id).ok);assert.equal(remounted.storage.getItem(MODEL),keeperModel);assert.equal(remounted.storage.getItem(FLOW),keeperFlow);
const restored=createCharacterModel({storage:remounted.storage});assert.equal(restored.snapshot().candidates[0].id,card.id);assert.deepEqual(restored.snapshot().candidates[0].evidence,model.snapshot().candidates[0].evidence,'IDs and exact evidence survive profile switching/remount');
remounted.storage.removeItem(FLOW);assert.equal(remounted.storage.getItem(FLOW),null);assert.equal(backing.getItem(FLOW),null);assert.equal(JSON.parse(backing.getItem(ROSTER)).profiles.find(profile=>profile.id===second.id).walkthrough,secondFlow,'per-profile removal affects no sibling');

// A quota failure must not update memory, selection or either legacy mirror.
const before=backing.getItem(ROSTER),beforeModel=backing.getItem(MODEL),beforeFlow=backing.getItem(FLOW);backing.fail(ROSTER);
assert.throws(()=>remounted.storage.setItem(MODEL,json({metadata:{name:'Should not persist'}})),/quota/);
assert.equal(remounted.select(second.id).ok,false);assert.equal(remounted.newCharacter().ok,false);assert.equal(remounted.register({name:'Quota rename',server:'Test'}).ok,false);
assert.equal(remounted.activeId(),keeper.id);assert.equal(backing.getItem(ROSTER),before);assert.equal(remounted.storage.getItem(MODEL),beforeModel);assert.equal(backing.getItem(MODEL),beforeModel);assert.equal(backing.getItem(FLOW),beforeFlow);backing.fail(null);
const mirrorWarnings=[];backing.fail(MODEL);const mirrorStore=createCharacterProfiles({storage:backing,onWarning:message=>mirrorWarnings.push(message)});
assert(mirrorStore.select(second.id).ok,'authoritative roster save survives mirror quota');assert.equal(JSON.parse(backing.getItem(ROSTER)).activeId,second.id);assert(mirrorWarnings.some(message=>message.includes('mirror')));backing.fail(null);
const noMirror=memory(),noMirrorStore=createCharacterProfiles({storage:noMirror,mirrorLegacy:false,id:ids});noMirrorStore.storage.setItem(MODEL,json({}));assert.equal(noMirror.getItem(MODEL),null);assert(noMirror.getItem(ROSTER));

// Legacy named metadata alone is never enough to populate the selector.
for(const priorFlow of [null,json({step:'details',startedAt:0,sessionId:''}),json({step:'details',startedAt:1000,sessionId:''})]){
    const legacy=memory({[MODEL]:json({metadata,candidates:[{id:'manual'}]}),...(priorFlow?{[FLOW]:priorFlow}:{})}),migrated=createCharacterProfiles({storage:legacy,id:ids});
    assert.deepEqual(migrated.list(),[]);assert.equal(migrated.activeId(),null);assert.equal(JSON.parse(migrated.storage.getItem(MODEL)).candidates[0].id,'manual');
}
for(const step of ['source','unequip','base','reequip','slots','review','complete','details']){
    const legacyModel=json({metadata,candidates:[{id:'legacy-card'}],observationRefs:[{observationId:'legacy-read'}]}),legacyFlow=json({step,startedAt:1000,sessionId:'legacy-session',active:step!=='complete'});
    const legacy=memory({[MODEL]:legacyModel,[FLOW]:legacyFlow}),migrated=createCharacterProfiles({storage:legacy,id:ids});
    assert.equal(migrated.list().length,1,`legacy first step preserved after ${step}`);assert.equal(migrated.storage.getItem(MODEL),legacyModel);assert.equal(migrated.storage.getItem(FLOW),legacyFlow);
    assert.equal(legacy.events[0].key,ROSTER,'migration writes roster before touching mirrors');
}
for(const extra of [{statSnapshots:{base:{confirmed:true,stats:{HP:100}}}},{candidates:[{id:'equipped'}],equipment:{ear1:'equipped'}}]){
    const legacy=memory({[MODEL]:json({metadata,...extra})}),migrated=createCharacterProfiles({storage:legacy,id:ids});assert.equal(migrated.list().length,1,'credible legacy base/equipment remains registered');
}
const blankIdentity=memory({[MODEL]:json({metadata:{name:'',server:'Server'},equipment:{ear1:'x'},candidates:[{id:'x'}]}),[FLOW]:json({startedAt:1,sessionId:'legacy',step:'complete'})});assert.deepEqual(createCharacterProfiles({storage:blankIdentity,id:ids}).list(),[]);

// Corrupt/future aggregates or inner values are preserved and write-blocked.
const validRecord={model:json({}),walkthrough:json({})};
const envelope=(patch={})=>JSON.stringify({schemaVersion:1,activeId:null,draft:validRecord,profiles:[],...patch});
const badRosters=['{bad',json({schemaVersion:2}), '[]',envelope({draft:{model:'{bad',walkthrough:null}}),envelope({draft:{model:json({schemaVersion:2}),walkthrough:null}}),envelope({activeId:'missing'}),envelope({profiles:[{id:'same',name:'A',server:'B',...validRecord},{id:'same',name:'C',server:'D',...validRecord}]}),envelope({profiles:[{id:'a',name:'A',server:'B',...validRecord},{id:'b',name:'Ａ',server:'b',...validRecord}]})];
for(const original of badRosters){
    const legacyValue=json({metadata}),saved=memory({[ROSTER]:original,[MODEL]:legacyValue}),notices=[],blocked=createCharacterProfiles({storage:saved,onWarning:message=>notices.push(message),id:ids});
    assert.throws(()=>blocked.storage.setItem(MODEL,json({})),/preserved/);assert.throws(()=>blocked.storage.removeItem(FLOW),/preserved/);assert.equal(blocked.register(metadata).ok,false);assert.equal(blocked.newCharacter().ok,false);
    assert.equal(saved.getItem(ROSTER),original);assert.equal(saved.getItem(MODEL),legacyValue);assert.equal(saved.events.length,0);assert(notices.length);
}
for(const key of [MODEL,FLOW])for(const original of ['{bad',json({schemaVersion:2}),'[]']){
    const saved=memory({[key]:original}),blocked=createCharacterProfiles({storage:saved,id:ids});assert.throws(()=>blocked.storage.removeItem(key),/preserved/);assert.equal(saved.getItem(key),original);assert.equal(saved.getItem(ROSTER),null);assert.equal(saved.events.length,0);
}
const loaded=memory({[ROSTER]:envelope(),[MODEL]:'{ignored malformed mirror'}),loadedProfiles=createCharacterProfiles({storage:loaded,id:ids});assert(loadedProfiles.register(metadata).ok,'valid roster is authoritative over malformed stale mirror');
assert.throws(()=>loadedProfiles.storage.setItem(MODEL,'{bad'),/malformed/);assert.throws(()=>loadedProfiles.storage.setItem(MODEL,json({schemaVersion:2})),/unsupported/);

// Fixed count and UTF-8 capacity fail closed without evicting any profile.
const full=memory(),fullStore=createCharacterProfiles({storage:full,id:ids});for(let n=0;n<LIMITS.profiles;n++){assert(fullStore.register({name:`Synthetic ${n}`,server:'Capacity'}).ok);assert(fullStore.newCharacter().ok);}
const fullBefore=full.getItem(ROSTER);assert.equal(fullStore.register({name:'Overflow',server:'Capacity'}).ok,false);assert.equal(fullStore.list().length,32);assert.equal(full.getItem(ROSTER),fullBefore);
const large=json({payload:'界'.repeat(490000)}),capacity=memory(),capacityStore=createCharacterProfiles({storage:capacity,id:ids});
for(let n=0;n<5;n++){assert(capacityStore.register({name:`Byte ${n}`,server:'Capacity'}).ok);capacityStore.storage.setItem(MODEL,large);assert(capacityStore.newCharacter().ok);}
assert(capacityStore.register({name:'Last',server:'Capacity'}).ok);const capacityBefore=capacity.getItem(ROSTER),capacityMirror=capacity.getItem(MODEL);
assert.throws(()=>capacityStore.storage.setItem(MODEL,large),/roster is full/);assert.equal(capacity.getItem(ROSTER),capacityBefore);assert.equal(capacity.getItem(MODEL),capacityMirror);assert.equal(capacityStore.list().length,6);
assert.throws(()=>capacityStore.storage.setItem(MODEL,json({payload:'界'.repeat(500000)})),/limit/,'inner size uses UTF-8 bytes');
const collision=memory(),collisionStore=createCharacterProfiles({storage:collision,id:()=> 'same-id'});assert(collisionStore.register(metadata).ok);assert(collisionStore.newCharacter().ok);assert.equal(collisionStore.register({name:'Different',server:'Server'}).ok,false);assert.equal(collisionStore.list().length,1);
console.log('Character profiles: isolated persistent model/flow records, first-step registration/migration, preserved draft, identity collisions, atomic quota rollback, corruption preservation and fixed count/UTF-8 bounds passed.');
