// Synthetic ordinary exports only. No player file, installed profile or network.
import assert from 'node:assert/strict';
import {parseInventoryExport} from '../app/inventory-export.js';
import {parseAchievementExport} from '../app/achievement-export.js';
import {createCharacterModel,CHARACTER_LIMITS,CHARACTER_STORAGE_KEY as KEY} from '../app/character-model.js';
import {createCharacterProfiles,CHARACTER_PROFILE_LIMITS} from '../app/character-profiles.js';
import {createCharacterStorage} from '../app/character-storage.js';
const memory=()=>{const values=new Map();return{values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Ammo','Any Slot'];
const lines=['Location\tName\tID\tCount\tSlots'];let itemId=100;
const row=(location,name,count=1)=>lines.push([location,name,++itemId,count,0].join('\t'));
labels.forEach((location,index)=>{row(location,'Synthetic Worn '+index+' +3');if(index===2){row('Head-Slot2','Synthetic Socket (Exaltation) +2');lines.push('Head-Slot7\tEmpty\t0\t0\t0');}});
for(const prefix of ['General ','Bank'])for(let bag=1;bag<=(prefix==='Bank'?4:10);bag++){
    row(prefix+bag,'Synthetic Bag '+prefix.trim()+bag);
    for(let slot=1;slot<=(prefix==='Bank'?20:24);slot++)row(prefix+bag+'-Slot'+slot,'Synthetic Stored '+itemId+' +4',slot%3+1);
}
row('Personal-Depot1','Synthetic Depot Bag');row('Personal-Depot1-Slot1','Synthetic Depot Stack',12);
row('Personal-Depot2','Synthetic Stored Socketed Blade');row('Personal-Depot2-Slot3','Synthetic Ornament');row('Personal-Depot2-Slot10','Synthetic Socket (Exaltation) +1');
row('Held','Synthetic Held');
lines.push('','KeyRing\tName\tID');for(let index=0;index<30;index++)lines.push(['Equipment','Synthetic Keyring '+index,++itemId].join('\t'));
const parsed=parseInventoryExport(lines.join('\n'),{classifyParent:entry=>entry.baseName.startsWith('Synthetic Bag')||entry.baseName==='Synthetic Depot Bag'?'container':entry.baseName==='Synthetic Stored Socketed Blade'?'equipment':'unknown'});
const icon='data:image/png;base64,'+'QUJD'.repeat(1200),largeIcon='data:image/png;base64,'+'QUJD'.repeat(5600);
const resolveItem=entry=>({item:{name:entry.baseName,wikiTitle:entry.baseName,iconId:'42',slots:entry.slot?['ANY']:[],stats:{HP:12,STR:2},details:[{label:'Focus effect',value:'Synthetic focus',linkTitle:'Synthetic Focus'}]},icon});
const achievements=parseAchievementExport('Synthetic Journeys\nC\tSynthetic Route\nC\t\tSynthetic Objective\t1/1');
const store=memory(),model=createCharacterModel({storage:store,now:()=>1000});model.setMetadata({name:'Synthetic Large',server:'Fixture'});
assert.equal(CHARACTER_LIMITS.storageBytes,8*1024*1024);assert.equal(CHARACTER_PROFILE_LIMITS.valueBytes,CHARACTER_LIMITS.storageBytes);assert.equal(CHARACTER_PROFILE_LIMITS.storageBytes,32*1024*1024);
assert.equal(CHARACTER_LIMITS.candidates,1000);assert.equal(CHARACTER_LIMITS.augments,8);
assert(model.applyCharacterExports({inventory:parsed,achievements},{resolveItem}).ok);
const first=model.snapshot(),serialized=store.getItem(KEY);assert(Buffer.byteLength(serialized)>1500000,'Normal mixed inventory and its retained icons exceed the old allowance');assert(Buffer.byteLength(serialized)<CHARACTER_LIMITS.storageBytes);
assert.equal(first.candidates.length,parsed.inventory.length+23);assert.equal(first.inventoryExport.keyring.length,30);assert.equal(first.achievements.achievementCount,1);
assert(first.candidates.some(card=>card.inventoryOrigin.group==='bank'));assert(first.candidates.some(card=>card.inventoryOrigin.group==='personal-depot'));assert(first.candidates.some(card=>card.inventoryOrigin.group==='held'));
const head=first.candidates.find(card=>card.id===first.equipment.head),stored=first.candidates.find(card=>card.name==='Synthetic Stored Socketed Blade');assert.equal(head.augments[0].sourceSlot,2);assert.equal(head.emptyAugmentSlots,1);assert.deepEqual(stored.augments.map(value=>value.sourceSlot),[3,10]);
assert(first.candidates.every(card=>card.icon===icon),'Cached pixels remain intact; no storage packing or image stripping');
assert.deepEqual(JSON.parse(serialized),first,'Persistence keeps the original full schema1 representation');assert.deepEqual(createCharacterModel({storage:store}).snapshot(),first,'Large full JSON reloads unchanged');
assert(model.applyCharacterExports({inventory:parsed,achievements},{resolveItem}).ok);assert.deepEqual(model.snapshot(),first,'Reimport preserves physical IDs, counts, origins, sockets and achievements');
const before=model.snapshot(),disk=store.getItem(KEY);assert.equal(model.applyCharacterExports({inventory:parsed,achievements},{resolveItem:entry=>({...resolveItem(entry),icon:largeIcon})}).ok,false,'An irreducible export above8MiB still rejects atomically');assert.deepEqual(model.snapshot(),before);assert.equal(store.getItem(KEY),disk);
const fullLegacy=memory();fullLegacy.setItem(KEY,JSON.stringify(before));assert.deepEqual(createCharacterModel({storage:fullLegacy}).snapshot(),before,'Existing full JSON uses the same reader without a migration');
const backing=memory();let sequence=0;let profiles=createCharacterProfiles({storage:backing,id:()=>`large-profile-${++sequence}`,mirrorLegacy:false});
for(let index=0;index<4;index++){
    if(index)assert(profiles.newCharacter().ok);const current=createCharacterModel({storage:profiles.storage,now:()=>1000});current.setMetadata({name:'Synthetic Large '+index,server:'Fixture'});assert(current.applyCharacterExports({inventory:parsed,achievements},{resolveItem}).ok);assert(profiles.register(current.snapshot().metadata).ok);
}
assert(Buffer.byteLength(backing.getItem('eql-eye-of-zomm-character-profiles-v1'))>8000000,'Multiple unchanged large character snapshots exceed the old roster ceiling');
profiles=createCharacterProfiles({storage:backing,mirrorLegacy:false});for(const profile of profiles.list()){assert(profiles.select(profile.id).ok);const saved=createCharacterModel({storage:profiles.storage}).snapshot();assert.equal(saved.metadata.name,profile.name);assert.equal(saved.candidates.length,first.candidates.length);assert.equal(saved.inventoryExport.keyring.length,30);assert.deepEqual(saved.achievements,achievements);}

// Browser-only quota must fail before changing the sole authoritative value.
const browser=memory();browser.setItem(KEY,JSON.stringify({schemaVersion:1}));let quota=false;
const local={getItem:browser.getItem,removeItem:browser.removeItem,setItem(key,value){if(quota)throw Error('Synthetic browser quota');browser.setItem(key,value);}};
const browserStorage=await createCharacterStorage({api:null,legacyStorage:local}),fallback=createCharacterModel({storage:browserStorage});const fallbackBefore=fallback.snapshot(),browserBefore=browser.getItem(KEY);quota=true;
assert.equal(fallback.applyCharacterExports({inventory:parsed,achievements},{resolveItem}).ok,false);assert.deepEqual(fallback.snapshot(),fallbackBefore);assert.equal(browserStorage.getItem(KEY),browserBefore);assert.equal(browser.getItem(KEY),browserBefore);
assert.throws(()=>browserStorage.setItem(KEY,serialized),/quota/);assert.equal(browserStorage.getItem(KEY),browserBefore);
// A browser mirror cannot veto the desktop's authoritative private file.
const hostValues={},warnings=[];const native=await createCharacterStorage({api:{read:async()=>({values:{},error:null}),write:async({key,value})=>{hostValues[key]=value;return{ok:true};},flush:async()=>({ok:true})},legacyStorage:{getItem:()=>null,setItem(){throw Error('Synthetic mirror quota');},removeItem(){}},onWarning:message=>warnings.push(message)});
native.setItem(KEY,serialized);assert((await native.flush()).ok);assert.equal(native.getItem(KEY),serialized);assert.equal(hostValues[KEY],serialized);
console.log('Character storage capacity: unchanged full JSON >oldcap, carried/bank/depot/keyring/socket/achievement import and reimport,4large profiles/restart,8MiB atomic failure, browser-only quota preservation and native-authority mirror tolerance passed.');
