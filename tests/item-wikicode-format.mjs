import assert from 'node:assert/strict';
import {itemContributionWikiStatLines as format} from '../app/item-contribution-stats.js';
import {buildContributionDraft,contributionTemplates,patchContributionPrimary} from '../app/contribution-model.js';
import {itemRecoveryFingerprint,proposeItemBaseReview,validateItemBaseReview} from '../app/item-base-review.js';

const confirmed=value=>({value,confirmed:true}),blueprints={entries:{item:{text:'<onlyinclude>{{Itempage|itemname=|statsblock=}}</onlyinclude>'}}};
const statsOf=text=>contributionTemplates(text,'Itempage')[0].fields.find(field=>field.name==='statsblock').value.trim();
const pyroweave=['AC: 9','INT: 9','SV Fire: 25','Weight: 0.1','Race: ALL','Size: TINY','Class: ALL','Slot: FINGER'];
const expected=['Slot: FINGER','AC: 9','INT: 9','SV Fire: 25','WT: 0.1  Size: TINY','Class: ALL','Race: ALL'];
assert.deepEqual(format(pyroweave),expected,'The reported generated ring uses the standard item-card order without changing its values');
assert.deepEqual(format(expected),expected,'Formatting an already canonical block is stable');
const item={kind:'item',name:'Pyroweave Band',era:'Classic Era',zone:'Nektropos Castle',fields:{statLines:confirmed(pyroweave),classes:confirmed(['ALL']),slots:confirmed(['FINGER'])}};
const before=structuredClone(item),draft=buildContributionDraft(item,blueprints);
assert.deepEqual(draft.blockers,[]);assert.equal(statsOf(draft.text),expected.join('<br>\n')+'<br>');assert.deepEqual(item,before,'Only outgoing text changes, never observed fields');
assert.match(draft.text,/\|lucy_img_ID = \n/);assert(draft.warnings.some(warning=>warning.includes('No verified wiki icon')));
assert.doesNotMatch(statsOf(draft.text),/MAGIC ITEM|LORE ITEM|NO TRADE|Effect:|HP:|DMG:/,'Formatting cannot supply unobserved flags, effects or values');
assert.equal((draft.text.match(/Equipment\]\]/g)||[]).length,16,'Class ALL retains every supported class category');

const weapon=format(['Class: ROG','Race: ALL','Size: SMALL','Weight: 0','Delay: 22','Backstab DMG: 15','Damage Bonus: 0','DMG: 10','Skill: Piercing','Slot: PRIMARY SECONDARY','LORE EQUIPPED, NO TRADE','STR: +10','STA: 0','HP: -5','SV Fire: +5','SV Cold: 0','Haste: 0%','Effect: Kept spell','A retained contributor sentence.']);
assert.deepEqual(weapon,[
    'LORE EQUIPPED, NO TRADE','Slot: PRIMARY SECONDARY','Skill: Piercing  Atk Delay: 22',
    'DMG: 10','BACKSTAB: 15','DMG Bonus: 0','STR: +10  STA: 0  HP: -5',
    'SV Fire: +5  SV Cold: 0','Haste: 0%','Effect: Kept spell','A retained contributor sentence.',
    'WT: 0  Size: SMALL','Class: ROG','Race: ALL'
]);
assert.deepEqual(format(weapon),weapon,'Combined numeric and identity rows remain stable');
// These are the exact public Itembox/slider input labels. Delay: alone does not
// satisfy their Atk Delay readers; explicit zero bonus remains an override.
assert.equal(Number(weapon.join('\n').match(/Atk[\s\u00a0]+Delay:\s*(\d+(?:\.\d+)?)/i)?.[1]),22);
assert.match(weapon.join('\n'),/DMG BONUS: 0/i);
assert.deepEqual(format(['DMG: 10','AC: 5','Damage Bonus: 0']),['DMG: 10','AC: 5','DMG Bonus: 0'],'Damage stays a standalone numeric row for Itembox default Backstab');
assert.deepEqual(format(['Mana: 0','Endurance: 4']),['MANA: 0  END: 4'],'Pool labels use the wiki slider and blueprint spellings');
const unusual=['  Custom flourish: silver  ','HP: 5','HP: 7','Odd Weight: 9','STR: +2  An unsupported modifier: 8'];
for(const line of unusual)assert(format(unusual).includes(line),'Duplicate/conflicting or unknown lines are retained verbatim: '+line);
assert.deepEqual(format(['Slot: FINGER','AGI: +9  HP: +80','WT: 0.1  Size: TINY','Class: ALL','Race: ALL']),['Slot: FINGER','AGI: +9  HP: +80','WT: 0.1  Size: TINY','Class: ALL','Race: ALL']);
assert.deepEqual(format(['STR: 0','SV Void: 0']),['STR: 0','SV Void: 0'],'Explicit zero remains present while missing stats stay absent');
assert.deepEqual(format([]),[]);

const ranked={kind:'item',name:'Synthetic Ranked Relic',fields:{tier:confirmed(4),hp:confirmed(42),statLines:confirmed(['HP: 42','A ranked provenance sentence.'])}};
const proposals=proposeItemBaseReview(ranked);assert(proposals);const reviewed={...ranked,...proposals};assert(validateItemBaseReview(reviewed).ok);
const fingerprint=itemRecoveryFingerprint(reviewed),saved=structuredClone(reviewed),rankedDraft=buildContributionDraft(reviewed,blueprints);
assert.deepEqual(rankedDraft.blockers,[]);assert.match(rankedDraft.text,/HP: 29/);assert.doesNotMatch(rankedDraft.text,/HP: 42/);assert.match(rankedDraft.text,/reverse calculated from a tier 4/);assert.match(rankedDraft.text,/A ranked provenance sentence/);
assert.deepEqual(reviewed,saved);assert.equal(itemRecoveryFingerprint(reviewed),fingerprint);assert(validateItemBaseReview(reviewed).ok,'Outgoing formatting cannot invalidate or replace the saved base-recovery proof');

const existing='{{Itempage\n|itemname=Synthetic Source Only\n|statsblock=Weight: 2.5<br>\nClass: ROG\n|notes=Keep this authored layout.\n|dropsfrom=?\n}}';
assert.equal(patchContributionPrimary(existing,{kind:'item',name:'Synthetic Source Only',intent:'update',reasons:['missing-source'],fields:{}}).text,existing,'An unrelated existing-page patch does not restyle the authored card');
console.log('Item wikicode formatting: reported ring, canonical weapon labels, grouping, exact zeros/prose/flags, stable recovery evidence and narrow update preservation passed.');
