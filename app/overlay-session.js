import { TimerEngine } from './timer-engine.js';
import { compactCombatants } from './combatants.js';

const STORAGE_KEY = 'eql-eye-of-zomm-timers-v1';
const text = (value, limit = 240) => String(value ?? '').slice(0, limit);
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const TIMER_ACTIONS = new Set(['save-definition', 'remove-definition', 'fire-definition', 'start', 'pause', 'resume', 'reset', 'cancel', 'delete', 'create-spawn', 'reset-swing', 'set-swing-enabled', 'set-swing-delay', 'set-zone', 'cancel-all']);

function eventSummary(event) {
    const result = {};
    for (const key of ['type', 'source', 'kind', 'victim', 'attacker', 'actor', 'item', 'zone']) if (event[key] != null) result[key] = text(event[key]);
    for (const key of ['at', 'amount', 'quantity']) if (Number.isFinite(event[key])) result[key] = event[key];
    if (event.target) result.target = typeof event.target === 'object' ? { name:text(event.target.name), level:amount(event.target.level) } : text(event.target);
    return result;
}

function aggregate(events, into = { damage:[], healing:[], runes:[], taken:[], takenAbilities:[] }) {
    const keys = { damage:'damage', heal:'healing', rune:'runes', taken:'taken' };
    const add = (key, name, value) => {
        const rows = into[key] ||= [];
        let row = rows.find(row => row.name === name);
        if (!row) {
            // Preserve totals even for an unusually varied session.
            const label = rows.length < 120 ? name : key === 'taken' ? 'Other attackers' : 'Other abilities';
            row = rows.find(row => row.name === label);
            if (!row) { row = { name:label, total:0, count:0 }; rows.push(row); }
        }
        row.total += amount(value); row.count++;
    };
    for (const event of events || []) {
        const key = keys[event.type];
        if (!key) continue;
        const name = key === 'taken' ? text(event.attacker || 'Unknown attacker') :
            text(event.source || event.kind || (key === 'runes' ? 'Rune capacity granted' : 'Unknown ability'));
        add(key, name, event.amount);
        if (key === 'taken') add('takenAbilities', text(event.source || 'Unknown ability'), event.amount);
    }
    return into;
}

function withTakenRates(breakdowns, seconds) {
    for (const key of ['taken', 'takenAbilities']) for (const row of breakdowns[key] || []) row.rate = row.total / Math.max(1, amount(seconds));
    return breakdowns;
}

// Native panels receive bounded presentation data, never log lines or paths.
// Aggregate the complete retained encounter before bounding its event feed.
export function compactParseSnapshot(source = {}) {
    const encounters = source.encounters || [];
    const breakdowns = { damage:[], healing:[], runes:[], taken:[], takenAbilities:[] };
    for (const encounter of encounters) aggregate(encounter.events, breakdowns);
    return {
        character:text(source.character), totalDamage:amount(source.totalDamage), totalHealing:amount(source.totalHealing),
        totalRuneCapacity:Number.isFinite(source.totalRuneCapacity) ? amount(source.totalRuneCapacity) : breakdowns.runes.reduce((sum,row) => sum + row.total,0),
        sessionNumber:amount(source.sessionNumber), sessionStartedAt:amount(source.sessionStartedAt),
        totalTaken:amount(source.totalTaken), totalTakenHits:amount(source.totalTakenHits), takenSeconds:amount(source.takenSeconds),
        sessionTakenPerSecond:amount(source.sessionTakenPerSecond), totalKills:amount(source.totalKills), totalOwnKills:amount(source.totalOwnKills),
        totalLoot:amount(source.totalLoot), encounterCount:amount(source.encounterCount),
        totalAaGained:amount(source.totalAaGained), combatants:compactCombatants(source.combatants), combatantSeconds:amount(source.combatantSeconds),
        encounterHistoryLimited:Boolean(source.encounterHistoryLimited),
        sessionDps:amount(source.sessionDps), sessionSeconds:amount(source.sessionSeconds), breakdowns:withTakenRates(breakdowns, source.takenSeconds),
        encounters:encounters.slice(0, 20).map(encounter => ({
            id:text(encounter.id), name:text(encounter.name), active:Boolean(encounter.active),
            startAt:amount(encounter.startAt), lastAt:amount(encounter.lastAt), duration:amount(encounter.duration),
            damage:amount(encounter.damage), healing:amount(encounter.healing), dps:amount(encounter.dps),
            taken:amount(encounter.taken), takenHits:amount(encounter.takenHits), takenPerSecond:amount(encounter.takenPerSecond),
            combatants:compactCombatants(encounter.combatants),
            breakdowns:withTakenRates(aggregate(encounter.events), encounter.duration), eventsTruncated:(encounter.events?.length || 0) > 120,
            events:(encounter.events || []).slice(-120).map(eventSummary)
        })),
        recentEvents:(source.recentEvents || []).slice(0, 60).map(eventSummary)
    };
}

const snapshotBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function shrinkBreakdowns(breakdowns, limit) {
    for (const [key, rows] of Object.entries(breakdowns || {})) {
        if (!Array.isArray(rows) || rows.length <= limit) continue;
        rows.sort((left, right) => right.total - left.total);
        const rest = rows.splice(limit);
        rows.push({ name:key === 'taken' ? 'Other attackers' : 'Other abilities',
            total:rest.reduce((sum, row) => sum + row.total, 0), count:rest.reduce((sum, row) => sum + row.count, 0),
            ...(key.startsWith('taken') ? { rate:rest.reduce((sum, row) => sum + amount(row.rate), 0) } : {}) });
    }
}

// The native broker has a hard 2 MiB cap. Large synthetic/long sessions must
// retain totals and timer updates rather than silently starving every panel.
export function fitOverlaySnapshot(snapshot) {
    const limit = 1800 * 1024;
    if (snapshotBytes(snapshot) <= limit) return snapshot;
    const session = snapshot.session;
    const parse = session.parse || {};
    for (const encounter of parse.encounters || []) {
        encounter.eventsTruncated ||= encounter.events.length > 20;
        encounter.events = encounter.events.slice(-20);
        shrinkBreakdowns(encounter.breakdowns, 24);
        encounter.combatants = compactCombatants(encounter.combatants, 40, 12);
    }
    shrinkBreakdowns(parse.breakdowns, 60);
    parse.combatants = compactCombatants(parse.combatants, 80, 16);
    if (snapshotBytes(snapshot) <= limit) return snapshot;
    if (parse.encounters) parse.encounters = parse.encounters.slice(0, 3);
    // Drop details remain available through the lazy broker for every NPC.
    if (session.intel?.npcs) session.intel.npcs = session.intel.npcs.map(npc => ({ ...npc, drops:[] }));
    if (snapshotBytes(snapshot) <= limit) return snapshot;
    // Defensive fallback for malformed dataset text. Keep timer deadlines and
    // player totals; defer details to the complete app.
    return { ...snapshot, session:{ character:text(session.character), zone:text(session.zone),
        logStatus:'Open the main app for full session details.', timers:session.timers, notice:session.notice,
        parse:{ character:text(parse.character || session.character),totalDamage:parse.totalDamage, totalHealing:parse.totalHealing, totalRuneCapacity:parse.totalRuneCapacity,
            sessionNumber:parse.sessionNumber, sessionStartedAt:parse.sessionStartedAt, sessionDps:parse.sessionDps, sessionSeconds:parse.sessionSeconds,
            totalTaken:parse.totalTaken, totalTakenHits:parse.totalTakenHits, takenSeconds:parse.takenSeconds, sessionTakenPerSecond:parse.sessionTakenPerSecond,
            totalKills:parse.totalKills, totalOwnKills:parse.totalOwnKills, totalLoot:parse.totalLoot, encounterCount:parse.encounterCount,
            totalAaGained:parse.totalAaGained, combatantSeconds:parse.combatantSeconds, combatants:compactCombatants(parse.combatants, 24, 4),
            encounterHistoryLimited:parse.encounterHistoryLimited,
            breakdowns:Object.fromEntries(['damage', 'healing', 'runes', 'taken', 'takenAbilities'].map(key => [key, [{ name:key === 'taken' ? 'Other attackers' : 'Other abilities',
                total:(parse.breakdowns?.[key] || []).reduce((sum, row) => sum + amount(row.total), 0),
                count:(parse.breakdowns?.[key] || []).reduce((sum, row) => sum + amount(row.count), 0),
                ...(key.startsWith('taken') ? { rate:(parse.breakdowns?.[key] || []).reduce((sum, row) => sum + amount(row.rate), 0) } : {}) }]])) },
        intel:{ npcs:[], zone:text(session.zone), message:'This dataset exceeds the overlay limit. Open NPCs in the main app.' } } };
}

export function createOverlaySession({ api, storage = globalThis.localStorage, getSession, onCommand = () => {}, onCues = () => {}, notify = () => {}, now = Date.now,
    setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval } = {}) {
    let saved = null;
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (raw && raw.length <= 1024 * 1024) saved = JSON.parse(raw);
    } catch { /* Invalid local preferences should not stop log parsing. */ }
    const engine = new TimerEngine({ now, state:saved });
    const sessionId = `session-${now()}-${Math.random().toString(36).slice(2)}`;
    let sequence = 0, disposed = false, busy = false, lastSaved = '', storageWarning = false, notice = null, flushQueued = false;
    function cues() { const pending = engine.drainCues(); if (pending.length) { try { onCues(pending); } catch { /* A device failure cannot interrupt parsing. */ } } }
    function scheduleFlush() {
        if (disposed || flushQueued) return;
        flushQueued = true;
        queueMicrotask(() => { flushQueued=false; if (!disposed) { cues(); void publish(); } });
    }
    const timerListeners = new Set();
    function emitTimers(snapshot) {
        for (const listener of timerListeners) {
            try { listener(snapshot); } catch { /* One presentation cannot stop the shared clock. */ }
        }
    }
    function persist() {
        const json = JSON.stringify(engine.exportState());
        if (json === lastSaved) return;
        try { storage?.setItem(STORAGE_KEY, json); lastSaved = json; }
        catch {
            if (!storageWarning) {
                storageWarning = true;
                const message = 'Timer changes could not be saved on this PC.';
                notice = { id:`storage-${now()}`, at:now(), panel:'timers', message, status:'error' };
                notify(message);
            }
        }
    }
    async function publish() {
        if (disposed || busy) return;
        busy = true;
        try {
            const timers = engine.snapshot(now());
            cues();
            persist();
            emitTimers(timers);
            if (api?.publish) await api.publish(fitOverlaySnapshot({ schemaVersion:1, sessionId, sequence:++sequence, at:now(), session:{ ...getSession(), timers, notice } }));
        } catch { /* A closing renderer or unavailable panel cannot stop the owner. */ }
        finally { busy = false; }
    }
    const unsubscribe = api?.onAction?.(async command => {
        if (disposed || !command || typeof command.action !== 'string') return;
        try {
            let result = {};
            if (command.action.startsWith('timer:')) {
                const action = command.action.slice(6);
                if (!TIMER_ACTIONS.has(action)) throw new Error('Unknown timer action.');
                await engine.command(action, command.payload || {});
                persist();
            } else result = await onCommand(command);
            if (command.requestId) await api?.reply?.(command.requestId, result || {});
            await publish();
        } catch (error) {
            const message = text(error?.message || 'The overlay action could not complete.');
            if (command.requestId) await api?.reply?.(command.requestId, null, message);
            notice = { id:`notice-${now()}-${sequence}`, at:now(), panel:text(command.panel, 16), message, status:'error' };
            notify(message); await publish();
        }
    });
    const interval = setInterval(() => { void publish(); }, 1000);
    return {
        engine, publish,
        getTimers:() => engine.snapshot(now()),
        onTimers(listener) {
            if (typeof listener !== 'function' || disposed) return () => {};
            timerListeners.add(listener);
            listener(engine.snapshot(now()));
            return () => timerListeners.delete(listener);
        },
        async commandTimer(action, payload = {}) {
            if (disposed) throw new Error('The timer session has closed.');
            if (!TIMER_ACTIONS.has(action)) throw new Error('Unknown timer action.');
            const snapshot = await engine.command(action, payload);
            cues();
            persist(); emitTimers(snapshot); await publish();
            return snapshot;
        },
        testTimer:(definition,line) => engine.preview(definition,line),
        consume(event, context) {
            const result = engine.consume(event, context);
            if (result?.then) void result.then(scheduleFlush).catch(scheduleFlush);
        },
        flush:persist,
        dispose() { if (disposed) return; persist(); disposed = true; engine.close(); timerListeners.clear(); clearInterval(interval); unsubscribe?.(); }
    };
}
