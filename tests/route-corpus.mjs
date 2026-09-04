import { ROUTE_CORPUS, buildFixtureGeometry, fixtureRouteRequest, runRouteCorpus } from '../app/route-corpus.js';

const report = runRouteCorpus(ROUTE_CORPUS);
if (report.passRate < .95 || report.segmentPolicyViolations > 0) {
    console.error(JSON.stringify(report.failures, null, 2));
    throw new Error(`Route corpus failed: ${report.passed}/${report.total}, ${report.segmentPolicyViolations} segment-policy violations.`);
}

const categories = new Set(report.results.map(result => result.category));
for (const category of ['outdoor', 'indoor', 'stacked-floor', 'ramp', 'door', 'drop', 'elevation']) {
    if (!categories.has(category)) throw new Error(`Route corpus is missing the ${category} category.`);
}

for (const fixture of ROUTE_CORPUS) {
    const geometry = buildFixtureGeometry(fixture);
    if (!(geometry.positions instanceof Float32Array) || geometry.positions.length < 12) {
        throw new Error(`${fixture.id} does not expose triangle positions for its walkable surfaces.`);
    }
    if (!(geometry.indices instanceof Uint32Array) || geometry.indices.length % 3 !== 0) {
        throw new Error(`${fixture.id} does not expose valid triangle indices.`);
    }
    if (Math.max(...geometry.indices) >= geometry.positions.length / 3) {
        throw new Error(`${fixture.id} contains an out-of-range triangle index.`);
    }
    for (let offset = 0; offset < geometry.indices.length; offset += 3) {
        const [a, b, c] = geometry.indices.slice(offset, offset + 3);
        const ax = geometry.positions[b * 3] - geometry.positions[a * 3];
        const az = geometry.positions[b * 3 + 2] - geometry.positions[a * 3 + 2];
        const bx = geometry.positions[c * 3] - geometry.positions[a * 3];
        const bz = geometry.positions[c * 3 + 2] - geometry.positions[a * 3 + 2];
        if (az * bx - ax * bz <= 0) throw new Error(`${fixture.id} contains a triangle without upward winding.`);
    }
    for (const expectation of fixture.expectations) {
        const request = fixtureRouteRequest(fixture, expectation);
        if (request.fixtureId !== fixture.id || request.start.x !== fixture.nodes.find(node => node.id === expectation.from).x) {
            throw new Error(`${fixture.id} route-engine request lost its start anchor.`);
        }
    }
}

const dropGeometry = buildFixtureGeometry(ROUTE_CORPUS.find(fixture => fixture.id === 'exposed-drop'));
if (dropGeometry.offMeshConnections.length !== 1 || dropGeometry.offMeshConnections[0].bidirectional) {
    throw new Error('Exposed drops must be represented by one directed off-mesh connection.');
}
const closedDoorGeometry = buildFixtureGeometry(ROUTE_CORPUS.find(fixture => fixture.id === 'closed-door'));
if (closedDoorGeometry.indices.length !== 12) {
    throw new Error('A closed door must leave two disconnected landing quads without bridge geometry.');
}

console.log(`Route corpus passed: ${report.passed}/${report.total} expectations (${Math.round(report.passRate * 100)}%), ${report.segmentPolicyViolations} segment-policy violations; all fixtures expose shared triangle geometry.`);
