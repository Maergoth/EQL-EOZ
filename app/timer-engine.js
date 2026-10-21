// Local timer state. The clock is injectable; log-triggered starts use the log's
// timestamp, never its arrival time. No game input, network or audio lives here.
const MAX_DURATION_SECONDS = 7 * 24 * 60 * 60;
const MAX_DEFINITIONS = 64;
const MAX_TIMERS = 100;
const SWING_VERBS = new Set(['hit', 'slash', 'crush', 'pierce', 'punch', 'claw', 'bite', 'maul']);
const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const fold = value => normalize(value).toLowerCase();
const finite = value => typeof value === 'number' && Number.isFinite(value);
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = value => Math.max(0, Math.min(1, value));
const tokenHash = value => {
    let hash = 2166136261;
    for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
};

function durationMs(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > MAX_DURATION_SECONDS) {
        throw new Error('Timer duration must be between 1 second and 7 days.');
    }
    return Math.round(seconds * 1000);
}

function definition(input, id) {
    const label = normalize(input.label).slice(0, 80);
    if (!label) throw new Error('Give the timer a name.');
    const type = ['manual', 'text', 'spawn'].includes(input.type) ? input.type : 'manual';
    const trigger = normalize(input.trigger).slice(0, 240);
    if (type === 'text' && !trigger) throw new Error('Enter the text that starts this timer.');
    const npc = normalize(input.npc).slice(0, 120);
    if (type === 'spawn' && !npc) throw new Error('Choose the NPC whose logged kill starts this timer.');
    return {
        id, label, type, durationSeconds:durationMs(input.durationSeconds) / 1000,
        repeat:Boolean(input.repeat), enabled:input.enabled !== false,
        trigger, match:['contains', 'starts', 'equals'].includes(input.match) ? input.match : 'contains',
        zone:normalize(input.zone).slice(0, 120), npc,
        overlap:['replace', 'ignore', 'add'].includes(input.overlap) ? input.overlap : 'replace'
    };
}

function estimateInterval(times, seed = null) {
    const gaps = times.slice(1).map((time, i) => time - times[i]).filter(gap => gap >= 1000 && gap <= 8000);
    if (seed !== null) gaps.push(seed);
    if (gaps.length < 2) return null;
    const sorted = gaps.slice().sort((a, b) => a - b);
    const base = sorted[Math.floor((sorted.length - 1) * 0.3)];
    const normalized = gaps.map(gap => gap / Math.max(1, Math.round(gap / base))).sort((a, b) => a - b);
    const middle = Math.floor(normalized.length / 2);
    return Math.round(normalized.length % 2 ? normalized[middle] : (normalized[middle - 1] + normalized[middle]) / 2);
}

export class TimerEngine {
    constructor({ now = () => Date.now(), definitions = [], state = null } = {}) {
        this.now = typeof now === 'function' ? now : () => Number(now);
        this.definitions = [];
        this.timers = [];
        this.nextId = 1;
        this.zone = '';
        this.lastKill = null;
        this.watermarks = new Map();
        this.lastTokens = new Set();
        this.swingEnabled = true;
        this.swingDelayTenths = 0;
        this.resetSwing();
        const saved = state && typeof state === 'object' ? state : {};
        const savedDefinitions = Array.isArray(saved.definitions) ? saved.definitions : definitions;
        for (const item of savedDefinitions.slice(0, MAX_DEFINITIONS)) {
            try {
                const id = normalize(item.id).slice(0, 100) || this.id('definition');
                if (!this.definitions.some(entry => entry.id === id)) this.definitions.push(definition(item, id));
            } catch { /* A malformed local entry must not prevent startup. */ }
        }
        this.zone = normalize(saved.zone).slice(0, 120);
        this.swingEnabled = saved.swingEnabled !== false;
        if (Number.isInteger(saved.swingDelayTenths) && saved.swingDelayTenths >= 0 && saved.swingDelayTenths <= 200) this.swingDelayTenths = saved.swingDelayTenths;
        if (Array.isArray(saved.tokens)) this.lastTokens = new Set(saved.tokens.slice(-512).filter(item => typeof item === 'string' && item.length < 300));
        if (saved.lastKill && normalize(saved.lastKill.name) && finite(saved.lastKill.at)) {
            this.lastKill = { name:normalize(saved.lastKill.name).slice(0, 120), zone:normalize(saved.lastKill.zone).slice(0, 120), at:saved.lastKill.at };
        }
        if (Array.isArray(saved.watermarks)) {
            for (const entry of saved.watermarks.slice(-8)) {
                if (Array.isArray(entry) && typeof entry[0] === 'string' && finite(entry[1])) this.watermarks.set(entry[0], entry[1]);
            }
        }
        if (Array.isArray(saved.timers)) {
            for (const item of saved.timers.slice(-MAX_TIMERS)) {
                try {
                    const total = durationMs(item.durationSeconds);
                    if (!normalize(item.id) || !normalize(item.label) || !finite(item.startedAt)) continue;
                    if (!['running', 'paused', 'ended'].includes(item.status)) continue;
                    if (item.status === 'running' && !finite(item.expiresAt)) continue;
                    if (item.status === 'paused' && (!finite(item.remainingMs) || item.remainingMs < 0 || item.remainingMs > total)) continue;
                    if (this.timers.some(entry => entry.id === item.id)) continue;
                    this.timers.push({
                        id:normalize(item.id).slice(0, 100), definitionId:normalize(item.definitionId).slice(0, 100),
                        label:normalize(item.label).slice(0, 80), durationSeconds:total / 1000,
                        repeat:Boolean(item.repeat), zone:normalize(item.zone).slice(0, 120),
                        npc:normalize(item.npc).slice(0, 120), source:['manual', 'text', 'spawn'].includes(item.source) ? item.source : 'manual',
                        startedAt:item.startedAt, expiresAt:item.status === 'running' ? item.expiresAt : null,
                        remainingMs:item.status === 'paused' ? item.remainingMs : 0,
                        status:item.status, cycles:Number.isSafeInteger(item.cycles) && item.cycles > 0 ? item.cycles : 0
                    });
                } catch { /* Ignore corrupt persisted timer rows individually. */ }
            }
        }
        this.advance(this.now());
    }

    id(prefix) {
        let id;
        do { id = `${prefix}-${this.nextId++}`; }
        while (this.definitions.some(item => item.id === id) || this.timers.some(item => item.id === id));
        return id;
    }

    advance(at) {
        if (!finite(at)) throw new Error('Timer clock must be a finite timestamp.');
        for (const timer of this.timers) {
            if (timer.status !== 'running' || at < timer.expiresAt) continue;
            if (timer.repeat) {
                const interval = timer.durationSeconds * 1000;
                const cycles = Math.floor((at - timer.expiresAt) / interval) + 1;
                timer.cycles += cycles;
                timer.expiresAt += cycles * interval;
                timer.startedAt = timer.expiresAt - interval;
            } else {
                timer.status = 'ended';
                timer.expiresAt = null;
                timer.remainingMs = 0;
            }
        }
    }

    start(input, at, source = 'manual') {
        const total = durationMs(input.durationSeconds);
        const label = normalize(input.label).slice(0, 80);
        if (!label) throw new Error('Give the timer a name.');
        const associated = input.id ? this.timers.filter(timer => timer.definitionId === input.id && timer.status !== 'ended') : [];
        if (associated.length && input.overlap === 'ignore') return associated[0];
        if (input.overlap === 'replace' && input.id) this.timers = this.timers.filter(timer => timer.definitionId !== input.id);
        if (this.timers.length >= MAX_TIMERS) {
            const ended = this.timers.findIndex(timer => timer.status === 'ended');
            if (ended !== -1) this.timers.splice(ended, 1);
            else throw new Error('There are 100 active timers. Dismiss one before adding another.');
        }
        const timer = {
            id:this.id('timer'), definitionId:input.id || '', label, source,
            durationSeconds:total / 1000, repeat:Boolean(input.repeat),
            zone:normalize(input.zone), npc:normalize(input.npc),
            startedAt:at, expiresAt:at + total, remainingMs:total, status:'running', cycles:0
        };
        this.timers.push(timer);
        this.advance(this.now());
        return timer;
    }

    consume(event, context = {}) {
        const source = normalize(context.logId || context.character || 'current').slice(0, 240);
        if (this.swingSource !== source) {
            this.resetSwing();
            this.swingSource = source;
        }
        // Historical parsing still establishes the active zone for visibility.
        // It must never create a kill reminder, trigger or swing observation.
        const activeZone = event?.type === 'zone' ? event.zone : context.zone;
        if (activeZone && fold(activeZone) !== fold(this.zone)) {
            this.resetSwing();
            this.zone = normalize(activeZone).slice(0, 120);
        }
        // The caller marks initial/backfill reads live:false. Persisted per-log
        // high-water marks also protect a live reread/reconnect from restarting.
        if (context.live === false) return false;
        const at = event?.at ?? context.at;
        if (!finite(at)) return false;
        const watermark = this.watermarks.get(source);
        if (finite(watermark) && at < watermark) return false;
        // Same-second distinct log messages remain eligible. Exact line IDs can
        // distinguish a duplicate from multiple genuine matches in that second.
        const token = `${source}|${tokenHash(context.lineId ?? `${at}|${context.text || JSON.stringify(event)}`)}`;
        if (this.lastTokens.has(token)) return false;
        this.lastTokens.add(token);
        if (this.lastTokens.size > 512) this.lastTokens.delete(this.lastTokens.values().next().value);
        this.watermarks.set(source, Math.max(watermark ?? -Infinity, at));
        if (this.watermarks.size > 8) this.watermarks.delete(this.watermarks.keys().next().value);
        if (event?.type === 'zone') {
            if (fold(this.zone) !== fold(event.zone)) this.resetSwing();
            this.zone = normalize(event.zone);
        } else if (context.zone) this.zone = normalize(context.zone);
        if (event?.type === 'kill' && normalize(event.victim)) {
            this.lastKill = { name:normalize(event.victim), zone:this.zone, at };
        }
        this.observeSwing(event, at);
        const text = fold(String(context.text || event?.text || '').replace(/^\[[^\]]+\]\s*/, ''));
        let changed = false;
        for (const item of this.definitions) {
            if (!item.enabled || (item.zone && fold(item.zone) !== fold(this.zone))) continue;
            const trigger = fold(item.trigger);
            const textMatch = item.type === 'text' && text && (item.match === 'equals' ? text === trigger : item.match === 'starts' ? text.startsWith(trigger) : text.includes(trigger));
            const spawnMatch = item.type === 'spawn' && event?.type === 'kill' && fold(item.npc) === fold(event.victim);
            if (!textMatch && !spawnMatch) continue;
            // A backlog event whose countdown already elapsed cannot briefly
            // revive a repeating trigger when read after a pause/reconnect.
            if (at + item.durationSeconds * 1000 <= this.now()) continue;
            if (this.timers.filter(timer => timer.status !== 'ended').length >= MAX_TIMERS && item.overlap === 'add') continue;
            try { this.start(item, at, item.type); changed = true; } catch { /* Capacity must never stop log consumption. */ }
        }
        return changed;
    }

    resetSwing() {
        this.swing = { times:[], intervalMs:null, lastAt:null, casting:false, seed:null, seedAt:null };
    }

    observeSwing(event, at) {
        if (!event || !this.swingEnabled) return;
        if (event.type === 'cast-begin') { this.swing.casting = true; return; }
        if (event.type === 'cast-interrupt' || event.type === 'heal' || (event.type === 'damage' && event.kind === 'spell')) this.swing.casting = false;
        const verb = fold(event.skill || event.source);
        const ownMelee = (event.type === 'damage' && event.kind === 'melee') || event.type === 'melee-miss';
        if (!ownMelee || !SWING_VERBS.has(verb) || event.swingEligible === false) return;
        const previous = this.swing.lastAt;
        if (finite(previous) && (at <= previous || Math.floor(at / 1000) === Math.floor(previous / 1000))) return;
        const idleAfter = this.swing.intervalMs ? 2.5 * this.swing.intervalMs + 1000 : 10000;
        if (finite(previous) && at - previous > idleAfter) this.resetSwing();
        this.swing.casting = false;
        this.swing.times.push(at);
        this.swing.times = this.swing.times.filter(time => at - time <= 90000).slice(-24);
        const times = this.swing.times;
        if (times.length === 1 && this.swingDelayTenths) {
            this.swing.seed = this.swingDelayTenths * 100;
            this.swing.seedAt = at;
        }
        const seed = times.includes(this.swing.seedAt) ? this.swing.seed : null;
        const current = this.swing.intervalMs;
        if (current && times.length >= 3) {
            const first = times.at(-2) - times.at(-3);
            const second = at - times.at(-2);
            const mean = (first + second) / 2;
            if (first >= 1000 && first <= 8000 && second >= 1000 && second <= 8000 &&
                Math.abs(first - second) <= 0.08 * mean && Math.abs(mean - current) > Math.max(0.1 * current, 400) && mean < 1.6 * current) {
                this.swing.times = times.slice(-3);
                this.swing.seed = null;
                this.swing.seedAt = null;
                this.swing.intervalMs = Math.round(mean);
            } else this.swing.intervalMs = estimateInterval(times, seed) ?? current;
        } else this.swing.intervalMs = times.length === 1 ? seed : estimateInterval(times, seed);
        this.swing.lastAt = at;
    }

    command(action, args = {}) {
        const at = this.now();
        this.advance(at);
        if (action === 'save-definition') {
            const input = args.definition || args;
            const index = this.definitions.findIndex(item => item.id === input.id);
            if (index === -1 && this.definitions.length >= MAX_DEFINITIONS) throw new Error('There are 64 saved timers. Remove one before adding another.');
            const saved = definition(input, index === -1 ? this.id('definition') : input.id);
            if (index === -1) this.definitions.push(saved); else this.definitions[index] = saved;
        } else if (action === 'remove-definition') {
            this.definitions = this.definitions.filter(item => item.id !== args.id);
            this.timers = this.timers.filter(item => item.definitionId !== args.id);
        } else if (action === 'start') {
            const item = this.definitions.find(entry => entry.id === (args.definitionId || args.id));
            if ((args.definitionId || args.id) && !item) throw new Error('That saved timer no longer exists.');
            if (item?.zone && fold(item.zone) !== fold(this.zone)) throw new Error(`This timer is limited to ${item.zone}.`);
            this.start(item || args, at);
        } else if (action === 'create-spawn') {
            if (!this.lastKill) throw new Error('A logged NPC kill is needed before starting a spawn countdown.');
            const kill = this.lastKill;
            this.start({ label:args.label || `${kill.name} respawn`, durationSeconds:args.durationSeconds, npc:kill.name, zone:kill.zone, repeat:false }, kill.at, 'spawn');
        } else if (action === 'cancel-all') this.timers = [];
        else if (action === 'reset-swing') this.resetSwing();
        else if (action === 'set-swing-enabled') {
            this.swingEnabled = Boolean(args.enabled);
            this.resetSwing();
        } else if (action === 'set-swing-delay') {
            const delay = Number(args.delayTenths);
            if (!Number.isInteger(delay) || delay < 0 || delay > 200) throw new Error('Weapon delay must be 0 (automatic) or 1–200 tenths of a second.');
            // A setting change is not an observed swing and must not move an
            // existing bar or override its seed/learned timing reference.
            this.swingDelayTenths = delay;
        }
        else if (action === 'set-zone') {
            if (fold(this.zone) !== fold(args.zone)) this.resetSwing();
            this.zone = normalize(args.zone).slice(0, 120);
        } else if (['pause', 'resume', 'reset', 'cancel', 'delete'].includes(action)) {
            const timer = this.timers.find(item => item.id === args.id);
            if (!timer) throw new Error('That timer no longer exists.');
            if (action === 'cancel' || action === 'delete') this.timers = this.timers.filter(item => item.id !== args.id);
            else if (action === 'pause' && timer.status === 'running') {
                timer.remainingMs = Math.max(0, timer.expiresAt - at);
                timer.status = 'paused';
                timer.expiresAt = null;
            } else if (action === 'resume' && timer.status === 'paused') {
                timer.expiresAt = at + timer.remainingMs;
                timer.status = 'running';
            } else if (action === 'reset') {
                timer.startedAt = at;
                timer.expiresAt = at + timer.durationSeconds * 1000;
                timer.remainingMs = timer.durationSeconds * 1000;
                timer.status = 'running';
                timer.cycles = 0;
            }
        } else throw new Error('Unknown timer action.');
        return this.snapshot(at);
    }

    snapshot(at = this.now()) {
        this.advance(at);
        const { lastAt, intervalMs, times, casting } = this.swing;
        const stale = lastAt === null || at - lastAt > (intervalMs ? 2.5 * intervalMs + 1000 : 10000);
        const elapsed = lastAt === null ? 0 : Math.max(0, at - lastAt);
        const status = stale ? 'idle' : casting ? 'casting' : !intervalMs ? 'learning' : elapsed >= intervalMs ? 'waiting' : 'tracking';
        return {
            definitions:clone(this.definitions), zone:this.zone, lastKill:this.lastKill ? { ...this.lastKill } : null,
            timers:this.timers.map(timer => {
                const remainingMs = timer.status === 'running' ? Math.max(0, timer.expiresAt - at) : timer.remainingMs;
                return { ...timer, remainingMs, progress:clamp(remainingMs / (timer.durationSeconds * 1000)), visible:!timer.zone || fold(timer.zone) === fold(this.zone) };
            }),
            swing:{ label:'Observed melee', status, intervalMs:stale ? null : intervalMs, lastAt, samples:stale ? 0 : times.length,
                progress:stale || !intervalMs ? null : casting ? 1 : clamp(elapsed / intervalMs),
                remainingMs:stale || !intervalMs ? null : casting ? 0 : Math.max(0, intervalMs - elapsed),
                precisionMs:1000, enabled:this.swingEnabled, delayTenths:this.swingDelayTenths }
        };
    }

    exportState() {
        this.advance(this.now());
        return clone({ schemaVersion:1, definitions:this.definitions, timers:this.timers, zone:this.zone,
            lastKill:this.lastKill, watermarks:[...this.watermarks], tokens:[...this.lastTokens],
            swingEnabled:this.swingEnabled, swingDelayTenths:this.swingDelayTenths });
    }
}
