import assert from 'node:assert/strict';
import {parseScreenRead} from '../app/screen-read-parser.js';
const text=`Item Name: Synthetic Test Blade +3\nDescription\nSynthetic Test Blade +3\nNo Trade\nClass: WAR / PAL\nRace: ALL\nSlot: PRIMARY / SECONDARY\nTier 3 / 10\nAC 12\nHP 45\nMana 20\nSTR 8\nDMG 9 Delay 24\nWeight 2.5\nRequired Level 15\nModified\nWorn Effect: Synthetic Haste\nFocus Exaltation: empty\nRune Exaltation: Synthetic Rune`;
const [item]=parseScreenRead({text,confidence:85,owner:'character',sessionId:'synthetic'});
const fields=Object.fromEntries(item.fields.map(field=>[field.key,field.value]));
assert.equal(item.subject.name,'Synthetic Test Blade +3');assert.equal(item.owner,'character');
assert.equal(fields.tier,3);assert.equal(fields.hp,45);assert.equal(fields.damage,9);assert.equal(fields.delay,24);
assert.equal(fields.requiredLevel,15);assert.equal(fields.weight,2.5);assert.equal(fields.modified,true);
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
console.log('Screen-read parser: observed item/tier/augment/stat provenance, unknowns and character separation passed.');
