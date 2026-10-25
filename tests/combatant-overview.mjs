import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { EQLogParser } from '../app/parser.js';
import { compactParseSnapshot, fitOverlaySnapshot } from '../app/overlay-session.js';
import { parseView, renderParseContent, mountOverlay } from '../app/overlay.js';
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
    assert.doesNotMatch(overview,/Logged combatants only; pets keep their own names\./,'Routine combatant notes do not occupy the Overview table');
    assert.doesNotMatch(overview,/Other combatant rates use|Your DPS keeps its existing outgoing-damage clock|Rates use this encounter’s duration/,'Routine rate explanations stay out of the compact panel');
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

// Sanitized observed message grammars: "over time" is a tick modifier, and
// critical heals may end with (Critical) instead of a full stop. Pronouns
// identify the logged healer, never independent combatants or pet owners.
const healing = make(), healingEvents=[];
for (const [second,body] of [
    [0,'You healed herself over time for 55 hit points by Synthetic Recovery.'],
    [6,'You healed himself over time for 244 hit points by Synthetic Recovery (Critical)'],
    [7,'Synthetic healed itself for 10 (900) hit points by Synthetic Mend.'],
    [8,'Ally healed You over time for 20 hit points by Synthetic Recovery.'],
    [9,'Ally healed herself over time for 30 (80) hit points by Synthetic Recovery (Critical)'],
    [10,'a synthetic healer healed itself over time for 40 hit points by Synthetic Recovery.'],
    [11,"Ally's pet healed itself over time for 5 hit points by Synthetic Pet Recovery."],
    [12,'a synthetic healer healed themselves for 12 hit points by Synthetic Mend (Critical)'],
    [13,'You healed Yourself for 9 hit points by Synthetic Mend (Critical)'],
    [14,'3rd Synthetic Healer healed a synthetic friend for 4 hit points by Synthetic Mend.'],
    [15,'You healed a spirit of herself for 3 hit points by Synthetic Mend.']
]){
    const event=healing.parse(line(second,body));assert(event,body);healingEvents.push(event);
}
assert.equal(healingEvents[0].kind,'hot');assert.equal(healingEvents[1].kind,'hot');
assert.equal(healingEvents[1].at-healingEvents[0].at,6000,'Each HoT tick keeps its actual log time; no inferred duration or extra ticks');
assert.equal(healingEvents[0].target,'Synthetic');assert.equal(healingEvents[1].target,'Synthetic');assert.equal(healingEvents[2].target,'Synthetic');
assert.equal(healingEvents[2].amount,10,'Parenthesized raw/max amounts never inflate effective healing');
assert.equal(healingEvents[3].actor,'Ally');assert.equal(healingEvents[3].target,'Synthetic');assert.equal(healingEvents[3].type,'combatant-heal');
assert.equal(healingEvents[4].target,'Ally');assert.equal(healingEvents[4].source,'Synthetic Recovery','Critical punctuation never leaks into the ability name');
assert.equal(healingEvents[6].target,"Ally's pet",'Self-healing pets keep their own identity');
assert.equal(healingEvents[7].target,'a synthetic healer');assert.equal(healingEvents[8].target,'Synthetic');
state=healing.snapshot();
assert.equal(state.totalHealing,321,'Only the selected character’s own direct and tick healing changes legacy healing totals');
assert.equal(actor(state,'Synthetic').healing,321);assert.equal(actor(state,'Ally').healing,50);assert.equal(actor(state,'a synthetic healer').healing,52);
assert.equal(actor(state,"Ally's pet").healing,5);assert.equal(actor(state,'3rd Synthetic Healer').healing,4,'Genuine numeric names are preserved');
assert(actor(state,'a spirit of herself'),'Only an exact reflexive pronoun is resolved; ordinary names are preserved');
assert(!state.combatants.some(row=>/^(?:itself|himself|herself|themselves|yourself)(?: over time)?$| over time$|^3herself/i.test(row.name)),'Tick modifiers and pronouns never become Overview combatants');
assert.equal(state.totalDamage,0);assert.equal(state.totalTaken,0);
const beforeHealing=state.totalHealing,beforeActors=JSON.stringify(state.combatants);
for(const body of [
    "Ally says, 'You healed herself over time for 900 hit points by Synthetic Recovery.'",
    "Ally tells you, 'a synthetic healer healed itself for 900 hit points by Synthetic Mend (Critical)'",
    'You begin casting Synthetic Recovery.',
    'Your wounds begin to heal.',
    'a synthetic healer is regenerating.',
    'You healed herself over time for unknown hit points by Synthetic Recovery.',
    'Ally healed a synthetic friend for 9 hit points by Synthetic Mend (Unrecognized)'
])assert(!['heal','combatant-heal'].includes(healing.parse(line(16,body))?.type),body);
assert.equal(healing.snapshot().totalHealing,beforeHealing);assert.equal(JSON.stringify(healing.snapshot().combatants),beforeActors,'Chat, casts, amount-free regeneration and unsupported suffixes do not earn healing');
healing.parse(line(17,'You gain a rune for 1,000 points of absorption.'));
assert.equal(healing.snapshot().totalRuneCapacity,1000);assert.equal(healing.snapshot().totalHealing,beforeHealing,'Rune grants stay separate from direct/HoT healing');
healing.parse(line(18,'You healed herself over time for 999 hit points by Synthetic Recovery.'),{recordSession:false});assert.equal(healing.snapshot().totalHealing,beforeHealing,'Context-only reads cannot add HoT credit');
for (const pronoun of ['itself','himself','herself','themselves']) {
    const disconnected=make();
    disconnected.parse(line(0,`a synthetic north healer healed ${pronoun} over time for 3 hit points by Synthetic Recovery.`));
    disconnected.parse(line(1,`a synthetic south healer healed ${pronoun} over time for 4 hit points by Synthetic Recovery.`));
    const snapshot=disconnected.snapshot();assert.equal(snapshot.encounters.length,2,`${pronoun} cannot connect unrelated self-healing NPCs`);
    assert.equal(snapshot.combatants.length,2);assert.equal(actor(snapshot,'a synthetic north healer').healing,3);assert.equal(actor(snapshot,'a synthetic south healer').healing,4);
}
for (const healer of ['You','Synthetic']) for (const pronoun of ['Yourself','himself','herself','itself','themselves']) for (const modifier of ['',' over time']) {
    const ownHealing=make(),event=ownHealing.parse(line(0,`${healer} healed ${pronoun}${modifier} for 7 (90) hit points by Synthetic Recovery.`));
    assert.equal(event.type,'heal');assert.equal(event.target,'Synthetic');assert.equal(event.kind,modifier?'hot':'spell');
    assert.deepEqual(ownHealing.snapshot().combatants.map(row=>[row.name,row.healing]),[['Synthetic',7]],`${healer}/${pronoun}${modifier} resolves before dispatch and never creates a pronoun row`);
}

// Bare heal messages name the actor, recipient and effective amount, but no
// ability. Neither a nearby cast nor a different-sized detailed heal fills it.
const bareHealing=make();
bareHealing.parse(line(0,'You begin casting A Nearby Unproven Spell.'));
bareHealing.parse(line(1,'You healed Ally for 194 hit points by Synthetic Detailed Heal.'));
assert.equal(bareHealing.parse(line(1,'You healed Ally for 60 hit points.')).source,'Unknown ability');
bareHealing.parse(line(2,'a synthetic healer healed himself for 23 hit points.'));
bareHealing.parse(line(3,"Ally's pet healed itself for 7 hit points."));
bareHealing.parse(line(4,'Synthetic healed herself for 9 hit points.'));
const bareSnapshot=bareHealing.snapshot(),bareOwn=actor(bareSnapshot,'Synthetic');
assert.equal(bareSnapshot.totalHealing,263);assert.equal(bareOwn.healing,263);
assert.equal(bareOwn.breakdowns.healing.find(row=>row.name==='Synthetic Detailed Heal').total,194);
assert.equal(bareOwn.breakdowns.healing.find(row=>row.name==='Unknown ability').total,69,'Different real amounts are not deduplicated or attributed to the previous detailed spell');
assert(!bareOwn.breakdowns.healing.some(row=>row.name==='A Nearby Unproven Spell'));
assert.equal(actor(bareSnapshot,'a synthetic healer').healing,23);assert.equal(actor(bareSnapshot,"Ally's pet").healing,7);
for(const body of ["Ally says, 'You healed Ally for 999 hit points.'",'You healed Ally for 9 hit points (Critical)','You healed Ally for 9 (100) hit points.','You healed herself over time for 9 hit points.'])assert.equal(bareHealing.parse(line(5,body)),null,body);
assert.equal(bareHealing.snapshot().totalHealing,263);

// Casterless DoTs preserve actual received damage without inventing a caster,
// selected-player credit or a shared identity that connects unrelated fights.
const unnamed=make();
const incomingUnnamed=unnamed.parse(line(0,'You have taken 345 damage from Synthetic Unknown Rot.'));
const northUnnamed=unnamed.parse(line(1,'a synthetic north target has taken 11 damage by Synthetic Unknown Rot.'));
unnamed.parse(line(2,'a synthetic south target has taken 13 damage by Synthetic Unknown Rot.'));
unnamed.parse(line(3,'a synthetic north target has taken 7 damage by Synthetic Unknown Rot.'));
let unnamedSnapshot=unnamed.snapshot();
assert.equal(incomingUnnamed.type,'taken');assert.equal(incomingUnnamed.attackerKnown,false);assert.equal(incomingUnnamed.source,'Synthetic Unknown Rot');
assert.equal(northUnnamed.type,'combatant-damage');assert.equal(northUnnamed.actorKnown,false);assert.equal(northUnnamed.actor,'Unknown attacker');assert.equal(northUnnamed.source,'Synthetic Unknown Rot');
assert.equal(unnamedSnapshot.totalDamage,0);assert.equal(unnamedSnapshot.totalTaken,345);assert.equal(actor(unnamedSnapshot,'Synthetic').damage,0);
assert.equal(actor(unnamedSnapshot,'Unknown attacker').damage,376);assert.equal(actor(unnamedSnapshot,'a synthetic north target').taken,18);assert.equal(actor(unnamedSnapshot,'a synthetic south target').taken,13);
assert.equal(unnamedSnapshot.encounters.length,3,'The same unknown-caster placeholder and spell do not connect own/north/south encounters');
const northEncounter=unnamedSnapshot.encounters.find(encounter=>encounter.name==='a synthetic north target');
assert.equal(actor(northEncounter,'Unknown attacker').damage,18);assert(!actor(northEncounter,'a synthetic south target'));assert(!actor(northEncounter,'Synthetic'));
const attributed=unnamed.parse(line(4,'a synthetic north target has taken 4 damage from Synthetic Known Rot by Ally.'));
assert.equal(attributed.actor,'Ally');assert.equal(attributed.source,'Synthetic Known Rot','Actual Legends grammar is damage from Ability by Actor; the fields cannot be reversed');
assert.equal(unnamed.parse(line(5,'itself has taken 99 damage by Synthetic Unknown Rot.')),null,'An unknown caster cannot resolve a reflexive recipient');
const beforeUnnamed=JSON.stringify(unnamed.snapshot().combatants);
for(const body of ["Ally says, 'You have taken 999 damage from Synthetic Unknown Rot.'", "Ally tells you, 'a synthetic north target has taken 999 damage by Synthetic Unknown Rot.'",'a synthetic north target has taken 99 damage by Synthetic Unknown Rot. (Unrecognized)'])assert.equal(unnamed.parse(line(6,body)),null,body);
unnamed.parse(line(7,'a synthetic north target has taken 999 damage by Synthetic Unknown Rot.'),{recordSession:false});
assert.equal(JSON.stringify(unnamed.snapshot().combatants),beforeUnnamed,'Quoted and context-only DoT text never earns damage');
unnamed.setCharacterFromFilename('eqlog_Second_example.txt');unnamed.parse(line(8,'a synthetic north target has taken 2 damage by Synthetic Unknown Rot.'));
assert.equal(unnamed.snapshot().encounters.length,4,'Source changes cannot connect unnamed-source damage to the previous log');
unnamed.startNewSession(start+9000);assert.deepEqual(unnamed.snapshot().combatants,[]);assert.equal(unnamed.snapshot().totalTaken,0);

// Retaliation credits its explicit possessive wearer. Preserve apostrophes,
// backticks, numeric names and pets; a nearby buff cast supplies no owner credit.
const shields=make();
shields.parse(line(0,'You begin casting A Nearby Unproven Shield.'));
const ownShield=shields.parse(line(1,"a synthetic rat is burned by Synthetic's flames for 22 points of non-melee damage."));
const takenShield=shields.parse(line(2,"YOU are pierced by a synthetic thistle's thorns for 6 points of non-melee damage!"));
shields.parse(line(3,"a synthetic bat is tormented by Ally's pet's frost for 16 points of non-melee damage."));
shields.parse(line(4,"Ally is burned by Warden's ghost's flames for 5 points of non-melee damage."));
shields.parse(line(5,"YOU are burned by a shade`guard's flames for 4 points of non-melee damage."));
shields.parse(line(6,"a synthetic bat is pierced by 3rd Warden's thorns for 7 points of non-melee damage!"));
const shieldSnapshot=shields.snapshot();
assert.equal(ownShield.type,'damage');assert.equal(ownShield.kind,'damage-shield');assert.equal(ownShield.swingEligible,undefined,'Retaliation is not an outgoing melee swing');
assert.equal(ownShield.source,'Damage shield: flames');assert.equal(takenShield.type,'taken');assert.equal(takenShield.attacker,'a synthetic thistle');
assert.equal(shieldSnapshot.totalDamage,22);assert.equal(shieldSnapshot.totalTaken,10);assert.equal(shieldSnapshot.totalTakenHits,2);
assert.equal(actor(shieldSnapshot,'Synthetic').damage,22);assert.equal(actor(shieldSnapshot,"Ally's pet").damage,16);assert.equal(actor(shieldSnapshot,'Ally').damage,0,'A pet shield wearer is not its player owner');
assert.equal(actor(shieldSnapshot,"Warden's ghost").damage,5);assert.equal(actor(shieldSnapshot,'a shade`guard').damage,4);assert.equal(actor(shieldSnapshot,'3rd Warden').damage,7);
assert.equal(actor(shieldSnapshot,'a synthetic bat').taken,23);assert(!actor(shieldSnapshot,'A Nearby Unproven Shield'));
const beforeShields=JSON.stringify(shieldSnapshot.combatants);
for(const body of ["Ally says, 'YOU are pierced by a synthetic thistle's thorns for 999 points of non-melee damage!'", "YOU try to burn a synthetic rat, but miss!", "YOU are burned by a synthetic thistle's thorns for 9 points of non-melee damage!", "YOU are pierced by a synthetic thistle's thorns for 9 points of non-melee damage! (Critical)", "YOU are pierced by a synthetic thistle's thorns for 9 points of absorption!"])assert(!['damage','taken','combatant-damage'].includes(shields.parse(line(7,body))?.type),body);
shields.parse(line(8,"a synthetic rat is burned by Synthetic's flames for 999 points of non-melee damage."),{recordSession:false});assert.equal(JSON.stringify(shields.snapshot().combatants),beforeShields);
shields.setCharacterFromFilename('eqlog_Second_example.txt');shields.parse(line(9,"a synthetic rat is burned by Synthetic's flames for 3 points of non-melee damage."));assert.equal(shields.snapshot().totalDamage,22,'The prior selected character’s shield becomes a nearby actor after a source switch');
assert.equal(actor(shields.snapshot(),'Synthetic').damage,25);assert(!actor(shields.snapshot(),'Second'));

const addedMelee=make();
assert.equal(addedMelee.parse(line(0,'Ally reaves a synthetic rat for 12 points of damage.')).type,'combatant-damage');
assert.equal(addedMelee.parse(line(1,'a synthetic rat smites Ally for 8 points of damage.')).type,'combatant-damage');
assert.equal(addedMelee.parse(line(2,'a synthetic rat smites YOU for 5 points of damage.')).type,'taken');
assert.equal(addedMelee.parse(line(3,'You reave a synthetic rat for 3 points of damage.')).type,'damage');
assert.equal(addedMelee.snapshot().totalDamage,3);assert.equal(addedMelee.snapshot().totalTaken,5);assert.equal(actor(addedMelee.snapshot(),'Ally').damage,12);assert.equal(actor(addedMelee.snapshot(),'a synthetic rat').damage,13);

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

// Mount the production renderer: Live keeps its completed fight on screen,
// preserves held controls, then follows a new fight without touching history.
{
    const dom=new JSDOM(await readFile(new URL('../app/overlay.html',import.meta.url),'utf8'),{url:'http://127.0.0.1/overlay.html?panel=parse',pretendToBeVisual:true}),{document}=dom.window;
    const liveParser=make();
    const at=second=>start+second*1000;
    const snapshot=second=>{const actualNow=Date.now;Date.now=()=>at(second);try{return compactParseSnapshot(liveParser.snapshot());}finally{Date.now=actualNow;}};
    const state={sessionAvailable:true,preferences:{visible:true,locked:true,fontScale:1},snapshot:{session:{parse:snapshot(0)}}};
    const view=mountOverlay({document,panel:'parse',bridge:{getState:async()=>state,onState:()=>()=>{}},setInterval:()=>1,clearInterval:()=>{}});
    const update=second=>{state.snapshot.session.parse=snapshot(second);view.render(state);};
    const selector=document.querySelector('#encounter-scope');
    const scope=value=>{selector.value=value;selector.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
    try{
        await new Promise(done=>setImmediate(done));assert.match(document.querySelector('#parse-body').textContent,/Waiting for combat/);
        liveParser.parse(line(0,'You hit a synthetic sentry for 100 points of damage.'));
        liveParser.parse(line(2,'You hit a synthetic sentry for 50 points of damage.'));update(2);
        const firstId=state.snapshot.session.parse.encounters[0].id;
        assert.equal(selector.value,'live');assert.match(selector.selectedOptions[0].textContent,/a synthetic sentry · Live$/);assert.equal(document.querySelector('.ended'),null);
        const details=document.querySelector('.combatant-details');details.open=true;const summary=details.querySelector('summary');summary.focus();
        update(22);assert.equal(selector.value,'live');assert.match(selector.selectedOptions[0].textContent,/Live \(ended\)/);assert.equal(document.querySelector('.ended').textContent,'ended');
        assert.equal(document.querySelector('.combatant-details'),details);assert(details.open);assert.equal(document.activeElement,summary,'Idle hold preserves disclosure nodes and focus');
        const heldHeader=document.querySelector('#encounter-stats').textContent;assert.match(heldHeader,/75/);assert.doesNotMatch(document.querySelector('#parse-body').textContent,/Waiting for combat/);
        update(600);assert.equal(document.querySelector('#encounter-stats').textContent,heldHeader,'Ten minutes idle cannot dilute recorded duration/DPS');
        liveParser.parse(line(601,'You hit a synthetic scout for 40 points of damage.'));
        liveParser.parse(line(603,'You hit a synthetic scout for 60 points of damage.'));update(603);
        assert.equal(selector.value,'live');assert.match(selector.selectedOptions[0].textContent,/a synthetic scout · Live$/);assert.equal(document.querySelector('.ended'),null);
        assert.equal(document.querySelector('.combatant-details').open,false,'A new encounter has its own disclosure state');assert.equal(document.activeElement,selector,'A replaced focused encounter returns focus to its selector');
        document.querySelector('[data-tab="overview"]').click();assert.match(document.querySelector('#parse-body').textContent,/a synthetic scout/);assert.doesNotMatch(document.querySelector('#parse-body').textContent,/a synthetic sentry/);
        scope(firstId);update(604);assert.equal(selector.value,firstId);assert.match(document.querySelector('#parse-body').textContent,/a synthetic sentry/);
        scope('session');update(605);assert.equal(selector.value,'session');assert.match(document.querySelector('#parse-body').textContent,/a synthetic sentry/);assert.match(document.querySelector('#parse-body').textContent,/a synthetic scout/);
        console.log('Mounted Parse Live: empty start, active→ended hold, frozen rates, stable disclosures/focus, automatic next encounter and unchanged explicit history/session scopes passed.');
    }finally{view.dispose();dom.window.close();}
}
