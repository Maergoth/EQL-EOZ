import { RecastRouteClient, routeEngineStatusText } from '../app/recast-route-client.js';

class FakeWorker {
    listeners = new Map();
    terminated = false;
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    postMessage(message) { this.lastMessage = message; }
    terminate() { this.terminated = true; }
    emit(type, data) { this.listeners.get(type)?.({ data }); }
}

const states = [];
const worker = new FakeWorker();
const client = new RecastRouteClient({ workerFactory:() => worker, onState:state => states.push(state), timeoutMs:100 });
const request = { geometry:{ positions:new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), indices:new Uint32Array([0, 1, 2]) } };
const pending = client.route(request, { rerouting:true });
worker.emit('message', { id:worker.lastMessage.id, result:{ ok:true, status:'ready', path:[{ x:0, y:0, z:0 }] } });
const result = await pending;
if (!result.ok || states[0]?.text !== 'Updating route…' || states.at(-1)?.text !== '') throw new Error('Worker client did not preserve calm reroute states.');
if (routeEngineStatusText('fallback') !== 'Using direct guidance' || routeEngineStatusText('no-path') !== 'No walkable route found') {
    throw new Error('Worker client fallback copy changed unexpectedly.');
}
const failed = client.route(request);
worker.emit('message', { id:worker.lastMessage.id, result:{ ok:false, status:'fallback', reason:'engine-error' } });
if ((await failed).reason !== 'engine-error' || !worker.terminated) throw new Error('Worker client did not restart after an engine fault.');
client.destroy();
console.log('Recast worker client state and recovery contract passed.');
