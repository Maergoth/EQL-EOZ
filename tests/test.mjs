import { EQLogParser } from '../app/parser.js';
import { conForLevel, blueFloorForPlayerLevel, greenFloorForPlayerLevel } from '../app/con-colors.js';
import { scaledItemStats } from '../app/item-scaling.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const p = new EQLogParser();
p.setCharacterFromFilename('C:\\EverQuest\\Logs\\eqlog_Maergoth_rivervale.2026.08.23.txt');
assert(p.character === 'Maergoth', 'character filename parse');

p.parse('[Thu Aug 20 03:10:19 2026] You have entered East Freeport.');
p.parse('[Thu Aug 20 03:10:23 2026] [50 MNK/ROG/BER] Maergoth (Iksar) <Reverb> ZONE: East Freeport (freporte)');
p.parse('[Thu Aug 20 03:10:58 2026] Guard Wytiffin glares at you threateningly -- looks like quite a gamble. (Lvl: 50)');
p.parse('[Thu Aug 20 03:12:52 2026] You backstab a thunder spirit princess for 284 points of damage.');
p.parse('[Thu Aug 20 03:12:56 2026] A thunder spirit princess has taken 1588 damage from Envenomed Bolt VI by Miley. (Critical)');
p.parse('[Thu Aug 20 03:12:56 2026] You strike a thunder spirit princess for 88 points of damage.');
p.parse('[Thu Aug 20 03:12:56 2026] Your Location is 10.5, -20.25, 4.0, Heading 128');

const s = p.snapshot();
assert(s.zone === 'East Freeport', 'zone');
assert(s.level === 50, 'level');
assert(s.classes.join('/') === 'MNK/ROG/BER', 'classes');
assert(s.target.name === 'Guard Wytiffin' && s.target.level === 50, 'consider');
assert(s.totalDamage === 372, 'outgoing damage only');
assert(s.location.x === 10.5 && s.location.y === -20.25 && s.location.z === 4, 'location');

// Classic-style level-dependent con baseline, plus a lower gray/trivial band.
assert(blueFloorForPlayerLevel(10) === 7, 'L10 blue floor');
assert(blueFloorForPlayerLevel(30) === 22, 'L30 blue floor');
assert(blueFloorForPlayerLevel(50) === 37, 'L50 blue floor');
assert(greenFloorForPlayerLevel(50) === 33, 'L50 green floor');
assert(conForLevel(52,50).key === 'yellow', 'yellow con');
assert(conForLevel(53,50).key === 'yellow', '+3 remains yellow');
assert(conForLevel(54,50).key === 'red', '+4 begins red');
assert(conForLevel(50,50).key === 'white', 'white con');
assert(conForLevel(49,50).key === 'blue', 'blue con');
assert(conForLevel(35,50).key === 'green', 'green con');
assert(conForLevel(30,50).key === 'gray', 'gray con');

const item = {
    slots:['AMMO'],
    stats:{ DMG:11, COLD_DMG:4, RANGE:150, STR:-5, STA:-50, WT:0.1 }
};
const scaled = scaledItemStats(item, 1);
assert(scaled.DMG === 12, 'standalone dmg');
assert(scaled.COLD_DMG === 4, 'cold dmg static');
assert(scaled.RANGE === 160, 'ammo range');
assert(scaled.STR === -4, 'negative stat at least one point');
assert(scaled.STA === -45, 'large negative stat improves ten percent');
assert(scaledItemStats(item, 10).STA === 0, 'negative stat reaches zero by tier 10');

const session = new EQLogParser();
session.setCharacterFromFilename('C:\\EverQuest\\Logs\\eqlog_Maergoth_rivervale.txt');
session.setEncounterGapSeconds(10);
session.parse('[Thu Aug 20 03:10:00 2026] You have entered East Freeport.');
session.parse('[Thu Aug 20 03:10:01 2026] You strike a sewer rat for 20 points of damage.');
session.parse('[Thu Aug 20 03:10:03 2026] You have slain a sewer rat!');
session.parse('[Thu Aug 20 03:10:04 2026] You have looted \\aITEM 123 0:Rat Whiskers\\/a from the corpse of a sewer rat!');
session.parse("[Thu Aug 20 03:10:05 2026] --You have looted 2 Bone Chips from a sewer rat's corpse.--");
session.parse('[Thu Aug 20 03:10:20 2026] You strike Guard Wytiffin for 40 points of damage.');
session.parse("[Thu Aug 20 03:10:21 2026] A sewer rat has been slain by Miley!");
session.parse("[Thu Aug 20 03:10:22 2026] You looted a Rusty Dagger from a sewer rat's corpse and stored it in your Dragon Hoard");

const grouped = session.snapshot();
assert(grouped.encounters.length === 2, 'combat separated into encounters by configurable gap');
assert(grouped.encounters[0].name === 'Guard Wytiffin', 'newest encounter uses first attacked NPC');
assert(grouped.encounters[1].name === 'a sewer rat', 'older encounter uses first attacked NPC');
assert(grouped.lootLog.length === 3, 'all supported loot lines parsed');
assert(grouped.lootLog[0].item === 'Rusty Dagger', 'stored-loot item parsed');
assert(grouped.lootLog[0].source === 'a sewer rat', 'stored-loot source normalized');
assert(grouped.lootLog[1].item === 'Bone Chips' && grouped.lootLog[1].quantity === 2, 'decorated quantity loot parsed');
assert(grouped.lootLog[2].item === 'Rat Whiskers', 'linked item name normalized');
assert(grouped.lootLog[2].source === 'a sewer rat', 'loot source parsed');
assert(grouped.lootLog[0].killsObserved === 2, 'nearby group kills count toward drop observations');
assert(grouped.lootLog[0].estimatedRate === 50, 'observed drop rate calculated');
assert(grouped.encounters[0].name === 'Guard Wytiffin', 'group kill does not rename the player encounter');

const duplicateLoot = new EQLogParser();
duplicateLoot.parse('[Thu Aug 20 03:10:00 2026] You have entered East Freeport.');
duplicateLoot.parse('[Thu Aug 20 03:10:01 2026] You have slain a sewer rat!');
duplicateLoot.parse("[Thu Aug 20 03:10:02 2026] You have looted a Rat Ear from a sewer rat's corpse.");
duplicateLoot.parse("[Thu Aug 20 03:10:03 2026] You have looted a Rat Ear from a sewer rat's corpse.");
assert(duplicateLoot.snapshot().lootLog[0].estimatedRate === 100, 'observed chance never exceeds 100 percent');

console.log('All tests passed.');
