import assert from 'node:assert/strict';
import {parseInventoryExport} from '../app/inventory-export.js';
import {inventoryParentKind,resolveInventoryCatalog} from '../app/character-catalog.js';
import {createCharacterModel,characterEquipmentEligibility,CHARACTER_STORAGE_KEY} from '../app/character-model.js';
import {characterItemLabel} from '../app/character-inventory-view.js';
const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Ammo','Any Slot'];
const row=(location,name='Empty',id=0,count=id?1:0,slots=11)=>[location,name,id,count,slots].join('\t');
const item=(name,slots=[],extra={})=>({name,wikiTitle:name,slots,stats:{},...extra});
const bag=item('Synthetic Bag',[],{displayLines:['Weight Reduction: 50% Capacity: 10 Size Capacity: GIANT']}),gear=item('Synthetic Stored Gear',['PRIMARY']),rune=item('Synthetic Rune',['HEAD']),token=item('Synthetic Token'),ornament=item('Synthetic Ornament');
const pack={items:[bag,gear,rune,token,ornament],meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:[],titles:[]}};
const resolveItem=entry=>resolveInventoryCatalog(pack,entry.baseName,{socket:entry.group==='augment'});
const options={classifyParent:entry=>inventoryParentKind(pack,entry)};
const text=(storage=[],worn=labels.map(label=>row(label)))=>['Location\tName\tID\tCount\tSlots',...worn,...storage].join('\n');
const parse=(storage=[],worn)=>parseInventoryExport(text(storage,worn),options);
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};};
for(const count of [3,10,40]){
    const parsed=parse([row('General 1',bag.name,1),...Array.from({length:count},(_,index)=>row('General 1-Slot'+(index+1),index===0?rune.name+' (Exaltation)':index===1?token.name:'Empty',index<2?index+2:0))]);
    assert.equal(parsed.inventory.length,3);assert.equal(parsed.inventory[0].contentsSeparate,'container');assert.equal(parsed.inventory[0].augments,undefined,'Container children never become sockets, regardless of child count');
    const model=createCharacterModel({storage:null}),result=model.applyInventoryExport(parsed,{resolveItem});assert.equal(result.ok,true,result.error);
    assert.equal(result.unknownCount,0);assert.equal(model.snapshot().candidates.length,3);
    const loose=model.snapshot().candidates.find(card=>card.inventoryOrigin.group==='augment');
    assert.equal(loose.name,rune.name);assert.equal(loose.itemRole,'exaltation');assert.equal(loose.inventoryOrigin.name,rune.name+' (Exaltation)');assert.equal(characterEquipmentEligibility(loose).known,true);assert.equal(characterEquipmentEligibility(loose).canEquip,false);
    assert.match(characterItemLabel(loose),/\(Exaltation\)$/);assert.equal(model.assign(loose.id,'head').ok,false);
    assert.equal(model.snapshot().candidates.find(card=>card.name===bag.name).augmentSlots,0);
}
{
    const statted={...bag,name:'Synthetic Statted Bag',wikiTitle:'Synthetic Statted Bag',slots:['HEAD'],stats:{HP:99}},local={...pack,items:[...pack.items,statted]};
    assert.equal(inventoryParentKind(local,{baseName:statted.name}),'container','Explicit container facts override stats and conflicting positive slots');
    assert.equal(inventoryParentKind({...pack,items:[],wikiEntities:{items:[gear.name],npcs:[],titles:[]}},{baseName:gear.name}),'unknown','Exact presence alone does not establish equipment');
    assert.equal(inventoryParentKind({...pack,items:[gear,{...gear,wikiTitle:'Synthetic competing article'}]},{baseName:gear.name}),'unknown','Ambiguous exact parent identity cannot establish sockets');
    const unknown=parse([row('General 1','Synthetic Unknown Parent',8),...Array.from({length:8},(_,index)=>row('General 1-Slot'+(index+1),rune.name+' (Exaltation)',20+index))]);
    assert.equal(unknown.inventory.length,9);assert(unknown.inventory.every(entry=>entry.augments===undefined),'Even eight Exaltations cannot prove an unknown parent is gear');
}
{
    const parsed=parse([row('General 1',bag.name,1),row('General 1-Slot1',bag.name,2),row('General 1-Slot1-Slot2',rune.name+' (Exaltation) +3',3),row('General 1-Slot2',gear.name,4),row('General 1-Slot2-Slot2'),row('General 1-Slot2-Slot7',rune.name+' (Exaltation)',5),row('General 1-Slot2-Slot10',ornament.name,6),row('General 1-Slot3',token.name,7,5)]);
    assert.equal(parsed.inventory.length,5);const parent=parsed.inventory.find(entry=>entry.baseName===gear.name);
    assert.equal(parent.augmentSlots,3);assert.deepEqual(parent.augments.map(child=>[child.index,child.sourceSlot,child.empty]),[[0,2,true],[1,7,false],[2,10,false]],'Dense indices preserve sparse source ordinals and generic ornaments');
    const model=createCharacterModel({storage:null});assert(model.applyInventoryExport(parsed,{resolveItem}).ok);
    const stored=model.snapshot().candidates.find(card=>card.name===gear.name);assert.equal(stored.augments.length,2);assert.equal(stored.emptyAugmentSlots,1);
    assert.equal(model.snapshot().candidates.filter(card=>card.itemRole==='exaltation').length,1,'The truly loose nested Exaltation remains a separate physical item');
    assert.equal(model.snapshot().candidates.find(card=>card.name===token.name).inventoryOrigin.count,5);
    const mixed=parse([row('General 1',gear.name,10),row('General 1-Slot1',bag.name,11),row('General 1-Slot1-Slot2',token.name,12)]);
    assert.equal(mixed.inventory.length,3);assert.equal(mixed.inventory[0].augments,undefined,'A nested child-container tree is not flattened into sockets');
    const stack=parse([row('General 1',gear.name,10),row('General 1-Slot1',token.name,12,5)]);assert.equal(stack.inventory.length,2,'Stacked ordinary contents do not become gear sockets');
}
{
    const worn=labels.map((label,index)=>index===0?row(label,bag.name,1):row(label));worn.splice(1,0,row('Any Slot-Slot7',rune.name+' (Exaltation)',2));
    const parsed=parse([],worn);assert.equal(parsed.equipment[0].contentsSeparate,'container');assert.equal(parsed.equipment[0].augments,undefined);assert.equal(parsed.inventory.length,1,'A known container overrides an Any Slot root');
    const empty=parse([row('General 1',gear.name,1),row('General 1-Slot10')]);assert.equal(empty.inventory[0].augmentSlots,1);assert.equal(empty.inventory[0].augments[0].sourceSlot,10);
    const model=createCharacterModel({storage:null});assert(model.applyInventoryExport(empty,{resolveItem}).ok);const before=model.snapshot();
    const overflow=parse([row('General 1',gear.name,1),...Array.from({length:9},(_,index)=>row('General 1-Slot'+(index+1)))]);
    const failed=model.applyInventoryExport(overflow,{resolveItem});assert.equal(failed.ok,false);assert.match(failed.error,/Synthetic Stored Gear at General 1.*maximum 8/);assert.deepEqual(model.snapshot(),before,'Genuine socket overflow stays atomic instead of truncating');
}
{
    const storage=memory(),model=createCharacterModel({storage}),parsed=parse([row('General 1',bag.name,1),row('General 1-Slot2',rune.name+' (Exaltation) +3',2)]);
    assert(model.applyInventoryExport(parsed,{resolveItem}).ok);const loose=model.snapshot().candidates.find(card=>card.itemRole==='exaltation'),id=loose.id;
    assert.equal(model.setTierPreview(id,{tier:4}).ok,true);assert.equal(characterEquipmentEligibility(model.snapshot().candidates.find(card=>card.id===id)).known,true,'Editing a non-equippable known socket item cannot discard its identity');
    assert(model.reconcileCatalog(card=>({status:'exact',...resolveInventoryCatalog(pack,card.name)})).ok);
    const duplicate=model.duplicateCandidate(id).candidate;assert.equal(duplicate.inventoryOrigin,null);assert.equal(duplicate.itemRole,'exaltation');assert.equal(characterEquipmentEligibility(duplicate).canEquip,false,'Role survives duplication after provenance is cleared');
    const restarted=createCharacterModel({storage});assert.equal(characterEquipmentEligibility(restarted.snapshot().candidates.find(card=>card.id===id)).canEquip,false);assert.equal(characterEquipmentEligibility(restarted.snapshot().candidates.find(card=>card.id===duplicate.id)).known,true);
    const manual=restarted.intake({name:rune.name,slots:['HEAD']},{wikiItem:rune}).candidate;assert.equal(characterEquipmentEligibility(manual).canEquip,true,'An ordinary manually selected base item remains equipment');
    assert(restarted.applyInventoryExport(parsed,{resolveItem}).ok);assert.equal(restarted.snapshot().candidates.find(card=>card.inventoryOrigin?.group==='augment').id,id,'Reimport reuses the same physical loose Exaltation');
    // Reconstruct an old, <=8-child bag misclassification in private model state.
    const polluted=structuredClone(restarted.snapshot()),parent=polluted.candidates.find(card=>card.name===bag.name),savedLoose=polluted.candidates.find(card=>card.id===id);
    const raw=parsed.inventory.find(entry=>entry.group==='augment');savedLoose.itemRole='';savedLoose.inventoryOrigin.group='inventory';savedLoose.inventoryOrigin.key=JSON.stringify(['inventory',raw.location,raw.itemId,raw.tier,0]);
    parent.augmentSlots=3;parent.augmentStatus='included';parent.augments=[{index:0,name:rune.name,stats:{},inventoryOrigin:{...savedLoose.inventoryOrigin,key:'old-attached-socket'}},{index:2,name:'Synthetic Manual Socket',stats:{HP:3}}];
    storage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(polluted));const repaired=createCharacterModel({storage});assert(repaired.applyInventoryExport(parsed,{resolveItem}).ok);
    const after=repaired.snapshot(),fixed=after.candidates.find(card=>card.id===parent.id);assert.deepEqual(fixed.augments.map(augment=>augment.name),['Synthetic Manual Socket'],'Only export-origin fake sockets are removed; deliberate manual data survives');
    assert.equal(after.candidates.filter(card=>card.inventoryOrigin?.location===raw.location).length,1,'Changing the old ordinary binding to an Exaltation role creates no duplicate card');
    assert.equal(after.candidates.find(card=>card.inventoryOrigin?.location===raw.location).id,id);assert(after.candidates.some(card=>card.id===manual.id));
    storage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(polluted));const emptyRepair=createCharacterModel({storage});assert(emptyRepair.applyInventoryExport(parse([row('General 1',bag.name,1)]),{resolveItem}).ok);assert.deepEqual(emptyRepair.snapshot().candidates.find(card=>card.id===parent.id).augments.map(augment=>augment.name),['Synthetic Manual Socket'],'A newly empty known container also retires its old export-derived sockets');
    storage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(after));
    const prior=after,priorDisk=storage.getItem(CHARACTER_STORAGE_KEY),broken=structuredClone(parsed);broken.inventory[0].augmentSlots=1;broken.inventory[0].augments=[];
    assert.equal(repaired.applyInventoryExport(broken,{resolveItem}).ok,false);assert.deepEqual(repaired.snapshot(),prior);assert.equal(storage.getItem(CHARACTER_STORAGE_KEY),priorDisk);
}
for(const parentKnown of [true,false]){
    const storage=memory(),model=createCharacterModel({storage}),old=parse([row('General 1',bag.name,1),row('General 1-Slot7',rune.name+' (Exaltation)',2)]);
    assert(model.applyInventoryExport(old,{resolveItem}).ok);const state=model.snapshot(),parent=state.candidates.find(card=>card.name===bag.name);
    parent.augments=[{index:0,name:rune.name,stats:{},inventoryOrigin:state.candidates.find(card=>card.itemRole==='exaltation').inventoryOrigin}];parent.augmentSlots=1;parent.augmentStatus='included';
    storage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(state));
    const local={...pack,items:pack.items.filter(item=>item!==bag),wikiEntities:{items:parentKnown?[bag.name]:[],npcs:[],titles:[]}},parsed=parseInventoryExport(text([row('General 1',bag.name,1),row('General 1-Slot7',rune.name+' (Exaltation)',2)]),{classifyParent:entry=>inventoryParentKind(local,entry)});
    assert.equal(parsed.inventory[0].contentsSeparate,'unverified','Unknown parent relationships are explicitly separate, without calling them containers');
    const fresh=createCharacterModel({storage});assert(fresh.applyInventoryExport(parsed,{resolveItem:entry=>resolveInventoryCatalog(local,entry.baseName,{socket:entry.group==='augment'})}).ok);
    const retired=fresh.snapshot().candidates.find(card=>card.id===parent.id);assert.equal(retired.augments.length,0,'Fresh separate contents retire stale export sockets even when the parent is presence-only or missing');
    assert.equal(retired.augmentStatus,'unknown');assert.equal(retired.emptyAugmentSlots,null);assert.equal(retired.augmentSlots,5,'An unverified relationship resets old export counts to the existing unverified default');
    assert.equal(fresh.snapshot().candidates.filter(card=>card.inventoryOrigin?.location==='General 1-Slot7').length,1);
    parent.editedFields.push('augmentSlots');parent.augmentSlots=4;storage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(state));const manualCapacity=createCharacterModel({storage});assert(manualCapacity.applyInventoryExport(parsed,{resolveItem:entry=>resolveInventoryCatalog(local,entry.baseName,{socket:entry.group==='augment'})}).ok);const retained=manualCapacity.snapshot().candidates.find(card=>card.id===parent.id);assert.equal(retained.augmentSlots,4);assert.equal(retained.augmentStatus,'unknown','A deliberately edited capacity is retained without promoting it to proven presence');
}
{
    const storage=memory(),model=createCharacterModel({storage}),parsed=parse([row('General 1',bag.name,1),row('General 1-Slot7',rune.name+' (Exaltation) +2',2)]);
    assert(model.applyInventoryExport(parsed,{resolveItem}).ok);const legacy=model.snapshot(),loose=legacy.candidates.find(card=>card.itemRole==='exaltation');loose.itemRole='';loose.inventoryOrigin.group='inventory';loose.inventoryOrigin.key=JSON.stringify(['inventory',loose.inventoryOrigin.location,loose.inventoryOrigin.itemId,loose.inventoryOrigin.tier,0]);
    assert.equal(characterEquipmentEligibility(loose).known,true);assert.equal(characterEquipmentEligibility(loose).canEquip,false,'Valid legacy storage provenance and its explicit suffix already establish the Exaltation role');
    storage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(legacy));const missing=createCharacterModel({storage});assert(missing.applyInventoryExport(parsed,{resolveItem:()=>null}).ok);assert.equal(missing.snapshot().candidates.find(card=>card.id===loose.id).catalogIdentity,null);
    assert(missing.reconcileCatalog(card=>({status:'exact',...resolveInventoryCatalog(pack,card.name)})).ok);const returned=missing.snapshot().candidates.find(card=>card.id===loose.id);assert.equal(characterEquipmentEligibility(returned).known,true);assert.equal(characterEquipmentEligibility(returned).canEquip,false,'Returning base metadata cannot turn a legacy rejected loose Exaltation into equipment');
    const copy=missing.duplicateCandidate(loose.id).candidate;assert.equal(copy.inventoryOrigin,null);assert.equal(copy.itemRole,'exaltation');assert.equal(characterEquipmentEligibility(copy).canEquip,false);
    const restarted=createCharacterModel({storage});for(const id of [loose.id,copy.id]){const card=restarted.snapshot().candidates.find(card=>card.id===id);assert.equal(characterEquipmentEligibility(card).known,true);assert.equal(characterEquipmentEligibility(card).canEquip,false);assert.match(characterItemLabel(card),/\(Exaltation\) \+2$/);}
}
console.log('Inventory parents: exact catalog gear/container classification, loose/nested bags, explicit empty/sparse sockets, ornaments, overflow rollback, durable loose Exaltation roles and legacy reimport repair passed.');
