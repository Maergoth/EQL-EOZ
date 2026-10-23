import assert from 'node:assert/strict';
import { CHARACTER_SLOTS, CHARACTER_LIMITS, CHARACTER_STORAGE_KEY, createCharacterModel, characterAutoAssignment, characterItemStats, characterObservationInput, characterShareSummary, characterSlotCompatibility, characterStatLabel, normalizeCharacterStats, safeCharacterIcon } from '../app/character-model.js';
import { CHARACTER_SHARE_LIMITS, characterShareLayout } from '../app/character-share.js';

const memory=()=>{const data=new Map();return {getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};};
const storage=memory(),model=createCharacterModel({storage,now:()=>12345});
const item=(name='Synthetic Ring',extra={})=>({id:`observation-${name}`,sessionId:'synthetic-session',source:'synthetic-examine',at:12300,text:'PRIVATE_SYNTHETIC_EVIDENCE',item:{name,slots:['FINGER'],tier:0,stats:{HP:10,STR:2},statsComplete:true,augmentStatus:'none',...extra}});
assert.equal(CHARACTER_SLOTS.length,23);
assert.equal(new Set(CHARACTER_SLOTS.map(slot=>slot.id)).size,23);
for(const kind of ['EAR','WRIST','FINGER']) assert.equal(CHARACTER_SLOTS.filter(slot=>slot.kind===kind).length,2);
assert.deepEqual(normalizeCharacterStats({HP:'100',MP:'unknown',STR:Infinity,AC:null,constructor:5}),{HP:100,MP:null,STR:null,AC:null,CONSTRUCTOR:5});
assert.equal(safeCharacterIcon('https://invalid.test/tracker.png'),'');
assert.equal(safeCharacterIcon('data:image/svg+xml;base64,PHN2Zz4='),'');
const adapted=characterObservationInput({subject:{name:'Observed Charm'},fields:[{key:'slots',value:['CHARM']},{key:'tier',value:10},{key:'hp',value:999},{key:'manaMaximum',value:650},{key:'augmentNames',value:['Synthetic Ruby']},{key:'effects',value:'unmeasured'}]});
assert.deepEqual(adapted.stats,{HP:999,MP_MAXIMUM:650});
assert.equal(adapted.augments[0].name,'Synthetic Ruby');
assert.equal(adapted.augmentStatus,'unknown');

// Synthetic default_modern producer/consumer contract, never live player data.
const proposal=(id,kind,values)=>({id,owner:'character',sessionId:'synthetic-modern',subject:{kind,name:kind==='item'?'Synthetic Modern piece +6':''},fields:Object.entries(values).map(([key,value])=>({key,value,raw:String(value)}))});
const modernStorage=memory(),modernModel=createCharacterModel({storage:modernStorage});
for(const [index,slot,label]of [[0,'feet','Feet'],[1,'primary','Primary'],[2,'finger1','Fingers']]){
    const observed=proposal(`modern-${index}`,'item',{tier:6,fraction:18,fractionMaximum:64,slots:[label],requiredLevel:20,hp:23,damage:9,damageBonus:4,delay:24,attack:77,attackSpeed:12}),originalFields=structuredClone(observed.fields);
    const input=characterObservationInput(observed);assert.equal(input.fraction,18);assert.equal(input.stats.ATK,77);assert.equal(input.stats.ATTACK_SPEED,12);assert.equal(input.stats.HASTE,undefined,'Observed Attack Speed is not inferred to be Haste');
    const card=modernModel.intake(observed,{wikiItem:{name:'Synthetic Modern piece',slots:[label],stats:{HP:100}}}).candidate;
    assert.equal(card.fraction,18);assert.equal(card.observedStats.HP,23,'Known catalog values do not rescale observed examine stats');
    assert.equal(card.observedStats.DMG_BONUS,4);assert.equal(card.observedStats.DMG,9,'Damage Bonus is not added to observed damage or rescaled');assert.equal(card.observedStats.DELAY,24);
    assert.deepEqual(observed.fields,originalFields,'Adapter intake never rewrites original observed fields');
    assert.equal(modernModel.assign(card.id,slot).ok,true,`${label} observations fit the named slot`);
    assert.equal(modernModel.updateCandidate(card.id,{augmentStatus:'none',observedStatsComplete:true}).ok,true);
}
const modernStatValues={hpCurrent:20,hpMaximum:100,manaCurrent:12,manaMaximum:40,enduranceCurrent:3,enduranceMaximum:50,str:9,sta:10,agi:11,dex:12,wis:13,int:14,cha:15,resistMagic:16,resistPoison:17,resistDisease:18,resistFire:19,resistCold:21,resistCorruption:22,attack:77};
const modernStats=characterObservationInput(proposal('modern-stats','character',modernStatValues)).stats;
assert.deepEqual(modernStats,{STR:9,STA:10,AGI:11,DEX:12,WIS:13,INT:14,CHA:15,SV_POISON:17,SV_MAGIC:16,SV_DISEASE:18,SV_FIRE:19,SV_COLD:21,SV_CORRUPTION:22,HP_CURRENT:20,HP_MAXIMUM:100,MP_CURRENT:12,MP_MAXIMUM:40,END_CURRENT:3,END_MAXIMUM:50,ATK:77});
assert.equal(modernStats.HP,undefined,'Resource maximum does not replace an independently observed HP total');
modernModel.setStatSnapshot('base',{stats:modernStats,confirmed:true});
modernModel.setStatSnapshot('equipped',{stats:{...modernStats,HP_MAXIMUM:250},confirmed:true});
const modernRestored=createCharacterModel({storage:modernStorage}),modernSummary=characterShareSummary(modernRestored.snapshot());
assert.equal(modernSummary.stats.base.stats.HP_MAXIMUM,100);assert.equal(modernSummary.stats.equipped.stats.HP_MAXIMUM,250);
assert.equal(modernSummary.stats.derived.HP.value,69,'Derived gear sums remain separate from observed current/maximum values');
for(const slot of ['feet','primary','finger1']){const entry=modernSummary.equipment.find(entry=>entry.slot===slot);assert.equal(entry.item.fraction,18);assert.equal(entry.item.stats.ATK,77);assert.equal(entry.item.stats.ATTACK_SPEED,12);assert.equal(entry.item.stats.DMG_BONUS,4);assert.equal(entry.item.stats.DMG,9);assert.equal(entry.item.stats.DELAY,24);assert.equal(entry.item.stats.HP,23);}
assert(characterShareLayout(modernRestored.snapshot()).height<=CHARACTER_SHARE_LIMITS.maxHeight,'Modern keys remain within the complete share layout');
assert.equal(characterObservationInput(proposal('legacy-tier','item',{tier:10})).fraction,undefined,'A tier alone never invents fractional progress');

// Guided Character work uses a no-equipment observation, not a mandatory
// equipped capture. These fresh numbers/strings are entirely synthetic.
const guidedStorage=memory(),guided=createCharacterModel({storage:guidedStorage,now:()=>12345});
guided.setMetadata({name:'Synthetic Guide',server:'Synthetic Server',classes:['WAR','CLR','WAR'],level:47,aaCount:123});
assert.deepEqual(guided.snapshot().metadata.classes,['WAR','CLR']);assert.equal(guided.snapshot().metadata.aaCount,123);
guided.setMetadata({aaCount:''});assert.equal(guided.snapshot().metadata.aaCount,null,'Blank AA count stays unknown');
for(const invalid of [-1,2.5,Infinity]){guided.setMetadata({aaCount:invalid});assert.equal(guided.snapshot().metadata.aaCount,null);}
guided.setMetadata({aaCount:0});assert.equal(guided.snapshot().metadata.aaCount,0,'An explicit zero AA count survives');
const componentValues={acMitigation:82,acMitigationSoftcap:141,acEvasion:116,attackOffense:73,attackAccuracy:99,haste:0,
    hpCurrent:115,hpMaximum:235,manaCurrent:35,manaMaximum:110,enduranceCurrent:67,enduranceMaximum:180,str:61,agi:65,resistFire:11};
const componentInput=characterObservationInput(proposal('synthetic-components','character',componentValues));
assert.equal(componentInput.stats.AC,undefined);assert.equal(componentInput.stats.ATK,undefined,'Distinct components do not invent a generic total');
assert.deepEqual(Object.fromEntries(['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','ATK_OFFENSE','ATK_ACCURACY','HASTE'].map(key=>[key,componentInput.stats[key]])),
    {AC_MITIGATION:82,AC_MITIGATION_SOFTCAP:141,AC_EVASION:116,ATK_OFFENSE:73,ATK_ACCURACY:99,HASTE:0});
assert.deepEqual(['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','ATK_OFFENSE','ATK_ACCURACY'].map(characterStatLabel),['Mitigation AC','AC softcap','Evasion AC','Offense','Accuracy']);
guided.setStatSnapshot('base',{stats:componentInput.stats,confirmed:true});
assert.equal(guided.totals().computed.AC_MITIGATION.value,82,'No assigned gear retains the observed baseline');
const syntheticRaw='Description\nSynthetic Guide Ring\nClass: ALL\nFingers\nHP 17\nUnknown effect: synthetic only';
const guidedObservation=proposal('guided-ring-a','item',{slots:['Fingers'],hp:17,mana:6,endurance:8,str:3,agi:2,resistFire:4,ac:9,attack:5,haste:12,rawStatBlock:syntheticRaw});
const guidedA=guided.intake(guidedObservation,{autoAssign:true});
assert.equal(guidedA.assignment.slot,'finger1');assert.equal(guidedA.candidate.rawStatBlock,syntheticRaw);
assert.equal(guidedA.candidate.observedStatsComplete,false,'Auto placement does not certify OCR stats');
guided.updateCandidate(guidedA.candidate.id,{observedStatsComplete:true,augmentStatus:'included'});
const guidedB=guided.intake({...guidedObservation,id:'guided-ring-b'},{autoAssign:true});
assert.notEqual(guidedA.candidate.id,guidedB.candidate.id);assert.equal(guidedB.assignment.slot,'finger2','A second physical copy takes the free paired slot');
guided.updateCandidate(guidedB.candidate.id,{observedStatsComplete:true,augmentStatus:'none'});
const guidedC=guided.intake({...guidedObservation,id:'guided-ring-c'},{autoAssign:true});
assert.equal(guidedC.assignment.assigned,false);assert.equal(guidedC.assignment.reason,'occupied','Auto placement never replaces either paired copy');
assert.equal(guided.autoAssign(guidedA.candidate.id).reason,'already-assigned');
for(const [slots,reason]of [[['PRIMARY','SECONDARY'],'multiple-slot-kinds'],[['ANY'],'any-slot'],[['ANY','HEAD'],'any-slot'],[[],'unknown-slots']]){
    const card=guided.intake(item(`Deferred ${reason} ${slots.join('-')}`,{slots}),{autoAssign:true});
    assert.equal(card.assignment.assigned,false);assert.equal(card.assignment.reason,reason);
}
const any=guided.snapshot().candidates.find(card=>card.slots.includes('ANY'));
assert.equal(characterSlotCompatibility(any,'head').compatible,true,'ANY remains available for explicit manual review');
assert.equal(characterAutoAssignment(guided.snapshot(),'missing').ok,false);
const guidedTotals=guided.totals();
assert.equal(guidedTotals.equipped,null,'An equipped capture is not needed to calculate estimates');
assert.equal(guidedTotals.computed.HP_MAXIMUM.value,269);assert.equal(guidedTotals.computed.HP_MAXIMUM.gearKey,'HP');
assert.equal(guidedTotals.computed.MP_MAXIMUM.value,122);assert.equal(guidedTotals.computed.END_MAXIMUM.value,196);
assert.equal(guidedTotals.computed.STR.value,67);assert.equal(guidedTotals.computed.SV_FIRE.value,19);assert.equal(guidedTotals.computed.STR.complete,true);
assert.equal(guidedTotals.computed.HP_CURRENT.value,null,'Gear never predicts current HP');assert.equal(guidedTotals.computed.HP_CURRENT.baseValue,115);
for(const key of ['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION','ATK_OFFENSE','ATK_ACCURACY','HASTE']){
    assert.equal(guidedTotals.computed[key].value,null,`${key} is not a base+item-stat conversion`);assert.equal(guidedTotals.computed[key].method,'formula-unknown');
}
assert.equal(guidedTotals.computed.AC_MITIGATION.baseValue,82);assert.equal(guidedTotals.derived.AC.value,18);assert.equal(guidedTotals.derived.ATK.value,10);
assert(guidedTotals.computed.HP_MAXIMUM.caveats.some(text=>text.includes('percentage AA')));
guided.updateCandidate(guidedB.candidate.id,{augmentStatus:'unknown'});
assert.equal(guided.totals().computed.HP_MAXIMUM.complete,false);assert.equal(guided.totals().computed.HP_MAXIMUM.value,269,'Known additive subtotal remains visibly partial');
assert.deepEqual(guided.totals().computed.HP_MAXIMUM.unknownCandidates,[guidedB.candidate.id]);
guided.removeCandidate(guidedB.candidate.id);assert.equal(guided.totals().computed.HP_MAXIMUM.value,252,'Removing gear immediately updates the estimate');
guided.unassign('finger1');assert.equal(guided.totals().computed.HP_MAXIMUM.value,235);assert.equal(guided.totals().computed.ATK_OFFENSE.value,73);
guided.autoAssign(guidedA.candidate.id);
guided.setStatSnapshot('equipped',{stats:{HP_MAXIMUM:999},confirmed:true});
const guidedRestored=createCharacterModel({storage:guidedStorage}),guidedSummary=characterShareSummary(guidedRestored.snapshot());
assert.equal(guidedSummary.stats.computed.HP_MAXIMUM.value,252);assert.equal(guidedSummary.stats.equipped.stats.HP_MAXIMUM,999,'Optional prior capture stays independent');
assert.equal(guidedRestored.snapshot().candidates.find(card=>card.id===guidedA.candidate.id).rawStatBlock,syntheticRaw,'Complete scoped text survives persistence');
assert.equal(JSON.stringify(guidedSummary).includes('Unknown effect: synthetic only'),false,'Private raw OCR block is not included in share JSON');
const oversizedRaw=Array.from({length:100},(_,index)=>`${index} ${'x'.repeat(200)}`).join('\n');
guided.updateCandidate(guidedA.candidate.id,{rawStatBlock:oversizedRaw});
const boundedRaw=guided.snapshot().candidates.find(card=>card.id===guidedA.candidate.id).rawStatBlock;
assert(boundedRaw.length<=8192&&boundedRaw.split('\n').length<=60,'Editable raw text has independent line and character bounds');
const beforeBegin=guided.snapshot(),begin=guided.beginSnapshot({name:'Synthetic next guide'}),afterBegin=guided.snapshot();
assert.equal(begin.ok,true);assert.deepEqual(afterBegin.equipment,{});assert.equal(afterBegin.statSnapshots.base,null);
assert.deepEqual(afterBegin.candidates,beforeBegin.candidates,'Starting a fresh guided snapshot keeps the inventory and edited raw text');
assert.deepEqual(afterBegin.removedObservations,beforeBegin.removedObservations);assert.deepEqual(afterBegin.statSnapshots.equipped,beforeBegin.statSnapshots.equipped);
assert.equal(afterBegin.metadata.name,'Synthetic next guide');assert.equal(afterBegin.metadata.aaCount,0);

const mergeStorage=memory(),mergeModel=createCharacterModel({storage:mergeStorage,now:()=>12345});
const captured=(id,values)=>({...proposal(id,'item',values),kind:'ocr',parser:{name:'item-examine',version:1},capturedAt:'2026-10-23T12:00:00.000Z'});
const originalMerge=captured('merge-original',{name:'Synthetic editable item',slots:['HEAD'],tier:2,fraction:1,hp:31,mana:14,wis:3,rawStatBlock:'Original synthetic pane'});
const mergedCard=mergeModel.intake(originalMerge,{autoAssign:true}).candidate;
assert.equal(mergeModel.snapshot().equipment.head,mergedCard.id);
const improved=captured('merge-improved',{name:'Untrusted changed title',slots:['FEET'],tier:3,hp:35,mana:null,haste:9,rawStatBlock:'Improved complete synthetic pane\nUnknown label still retained'}),immutableImproved=structuredClone(improved);
const improvedResult=mergeModel.mergeObservation(mergedCard.id,improved,{wikiItem:{name:'Synthetic catalog title',stats:{HP:999,STR:222},iconId:'Exact_Synthetic'}});
assert.equal(improvedResult.ok,true);assert.equal(improvedResult.candidate.id,mergedCard.id);assert.equal(improvedResult.candidate.name,'Synthetic editable item');
assert.equal(improvedResult.candidate.observedStats.HP,35);assert.equal(improvedResult.candidate.observedStats.MP,null,'An explicitly conflicted observed value clears the stale number');
assert.equal(improvedResult.candidate.observedStats.HASTE,9);assert.equal(improvedResult.candidate.observedStats.WIS,3,'An absent new field does not erase a prior read');
assert.equal(improvedResult.candidate.observedStats.STR,undefined,'Catalog base fields never become observed examine values');assert.equal(improvedResult.candidate.baseStats.STR,222);
assert.equal(improvedResult.candidate.tier,3);assert.equal(improvedResult.candidate.fraction,null,'A changed tier cannot reuse a numerator with the old denominator');
assert.equal(improvedResult.candidate.rawStatBlock,'Improved complete synthetic pane\nUnknown label still retained');assert.deepEqual(improvedResult.candidate.slots,['FEET']);
assert.equal(mergeModel.snapshot().equipment.head,mergedCard.id,'Recapture preserves the exact slot even when new compatibility differs');
assert.equal(mergeModel.autoAssign(mergedCard.id).reason,'already-assigned');assert.deepEqual(improved,immutableImproved,'Recapture does not mutate the parser proposal');
const evidenceLength=improvedResult.candidate.evidence.length;mergeModel.mergeObservation(mergedCard.id,improved);assert.equal(mergeModel.snapshot().candidates[0].evidence.length,evidenceLength,'Repeated proposal evidence is idempotent');
mergeModel.updateCandidate(mergedCard.id,{observedStats:{HP:123,HASTE:9},slots:['HEAD'],tier:4,fraction:2,rawStatBlock:'Manually corrected synthetic block',notes:'Keep manual notes',wikiTitle:'Manual identity',wikiMatch:'confirmed'});
const afterEdit=mergeModel.mergeObservation(mergedCard.id,captured('merge-after-edit',{hp:777,mana:88,wis:7,haste:99,resistFire:15,slots:['FEET'],tier:6,fraction:18,rawStatBlock:'A later automated block'}));
assert.equal(afterEdit.candidate.observedStats.HP,123);assert.equal(afterEdit.candidate.observedStats.HASTE,9);
assert.equal(afterEdit.candidate.observedStats.MP,undefined);assert.equal(afterEdit.candidate.observedStats.WIS,undefined,'Deliberate stat removals remain removed');
assert.equal(afterEdit.candidate.observedStats.SV_FIRE,15,'A newly observed, previously unedited key still fills a gap');
assert.deepEqual(afterEdit.candidate.slots,['HEAD']);assert.equal(afterEdit.candidate.tier,4);assert.equal(afterEdit.candidate.fraction,2);
assert.equal(afterEdit.candidate.rawStatBlock,'Manually corrected synthetic block');assert.equal(afterEdit.candidate.notes,'Keep manual notes');assert.equal(afterEdit.candidate.wikiTitle,'Manual identity');assert.equal(afterEdit.candidate.wikiMatch,'confirmed');
assert(afterEdit.preservedStatKeys.includes('HP'));assert(afterEdit.mergedStatKeys.includes('SV_FIRE'));
const mergeRestart=createCharacterModel({storage:mergeStorage,now:()=>12346});
const afterRestart=mergeRestart.mergeObservation(mergedCard.id,captured('merge-restarted',{hp:555,mana:55,attackSpeed:18}));
assert.equal(afterRestart.candidate.observedStats.HP,123);assert.equal(afterRestart.candidate.observedStats.MP,undefined);assert.equal(afterRestart.candidate.observedStats.ATTACK_SPEED,18,'Edit protection and new-key merging persist after restart');
assert.equal(afterRestart.candidate.evidence.at(-1).at,Date.parse('2026-10-23T12:00:00.000Z'));
for(let index=0;index<10;index++)mergeRestart.mergeObservation(mergedCard.id,captured(`merge-bound-${index}`,{attackSpeed:18+index}));
assert.equal(mergeRestart.snapshot().candidates[0].evidence.length,CHARACTER_LIMITS.evidence);
assert.equal(mergeRestart.mergeObservation('missing',improved).ok,false);
const legacyManualStorage=memory();legacyManualStorage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify({schemaVersion:1,candidates:[{id:'legacy-manual',name:'Synthetic old manual',observedStats:{HP:11},evidence:[]}]}));
const legacyManual=createCharacterModel({storage:legacyManualStorage});
assert.equal(legacyManual.mergeObservation('legacy-manual',captured('legacy-new',{hp:99,haste:5})).candidate.observedStats.HP,11,'Old manual values without capture evidence are conservatively retained');
assert.equal(legacyManual.mergeObservation('legacy-manual',captured('legacy-newer',{hp:100})).candidate.observedStats.HP,11,'Legacy protection remains after the first captured evidence is appended');
assert.equal(legacyManual.snapshot().candidates[0].observedStats.HASTE,5);
assert.equal(JSON.stringify(characterShareSummary(mergeRestart.snapshot())).includes('editedStatKeys'),false,'Local edit tracking is not public share metadata');

// Exact observation identities outlive the six text evidence records. Real
// journal sequences also prevent resurrection when bounded references expire.
const replayStorage=memory(),replayModel=createCharacterModel({storage:replayStorage,now:()=>12345});
const journalItem=(id,sequence,sessionId='synthetic-reference-session')=>({...captured(id,{name:'Synthetic replay item',slots:['HEAD'],hp:19}),sessionId,sequence});
const replayFirst=journalItem('reference-first',1),replayCard=replayModel.intake(replayFirst).candidate;
for(let index=0;index<12;index++)replayModel.mergeObservation(replayCard.id,journalItem(`reference-later-${index}`,index+2));
assert.equal(replayModel.snapshot().candidates[0].evidence.length,6);assert.equal(replayModel.snapshot().observationRefs.length,13);
const replayRestart=createCharacterModel({storage:replayStorage});
assert.equal(replayRestart.intake(replayFirst).candidate.id,replayCard.id,'An original ID still deduplicates after its evidence text expired');
assert.equal(replayRestart.snapshot().candidates.length,1);
const unrelated=replayRestart.intake(journalItem('unrelated-copy',14)).candidate;
assert.notEqual(unrelated.id,replayCard.id,'A fresh ID never merges physical copies by identical name or stats');
assert.equal(replayRestart.mergeObservation(unrelated.id,replayFirst).ok,false,'Explicit recapture cannot reassign another card\'s observation identity');
replayRestart.removeCandidate(replayCard.id);
const removedReplay=createCharacterModel({storage:replayStorage});
assert.equal(removedReplay.intake(replayFirst).ignored,true,'X removal suppresses old exact IDs beyond six evidence records after restart');
assert.equal(removedReplay.mergeObservation(unrelated.id,replayFirst).ignored,true,'A discarded old read cannot be merged into another physical copy');
assert.equal(removedReplay.intake(journalItem('fresh-after-remove',15)).deduplicated,false,'A new capture after removal remains available');
assert.equal(removedReplay.intake(journalItem('reference-first',16,'another-synthetic-session')).deduplicated,false,'ID equality in a different capture session does not conflate copies');
assert.equal(JSON.stringify(characterShareSummary(removedReplay.snapshot())).includes('observationRefs'),false,'Private identity references never enter share JSON');

const referenceStorage=memory(),referenceCandidate={id:'retained-reference-copy',name:'Synthetic retained copy',slots:['HEAD'],observedStats:{HP:4},augmentStatus:'none'};
const references=Array.from({length:CHARACTER_LIMITS.observationRefs},(_,index)=>({observationId:`journal-${index+1}`,sessionId:'synthetic-long-journal',candidateId:referenceCandidate.id,sequence:index+1}));
referenceStorage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify({schemaVersion:1,candidates:[referenceCandidate],observationRefs:references}));
const manyReferences=createCharacterModel({storage:referenceStorage});
assert.equal(manyReferences.intake(journalItem('journal-1',1,'synthetic-long-journal')).candidate.id,referenceCandidate.id);
manyReferences.mergeObservation(referenceCandidate.id,journalItem('journal-overflow',CHARACTER_LIMITS.observationRefs+1,'synthetic-long-journal'));
assert.equal(manyReferences.snapshot().observationRefs.length,CHARACTER_LIMITS.observationRefs);assert.equal(manyReferences.snapshot().observationFloor,1);
const boundedReferences=createCharacterModel({storage:referenceStorage});
assert.equal(boundedReferences.intake(journalItem('journal-1',1,'synthetic-long-journal')).ignored,true,'Evicted metadata expires old journal replay instead of creating another card');
boundedReferences.removeCandidate(referenceCandidate.id);
const longRemoved=createCharacterModel({storage:referenceStorage});
assert.equal(longRemoved.intake(journalItem('journal-500',500,'synthetic-long-journal')).ignored,true,'Removal covers more than1000 exact journal IDs');
assert.equal(longRemoved.intake(journalItem(`journal-${CHARACTER_LIMITS.observationRefs}`,CHARACTER_LIMITS.observationRefs,'synthetic-long-journal')).ignored,true);
assert.equal(longRemoved.intake(journalItem('fresh-long-journal',CHARACTER_LIMITS.observationRefs+2,'synthetic-long-journal')).deduplicated,false);
longRemoved.reset();const afterReferenceReset=createCharacterModel({storage:referenceStorage});assert.equal(afterReferenceReset.intake(replayFirst).ignored,true,'Reset keeps the bounded journal floor');
assert.equal(afterReferenceReset.intake({item:{name:'Synthetic manual after reset'}}).ok,true,'The replay floor does not block a fresh manual add');

// ID metadata shares the total storage budget and yields before item cards.
const pressureStorage=memory(),pressureReferences=[];
let pressureSeed={schemaVersion:1,candidates:[referenceCandidate],observationRefs:pressureReferences};
for(let index=1;index<=4500;index++)pressureReferences.push({observationId:'r'.repeat(140)+index,sessionId:'s'.repeat(100),candidateId:referenceCandidate.id,sequence:index});
while(JSON.stringify(pressureSeed).length>CHARACTER_LIMITS.storageBytes-10000)pressureReferences.pop();
pressureStorage.setItem(CHARACTER_STORAGE_KEY,JSON.stringify(pressureSeed));
const pressureModel=createCharacterModel({storage:pressureStorage}),beforeReferencePressure=pressureModel.snapshot().observationRefs.length;
const pressureStats=Object.fromEntries(Array.from({length:48},(_,index)=>[`SYNTHETIC_STAT_${String(index).padStart(17,'0')}`,1000000000]));
pressureModel.updateCandidate(referenceCandidate.id,{rawStatBlock:'x'.repeat(8192),icon:'data:image/png;base64,'+'A'.repeat(23970),baseStats:pressureStats,augments:Array.from({length:8},()=>({name:'Synthetic bounded augment',stats:pressureStats,statsComplete:true}))});
const afterReferencePressure=pressureModel.snapshot();assert.equal(afterReferencePressure.candidates.length,1,'Inventory is preserved before expiring ID-only metadata');
assert(afterReferencePressure.observationRefs.length<beforeReferencePressure);assert(afterReferencePressure.observationFloor>0);assert(pressureStorage.getItem(CHARACTER_STORAGE_KEY).length<=CHARACTER_LIMITS.storageBytes);
const pressureRestart=createCharacterModel({storage:pressureStorage});assert.equal(pressureRestart.intake(journalItem('r'.repeat(140)+'1',1,'s'.repeat(100))).ignored,true,'Storage pressure expiration remains replay-safe after reload');
const progressStorage=memory(),progressModel=createCharacterModel({storage:progressStorage});
const unknownProgress=progressModel.intake({id:'unread-progress',sessionId:'synthetic',item:{name:'Synthetic Progress',instanceKey:'same-copy',tier:6,baseStats:{HP:100},baseStatsComplete:true,augmentStatus:'none'}}).candidate;
const zeroProgress=progressModel.intake({id:'explicit-zero-progress',sessionId:'synthetic',item:{name:'Synthetic Progress',instanceKey:'same-copy',tier:6,fraction:0,baseStats:{HP:100},baseStatsComplete:true,augmentStatus:'none'}}).candidate;
assert.equal(unknownProgress.fraction,null);assert.equal(zeroProgress.fraction,0);assert.notEqual(unknownProgress.id,zeroProgress.id,'Unread progress and explicit zero are distinct variants');
assert.equal(characterItemStats(unknownProgress).stats.HP,null,'Unknown progress cannot certify a catalog-scaled equipped value');assert.equal(characterItemStats(unknownProgress).complete,false);assert.equal(characterItemStats(zeroProgress).stats.HP,160);
progressModel.updateCandidate(unknownProgress.id,{observedStats:{HP:23},observedStatsComplete:true});assert.equal(characterItemStats(progressModel.snapshot().candidates[0]).stats.HP,23,'Observed stats remain usable with unread progress');
progressModel.assign(unknownProgress.id,'head',{allowIncompatible:true});progressModel.assign(zeroProgress.id,'face',{allowIncompatible:true});
const progressRestored=createCharacterModel({storage:progressStorage}),progressSummary=characterShareSummary(progressRestored.snapshot());assert.equal(progressSummary.equipment.find(entry=>entry.slot==='head').item.fraction,null);assert.equal(progressSummary.equipment.find(entry=>entry.slot==='face').item.fraction,0);

const first=model.intake(item());assert(first.ok);
assert.equal(model.intake(item()).deduplicated,true,'same observation replay is idempotent');
const copy=model.intake({...item(),id:'second-physical-copy'}).candidate;
assert.notEqual(copy.id,first.candidate.id,'same name/stat data never identifies a physical copy');
const otherSession=model.intake({...item(),sessionId:'another-session'});assert.equal(otherSession.deduplicated,false);
const tier0=model.intake(item('Stable Examine',{instanceKey:'selected-item'})).candidate;
const tier10=model.intake({...item('Stable Examine',{instanceKey:'selected-item',tier:10}),id:'tier-upgraded'}).candidate;
assert.notEqual(tier0.id,tier10.id,'tier variants retain separate evidence');
const augVariant=model.intake({...item('Stable Examine',{instanceKey:'selected-item',augments:[{name:'Synthetic Ruby'}]}),id:'with-augment'}).candidate;
assert.notEqual(augVariant.id,tier0.id,'augment variants retain separate evidence');

assert.equal(model.assign(first.candidate.id,'head').needsConfirmation,true);
assert.deepEqual(model.snapshot().equipment,{});
assert.equal(model.assign(first.candidate.id,'finger1').ok,true);
assert.equal(model.assign(copy.id,'finger1').needsConfirmation,true);
assert.equal(model.assign(copy.id,'finger2').ok,true);
assert.equal(model.assign(first.candidate.id,'finger2',{replace:true}).replaced,copy.id);
assert.deepEqual(model.snapshot().equipment,{finger2:first.candidate.id},'one physical card can occupy only one slot');
assert.equal(model.assign(copy.id,'finger1').ok,true);
assert.equal(characterSlotCompatibility({slots:[]},'head').unknown,true);
assert.equal(characterSlotCompatibility({slots:['WRIST']},'wrist2').compatible,true);
assert.equal(model.unassign('not-a-slot').ok,false);
assert.equal(model.unassign('finger1').ok,true);
assert.equal(model.removeCandidate(copy.id).ok,true);
assert.equal(model.snapshot().candidates.some(candidate=>candidate.id===copy.id),false);
const removalStorage=memory(),removals=createCharacterModel({storage:removalStorage,now:()=>200});
const oldObservation={...item('Removed OCR'),id:'removed-observation'};
const removedCard=removals.intake(oldObservation).candidate;removals.removeCandidate(removedCard.id);
const removalRestart=createCharacterModel({storage:removalStorage,now:()=>200});
assert.equal(removalRestart.intake(oldObservation).ignored,true,'Journal replay cannot resurrect a removed OCR card');
assert.equal(removalRestart.snapshot().candidates.length,0);
assert.equal(removalRestart.intake({...oldObservation,id:'fresh-observation'}).deduplicated,false,'A fresh observation of the same item remains available');
assert.equal(removalRestart.intake({...oldObservation,sessionId:'fresh-session'}).deduplicated,false);
const instanceObservation={...item('Removed instance',{instanceKey:'stable-copy'}),id:'first-instance',at:100};
const instanceCard=removalRestart.intake(instanceObservation).candidate;
for(let index=0;index<10;index++)removalRestart.intake({...instanceObservation,id:`later-${index}`,at:101+index});
removalRestart.removeCandidate(instanceCard.id);
const instanceRestart=createCharacterModel({storage:removalStorage,now:()=>202});
assert.equal(instanceRestart.intake(instanceObservation).ignored,true,'Past stable-instance captures remain removed even after evidence retention expired');
assert.equal(instanceRestart.intake({...instanceObservation,id:'fresh-instance-examine',at:201}).deduplicated,false,'A new examine after removal is allowed');

const epoch=Date.UTC(2026,9,22,12),epochStorage=memory(),epochModel=createCharacterModel({storage:epochStorage,now:()=>epoch});
const epochObservation=(id,capturedAt)=>({id,sessionId:'epoch-session',capturedAt:new Date(capturedAt).toISOString(),item:{name:'Epoch fixture',instanceKey:'epoch-copy',tier:0}});
const oldestEpochObservation=epochObservation('epoch-first',epoch-10000),epochCard=epochModel.intake(oldestEpochObservation).candidate;
assert.equal(epochCard.createdAt,epoch,'Real epoch timestamps do not use the stat-value bound');
assert.equal(epochCard.evidence[0].at,epoch-10000,'The capture parser ISO timestamp is retained');
for(let index=0;index<CHARACTER_LIMITS.evidence+2;index++)epochModel.intake(epochObservation(`epoch-later-${index}`,epoch-9000+index));
epochModel.setStatSnapshot('base',{stats:{HP:100},at:epoch-5000});
assert.equal(epochModel.snapshot().statSnapshots.base.at,epoch-5000);
epochModel.removeCandidate(epochCard.id);
const epochRestart=createCharacterModel({storage:epochStorage,now:()=>epoch+1000});
assert.equal(epochRestart.snapshot().updatedAt,epoch);
assert.equal(epochRestart.snapshot().statSnapshots.base.at,epoch-5000,'Observed stat timestamps survive reload');
assert.equal(epochRestart.snapshot().removedInstances[0].at,epoch,'Stable-instance removal cutoff survives real-date persistence');
assert.equal(epochRestart.intake(oldestEpochObservation).ignored,true,'Old journal evidence stays removed beyond the retained evidence window at real dates');
assert.equal(epochRestart.intake(epochObservation('epoch-fresh',epoch+1)).deduplicated,false,'A new real-date capture after the removal remains available');
epochRestart.setStatSnapshot('equipped',{stats:{HP:110},at:8.64e15+1});
assert.equal(epochRestart.snapshot().statSnapshots.equipped.at,null,'Invalid date-range timestamps remain unknown');

model.setStatSnapshot('base',{stats:{HP:100,MP:null},confirmed:true,evidence:{text:'PRIVATE_BASE_CAPTURE'}});
model.setStatSnapshot('equipped',{stats:{HP:450,MP:300},confirmed:true});
const totals=model.totals();
assert.equal(totals.base.stats.HP,100);assert.equal(totals.equipped.stats.HP,450);assert.equal(totals.derived.HP.value,10);
assert.equal(totals.derived.HP.complete,true);
assert.notEqual(totals.equipped.stats.HP,totals.base.stats.HP+totals.derived.HP.value,'no observed total is replaced with base + gear');
assert.equal(totals.base.stats.MP,null,'unknown remains unknown');
model.setStatSnapshot('equipped',null);assert.equal(model.totals().equipped,null,'captured values can be cleared');
assert.equal(model.setStatSnapshot('invented',{}).ok,false);

const catalog={name:'Catalog Blade',wikiTitle:'Catalog Blade',iconId:'42',slots:['PRIMARY'],stats:{HP:100,STR:5,DMG:10,RANGE:20}};
const scaled=model.intake({id:'catalog',item:{name:'Catalog Blade',tier:2,fraction:0,augmentStatus:'none'}},{wikiItem:catalog}).candidate;
assert.deepEqual(characterItemStats(scaled).stats,{HP:120,STR:7,DMG:12,RANGE:40});
const observed=model.intake({id:'observed',item:{name:'Catalog Blade',tier:10,stats:{HP:999},statsComplete:true,augmentStatus:'included',augments:[{name:'Ruby',stats:{HP:50},statsComplete:true}]}},{wikiItem:catalog}).candidate;
assert.equal(characterItemStats(observed).stats.HP,999,'examine stats are not rescaled or augmented twice');
const excluded={...observed,observedStats:{HP:100},augmentStatus:'excluded'};
assert.equal(characterItemStats(excluded).stats.HP,150,'only explicitly excluded augment stats are added');
assert.equal(characterItemStats({...excluded,augmentStatus:'unknown'}).uncertainAll,true);
assert.equal(characterItemStats({...scaled,tier:null}).stats.HP,null,'unknown tier cannot silently become base/tier zero');
const incomplete=model.intake(item('Incomplete',{slots:['HEAD'],stats:{HP:5},statsComplete:false,augmentStatus:'unknown'})).candidate;
model.assign(incomplete.id,'head');
assert.equal(model.totals().derived.HP.value,15);
assert.equal(model.totals().derived.HP.complete,false,'unknown augment inclusion marks even known-number sums partial');
assert.equal(model.totals().derived.MP.complete,false,'absent partial stats are not treated as known zero');

const snapshot=model.snapshot();snapshot.candidates[0].name='mutated external copy';
assert.notEqual(model.snapshot().candidates[0].name,snapshot.candidates[0].name);
const restored=createCharacterModel({storage,now:()=>12345});assert.deepEqual(restored.snapshot(),model.snapshot());
const summary=characterShareSummary(model.snapshot()),serialized=JSON.stringify(summary);
assert(!serialized.includes('PRIVATE_SYNTHETIC_EVIDENCE'));assert(!serialized.includes('PRIVATE_BASE_CAPTURE'));
assert(!serialized.includes('synthetic-session'));assert(!serialized.includes('Catalog Blade'),'unassigned inventory stays private');
assert.equal(summary.equipment.length,23);
assert.equal(characterShareLayout(model.snapshot()).width,1800);
assert.deepEqual(characterShareLayout(model.snapshot()),characterShareLayout(model.snapshot()),'same inputs have deterministic geometry');
assert(characterShareLayout(model.snapshot()).height<=8192);

const boundedStorage=memory(),bounded=createCharacterModel({storage:boundedStorage,now:()=>1});
const protectedCard=bounded.intake(item('Keep equipped')).candidate;bounded.assign(protectedCard.id,'finger1');
for(let index=0;index<CHARACTER_LIMITS.candidates+10;index++) bounded.intake(item(`Card ${index}`));
assert.equal(bounded.snapshot().candidates.length,CHARACTER_LIMITS.candidates);
assert.equal(bounded.snapshot().equipment.finger1,protectedCard.id);
assert(bounded.snapshot().candidates.some(candidate=>candidate.id===protectedCard.id));
assert(!bounded.snapshot().candidates.some(candidate=>candidate.name==='Card 0'));
assert(boundedStorage.getItem(CHARACTER_STORAGE_KEY).length<=CHARACTER_LIMITS.storageBytes);
const protectedStorage=memory(),protectedOnly=createCharacterModel({storage:protectedStorage,now:()=>1});
const largeStats=Object.fromEntries(Array.from({length:48},(_,index)=>[`STAT_${String(index).padStart(27,'0')}`,1000000000]));
for(const slot of CHARACTER_SLOTS){const card=protectedOnly.intake(item(`Protected ${slot.id}`,{slots:[slot.kind]})).candidate;protectedOnly.assign(card.id,slot.id);
    protectedOnly.updateCandidate(card.id,{icon:'data:image/png;base64,'+'A'.repeat(23970),name:'N'.repeat(240),wikiTitle:'W'.repeat(240),notes:'X'.repeat(600),baseStats:largeStats,observedStats:largeStats,augments:Array.from({length:8},()=>({name:'A'.repeat(240),stats:largeStats,statsComplete:true}))});}
assert.equal(Object.keys(protectedOnly.snapshot().equipment).length,23);
assert(protectedStorage.getItem(CHARACTER_STORAGE_KEY).length<=CHARACTER_LIMITS.storageBytes,'Protected equipment cannot defeat the serialized state bound');
const warnings=[],failed=createCharacterModel({storage:{getItem(){throw Error('synthetic read failure');},setItem(){throw Error('synthetic full disk');}},onWarning:value=>warnings.push(value)});
assert.equal(failed.intake(item()).saved,false);failed.setMetadata({name:'Still usable'});assert.equal(warnings.length,2);
assert.equal(failed.snapshot().metadata.name,'Still usable');
const hostile=memory();hostile.setItem(CHARACTER_STORAGE_KEY,JSON.stringify({schemaVersion:1,candidates:[{id:'dupe',name:'First'},{id:'dupe',name:'Second'}],equipment:{head:'dupe',face:'dupe',injected:'dupe'}}));
assert.deepEqual(createCharacterModel({storage:hostile}).snapshot().equipment,{head:'dupe'});

export function createCharacterDemo() {
    const demo=createCharacterModel({storage:null,now:()=>Date.UTC(2026,9,22,12)});
    demo.setMetadata({name:'Synthetic Wayfarer',server:'Fixture server',level:60,race:'Human',classes:['MNK','SHM'],sessionName:'Synthetic capture preview · no player records'});
    demo.setStatSnapshot('base',{stats:{AC:180,HP:1200,MP:600,STR:95,STA:90,AGI:100,DEX:105,WIS:90,INT:80,CHA:75,SV_MAGIC:25,SV_FIRE:20,SV_COLD:20,SV_POISON:15,SV_DISEASE:15},confirmed:true});
    demo.setStatSnapshot('equipped',{stats:{AC:540,HP:2500,MP:940,END:900,ATK:780,STR:170,STA:160,AGI:160,DEX:175,WIS:135,INT:110,CHA:95,SV_MAGIC:90,SV_FIRE:85,SV_COLD:70,SV_POISON:60,SV_DISEASE:65,HASTE:30},confirmed:true});
    const icon='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATklEQVR4nGNgGAWjgObg6saw//gwTQwl2zJcGjkEpLFikiwixlBi5LBaQo5riVFHtAWkBN3gtIDiIKJ5JNMlmRJj0YDkarIMHQWjgCQAAOw009RU8GzvAAAAAElFTkSuQmCC';
    for(const [index,slot] of CHARACTER_SLOTS.entries()) {
        if(index===22) continue;
        const candidate=demo.intake(item(`Synthetic ${slot.label} piece`,{slots:[slot.kind],tier:index%5,fraction:0,stats:{AC:12,HP:30,STR:2,STA:2,DEX:1,SV_MAGIC:4},statsComplete:index!==3,augmentStatus:index===3 ? 'unknown' : 'none',icon,iconId:`synthetic-${index}`,wikiTitle:`Synthetic ${slot.label} piece`,wikiMatch:'confirmed',level:45})).candidate;
        demo.assign(candidate.id,slot.id);
    }
    return demo.snapshot();
}

// Optional real Chromium canvas acceptance uses a disposable profile and a
// hidden fixture window, never the installed app or an actual game directory.
if(process.argv.includes('--render-demo')) {
    const {spawn}=await import('node:child_process'),{createRequire}=await import('node:module');
    const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join,resolve}=await import('node:path');
    const root=resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
    const temporary=await mkdtemp(join(tmpdir(),'eoz-character-share-'));
    const outputIndex=process.argv.indexOf('--output'),output=outputIndex<0 ? join(temporary,'screenshots') : resolve(process.argv[outputIndex+1]);
    await mkdir(output,{recursive:true});
    const fixture=async({root,output,snapshot,modernSnapshot,progressSnapshot,guidedSnapshot,profile})=>{
        const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
        app.setPath('userData',profile);await app.whenReady();
        const server=http.createServer(async(req,res)=>{try {const requested=new URL(req.url,'http://fixture').pathname;
            if(requested==='/') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic character renderer</title>');return;}
            if(!/^\/app\/[a-z.-]+\.(?:js|json)$/.test(requested)) {res.writeHead(404);res.end();return;}
            res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile(path.join(root,requested)));}catch {res.writeHead(404);res.end();}});
        await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
        const window=new BrowserWindow({show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,sandbox:true}});
        window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(origin+'/')}));
        try {
            await window.loadURL(origin);
            for(const appearance of [{fontFamily:'theme',fontSize:10},{fontFamily:'verdana',fontSize:20}]) {
                const result=await window.webContents.executeJavaScript(`(async()=>{const {renderCharacterShare}=await import('/app/character-share.js');const snapshot=${JSON.stringify(snapshot)};const options=${JSON.stringify({appearance})};const first=await renderCharacterShare(snapshot,options);const second=await renderCharacterShare(snapshot,options);return {dataUrl:first.dataUrl,deterministic:first.dataUrl===second.dataUrl,width:first.width,height:first.height,size:first.blob.size,summary:first.summary};})()`);
                assert(result.deterministic,'Repeated rendering yields identical PNG bytes in this runtime');
                assert.equal(result.width,1800);assert(result.height<=8192&&result.size<12000000);
                const name=`character-${appearance.fontFamily}-${appearance.fontSize}`;
                await fs.writeFile(path.join(output,`${name}.png`),Buffer.from(result.dataUrl.split(',')[1],'base64'));
                await fs.writeFile(path.join(output,`${name}.json`),JSON.stringify({...result,dataUrl:undefined},null,2));
                console.log(`Rendered ${name}: ${result.width}x${result.height}, ${result.size} bytes, deterministic PNG`);
            }
            const modern=await window.webContents.executeJavaScript(`(async()=>{const {renderCharacterShare}=await import('/app/character-share.js');const draw=CanvasRenderingContext2D.prototype.fillText,text=[];CanvasRenderingContext2D.prototype.fillText=function(value,...args){text.push(String(value));return draw.call(this,value,...args);};try{const result=await renderCharacterShare(${JSON.stringify(modernSnapshot)});await renderCharacterShare(${JSON.stringify(progressSnapshot)});return {dataUrl:result.dataUrl,text,width:result.width,height:result.height,size:result.blob.size};}finally{CanvasRenderingContext2D.prototype.fillText=draw;}})()`);
            for(const value of ['Tier 6 +18/64','HP CURRENT','HP MAXIMUM','MP CURRENT','MP MAXIMUM','END CURRENT','END MAXIMUM','HP 23','DMG 9','Damage bonus 4','DELAY 24','Attack 77','Attack speed % 12','Void resist'])assert.ok(modern.text.some(text=>text.includes(value)),`Modern share visibly draws ${value}`);
            assert.equal(modern.text.some(text=>text.includes('HASTE 12')),false,'Attack Speed does not become Haste in the image');
            assert.ok(modern.text.some(text=>text.includes('Tier 6 · progress ?')),'Unread fractional progress is visibly unknown');
            await fs.writeFile(path.join(output,'character-modern-interop.png'),Buffer.from(modern.dataUrl.split(',')[1],'base64'));
            console.log(`Rendered modern interoperability: ${modern.width}x${modern.height}, ${modern.size} bytes, observed fields drawn distinctly`);
            const guided=await window.webContents.executeJavaScript(`(async()=>{const {renderCharacterShare}=await import('/app/character-share.js');const draw=CanvasRenderingContext2D.prototype.fillText,text=[];CanvasRenderingContext2D.prototype.fillText=function(value,...args){text.push(String(value));return draw.call(this,value,...args);};try{const result=await renderCharacterShare(${JSON.stringify(guidedSnapshot)},{appearance:{fontFamily:'verdana',fontSize:20}});return {dataUrl:result.dataUrl,text,width:result.width,height:result.height,size:result.blob.size,summary:result.summary};}finally{CanvasRenderingContext2D.prototype.fillText=draw;}})()`);
            for(const value of ['0 AAs','Mitigation AC','AC softcap','Evasion AC','Offense','Accuracy','Equipped · additive estimate'])assert.ok(guided.text.some(text=>text.includes(value)),`Guided share visibly draws ${value}`);
            assert(guided.text.includes('252'),'Calculated maximum HP is drawn from base plus item HP');
            assert.equal(guided.summary.stats.computed.AC_MITIGATION.value,null);assert.equal(guided.summary.stats.computed.AC_MITIGATION.baseValue,82);
            assert.equal(guided.summary.stats.equipped.stats.HP_MAXIMUM,999,'Legacy equipped evidence remains separate from the drawn estimate');
            assert(!guided.text.includes('999'),'Legacy equipped capture does not replace the guided estimate in the PNG');
            assert.equal(guided.text.some(text=>text.includes('Unknown effect: synthetic only')),false,'Private raw pane text is not rendered');
            await fs.writeFile(path.join(output,'character-guided-estimate.png'),Buffer.from(guided.dataUrl.split(',')[1],'base64'));
            console.log(`Rendered guided estimates: ${guided.width}x${guided.height}, ${guided.size} bytes; components and unknown formulas stay separate`);
        } finally {window.destroy();server.close();app.quit();}
    };
    try {
        await writeFile(join(temporary,'main.cjs'),`(${fixture.toString()})(${JSON.stringify({root,output,snapshot:createCharacterDemo(),modernSnapshot:modernRestored.snapshot(),progressSnapshot:progressRestored.snapshot(),guidedSnapshot:guidedRestored.snapshot(),profile:join(temporary,'profile')})}).catch(error=>{console.error(error);require('electron').app.exit(1);});`);
        const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const status=await new Promise((resolve,reject)=>{const child=spawn(electron,[join(temporary,'main.cjs')],{env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',resolve);});
        assert.equal(status,0,'Real canvas fixture succeeds');
    } finally {if(outputIndex>=0) {assert(temporary.startsWith(resolve(tmpdir())+'\\') || temporary.startsWith(resolve(tmpdir())+'/'));await rm(temporary,{recursive:true,force:true});}}
}
console.log('Character model passed: physical copies/variants, slot operations, separate observations, partial sums, scaling/augments, bounded persistence and private share summary.');
