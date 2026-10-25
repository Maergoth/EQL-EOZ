import assert from 'node:assert/strict';
import { EQLogParser } from '../app/parser.js';
import { compactParseSnapshot, fitOverlaySnapshot } from '../app/overlay-session.js';
import { parseView, renderParseContent } from '../app/overlay.js';
import { compactCombatants } from '../app/combatants.js';
const start = Date.parse('2026-10-25T12:00:00Z');
const line = (second, body) => `[${new Date(start + second * 1000).toISOString()}] ${body}`;
const make = () => { const parser = new EQLogParser(); parser.setCharacterFromFilename('eqlog_Synthetic_example.txt'); return parser; };
const actor = (snapshot,name) => snapshot.combatants.find(row => row.name === name);
const parser = make();
const bodies = [
    'You slash a synthetic rat for 20 points of damage.',
    'Ally hits a synthetic rat for 30 points of damage.',
    'a synthetic rat hits YOU for 8 points of damage.',
    'a synthetic rat bites Ally for 5 points of damage.',
    'a synthetic cleric healed a synthetic rat for 10 (20) hit points by Synthetic Heal.',
    'Ally healed You for 7 hit points by Synthetic Heal.',
    'You healed yourself for 5 hit points by Synthetic Heal.',
    "Ally's pet hits a synthetic rat for 4 points of damage.",
    'Ally hit a synthetic rat for 2 points of fire damage by Synthetic Flame.',
    'a synthetic rat has taken 3 damage from Synthetic Rot by Ally.',
    'You were hit by non-melee for 6 damage.'
];
bodies.forEach((body,index) => assert(parser.parse(line(index,body)),body));
let state = parser.snapshot();
assert.equal(state.totalDamage,20); assert.equal(state.totalHealing,5); assert.equal(state.totalTaken,14);
assert.equal(state.sessionDps,20,'Nearby actions do not change the existing own-DPS clock');
assert.equal(actor(state,'Synthetic').damage,20); assert.equal(actor(state,'Synthetic').healing,5); assert.equal(actor(state,'Synthetic').taken,14);
assert.equal(actor(state,'Ally').damage,35); assert.equal(actor(state,'Ally').healing,7); assert.equal(actor(state,'Ally').taken,5);
assert.equal(actor(state,'a synthetic rat').taken,59); assert.equal(actor(state,'a synthetic rat').damage,13);
assert.equal(actor(state,'a synthetic cleric').healing,10); assert.equal(actor(state,"Ally's pet").damage,4);
assert.equal(actor(state,'Unknown attacker').damage,6); assert.equal(state.encounters.length,1);
assert.equal(actor(state,'Ally').dps,3.5); assert.equal(actor(state,'Synthetic').dps,20);
assert.equal(actor(state.encounters[0],'Synthetic').dps,2);
assert.equal(state.observed.find(row => row.name === 'a synthetic rat').damageDone,20,'Nearby damage cannot become own NPC damage observations');
const compact = compactParseSnapshot(state);
assert.equal(actor(compact,'a synthetic rat').taken,59);
assert.equal(compact.breakdowns.damage.reduce((sum,row) => sum + row.total,0),20,'Legacy player-only aggregates stay player-only');
assert.equal(compact.breakdowns.healing.reduce((sum,row) => sum + row.total,0),5);
parser.parse(line(11,'a synthetic hit man hit Ally for 2 points of fire damage by Synthetic Flame.'));
assert.equal(actor(parser.snapshot(),'a synthetic hit man').damage,2,'Known recipient anchors a multiword attacker that contains a combat verb');
const ambiguous = make();
assert.equal(ambiguous.parse(line(0,'a synthetic hit man hit an unknown foe for 2 points of fire damage by Synthetic Flame.')),null,'Unprovable name/verb boundaries do not invent actors');
for (const scope of ['session',compact.encounters[0].id]) {
    const overview = renderParseContent(parseView(compact,scope,'overview'));
    for (const name of ['Synthetic','Ally','a synthetic rat','a synthetic cleric','Unknown attacker']) assert(overview.includes(name),`${scope}: ${name}`);
    for (const tab of ['damage','healing','taken']) {
        const markup = renderParseContent(parseView(compact,scope,tab));
        assert.match(markup,/<details class="combatant-details"/); assert.match(markup,/<summary/);
        assert.match(markup,/<th>Hits<\/th>/);
    }
}
assert.doesNotMatch(renderParseContent(parseView({...compact,combatants:[{name:'<script>bad</script>',damage:1,dps:1}]},'session','overview')),/<script>/);

// Anchored grammar must not read quoted chat, misses or absorption as damage.
for (const body of ["Ally says, 'a synthetic rat hits YOU for 999 points of damage.'", "Ally tells you, 'You have gained an ability point!'", 'a synthetic rat tries to hit Ally, but misses!', 'a synthetic rat begins casting Synthetic Flame.']) assert.equal(parser.parse(line(12,body)),null,body);
parser.parse(line(13,'You gain a rune for 1,000 points of absorption.'));
assert.equal(actor(parser.snapshot(),'Synthetic').healing,5);
assert.equal(parser.snapshot().totalRuneCapacity,1000);

// Interleaved unrelated nearby fights do not fragment the owner's fight or
// attribute the disconnected actors to its target.
const parallel = make();
parallel.parse(line(0,'You hit a synthetic rat for 10 points of damage.'));
parallel.parse(line(1,'Remote hits a synthetic bat for 15 points of damage.'));
parallel.parse(line(2,'You healed Yourself for 2 hit points by Synthetic Heal.'));
parallel.parse(line(3,'You hit a synthetic beetle for 12 points of damage.'));
state = parallel.snapshot(); assert.equal(state.encounters.length,2);
const own = state.encounters.find(encounter => encounter.damage > 0);
assert.equal(own.damage,22); assert.equal(own.healing,2); assert.equal(own.name,'a synthetic rat');
assert(!actor(own,'Remote')); assert(actor(state.encounters.find(encounter => encounter.damage === 0),'Remote'));
parallel.setCharacterFromFilename('eqlog_Second_example.txt');
parallel.parse(line(4,'You hit a synthetic rat for 7 points of damage.'));
assert.equal(parallel.snapshot().encounters.length,3,'Changing log sources never joins an old source encounter');
assert.equal(actor(parallel.snapshot(),'Synthetic').damage,22); assert.equal(actor(parallel.snapshot(),'Second').damage,7);
assert.equal(actor(parallel.snapshot(),'Second').dps,7/4,'A new character row uses its own damage numerator, never the combined historical player total');
assert.equal(parallel.snapshot().sessionDps,29/4,'Legacy combined player/session metrics keep their existing meaning');
parallel.parse(line(5,'You have entered Another Synthetic Zone.'));
parallel.parse(line(6,'You hit a synthetic rat for 1 points of damage.'));
assert.equal(parallel.snapshot().encounters.length,4,'Zone boundaries remain distinct');
parallel.parse(line(7,'You have entered Original Synthetic Zone.'));
parallel.parse(line(8,'You hit a synthetic rat for 1 points of damage.'));
parallel.parse(line(9,'You have entered Another Synthetic Zone.'));
parallel.parse(line(10,'You hit a synthetic rat for 1 points of damage.'));
assert.equal(parallel.snapshot().encounters.length,6,'Re-entry to a zone cannot resume its previous visit encounter');
parallel.setEncounterGapSeconds(30);
assert.equal(parallel.snapshot().encounters.length,6,'Regroup retains historical log-source and same-name zone-visit boundaries');
const selfHeals = make();
selfHeals.parse(line(0,'a synthetic cleric healed itself for 3 hit points by Synthetic Heal.'));
selfHeals.parse(line(1,'a synthetic shaman healed itself for 4 hit points by Synthetic Heal.'));
assert.equal(selfHeals.snapshot().encounters.length,2,'The word itself cannot connect unrelated healing NPCs');
assert.equal(actor(selfHeals.snapshot(),'a synthetic cleric').healing,3);

// GAIN_ABILITY_POINT 446 in EQEmu zone/string_ids.h; synthetic bank balances.
const aa = make();
for (const [index,body] of [
    'You have gained an ability point!',
    'You have gained an ability point! You now have 1 ability point.',
    'You have gained an ability point!You now have 30 ability points.',
    'You have gained an ability point! You now have 2 ability point(s).'
].entries()) assert.equal(aa.parse(line(index,body)).type,'aa-gain');
for (const body of ['You gain ability experience!', 'You gain party experience!!', 'You now have 99 ability points.', 'You have gained the ability "Synthetic Skill" at a cost of 3 ability points.', "Ally says, 'You have gained an ability point!'"]) assert.equal(aa.parse(line(5,body)),null);
assert.equal(aa.snapshot().totalAaGained,4);
aa.parse(line(6,'You have gained an ability point!'),{recordSession:false});
assert.equal(aa.snapshot().totalAaGained,4,'Historical context/replayed tails cannot increment current AA');
aa.setCharacterFromFilename('eqlog_Second_example.txt'); assert.equal(aa.snapshot().totalAaGained,4,'Existing session aggregates survive source switches');
assert.match(renderParseContent(parseView(compactParseSnapshot(aa.snapshot()),'session','session')),/AA Gained<\/td><td>4<\/td>/);
aa.startNewSession(start + 7000); assert.equal(aa.snapshot().totalAaGained,0); assert.deepEqual(aa.snapshot().combatants,[]);

// Totals precede event retention, and remain truthful after a gap regroup.
const long = make();
for (let index=0;index<5010;index++) long.parse(line(index / 1000, 'Ally hits a synthetic rat for 2 points of damage.'));
state = long.snapshot(); assert.equal(actor(state,'Ally').damage,10020);
let limited = compactParseSnapshot(state); assert.equal(limited.encounters[0].events.length,120);
assert.equal(actor(limited.encounters[0],'Ally').damage,10020);
long.setEncounterGapSeconds(30); state = long.snapshot();
assert.equal(actor(state,'Ally').damage,10020); assert.equal(actor(state.encounters[0],'Ally').damage,10000);
assert.equal(state.encounterHistoryLimited,true);
assert.match(renderParseContent(parseView(compactParseSnapshot(state),state.encounters[0].id,'overview')),/Older encounter details may be incomplete/);

// UTF-8 native transport fitting groups rows/abilities with conserved totals,
// and the most defensive fallback retains AA and combatant summaries.
const sums = rows => ['damage','healing','taken','damageHits','healingHits','takenHits'].map(key => rows.reduce((sum,row) => sum + row[key],0));
const crowded = make();
for (let index=0;index<300;index++) crowded.parse(line(index/1000,`Syntheticactor${index} hits a synthetic rat for 1 points of damage.`));
assert.equal(crowded.snapshot().combatants.length,257);
assert.equal(actor(crowded.snapshot(),'Other combatants (grouped)').damage,45);
assert.deepEqual(sums(crowded.snapshot().combatants),[300,0,300,300,0,300],'Parser actor limits conserve all given/taken amounts and counts');
assert.deepEqual(sums(compactParseSnapshot(crowded.snapshot()).combatants),[300,0,300,300,0,300]);
for (let index=0;index<45;index++) crowded.parse(line(1+index/1000,`You hit a synthetic rat for 2 points of fire damage by Synthetic Spell ${index}.`));
assert.equal(actor(crowded.snapshot(),'Other combatants (grouped)').damage,135,'Late actors including self remain in the explicitly grouped row when the name limit is exhausted');
assert.equal(actor(crowded.snapshot(),'Other combatants (grouped)').breakdowns.damage.reduce((sum,row)=>sum+row.total,0),135);
assert.equal(actor(crowded.snapshot(),'Other combatants (grouped)').breakdowns.damage.reduce((sum,row)=>sum+row.count,0),90);
const wide = compactCombatants(Array.from({length:300},(_,index) => ({name:`Synthetic ${index} `+'界'.repeat(180),damage:index+1,healing:2,taken:3,damageHits:1,healingHits:1,takenHits:1,dps:1,hps:2,dtps:3,breakdowns:{damage:Array.from({length:45},(_,ability) => ({name:`Ability ${ability}`,total:1,count:1}))}})),300,45);
assert.deepEqual(sums(compactCombatants(wide,20,4)),sums(wide));
limited = compactParseSnapshot({...aa.snapshot(),totalAaGained:7,combatants:wide});
const fallback = fitOverlaySnapshot({schemaVersion:1,session:{parse:limited,timers:{timers:[]},intel:{npcs:[{name:'界'.repeat(900000),drops:[]}]}}});
assert(new TextEncoder().encode(JSON.stringify(fallback)).length < 1800*1024);
assert.equal(fallback.session.parse.totalAaGained,7); assert.deepEqual(sums(fallback.session.parse.combatants),sums(limited.combatants));
console.log('Combatant overview: own/nearby damage, DoTs, heals, pets, uncertainty, encounter/source/zone boundaries, retention, AA points, expandable rendering and transport conservation passed.');
