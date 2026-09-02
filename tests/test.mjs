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
p.parse('[Wed Sep 02 01:11:49 2026] Your Location is -985.92, -187.27, -67.97');

const s = p.snapshot();
assert(s.zone === 'East Freeport', 'zone');
assert(s.level === 50, 'level');
assert(s.classes.join('/') === 'MNK/ROG/BER', 'classes');
assert(s.target.name === 'Guard Wytiffin' && s.target.level === 50, 'consider');
assert(s.totalDamage === 372, 'outgoing damage only');
assert(s.location.x === -985.92 && s.location.y === -187.27 && s.location.z === -67.97, 'location');

// Classic-style level-dependent con baseline, plus a lower gray/trivial band.
assert(blueFloorForPlayerLevel(10) === 7, 'L10 blue floor');
assert(blueFloorForPlayerLevel(30) === 22, 'L30 blue floor');
assert(blueFloorForPlayerLevel(50) === 37, 'L50 blue floor');
assert(greenFloorForPlayerLevel(50) === 33, 'L50 green floor');
assert(conForLevel(52,50).key === 'yellow', 'yellow con');
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

console.log('All tests passed.');
