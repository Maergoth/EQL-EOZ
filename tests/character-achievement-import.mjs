import assert from 'node:assert/strict';
import {createCharacterModel,CHARACTER_STORAGE_KEY as KEY,CHARACTER_LIMITS} from '../app/character-model.js';
import {parseAchievementExport,normalizeAchievementExport} from '../app/achievement-export.js';
import {parseInventoryExport} from '../app/inventory-export.js';
import {createCharacterProfiles} from '../app/character-profiles.js';
import {createCharacterStorage} from '../app/character-storage.js';

function memory(){const values=new Map(),writes=[];let blocked=false;return {values,writes,getItem:key=>values.get(key)??null,setItem(key,value){if(blocked)throw Error('Synthetic quota failure');writes.push({key,value});values.set(key,value);},removeItem:key=>values.delete(key),fail:value=>{blocked=value;}};}
const achievements=parseAchievementExport('Synthetic Journeys\nC\tA completed route\nC\t\tVisit the tower.\nI\t\tOptional other route.\nI\tA collecting route\nI\t\tCollect tokens.\t3/10');
const file={name:'C:\\private\\Synthetic_Realm-Achievements.txt',bytes:300,modifiedAt:900,sha256:'A'.repeat(64)};
const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Ammo','Any Slot'];
const inventory=()=>parseInventoryExport(['Location\tName\tID\tCount\tSlots',...labels.map((label,index)=>[label,index===2?'Synthetic Export Cap':'Empty',index===2?101:0,index===2?1:0,0].join('\t')),'General 1\tSynthetic Stored Token\t102\t2\t0'].join('\n'));
const resolveItem=entry=>({item:{name:entry.baseName,wikiTitle:entry.baseName,slots:entry.slot==='head'?['HEAD']:[],stats:{HP:12}}});
const storage=memory(),model=createCharacterModel({storage,now:()=>1000});
model.setMetadata({name:'Synthetic First',server:'Realm'});
assert(model.applyInventoryExport(inventory(),{resolveItem}).ok);
model.setStatSnapshot('current',{stats:{HP:1234,AC:90},confirmed:true});
const before=model.snapshot(),input=structuredClone(achievements),writes=storage.writes.length;
const imported=model.applyAchievementExport({...achievements,achievementCount:999},{file});
assert(imported.ok);assert(imported.saved);assert.equal(storage.writes.length,writes+1,'Achievement import commits once');
assert.deepEqual(model.snapshot().achievements,achievements,'Model revalidates the DTO and recomputes its summary');
assert.deepEqual(achievements,input,'Caller data is untouched');
for(const field of ['metadata','candidates','equipment','inventoryExport','statSnapshots'])assert.deepEqual(model.snapshot()[field],before[field],`${field} survives an independent achievement import`);
assert.deepEqual(model.snapshot().achievementExport,{schemaVersion:1,importedAt:1000,file:{...file,name:'Synthetic_Realm-Achievements.txt',sha256:'a'.repeat(64)}});
assert(!JSON.stringify(model.snapshot().achievementExport).includes('private'),'Only the basename persists, not a local path');
const restored=createCharacterModel({storage,now:()=>2000});assert.deepEqual(restored.snapshot(),model.snapshot(),'Complete achievement tree/provenance survives reload');
const callerMutation=imported.achievements;callerMutation.categories[0].name='Changed';assert.equal(model.snapshot().achievements.categories[0].name,'Synthetic Journeys');
assert(restored.applyInventoryExport(inventory(),{resolveItem}).ok);assert.deepEqual(restored.snapshot().achievements,achievements);
assert(restored.clearInventory().ok);assert.deepEqual(restored.snapshot().achievements,achievements,'Clear inventory leaves achievements available');
assert.deepEqual(restored.snapshot().achievementExport,model.snapshot().achievementExport);
const noFile=createCharacterModel({storage:memory(),now:()=>10});assert(noFile.applyAchievementExport(achievements).ok);assert.deepEqual(createCharacterModel({storage:{getItem:()=>JSON.stringify(noFile.snapshot())}}).snapshot().achievementExport,{schemaVersion:1,importedAt:10,file:null});
const partialFile=createCharacterModel({storage:memory(),now:()=>10});assert(partialFile.applyAchievementExport(achievements,{file:{name:'Achievements.txt'}}).ok);
assert.deepEqual(createCharacterModel({storage:{getItem:()=>JSON.stringify(partialFile.snapshot())}}).snapshot().achievementExport.file,{name:'Achievements.txt',bytes:null,modifiedAt:null,sha256:''});

function unchanged(operation,label){const state=restored.snapshot(),disk=storage.getItem(KEY),count=storage.writes.length;assert.equal(operation().ok,false,label);assert.deepEqual(restored.snapshot(),state,label);assert.equal(storage.getItem(KEY),disk,label);assert.equal(storage.writes.length,count,label);}
for(const invalid of [null,{}, {...achievements,schemaVersion:2},{...achievements,categories:[]},{...achievements,categories:[{name:'Bad',achievements:[{name:'Bad',completed:'yes',objectives:[]}]}]}])unchanged(()=>restored.applyAchievementExport(invalid),'Invalid DTO preserves all state');
for(const invalidFile of [{name:''},{name:'bad\nname'},{...file,sha256:'bad'},{...file,bytes:-1},{...file,modifiedAt:-1}])unchanged(()=>restored.applyAchievementExport(achievements,{file:invalidFile}),'Invalid file identity preserves all state');
const large={kind:achievements.kind,schemaVersion:1,categories:[{name:'Large',achievements:[{name:'Large tree',completed:false,objectives:Array.from({length:900},(_,i)=>({text:`Objective ${i}: ${'x'.repeat(1800)}`,completed:false}))}]}]};
assert(normalizeAchievementExport(large),'The export itself is valid within parser limits');assert(JSON.stringify(large).length>1500000);assert(JSON.stringify(large).length<CHARACTER_LIMITS.storageBytes);
assert(restored.applyAchievementExport(large,{file}).ok,'Previously rejected complete achievement trees fit the increased allowance');assert.deepEqual(restored.snapshot().achievements,normalizeAchievementExport(large));
const unicodeLarge={...large,categories:[{name:'Unicode',achievements:[{name:'Unicode tree',completed:false,objectives:Array.from({length:400},(_,i)=>({text:`${i}: ${'界'.repeat(1300)}`,completed:false}))}]}]};
assert(normalizeAchievementExport(unicodeLarge));assert(Buffer.byteLength(JSON.stringify(unicodeLarge))>1500000);assert(Buffer.byteLength(JSON.stringify(unicodeLarge))<CHARACTER_LIMITS.storageBytes);
assert(restored.applyAchievementExport(unicodeLarge,{file}).ok,'Previously oversized UTF-8 achievement trees remain complete');
const oversized={...large,categories:[{name:'Too large',achievements:[{name:'Too large tree',completed:false,objectives:Array.from({length:4800},(_,i)=>({text:`Objective ${i}: ${'x'.repeat(1800)}`,completed:false}))}]}]};
assert.equal(normalizeAchievementExport(oversized),null,'The independent export parser still rejects its own oversized input');unchanged(()=>restored.applyAchievementExport(oversized),'Oversized complete tree is rejected, never truncated');
const baseline=restored.snapshot(),diskBefore=storage.getItem(KEY);storage.fail(true);assert.equal(restored.applyAchievementExport(achievements,{file}).ok,false);assert.deepEqual(restored.snapshot(),baseline);assert.equal(storage.getItem(KEY),diskBefore);storage.fail(false);

const combinedStorage=memory(),combined=createCharacterModel({storage:combinedStorage,now:()=>3000});combined.setMetadata({name:'Synthetic combined',server:'Realm'});
const combinedBefore=combined.snapshot(),combinedWrites=combinedStorage.writes.length;let resolutionCalls=0;
assert.equal(combined.applyCharacterExports({inventory:inventory(),achievements:null},{resolveItem:entry=>{resolutionCalls++;return resolveItem(entry);}}).ok,false);
assert.equal(resolutionCalls,0,'The second file is validated before inventory resolution');assert.deepEqual(combined.snapshot(),combinedBefore);assert.equal(combinedStorage.writes.length,combinedWrites);
assert.equal(combined.applyCharacterExports({inventory:null,achievements},{achievementFile:file,resolveItem}).ok,false);assert.deepEqual(combined.snapshot(),combinedBefore);assert.equal(combinedStorage.writes.length,combinedWrites);
const combinedResult=combined.applyCharacterExports({inventory:inventory(),achievements},{inventoryFile:{name:'Synthetic-inventory.txt'},achievementFile:file,resolveItem});
assert(combinedResult.ok);assert.equal(combinedStorage.writes.length,combinedWrites+1,'Both exports share one atomic model write');
assert.equal(Object.keys(combined.snapshot().equipment).length,1);assert.deepEqual(combined.snapshot().achievements,achievements);assert.equal(combined.snapshot().inventoryExport.importedAt,combined.snapshot().achievementExport.importedAt);
const combinedSnapshot=combined.snapshot(),combinedDisk=combinedStorage.getItem(KEY);combinedStorage.fail(true);
assert.equal(combined.applyCharacterExports({inventory:inventory(),achievements},{achievementFile:file,resolveItem}).ok,false);assert.deepEqual(combined.snapshot(),combinedSnapshot);assert.equal(combinedStorage.getItem(KEY),combinedDisk);combinedStorage.fail(false);
assert.equal(combined.applyCharacterExports({inventory:inventory(),achievements:oversized},{achievementFile:file,resolveItem}).ok,false);assert.deepEqual(combined.snapshot(),combinedSnapshot,'Combined oversize preserves prior inventory and achievements');

const backing=memory();let id=0;const profiles=createCharacterProfiles({storage:backing,id:()=>`achievement-profile-${++id}`,mirrorLegacy:false});
let active=createCharacterModel({storage:profiles.storage,now:()=>4000});active.setMetadata({name:'Synthetic One',server:'Realm'});assert(active.applyAchievementExport(achievements,{file}).ok);const first=profiles.register(active.snapshot().metadata);assert(first.ok);
assert(profiles.newCharacter().ok);active=createCharacterModel({storage:profiles.storage,now:()=>5000});assert.equal(active.snapshot().achievements,null);active.setMetadata({name:'Synthetic Two',server:'Realm'});
const other=parseAchievementExport('Synthetic Other\nI\tA different route');assert(active.applyAchievementExport(other,{file:{name:'Other-Achievements.txt'}}).ok);const second=profiles.register(active.snapshot().metadata);assert(second.ok);
const profileRestart=createCharacterProfiles({storage:backing,mirrorLegacy:false});assert(profileRestart.select(first.id).ok);assert.deepEqual(createCharacterModel({storage:profileRestart.storage}).snapshot().achievements,achievements);assert(profileRestart.select(second.id).ok);assert.deepEqual(createCharacterModel({storage:profileRestart.storage}).snapshot().achievements,other,'Achievement trees stay isolated by selected Character');
const selected=createCharacterModel({storage:profileRestart.storage,now:()=>5500}),selectedBefore=selected.snapshot(),rosterBefore=JSON.stringify([...backing.values]);backing.fail(true);
assert.equal(selected.applyCharacterExports({inventory:inventory(),achievements},{achievementFile:file,resolveItem}).ok,false);assert.deepEqual(selected.snapshot(),selectedBefore);assert.equal(JSON.stringify([...backing.values]),rosterBefore,'A rejected profile save changes neither export nor sibling profiles');backing.fail(false);

const privateValues={},privateWrites=[];const host={read:async()=>({values:{...privateValues},error:null}),write:async({key,value})=>{privateWrites.push(key);privateValues[key]=value;return {ok:true};},flush:async()=>({ok:true})};
const durable=await createCharacterStorage({api:host,legacyStorage:memory()});const durableModel=createCharacterModel({storage:durable,now:()=>6000});assert(durableModel.applyAchievementExport(achievements,{file}).ok);assert((await durable.flush()).ok);
assert.deepEqual(privateWrites,[KEY],'The existing fixed Character key owns the entire import');
const diskRestore=await createCharacterStorage({api:host,legacyStorage:memory()});assert.deepEqual(createCharacterModel({storage:diskRestore}).snapshot().achievements,achievements,'The ordinary private storage path restores the whole tree');
console.log('Character achievements: complete per-profile tree persistence, standalone and combined atomic imports, one write, file identity, UTF-8 limits, rollback, inventory independence and private storage passed.');
