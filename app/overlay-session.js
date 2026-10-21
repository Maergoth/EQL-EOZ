import { TimerEngine } from './timer-engine.js';

const STORAGE_KEY = 'eql-eye-of-zomm-timers-v1';
const text = (value, limit = 240) => String(value ?? '').slice(0, limit);
const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const TIMER_ACTIONS = new Set(['save-definition', 'remove-definition', 'start', 'pause', 'resume', 'reset', 'cancel', 'delete', 'create-spawn', 'reset-swing', 'set-swing-enabled', 'set-swing-delay', 'set-zone', 'cancel-all']);

function eventSummary(event) {
    const result = {};
    for (const key of ['type', 'source', 'kind', 'victim', 'item', 'zone']) if (event[key] != null) result[key] = text(event[key]);
    for (const key of ['at', 'amount', 'quantity']) if (Number.isFinite(event[key])) result[key] = event[key];
    if (event.target) result.target = typeof event.target === 'object' ? { name:text(event.target.name), level:amount(event.target.level) } : text(event.target);
    return result;
}

function aggregate(events, into = { damage:[], healing:[], runes:[] }) {
    const keys = { damage:'damage', heal:'healing', rune:'runes' };
    for (const event of events || []) {
        const key = keys[event.type];
        if (!key) continue;
        const rows = into[key];
        const name = text(event.source || event.kind || (key === 'runes' ? 'Rune capacity granted' : 'Unknown ability'));
        let row = rows.find(row => row.name === name);
        if (!row) {
            // Preserve totals even for an unusually varied session.
            const label = rows.length < 120 ? name : 'Other abilities';
            row = rows.find(row => row.name === label);
            if (!row) { row = { name:label, total:0, count:0 }; rows.push(row); }
        }
        row.total += amount(event.amount); row.count++;
    }
    return into;
}

// Native panels receive bounded presentation data, never log lines or paths.
// Aggregate the complete retained encounter before bounding its event feed.
export function compactParseSnapshot(source = {}) {
    const encounters = source.encounters || [];
    const breakdowns = { damage:[], healing:[], runes:[] };
    for (const encounter of encounters) aggregate(encounter.events, breakdowns);
    return {
        character:text(source.character), totalDamage:amount(source.totalDamage), totalHealing:amount(source.totalHealing),
        sessionDps:amount(source.sessionDps), sessionSeconds:amount(source.sessionSeconds), breakdowns,
        encounters:encounters.slice(0, 20).map(encounter => ({
            id:text(encounter.id), name:text(encounter.name), active:Boolean(encounter.active),
            startAt:amount(encounter.startAt), lastAt:amount(encounter.lastAt), duration:amount(encounter.duration),
            damage:amount(encounter.damage), healing:amount(encounter.healing), dps:amount(encounter.dps),
            breakdowns:aggregate(encounter.events), eventsTruncated:(encounter.events?.length || 0) > 120,
            events:(encounter.events || []).slice(-120).map(eventSummary)
        })),
        recentEvents:(source.recentEvents || []).slice(0, 60).map(eventSummary)
    };
}

const snapshotBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function shrinkBreakdowns(breakdowns, limit) {
    for (const rows of Object.values(breakdowns || {})) {
        if (!Array.isArray(rows) || rows.length <= limit) continue;
        rows.sort((left, right) => right.total - left.total);
        const rest = rows.splice(limit);
        rows.push({ name:'Other abilities', total:rest.reduce((sum, row) => sum + row.total, 0), count:rest.reduce((sum, row) => sum + row.count, 0) });
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
    }
    shrinkBreakdowns(parse.breakdowns, 60);
    if (snapshotBytes(snapshot) <= limit) return snapshot;
    if (parse.encounters) parse.encounters = parse.encounters.slice(0, 3);
    if (session.intel?.npcs) session.intel.npcs = session.intel.npcs.slice(0, 25).map(npc => ({ ...npc, drops:npc.drops.slice(0, 1) }));
    if (session.consider?.drops) session.consider.drops = session.consider.drops.slice(0, 8);
    if (snapshotBytes(snapshot) <= limit) return snapshot;
    // Defensive fallback for malformed dataset text. Keep timer deadlines and
    // player totals; defer details to the complete app.
    return { ...snapshot, session:{ character:text(session.character), zone:text(session.zone),
        logStatus:'Open the main app for full session details.', timers:session.timers, notice:session.notice,
        parse:{ totalDamage:parse.totalDamage, totalHealing:parse.totalHealing, sessionDps:parse.sessionDps, sessionSeconds:parse.sessionSeconds,
            breakdowns:Object.fromEntries(['damage', 'healing', 'runes'].map(key => [key, [{ name:'Other abilities',
                total:(parse.breakdowns?.[key] || []).reduce((sum, row) => sum + amount(row.total), 0),
                count:(parse.breakdowns?.[key] || []).reduce((sum, row) => sum + amount(row.count), 0) }]])) },
        intel:{ npcs:[], zone:text(session.zone) }, consider:{} } };
}

export function createOverlaySession({ api, storage = globalThis.localStorage, getSession, onCommand = () => {}, notify = () => {}, now = Date.now,
    setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval } = {}) {
    let saved = null;
    try {
        const raw = storage?.getItem(STORAGE_KEY);
        if (raw && raw.length <= 1024 * 1024) saved = JSON.parse(raw);
    } catch { /* Invalid local preferences should not stop log parsing. */ }
    const engine = new TimerEngine({ now, state:saved });
    const sessionId = `session-${now()}-${Math.random().toString(36).slice(2)}`;
    let sequence = 0, disposed = false, busy = false, lastSaved = '', storageWarning = false, notice = null;
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
            persist();
            if (api?.publish) await api.publish(fitOverlaySnapshot({ schemaVersion:1, sessionId, sequence:++sequence, at:now(), session:{ ...getSession(), timers, notice } }));
        } catch { /* A closing renderer or unavailable panel cannot stop the owner. */ }
        finally { busy = false; }
    }
    const unsubscribe = api?.onAction?.(async command => {
        if (disposed || !command || typeof command.action !== 'string') return;
        try {
            if (command.action.startsWith('timer:')) {
                const action = command.action.slice(6);
                if (!TIMER_ACTIONS.has(action)) throw new Error('Unknown timer action.');
                engine.command(action, command.payload || {});
                persist();
            } else await onCommand(command);
            await publish();
        } catch (error) {
            const message = text(error?.message || 'The overlay action could not complete.');
            notice = { id:`notice-${now()}-${sequence}`, at:now(), panel:text(command.panel, 16), message, status:'error' };
            notify(message); await publish();
        }
    });
    const interval = setInterval(() => { void publish(); }, 1000);
    return {
        engine, publish,
        consume(event, context) { engine.consume(event, context); },
        flush:persist,
        dispose() { if (disposed) return; persist(); disposed = true; clearInterval(interval); unsubscribe?.(); }
    };
}
