import assert from 'node:assert/strict';
import {parseScreenRead,screenReadRefinementRegions} from '../app/screen-read-parser.js';

// Synthetic Default Modern cell geometry, with independent fictional values.
// No player screenshot, recognized word map or private character data is used.
const word=(text,x,y,width=60,height=12,confidence=97)=>({text,confidence,bbox:{x0:x,y0:y,x1:x+width,y1:y+height}});
const left=100,right=281,attributes=[['Strength','str',123],['Stamina','sta',124],['Intelligence','int',125],['Wisdom','wis',126],['Agility','agi',127],['Dexterity','dex',128],['Charisma','cha',129]],resists=[['Magic','resistMagic',131],['Fire','resistFire',132],['Cold','resistCold',133],['Disease','resistDisease',134],['Poison','resistPoison',135],['Void','resistCorruption',136]];
const headings=[word('Inventory',230,20,80),word('Character',left,60,58),word('Vitals',left+65,60,36),word('Stats',right,60,35),word('and',right+40,60,20),word('Resists',right+65,60,45)];
const rows=[...attributes.map(([name,key,value],index)=>({key,value,y:90+index*20,words:[word(name,right,90+index*20,65),word(value+'/789',right+84,90+index*20,56)]})),...resists.map(([name,key,value],index)=>({key,value,y:230+index*20,words:[word('SV.',right,230+index*20,20),word(name,right+25,230+index*20,50),word(value+'/987',right+111,230+index*20,57)]}))];
const vitals=[word('HP',left,90,20),word('352/789',left+100,90,60),word('Mana',left,110,35),word('263/678',left+100,110,60),word('End',left,130,25),word('174/567',left+100,130,60),word('AC',left,150,20),word('113/79',left+67,150,48),word('|211',left+123,150,32),word('Attack',left,170,42),word('317/419',left+92,170,66)];
const scene={text:'Synthetic compact Modern stat pane',confidence:92,words:[...headings,...vitals,...rows.flatMap(row=>row.words)]};
const plan=screenReadRefinementRegions({...scene,characterOnly:true}),tiles=plan.flatMap(pass=>pass.tiles);
assert.deepEqual(plan.map(pass=>pass.role),['character-stats','character-stats']);assert.deepEqual(plan.map(pass=>pass.tiles.length),[4,3]);
assert.deepEqual(tiles.map(tile=>tile.column),['modern-attributes','modern-resists','modern-acMitigation','modern-acMitigationSoftcap','modern-acEvasion','modern-attackOffense','modern-attackAccuracy']);
assert.equal(plan[0].scale,6);assert.equal(plan[1].scale,3);assert(plan.every(pass=>pass.layout==='sparse'));
assert.equal(tiles[0].x,right);assert.equal(tiles[0].width,102);assert.equal(tiles[1].x,right+96);assert.equal(tiles[1].width,35);
assert.deepEqual(tiles.slice(2).map(tile=>tile.scale),[3,3,3,3,3]);
assert(tiles[4].sourceGuard&&tiles[6].sourceGuard,'Full right widgets remain guarded before excluding observed neighboring labels');
const componentValues={acMitigation:113,acMitigationSoftcap:79,acEvasion:211,attackOffense:317,attackAccuracy:419};
const columnWords=()=>[...rows.map(row=>({...word(String(row.value),right+(row.key.startsWith('resist')?113:84),row.y,18,12,97),column:row.key.startsWith('resist')?'modern-resists':'modern-attributes'})),
    ...attributes.map(([name],index)=>({...word(name,right,90+index*20,65),column:'modern-attributes'})),
    ...Object.entries(componentValues).map(([key,value])=>({...word(String(value),left+({acMitigation:65,acMitigationSoftcap:94,acEvasion:129,attackOffense:101,attackAccuracy:129}[key]),key.startsWith('ac')?150:170,18),column:'modern-'+key}))];
const physical=tile=>({...tile,x:Math.floor(tile.x),y:Math.floor(tile.y),width:Math.ceil(tile.x+tile.width)-Math.floor(tile.x),height:Math.ceil(tile.y+tile.height)-Math.floor(tile.y),...(tile.sourceGuard?{sourceGuard:{...tile.sourceGuard,x:Math.floor(tile.sourceGuard.x),y:Math.floor(tile.sourceGuard.y),width:Math.ceil(tile.sourceGuard.x+tile.sourceGuard.width)-Math.floor(tile.sourceGuard.x),height:Math.ceil(tile.sourceGuard.y+tile.sourceGuard.height)-Math.floor(tile.sourceGuard.y)},guardVerified:true}:{})});
const read=(input,words=columnWords(),executed=tiles.map(physical))=>parseScreenRead({...input,owner:'character',refinements:plan.map(pass=>({role:'character-stats',confidence:97,words:words.filter(word=>pass.tiles.some(tile=>tile.column===word.column)),tiles:executed.filter(tile=>pass.tiles.some(target=>target.column===tile.column)),text:'Independent synthetic physical numeric widgets'}))}).find(record=>record.subject.kind==='character');
const fields=record=>Object.fromEntries(record.fields.map(entry=>[entry.key,entry.value]));
const full=fields(read(scene));for(const {key,value} of rows)assert.equal(full[key],value,key);
for(const [key,value]of Object.entries({...componentValues,hpCurrent:352,hpMaximum:789,manaCurrent:263,manaMaximum:678,enduranceCurrent:174,enduranceMaximum:567}))assert.equal(full[key],value,key);
const damaged={...scene,words:scene.words.map(entry=>entry.text==='131/987'?{...entry,text:'1317987',confidence:0}:entry.text==='113/79'?{...entry,text:'113179',confidence:70}:entry.text==='317/419'?{...entry,text:'3171419',confidence:20}:entry)};
const repaired=fields(read(damaged));for(const {key,value}of rows)assert.equal(repaired[key],value,'Independently cropped '+key);
for(const [key,value]of Object.entries(componentValues))assert.equal(repaired[key],value,'Separate native EQType '+key);
assert.equal(fields(read(damaged,[])).acMitigation,undefined,'A remaining divider cannot certify concatenated baseline AC digits');
assert.equal(fields(read(scene,[])).resistMagic,undefined,'Executed lost glyphs erase only that crop\'s baseline proposal');
assert.equal(fields(read(scene,[],[])).resistMagic,131,'A planned but unexecuted crop cannot own a field');
const firstOnly=fields(read(damaged,columnWords(),plan[0].tiles.map(physical)));assert.equal(firstOnly.acMitigation,113);assert.equal(firstOnly.acMitigationSoftcap,79);assert.equal(firstOnly.resistMagic,131,'A later pass cannot erase earlier pass fields');
const weak=columnWords().map(entry=>entry.column==='modern-resists'?{...entry,confidence:94}:entry);
assert.equal(fields(read(damaged,weak)).resistMagic,undefined,'Resists retain the95 confidence floor');
const reliableConflict={...scene,words:scene.words.map(entry=>entry.text==='131/987'?{...entry,text:'137/987'}:entry)};
assert.equal(fields(read(reliableConflict)).resistMagic,undefined,'Reliable conflicting observations remain unknown');
const clipped=tiles.map(tile=>({...physical(tile),edgeClipped:tile.column.startsWith('modern-ac')||tile.column.startsWith('modern-attack')}));
for(const key of Object.keys(componentValues))assert.equal(fields(read(scene,columnWords(),clipped))[key],undefined,'Source-edge ink prevents certifying '+key);
const truncated=columnWords().map(entry=>entry.column==='modern-attackAccuracy'?{...entry,text:'21'}:entry);
assert.equal(fields(read(damaged,truncated,clipped)).attackAccuracy,undefined,'A clipped whole leading glyph cannot turn a high-confidence fragment into a value');
const deniedGuard=tiles.map(tile=>({...physical(tile),...(tile.sourceGuard?{guardVerified:false}:{})}));
assert.equal(fields(read(scene,columnWords(),deniedGuard)).acEvasion,undefined,'A failed full-extent guard owns but rejects the earlier value');
const forgedGuard=tiles.map(tile=>({...physical(tile),...(tile.sourceGuard?{sourceGuard:{...physical(tile).sourceGuard,x:tile.sourceGuard.x+20}}:{})}));
assert.equal(fields(read(scene,columnWords(),forgedGuard)).acEvasion,undefined,'An inconsistent full source footprint cannot certify the cropped widget');
for(const alter of [guard=>({...guard,clipped:true}),guard=>({...guard,minimumGap:guard.minimumGap/2}),guard=>({...guard,x:guard.x+.5}),guard=>({...guard,neighbor:{...guard.neighbor,x0:guard.neighbor.x0+.5}}),guard=>({...guard,neighbor:{...guard.neighbor,x1:guard.neighbor.x1-.5}})]){
    const inconsistent=tiles.map(tile=>({...physical(tile),...(tile.sourceGuard?{sourceGuard:alter(physical(tile).sourceGuard)}:{})}));
    assert.equal(fields(read(scene,columnWords(),inconsistent)).acEvasion,undefined,'Full extent, outward neighbor and nonweaker gap proofs are mandatory');
}
const mixedTags=columnWords().map(entry=>entry.column==='modern-attackAccuracy'?{...entry,component:'attackAccuracy'}:entry);
assert.equal(fields(read(scene,mixedTags,deniedGuard)).attackAccuracy,undefined,'A mixed legacy component tag cannot bypass new widget guards');
const noNeighbor={...scene,words:scene.words.map(entry=>attributes.some(([name])=>entry.text===name)?{...entry,confidence:0}:entry)},unproven=screenReadRefinementRegions({...noNeighbor,characterOnly:true}).flatMap(pass=>pass.tiles);
assert(unproven.filter(tile=>['modern-acEvasion','modern-attackAccuracy'].includes(tile.column)).every(tile=>tile.sourceGuardUnproven===true));
const noNeighborFields=fields(read(noNeighbor,columnWords(),unproven.map(physical)));assert.equal(noNeighborFields.acEvasion,undefined);assert.equal(noNeighborFields.attackAccuracy,undefined,'Missing positive neighbors cannot admit adjacent ink');
for(const text of ['113/79','113179|211','113 extra','9007199254740993','9'.repeat(400),'1,,2','1,23']){
    const invalid=columnWords().map(entry=>entry.column==='modern-acMitigation'?{...entry,text}:entry);
    assert.equal(fields(read(damaged,invalid)).acMitigation,undefined,'An isolated physical widget accepts only one literal safe integer');
}
for(const confidence of [undefined,NaN,Infinity,84]){
    const invalid=columnWords().map(entry=>entry.column==='modern-acMitigation'?{...entry,confidence}:entry);
    assert.equal(fields(read(damaged,invalid)).acMitigation,undefined,'Missing/nonfinite/low numeric confidence is unknown');
}
const wrongRow=columnWords().map(entry=>entry.column==='modern-resists'?{...entry,bbox:{...entry.bbox,y0:entry.bbox.y0+9,y1:entry.bbox.y1+9}}:entry);
assert.equal(fields(read(damaged,wrongRow)).resistMagic,undefined,'A neighboring row cannot be borrowed');
assert.equal(fields(read(damaged,[...columnWords(),{...word('1',right+128,230,2),column:'modern-resists'}])).resistMagic,undefined,'An extra cell glyph is not discarded');
const signedScene={...damaged,words:damaged.words.map(entry=>entry.text==='123/789'?{...entry,confidence:0}:entry)},signed=columnWords().map(entry=>entry.text==='131'?{...entry,text:'0'}:entry.text==='123'?{...entry,text:'-4'}:entry);
assert.equal(fields(read(signedScene,signed)).resistMagic,0);assert.equal(fields(read(signedScene,signed)).str,-4);
assert.equal(fields(read(scene,[],tiles.map(tile=>({...physical(tile),x:tile.x+50})))).resistMagic,131,'Invalid executed coordinates cannot claim baseline authority');
const second=headings.map(entry=>({...entry,bbox:{...entry.bbox,x0:entry.bbox.x0+600,x1:entry.bbox.x1+600}}));
assert.equal(parseScreenRead({...scene,words:[...scene.words,...second],owner:'character'}).length,0,'Two Modern panes never share cells');
assert.equal(parseScreenRead({...scene,words:[...scene.words,word('Stats',right+100,60,35)],owner:'character'}).length,0,'Competing right headings remain ambiguous');
const offset={...scene,words:scene.words.map(entry=>({...entry,bbox:{x0:entry.bbox.x0*2+500,y0:entry.bbox.y0*2+300,x1:entry.bbox.x1*2+500,y1:entry.bbox.y1*2+300}}))};
const moved=screenReadRefinementRegions({...offset,characterOnly:true});assert.deepEqual(moved.map(pass=>pass.tiles.length),[4,3]);assert.equal(moved[0].tiles[0].x,right*2+500);assert.equal(moved[0].tiles[0].width,204);
console.log('Modern physical widgets: seven bounded source crops in two refinements, exact native field ownership, independent caps, edge/full-extent/confidence/integer guards and mixed-client isolation passed.');
