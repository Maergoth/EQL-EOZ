import assert from 'node:assert/strict';
import { EQLogParser } from '../app/parser.js';
const parser=new EQLogParser();parser.character='Synthetic';
parser.parse('[Thu Oct 22 17:00:00 2026] You have entered Synthetic Zone.');
parser.parse('[Thu Oct 22 17:00:01 2026] You have slain a synthetic rat!');
const explicit=parser.parse('[Thu Oct 22 17:00:02 2026] You have looted a Synthetic Blade from the corpse of a synthetic bat.');
assert.equal(explicit.source,'a synthetic bat');assert.equal(explicit.sourceEvidence.kind,'explicit-corpse');assert.equal(explicit.sourceConfidence,1);
const inferred=parser.parse('[Thu Oct 22 17:00:03 2026] You have looted a Synthetic Ring.');
assert.equal(inferred.source,'a synthetic rat');assert.equal(inferred.sourceEvidence.kind,'recent-kill');assert.equal(inferred.sourceEvidence.timeGapMs,2000);assert.equal(inferred.sourceConfidence,.25);
parser.startNewSession();
const unknown=parser.parse('[Thu Oct 22 17:10:00 2026] You have looted a Synthetic Cloth.');
assert.equal(unknown.source,'Unknown');assert.equal(unknown.sourceEvidence.kind,'unknown');assert.equal(unknown.sourceConfidence,0);
assert.equal(parser.totalLoot,1,'provenance does not change existing manual-session totals');
const given=parser.parse('[Thu Oct 22 17:10:01 2026] You have received a Synthetic Token from a wandering merchant.');assert.equal(given.source,'a wandering merchant');assert.equal(given.sourceEvidence.kind,'explicit-source');assert.equal(given.sourceConfidence,.5,'An explicit named provider is not proof of a corpse');
parser.parse('[Thu Oct 22 17:10:02 2026] You have slain a synthetic rat!');parser.parse('[Thu Oct 22 17:10:03 2026] You have entered Other Synthetic Zone.');
const crossed=parser.parse('[Thu Oct 22 17:10:04 2026] You have looted a Synthetic Cloak.');assert.equal(crossed.source,'Unknown');assert.equal(crossed.sourceEvidence.kind,'unknown','A recent kill/encounter in another zone is not a drop source');
const possessive=parser.parse("[Thu Oct 22 17:10:05 2026] You have looted a Synthetic Blade from a synthetic bat's corpse.");assert.equal(possessive.source,'a synthetic bat');assert.equal(possessive.sourceEvidence.kind,'explicit-corpse');
console.log('Loot provenance: explicit corpse versus inferred recent kill and unknown, with existing totals preserved.');

{
    const p=new EQLogParser();
    p.parse('[Wed Oct 21 12:00:01 2026] You have entered Synthetic Source Zone.');
    p.parse('[Wed Oct 21 12:00:02 2026] You slash Synthetic Source Keeper for 12 points of damage.');
    p.parse('[Wed Oct 21 12:00:03 2026] You have slain Synthetic Source Keeper!');
    p.resetSourceContext();assert.equal(p.zone,'');assert.equal(p.zoneShortName,'');assert.equal(p.lastKill,null);
    const beforeZone=p.parse('[Wed Oct 21 12:00:04 2026] You have looted a Synthetic New Token.');
    assert.equal(beforeZone.source,'Unknown');
    p.parse('[Wed Oct 21 12:00:05 2026] You have entered Synthetic Source Zone.');
    p.setEncounterGapSeconds(30);
    const afterZone=p.parse('[Wed Oct 21 12:00:06 2026] You have looted a Synthetic New Token.');assert.equal(afterZone.source,'Unknown','Even returning to the same zone cannot inherit another log encounter');
    p.parse('[Wed Oct 21 12:00:07 2026] You slash Synthetic Current Keeper for 12 points of damage.');
    const afterCombat=p.parse('[Wed Oct 21 12:00:08 2026] You have looted a Synthetic Current Token.');assert.equal(afterCombat.source,'Synthetic Current Keeper');
}
