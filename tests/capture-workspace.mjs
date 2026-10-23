import assert from 'node:assert/strict';
import {parseEditedStats} from '../app/capture-workspace.js';
assert.deepEqual(parseEditedStats('HP: 1,000\nMana: +200\nStrength: 75\nHP Regen: 3\nAC: ?'),{HP:1000,MP:200,STR:75,HP_REGEN:3,AC:null});
assert.throws(()=>parseEditedStats('HP: wrong'),/Use STAT: number/);
assert.throws(()=>parseEditedStats('Mana: 200\nMP: 100'),/only once/);
assert.throws(()=>parseEditedStats('HP: 1,2'),/Use STAT: number/);
assert.throws(()=>parseEditedStats('HP: 999999999999999999999'),/numeric value/);
assert.deepEqual(parseEditedStats('DMG: 12\nWT: 0.1\nENDURANCE: 10'),{DMG:12,WT:.1,END:10});
console.log('Capture workspace stat editing: familiar labels, separators, unknowns, aliases and recoverable invalid/duplicate values passed.');
