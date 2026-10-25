import assert from 'node:assert/strict';
import { scaleItemStat, scaledItemStats, itemEffectiveLevel, applyItemScalingRules, getItemScalingRules, getItemScalingRevision, getItemScalingIdentity } from '../app/item-scaling.js';

// Synthetic Itembox-shaped records exercise the wiki's listed-Range contract:
// bows, throwing weapons with melee skills, and ammunition all gain +10/rank.
for (const [name, slots, base] of [
    ['Bow', ['RANGE'], 150],
    ['Throwing weapon', ['PRIMARY', 'RANGE'], 40],
    ['Arrow', ['AMMO'], 100],
    ['Listed zero Range', ['RANGE'], 0],
    ['Listed Range without a recognized slot', [], 25]
]) {
    const item = { name, slots, stats:{ RANGE:base, DMG:10, COLD_DMG:4, WT:0.1 } };
    for (const rank of [0, 1, 5, 10]) {
        const scaled = scaledItemStats(item, rank);
        assert.equal(scaled.RANGE, base + rank * 10, `${name}: Range at rank ${rank}`);
        assert.equal(scaled.COLD_DMG, 4, `${name}: elemental damage remains static`);
        assert.equal(scaled.WT, 0.1, `${name}: minimum weight remains static`);
    }
    assert.equal(item.stats.RANGE, base, `${name}: base Range survives rank changes`);
}

assert.equal(scaleItemStat('RANGE', 150, 2, { fraction:3 }), 170, 'fractions do not add Range');
assert.equal(scaleItemStat('RANGE', 150, 11), 250, 'Range honors the rank-10 cap');
assert.equal(scaleItemStat('RANGE', -5, 2, { isAmmo:true }), -5, 'a negative Range stays unchanged');
assert.equal(Object.hasOwn(scaledItemStats({ stats:{ STR:5 } }, 2), 'RANGE'), false, 'no Range is invented');

const weapon={slots:['PRIMARY','SECONDARY'],classes:['ROG'],stats:{DMG:12,STR:5,DEX:5,COLD_DMG:4},displayLines:['Skill: Piercing Atk Delay: 19']},original=structuredClone(weapon);
const thorn=scaledItemStats(weapon,5,{fraction:4});
assert.equal(thorn.DMG,18);assert.equal(thorn.BACKSTAB_DMG,15,'The wiki template Backstab baseline uses the shared independent formula');
assert.equal(thorn.ACCURACY,12.9);assert.equal(thorn.SV_CORRUPTION,5);assert.equal(thorn.COLD_DMG,4);assert.deepEqual(weapon,original);
assert.equal(scaleItemStat('BACKSTAB_DMG',12,5,{fraction:4}),15);assert.equal(scaleItemStat('BACKSTAB DAMAGE',13,8,{fraction:1}),18);
assert.equal(scaledItemStats({...weapon,stats:{...weapon.stats,ACCURACY:3}},5,{fraction:4}).ACCURACY,3,'Legacy unitless Accuracy remains unchanged');
assert.equal(scaledItemStats({...weapon,stats:{...weapon.stats,ACCURACY:3},accuracyPercent:true},5,{fraction:4}).ACCURACY,15.9,'Explicit percentage Accuracy adds the shared gain');
assert.equal(Object.hasOwn(scaledItemStats({...weapon,slots:['AMMO']},5),'ACCURACY'),false,'Ammo-only cards do not gain weapon Accuracy');
assert.equal(Object.hasOwn(scaledItemStats({stats:{STR:null,DEX:5}},5),'SV_CORRUPTION'),false,'Unknown stat labels do not establish Void eligibility');
assert.equal(scaledItemStats({stats:{STR:null,DEX:5}},5).STR,null);assert.equal(scaleItemStat('HP',null,5),null);
assert.equal(scaledItemStats({...weapon,stats:{...weapon.stats,ACCURACY:null}},5).ACCURACY,null,'An explicitly unknown Accuracy stays unknown');
assert.equal(Object.hasOwn(scaledItemStats(weapon,0),'ACCURACY'),false);assert.equal(Object.hasOwn(scaledItemStats(weapon,0),'SV_CORRUPTION'),false);
assert.equal(itemEffectiveLevel(10,1023),10,'The cap has no fractional progress');
assert.equal(scaleItemStat('WT',1,10,{fraction:1023}),.2,'Weight uses the same normalized capped state and exact ceiling as the wiki');
assert.equal(scaleItemStat('WT',1,4,{fraction:9999}),scaleItemStat('WT',1,4,{fraction:15}),'Weight rejects excess fractional progress consistently');

const bundled=structuredClone(getItemScalingRules()),beforeIdentity=getItemScalingIdentity(),next={...bundled,revision:bundled.revision+1,primary:{...bundled.primary,divisor:20}};
assert.equal(applyItemScalingRules(next),true);assert.equal(getItemScalingRevision(),next.revision);assert.equal(scaleItemStat('HP',100,5),125,'A supported rules-only update changes app previews');
assert.notEqual(getItemScalingIdentity(),beforeIdentity);next.primary.divisor=99;assert.equal(scaleItemStat('HP',100,5),125,'Accepted rules are immutable snapshots');
assert.equal(applyItemScalingRules(Object.fromEntries(Object.entries(getItemScalingRules()).reverse())),false,'Equivalent object ordering is the same rules snapshot');
assert.throws(()=>applyItemScalingRules(bundled),/backwards/);
assert.throws(()=>applyItemScalingRules({...getItemScalingRules(),primary:{...getItemScalingRules().primary,divisor:10}}),/revision/);
assert.throws(()=>applyItemScalingRules({...getItemScalingRules(),revision:getItemScalingRevision()+1,engineVersion:2}),/Unsupported/);
assert.equal(applyItemScalingRules({...bundled,revision:getItemScalingRevision()+1}),true);

console.log('Wiki item-scaling parity passed: listed Range across weapon/ammo slots, fractions, cap, and base preservation.');
