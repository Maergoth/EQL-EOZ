// Local timer state. The clock is injectable; log-triggered starts use the log's
// timestamp, never its arrival time. No game input, network or audio lives here.
import { TriggerMatcher } from './trigger-matcher.js';
import { fillTriggerTemplate, matchTrigger, MAX_TRIGGER_PATTERN } from './trigger-match-core.js';
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
    const mode = ['contains', 'starts', 'equals', 'regex'].includes(input.match) ? input.match : 'contains';
    const rawTrigger = mode === 'regex' ? String(input.trigger ?? '').trim() : normalize(input.trigger);
    if (rawTrigger.length > MAX_TRIGGER_PATTERN) throw new Error('Expressions are limited to 2048 characters.');
    const trigger = rawTrigger;
    if (type === 'text' && !trigger) throw new Error('Enter the text that starts this timer.');
    const npc = normalize(input.npc).slice(0, 120);
    if (type === 'spawn' && !npc) throw new Error('Choose the NPC whose logged kill starts this timer.');
    return {
        id, label, type, durationSeconds:durationMs(input.durationSeconds) / 1000,
        repeat:Boolean(input.repeat), enabled:input.enabled !== false,
        trigger, match:mode,
        zone:normalize(input.zone).slice(0, 120), npc,
        overlap:['replace', 'ignore', 'add'].includes(input.overlap) ? input.overlap : 'replace',
        timerEnabled:input.timerEnabled !== false, displayLabel:normalize(input.displayLabel).slice(0, 240),
        ignorePunctuation:Boolean(input.ignorePunctuation),
        cooldownSeconds:Math.max(0, Math.min(600, Number(input.cooldownSeconds) || 0)),
        notificationSeconds:Math.max(1, Math.min(60, Number(input.notificationSeconds) || 4)),
        warningSeconds:Math.max(0, Math.min(MAX_DURATION_SECONDS, Number(input.warningSeconds) || 0)),
        lowSeconds:Math.max(0, Math.min(MAX_DURATION_SECONDS, input.lowSeconds === undefined ? 5 : Number(input.lowSeconds) || 0)),
        ...Object.fromEntries(['color', 'warningColor', 'lowColor'].map(key => [key, /^#[0-9a-f]{6}$/i.test(input[key] || '') ? input[key] : ''])),
        ...Object.fromEntries(['action', 'warningAction', 'endAction'].map(key => [key, ['sound', 'speak'].includes(input[key]) ? input[key] : 'none'])),
        ...Object.fromEntries(['sound', 'warningSound', 'endSound'].map(key => [key, ['Chime', 'Tick', 'Bell', 'Alert', 'Falling'].includes(input[key]) ? input[key] : key === 'warningSound' ? 'Tick' : key === 'endSound' ? 'Bell' : 'Chime'])),
        speech:String(input.speech || '{label}').slice(0, 240), warningSpeech:String(input.warningSpeech || '{label} soon').slice(0, 240), endSpeech:String(input.endSpeech || '{label}').slice(0, 240),
        volume:Math.max(0, Math.min(100, input.volume === undefined ? 80 : Number(input.volume) || 0)), error:normalize(input.error).slice(0, 240)
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
    constructor({ now = () => Date.now(), definitions = [], state = null, matcher } = {}) {
        this.now = typeof now === 'function' ? now : () => Number(now);
        this.definitions = [];
        this.timers = [];
        this.nextId = 1;
        this.zone = '';
        this.lastKill = null;
        this.watermarks = new Map();
        this.lastTokens = new Set();
        this.matcher = matcher || new TriggerMatcher(); this.notifications = []; this.cues = []; this.lastFired = new Map();
        this.regexQueue = []; this.regexScheduled = false; this.regexBusy = false; this.regexSequence = 0; this.matchingStatus = ''; this.closed = false;
        this.swingEnabled = true;
        this.swingDelayTenths = 0;
        this.resetSwing();
        const saved = state && typeof state === 'object' ? state : {};
        if (Array.isArray(saved.lastFired)) for (const entry of saved.lastFired.slice(0, 64)) {
            if (Array.isArray(entry) && typeof entry[0] === 'string' && finite(entry[1])) this.lastFired.set(entry[0], entry[1]);
        }
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
                        label:normalize(item.label).slice(0, 240), durationSeconds:total / 1000,
                        repeat:Boolean(item.repeat), zone:normalize(item.zone).slice(0, 120),
                        npc:normalize(item.npc).slice(0, 120), source:['manual', 'text', 'spawn'].includes(item.source) ? item.source : 'manual',
                        startedAt:item.startedAt, expiresAt:item.status === 'running' ? item.expiresAt : null,
                        remainingMs:item.status === 'paused' ? item.remainingMs : 0,
                        status:item.status, cycles:Number.isSafeInteger(item.cycles) && item.cycles > 0 ? item.cycles : 0,
                        ...this.timerPresentation(item), warned:Boolean(item.warned), endedCue:Boolean(item.endedCue)
                    });
                } catch { /* Ignore corrupt persisted timer rows individually. */ }
            }
        }
        this.restoring = true; this.advance(this.now()); this.restoring = false;
    }

    id(prefix) {
        let id;
        do { id = `${prefix}-${this.nextId++}`; }
        while (this.definitions.some(item => item.id === id) || this.timers.some(item => item.id === id));
        return id;
    }

    timerPresentation(input) {
        const parsed = definition({ ...input, label:input.label || 'Timer', type:'manual', durationSeconds:input.durationSeconds || 1 }, 'presentation');
        return Object.fromEntries(['warningSeconds', 'lowSeconds', 'color', 'warningColor', 'lowColor', 'action', 'sound', 'speech', 'volume', 'warningAction', 'warningSound', 'warningSpeech', 'endAction', 'endSound', 'endSpeech'].map(key => [key, parsed[key]]));
    }

    cue(input, kind, at, values = {}) {
        if (this.restoring) return;
        const prefix = kind === 'warning' ? 'warning' : kind === 'end' ? 'end' : '';
        const action = input[prefix ? `${prefix}Action` : 'action'];
        if (!['sound', 'speak'].includes(action)) return;
        this.cues.push({ id:this.id('cue'), definitionId:input.definitionId || input.id || '', kind, action, sound:input[prefix ? `${prefix}Sound` : 'sound'] || 'Chime',
            text:fillTriggerTemplate(input[prefix ? `${prefix}Speech` : 'speech'] || '{label}', { ...values, label:input.label }),
            volume:input.volume ?? 80, at });
        if (this.cues.length > 100) this.cues.splice(0, this.cues.length - 100);
    }

    drainCues() { return this.cues.splice(0); }

    async preview(input, line = '') {
        const item = definition(input, input.id || 'preview');
        const result = await this.matcher.match({ pattern:item.type === 'spawn' ? item.npc : item.trigger || item.label, mode:item.type === 'spawn' ? 'contains' : item.match, ignorePunctuation:item.ignorePunctuation, line });
        const values = { line:result.line || String(line), match:result.match || '', name:item.label, ...(result.groups || {}) };
        return { ...result, label:fillTriggerTemplate(item.displayLabel || item.label, values) };
    }

    fire(item, at, match = {}, manual = false) {
        const previous = this.lastFired.get(item.id);
        if (!manual && finite(previous) && at - previous < item.cooldownSeconds * 1000) return false;
        if (item.overlap === 'ignore' && this.timers.some(timer => timer.definitionId === item.id && timer.status !== 'ended')) return false;
        const values = { name:item.label, line:match.line || '', match:match.match || '', ...(match.groups || {}) };
        const label = fillTriggerTemplate(item.displayLabel || item.label, values);
        if (item.timerEnabled !== false) {
            if (at + item.durationSeconds * 1000 <= this.now()) return false;
            this.start({ ...item, label,
                speech:fillTriggerTemplate(item.speech, { ...values, label }), warningSpeech:fillTriggerTemplate(item.warningSpeech, { ...values, label }), endSpeech:fillTriggerTemplate(item.endSpeech, { ...values, label }) }, at, item.type);
        } else {
            const expiresAt = at + item.notificationSeconds * 1000;
            if (expiresAt <= this.now()) return false;
            this.notifications.push({ id:this.id('notification'), definitionId:item.id, label, createdAt:at, expiresAt });
            this.notifications = this.notifications.slice(-4);
        }
        this.lastFired.set(item.id, at);
        this.cue({ ...item, label }, 'trigger', at, values);
        return true;
    }

    queueRegex(record) {
        if (this.closed) return Promise.resolve(false);
        if (this.regexQueue.length >= 256) {
            this.matchingStatus = 'Trigger matcher is busy; excess log lines were skipped.';
            return Promise.resolve(false);
        }
        const promise = new Promise(resolve => this.regexQueue.push({ ...record, id:++this.regexSequence, resolve }));
        if (!this.regexScheduled) { this.regexScheduled = true; queueMicrotask(() => { this.regexScheduled = false; void this.flushRegex(); }); }
        return promise;
    }

    async flushRegex() {
        if (this.regexBusy || this.closed || !this.regexQueue.length) return;
        this.regexBusy = true;
        const records = this.regexQueue.splice(0, 128);
        const definitions = this.definitions.filter(item => item.enabled && item.type === 'text' && item.match === 'regex').map(item => ({ ...item }));
        let result;
        try {
            result = await this.matcher.batch(definitions, records.map(record => ({ id:record.id, text:record.text })));
            if (result.error && result.definitionId) {
                const offender = this.definitions.find(item => item.id === result.definitionId);
                if (offender) { offender.enabled = false; offender.error = result.error; }
                this.matchingStatus = result.error;
                // One bounded recovery attempt lets healthy expressions still
                // see this batch. Two unsafe patterns cannot create a long queue.
                result = await this.matcher.batch(definitions.filter(item => item.id !== result.definitionId), records.map(record => ({ id:record.id, text:record.text })));
            }
            if (result.error) this.matchingStatus = result.error;
            if (result.error && result.definitionId) {
                const offender = this.definitions.find(item => item.id === result.definitionId);
                if (offender) { offender.enabled = false; offender.error = result.error; }
            }
            if (this.closed) { for (const record of records) record.resolve(false); return; }
            const matches = new Map((result.results || []).map(item => [`${item.lineId}|${item.definitionId}`, item.result]));
            for (const record of records) {
                let changed = record.changed;
                for (const captured of definitions) {
                    if (!record.rules.includes(`${captured.id}|${tokenHash(captured.trigger)}`)) continue;
                    const item = this.definitions.find(item => item.id === captured.id && item.enabled && item.trigger === captured.trigger && item.match === 'regex');
                    if (!item || (item.zone && fold(item.zone) !== fold(record.zone))) continue;
                    const match = matches.get(`${record.id}|${item.id}`);
                    if (match?.error) { item.enabled = false; item.error = match.error; this.matchingStatus = match.error; continue; }
                    if (match?.matched) { try { changed = this.fire(item, record.at, match) || changed; } catch { this.matchingStatus = 'A triggered timer could not start. Dismiss finished countdowns and retry.'; } }
                }
                record.resolve(changed);
            }
        } catch { this.matchingStatus = 'Trigger matching failed. Review the expression and retry.'; for (const record of records) record.resolve(record.changed); }
        finally { this.regexBusy = false; if (this.regexQueue.length && !this.closed) void this.flushRegex(); }
    }

    advance(at) {
        if (!finite(at)) throw new Error('Timer clock must be a finite timestamp.');
        this.notifications = this.notifications.filter(item => item.expiresAt > at);
        for (const timer of this.timers) {
            if (timer.status !== 'running') continue;
            if (at < timer.expiresAt) {
                if (!timer.warned && timer.warningSeconds && timer.expiresAt - at <= timer.warningSeconds * 1000) {
                    timer.warned = true; this.cue(timer, 'warning', at);
                }
                continue;
            }
            if (!timer.endedCue) { timer.endedCue = true; this.cue(timer, 'end', at); }
            if (timer.repeat) {
                const interval = timer.durationSeconds * 1000;
                const cycles = Math.floor((at - timer.expiresAt) / interval) + 1;
                timer.cycles += cycles;
                timer.expiresAt += cycles * interval;
                timer.startedAt = timer.expiresAt - interval;
                timer.warned = false; timer.endedCue = false;
            } else {
                timer.status = 'ended';
                timer.expiresAt = null;
                timer.remainingMs = 0;
            }
        }
    }

    start(input, at, source = 'manual') {
        const total = durationMs(input.durationSeconds);
        const label = normalize(input.label).slice(0, 240);
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
            startedAt:at, expiresAt:at + total, remainingMs:total, status:'running', cycles:0,
            ...this.timerPresentation(input), warned:false, endedCue:false
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
        const text = String(context.text || event?.text || '').replace(/^\[[^\]]+\]\s*/, '');
        let changed = false;
        for (const item of this.definitions) {
            if (!item.enabled || (item.zone && fold(item.zone) !== fold(this.zone))) continue;
            if (item.match === 'regex' && item.type === 'text') continue;
            const match = item.type === 'text' && text ? matchTrigger({ pattern:item.trigger, mode:item.match, ignorePunctuation:item.ignorePunctuation, line:text }) : null;
            const textMatch = match?.matched;
            const spawnMatch = item.type === 'spawn' && event?.type === 'kill' && fold(item.npc) === fold(event.victim);
            if (!textMatch && !spawnMatch) continue;
            // A backlog event whose countdown already elapsed cannot briefly
            // revive a repeating trigger when read after a pause/reconnect.
            if (this.timers.filter(timer => timer.status !== 'ended').length >= MAX_TIMERS && item.overlap === 'add') continue;
            try { changed = this.fire(item, at, match || { line:text, match:event?.victim || '' }) || changed; } catch { /* Capacity must never stop log consumption. */ }
        }
        if (text && this.definitions.some(item => item.enabled && item.type === 'text' && item.match === 'regex' && (!item.zone || fold(item.zone) === fold(this.zone)))) {
            return this.queueRegex({ text, at, zone:this.zone, changed,
                rules:this.definitions.filter(item => item.enabled && item.type === 'text' && item.match === 'regex').map(item => `${item.id}|${tokenHash(item.trigger)}`) });
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
            saved.error = '';
            if (index === -1) this.definitions.push(saved); else this.definitions[index] = saved;
        } else if (action === 'remove-definition') {
            this.definitions = this.definitions.filter(item => item.id !== args.id);
            this.timers = this.timers.filter(item => item.definitionId !== args.id);
            this.notifications = this.notifications.filter(item => item.definitionId !== args.id);
            this.cues = this.cues.filter(item => item.definitionId !== args.id); this.lastFired.delete(args.id);
        } else if (action === 'fire-definition') {
            const item = this.definitions.find(entry => entry.id === args.id);
            if (!item) throw new Error('Choose a saved trigger first.');
            if (item.zone && fold(item.zone) !== fold(this.zone)) throw new Error(`This timer is limited to ${item.zone}.`);
            if (args.line && item.type === 'text') return this.preview(item, args.line).then(match => {
                if (match.error) throw new Error(match.error);
                if (!match.matched) throw new Error('The test line does not match this trigger.');
                this.fire(item, at, match, true); return this.snapshot();
            });
            this.fire(item, at, { line:args.line || '', match:'' }, true);
        } else if (action === 'start') {
            const item = this.definitions.find(entry => entry.id === (args.definitionId || args.id));
            if ((args.definitionId || args.id) && !item) throw new Error('That saved timer no longer exists.');
            if (item?.zone && fold(item.zone) !== fold(this.zone)) throw new Error(`This timer is limited to ${item.zone}.`);
            if (item) this.fire(item, at, {}, true); else this.start(args, at);
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
                timer.warned = false; timer.endedCue = false;
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
            notifications:clone(this.notifications), matchingStatus:this.matchingStatus,
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
            swingEnabled:this.swingEnabled, swingDelayTenths:this.swingDelayTenths, lastFired:[...this.lastFired] });
    }

    close() { this.closed = true; this.matcher.close?.(); for (const record of this.regexQueue.splice(0)) record.resolve(false); }
}
