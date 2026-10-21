import { matchTrigger } from './trigger-match-core.js';

// A persistent isolated worker, one expression at a time. Killing a timed-out
// worker releases its regex stack and leaves log parsing, rendering and the
// native overlay responsive. A later request starts a clean worker.
export class TriggerMatcher {
    constructor({ createWorker, timeoutMs = 150, startupMs = 3000,
        setTimeout = (...args) => globalThis.setTimeout(...args), clearTimeout = (...args) => globalThis.clearTimeout(...args) } = {}) {
        this.createWorker = createWorker || (() => new Worker(new URL('./workers/trigger-match.worker.js', import.meta.url), { type:'module' }));
        this.timeoutMs = timeoutMs; this.startupMs = startupMs; this.setTimeout = setTimeout; this.clearTimeout = clearTimeout;
        this.queue = []; this.worker = null; this.ready = false; this.pending = null; this.sequence = 0; this.closed = false;
    }
    match(input) {
        if (input.mode !== 'regex') return Promise.resolve(matchTrigger(input));
        return this.enqueue({ input });
    }
    batch(definitions, lines) { return this.enqueue({ batch:{ definitions, lines } }); }
    enqueue(payload) {
        if (this.closed) return Promise.resolve({ matched:false, error:'Trigger matching has closed.' });
        if (this.queue.length >= 8) return Promise.resolve({ matched:false, error:'Trigger matching is busy. This line was skipped.' });
        return new Promise(resolve => { this.queue.push({ payload, resolve }); this.drain(); });
    }
    drain() {
        if (this.closed || this.pending || !this.queue.length) return;
        if (!this.worker) {
            try {
                this.worker = this.createWorker(); this.ready = false;
                const owner = this.worker;
                owner.onmessage = event => {
                    if (this.worker !== owner || this.closed) return;
                    if (event.data?.ready) { this.clearTimeout(this.startupTimer); this.ready = true; this.drain(); return; }
                    if (event.data?.id !== this.pending?.id) return;
                    if (event.data?.matchingId) { this.pending.matchingId = event.data.matchingId; return; }
                    this.clearTimeout(this.pending.timer); const item = this.pending; this.pending = null;
                    item.resolve(event.data.result); this.drain();
                };
                owner.onerror = () => { if (this.worker === owner) this.fail('Trigger matching failed. Retry or edit this expression.'); };
                this.startupTimer = this.setTimeout(() => { if (this.worker === owner) this.fail('Trigger matcher could not start. Retry this expression.'); }, this.startupMs);
            } catch { this.fail('Regular expressions require the desktop trigger worker.'); }
            return;
        }
        if (!this.ready) return;
        this.pending = { ...this.queue.shift(), id:++this.sequence };
        this.pending.timer = this.setTimeout(() => this.fail('Expression exceeded its time limit and was disabled. Edit it before enabling again.', true), this.timeoutMs);
        try { this.worker.postMessage({ id:this.pending.id, ...this.pending.payload }); }
        catch { this.fail('Trigger matching failed. Retry or edit this expression.'); }
    }
    fail(error, timedOut = false) {
        this.clearTimeout(this.startupTimer); this.worker?.terminate(); this.worker = null; this.ready = false;
        if (this.pending) { this.clearTimeout(this.pending.timer); this.pending.resolve({ matched:false, error, timedOut, definitionId:this.pending.matchingId }); this.pending = null; }
        else this.queue.shift()?.resolve({ matched:false, error, timedOut });
        this.drain();
    }
    close() {
        this.closed = true; this.clearTimeout(this.startupTimer); this.worker?.terminate(); this.worker = null;
        if (this.pending) { this.clearTimeout(this.pending.timer); this.pending.resolve({ matched:false, error:'Trigger matching has closed.' }); this.pending = null; }
        for (const item of this.queue.splice(0)) item.resolve({ matched:false, error:'Trigger matching has closed.' });
    }
}
