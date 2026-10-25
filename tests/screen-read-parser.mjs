import assert from 'node:assert/strict';
import {parseScreenRead,screenReadRefinementRegions,parseItemStatBlock,parseItemAugmentSlots} from '../app/screen-read-parser.js';
const text=`Item Name: Synthetic Test Blade +3\nDescription\nSynthetic Test Blade +3\nNo Trade\nClass: WAR / PAL\nRace: ALL\nSlot: PRIMARY / SECONDARY\nTier 3 / 10\nAC 12\nHP 45\nMana 20\nSTR 8\nDMG 9 Delay 24\nWeight 2.5\nRequired Level 15\nModified\nWorn Effect: Synthetic Haste\nFocus Exaltation: empty\nRune Exaltation: Synthetic Rune`;
const [item]=parseScreenRead({text,confidence:85,owner:'contribution',sessionId:'synthetic'});
const fields=Object.fromEntries(item.fields.map(field=>[field.key,field.value]));
assert.equal(item.subject.name,'Synthetic Test Blade +3');assert.equal(item.owner,'contribution');
assert.equal(fields.tier,3);assert.equal(fields.hp,45);assert.equal(fields.damage,9);assert.equal(fields.delay,24);
assert.equal(fields.requiredLevel,15);assert.equal(fields.weight,2.5);assert.equal(fields.modified,undefined,'an unchecked Modern Modified checkbox label is not a state');
assert.deepEqual(fields.slots,['PRIMARY','SECONDARY']);assert.equal(fields.augmentNames,undefined,'Intrinsic Exaltations are effects, not socketed items');assert(fields.effects.includes('Rune Exaltation: Synthetic Rune'));
assert.equal(fields.hp,45,'OCR never adds an augment or scales the displayed tier twice');
assert.equal(item.fields.find(field=>field.key==='ac').raw,'AC 12');
for(const count of [0,1,8])assert.equal(parseItemAugmentSlots(`${count} empty slots`).augmentSlotCount,count);
for(const line of ['9 empty slots','-1 empty slots','Unknown empty slots','Focus Exaltation: Synthetic Rune','2 empty slots\n3 empty slots'])assert.equal(parseItemAugmentSlots(line).augmentSlotCount,null,line);
const socketText='Item: Synthetic Socketed Boots\nClass: ALL\nSlot: Feet\nHP 100\n1 empty slots\nAugment Slot 1: Synthetic Sword +3\nProc Exaltation: Synthetic Strike';
const [socketRead]=parseScreenRead({text:socketText}),socketFields=Object.fromEntries(socketRead.fields.map(field=>[field.key,field.value]));
assert.equal(socketFields.augmentSlotCount,2);assert.equal(socketFields.emptyAugmentSlots,1);assert.deepEqual(socketFields.augments,[{index:0,name:'Synthetic Sword +3'}]);assert.equal(socketFields.augmentNames,undefined);assert(socketFields.effects.includes('Proc Exaltation: Synthetic Strike'));assert.match(socketFields.rawStatBlock,/1 empty slots/);
assert.deepEqual(parseItemAugmentSlots('Augment slots: 3\nAugment Slot 1: Same item\nAugment Slot 3: Same item').augments,[{index:0,name:'Same item'},{index:2,name:'Same item'}],'Distinct numbered copies are preserved');
assert.equal(parseItemAugmentSlots('Augment slots: 1\nAugment Slot 2: Impossible').augmentSlotCount,null);assert.equal(parseItemAugmentSlots('Augment slots: 2\nAugment Slot 1: First\nAugment Slot 1: Other').augmentSlotCount,null);
assert.equal(parseItemStatBlock('Augment Slot 1: Synthetic Haste 18\nHP 10').fields.some(field=>field.key==='haste'),false,'A socketed item title is not a parent stat');
assert.equal(parseScreenRead({text:'AC 14\nHP 45\nRune: hello'}).length,0,'unidentified text is not an item or character');
const unknown=parseScreenRead({text:'Item: Synthetic Unresolved Boots\nClass: ALL\nAC 3'})[0];
assert.equal(unknown.fields.some(field=>field.key==='tier'),false,'missing tier stays absent');
const [character]=parseScreenRead({text:'Character Stats\nHP 330/398\nMana 296/296\nAC 30/350\nSTR 90\nSTA 105\nHP Regen 3\nMana Regen 6',character:'Synthetic'});
const charFields=Object.fromEntries(character.fields.map(field=>[field.key,field.value]));
assert.equal(character.subject.kind,'character');assert.equal(charFields.hpCurrent,330);assert.equal(charFields.hpMaximum,398);
assert.equal(charFields.manaMaximum,296);assert.equal(charFields.hpRegen,3);assert.equal(charFields.str,90);
assert.equal(parseScreenRead({text:'Inventory\nAC 14'}).length,0,'incomplete UI text cannot become a full stat snapshot');
assert.equal(parseScreenRead({text:''}).length,0);
const crossRow=parseScreenRead({text:'Item: Synthetic Missing Stat\nAC\n2 Weight 0.2\nHP\n15'})[0];
assert.equal(crossRow.fields.some(field=>field.key==='ac'||field.key==='hp'),false,'a stat cannot consume the next numeric row');
assert.equal(crossRow.fields.find(field=>field.key==='weight').value,0.2);
const ambiguous=parseScreenRead({text:'Item: Synthetic Decimal Loss\nWeight 02\nAC 014'})[0];
assert.equal(ambiguous.fields.some(field=>field.key==='weight'||field.key==='ac'),false,'a leading zero may indicate a lost decimal: omit rather than invent punctuation');
for(const weight of ['3.2','3 . 2','3,2','3 , 2','0.0']){
    const read=parseScreenRead({text:`Item: Synthetic Decimal Weight\nWeight ${weight}\nHP 15`})[0];
    assert.equal(read.fields.find(field=>field.key==='weight')?.value,weight==='0.0'?0:3.2,`Observed decimal punctuation is preserved: ${weight}`);
    assert(read.evidence.text.includes(`Weight ${weight}`),'Original written OCR remains available');
}
const lostDecimal=parseScreenRead({text:'Item: Synthetic Full Examine\nWeight 32\nHP 15'})[0];
assert(!lostDecimal.fields.some(field=>field.key==='weight'),'A full examine cannot silently turn a missing decimal into32');
assert.match(lostDecimal.evidence.text,/Weight 32/);
assert.match(lostDecimal.evidence.text,/left unknown: weight/);
assert.equal(parseItemStatBlock('Weight 32').fields.find(field=>field.key==='weight').value,32,'An explicit manual correction may use a whole-number weight');
assert.equal(parseItemStatBlock('WT: 3 . 2').fields.find(field=>field.key==='weight').value,3.2,'Wiki-style weight labels preserve separated punctuation');
const word=(text,x,y,width=40,height=20,confidence=85)=>({text,bbox:{x0:x,y0:y,x1:x+width,y1:y+height},confidence});
const geometricWords=[word('Desaiption',200,100,100,20,23),word('Lore',500,103),
    word('Synthetic',185,145,80,25),word('Winding',275,145,75,25),word('Trail',360,145,40,25),word('+4',410,150,20,12),
    word('SMALL',205,220,60,30),word('AC',290,220,30,30),word('14',430,225,20,16),
    word('Noise',180,220,20,58),word('02',240,250,20,18),word('HP',290,250,30,30),word('15',430,254,20,16)];
const geometric=parseScreenRead({text:'Recognized pane text',words:geometricWords,confidence:54})[0];
assert.equal(geometric.subject.name,'Synthetic Winding Trail +4');
assert.equal(geometric.fields.find(field=>field.key==='ac').value,14,'tall noisy words cannot shift AC onto the following numeric row');
assert.equal(geometric.fields.find(field=>field.key==='hp').value,15);
assert.equal(geometric.fields.find(field=>field.key==='name').confidence,54,'low-confidence OCR remains an editable proposal');
const anchoredWords=[word('Synthetic',210,30,80),word('Winding',300,30,75),word('Trail',385,30,40),
    word('Synthetic',200,80,80),word('Winding',290,80,75),word('Trail',375,80,40),word('+4',425,84,20,12),
    word('No',200,102,20),word('Trade',230,102,45),word('Class:',200,130,50),word('ALL',260,130,30),
    word('Race:',200,155,50),word('ALL',260,155,30),word('AC',200,200,30),word('12',250,204,20,12)];
const anchored=parseScreenRead({text:'Mangled examine tab heading',words:anchoredWords,confidence:59})[0];
assert.equal(anchored.subject.name,'Synthetic Winding Trail +4','aligned class/race plus repeated observed title can recover a missing Description anchor');
assert.equal(anchored.fields.find(field=>field.key==='ac').value,12);
assert.equal(parseScreenRead({text:'Unrelated class/race chat',words:anchoredWords.filter(word=>word.bbox.y0>=80)}).length,0,'class and race alone do not identify an item name');
const refinedInput={text:'Recognized pane text',words:geometricWords.map(word=>word.text==='Trail'?{...word,text:'Traill',confidence:40}:word),confidence:54,
    refinements:[{role:'item-name',confidence:85,text:'Synthetic Winding Trail +4',words:[word('Trail',360,145,40,25,95)]},
        {role:'item-stats',confidence:80,text:'Size: SMALL AC 14\nWeight 02 HP. 15',words:[word('Size:',180,220,20,58,99)]}]};
const refined=parseScreenRead(refinedInput)[0];
assert.equal(refined.subject.name,'Synthetic Winding Trail +4');assert.match(refined.evidence.text,/Initial item name OCR: Synthetic Winding Traill/);
assert.match(refined.evidence.text,/Weight 02 HP\. 15/);assert.equal(refined.fields.find(field=>field.key==='size').value,'SMALL','a second column cannot enter the size value');
assert.equal(refined.fields.find(field=>field.key==='hp').value,15);assert.equal(refined.fields.some(field=>field.key==='weight'),false,'region OCR cannot supply a missing decimal');
const misplaced=parseScreenRead({...refinedInput,refinements:[{role:'item-name',text:'Other',confidence:95,words:[word('Wrong',900,145,40,25,99)]}]})[0];
assert.equal(misplaced.subject.name,'Synthetic Winding Traill +4','unrelated row coordinates cannot rewrite an observed name');
const percent=parseScreenRead({text:'Item: Synthetic Ambiguous Digit\nHP 1%\nAttack Speed 10%'})[0];assert.equal(percent.fields.some(field=>field.key==='hp'),false);assert.equal(percent.fields.find(field=>field.key==='attackSpeed').value,10);
// Synthetic Modern geometry: centered tabs, left labels/right numeric columns,
// three unrelated examine panes, and an Inventory pane to their RIGHT.
function modernPane(x,y,name,slot,tier,ac,hp,{augmented=false}={}){
    return [word(name+(augmented?' (Augmented)':''),x+100,y+20,320),word('Description',x+250,y+60,110),
        word('&',x+20,y+110,50,100),word(name,x+80,y+110,280),word('Class:',x+80,y+160,50),word('ALL',x+145,y+160),
        word('Race:',x+80,y+190,50),word('ALL',x+145,y+190),word(slot,x+80,y+220,80),word(`Tier${tier}`,x+80,y+250,60),word(`1/${2**tier}`,x+150,y+250,60),
        word('Size:',x+20,y+300,60),word('SMALL',x+130,y+300,70),word('AC:',x+280,y+300,40),word(String(ac),x+400,y+303,30,16,96),
        word('HP:',x+280,y+330,40),word(String(hp),x+400,y+333,30,16,96),word('Strength:',x+20,y+380,100),word('17',x+180,y+383,30,16,96),
        word('Modified',x+50,y+450,90),word('Focus',x+20,y+480,60),word('Exaltation:',x+90,y+480,100),word('emply',x+210,y+480,60)];
}
const modern=[...modernPane(0,0,'Synthetic River Shoes +2','Feet',2,19,57,{augmented:true}),
    ...modernPane(800,0,'Synthetic Quartz Maul +5','Primary',5,31,62),...modernPane(0,700,'Synthetic Glass Ring +3','Fingers',3,27,43),
    word('Inventory',1900,40,100),word('Character',1700,400,100),word('Vitals',1810,400,60),word('Stats',1960,400,50),word('and',2020,400),word('Resists',2070,400,80),
    word('HP',1700,440,30),word('412/490',1820,443,100,16,96),word('Strength',1960,440,100),word('143/511',2100,443,100,16,96),
    word('Mana',1700,470,50),word('253/301',1820,473,100,16,96),word('Stamina',1960,470,100),word('129/511',2100,473,100,16,96),
    word('End',1700,500,40),word('501/510',1820,503,100,16,96),word('Intelligence',1960,500,110),word('117/511',2100,503,100,16,96),
    word('Attack',1700,530,70),word('359/840',1820,533,100,16,96),word('Attack',1700,560,70),word('Speed',1780,560,60),word('%',1845,560,15),word('147',1880,563,40,16,96)];
const modernParsed=parseScreenRead({text:'Synthetic Modern scene',words:modern,confidence:89}),modernItems=modernParsed.filter(entry=>entry.subject.kind==='item');
assert.deepEqual(modernItems.map(entry=>entry.subject.name),['Synthetic River Shoes +2','Synthetic Quartz Maul +5','Synthetic Glass Ring +3']);
for(const [index,entry] of modernItems.entries()){
    const f=Object.fromEntries(entry.fields.map(field=>[field.key,field.value]));assert.equal(f.ac,[19,31,27][index]);assert.equal(f.hp,[57,62,43][index]);
    assert.deepEqual(f.slots,[["Feet"],["Primary"],["Fingers"]][index]);assert.equal(f.fraction,1);assert.equal(f.fractionMaximum,2**f.tier);
    assert.equal(f.modified,index===0?true:undefined);assert.equal(f.augmentNames,undefined,'near-empty OCR checkbox content is not an augment');
}
const modernChar=modernParsed.find(entry=>entry.subject.kind==='character'),modernFields=Object.fromEntries(modernChar.fields.map(field=>[field.key,field.value]));
assert.equal(modernFields.hpCurrent,412);assert.equal(modernFields.enduranceMaximum,510);assert.equal(modernFields.str,143);assert.equal(modernFields.attack,undefined,'unlabeled attack component pair is ambiguous');assert.equal(modernFields.attackSpeed,147);
const modernRegions=screenReadRefinementRegions({words:modern});assert.equal(modernRegions.length,2);assert.equal(modernRegions[0].tiles.length,3);assert.equal(modernRegions[1].role,'character-stats');
const modernRefined=parseScreenRead({text:'Synthetic Modern scene',words:modern,confidence:89,refinements:[
    {role:'item-stats',tiles:[{x:0,y:0,width:600,height:600},{x:800,y:0,width:600,height:600}],confidence:92,text:'GLOBAL RAW MUST NOT LEAK',words:[word('Dexterity:',20,410,100),word('3',180,413,30,16,70),word('AC:',1080,300,40),word('33',1200,303,30,16,96)]},
    {role:'character-stats',confidence:95,text:'PRIVATE CHARACTER RAW',words:[word('End',1700,500,40),word('501/511',1820,503,100,16,96)]}
]});
assert.equal(modernRefined[0].fields.some(field=>field.key==='dex'),false,'a low-confidence single glyph stays unknown');
assert.equal(modernRefined[1].fields.some(field=>field.key==='ac'),false,'conflicting reads of the same field remain unknown');
for(const item of modernRefined.filter(entry=>entry.subject.kind==='item'))assert.doesNotMatch(item.evidence.text,/GLOBAL RAW|PRIVATE CHARACTER|501\/511/,'an item cannot carry unrelated item or character evidence');
assert.equal(modernRefined.find(entry=>entry.subject.kind==='character').fields.some(field=>field.key==='enduranceMaximum'),false,'conflicting resource maxima remain unknown');
for(const [observed,expected] of [['Charm','Charm'],['Power Source','Power Source'],['PowerSource','Power Source'],['Shoulder','Shoulders'],['Ranged','Ranged']]){
    const result=parseScreenRead({text:'Synthetic Modern slot',words:modernPane(0,0,'Synthetic Other Gear +2',observed,2,22,61)})[0];
    assert.deepEqual(result.fields.find(field=>field.key==='slots').value,[expected]);
}
assert.deepEqual(parseScreenRead({text:'Item: Synthetic Power Core\nSlot: Power Source'})[0].fields.find(field=>field.key==='slots').value,['Power Source'],'multiword slot stays one canonical slot, not two unrelated words');
const regenWords=[...modern,word('HP',1700,600,30),word('Regen',1740,600,70),word('1',1850,603,35,16,85)];
const fragmentedRegen=parseScreenRead({text:'Synthetic Modern fragmented numeric read',words:regenWords,confidence:92,refinements:[{role:'character-stats',confidence:89,text:'HP R == 11',words:[word('HP',1700,600,30),word('R',1740,600,15),word('==',1760,610,50),word('11',1851,603,33,16,89)]}]}).find(entry=>entry.subject.kind==='character');
assert.equal(fragmentedRegen.fields.some(field=>field.key==='hpRegen'),false,'a second numeric box disagreement invalidates the first stat even when its label is fragmented');
assert.match(fragmentedRegen.evidence.text,/HP Regen 1/);assert.match(fragmentedRegen.evidence.text,/HP R == 11/);assert.match(fragmentedRegen.evidence.text,/Conflicting OCR values left unknown: hpRegen/);
const consistentRegen=parseScreenRead({text:'Synthetic Modern consistent numeric read',words:regenWords,confidence:92,refinements:[{role:'character-stats',confidence:89,text:'HP R 1',words:[word('HP',1700,600,30),word('R',1740,600,15),word('1',1851,603,33,16,89)]}]}).find(entry=>entry.subject.kind==='character');
assert.equal(consistentRegen.fields.find(field=>field.key==='hpRegen').value,1,'unreadable second labels alone do not erase agreeing numeric evidence');
const manualText='Class: ALL\nHaste: 12%\nAttack Speed 18%\nRange 75\nDamage Bonus 9\nEndurance Regen 4\nCombat Effects: 7\nWorn Effect: Haste 99%';
const reparsed=parseItemStatBlock(manualText),manualFields=Object.fromEntries(reparsed.fields.map(entry=>[entry.key,entry.value]));
assert.deepEqual(manualFields,{haste:12,attackSpeed:18,range:75,damageBonus:9,enduranceRegen:4});assert.deepEqual(reparsed.conflicts,[]);assert.equal(manualText.includes('Combat Effects: 7'),true,'the original written text is not rewritten');
assert.equal(parseItemStatBlock('Worn Effect: Haste 12%\nFocus Exaltation: Synthetic Haste 18').fields.length,0,'an effect name/rank cannot become a numeric Haste stat');
assert.equal(parseScreenRead({text:'Item: Synthetic Haste 3\nDescription\nSynthetic Haste 3'})[0].fields.some(entry=>entry.key==='haste'),false,'the item name cannot manufacture a numeric Haste stat');
assert.deepEqual(parseItemStatBlock('HP 41 HP 42\nHaste 12%\nHaste 13%').conflicts,['hp','haste']);assert.equal(parseItemStatBlock('HP 41\nHP 42').fields.length,0);
assert.equal(parseItemStatBlock('x'.repeat(8193)).fields.length,0);assert(parseItemStatBlock('HP 1\n'.repeat(61)).warnings.length);assert(parseItemStatBlock(null).warnings.length);
const textItem=parseScreenRead({text:'Item: Synthetic Written Chronicle\n'+manualText+'\nDone\n[12:30] You say, private outside-pane chat'})[0];
const written=textItem.fields.find(entry=>entry.key==='rawStatBlock').value;
assert.match(written,/Combat Effects: 7/);assert.match(written,/Haste: 12%/);assert.doesNotMatch(written,/private outside-pane|Done/);assert.match(textItem.evidence.text,/Combat Effects: 7/);
assert.equal(textItem.fields.some(entry=>entry.key==='statLines'),false,'complete raw item evidence is not automatically outgoing wiki stat lines');
assert.equal(textItem.fields.find(entry=>entry.key==='haste').value,12);
const componentWords=[...modern,word('AC',1700,590,30),word('121/93|257',1820,593,130,16,97)];
const componentCapture=parseScreenRead({text:'Synthetic Modern component rows',words:componentWords,confidence:92}).find(entry=>entry.subject.kind==='character');
const componentFields=Object.fromEntries(componentCapture.fields.map(entry=>[entry.key,entry.value]));
for(const [key,value]of Object.entries({acMitigation:121,acMitigationSoftcap:93,acEvasion:257,attackOffense:359,attackAccuracy:840}))assert.equal(componentFields[key],value,key);
for(const key of ['ac','acMaximum','attack','attackMelee','attackRanged'])assert.equal(componentFields[key],undefined,'Modern components never become an invented aggregate/max/melee/ranged value');
const componentsDisagree=parseScreenRead({text:'Synthetic Modern component disagreements',words:componentWords,confidence:92,refinements:[{role:'character-stats',confidence:94,text:'AR 121/94|258\nAtk? 359/841',words:[word('AR',1700,590,30),word('121/94|258',1820,593,130,16,97),word('Atk?',1700,530,70),word('359/841',1820,533,100,16,97)]}]}).find(entry=>entry.subject.kind==='character');
const disagreed=Object.fromEntries(componentsDisagree.fields.map(entry=>[entry.key,entry.value]));assert.equal(disagreed.acMitigation,121);assert.equal(disagreed.acMitigationSoftcap,undefined);assert.equal(disagreed.acEvasion,undefined);assert.equal(disagreed.attackAccuracy,undefined);assert.equal(disagreed.attackOffense,359);
const mergedWords=[...modern.filter(entry=>entry.text!=='359/840'),word('3591840',1820,533,130,16,90),word('AC',1700,590,30),word('121/93',1820,593,75,16,97),word('|257',1910,593,50,16,97)];
const merged=parseScreenRead({text:'Synthetic Modern missing component divider',words:mergedWords,confidence:92}).find(entry=>entry.subject.kind==='character');
assert.equal(merged.fields.some(entry=>entry.key==='attackOffense'||entry.key==='attackAccuracy'),false,'a missing divider never promotes concatenated digits to one giant component');
const splitRegions=screenReadRefinementRegions({words:mergedWords}).find(region=>region.role==='character-stats');
assert.equal(splitRegions.tiles.length,3);assert.deepEqual(splitRegions.tiles.slice(1).map(tile=>tile.component),['attackOffense','attackAccuracy']);
const splitRead=(key,text,confidence=96)=>({...word(text,key==='attackOffense'?1820:1920,533,30,16,confidence),component:key});
const recovered=parseScreenRead({text:'Synthetic Modern pixel column re-read',words:mergedWords,confidence:92,refinements:[{role:'character-stats',confidence:92,text:'359\n840',words:[splitRead('attackOffense','359'),splitRead('attackAccuracy','840')]}]}).find(entry=>entry.subject.kind==='character');
assert.equal(recovered.fields.find(entry=>entry.key==='attackOffense').value,359);assert.equal(recovered.fields.find(entry=>entry.key==='attackAccuracy').value,840,'only independently observed crop digits establish the two components');
const weakColumn=parseScreenRead({text:'Synthetic Modern weak column re-read',words:mergedWords,confidence:92,refinements:[{role:'character-stats',confidence:92,text:'359\n840',words:[splitRead('attackOffense','359',80),splitRead('attackAccuracy','840',80)]}]}).find(entry=>entry.subject.kind==='character');
assert.equal(weakColumn.fields.some(entry=>entry.key==='attackOffense'||entry.key==='attackAccuracy'),false,'low confidence split-column digits remain unknown');
console.log('Screen-read parser: observed item/tier/augment/stat provenance, unknowns and character separation passed.');

// Compact Modern hover tooltips have no Description or repeated body title.
function hoverPane(x,y,name='Brightneedle +3'){
 return [word(name,x+100,y+10,300),word('Lore Equipped, No Trade',x+100,y+35,300),word('Class:',x+100,y+60,55),word('ROG',x+165,y+60),word('Race:',x+100,y+85,55),word('ALL',x+165,y+85),word('Primary',x+100,y+110,80),word('Secondary',x+190,y+110,100),word('Size:',x+20,y+160,50),word('SMALL',x+130,y+160,75),word('HP:',x+250,y+160,40),word('73',x+350,y+160,30),word('Weight',x+20,y+185,70),word('14',x+150,y+185,30),word('Base Dmg:',x+250,y+185,100),word('18',x+380,y+185,30),word('Backstab Dmg:',x+250,y+210,130),word('9',x+400,y+210,20,20,96),word('Strength:',x+20,y+235,100),word('21',x+150,y+235,30),word('Hold RMB or ALT+LMB to inspect or upgrade item',x+20,y+420,520)];
}
const hoverWords=hoverPane(0,0),hoverRecord=parseScreenRead({text:'Observed synthetic hover',words:hoverWords,confidence:88})[0],hoverFields=Object.fromEntries(hoverRecord.fields.map(field=>[field.key,field.value]));
assert.equal(hoverRecord.subject.name,'Brightneedle +3');assert.equal(hoverFields.tier,3);assert.equal(hoverFields.damage,18);assert.equal(hoverFields.backstabDamage,9);assert.equal(hoverFields.hp,73);assert.equal(hoverFields.str,21);assert.deepEqual(hoverFields.slots,['Primary','Secondary']);assert.equal(hoverFields.weight,undefined,'Integer hover weight can be a lost decimal; leave it unknown');assert.equal(hoverFields.augmentNames,undefined);assert.equal(hoverFields.fraction,undefined);
assert.equal(parseScreenRead({text:'Class/race without hover footer',words:hoverWords.filter(word=>!word.text.startsWith('Hold'))}).length,0);
assert.equal(parseScreenRead({text:'Footer without Class/race',words:hoverWords.filter(word=>!/^Race:/.test(word.text))}).length,0);
const noTier=parseScreenRead({text:'No tier suffix',words:hoverPane(0,0,'Brightneedle')})[0];assert.equal(noTier.fields.some(field=>field.key==='tier'),false,'Empty-slot counts cannot supply a tier');
const missingHoverName=hoverWords.filter(word=>word.text!=='Brightneedle +3'),nameRefinement={role:'item-name',confidence:70,text:'Brightneedle +3',words:[word('Brightneedle',100,10,140,20,41),word('+3',250,10,25,20,96)]};
assert.equal(parseScreenRead({text:'Green name omitted by whole-scene OCR',words:missingHoverName}).length,0);
assert.equal(screenReadRefinementRegions({words:missingHoverName})[0].role,'item-name','Strict non-name anchors permit a bounded pixel reread, not an invented name');
const recoveredHover=parseScreenRead({text:'Green name omitted by whole-scene OCR',words:missingHoverName,confidence:88,refinements:[nameRefinement]})[0];assert.equal(recoveredHover.subject.name,'Brightneedle +3');assert.equal(recoveredHover.fields.find(field=>field.key==='name').confidence,41,'Uncertain prefix words are retained with their actual uncertainty, never silently truncated');
const inventoryBesideHover=[word('Inventory',1200,0,100),word('Character',1200,40,100),word('Vitals',1310,40,50),word('Stats',1450,40,70),word('HP',1200,100,30),word('330/398',1260,100,100),word('Mana',1200,130,50),word('296/296',1260,130,100)];
const mixedMissingName={text:'Full scene with independent Inventory and a compact tooltip whose title was missed',words:[...missingHoverName,...inventoryBesideHover],confidence:88};
assert.equal(parseScreenRead(mixedMissingName).filter(record=>record.subject.kind==='item').length,0,'A missing title is not invented from unrelated Inventory text');
assert.equal(parseScreenRead(mixedMissingName).filter(record=>record.subject.kind==='character').length,1,'A real-shaped Inventory pane competes for the same bounded refinement budget');
assert.deepEqual(screenReadRefinementRegions(mixedMissingName).map(region=>region.role),['item-name','item-stats'],'Visible Inventory must not replace the only opportunity to recover the compact item identity');
const mixedRecovered=parseScreenRead({...mixedMissingName,refinements:[nameRefinement]}).find(record=>record.subject.kind==='item');assert.equal(mixedRecovered.subject.name,'Brightneedle +3');assert.equal(mixedRecovered.fields.find(field=>field.key==='hp').value,73);assert.doesNotMatch(mixedRecovered.evidence.text,/330\/398|296\/296/,'Character text cannot enter the item evidence');
assert.deepEqual(screenReadRefinementRegions({words:inventoryBesideHover}).map(region=>region.role),['character-stats'],'A baseline with no item still receives the character refinement');
for(const purpose of [{characterOnly:true},{owner:'character'}]){
    assert.deepEqual(screenReadRefinementRegions({...mixedMissingName,...purpose}).map(region=>region.role),['character-stats'],'Character capture spends no refinement pass on item identity or item stats');
    const characterRecords=parseScreenRead({...mixedMissingName,...purpose,refinements:[nameRefinement]});assert.equal(characterRecords.length,1);assert.equal(characterRecords[0].subject.kind,'character');
    assert.deepEqual(parseScreenRead({text,words:[],...purpose}),[],'An examine tooltip never emits an item from Character capture');
    assert.deepEqual(screenReadRefinementRegions({words:hoverWords,...purpose}),[],'An item-only frame uses no additional OCR passes during Character capture');
    assert.deepEqual(parseScreenRead({text:'Inventory\nItem: Synthetic Item\nHP 999\nSTR 99\nAC 99',...purpose}),[],'Wordless Inventory text plus item stats cannot establish equipped totals');
}

// Synthetic fully scrolled Default Modern panel. The Additional Modifiers
// section is below the old fixed 25-line crop; adjacent bag stats are unrelated.
const fullPanel=[word('Inventory',400,0,100),word('Character',100,100,100),word('Vitals',210,100,60),word('Stats',400,100,60),word('and',470,100,35),word('Resists',515,100,80),
    word('HP',100,140,30),word('123/456',260,140,100),word('Strength',400,140,100),word('120/510',610,140,90),
    word('Mana',100,170,50),word('20/300',260,170,90),word('End',100,200,45),word('40/600',260,200,90),
    word('AC',100,230,30),word('100/200|300',240,230,120),word('Attack',100,260,70),word('400|500',260,260,100),
    word('Velocity',100,290,90),word('7',330,290,20,20,96),word('Primary',100,320,80),word('DPS',190,320,40),word('12.5',300,320,60),
    word('Additional',100,650,110),word('Modifiers',220,650,100),word('Additional',100,850,110),word('Information',220,850,110),
    word('Bind',100,900,50),word('Synthetic',530,900,90),word('Town',630,900,70),word('Deity',100,930,60),word('Synthetic',530,930,90),
    word('Weight',800,200,70),word('999/999',880,200,100),word('HP',100,1150,30),word('9999/9999',260,1150,120)];
const modifierRows=[['Accuracy','accuracy',12,150],['Avoidance','avoidance',13,100],['Combat Effects','combatEffects',14,100],['Strike Through','strikeThrough',15,35],['Stun Resist','stunResist',16,35],
    ['Damage Shielding','damageShield',17,35],['Damage Shield Mitiga','damageShieldMitigation',18,25],['DoT Shielding','dotShielding',19,35],['Melee Shielding','meleeShielding',20,35],['Spell Shielding','spellShielding',21,35]];
for(let n=0;n<modifierRows.length;n++){const [name,,value,cap]=modifierRows[n],x=n<5?100:400,y=680+(n%5)*30;fullPanel.push(word(name,x,y,210),word(`${value}/${cap}`,x+230,y,70));}
const fullPanelRead=parseScreenRead({words:fullPanel,text:'Synthetic scrolled full stat panel',confidence:96}).find(entry=>entry.subject.kind==='character'),fullFields=Object.fromEntries(fullPanelRead.fields.map(field=>[field.key,field.value]));
for(const [,key,value,cap]of modifierRows){assert.equal(fullFields[key],value,`${key} is retained below the old crop`);assert.match(fullPanelRead.fields.find(field=>field.key===key).raw,new RegExp(`${value}/${cap}`),'The original current/cap pair remains evidence');}
assert.equal(fullFields.hpCurrent,123);assert.equal(fullFields.hpMaximum,456);assert.equal(fullFields.manaCurrent,20);assert.equal(fullFields.manaMaximum,300);assert.equal(fullFields.enduranceCurrent,40);assert.equal(fullFields.enduranceMaximum,600);
assert.equal(fullFields.attackAccuracy,500);assert.equal(fullFields.accuracy,12,'The item Accuracy modifier remains distinct from attack Accuracy');assert.equal(fullFields.velocity,7);assert.equal(fullFields.primaryDps,12.5);assert.equal(fullFields.secondaryDps,undefined,'A blank DPS display remains unknown');
assert.equal(fullFields.weight,undefined);assert(!fullPanelRead.fields.some(field=>/bind|origin|deity/i.test(field.key)));
assert.doesNotMatch(fullPanelRead.evidence.text,/9999|999\/999/,'Adjacent bag and below-panel numbers do not bleed into character evidence');
const fullRegion=screenReadRefinementRegions({words:fullPanel}).find(region=>region.role==='character-stats'),baseRegion=fullRegion.tiles?.[0]||fullRegion;
assert(baseRegion.y+baseRegion.height>=840,'Refinement includes the complete observed Additional Modifiers section');assert(baseRegion.x+baseRegion.width<800,'Refinement excludes the adjacent weight/bag panel');assert(baseRegion.width*baseRegion.height<=1024*1024,'Full observed stat pane fits the bounded source crop');
const ambiguousModifiers=fullPanel.map(value=>value.text==='12/150'?{...value,text:'12150'}:value);
assert.equal(parseScreenRead({text:'Synthetic ambiguous modifier pair',words:ambiguousModifiers,confidence:96}).find(entry=>entry.subject.kind==='character').fields.some(field=>field.key==='accuracy'),false,'Missing modifier delimiters remain unknown rather than becoming a merged number');
const unknownModifier=parseScreenRead({text:'Synthetic Character-only unknown modifier',words:ambiguousModifiers,confidence:96,characterOnly:true,refinements:[{role:'character-stats',text:'Accuracy 12/150',words:[],confidence:99}]}).find(entry=>entry.subject.kind==='character');
assert.equal(unknownModifier.fields.some(field=>field.key==='accuracy'),false,'A refinement without observed in-pane geometry cannot manufacture a missing modifier');
const coveredStats=parseScreenRead({text:'Synthetic item covering part of the character panel',words:[...fullPanel,...modernPane(0,500,'Synthetic Covering Boots +2','Feet',2,999,888)],owner:'character',confidence:96});
assert.equal(coveredStats.length,1);assert.equal(coveredStats[0].subject.kind,'character');assert.equal(coveredStats[0].fields.find(field=>field.key==='hpMaximum').value,456);assert.doesNotMatch(coveredStats[0].evidence.text,/Covering Boots|HP: 888/,'Item panes covering the character rectangle stay outside character evidence');
// The Class glyph's ink height is not the title's line box. Linux/Windows
// fallback fonts and native caption offsets must not cut an observed title.
const shortClassInk=hoverPane(0,27).map(entry=>entry.text==='Brightneedle +3'?{...entry,bbox:{...entry.bbox,y1:entry.bbox.y0+23}}:/^(?:Class|Race):/.test(entry.text)?{...entry,bbox:{...entry.bbox,y1:entry.bbox.y0+14}}:entry);
const completeNameBox=shortClassInk.find(entry=>entry.text==='Brightneedle +3').bbox,inkCrop=screenReadRefinementRegions({words:shortClassInk}).find(region=>region.role==='item-name');
assert(inkCrop);assert(inkCrop.y<=completeNameBox.y0&&inkCrop.y+inkCrop.height>=completeNameBox.y1,'Observed name row must fit completely even when Class has shorter ink height');
assert(inkCrop.y+inkCrop.height<shortClassInk.find(entry=>entry.text.startsWith('Lore')).bbox.y0,'Name reread excludes the following Lore row');
const missedInkCrop=screenReadRefinementRegions({words:shortClassInk.filter(entry=>entry.text!=='Brightneedle +3')}).find(region=>region.role==='item-name');
assert(missedInkCrop.y<=completeNameBox.y0&&missedInkCrop.y+missedInkCrop.height>=completeNameBox.y1,'Missing green name fallback uses observed row spacing and Lore boundary, not Class ink height alone');
assert(missedInkCrop.y+missedInkCrop.height<shortClassInk.find(entry=>entry.text.startsWith('Lore')).bbox.y0);
for(const metadata of ['No Trade',null]){
 const variant=shortClassInk.flatMap(entry=>entry.text.startsWith('Lore')?(metadata?[{...entry,text:metadata}]:[]):[entry]);
 for(const omitName of [false,true]){const crop=screenReadRefinementRegions({words:variant.filter(entry=>!omitName||entry.text!=='Brightneedle +3')}).find(region=>region.role==='item-name');
  assert(crop&&crop.y<=completeNameBox.y0&&crop.y+crop.height>=completeNameBox.y1,'No Trade-only and absent metadata retain the complete observed/name-line bounds');
  if(metadata)assert(crop.y+crop.height<variant.find(entry=>entry.text===metadata).bbox.y0);
 }
}
const mixedHover=parseScreenRead({text:'Independent examine and hover scene',words:[...modernPane(0,0,'Synthetic Separate Boots +2','Feet',2,31,62),...hoverPane(900,0),word('Inventory',2000,10,100),word('HP',2000,900),word('9999',2100,900),word('STR',2000,930),word('888',2100,930)]});assert.equal(mixedHover.length,2);assert.equal(mixedHover[1].subject.name,'Brightneedle +3');assert.equal(mixedHover[1].fields.find(field=>field.key==='hp').value,73);assert.doesNotMatch(mixedHover[1].evidence.text,/Separate Boots|9999|888/);
assert.deepEqual(parseItemStatBlock('Base Dmg: 18 Backstab Dmg: 9\nCombat Effect: Rampage (Req Level 45) HP 99').fields.map(field=>[field.key,field.value]),[['damage',18],['backstabDamage',9]]);
assert.equal(parseScreenRead({text:'Inventory and unrelated numbers',words:[word('Inventory',10,10,100),word('HP 9999 STR 888 AC 777',20,300,300)]}).length,0,'Unrelated Inventory/chat without Modern stat-pane geometry cannot create a Character baseline');
const explicitCharacter=parseScreenRead({text:'Explicit legacy Character Stats pane',words:[word('Character',30,10,100),word('Stats',140,10,60),word('Inventory',30,45,120),word('HP',30,80,30),word('330/398',100,80,100),word('Mana',30,110,50),word('296/296',100,110,100),word('Strength',30,140,100),word('90',150,140,30)]}).find(record=>record.subject.kind==='character');assert(explicitCharacter);assert.equal(explicitCharacter.fields.find(field=>field.key==='hpMaximum').value,398);assert.equal(explicitCharacter.fields.find(field=>field.key==='str').value,90);
