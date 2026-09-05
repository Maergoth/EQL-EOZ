const DEFAULT_TIMEOUT_MS = 12_000;

export function routeEngineStatusText(status, { rerouting = false } = {}) {
    if (status === 'calculating') return rerouting ? 'Updating route…' : 'Finding a route…';
    if (status === 'fallback') return 'Using direct guidance';
    if (status === 'no-path') return 'No walkable route found';
    return '';
}

/**
 * Latest-request-wins worker client. Candidate failures never remove the
 * caller's current route; consumers receive a fallback state and decide when
 * to replace existing guidance.
 */
export class RecastRouteClient {
    constructor({ onState = () => {}, timeoutMs = DEFAULT_TIMEOUT_MS, workerFactory } = {}) {
        this.onState = onState;
        this.timeoutMs = timeoutMs;
        this.workerFactory = workerFactory || (() => new Worker(new URL('./workers/recast-route.worker.js', import.meta.url), { type:'module' }));
        this.sequence = 0;
        this.pending = null;
        this.worker = null;
    }

    ensureWorker() {
        if (this.worker) return this.worker;
        const worker = this.workerFactory();
        worker.addEventListener('message', event => this.handleMessage(event.data));
        worker.addEventListener('error', () => this.failCurrent('worker-error'));
        this.worker = worker;
        return worker;
    }

    async route(request, { rerouting = false, transferGeometry = false } = {}) {
        const supersedingActiveRequest = Boolean(this.pending);
        this.cancel('superseded', { restartWorker:supersedingActiveRequest });
        const id = `route-${++this.sequence}`;
        const positions = transferGeometry && request.geometry.positions instanceof Float32Array
            ? request.geometry.positions
            : new Float32Array(request.geometry.positions);
        const indices = transferGeometry && request.geometry.indices instanceof Uint32Array
            ? request.geometry.indices
            : new Uint32Array(request.geometry.indices);
        const payload = {
            ...request,
            geometry:{ ...request.geometry, positions, indices }
        };
        this.onState({ status:'calculating', text:routeEngineStatusText('calculating', { rerouting }), id });
        return new Promise(resolve => {
            const timeout = setTimeout(() => this.failCurrent('timeout'), this.timeoutMs);
            this.pending = { id, resolve, timeout };
            try {
                this.ensureWorker().postMessage({ id, action:'route', request:payload }, [positions.buffer, indices.buffer]);
            } catch {
                this.failCurrent('worker-start-failed');
            }
        });
    }

    handleMessage(message) {
        if (!this.pending || message?.id !== this.pending.id) return;
        const { resolve, timeout, id } = this.pending;
        this.pending = null;
        clearTimeout(timeout);
        const result = message.result || { ok:false, status:'fallback', reason:'empty-worker-result' };
        this.onState({ ...result, id, text:routeEngineStatusText(result.status) });
        resolve(result);
        if (result.reason === 'engine-error') this.restartWorker();
    }

    failCurrent(reason) {
        if (!this.pending) return;
        const { resolve, timeout, id } = this.pending;
        this.pending = null;
        clearTimeout(timeout);
        const result = { ok:false, status:'fallback', reason };
        this.onState({ ...result, id, text:routeEngineStatusText('fallback') });
        resolve(result);
        this.restartWorker();
    }

    cancel(reason = 'cancelled', { restartWorker = false } = {}) {
        if (!this.pending) {
            if (restartWorker) this.restartWorker();
            return;
        }
        const { resolve, timeout } = this.pending;
        this.pending = null;
        clearTimeout(timeout);
        resolve({ ok:false, status:'cancelled', reason });
        if (restartWorker) this.restartWorker();
    }

    restartWorker() {
        this.worker?.terminate();
        this.worker = null;
    }

    destroy() {
        this.cancel('destroyed');
        this.restartWorker();
    }
}
