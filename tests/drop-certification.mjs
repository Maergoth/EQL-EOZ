import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { certifyDirectDrop } from '../app/drop-certification.js';
import { cropCollisionGeometryForRoute } from '../app/collision-geometry.js';
import { NAVIGATION_AGENT_RADIUS } from '../app/navigation-policy.js';
import { runRecastRoute } from '../app/recast-route-engine.js';
import { validateRouteGeometry } from '../app/route-validation.js';

// Two independent landings. Their collision surfaces supply no connectivity
// or drop permission; both the certificate and worker must prove their part.
const start = { x:0, y:20, z:0 };
const goal = { x:5, y:0, z:0 };
function geometryWith(quads = []) {
    const positions = [], indices = [];
    for (const quad of quads) {
        const base = positions.length / 3;
        quad.forEach(point => positions.push(...point));
        indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    return { positions:new Float32Array(positions), indices:new Uint32Array(indices), offMeshConnections:[] };
}
const floor = (minX, maxX, y, minZ = -3, maxZ = 3) => [
    [minX, y, minZ], [maxX, y, minZ], [maxX, y, maxZ], [minX, y, maxZ]
];
const landings = [floor(-3, 3, 20), floor(2, 8, 0)];
const geometry = geometryWith(landings);
const unchanged = JSON.stringify({ positions:[...geometry.positions], indices:[...geometry.indices], links:geometry.offMeshConnections });
const certificate = await certifyDirectDrop(geometry, start, goal);
assert.equal(certificate.ok, true, 'A geometrically clear exposed descent needs a certificate');
assert.equal(certificate.connection.bidirectional, false);
assert.equal(certificate.connection.kind, 'drop');
assert(certificate.connection.radius >= NAVIGATION_AGENT_RADIUS);
assert(Math.abs(certificate.connection.from.x - 3) < .02, 'Worker link must start at the real exposed edge');
assert.equal(JSON.stringify({ positions:[...geometry.positions], indices:[...geometry.indices], links:geometry.offMeshConnections }), unchanged);
const proof = { geometry:{ ...geometry, offMeshConnections:[certificate.connection] } };
assert(validateRouteGeometry(proof, [start, certificate.connection.from, goal]).valid);

const approachGeometry = geometryWith([floor(-5, 3, 20), floor(2, 8, 0)]);
const approach = { x:-2, y:20, z:0 };
const approached = await certifyDirectDrop(approachGeometry, approach, goal);
assert(approached.ok, 'A supported five-unit approach must not be mistaken for a drop through its platform');
assert(Math.abs(approached.connection.from.x - 3) < .02);
assert(approached.connection.from.x - approach.x > 4.9);
assert(validateRouteGeometry({ geometry:{ ...approachGeometry, offMeshConnections:[approached.connection] } }, [approach, approached.connection.from, goal]).valid);

const wall = [[4, -2, -5], [4, 30, -5], [4, 30, 5], [4, -2, 5]];
for (const [name, blocked] of [
    ['solid wall', geometryWith([...landings, wall])],
    ['overlapping upper floor', geometryWith([floor(-3, 8, 20), floor(2, 8, 0)])],
    ['thin intermediate floor', geometryWith([...landings, floor(3.99, 4.01, 10)])],
    ['low ceiling', geometryWith([...landings, floor(-3, 3, 24.5)])]
]) {
    assert.equal((await certifyDirectDrop(blocked, start, goal)).ok, false, `Certificate must reject ${name}`);
}
assert.equal((await certifyDirectDrop(geometry, goal, start)).ok, false, 'Directed descent never authorizes its reverse climb');
assert.equal((await certifyDirectDrop(geometry, { ...start, y:25 }, goal)).ok, false, 'Projection cannot silently move an unsupported source onto its platform');
assert.equal((await certifyDirectDrop(geometry, start, { ...goal, x:65 })).ok, false, 'Proof is local in the horizontal plane');
assert.equal((await certifyDirectDrop(geometry, { ...start, y:61 }, goal)).ok, false, 'Proof has a bounded descent height');
assert.equal((await certifyDirectDrop(geometry, start, goal, { shouldCancel:() => true })).reason, 'cancelled');
let cancelled = false;
assert.equal((await certifyDirectDrop(geometry, start, goal, {
    shouldCancel:() => cancelled,
    yieldControl:async () => { cancelled = true; }
})).reason, 'cancelled', 'A newer request may cancel before any collision proof runs');

const wrapper = await readFile(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
const stateSource = wrapper.slice(wrapper.indexOf('function finiteMetric('), wrapper.indexOf('const recastRouteClient ='));
const routeSource = wrapper.slice(wrapper.indexOf('function scheduleCandidateRoute('), wrapper.indexOf('function clearRareMobs('));
assert(stateSource.includes('function candidateStateFrom(') && routeSource.includes('certifyDirectDrop('));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitUntil(predicate, description) {
    const until = Date.now() + 10_000;
    while (!predicate()) {
        assert(Date.now() < until, `Timed out waiting for ${description}`);
        await delay(2);
    }
}
function harness({ source = geometry, from = start, to = goal, routeResult, certification } = {}) {
    const calls = [], rendered = [];
    let context;
    const state = () => vm.runInContext('candidateRouteState', context);
    context = vm.createContext({
        performance, setTimeout,
        app:{ navigationTarget:{ key:'synthetic-target', requestStart:from, ground:to }, navigationPath:[] },
        collisionGeometry:source, collisionGeometryPromise:null,
        loadedZoneIdentity:'synthetic:s3d', candidateRouteSerial:0,
        candidateRouteState:{ status:'idle' },
        plainPoint:point => point && ({ x:Number(point.x), y:Number(point.y), z:Number(point.z) }),
        cropCollisionGeometryForRoute,
        certifyDirectDrop:async (...args) => certification ? certification(...args) : certifyDirectDrop(...args),
        recastRouteClient:{ async route(request, options) {
            const index = calls.length;
            calls.push({ links:structuredClone(request.geometry.offMeshConnections), transfer:options.transferGeometry });
            // Match the real client: retained geometry is copied; ownership
            // transfer detaches the wrapper's arrays. A retry needs both.
            const copiedGeometry = options.transferGeometry
                ? structuredClone(request.geometry, { transfer:[request.geometry.positions.buffer, request.geometry.indices.buffer] })
                : { ...request.geometry, positions:new Float32Array(request.geometry.positions), indices:new Uint32Array(request.geometry.indices) };
            const copiedRequest = { ...request, geometry:copiedGeometry };
            return routeResult ? routeResult(copiedRequest, index, context) : runRecastRoute(copiedRequest);
        } },
        replacePathWithCandidate:result => { rendered.push(result.path); return true; }
    });
    vm.runInContext(`${stateSource}\n${routeSource}\nscheduleCandidateRoute('Synthetic destination');`, context);
    return { calls, rendered, context, state, async settle() {
        await waitUntil(() => !['idle', 'preparing', 'waiting-geometry', 'calculating'].includes(state().status), 'candidate result');
        return state();
    } };
}

const recovery = harness();
assert.equal((await recovery.settle()).status, 'ready');
assert.equal(recovery.calls.length, 2, 'Disconnected landings need one ordinary query and one certified retry');
assert.equal(recovery.calls[0].links.length, 0, 'The marker must not create an unproved first-query link');
assert.equal(recovery.calls[0].transfer, false, 'The first query must preserve buffers only when a safe retry exists');
assert.equal(recovery.calls[1].transfer, true);
assert.equal(recovery.calls[1].links.length, 1);
assert(Math.abs(recovery.calls[1].links[0].from.x - 3) < .02);
assert.equal(recovery.rendered.length, 1);
assert(recovery.rendered[0].some((point, index, points) => index && points[index - 1].y - point.y > 6), 'The recovered candidate must actually traverse a drop');
assert(validateRouteGeometry({ geometry:{ ...geometry, offMeshConnections:recovery.calls[1].links } }, recovery.rendered[0]).valid);

const supportedApproach = harness({ source:approachGeometry, from:approach });
assert.equal((await supportedApproach.settle()).status, 'ready');
assert.equal(supportedApproach.calls.length, 2);
assert(Math.abs(supportedApproach.calls[1].links[0].from.x - 3) < .02);

for (const [name, options] of [
    ['reverse', { from:goal, to:start }],
    ['blocked', { source:geometryWith([...landings, wall]) }]
]) {
    const rejected = harness(options);
    await rejected.settle();
    assert.equal(rejected.calls.length, 1, `${name} marker must not gain a retry connection`);
    assert.equal(rejected.calls[0].links.length, 0);
    assert.equal(rejected.rendered.length, 0);
}

// Successful detours are retained, even when a shorter certified drop exists.
const detour = harness({ routeResult:async () => ({ ok:true, status:'ready', path:[start, { x:-1, y:20, z:10 }, goal] }) });
await detour.settle();
assert.equal(detour.calls.length, 1);
assert.equal(detour.calls[0].links.length, 0);
assert.equal(detour.rendered.length, 1);

const unsafeOrdinary = harness({ routeResult:async (request, index) => index === 0
    ? { ok:false, status:'fallback', reason:'validation-failed', path:[] }
    : runRecastRoute(request) });
assert.equal((await unsafeOrdinary.settle()).status, 'ready', 'An independently rejected ordinary route can use one certified retry');
assert.equal(unsafeOrdinary.calls.length, 2);
for (const reason of ['engine-error', 'generation-failed', 'route-geometry-too-large', 'timeout']) {
    const failed = harness({ routeResult:async () => ({ ok:false, status:'fallback', reason }) });
    assert.equal((await failed.settle()).reason, reason);
    assert.equal(failed.calls.length, 1, `${reason} must not schedule another expensive query`);
}

let releaseProof;
const proofWait = new Promise(resolve => { releaseProof = resolve; });
const staleProof = harness({ certification:async (...args) => { await proofWait; return certifyDirectDrop(...args); } });
await delay(5);
vm.runInContext("candidateRouteSerial += 1; candidateRouteState = { status:'cancelled' };", staleProof.context);
releaseProof();
await delay(10);
assert.equal(staleProof.calls.length, 0, 'Cancelled proof must not initiate a worker query');
assert.equal(staleProof.rendered.length, 0);

let releaseRetry;
const retryWait = new Promise(resolve => { releaseRetry = resolve; });
const staleRetry = harness({ routeResult:async (request, index) => {
    const result = await runRecastRoute(request);
    if (index === 1) await retryWait;
    return result;
} });
await waitUntil(() => staleRetry.calls.length === 2, 'certified retry');
vm.runInContext("loadedZoneIdentity = 'new-zone:s3d'; candidateRouteState = { status:'cancelled' };", staleRetry.context);
releaseRetry();
await delay(20);
assert.equal(staleRetry.rendered.length, 0, 'A completed old-zone retry cannot render in the new scene');
assert.equal(staleRetry.state().status, 'cancelled');

console.log('Direct-drop certificates and actual wrapper recovery passed: exposed edge/approach, disconnected landings, wall/floor/headroom/reverse guards, preserved detours, transfer ownership, bounded retry and stale cancellation.');
