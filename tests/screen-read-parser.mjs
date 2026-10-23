import assert from 'node:assert/strict';
import {parseScreenRead,screenReadRefinementRegions,parseItemStatBlock} from '../app/screen-read-parser.js';
const text=`Item Name: Synthetic Test Blade +3\nDescription\nSynthetic Test Blade +3\nNo Trade\nClass: WAR / PAL\nRace: ALL\nSlot: PRIMARY / SECONDARY\nTier 3 / 10\nAC 12\nHP 45\nMana 20\nSTR 8\nDMG 9 Delay 24\nWeight 2.5\nRequired Level 15\nModified\nWorn Effect: Synthetic Haste\nFocus Exaltation: empty\nRune Exaltation: Synthetic Rune`;
const [item]=parseScreenRead({text,confidence:85,owner:'character',sessionId:'synthetic'});
const fields=Object.fromEntries(item.fields.map(field=>[field.key,field.value]));
assert.equal(item.subject.name,'Synthetic Test Blade +3');assert.equal(item.owner,'character');
assert.equal(fields.tier,3);assert.equal(fields.hp,45);assert.equal(fields.damage,9);assert.equal(fields.delay,24);
assert.equal(fields.requiredLevel,15);assert.equal(fields.weight,2.5);assert.equal(fields.modified,undefined,'an unchecked Modern Modified checkbox label is not a state');
assert.deepEqual(fields.slots,['PRIMARY','SECONDARY']);assert.deepEqual(fields.augmentNames,['Synthetic Rune']);
assert.equal(fields.hp,45,'OCR never adds an augment or scales the displayed tier twice');
assert.equal(item.fields.find(field=>field.key==='ac').raw,'AC 12');
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
