import assert from 'node:assert/strict';
import { TimerEngine } from '../app/timer-engine.js';
import { EQLogParser } from '../app/parser.js';
import { Worker as NodeWorker } from 'node:worker_threads';
import { TriggerMatcher } from '../app/trigger-matcher.js';

let clock = Date.parse('2026-10-21T12:00:00Z');
const fresh = options => new TimerEngine({ now:() => clock, ...options });
const melee = at => ({ type:'damage', kind:'melee', source:'slash', amount:10, victim:'a synthetic rat', at });
const context = extra => ({ live:true, logId:'synthetic-log', zone:'Test Zone', ...extra });

// A paused timer keeps its remaining duration; a saved running timer keeps its
// actual deadline across an app restart rather than restarting a full duration.
let engine = fresh();
engine.command('start', { label:'Break', durationSeconds:10 });
let row = engine.snapshot().timers[0];
const firstId = row.id;
clock += 2500;
row = engine.command('pause', { id:firstId }).timers[0];
assert.equal(row.remainingMs, 7500);
clock += 5000;
assert.equal(engine.snapshot().timers[0].remainingMs, 7500);
engine = fresh({ state:engine.exportState() });
row = engine.command('resume', { id:firstId }).timers[0];
assert.equal(row.expiresAt, clock + 7500);
clock += 3000;
engine = fresh({ state:engine.exportState() });
assert.equal(engine.snapshot().timers[0].remainingMs, 4500);
clock += 4500;
assert.equal(engine.snapshot().timers[0].status, 'ended');
assert.equal(engine.snapshot().timers[0].progress, 0);
row = engine.command('reset', { id:firstId }).timers[0];
assert.equal(row.remainingMs, 10000);
assert.equal(engine.command('delete', { id:firstId }).timers.length, 0);

engine.command('start', { label:'Repeat', durationSeconds:5, repeat:true });
clock += 16000;
row = engine.snapshot().timers[0];
assert.equal(row.cycles, 3);
assert.equal(row.remainingMs, 4000);
engine = fresh({ state:engine.exportState() });
clock += 100000;
assert.equal(engine.snapshot().timers[0].remainingMs, 4000, 'repeat continues from its original phase across a long sleep');
engine.command('cancel-all');

engine.command('save-definition', { label:'Mesmerized', type:'text', trigger:'is mesmerized', durationSeconds:30, zone:'Test Zone', overlap:'ignore' });
const textId = engine.snapshot().definitions[0].id;
assert.equal(engine.consume(null, context({ at:clock, text:'a synthetic rat IS   MESMERIZED.' })), true);
const triggerStartedAt = engine.snapshot().timers[0].startedAt;
clock += 1000;
engine.consume(null, context({ at:clock, text:'another rat is mesmerized.' }));
assert.equal(engine.snapshot().timers.length, 1);
assert.equal(engine.snapshot().timers[0].startedAt, triggerStartedAt, 'retain overlap leaves original countdown untouched');
engine.consume(null, context({ at:clock + 100, zone:'Other Zone', text:'a rat is mesmerized.' }));
assert.equal(engine.snapshot().timers.length, 1);
assert.equal(engine.snapshot().timers[0].visible, false, 'zone filters hide but never pause an existing clock');
engine.command('set-zone', { zone:'Test Zone' });
engine.command('remove-definition', { id:textId });
assert.equal(engine.snapshot().timers.length, 0);

engine.command('save-definition', { label:'Exact trigger', type:'text', trigger:'Ready now!', match:'equals', overlap:'add', durationSeconds:20 });
engine.consume(null, context({ at:clock + 200, text:'Almost ready now!' }));
assert.equal(engine.snapshot().timers.length, 0);
engine.consume(null, context({ at:clock + 300, text:'[Wed Oct 21 12:00:00 2026] READY NOW!' }));
assert.equal(engine.snapshot().timers.length, 1, 'whole-line matches strip the log timestamp');
engine.consume(null, context({ at:clock + 400, text:'Ready now!', live:false }));
assert.equal(engine.snapshot().timers.length, 1, 'historical/backfill text never starts a trigger');
engine.consume({ type:'zone', zone:'New History Zone', at:clock - 10000 }, context({ live:false }));
assert.equal(engine.snapshot().zone, 'New History Zone', 'initial history establishes active zone without starting transient timers');
engine = fresh({ state:engine.exportState() });
engine.consume(null, context({ at:clock + 300, text:'[Wed Oct 21 12:00:00 2026] READY NOW!' }));
assert.equal(engine.snapshot().timers.length, 1, 'same-second last line cannot retrigger after app restart');
engine.consume(null, context({ at:clock - 1000, text:'Ready now!' }));
assert.equal(engine.snapshot().timers.length, 1, 'older live replay is ignored by the persisted per-log watermark');

engine = fresh();
engine.consume({ type:'kill', victim:'a synthetic rat', at:clock - 3000 }, context());
row = engine.command('create-spawn', { durationSeconds:60 }).timers[0];
assert.equal(row.startedAt, clock - 3000);
assert.equal(row.remainingMs, 57000, 'spawn countdown uses kill time, not the time its menu is clicked');
assert.equal(engine.snapshot().definitions.length, 0, 'one-time spawn countdown does not create a reusable kill trigger');
assert.equal(row.repeat, false);
clock += 57000;
assert.equal(engine.snapshot().timers[0].status, 'ended', 'spawn ends honestly and remains available for restart/dismiss');
engine.command('reset', { id:row.id });
assert.equal(engine.snapshot().timers[0].remainingMs, 60000);
assert.throws(() => engine.command('start', { label:'No period', durationSeconds:0 }), /duration/);
assert.throws(() => engine.command('save-definition', { label:'No text', type:'text', durationSeconds:10 }), /text/);
assert.throws(() => engine.command('start', { label:'Infinity', durationSeconds:Infinity }), /duration/);
assert.equal(fresh({ state:{ definitions:[null, {}], timers:[null, {}] } }).snapshot().timers.length, 0, 'corrupt local rows do not break startup');

// Parser enrichment preserves previous damage, heal and encounter contracts.
const parser = new EQLogParser();
let parsed = parser.parse('[Wed Oct 21 12:00:00 2026] You slash a synthetic rat for 10 points of damage.');
assert.equal(parsed.kind, 'melee');
assert.equal(parsed.source, 'slash');
assert.equal(parsed.swingEligible, true);
parsed = parser.parse('[Wed Oct 21 12:00:00 2026] You try to slash a synthetic rat, but miss!');
assert.equal(parsed.type, 'melee-miss');
assert.equal(parsed.swingEligible, true);
assert.equal(parser.totalDamage, 10);
assert.equal(parser.combatEvents.length, 1, 'misses do not rewrite historical encounter summaries');
parsed = parser.parse('[Wed Oct 21 12:00:01 2026] You backstab a synthetic rat for 50 points of damage.');
assert.equal(parsed.swingEligible, false, 'special attacks still count damage, but cannot reset auto-attack timing');
assert.equal(parser.totalDamage, 60);
assert.equal(parser.parse('[Wed Oct 21 12:00:02 2026] You begin casting Heal.').type, 'cast-begin');
assert.equal(parser.parse('[Wed Oct 21 12:00:03 2026] Your spell is interrupted.').type, 'cast-interrupt');
assert.equal(parser.parse('[Wed Oct 21 12:00:03 2026] Someone begins casting Heal.'), null, 'another caster cannot hold the viewer swing bar');

const rateParser = new EQLogParser();
rateParser.parse('[Wed Oct 21 12:00:00 2026] You slash a synthetic rat for 10 points of damage.');
rateParser.parse('[Wed Oct 21 12:00:05 2026] You healed Synthetic for 100 hit points by Heal.');
rateParser.parse('[Wed Oct 21 12:00:10 2026] You slash a synthetic rat for 10 points of damage.');
const rates = rateParser.snapshot();
assert.equal(rates.sessionSeconds, 10, 'snapshot exposes the existing session DPS denominator for consistent overlay healing rates');
assert.equal(rates.sessionDps, 2, 'exposing session duration does not change historical session DPS');
assert.equal(rates.totalHealing / rates.sessionSeconds, 10);
assert.equal(new EQLogParser().snapshot().sessionSeconds, 0);

engine = fresh();
engine.consume(melee(clock - 10000), context({ live:false }));
assert.equal(engine.snapshot().swing.status, 'idle', 'initial historical log tail cannot start a swing bar');
for (let i = 0; i < 3; i++) {
    if (i) clock += 3000;
    engine.consume(i === 1 ? { type:'melee-miss', skill:'slash', at:clock } : melee(clock), context());
    const before = engine.snapshot().swing;
    engine.consume({ ...melee(clock), amount:20 }, context());
    engine.consume({ type:'melee-miss', skill:'crush', at:clock + 900 }, context());
    assert.equal(engine.snapshot().swing.samples, before.samples, 'same-second double attacks and weapon clusters are one timing observation');
    assert.equal(engine.snapshot().swing.lastAt, before.lastAt);
}
let swing = engine.snapshot().swing;
assert.equal(swing.intervalMs, 3000, 'own melee misses contribute to the observed round interval');
assert.equal(swing.samples, 3);
clock += 1500;
swing = engine.snapshot().swing;
assert.equal(swing.progress, 0.5);
clock += 1500;
swing = engine.snapshot().swing;
assert.equal(swing.status, 'waiting');
assert.equal(swing.progress, 1);
assert.equal(swing.lastAt, clock - 3000, 'full bar never cycles or invents a swing');
engine.consume({ type:'damage', kind:'spell', source:'Fire', at:clock }, context());
engine.consume({ type:'damage', kind:'melee', source:'kick', at:clock + 1000 }, context());
assert.equal(engine.snapshot().swing.lastAt, clock - 3000, 'spells and activated melee abilities do not reset auto-attack timing');
clock += 6000;
assert.equal(engine.snapshot().swing.status, 'idle');
assert.equal(engine.snapshot().swing.intervalMs, null, 'out-of-combat estimate is withheld');
engine.consume(melee(clock), context());
assert.equal(engine.snapshot().swing.status, 'learning', 'a new fight starts with new timing evidence');
assert.equal(engine.snapshot().swing.samples, 1);
assert.equal(fresh({ state:engine.exportState() }).snapshot().swing.status, 'idle', 'old swing phases never resume after restart');

engine = fresh();
for (let i = 0; i < 3; i++) { engine.consume(melee(clock), context()); clock += 3000; }
clock -= 1000;
engine.consume(melee(clock), context());
clock += 2000;
engine.consume(melee(clock), context());
assert.equal(engine.snapshot().swing.intervalMs, 2000, 'two agreeing faster observed rounds switch the haste estimate');

let rhythmClock = clock;
const slower = new TimerEngine({ now:() => rhythmClock });
const rhythmBase = rhythmClock;
for (const offset of [0, 3000, 6000, 10000, 14000]) {
    rhythmClock = rhythmBase + offset;
    slower.consume(melee(rhythmClock), context());
}
assert.equal(slower.snapshot().swing.intervalMs, 4000, 'two agreeing slower rounds switch a 3s reference to 4s');
const ambiguous = new TimerEngine({ now:() => rhythmClock });
const ambiguousBase = rhythmClock;
for (const offset of [0, 2000, 4000, 8000, 12000]) {
    rhythmClock = ambiguousBase + offset;
    ambiguous.consume(melee(rhythmClock), context());
}
assert.equal(ambiguous.snapshot().swing.intervalMs, 2000, '2s to 4s remains conservative because missing alternate log rounds have the same evidence');
ambiguous.command('reset-swing');
assert.equal(ambiguous.snapshot().swing.status, 'idle');
for (const offset of [16000, 20000, 24000]) {
    rhythmClock = ambiguousBase + offset;
    ambiguous.consume(melee(rhythmClock), context());
}
assert.equal(ambiguous.snapshot().swing.intervalMs, 4000, 'Relearn swing clears the old reference so newly observed 4s rounds establish it');

clock += 1000;
engine.consume({ type:'cast-begin', spell:'Heal', at:clock }, context());
swing = engine.snapshot().swing;
assert.equal(swing.status, 'casting');
assert.equal(swing.progress, 1);
const heldAt = swing.lastAt;
clock += 1000;
engine.consume({ type:'cast-interrupt', at:clock }, context());
assert.equal(engine.snapshot().swing.status, 'waiting');
assert.equal(engine.snapshot().swing.lastAt, heldAt, 'interrupt releases hold without fabricating a swing');

engine.command('start', { label:'Account-wide reminder', durationSeconds:60 });
engine.consume({ type:'zone', zone:'Test Zone', at:clock - 10000 }, context({ logId:'another-log', live:false }));
assert.equal(engine.snapshot().swing.status, 'idle', 'switching logs in the same zone clears the prior character swing phase, even during initial history');
assert.equal(engine.snapshot().timers.length, 1, 'changing character does not discard app-scoped countdowns');
clock += 1000;
engine.consume(melee(clock), context({ logId:'another-log' }));
assert.equal(engine.snapshot().swing.status, 'learning');
assert.equal(engine.snapshot().swing.samples, 1);
engine = fresh();
for (let i = 0; i < 3; i++) { engine.consume(melee(clock), { live:true, zone:'Test Zone', character:'First' }); clock += 3000; }
assert.equal(engine.snapshot().swing.intervalMs, 3000);
engine.consume(melee(clock), { live:true, zone:'Test Zone', character:'Second' });
assert.equal(engine.snapshot().swing.status, 'learning', 'character fallback identity also separates swings when no log ID is supplied');
assert.equal(engine.snapshot().swing.samples, 1);

engine = fresh();
engine.command('set-swing-delay', { delayTenths:36 });
assert.equal(engine.snapshot().swing.status, 'idle', 'weapon-delay setting alone cannot create a swing');
engine.consume(melee(clock), context());
assert.equal(engine.snapshot().swing.intervalMs, 3600);
clock += 1000;
const seedProgress = engine.snapshot().swing.progress;
engine.command('set-swing-delay', { delayTenths:60 });
assert.equal(engine.snapshot().swing.intervalMs, 3600, 'editing a seed cannot override an existing observed reference');
assert.equal(engine.snapshot().swing.progress, seedProgress);
clock += 2000;
engine.consume(melee(clock), context());
assert.equal(engine.snapshot().swing.intervalMs, 3300, 'one seed sample and one real gap have equal initial weight');
clock += 3000;
engine.consume(melee(clock), context());
assert.equal(engine.snapshot().swing.intervalMs, 3000, 'real observations replace the seed');
engine.command('set-swing-enabled', { enabled:false });
clock += 3000;
engine.consume(melee(clock), context());
assert.equal(engine.snapshot().swing.enabled, false);
assert.equal(engine.snapshot().swing.status, 'idle');
engine = fresh({ state:engine.exportState() });
assert.equal(engine.snapshot().swing.enabled, false);
assert.equal(engine.snapshot().swing.delayTenths, 60);
assert.throws(() => engine.command('set-swing-delay', { delayTenths:-1 }), /Weapon delay/);

// Exercise the actual shipped module worker, including a pathological regex.
// Browser Worker semantics are adapted to Node's isolated thread for this test.
const workerSource = `import { parentPort, workerData } from 'node:worker_threads';
globalThis.self = { postMessage:value => parentPort.postMessage(value) };
parentPort.on('message', data => self.onmessage?.({ data }));
await import(workerData.url);`;
let createdWorkers = 0, terminatedWorkers = 0;
const createWorker = () => {
    createdWorkers++;
    const thread = new NodeWorker(new URL(`data:text/javascript,${encodeURIComponent(workerSource)}`), {
        workerData:{ url:new URL('../app/workers/trigger-match.worker.js', import.meta.url).href }
    });
    const adapter = { postMessage:value => thread.postMessage(value), terminate() { terminatedWorkers++; return thread.terminate(); } };
    thread.on('message', data => adapter.onmessage?.({ data })); thread.on('error', error => adapter.onerror?.(error));
    return adapter;
};
const matcher = new TriggerMatcher({ createWorker, timeoutMs:150 });
let match = await matcher.match({ mode:'regex', pattern:'(?P<target>.+?) takes (?<damage>\\d+) damage', line:'a synthetic rat takes 154 damage' });
assert.equal(match.matched, true);
assert.equal(match.groups.target, 'a synthetic rat');
assert.equal(match.groups.damage, '154');
assert.match((await matcher.match({ mode:'regex', pattern:'[', line:'test' })).error, /Invalid regular expression/);
let responsiveTicks = 0;
const responsiveness = setInterval(() => responsiveTicks++, 10);
match = await matcher.match({ mode:'regex', pattern:'(a+)+$', line:'a'.repeat(5000) + '!' });
clearInterval(responsiveness);
assert.equal(match.timedOut, true);
assert.ok(responsiveTicks >= 3, 'pathological matching leaves the owner event loop responsive');
assert.ok(terminatedWorkers >= 1, 'timed-out regex worker is terminated');
assert.equal((await matcher.match({ mode:'regex', pattern:'healthy', line:'healthy after timeout' })).matched, true);
assert.ok(createdWorkers >= 2, 'a clean worker handles later expressions');
matcher.close();

let regexClock = clock;
const regexEngine = new TimerEngine({ now:() => regexClock, matcher:new TriggerMatcher({ createWorker, timeoutMs:150 }) });
regexEngine.command('save-definition', { label:'Damage trigger', type:'text', match:'regex', trigger:'(?P<target>.+?) takes (?<damage>\\d+) damage',
    displayLabel:'{target}: {damage} damage', durationSeconds:30, zone:'First Zone', overlap:'add', cooldownSeconds:2,
    action:'speak', speech:'Hit for {damage}', warningSeconds:5, warningAction:'sound', warningSound:'Tick', endAction:'sound', endSound:'Bell' });
const regexId = regexEngine.snapshot().definitions[0].id;
const regexStart = regexClock;
const firstRegex = regexEngine.consume(null, { at:regexClock, live:true, logId:'regex-test', zone:'First Zone', text:'a synthetic rat takes 154 damage' });
regexClock += 1000;
const secondRegex = regexEngine.consume(null, { at:regexClock, live:true, logId:'regex-test', zone:'First Zone', text:'a synthetic bat takes 25 damage' });
// Changing zone while a match is in flight cannot change the event-time filter.
regexEngine.consume({ type:'zone', zone:'Second Zone', at:regexClock + 1000 }, { live:true, logId:'regex-test', zone:'Second Zone' });
await Promise.all([firstRegex, secondRegex]);
assert.equal(regexEngine.snapshot().timers.length, 1, 'event-order cooldown suppresses the later queued trigger');
assert.equal(regexEngine.snapshot().timers[0].label, 'a synthetic rat: 154 damage');
assert.equal(regexEngine.snapshot().timers[0].startedAt, regexStart);
assert.equal(regexEngine.snapshot().timers[0].visible, false, 'queued regex retains its event-time zone after zoning');
let cues = regexEngine.drainCues();
assert.equal(cues.length, 1);
assert.equal(cues[0].text, 'Hit for 154');
assert.equal(cues[0].action, 'speak');
assert.equal(regexEngine.drainCues().length, 0);
regexClock = regexStart + 25000;
regexEngine.snapshot(); cues = regexEngine.drainCues();
assert.equal(cues[0].kind, 'warning');
assert.equal(cues[0].sound, 'Tick');
regexEngine.snapshot(); assert.equal(regexEngine.drainCues().length, 0, 'warning cue fires only once per cycle');
regexClock = regexStart + 30000;
regexEngine.snapshot(); assert.equal(regexEngine.drainCues()[0].kind, 'end');
const preview = await regexEngine.preview(regexEngine.snapshot().definitions[0], 'a synthetic frog takes 42 damage');
assert.equal(preview.label, 'a synthetic frog: 42 damage');
assert.equal(regexEngine.snapshot().timers.length, 1, 'test preview never starts a timer or cue');
assert.equal(regexEngine.drainCues().length, 0);
regexEngine.command('set-zone', { zone:'First Zone' });
await regexEngine.command('fire-definition', { id:regexId, line:'a synthetic frog takes 42 damage' });
assert.equal(regexEngine.snapshot().timers.at(-1).label, 'a synthetic frog: 42 damage');
regexEngine.command('save-definition', { label:'Notification only', type:'text', match:'regex', trigger:'Ready (?<who>\\w+)', displayLabel:'{who} ready',
    timerEnabled:false, durationSeconds:30, notificationSeconds:4, action:'sound', sound:'Chime' });
regexClock += 1000;
await regexEngine.consume(null, { at:regexClock, live:true, logId:'regex-test', zone:'First Zone', text:'Ready Synthetic' });
assert.equal(regexEngine.snapshot().notifications.at(-1).label, 'Synthetic ready');
assert.equal(regexEngine.snapshot().timers.length, 2, 'notification-only trigger creates no countdown');
regexClock += 4000; assert.equal(regexEngine.snapshot().notifications.length, 0);
regexEngine.close();

const quarantined = new TimerEngine({ now:() => regexClock, matcher:new TriggerMatcher({ createWorker, timeoutMs:150 }) });
quarantined.command('save-definition', { label:'Unsafe expression', type:'text', match:'regex', trigger:'(a+)+$', durationSeconds:30 });
quarantined.command('save-definition', { label:'Healthy expression', type:'text', match:'regex', trigger:'^a+!', durationSeconds:30 });
await quarantined.consume(null, { at:regexClock, live:true, text:'a'.repeat(5000) + '!', zone:'Test' });
assert.equal(quarantined.snapshot().definitions[0].enabled, false, 'timed-out live expression is quarantined');
assert.match(quarantined.snapshot().definitions[0].error, /time limit/);
assert.equal(quarantined.snapshot().timers[0].label, 'Healthy expression', 'one bounded recovery pass lets healthy expressions see the batch');
assert.match(quarantined.snapshot().matchingStatus, /time limit/);
quarantined.close();

const pendingBatches = [];
const burst = new TimerEngine({ now:() => regexClock, matcher:{
    batch(definitions, lines) { return new Promise(resolve => pendingBatches.push({ definitions, lines, resolve })); }, close() {}
} });
burst.command('save-definition', { label:'Burst {match}', type:'text', match:'regex', trigger:'Message', timerEnabled:false, durationSeconds:30 });
const burstWork = [];
for (let i = 0; i < 300; i++) burstWork.push(burst.consume(null, { live:true, at:regexClock + i, text:`Message ${i}`, lineId:i }));
assert.ok(burst.regexQueue.length <= 256);
assert.match(burst.snapshot().matchingStatus, /busy/);
await Promise.resolve();
assert.equal(pendingBatches[0].lines.length, 128);
while (pendingBatches.length) {
    const batch = pendingBatches.shift();
    batch.resolve({ results:batch.lines.map(line => ({ lineId:line.id, definitionId:batch.definitions[0].id, result:{ matched:true, line:line.text, match:line.text, groups:{} } })) });
    await new Promise(resolve => setImmediate(resolve));
}
await Promise.all(burstWork);
assert.equal(burst.snapshot().notifications.length, 4, 'burst notifications stay bounded');
assert.equal(burst.snapshot().notifications.at(-1).label, 'Burst Message 255', 'batch results are applied in log event order before visible backpressure drops excess');
burst.close();

let finishEdited;
const edited = new TimerEngine({ now:() => regexClock, matcher:{
    batch(definitions, lines) { return new Promise(resolve => { finishEdited = () => resolve({ results:[{ lineId:lines[0].id, definitionId:definitions[0].id, result:{ matched:true, line:'Old', match:'Old', groups:{} } }] }); }); }, close() {}
} });
edited.command('save-definition', { label:'Editable', type:'text', match:'regex', trigger:'Old', durationSeconds:30 });
const editingId = edited.snapshot().definitions[0].id;
const oldWork = edited.consume(null, { live:true, at:regexClock, text:'Old' });
await Promise.resolve();
edited.command('save-definition', { id:editingId, label:'Editable', type:'text', match:'regex', trigger:'New', durationSeconds:30 });
finishEdited(); await oldWork;
assert.equal(edited.snapshot().timers.length, 0, 'editing a queued expression prevents stale matching results from firing');
edited.close();

console.log('Timer engine: manual/repeating timers, literal triggers, spawn deadlines, persistence/replay guards, parser enrichment and observed swing estimates passed.');
