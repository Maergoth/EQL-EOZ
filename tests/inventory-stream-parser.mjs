import assert from 'node:assert/strict';
import {createInventoryStreamParser,INVENTORY_STREAM_LIMITS} from '../app/inventory-stream-parser.js';
import {parseInventoryExport} from '../app/inventory-export.js';

const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Ammo','Any Slot'];
const header='Location\tName\tID\tCount\tSlots';
const worn=labels.map((label,index)=>`${label}\t${index===2?'Synthetic 雪 Cap +3':'Empty'}\t${index===2?101:0}\t${index===2?1:0}\t0`);
const source=[header,...worn,'General 1\tSynthetic Bag\t500\t1\t20','General 1-Slot2\tSynthetic Loose (Exaltation) +2\t501\t1\t0','Personal-Depot20001\tSynthetic Stack\t600\t900000\t0','','KeyRing\tName\tID\t','Equipment\tSynthetic Ring +10\t700','Augmentation\tSynthetic Augment\t701'].join('\r\n');
function stream(text,width){const rows=[],parser=createInventoryStreamParser({onRow:row=>rows.push(row)});for(let start=0;start<text.length;start+=width)assert.deepEqual(parser.write(text.slice(start,start+width)),[]);const done=parser.finish();rows.push(...done.rows);return {rows,summary:done.summary};}
for(const width of [1,2,3,13,4096,65536]){
    const actual=stream('\uFEFF'+source,width),old=parseInventoryExport(source);
    assert.equal(actual.summary.rowCount,old.rowCount);assert.equal(actual.summary.emptyEquipmentCount,old.emptyEquipmentCount);
    assert.equal(actual.summary.equipmentSlotCount,23);assert.equal(actual.summary.keyringSeen,true);
    assert.deepEqual(actual.rows.filter(row=>row.group==='equipment').map(({location,name,baseName,tier,itemId,count,empty,slot})=>({location,name,baseName,tier,itemId,count,empty,slot})),old.equipment.map(row=>({location:row.location,name:row.name,baseName:row.baseName,tier:row.tier,itemId:row.itemId,count:row.count,empty:row.empty,slot:row.slot})));
    assert.deepEqual(actual.rows.map(row=>row.ordinal),actual.rows.map((_,index)=>index));
    assert.equal(actual.rows.find(row=>row.location==='General 1-Slot2').sourceSlot,2);
    assert.equal(actual.rows.find(row=>row.location==='General 1-Slot2').parentLocation,'General 1');
    assert.equal(actual.rows.filter(row=>row.location==='Any Slot')[1].rootOccurrence,1);
}
// Decoding is incremental as well: split in the middle of UTF-8 and UTF-16
// code units, including the BOM. Invalid byte sequences fail at the decoder.
for(const [encoding,bytes]of [['utf-8',Buffer.from('\uFEFF'+source)],['utf-16le',Buffer.from('\uFEFF'+source,'utf16le')]]){
    const decoder=new TextDecoder(encoding,{fatal:true}),parser=createInventoryStreamParser(),rows=[];
    for(const byte of bytes)rows.push(...parser.push(decoder.decode(Uint8Array.of(byte),{stream:true})));
    rows.push(...parser.write(decoder.decode()));rows.push(...parser.finish().rows);
    assert.equal(rows.find(row=>row.slot==='head').baseName,'Synthetic 雪 Cap');
}
assert.throws(()=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.of(0xff)),/encoded data|encoding/iu);
const repeated=[header,...labels.flatMap((label,index)=>[`${label}\tSynthetic Worn ${index}\t${index+1}\t1\t0`,`${label}-Slot7\tSynthetic Socket\t999\t1\t0`])].join('\n');
const roots=stream(repeated,29).rows.filter(row=>row.parentLocation==='Ear');
assert.deepEqual(roots.map(row=>[row.rootOccurrence,row.sourceSlot]),[[0,7],[1,7]],'Repeated worn labels retain their physical root occurrence');

const parser=createInventoryStreamParser({onRow:()=>{}});parser.write(header+'\n'+worn.join('\n')+'\n');
for(let start=0;start<30000;start+=500){const batch=Array.from({length:500},(_,index)=>`General ${start+index+1}\tSynthetic Copy\t800\t1\t0`).join('\n')+'\n';assert.deepEqual(parser.write(batch),[]);}
assert.equal(parser.finish().summary.rowCount,30023,'Neither 1000 cards nor 20000 rows truncates a stream');
for(const invalid of [header+'\n'+worn.slice(1).join('\n'),header+'\n'+[...worn,'Head\tEmpty\t0\t0\t0'].join('\n'),header+'\nHead-Slot1\tSynthetic\t1\t1\t0',header+'\n'+worn.join('\n')+'\n\nGeneral 1\tSynthetic\t1\t1\t0',header+'\n'+worn.join('\n')+'\n\nKeyRing\tName\tID\nKeyRing\tName\tID']){
    assert.throws(()=>stream(invalid,37),/Inventory export/);
}
const oversized=createInventoryStreamParser();assert.throws(()=>oversized.write('x'.repeat(INVENTORY_STREAM_LIMITS.chunkCharacters+1)),/bounded/);assert.throws(()=>oversized.finish(),/failed/);
assert.throws(()=>stream(header+'\n'+'x'.repeat(4097),9),/oversized line/);
assert.throws(()=>stream(header+'\n'+worn.join('\n')+'\nGeneral 1\tBad\u0000Name\t1\t1\t0',5),/invalid characters/);
const once=createInventoryStreamParser();once.write(header+'\n'+worn.join('\n'));once.finish();assert.throws(()=>once.finish(),/already finished/);
console.log('Streaming inventory syntax: bounded chunks/lines, UTF-8/16 splits, exact worn roots and >30000 rows passed.');
