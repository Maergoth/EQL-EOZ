import assert from 'node:assert/strict';
import { catalogBaseStats, scaleItemStat, scaledItemStats, itemEffectiveLevel, getItemScalingRules, getItemScalingRevision, getItemScalingIdentity } from '../app/item-scaling.js';
import * as scaling from '../app/item-scaling.js';

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
assert.equal(scaleItemStat('WT', 2.5, 10), 0.3, 'rank-ten weight rounds 2.5 up to the displayed 0.3');
assert.equal(scaleItemStat('WT', 2.5, 8), 0.7, 'Binary floating noise cannot raise an exact seven-tenths weight to eight-tenths');

// Fixed screenshot observations distinguish flooring positive primary gains
// from rounding them to nearest, including nonzero fractional progress.
for(const [key,base,rank,fraction,expected]of [
    ['AC',14,6,5,22],['HP',50,5,4,75],['HP',50,4,4,71],
    ['HP',11,1,1,12],['STR',10,5,4,15],['STA',-14,6,5,-5]
])assert.equal(scaleItemStat(key,base,rank,{fraction}),expected,`${key} ${base} at ${rank}+${fraction}: shared primary rounding`);

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

// Older bootstrap packs kept these literal weapon fields only in displayLines.
// This is the reported Signature card shape, without private capture evidence.
const signature={name:'Synthetic Signature',classes:['WAR','RNG','BRD','ROG'],slots:['PRIMARY','SECONDARY'],stats:{STR:10,STA:5,DEX:10,SV_FIRE:5,SV_COLD:5,WT:2.5,DMG:10},displayLines:['Lore Equipped, No Trade','Slot: PRIMARY SECONDARY','Skill: 1H Piercing Atk Delay: 22','DMG: 10','Dmg Bon: 10','BACKSTAB: 15','STR: +10 STA: +5 DEX: +10','SV FIRE: +5 SV COLD: +5','Effect: Laceration (Combat)','Size: MEDIUM WT: 2.5','Class: WAR RNG BRD ROG','Race: ALL']},signatureBefore=structuredClone(signature);
assert.deepEqual(catalogBaseStats(signature),{...signature.stats,BACKSTAB_DMG:15,DELAY:22,DMG_BONUS:10});
for(const [rank,backstab,damage]of [[0,15,10],[8,21,18],[10,22,20]]){
    const stats=scaledItemStats(signature,rank);assert.equal(stats.BACKSTAB_DMG,backstab);assert.equal(stats.DMG,damage);assert.equal(stats.DELAY,22);assert.equal(stats.DMG_BONUS,10);
    if(rank)assert.equal(stats.ACCURACY,rank*2.5);
}
assert.deepEqual(signature,signatureBefore,'Hydration never changes the cached base record');
assert.deepEqual(catalogBaseStats({...signature,stats:{...signature.stats,BACKSTAB_DMG:null,DELAY:0,DMG_BONUS:0,HP:999}},{HP:123,STR:7}),{HP:123,STR:7,BACKSTAB_DMG:null,DELAY:0,DMG_BONUS:0},'Saved catalog bases fill only missing weapon fields, preserving fresh structured zero/unknown over contradictory display lines');
for(const explicit of [0,null])for(const key of ['BACKSTAB_DMG','DELAY','DMG_BONUS'])assert.equal(catalogBaseStats({...signature,stats:{...signature.stats,[key]:explicit}})[key],explicit,`${key}: structured zero/unknown wins over display lines`);
assert.equal(scaledItemStats({...signature,stats:{...signature.stats,BACKSTAB:null}},8).BACKSTAB_DMG,null,'An unknown structured Backstab alias blocks the damage fallback');
assert.equal(scaledItemStats({...signature,stats:{...signature.stats,BACKSTAB:0}},8).BACKSTAB_DMG,0);
assert.deepEqual(catalogBaseStats({stats:{'BACKSTAB DAMAGE':15,ATK_DELAY:22,DMG_BON:0}}),{BACKSTAB_DMG:15,DELAY:22,DMG_BONUS:0});
assert.deepEqual(catalogBaseStats({details:[{label:'Backstab Dmg',value:'15'},{label:'Attack delay',value:'22'},{label:'DMG Bonus',value:'10'}]}),{BACKSTAB_DMG:15,DELAY:22,DMG_BONUS:10});
for(const lines of [['BACKSTAB: 15','Backstab Damage: 16'],['BACKSTAB: ?'],['BACKSTAB: {{unknown}}']])assert.equal(scaledItemStats({...signature,displayLines:[...lines,'Skill: 1H Piercing Atk Delay: 22']},8).BACKSTAB_DMG,null,'Conflicting/unknown explicit Backstab never becomes the DMG fallback');
assert.equal(Object.hasOwn(catalogBaseStats({notes:'BACKSTAB: 999',displayLines:['Effect: Backstab: 999','Notes: Delay: 999'],details:[{label:'Notes',value:'DMG Bonus: 999'}]}),'BACKSTAB_DMG'),false,'Incidental prose cannot supply numeric catalog facts');
assert.equal(Object.hasOwn(catalogBaseStats({displayLines:['BACKSTAB: '+'1'.repeat(401)]}),'BACKSTAB_DMG'),false,'Overlong raw lines stay outside the bounded adapter');
assert.equal(Object.hasOwn(scaledItemStats(weapon,0),'ACCURACY'),false);assert.equal(Object.hasOwn(scaledItemStats(weapon,0),'SV_CORRUPTION'),false);
assert.equal(scaledItemStats({stats:{AC:2,HP:12,STR:3}},5).SV_CORRUPTION,5,'Diamond-style AC/HP/STR qualify for rank-five Void');
assert.equal(scaledItemStats({stats:{HP_REGEN:2,MANA_REGEN:2,END_REGEN:2}},5).SV_CORRUPTION,5,'Talisman-style regeneration fields qualify for rank-five Void');
for(const key of ['AC','HP','MP','END','HP_REGEN','MANA_REGEN','END_REGEN']){
    assert.equal(scaledItemStats({stats:{[key]:2,STR:3}},5).SV_CORRUPTION,5,`${key} is a qualifying base stat alongside an attribute`);
}
assert.equal(Object.hasOwn(scaledItemStats({stats:{STR:3,DMG:13,BACKSTAB_DMG:13}},5),'SV_CORRUPTION'),false,'Serpent-style weapon damage and Backstab do not count as extra Void qualifiers');
assert.equal(Object.hasOwn(scaledItemStats({stats:{STR:3,HASTE:2,ATK:2,DMG:13,BACKSTAB_DMG:13,DELAY:27,WT:2}},5),'SV_CORRUPTION'),false,'Haste, attack, weapon damage, delay and weight remain outside the whitelist');
assert.equal(Object.hasOwn(scaledItemStats({stats:{HP:12,Mana:null}},5),'SV_CORRUPTION'),false,'Unknown newly eligible fields do not establish a second qualifier');
assert.equal(Object.hasOwn(scaledItemStats({stats:{HP:12,HP_REGEN:null}},5),'SV_CORRUPTION'),false,'Unknown regeneration cannot establish a second qualifier');
assert.equal(Object.hasOwn(scaledItemStats({stats:{HP_REGEN:2,HPREGEN:2}},5),'SV_CORRUPTION'),false,'Aliases of the same regeneration field count once');
for(const explicit of [0,7])assert.equal(scaledItemStats({stats:{AC:2,HP:12,SV_CORRUPTION:explicit}},5).SV_CORRUPTION,explicit,'An explicit Void field remains caller-owned, including zero');
assert.equal(itemEffectiveLevel(10,1023),10,'The cap has no fractional progress');
assert.equal(scaleItemStat('WT',1,10,{fraction:1023}),.1,'Weight uses the same normalized capped state and mathematical ceiling as the wiki');
assert.equal(scaleItemStat('WT',1,4,{fraction:9999}),scaleItemStat('WT',1,4,{fraction:15}),'Weight rejects excess fractional progress consistently');

const bundled=getItemScalingRules(),beforeIdentity=getItemScalingIdentity(),copy=structuredClone(bundled);
assert.equal(getItemScalingRevision(),bundled.revision);assert(Object.isFrozen(bundled));assert(Object.isFrozen(bundled.primary));
assert.throws(()=>{bundled.primary.divisor=20;},TypeError,'Bundled coefficients cannot be mutated');
copy.revision++;copy.primary.divisor=20;
assert.equal(scaleItemStat('HP',100,5),150,'An app version always uses its bundled formulas');
assert.equal(getItemScalingIdentity(),beforeIdentity,'External rule-shaped data cannot alter the version identity');
assert.equal(Object.hasOwn(scaling,'applyItemScalingRules'),false,'There is no runtime formula-update API');

console.log('Wiki item-scaling parity passed: listed Range across weapon/ammo slots, fractions, cap, and base preservation.');
