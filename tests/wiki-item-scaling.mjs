import assert from 'node:assert/strict';
import { scaleItemStat, scaledItemStats } from '../app/item-scaling.js';

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

console.log('Wiki item-scaling parity passed: listed Range across weapon/ammo slots, fractions, cap, and base preservation.');
