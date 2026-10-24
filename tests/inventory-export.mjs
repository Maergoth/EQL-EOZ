import assert from 'node:assert/strict';
import parseInventoryExport,{parseInventoryExport as namedParser} from '../app/inventory-export.js';

// Entirely synthetic. Never copy a player's export or character data here.
const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Any Slot','Ammo'];
const row=(location,name='Empty',id=0,count=0,slots=0)=>[location,name,id,count,slots].join('\t');
const worn=()=>labels.map(label=>row(label));
const exportText=(equipment=worn(),storage=[],keyring=null)=>['Location\tName\tID\tCount\tSlots',...equipment,...storage,...(keyring===null?[]:['','KeyRing\tName\tID\t',...keyring])].join('\r\n')+'\r\n';
assert.equal(namedParser,parseInventoryExport);
const empty=parseInventoryExport(exportText());
assert.equal(empty.kind,'eql-inventory-export');assert.equal(empty.schemaVersion,1);assert.equal(empty.rowCount,23);assert.equal(empty.equipmentSlotCount,23);assert.equal(empty.emptyEquipmentCount,23);
assert.equal(empty.equipment.filter(item=>item.empty).length,23);assert.equal(new Set(empty.equipment.map(item=>item.slot)).size,23);
for(const [label,slots] of Object.entries({'Any Slot':['any1','any2'],Ear:['ear1','ear2'],Wrist:['wrist1','wrist2'],Fingers:['finger1','finger2']}))assert.deepEqual(empty.equipment.filter(item=>item.location===label).map(item=>item.slot),slots);
assert(!empty.equipment.some(item=>['charm','power'].includes(item.slot)));

const gear=worn();gear[1]=row('Ear','Synthetic Ear Stone +4',200,1,11);gear[4]=row('Ear','Synthetic Ear Stone +4',200,1,11);gear[13]=row('Primary','Synthetic Long Blade +10',201,1,11);
const parsed=parseInventoryExport(exportText(gear,[row('General 1','Synthetic Bag',300,1,8),row('General 1-Slot1','Synthetic Token +2',301,7,11),row('General 1-Slot2','Synthetic Token +2',301,1,11),row('General 1-Slot3'),row('General 1-Slot1-Slot1','Synthetic Inner Item',302,1,11),row('Bank1','Synthetic Bank Item',303,1,11),row('SharedBank1','Synthetic Shared Item',304,1,11),row('Held','Synthetic Held Item',305,1,11),row('Primary-Slot1','Synthetic Socket Item +3',306,1,11)],['Equipment\tSynthetic Keyring Sword +5\t400','Equipment\tSynthetic Keyring Sword +5\t400','Augmentation\tSynthetic Keyring Stone\t401']));
assert.equal(parsed.emptyEquipmentCount,20);assert.equal(parsed.equipment.find(item=>item.slot==='ear1').itemId,200);assert.equal(parsed.equipment.find(item=>item.slot==='ear2').itemId,200);
assert.deepEqual(parsed.equipment.find(item=>item.slot==='primary'),{slot:'primary',location:'Primary',name:'Synthetic Long Blade +10',baseName:'Synthetic Long Blade',tier:10,itemId:201,count:1,empty:false,augmentSlots:1,augments:[{index:0,sourceSlot:1,location:'Primary-Slot1',name:'Synthetic Socket Item +3',baseName:'Synthetic Socket Item',tier:3,itemId:306,count:1,empty:false}]});
assert.equal(parsed.inventory.length,7);assert.deepEqual(parsed.inventory.map(item=>item.group),['inventory','inventory','inventory','inventory','bank','shared-bank','held']);
assert.equal(parsed.inventory[1].count,7);assert.equal(parsed.inventory[1].baseName,'Synthetic Token');assert.equal(parsed.inventory[1].tier,2);assert.equal(parsed.inventory[2].count,1);
assert.equal(parsed.inventory[3].location,'General 1-Slot1-Slot1');assert.equal(parsed.inventory[3].group,'inventory','Nested bag locations cannot establish a parent augment relationship');
assert.equal(parsed.keyring.length,3);assert.equal(parsed.keyring[0].location,'Equipment');assert.equal(parsed.keyring[0].group,'keyring');assert.equal(parsed.keyring[0].tier,5);assert.equal(parsed.keyring[2].group,'augment');
assert(!parsed.equipment.some(item=>item.itemId===400),'KeyRing Equipment never becomes worn gear');
assert.equal(parsed.warnings.length,0);
for(const item of [...parsed.equipment,...parsed.inventory,...parsed.keyring].filter(item=>item.slot!=='primary'))assert(!Object.hasOwn(item,'augmentSlots')&&!Object.hasOwn(item,'parentId')&&!Object.hasOwn(item,'slots'),'Ambiguous Slots column never becomes socket capacity or a parent');
assert.equal(parsed.rowCount,23+9+3);

for(const [name,baseName,tier] of [['Synthetic Zero +0','Synthetic Zero',0],['Synthetic Base','Synthetic Base',0],['Synthetic Invalid +11','Synthetic Invalid +11',0],['Synthetic Fraction +4.5','Synthetic Fraction +4.5',0],['Synthetic Literal+5','Synthetic Literal+5',0],['Synthetic Repeated +5 +5','Synthetic Repeated +5',5]]){
    const withName=worn();withName[2]=row('Head',name,500,1,11);const item=parseInventoryExport(exportText(withName)).equipment.find(item=>item.slot==='head');assert.equal(item.name,name);assert.equal(item.baseName,baseName);assert.equal(item.tier,tier);
}
assert.equal(parseInventoryExport('\uFEFF'+exportText()).equipment.length,23,'UTF-8 BOM is accepted');
assert.equal(parseInventoryExport(exportText().replace(/\r\n/g,'\n')).equipment.length,23,'LF and CRLF exports agree');
assert.equal(parseInventoryExport(exportText(worn(),[],[])).keyring.length,0,'An empty KeyRing is valid');

const socketGear=worn().flatMap((value,index)=>{
    if(index===1)return [row('Ear','Synthetic Ear Stone +4',200,1,11),row('Ear-Slot7','Synthetic Ear Stone (Exaltation)',200,1,11),row('Ear-Slot10')];
    if(index===4)return [row('Ear','Synthetic Ear Stone +5',200,1,11),row('Ear-Slot7'),row('Ear-Slot10','Synthetic Alternate (Exaltation)',201,1,11)];
    return [value];
});
const socketResult=parseInventoryExport(exportText(socketGear,[row('General 1','Synthetic Bag',300,1,8),row('General 1-Slot1','Synthetic Stored Blade',301,1,11),row('General 1-Slot1-Slot2'),row('General 1-Slot1-Slot7','Synthetic Stored Rune (Exaltation)',302,1,11)]));
const ears=socketResult.equipment.filter(item=>item.location==='Ear');assert.deepEqual(ears.map(item=>item.tier),[4,5]);assert.deepEqual(ears.map(item=>item.augmentSlots),[2,2]);
assert.equal(ears[0].augments[0].itemId,200);assert.equal(ears[0].augments[1].empty,true);assert.equal(ears[1].augments[0].empty,true);assert.equal(ears[1].augments[1].itemId,201);
assert.deepEqual(ears[0].augments.map(item=>[item.index,item.sourceSlot]),[[0,7],[1,10]],'Dense UI indices do not overwrite the source socket positions');
assert.equal(socketResult.inventory.length,2,'Attached Exaltations and explicit socket empties do not become loose inventory copies');
assert.equal(socketResult.inventory[1].augmentSlots,2);assert.deepEqual(socketResult.inventory[1].augments.map(item=>item.sourceSlot),[2,7]);
const manySockets=worn().flatMap((value,index)=>index===2?[row('Head','Synthetic Many Sockets',500,1,11),...Array.from({length:9},(_,n)=>row(`Head-Slot${n+1}`))]:[value]);
assert.equal(parseInventoryExport(exportText(manySockets)).equipment.find(item=>item.slot==='head').augments.length,9,'Observed sockets beyond a UI cap must never be silently truncated');

const rejects=[
    null,{},'','Location,Name,ID,Count,Slots\n',exportText(worn().slice(0,-1)),exportText([...worn(),row('Head')]),
    exportText(worn().map((value,index)=>index===0?row('Charm'):value)),exportText(worn(),['General 1\tCutoff']),
    exportText(worn(),[row('General 1','Synthetic Item','3e2',1,11)]),exportText(worn(),[row('General 1','Synthetic Item',3,1.5,11)]),
    exportText(worn(),[row('General 1','Synthetic Item',3,1,'unknown')]),exportText(worn(),[row('General 1','Synthetic Item',-1,1,11)]),
    exportText(worn(),[row('General 1','Synthetic Item',3,0,11)]),exportText(worn(),[row('General 1','Synthetic Item',0,0,11)]),
    exportText(worn(),[row('General 1','Empty',3,1,11)]),exportText(worn(),[row('General 1','Empty',0,1,0)]),
    exportText(worn(),[row('General 1','Synthetic Item',2147483648,1,11)]),exportText(worn(),[row('General 1','Synthetic Item',3,1000000001,11)]),
    exportText(worn(),[row('General 1','Synthetic Item',3,1,1000001)]),exportText(worn(),[row('General 0','Synthetic Item',3,1,11)]),
    exportText(worn(),[row('General 1'),row('General 1')]),exportText(worn(),[row('Bank1'),row('Bank1')]),exportText(worn(),[row('General 1-Slot1','Synthetic Orphan',4,1,11)]),
    exportText(gear,[row('Ear-Slot7'),row('Ear-Slot7')]),exportText(worn(),[row('Head-Slot1','Synthetic Impossible Child',4,1,11)]),
    exportText(worn(),[],['Equipment\tSynthetic Keyring Item\tnot-an-id']),exportText(worn(),[],['Equipment\tSynthetic Keyring Item\t2\t1']),
    exportText(worn(),[],['KeyRing\tName\tID']),exportText(worn(),[],['Equipment\tSynthetic\t0']),
    exportText(worn(),[row('General 1','x'.repeat(241),1,1,11)]),exportText(worn(),[row('General 1','Synthetic\0Item',1,1,11)]),
    exportText(worn(),['',row('General 1')]),exportText()+'x'.repeat(4097),exportText()+'x'.repeat(2*1024*1024)
];
for(const input of rejects)assert.throws(()=>parseInventoryExport(input),/Inventory export/,'Malformed or partial imports must not return a committable gear list');
assert.throws(()=>parseInventoryExport(exportText(worn(),Array.from({length:20001},(_,n)=>row(`General ${n+1}`)))),/too many rows/);
console.log('Inventory export: complete 23-slot atomic parsing, private groups, ordered physical slot copies, keyring separation, explicit parented sockets/source positions, tiers/counts/IDs and bounded malformed-input rejection passed.');
