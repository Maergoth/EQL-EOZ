import assert from 'node:assert/strict';
import {parseEditedStats,withDefaultItemStatLines,contributionItemEvidenceMarkup} from '../app/capture-workspace.js';
import {parseScreenRead} from '../app/screen-read-parser.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {CHARACTER_STAT_KEYS,characterStatLabel} from '../app/character-model.js';
for(const key of [...CHARACTER_STAT_KEYS,'DMG_BONUS','HP_CURRENT','HP_MAXIMUM','MP_CURRENT','MP_MAXIMUM','END_CURRENT','END_MAXIMUM'])assert.deepEqual(parseEditedStats(`${characterStatLabel(key)}: 7`),{[key]:7},`Generated ${key} label round-trips through manual baseline editing`);
assert.deepEqual(parseEditedStats('HP: 1,000\nMana: +200\nStrength: 75\nHP Regen: 3\nAC: ?'),{HP:1000,MP:200,STR:75,HP_REGEN:3,AC:null});
assert.throws(()=>parseEditedStats('HP: wrong'),/Use STAT: number/);
assert.throws(()=>parseEditedStats('Mana: 200\nMP: 100'),/only once/);
assert.throws(()=>parseEditedStats('HP: 1,2'),/Use STAT: number/);
assert.throws(()=>parseEditedStats('HP: 999999999999999999999'),/numeric value/);
assert.deepEqual(parseEditedStats('DMG: 12\nWT: 0.1\nENDURANCE: 10'),{DMG:12,WT:.1,END:10});
const observation=parseScreenRead({text:'Item: Synthetic Modern Blade +3\nClass: WAR\nRace: ALL\nSlot: PRIMARY\nTier 3 2/8\nAC 12\nBase Dmg 9\nDmg Bon 4\nDelay 24\nNo Trade\nWeight 2.5\nSize: SMALL\nModified: yes\nWorn Effect: Synthetic Haste',confidence:90})[0];
const candidate=createContributionQueue({storage:null}).consume(observation);
const reviewed=withDefaultItemStatLines(candidate.fields);
assert.deepEqual(reviewed.statLines,{value:['AC: 12','Weight: 2.5','Damage: 9','Damage Bonus: 4','Delay: 24','SV Void: 0'],confirmed:false});
for(const key of ['fraction','fractionMaximum','modified','classes','slots','races','size','effects','noTrade'])assert.deepEqual(reviewed[key],candidate.fields[key],`${key} stays available separately for review`);
const unsafeValues={hp:{value:null},mana:{value:'20'},ac:{value:Infinity},damageBonus:{value:NaN},name:{value:'Synthetic'},augmented:{value:true},quantity:{value:10},identity:{value:'internal'},unknown:{value:4},str:{value:0},resistFire:{value:-5}};
assert.deepEqual(withDefaultItemStatLines(unsafeValues).statLines.value,['STR: 0','SV Fire: -5','SV Void: 0'],'unknowns, metadata and nonnumeric values are never auto-stringified; absent Void is an editable form default');
for(const saved of [{value:['Contributor prose, with its punctuation.'],confirmed:true,edited:true},{value:'',confirmed:false,edited:true},{value:[],confirmed:true},'']){
    const fields={...candidate.fields,statLines:saved};
    assert.equal(withDefaultItemStatLines(fields).statLines,saved,'saved contributor stat text, including an explicit empty string, is preserved verbatim');
}
assert.deepEqual(withDefaultItemStatLines({statLines:{value:[],confirmed:false}}).statLines.value,['SV Void: 0']);
assert.deepEqual(withDefaultItemStatLines({statLines:{value:'HP: 5',confirmed:false}}).statLines.value,'HP: 5\nSV Void: 0');
for(const label of ['SV Void','SV Corruption','SV_CORRUPTION','Void resist']){
    const field={value:[`${label}: 9`],confirmed:false};
    assert.equal(withDefaultItemStatLines({statLines:field}).statLines,field,'An existing Void value is not duplicated or overwritten');
}
const observedVoid={resistCorruption:{value:7,confirmed:false}},voidForm=withDefaultItemStatLines(observedVoid);
assert.deepEqual(voidForm.statLines.value,['SV Void: 7']);assert.equal(voidForm.resistCorruption,observedVoid.resistCorruption);assert.equal(Object.hasOwn(reviewed,'resistCorruption'),false,'Default Void text is never added to captured numeric fields');
const itemEvidence=contributionItemEvidenceMarkup({kind:'item',name:'Synthetic <Blade>',fields:{iconId:{value:42}}});
assert.equal((itemEvidence.match(/data-contribution-dropzone/g)||[]).length,1);assert.equal((itemEvidence.match(/data-contribution-icons/g)||[]).length,1);assert(itemEvidence.indexOf('contribution-image')<itemEvidence.indexOf('contribution-icon-field'),'Item screenshot precedes the adjacent icon field');assert.equal(contributionItemEvidenceMarkup({kind:'npc',name:'Synthetic keeper'}),'','Monster layout is unchanged');
assert.equal(Object.hasOwn(candidate.fields,'statLines'),false,'preparing the editor does not mutate queued observations');
console.log('Capture workspace stat editing: familiar labels, separators, unknowns, aliases and recoverable invalid/duplicate values passed.');
console.log('Contribution item defaults: known numeric labels only; metadata remains separate and saved contributor text is preserved.');
