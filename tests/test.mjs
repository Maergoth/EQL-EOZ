import { EQLogParser } from '../app/parser.js';
import { conForLevel, grayCeilingForPlayerLevel, greenCeilingForPlayerLevel } from '../app/con-colors.js';
import { scaledItemStats } from '../app/item-scaling.js';
import { itemHasZoneSource, scoreItemForBrowse } from '../app/item-browse.js';
import {
    MAX_NAVIGATION_CLIMB_Z,
    canTraverseElevation,
    canUseDropSurface,
    configureViewerMovement
} from '../app/navigation-policy.js';

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
assert(s.observed.some(npc => npc.name === 'Guard Wytiffin' && npc.level === 50), 'considered NPC');
assert(s.totalDamage === 372, 'outgoing damage only');
assert(s.location.x === -20.25 && s.location.y === 10.5 && s.location.z === 4, 'normalized map location');
assert(s.location.logX === -20.25 && s.location.logY === 10.5, 'raw /loc axes retained');

const befallenLocation = new EQLogParser();
befallenLocation.parse('[Thu Sep 03 00:00:00 2026] Your Location is -30, -961, -66');
const befallenState = befallenLocation.snapshot();
assert(
    befallenState.location.x === -961 && befallenState.location.y === -30 && befallenState.location.z === -66,
    'Befallen /loc aligns with the EQ map coordinate display'
);

const legendsRareConsider = new EQLogParser();
const legendsRareConsiderEvent = legendsRareConsider.parse(
    '[Thu Sep 03 00:01:00 2026] Soldier of V Zher - a rare creature - scowls at you, ready to attack -- looks like quite a gamble. (Lvl: 26)'
);
assert(legendsRareConsiderEvent?.type === 'consider', 'Legends rare-creature consider line is recognized');
assert(legendsRareConsiderEvent?.target?.name === 'Soldier of V Zher', 'consider descriptor is excluded from NPC name');
assert(legendsRareConsiderEvent?.target?.level === 26, 'Legends consider level is retained');

assert(MAX_NAVIGATION_CLIMB_Z === 6, 'navigation climb matches the Legends jump height');
assert(canTraverseElevation(-66, -60), 'a six-unit upward move is traversable');
assert(!canTraverseElevation(-66, -59.99), 'an upward move over six units is rejected');
assert(canTraverseElevation(500, -5000), 'downward movement is intentionally unlimited');
assert(canUseDropSurface(100, -100, [{ y:-100 }]), 'an exposed long drop is traversable');
assert(!canUseDropSurface(100, -100, [{ y:100 }, { y:-100 }]), 'routing cannot fall through an overlapping upper floor');
const movementController = { maxStepUp:8, gravity:55, jumpHeight:10, jumpVelocity:0 };
configureViewerMovement(movementController);
assert(movementController.maxStepUp === 6, 'viewer step height cannot exceed navigation climb height');
assert(movementController.jumpHeight === 6, 'viewer movement and route jump heights agree');

// Modern EQ bands: blue, light blue, green, then gray below player level.
assert(grayCeilingForPlayerLevel(15) === 9, 'L15 gray ceiling');
assert(grayCeilingForPlayerLevel(50) === 32, 'L50 gray ceiling');
assert(greenCeilingForPlayerLevel(50) === 36, 'L50 green ceiling');
assert(conForLevel(52,50).key === 'yellow', 'yellow con');
assert(conForLevel(53,50).key === 'yellow', '+3 remains yellow');
assert(conForLevel(54,50).key === 'red', '+4 begins red');
assert(conForLevel(50,50).key === 'white', 'white con');
assert(conForLevel(49,50).key === 'blue', 'blue con');
assert(conForLevel(45,50).key === 'blue', 'L50 blue floor');
assert(conForLevel(44,50).key === 'light-blue', 'L50 light-blue ceiling');
assert(conForLevel(37,50).key === 'light-blue', 'L50 light-blue floor');
assert(conForLevel(36,50).key === 'green', 'L50 green ceiling');
assert(conForLevel(33,50).key === 'green', 'L50 green floor');
assert(conForLevel(32,50).key === 'gray', 'L50 gray begins');
assert(conForLevel(35,50).key === 'green', 'green con');
assert(conForLevel(30,50).key === 'gray', 'gray con');
assert(conForLevel(10,15).key === 'blue', 'low levels have no light-blue band');

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

const zoneGear = {
    name:'Pristine Studded Leather Tunic', classes:['MNK'], slots:['CHEST'], stats:{ AC:25, AGI:10, WT:1.4 },
    dropSources:[{ name:'Baron Telyx V`Zher', zone:'Befallen' }]
};
const globalPotion = {
    name:'10 Dose Adrenaline Tap', classes:['ALL'], slots:[], stats:{ WT:.4 },
    displayLines:['EXPENDABLE Charges: 10'], dropSources:[]
};
assert(itemHasZoneSource(zoneGear, 'Befallen'), 'current-zone item source matches');
assert(!itemHasZoneSource(globalPotion, 'Befallen'), 'global consumable is excluded from current-zone defaults');
assert(scoreItemForBrowse(zoneGear, { zone:'Befallen' }) > scoreItemForBrowse(globalPotion, { zone:'Befallen' }), 'equippable current-zone loot outranks generic consumables');

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
