import { RecastRouteClient, routeEngineStatusText } from '../app/recast-route-client.js';

class FakeWorker {
    listeners = new Map();
    terminated = false;
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    postMessage(message, transfer = []) {
        this.lastMessage = message;
        this.lastTransfer = transfer;
    }
    terminate() { this.terminated = true; }
    emit(type, data) { this.listeners.get(type)?.({ data }); }
}

const states = [];
const workers = [];
const workerFactory = () => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
};
const client = new RecastRouteClient({ workerFactory, onState:state => states.push(state), timeoutMs:100 });
const geometry = {
    positions:new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    indices:new Uint32Array([0, 1, 2])
};

const firstPending = client.route({ geometry }, { rerouting:true, transferGeometry:true });
const firstWorker = workers[0];
if (firstWorker.lastMessage.request.geometry.positions !== geometry.positions ||
    firstWorker.lastMessage.request.geometry.indices !== geometry.indices ||
    firstWorker.lastTransfer[0] !== geometry.positions.buffer ||
    firstWorker.lastTransfer[1] !== geometry.indices.buffer) {
    throw new Error('Worker client did not transfer the ephemeral route crop without cloning.');
}
firstWorker.emit('message', {
    id:firstWorker.lastMessage.id,
    result:{ ok:true, status:'ready', path:[{ x:0, y:0, z:0 }] }
});
const firstResult = await firstPending;
if (!firstResult.ok || states[0]?.text !== 'Updating route…' || states.at(-1)?.text !== '') {
    throw new Error('Worker client did not preserve calm reroute states.');
}
if (routeEngineStatusText('fallback') !== 'Using direct guidance' || routeEngineStatusText('no-path') !== 'No walkable route found') {
    throw new Error('Worker client fallback copy changed unexpectedly.');
}

function reusableRequest() {
    return {
        geometry:{
            positions:new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
            indices:new Uint32Array([0, 1, 2])
        }
    };
}

const reusable = client.route(reusableRequest());
if (workers.length !== 1) throw new Error('Initialized idle worker was not reused.');
firstWorker.emit('message', {
    id:firstWorker.lastMessage.id,
    result:{ ok:true, status:'ready', path:[{ x:0, y:0, z:0 }] }
});
await reusable;

const stale = client.route(reusableRequest());
const replacement = client.route(reusableRequest());
if ((await stale).reason !== 'superseded' || !firstWorker.terminated || workers.length !== 2) {
    throw new Error('Latest-request-wins did not terminate the worker running stale geometry.');
}
const replacementWorker = workers[1];
replacementWorker.emit('message', {
    id:replacementWorker.lastMessage.id,
    result:{ ok:true, status:'ready', path:[{ x:0, y:0, z:0 }] }
});
if (!(await replacement).ok) throw new Error('Replacement worker did not complete the newest route.');

const failed = client.route(reusableRequest());
replacementWorker.emit('message', {
    id:replacementWorker.lastMessage.id,
    result:{ ok:false, status:'fallback', reason:'engine-error' }
});
if ((await failed).reason !== 'engine-error' || !replacementWorker.terminated) {
    throw new Error('Worker client did not restart after an engine fault.');
}
client.destroy();
console.log('Recast worker transfer, reuse, latest-request, state, and recovery contracts passed.');
