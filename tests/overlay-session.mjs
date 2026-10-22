import assert from 'node:assert/strict';
import { compactParseSnapshot, createOverlaySession, fitOverlaySnapshot } from '../app/overlay-session.js';

// Display feeds are intentionally small. Ability totals must be computed before
// those limits, over every retained encounter, with counts retained as well.
const manyEvents = Array.from({ length:250 }, (_, index) => ({ type:'damage', kind:'melee', source:index < 125 ? 'slash' : 'crush', amount:2, at:index + 1000, victim:'a synthetic rat', raw:'PRIVATE RAW LINE', path:'C:\\Private\\eqlog.txt' }));
const encounters = Array.from({ length:25 }, (_, index) => ({ id:`fight-${index}`, name:`Synthetic ${index}`, damage:500, healing:10,
    startAt:1000, lastAt:2000, duration:1, events:[...manyEvents, { type:'heal', source:'Heal', amount:10 }, { type:'rune', amount:20 }] }));
const compact = compactParseSnapshot({ character:'Synthetic', totalDamage:12500, totalHealing:250, totalRuneCapacity:500,
    sessionNumber:2, sessionStartedAt:123000, sessionDps:20, encounters, recentEvents:manyEvents });
assert.equal(compact.encounters.length, 20);
assert.equal(compact.encounters[0].events.length, 120);
assert.equal(compact.encounters[0].eventsTruncated, true);
assert.equal(compact.recentEvents.length, 60);
assert.deepEqual(compact.encounters[0].breakdowns.damage, [{ name:'slash', total:250, count:125 }, { name:'crush', total:250, count:125 }]);
assert.equal(compact.breakdowns.damage.reduce((sum, row) => sum + row.total, 0), 12500, 'session totals include encounters outside native history picker');
assert.equal(compact.breakdowns.damage.reduce((sum, row) => sum + row.count, 0), 6250);
assert.equal(compact.breakdowns.healing[0].total, 250);
assert.equal(compact.breakdowns.runes[0].total, 500);
assert.equal(compact.totalHealing, 250, 'rune capacity does not inflate actual healing');
assert.equal(compact.totalRuneCapacity, 500);
assert.equal(compact.sessionNumber, 2);
assert.equal(compact.sessionStartedAt, 123000);
assert.ok(!JSON.stringify(compact).includes('PRIVATE RAW LINE'));
assert.ok(!JSON.stringify(compact).includes('eqlog.txt'));
const varied = compactParseSnapshot({ encounters:[{ events:Array.from({ length:140 }, (_, index) => ({ type:'damage', source:`Ability ${index}`, amount:1 })) }] });
assert.equal(varied.breakdowns.damage.reduce((sum, row) => sum + row.total, 0), 140, 'ability row limit groups excess into Other without losing totals');

const encodedBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const aggregateSums = breakdowns => Object.fromEntries(['damage', 'healing', 'runes'].map(key => [key,
    (breakdowns?.[key] || []).reduce((sum, row) => ({ total:sum.total + row.total, count:sum.count + row.count }), { total:0, count:0 })]));
const wideText = '界'.repeat(220);
const stressEvents = Array.from({ length:600 }, (_, index) => ({
    type:['damage', 'heal', 'rune'][index % 3], source:`${index % 140} ${wideText}`, amount:index % 3 + 2,
    kind:wideText, victim:wideText, item:wideText, zone:wideText, target:{ name:wideText, level:50 }, at:1000 + index
}));
const stressParse = compactParseSnapshot({ character:'Synthetic', totalDamage:9600, totalHealing:14400, sessionDps:10, sessionSeconds:960,
    encounters:Array.from({ length:24 }, (_, index) => ({ id:`stress-${index}`, name:wideText, duration:10, events:stressEvents })), recentEvents:stressEvents });
const stressSums = aggregateSums(stressParse.breakdowns);
const encounterSums = aggregateSums(stressParse.encounters[0].breakdowns);
const timerState = { timers:[{ id:'timer-stress', label:'Keep this deadline', durationSeconds:600, startedAt:1000, expiresAt:601000, status:'running' }],
    definitions:[{ id:'definition-stress', label:'Saved timer', durationSeconds:600 }], swing:{ status:'tracking', lastAt:1000, intervalMs:3000 } };
const stressSnapshot = { schemaVersion:1, sessionId:'stress-session', sequence:1, at:1000, session:{ character:'Synthetic', zone:'Test Zone', parse:stressParse, timers:timerState,
    intel:{ npcs:[] }, consider:{ drops:[] } } };
assert.ok(encodedBytes(stressSnapshot) > 2 * 1024 * 1024, 'fixture exceeds broker cap in UTF-8, not merely in character count');
const fitted = fitOverlaySnapshot(stressSnapshot);
assert.ok(encodedBytes(fitted) < 2 * 1024 * 1024, 'large native snapshot fits hard broker cap');
assert.deepEqual(aggregateSums(fitted.session.parse.breakdowns), stressSums, 'size reduction conserves full retained damage, healing, rune totals and action counts');
assert.ok(fitted.session.parse.encounters.length >= 1);
for (const encounter of fitted.session.parse.encounters) {
    assert.ok(encounter.events.length <= 20);
    assert.equal(encounter.eventsTruncated, true);
    assert.deepEqual(aggregateSums(encounter.breakdowns), encounterSums, 'shrinking an encounter feed does not shrink its ability totals/counts');
}
assert.deepEqual(fitted.session.timers, timerState, 'fitting a large snapshot never drops timers or changes absolute deadlines');
assert.equal(fitted.session.parse.sessionSeconds, 960);

// Oversized malformed dataset labels can still survive the normal reductions.
// The final fallback retains numeric aggregates and keeps timer updates alive.
const fallbackInput = { schemaVersion:1, sessionId:'fallback-session', sequence:2, at:2000, session:{ character:'Synthetic', zone:'Test Zone',
    parse:structuredClone(stressParse), timers:structuredClone(timerState), notice:{ id:'notice-stress', at:2000, panel:'timers', message:'Keep this error', status:'error' },
    intel:{ npcs:Array.from({ length:50 }, () => ({ name:'界'.repeat(30000), drops:[] })) }, consider:{ drops:[] } } };
const fallbackSums = aggregateSums(fallbackInput.session.parse.breakdowns);
const fallback = fitOverlaySnapshot(fallbackInput);
assert.ok(encodedBytes(fallback) < 2 * 1024 * 1024);
assert.match(fallback.session.logStatus, /main app/);
assert.deepEqual(aggregateSums(fallback.session.parse.breakdowns), fallbackSums, 'defensive fallback conserves all metric totals/counts including rune capacity');
assert.deepEqual(fallback.session.timers, timerState);
assert.equal(fallback.session.notice.panel, 'timers');
assert.equal(fallback.session.notice.message, 'Keep this error');

let clock = Date.parse('2026-10-21T12:00:00Z');
let actionListener, scheduled, cleared = [], unsubscribed = 0, writes = 0;
let failSave = false, failPublish = false;
const values = new Map(), notifications = [], published = [], forwarded = [];
const api = {
    onAction(callback) { actionListener = callback; return () => { unsubscribed++; }; },
    async publish(snapshot) { if (failPublish) throw new Error('Closed panel'); published.push(snapshot); }
};
const storage = {
    getItem(key) { return values.get(key); },
    setItem(key, value) { writes++; if (failSave) throw new Error('Storage full'); values.set(key, value); }
};
const options = {
    api, storage, getSession:() => ({ character:'Synthetic', zone:'Test Zone', parse:compact }),
    onCommand:async command => { forwarded.push(command); }, notify:message => notifications.push(message),
    now:() => clock, setInterval(callback, delay) { assert.equal(delay, 1000); scheduled = callback; return 42; },
    clearInterval(id) { cleared.push(id); }
};
let session = createOverlaySession(options);
await actionListener({ action:'timer:save-definition', payload:{ label:'Literal spell', type:'text', trigger:'begins casting Heal', durationSeconds:30, overlap:'add' } });
assert.equal(session.engine.snapshot().definitions.length, 1);
assert.equal(published.at(-1).session.character, 'Synthetic');
assert.equal(published.at(-1).schemaVersion, 1);
const initialSequence = published.at(-1).sequence;
const initialSessionId = published.at(-1).sessionId;
session.consume(null, { live:false, at:clock, logId:'synthetic', zone:'Test Zone', text:'a synthetic cleric begins casting Heal.' });
assert.equal(session.engine.snapshot().timers.length, 0, 'backfilled text does not create transient timers');
const writesBeforeBatch = writes;
session.consume(null, { live:true, at:clock, logId:'synthetic', zone:'Test Zone', text:'a synthetic cleric begins casting Heal.' });
assert.equal(session.engine.snapshot().timers.length, 1);
assert.equal(writes, writesBeforeBatch, 'line consumption does not serialize all timer preferences per log line');
session.flush();
assert.ok(writes > writesBeforeBatch, 'one batch flush saves newly triggered timer and replay guards');
const firstTimer = session.engine.snapshot().timers[0];
clock += 2000;
await actionListener({ action:'timer:pause', payload:{ id:firstTimer.id } });
assert.equal(session.engine.snapshot().timers[0].remainingMs, 28000);
assert.equal(published.at(-1).session.timers.timers[0].status, 'paused');
assert.ok(published.at(-1).sequence > initialSequence);
assert.equal(published.at(-1).sessionId, initialSessionId);
const pausedState = values.get('eql-eye-of-zomm-timers-v1');
assert.equal(JSON.parse(pausedState).timers[0].status, 'paused');
await actionListener({ action:'session:open', payload:{ view:'items' } });
assert.deepEqual(forwarded.at(-1), { action:'session:open', payload:{ view:'items' } });
const beforeManualSplit = session.engine.exportState();
await actionListener({ action:'session:new-session', payload:{} });
assert.deepEqual(forwarded.at(-1), { action:'session:new-session', payload:{} }, 'manual parse split goes to the main parser owner');
assert.deepEqual(session.engine.exportState(), beforeManualSplit, 'manual parse split preserves trigger definitions, active timers, swing tracking and replay guards');
await actionListener({ panel:'timers', action:'timer:not-supported', payload:{} });
assert.equal(notifications.at(-1), 'Unknown timer action.');
assert.equal(published.at(-1).session.notice.panel, 'timers', 'owner command errors are targeted to the panel that requested them');
assert.equal(published.at(-1).session.notice.message, 'Unknown timer action.');
assert.equal(published.at(-1).session.notice.status, 'error');
assert.equal(published.at(-1).session.notice.at, clock);
await actionListener({ panel:'timers', action:'timer:start', payload:{ label:'Bad period', durationSeconds:0 } });
assert.match(notifications.at(-1), /duration/);
assert.equal(published.at(-1).session.notice.panel, 'timers');
assert.match(published.at(-1).session.notice.message, /duration/);
assert.equal(session.engine.snapshot().timers.length, 1, 'a malformed panel command cannot mutate existing timers');

session.dispose();
session.dispose();
assert.deepEqual(cleared, [42]);
assert.equal(unsubscribed, 1);
const publishedBeforeDispose = published.length;
await actionListener({ action:'timer:cancel-all' });
await session.publish();
assert.equal(published.length, publishedBeforeDispose);
assert.equal(session.engine.snapshot().timers.length, 1, 'disposed owner ignores a queued panel action');

session = createOverlaySession(options);
assert.equal(session.engine.snapshot().timers[0].remainingMs, 28000, 'restoring a paused timer does not run down or restart');
session.consume(null, { live:true, at:firstTimer.startedAt, logId:'synthetic', zone:'Test Zone', text:'a synthetic cleric begins casting Heal.' });
assert.equal(session.engine.snapshot().timers.length, 1, 'restored same-second final line does not add a duplicate');
await actionListener({ action:'timer:resume', payload:{ id:firstTimer.id } });
clock += 30000;
await session.publish();
assert.equal(published.at(-1).session.timers.timers[0].status, 'ended', 'periodic publish expires timers without a log message');
session.dispose();

values.set('eql-eye-of-zomm-timers-v1', '{malformed JSON');
session = createOverlaySession(options);
assert.equal(session.engine.snapshot().definitions.length, 0, 'invalid saved state does not prevent parser/session startup');
failSave = true;
const noticeCount = notifications.length;
await actionListener({ action:'timer:start', payload:{ label:'Still works', durationSeconds:10 } });
await actionListener({ action:'timer:start', payload:{ label:'Still works twice', durationSeconds:10 } });
assert.equal(session.engine.snapshot().timers.length, 2, 'local save failure does not block timer use');
assert.equal(notifications.length, noticeCount + 1, 'storage failure warns once instead of flooding log polling');
assert.match(notifications.at(-1), /could not be saved/);
failPublish = true;
await session.publish();
assert.equal(session.engine.snapshot().timers.length, 2, 'panel transport failure does not stop owner state');
failPublish = false;
failSave = false;
await session.publish();
assert.equal(published.at(-1).session.timers.timers.length, 2, 'transport recovers on next publish');
assert.equal(JSON.parse(values.get('eql-eye-of-zomm-timers-v1')).timers.length, 2, 'saving retries after a storage failure');
assert.equal(typeof scheduled, 'function');
session.dispose();

console.log('Overlay session: complete parse aggregates, bounded/private snapshots, timer actions, batch persistence, restart/replay and failure recovery passed.');

// The main-window editor uses the same engine and observer stream as overlays.
{
    const listeners = [], localPublished = [];
    const editorSession = createOverlaySession({ now:() => clock, storage:{ getItem() {}, setItem() {} },
        api:{ async publish(value) { localPublished.push(value); } }, getSession:() => ({}),
        setInterval() { return 88; }, clearInterval() {} });
    const stop = editorSession.onTimers(value => listeners.push(value));
    assert.equal(listeners.length, 1, 'main editor receives current state immediately');
    await editorSession.commandTimer('start', { label:'Main editor timer', durationSeconds:60 });
    assert.equal(editorSession.getTimers().timers.length, 1);
    assert.equal(listeners.at(-1).timers[0].label, 'Main editor timer');
    assert.equal(localPublished.at(-1).session.timers.timers[0].id, editorSession.getTimers().timers[0].id);
    await assert.rejects(editorSession.commandTimer('missing-action'), /Unknown timer action/);
    await assert.rejects(editorSession.commandTimer('start', { label:'Invalid', durationSeconds:0 }), /duration/);
    stop(); const notificationsBefore = listeners.length;
    await editorSession.commandTimer('pause', { id:editorSession.getTimers().timers[0].id });
    assert.equal(listeners.length, notificationsBefore, 'disposing the editor only removes its observer');
    assert.equal(editorSession.getTimers().timers[0].status, 'paused');
    editorSession.dispose();
    await assert.rejects(editorSession.commandTimer('cancel-all'), /closed/);
}
