import assert from 'node:assert/strict';
import {scaleItemStat} from '../app/item-scaling.js';
import {recoverItemBaseStat,recoverItemBaseStats,isItemBaseCandidate,ITEM_BASE_RECOVERY_LIMITS} from '../app/item-base-recovery.js';

const options={tier:4,fraction:0,augmentStatus:'excluded'};
const contains=(result,base)=>result.ranges.some(range=>base>=range.min&&base<=range.max&&Math.abs((base-range.min)/range.step-Math.round((base-range.min)/range.step))<1e-7);
const integerKeys=['AC','HP','MP','END','STR','STA','AGI','DEX','WIS','INT','CHA','SV_MAGIC','SV_FIRE','SV_COLD','SV_POISON','SV_DISEASE',
    'HP_REGEN','MANA_REGEN','END_REGEN','HASTE','DMG','RANGE','DELAY','COLD_DMG','FIRE_DMG','MAGIC_DMG','POISON_DMG','DISEASE_DMG','CORRUPTION_DMG','CHROMATIC_DMG','PRISMATIC_DMG','ELEMENTAL_DMG','BANE_DMG','BACKSTAB_DMG'];
for(const key of integerKeys)for(const base of [-41,-10,-4,-1,0,1,5,10,11,27,73]){
    const observed=scaleItemStat(key,base,4),result=recoverItemBaseStat(key,observed,options);
    assert(['exact','range'].includes(result.status),`${key}/${base}: ${result.reason}`);assert(contains(result,base),`${key}/${base} survives the inverse`);
    assert.equal(isItemBaseCandidate(key,base,observed,options),true);assert.equal(result.autoPublish,false);
    for(const range of result.ranges)for(const value of [range.min,range.max])assert.equal(scaleItemStat(key,value,4),observed,`${key}: every inclusive range endpoint roundtrips`);
}

// Independent brute enumeration verifies the inverse's complete in-bound set,
// not a second implementation of the inverse formula. Include the -11/-10
// discontinuity at high fractional progress and positive/negative clamp branches.
for(const key of ['AC','DMG','RANGE','HP_REGEN'])for(const tier of [0,1,4,9,10])for(const fraction of tier===0||tier===10?[0]:[0,2**tier-1]){
    const state={tier,fraction,augmentStatus:'none',bounds:{min:-120,max:160}},groups=new Map();
    for(let base=-120;base<=160;base++){const observed=scaleItemStat(key,base,tier,{fraction});if(!groups.has(observed))groups.set(observed,[]);groups.get(observed).push(base);}
    for(const [observed,expected]of groups){const result=recoverItemBaseStat(key,observed,state),actual=[];
        for(const range of result.ranges)for(let base=range.min;base<=range.max;base+=range.step)actual.push(base);
        assert.deepEqual(actual,expected,`${key}/tier${tier}+${fraction}: all forward-equivalent bases, including disjoint ranges`);
        assert.equal(result.candidateCount,expected.length);assert(result.candidates.length<=16);
        if(result.status==='exact')assert.equal(expected.length,1);
    }
}
const highFraction={tier:9,fraction:511,augmentStatus:'none'},zero=recoverItemBaseStat('AC',0,highFraction);
assert(zero.ranges.length>=2,'near-cap negative penalties have disjoint zero ranges');assert.equal(contains(zero,-10),false);assert.equal(contains(zero,-11),true);
assert.equal(zero.value,null);assert.equal(zero.status,'range');
const cap=recoverItemBaseStat('HP',0,{tier:10,fraction:0,augmentStatus:'none'});
assert.equal(cap.status,'range');assert(cap.ranges[0].clippedLow,'zero at the cap has an unbounded negative tail beyond the declared finite domain');assert.equal(cap.candidates.length,16);assert(cap.sampleTruncated);assert(cap.candidateCount>1e9);
const hiddenBranch=recoverItemBaseStat('AC',0,{...highFraction,bounds:{min:-9,max:-9}});
assert.equal(hiddenBranch.status,'range','narrow bounds cannot hide the other inverse branch and falsely prove uniqueness');assert.equal(hiddenBranch.value,null);assert.equal(hiddenBranch.ranges[0].clipped,true);

const small=recoverItemBaseStat('STR',9,options);assert.equal(small.status,'exact');assert.equal(small.value,5);
assert.equal(recoverItemBaseStat('RANGE',39,options).status,'unknown','a gap before minimum scaled Range is not a base');
assert.equal(recoverItemBaseStat('HASTE',3,options).reason,'no-forward-roundtrip');
assert.equal(isItemBaseCandidate('STR',5.5,9,options),false);assert.equal(isItemBaseCandidate('STR',6,9,options),false);
assert.equal(recoverItemBaseStat('STR',1e30,options).reason,'outside-base-domain');

// Weight uses tenths, not arbitrary decimal division. Forward weight shares the
// exact wiki ceiling; reverse decimal boundaries remain diagnostic.
for(const base of [0,0.1,0.2,0.7,1,2.3,8.9]){
    const observed=scaleItemStat('WT',base,4),result=recoverItemBaseStat('WT',observed,options);
    assert(contains(result,base));assert.equal(result.status,base===0?'exact':'unknown');
    if(base>0){assert.equal(result.reason,'weight-inverse-not-certified');assert.equal(isItemBaseCandidate('WT',base,observed,options),false);}
}
const baseWeight=recoverItemBaseStat('WT',2.3,{tier:0,fraction:0,augmentStatus:'none'});assert.equal(baseWeight.status,'exact');assert.equal(baseWeight.value,2.3);
assert.equal(isItemBaseCandidate('WT',2.3,2.3,{tier:0,fraction:0,augmentStatus:'none'}),true);
assert.equal(recoverItemBaseStat('WT',0.25,options).reason,'observation-outside-weight-grid');
assert.equal(recoverItemBaseStat('HP',2.5,options).reason,'observation-outside-integer-stat-grid');
const liveWeightCeil=Math.max(0,Math.ceil(1*(1-0.09*(Math.log(2**10)/Math.LN2))*10)/10);
assert.equal(scaleItemStat('WT',1,10,{fraction:0}),liveWeightCeil);assert.equal(liveWeightCeil,0.2,'the wiki floating ceiling is shared exactly, without a private app epsilon');

for(const state of [{tier:null,fraction:0,augmentStatus:'none'},{tier:4,fraction:null,augmentStatus:'none'},{tier:4,augmentStatus:'none'},
    {tier:4,fraction:16,augmentStatus:'none'},{tier:10,fraction:1,augmentStatus:'none'},{tier:4,fraction:0,augmentStatus:'included'},
    {tier:4,fraction:0,augmentStatus:'unknown'},{tier:4,fraction:0,augmentStatus:'none',augments:[{name:'Synthetic Rune',stats:{HP:9}}]}]){
    const result=recoverItemBaseStat('HP',42,state);assert.equal(result.status,'unknown');assert.equal(result.value,null);assert.equal(isItemBaseCandidate('HP',30,42,state),false);
}
assert.equal(recoverItemBaseStat('HP',42,{...options,augmentStatus:'excluded',augments:[{name:'Synthetic Rune',stats:{HP:9}}]}).status,'exact','explicitly excluded augment stats are never subtracted again');
for(const value of [null,undefined,'42',NaN,Infinity])assert.equal(recoverItemBaseStat('HP',value,options).reason,'unknown-or-nonnumeric-observation');
for(const key of ['SV_CORRUPTION','resistCorruption','DMG_BONUS','damageBonus','ATTACK_SPEED','ATK','HP_CURRENT','requiredLevel','arbitrary'])assert.equal(recoverItemBaseStat(key,12,options).status,'unsupported');
for(const bounds of [{min:5,max:4},{min:-Infinity,max:10},{min:0.1,max:10},{min:-2147483649,max:10}])assert.equal(recoverItemBaseStat('HP',42,{...options,bounds}).reason,'invalid-base-domain');

const source={hp:42,mana:18,str:9,resistFire:9,resistCorruption:4,weight:0.7},unchanged=structuredClone(source),aggregate=recoverItemBaseStats(source,options);
assert.deepEqual(source,unchanged);assert.equal(aggregate.autoPublish,false);assert.equal(aggregate.fields.HP.value,30);assert.equal(aggregate.fields.STR.value,5);assert.equal(aggregate.fields.SV_FIRE.value,5);assert.equal(aggregate.fields.SV_CORRUPTION.status,'unsupported');assert.equal(aggregate.fields.WT.status,'unknown');assert.deepEqual(aggregate.sourceKeys.HP,['hp']);
const conflicting=recoverItemBaseStats({HP:42,hp:43,Mana:18,MP:18},options);assert.equal(conflicting.fields.HP.reason,'conflicting-stat-aliases');assert.equal(conflicting.fields.HP.value,null);assert.equal(conflicting.fields.MP.status,'exact');
const many=recoverItemBaseStats(Object.fromEntries(Array.from({length:ITEM_BASE_RECOVERY_LIMITS.fields+1},(_,index)=>[`UNKNOWN_${index}`,0])),options);assert.equal(Object.keys(many.fields).length,64);assert.deepEqual(many.warnings,['stat-block-truncated']);
console.log('Item base recovery: forward-verified integer families, disjoint negative/clamped ranges, bounded samples, reviewed contexts, weight parity limits and canonical aliases passed.');
