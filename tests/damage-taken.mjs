import assert from 'node:assert/strict';
import { EQLogParser } from '../app/parser.js';
import { compactParseSnapshot, fitOverlaySnapshot } from '../app/overlay-session.js';

// Synthetic names and amounts reproduce the grammar observed read-only in
// local Legends logs. No captured lines, names, or files are fixtures.
const startedAt = Date.parse('2026-10-21T12:00:00Z');
const line = (seconds, text) => `[${new Date(startedAt + seconds * 1000).toUTCString()}] ${text}`;
const player = () => { const parser = new EQLogParser(); parser.setCharacterFromFilename('eqlog_Synthetic_example.txt'); return parser; };
const tests = [];
const test = (name, run) => tests.push({ name, run });

test('observed Legends melee, direct spell, DoT and classic non-melee become only own Taken events', () => {
    const parser = player();
    const entries = [
        ['a synthetic rat punches YOU for 11 points of damage.', 'a synthetic rat', 'punches', 'melee', 11],
        ['a synthetic shaman hit YOU for 24 points of poison damage by Synthetic Burst.', 'a synthetic shaman', 'Synthetic Burst', 'spell', 24],
        ['You have taken 5 damage from Synthetic Rot by a synthetic shaman.', 'a synthetic shaman', 'Synthetic Rot', 'dot', 5],
        ['You were hit by non-melee for 3 damage.', 'Unknown attacker', 'Unknown non-melee', 'spell', 3]
    ];
    entries.forEach(([text, attacker, source, kind, amount], seconds) => {
        const event = parser.parse(line(seconds, text));
        assert.equal(event.type, 'taken'); assert.equal(event.target, 'Synthetic');
        assert.equal(event.attacker, attacker); assert.equal(event.source, source);
        assert.equal(event.kind, kind); assert.equal(event.amount, amount);
    });
    const state = parser.snapshot();
    assert.equal(state.totalTaken, 43); assert.equal(state.totalTakenHits, 4);
    assert.equal(state.takenSeconds, 3); assert.equal(state.sessionTakenPerSecond, 43 / 3);
    assert.equal(state.totalDamage, 0); assert.equal(state.sessionDps, 0);
    assert.equal(state.encounters.length, 1); assert.equal(state.encounters[0].name, 'a synthetic rat');
    assert.equal(state.encounters[0].taken, 43); assert.equal(state.encounters[0].takenHits, 4);
    assert.equal(state.encounters[0].takenPerSecond, 43 / 3);
    assert.equal(state.encounters[0].damage, 0); assert.equal(state.observed.length, 0);
});

test('named targets require the selected character and reject nearby players and pets', () => {
    const parser = player();
    const ignored = [
        'a synthetic rat hits Other for 7 points of damage.',
        'a synthetic rat hits Your pet for 7 points of damage.',
        'a synthetic rat hits Syntheticpet for 7 points of damage.',
        'a synthetic shaman hit Other for 8 points of fire damage by Synthetic Burst.',
        'Other has taken 9 damage from Synthetic Rot by a synthetic shaman.',
        'Your pet has taken 9 damage from Synthetic Rot by a synthetic shaman.'
    ];
    ignored.forEach((text, seconds) => assert.equal(parser.parse(line(seconds, text)), null));
    assert.equal(parser.snapshot().totalTaken, 0);
    for (const text of [
        'a synthetic rat hits sYnThEtIc for 7 points of damage.',
        'a synthetic shaman hit Synthetic for 8 points of fire damage by Synthetic Burst.',
        'Synthetic has taken 9 damage from Synthetic Rot by a synthetic shaman.'
    ]) assert.equal(parser.parse(line(10, text)).type, 'taken');
    assert.equal(parser.snapshot().totalTaken, 24);
    const unknown = new EQLogParser();
    assert.equal(unknown.parse(line(1, 'a synthetic rat hits Synthetic for 7 points of damage.')), null);
    assert.equal(unknown.parse(line(2, 'a synthetic rat hits YOU for 7 points of damage.')).type, 'taken');
});

test('additional observed combat verbs keep multiword attacker names intact', () => {
    const parser = player();
    for (const verb of ['cleaves', 'slices', 'smashes', 'stings']) {
        const event = parser.parse(line(0, `a synthetic skeleton ${verb} YOU for 27 points of damage.`));
        assert.equal(event.type, 'taken'); assert.equal(event.attacker, 'a synthetic skeleton');
        assert.equal(event.source, verb); assert.equal(event.amount, 27);
    }
    const frenzy = parser.parse(line(1, 'a synthetic skeleton frenzies on YOU for 27 points of damage.'));
    assert.equal(frenzy.attacker, 'a synthetic skeleton'); assert.equal(frenzy.source, 'frenzies');
    assert.equal(parser.snapshot().totalTaken, 135);
    const spell = parser.parse(line(2, 'a synthetic hit man hit YOU for 5 points of fire damage by Synthetic Burst.'));
    assert.equal(spell.attacker, 'a synthetic hit man'); assert.equal(spell.amount, 5);
});

test('character switches preserve existing session history but immediately change own-target authority', () => {
    const parser = player();
    parser.parse(line(0, 'a synthetic rat hits Synthetic for 3 points of damage.'));
    parser.setCharacterFromFilename('eqlog_Second_example.txt');
    assert.equal(parser.parse(line(1, 'a synthetic rat hits Synthetic for 7 points of damage.')), null);
    parser.parse(line(2, 'a synthetic rat hits Second for 5 points of damage.'));
    assert.equal(parser.snapshot().character, 'Second'); assert.equal(parser.snapshot().totalTaken, 8);
    assert.equal(parser.snapshot().totalTakenHits, 2);
});

test('incoming amounts exclude rune grants, absorbed capacity, misses, heals and outgoing damage', () => {
    const parser = player();
    parser.parse(line(0, 'You gain a rune for 1,000 points of absorption.'));
    parser.parse(line(1, 'You healed Synthetic for 15 hit points by Synthetic Heal.'));
    assert.equal(parser.parse(line(2, 'a synthetic rat tries to hit YOU, but misses!')), null);
    parser.parse(line(3, 'You slash a synthetic rat for 20 points of damage.'));
    const taken = parser.parse(line(4, 'a synthetic rat hits YOU for 8 points of damage. (10 absorbed)'));
    assert.equal(taken.amount, 8);
    const state = parser.snapshot();
    assert.equal(state.totalTaken, 8); assert.equal(state.totalTakenHits, 1);
    assert.equal(state.totalDamage, 20); assert.equal(state.totalHealing, 15);
    assert.equal(state.encounters[0].events.filter(event => event.type === 'rune')[0].amount, 1000);
});

test('incoming activity keeps outgoing totals and session DPS intact while extending the full encounter', () => {
    const parser = player();
    parser.parse(line(0, 'You hit a synthetic rat for 20 points of damage.'));
    parser.parse(line(2, 'You hit a synthetic rat for 40 points of damage.'));
    const before = parser.snapshot();
    parser.parse(line(10, 'a synthetic rat hits YOU for 15 points of damage.'));
    const after = parser.snapshot();
    assert.equal(after.totalDamage, before.totalDamage); assert.equal(after.sessionDps, before.sessionDps);
    assert.equal(after.sessionSeconds, before.sessionSeconds); assert.equal(after.encounters[0].damage, 60);
    assert.equal(after.encounters[0].duration, 10); assert.equal(after.encounters[0].dps, 6);
    assert.equal(after.encounters[0].taken, 15); assert.equal(after.encounters[0].takenPerSecond, 1.5);
    assert.equal(after.sessionTakenPerSecond, 15); assert.equal(after.takenSeconds, 1);
    assert.equal(after.observed[0].damageDone, 60);
});

test('incoming encounters regroup without mutating player damage, kills or loot', () => {
    const parser = player();
    parser.parse(line(0, 'a synthetic rat hits YOU for 4 points of damage.'));
    parser.parse(line(20, 'a synthetic rat hits YOU for 6 points of damage.'));
    assert.equal(parser.snapshot().encounterCount, 2);
    parser.setEncounterGapSeconds(30);
    const merged = parser.snapshot();
    assert.equal(merged.encounterCount, 1); assert.equal(merged.encounters[0].taken, 10);
    assert.equal(merged.encounters[0].takenHits, 2); assert.equal(merged.totalDamage, 0);
    assert.equal(merged.totalKills, 0); assert.equal(merged.totalOwnKills, 0); assert.equal(merged.totalLoot, 0);
});

test('session counters distinguish observed kills from own kills and retain full loot quantities', () => {
    const parser = player();
    parser.parse(line(0, 'You have slain a synthetic rat!'));
    parser.parse(line(1, 'a synthetic bat has been slain by Other!'));
    assert.equal(parser.snapshot().totalKills, 2); assert.equal(parser.snapshot().totalOwnKills, 1);
    for (let index = 0; index < 1002; index++) parser.parse(line(index + 2, 'You loot 2 Synthetic Tokens from a synthetic rat.'));
    const state = parser.snapshot();
    assert.equal(state.lootLog.length, 1000); assert.equal(state.totalLoot, 2004);
    assert.equal(state.totalKills, 2); assert.equal(state.totalOwnKills, 1);
    assert.equal(state.zoneCount, undefined, 'display/short-name aliases do not justify an invented distinct-zone count');
});

test('Taken rows retain full counts and rates before event limits, and fitting preserves them', () => {
    const events = Array.from({ length:250 }, (_, index) => ({ type:'taken', attacker:index < 125 ? 'a synthetic rat' : 'a synthetic shaman',
        source:index < 125 ? 'hits' : 'Synthetic Rot', kind:index < 125 ? 'melee' : 'dot', amount:2, at:startedAt + index,
        raw:'PRIVATE RAW LINE', logPath:'C:/Private/eqlog.txt' }));
    const compact = compactParseSnapshot({ totalTaken:500, totalTakenHits:250, takenSeconds:10, sessionTakenPerSecond:50,
        totalKills:4, totalOwnKills:3, totalLoot:7, encounterCount:1,
        encounters:[{ id:'fight-1', duration:10, taken:500, takenHits:250, takenPerSecond:50, events }] });
    assert.equal(compact.encounters[0].events.length, 120);
    assert.deepEqual(compact.breakdowns.taken, [{ name:'a synthetic rat', total:250, count:125, rate:25 }, { name:'a synthetic shaman', total:250, count:125, rate:25 }]);
    assert.deepEqual(compact.breakdowns.takenAbilities, [{ name:'hits', total:250, count:125, rate:25 }, { name:'Synthetic Rot', total:250, count:125, rate:25 }]);
    assert.equal(compact.encounters[0].taken, 500); assert.equal(compact.totalTakenHits, 250);
    assert(!JSON.stringify(compact).includes('PRIVATE RAW LINE')); assert(!JSON.stringify(compact).includes('eqlog.txt'));
    const fitted = fitOverlaySnapshot({ schemaVersion:1, session:{ parse:compact, timers:{ timers:[] },
        intel:{ npcs:[{ name:'Synthetic', drops:[{ icon:'x'.repeat(2 * 1024 * 1024) }] }] } } });
    assert(Buffer.byteLength(JSON.stringify(fitted)) < 1800 * 1024);
    const result = fitted.session.parse;
    assert.equal(result.totalTaken, 500); assert.equal(result.totalTakenHits, 250); assert.equal(result.takenSeconds, 10);
    assert.equal(result.sessionTakenPerSecond, 50); assert.equal(result.totalOwnKills, 3); assert.equal(result.totalLoot, 7);
    assert.equal(result.breakdowns.taken.reduce((sum, row) => sum + row.total, 0), 500);
    assert.equal(result.breakdowns.taken.reduce((sum, row) => sum + row.count, 0), 250);
    assert.equal(result.breakdowns.taken.reduce((sum, row) => sum + row.rate, 0), 50);
});

let failures = 0;
for (const { name, run } of tests) {
    try { await run(); console.log(`PASS damage taken: ${name}`); }
    catch (error) { failures++; console.error(`FAIL damage taken: ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
