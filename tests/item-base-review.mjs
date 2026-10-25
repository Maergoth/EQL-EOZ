import assert from 'node:assert/strict';
import {itemRecoverySource,itemRecoveryFingerprint,itemBaseReviewPreview,createItemBaseReview,applyItemBaseReview,validateItemBaseReview,characterContributionFields} from '../app/item-base-review.js';
import {buildContributionDraft,normalizeContributionCandidate} from '../app/contribution-model.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {applyItemScalingRules,getItemScalingRules} from '../app/item-scaling.js';

const wrap=(value,confirmed=false)=>({value,confirmed});
const make=()=>({kind:'item',name:'Synthetic Recovery Cloak +4',title:'Synthetic Recovery Cloak',zone:'Synthetic Vale',instance:'normal',era:'Classic Era',
    playerText:'I observed this cloak in a synthetic local test.',sources:[],fields:{tier:wrap(4),fraction:wrap(0),hp:wrap(42),str:wrap(9),sta:wrap(0),delay:wrap(24),
        weight:wrap(.7),resistCorruption:wrap(4),damageBonus:wrap(41),slots:wrap(['BACK'],true),classes:wrap(['WAR'],true),races:wrap(['ALL']),
        statLines:wrap(['HP: 42','STR: 9','STA: 0','Delay: 24','Weight: 0.7','SV Void: 4','Damage Bonus: 41','A contributor note in their own words.','Effect: A synthetic sparkle.'])}});
const blueprints={revision:123,entries:{item:{text:'<onlyinclude>{{Itempage|itemname=ITEM_NAME|statsblock=}}</onlyinclude>'}}};
const settings={tier:4,fraction:0,modifiersExcluded:true,reviewed:true},choices={HP:30,STR:5,STA:-2,DELAY:24};
const original=make(),before=structuredClone(original),preview=itemBaseReviewPreview(original,{...settings});
assert.equal(preview.fields.HP.status,'exact');assert.equal(preview.fields.HP.value,30);assert.equal(preview.fields.STR.value,5);assert.equal(preview.fields.STA.status,'range');assert.equal(preview.fields.STA.value,null);
assert.equal(preview.fields.WT.status,'unknown');assert.equal(preview.fields.SV_CORRUPTION.status,'unsupported');
for(const options of [{tier:4,fraction:null,modifiersExcluded:true},{tier:4,fraction:0,modifiersExcluded:false}])assert.equal(itemBaseReviewPreview(original,options).fields.HP.status,'unknown');
for(const options of [{...settings,reviewed:false,choices},{...settings,modifiersExcluded:false,choices},{...settings,fraction:null,choices},
    {...settings,choices:{STA:1}},{...settings,choices:{WT:.7}},{...settings,choices:{SV_CORRUPTION:4}},{...settings,choices:{DMG_BONUS:41}},{...settings,choices:{}}])assert.throws(()=>createItemBaseReview(original,options));
const partial=createItemBaseReview(original,{...settings,choices:{HP:30}});assert.deepEqual(partial.choices,{HP:30},'blank ambiguous fields remain omitted instead of picking a range endpoint');
const review=createItemBaseReview(original,{...settings,choices}),patch=applyItemBaseReview(original,review);
assert.deepEqual(original,before,'preparing the review never overwrites observed fields or evidence');assert.equal(patch.fields.hp.value,42);assert.equal(patch.fields.tier.value,4);assert.equal(patch.fields.fraction.value,0);
assert.equal(patch.fields.statLines.confirmed,false,'applying base proposals still requires verification of outgoing stat text');assert.equal(patch.fields.statLines.edited,true);
assert.deepEqual(patch.fields.statLines.value,['HP: 30','STR: 5','STA: -2','Delay: 24','A contributor note in their own words.','Effect: A synthetic sparkle.','Slot: BACK','Class: WAR']);
const applied={...original,...patch};assert.equal(validateItemBaseReview(applied).ok,false,'new stat text must be verified before a recovery can bypass the base-capture guard');
const unrecoveredDraft=buildContributionDraft(original,blueprints);assert.doesNotMatch(unrecoveredDraft.text||'',/HP: 42|STR: 9|Weight: 0\.7/,'An optional unrecovered tiered item cannot leak its observed numeric values as wiki bases');
assert(buildContributionDraft(applied,blueprints).blockers.some(value=>/Verify the recovered base stat text/.test(value)),'unverified generated stat text cannot be published');
const confirmed={...applied,fields:{...applied.fields,statLines:{...applied.fields.statLines,confirmed:true}}},draft=buildContributionDraft(confirmed,blueprints);
assert.equal(validateItemBaseReview(normalizeContributionCandidate(confirmed)).ok,true,'normalization preserves the verified review contract');
assert.deepEqual(draft.blockers,[]);assert.match(draft.text,/HP: 30<br>/);assert.match(draft.text,/STA: -2/);assert.match(draft.text,/These stats are reverse calculated from a tier 4 item\. Please confirm with a tier 0 item and remove this message/);assert.match(draft.text,/A contributor note in their own words/);
assert.doesNotMatch(draft.text,/HP: 42|Weight: 0\.7|SV Void: 4|Damage Bonus: 41/,'omitted observed/unsupported numbers never enter the recovered wiki stat block');
assert(draft.warnings.some(value=>/Unresolved base statistics/.test(value)));

for(const mutate of [candidate=>candidate.name='A different synthetic item',candidate=>candidate.fields.hp.value=43,candidate=>candidate.fields.tier.value=5,candidate=>candidate.fields.fraction.value=1,
    candidate=>candidate.fields.modified=wrap(true),candidate=>candidate.fields.augmentNames=wrap(['Synthetic Rune'])]){
    const changed=structuredClone(confirmed);mutate(changed);assert.notEqual(itemRecoveryFingerprint(changed),review.sourceFingerprint);assert.equal(validateItemBaseReview(changed).ok,false);assert(buildContributionDraft(changed,blueprints).blockers.length>0);
}
for(const values of [confirmed.fields.statLines.value.map(line=>line==='HP: 30'?'HP: 31':line),confirmed.fields.statLines.value.filter(line=>line!=='HP: 30'),[...confirmed.fields.statLines.value,'HP: 30'],[...confirmed.fields.statLines.value,'SV Void: 4']]){
    const changed={...confirmed,fields:{...confirmed.fields,statLines:wrap(values,true)}};assert.equal(validateItemBaseReview(changed).ok,false);assert(buildContributionDraft(changed,blueprints).blockers.length>0);
}
// Numeric annotations are still stat observations, not safe contributor prose.
// They must not survive beside a recovered base or bypass omission validation.
const annotated=make();annotated.fields.statLines.value.push('HP: 42 (observed)','Weight: 0.7 (observed)','Damage Bonus: 41 @ lvl 50');
const annotatedPatch=applyItemBaseReview(annotated,createItemBaseReview(annotated,{...settings,choices}));
assert.doesNotMatch(annotatedPatch.fields.statLines.value.join('\n'),/42 \(observed\)|0\.7 \(observed\)|41 @ lvl/);
const inserted={...confirmed,fields:{...confirmed.fields,statLines:wrap([...confirmed.fields.statLines.value,'Weight: 0.7 (observed)'],true)}};
assert.equal(validateItemBaseReview(inserted).ok,false,'an annotated unsupported number cannot be smuggled into otherwise reviewed stat text');
// Common examine notation is still numeric evidence without a colon. Applying
// a recovery must remove it, and adding it afterward must invalidate review.
for(const line of ['HP 42 (observed)','Weight 0.7 (observed)','STR +9 (observed)','HP = 42 (observed)','Weight = 0.7 (observed)','Damage Bonus = 41 @ lvl 50']){
    const source=make(),prose=['A separate contributor-authored fixture note.','HP remains an observation until reviewed.'];
    source.fields.statLines.value.push(line,...prose);const originalSource=structuredClone(source);
    const proposal=applyItemBaseReview(source,createItemBaseReview(source,{...settings,choices}));
    assert.equal(proposal.fields.statLines.value.includes(line),false,`${line}: observed or unsupported numbers cannot survive as base-stat prose`);
    for(const note of prose)assert.ok(proposal.fields.statLines.value.includes(note),'ordinary contributor prose remains intact');
    assert.deepEqual(source,originalSource,'recovery leaves original observed fields and text available as evidence');
    assert.ok(proposal.fields.statLines.value.includes('HP: 30'));
    const changed={...confirmed,fields:{...confirmed.fields,statLines:wrap([...confirmed.fields.statLines.value,line],true)}};
    assert.equal(validateItemBaseReview(changed).ok,false,`${line}: a prior review cannot accept newly inserted numeric evidence`);
    assert.ok(buildContributionDraft(changed,blueprints).blockers.length>0);
}
// Full examine labels use the same review boundary as abbreviations. Cover
// every attribute and each accepted separator, including omitted regeneration.
for(const [label,field,key]of [
    ['Strength','str','STR'],['Stamina','sta','STA'],['Agility','agi','AGI'],['Dexterity','dex','DEX'],
    ['Wisdom','wis','WIS'],['Intelligence','int','INT'],['Charisma','cha','CHA'],
    ['HP Regeneration','hpRegen',null],['Mana Regeneration','manaRegen',null],['Endurance Regeneration','enduranceRegen',null]
])for(const separator of [': ',' = ',' ']){
    const line=`${label}${separator}+9 (observed)`,note=`${label} remains an observation until reviewed.`,source=make();
    source.fields[field]=wrap(9);source.fields.statLines.value.push(line,note);const originalSource=structuredClone(source);
    const selected={HP:30,...(key?{[key]:5}:{})};
    const proposal=applyItemBaseReview(source,createItemBaseReview(source,{...settings,choices:selected}));
    assert.equal(proposal.fields.statLines.value.includes(line),false,`${line}: full labels cannot survive as base-stat prose`);
    assert.ok(proposal.fields.statLines.value.includes(note),`${label}: ordinary contributor prose remains intact`);
    assert.deepEqual(source,originalSource,`${label}: observed source values and text remain available as evidence`);
    if(key)assert.ok(proposal.fields.statLines.value.includes(`${key}: 5`),`${label}: only the reviewed canonical base is emitted`);
    const reviewed={...source,...proposal,fields:{...proposal.fields,statLines:{...proposal.fields.statLines,confirmed:true}}};
    assert.equal(validateItemBaseReview(reviewed).ok,true,`${line}: the cleaned review is valid`);
    const changed={...reviewed,fields:{...reviewed.fields,statLines:wrap([...reviewed.fields.statLines.value,line],true)}};
    assert.equal(validateItemBaseReview(changed).ok,false,`${line}: inserting observed numbers invalidates the review`);
    assert.ok(buildContributionDraft(changed,blueprints).blockers.length>0,`${line}: publishing remains blocked`);
}
// A pre-existing confirmed legacy statsblock cannot bypass verification of the
// newly generated statLines or publish the old upgraded observed values.
const legacy={...original,fields:{...original.fields,statsblock:wrap('HP: 42',true)}},legacyPatch=applyItemBaseReview(legacy,createItemBaseReview(legacy,{...settings,choices}));
assert(buildContributionDraft({...legacy,...legacyPatch},blueprints).blockers.length>0,'legacy confirmed statsblock cannot publish while generated statLines remain unverified');

const memory=new Map(),storage={getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)},queue=()=>createContributionQueue({storage,getPack:()=>({})});
let q=queue();const queued=q.add({kind:original.kind,name:original.name,zone:original.zone,fields:Object.fromEntries(Object.entries(original.fields).map(([key,field])=>[key,field.value]))},true);
q.update(queued.id,{...original,...patch,fields:confirmed.fields});q=queue();let restored=q.snapshot().find(candidate=>candidate.id===queued.id);
assert.equal(validateItemBaseReview(restored).ok,true);assert.deepEqual(restored.baseRecovery.choices,choices);assert.equal(restored.fields.hp.value,42);assert.equal(restored.fields.statLines.confirmed,true);
const observe=(sequence,hp)=>({id:`synthetic-observation-${sequence}`,sequence,owner:'contribution',kind:'ocr',subject:{kind:'item',name:original.name},input:{zone:original.zone},fields:[{key:'tier',value:4},{key:'fraction',value:0},{key:'hp',value:hp}],capturedAt:'2026-10-22T00:00:00Z'});
q.consume(observe(1,42));assert.equal(validateItemBaseReview(q.snapshot().find(candidate=>candidate.id===queued.id)).ok,true,'replaying identical evidence preserves the saved review');
q.consume(observe(2,43));q=queue();restored=q.snapshot().find(candidate=>candidate.id===queued.id);assert.equal(validateItemBaseReview(restored).ok,false,'fresh changed observed stats invalidate persisted base choices');assert.equal(restored.fields.statLines.value[0],'HP: 30','invalidating a review preserves editable contributor text');assert(buildContributionDraft(restored,blueprints).blockers.length>0);
const converted=characterContributionFields({tier:4,fraction:null,slots:['BACK'],augmentStatus:'unknown',observedStats:{HP:42,DMG_BONUS:41,SV_CORRUPTION:4}});
assert.equal(converted.fraction,null);assert.equal(converted.augmented,true);assert.equal(converted.hp,42);assert.equal(converted.damageBonus,41);assert.equal(converted.resistCorruption,4);assert.deepEqual(itemRecoverySource({fields:Object.fromEntries(Object.entries(converted).map(([key,value])=>[key,wrap(value)]))}).observed,{HP:42,SV_CORRUPTION:4,DMG_BONUS:41});
const backstabSource={kind:'item',name:'Synthetic Backstab Blade',fields:{tier:wrap(5),fraction:wrap(4),backstabDamage:wrap(15),statLines:wrap(['Backstab DMG: 15'])}};
const backstabReview=createItemBaseReview(backstabSource,{tier:5,fraction:4,modifiersExcluded:true,reviewed:true,choices:{BACKSTAB_DMG:12}});
assert.deepEqual(backstabReview.choices,{BACKSTAB_DMG:12});assert.equal(applyItemBaseReview(backstabSource,backstabReview).fields.statLines.value[0],'Backstab DMG: 12');
const previousRules=getItemScalingRules(),fingerprint=itemRecoveryFingerprint(confirmed);
applyItemScalingRules({...previousRules,revision:previousRules.revision+1,backstab:{divisor:25}});
assert.notEqual(itemRecoveryFingerprint(confirmed),fingerprint,'Saved recovery depends on the canonical rule identity');
assert.equal(validateItemBaseReview(confirmed).ok,false,'A rule update invalidates a previously reviewed calculation before publication');
console.log('Item base review: explicit exact/range choices, context/source/stat invalidation, preserved prose and observations, verified outgoing text, inference markers and replay persistence passed.');
