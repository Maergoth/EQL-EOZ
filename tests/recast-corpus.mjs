import { ROUTE_CORPUS, fixtureRouteRequest } from '../app/route-corpus.js';
import { RECAST_ENGINE_VERSION, runRecastRoute } from '../app/recast-route-engine.js';
import { projectRouteToGeometry, validateRouteGeometry } from '../app/route-validation.js';

const results = [];
for (const fixture of ROUTE_CORPUS) {
    for (const expectation of fixture.expectations) {
        const result = await runRecastRoute(fixtureRouteRequest(fixture, expectation));
        const passed = result.ok === Boolean(expectation.path)
            && (result.ok ? result.status === 'ready' && result.path.length >= 2 : result.path?.length === 0);
        results.push({ fixture:fixture.id, from:expectation.from, to:expectation.to, expectedPath:expectation.path, result, passed });
    }
}

const failures = results.filter(result => !result.passed);
if (failures.length) {
    console.error(JSON.stringify(failures, null, 2));
    throw new Error(`Recast route corpus failed ${failures.length}/${results.length} expectations.`);
}

const ramp = ROUTE_CORPUS.find(fixture => fixture.id === 'legal-ramp');
const rampRequest = fixtureRouteRequest(ramp, ramp.expectations[0]);
const invalid = validateRouteGeometry(rampRequest, [rampRequest.start, { x:10, y:5, z:8 }, rampRequest.goal]);
if (invalid.valid || !invalid.violations.some(violation => violation.includes('walkable surface'))) {
    throw new Error('Post-query validation accepted a route that left the collision surface.');
}
const projectedRamp = projectRouteToGeometry(rampRequest, [{ x:0, y:.25, z:0 }, { x:20, y:10.25, z:0 }]);
if (!validateRouteGeometry(rampRequest, projectedRamp).valid || projectedRamp.length < 10) {
    throw new Error('Route projection did not create a collision-grounded ramp path.');
}
const drop = ROUTE_CORPUS.find(fixture => fixture.id === 'exposed-drop');
const dropRequest = fixtureRouteRequest(drop, drop.expectations[0]);
const reversedDrop = validateRouteGeometry(dropRequest, [dropRequest.goal, dropRequest.start]);
if (reversedDrop.valid) throw new Error('Post-query validation accepted a reversed drop as an ascent.');

const timings = results.map(result => result.result.totalMs).filter(Number.isFinite).sort((a, b) => a - b);
const p95 = timings[Math.max(0, Math.ceil(timings.length * .95) - 1)];
console.log(`Recast ${RECAST_ENGINE_VERSION} corpus passed: ${results.length}/${results.length}; isolated queries p95 ${p95.toFixed(1)} ms.`);
