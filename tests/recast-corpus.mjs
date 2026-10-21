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
const excessiveClimb = validateRouteGeometry(rampRequest, [rampRequest.start, { x:1, y:7, z:0 }]);
if (excessiveClimb.valid || !excessiveClimb.violations.some(violation => violation.includes('upward climb'))) {
    throw new Error('Post-query validation did not report its explicit +6 upward-climb guard.');
}
const projectedRamp = projectRouteToGeometry(rampRequest, [{ x:0, y:.25, z:0 }, { x:20, y:10.25, z:0 }]);
if (!validateRouteGeometry(rampRequest, projectedRamp).valid || projectedRamp.length < 10) {
    throw new Error('Route projection did not create a collision-grounded ramp path.');
}
const drop = ROUTE_CORPUS.find(fixture => fixture.id === 'exposed-drop');
const dropRequest = fixtureRouteRequest(drop, drop.expectations[0]);
const reversedDrop = validateRouteGeometry(dropRequest, [dropRequest.goal, dropRequest.start]);
if (reversedDrop.valid) throw new Error('Post-query validation accepted a reversed drop as an ascent.');

const broadGeometry = {
    positions:new Float32Array([-1000, 0, -1000, 1000, 0, -1000, 0, 0, 1000]),
    indices:new Uint32Array([0, 2, 1]),
    offMeshConnections:[]
};
const broadSurface = validateRouteGeometry({ geometry:broadGeometry }, [{ x:-10, y:0, z:0 }, { x:10, y:0, z:0 }]);
if (!broadSurface.valid) throw new Error('Spatial validation lost a triangle spanning many index cells.');

// Real-zone floors can continue behind solid walls. Surface support alone
// cannot certify those segments, and an underside is not a walkable floor.
const wallGeometry = {
    positions:new Float32Array([
        -20, 0, -20, -20, 0, 20, 20, 0, -20, 20, 0, 20,
        0, 0, -5, 0, 20, -5, 0, 0, 5, 0, 20, 5
    ]),
    indices:new Uint32Array([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]),
    offMeshConnections:[]
};
const throughWall = [{ x:-5, y:0, z:0 }, { x:5, y:0, z:0 }];
for (const path of [throughWall, [...throughWall].reverse(), [throughWall[0], { x:0, y:0, z:0 }, throughWall[1]]]) {
    const result = validateRouteGeometry({ geometry:wallGeometry }, path);
    if (result.valid || !result.violations.some(violation => violation.includes('solid wall'))) {
        throw new Error('Post-query validation accepted a supported segment crossing a solid wall.');
    }
}
const aroundWall = [throughWall[0], { x:-5, y:0, z:10 }, { x:5, y:0, z:10 }, throughWall[1]];
if (!validateRouteGeometry({ geometry:wallGeometry }, aroundWall).valid) {
    throw new Error('Post-query wall validation rejected a supported detour around the wall.');
}
const ceiling = { ...broadGeometry, indices:new Uint32Array([0, 1, 2]) };
if (validateRouteGeometry({ geometry:ceiling }, throughWall).valid) {
    throw new Error('Post-query validation treated a downward-facing ceiling as a walkable floor.');
}
const broadWall = {
    positions:new Float32Array([...broadGeometry.positions, 0, 0, -1000, 0, 20, -1000, 0, 0, 1000, 0, 20, 1000]),
    indices:new Uint32Array([...broadGeometry.indices, 3, 4, 5, 5, 4, 6]),
    offMeshConnections:[]
};
if (validateRouteGeometry({ geometry:broadWall }, throughWall).valid) {
    throw new Error('Spatial validation lost a solid wall spanning many index cells.');
}
const stackedDropGeometry = {
    positions:new Float32Array([...wallGeometry.positions.slice(0, 12), -20, 20, -20, -20, 20, 20, 20, 20, -20, 20, 20, 20]),
    indices:new Uint32Array([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]),
    offMeshConnections:[{ from:{ x:-5, y:20, z:0 }, to:{ x:5, y:0, z:0 }, kind:'drop', radius:2, bidirectional:false }]
};
if (validateRouteGeometry({ geometry:stackedDropGeometry }, [stackedDropGeometry.offMeshConnections[0].from, stackedDropGeometry.offMeshConnections[0].to]).valid) {
    throw new Error('A declared drop connection allowed a route through an overlapping upper floor.');
}
const partialPlatform = {
    positions:new Float32Array([...wallGeometry.positions.slice(0, 12), -20, 20, -20, -20, 20, 20, 5, 20, -20, 5, 20, 20]),
    indices:new Uint32Array([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]),
    offMeshConnections:[
        { from:{ x:0, y:20, z:0 }, to:{ x:10, y:0, z:0 }, kind:'drop', radius:2, bidirectional:false },
        { from:{ x:5, y:20, z:0 }, to:{ x:10, y:0, z:0 }, kind:'drop', radius:2, bidirectional:false }
    ]
};
const insideTakeoff = partialPlatform.offMeshConnections[0];
const edgeTakeoff = partialPlatform.offMeshConnections[1];
if (validateRouteGeometry({ geometry:partialPlatform }, [insideTakeoff.from, insideTakeoff.to]).valid) {
    throw new Error('A declared drop connection cut through its upper platform before reaching the edge.');
}
if (!validateRouteGeometry({ geometry:partialPlatform }, [edgeTakeoff.from, edgeTakeoff.to]).valid) {
    throw new Error('Drop exposure validation rejected a supported edge takeoff into exposed space.');
}
const interveningPlatform = {
    ...partialPlatform,
    positions:new Float32Array([...partialPlatform.positions, 8.49, 6, -1, 8.49, 6, 1, 8.51, 6, -1, 8.51, 6, 1]),
    indices:new Uint32Array([...partialPlatform.indices, 8, 9, 10, 10, 9, 11])
};
if (validateRouteGeometry({ geometry:interveningPlatform }, [edgeTakeoff.from, edgeTakeoff.to]).valid) {
    throw new Error('A drop crossed a thin intermediate platform between validation samples.');
}
const lowCeiling = {
    positions:new Float32Array([...wallGeometry.positions.slice(0, 12), -20, 4, -20, -20, 4, 20, 20, 4, -20, 20, 4, 20]),
    indices:new Uint32Array([0, 1, 2, 2, 1, 3, 4, 6, 5, 6, 7, 5]),
    offMeshConnections:[]
};
if (validateRouteGeometry({ geometry:lowCeiling }, throughWall).valid) {
    throw new Error('Route validation accepted a floor beneath a ceiling lower than the shared agent height.');
}
const nearFloorCeiling = {
    ...lowCeiling,
    positions:new Float32Array([...wallGeometry.positions.slice(0, 12), -20, .5, -20, -20, .5, 20, 20, .5, -20, 20, .5, 20])
};
if (validateRouteGeometry({ geometry:nearFloorCeiling }, throughWall).valid) {
    throw new Error('Floor support tolerance waived a solid ceiling only half a unit above the floor.');
}
const lowCeilingResult = await runRecastRoute({ geometry:lowCeiling, start:throughWall[0], goal:throughWall[1] });
if (lowCeilingResult.ok) throw new Error('Recast generation used a smaller agent height than independent clearance validation.');
const slopedCeiling = {
    ...lowCeiling,
    positions:new Float32Array([...wallGeometry.positions.slice(0, 12), -5, 10, -20, -5, 10, 20, 5, 0, -20, 5, 0, 20])
};
if (validateRouteGeometry({ geometry:slopedCeiling }, throughWall).valid) {
    throw new Error('Route validation ignored a downward-facing sloped solid barrier.');
}
const excessiveRaster = await runRecastRoute({
    geometry:{ ...broadGeometry, generationBounds:[[-10000, 0, -10000], [10000, 0, 10000]] },
    start:throughWall[0], goal:throughWall[1]
});
if (excessiveRaster.ok || excessiveRaster.reason !== 'route-geometry-too-large') {
    throw new Error('Recast did not reject an oversized raster allocation before generation.');
}
const shortClearanceRoute = [{ x:0, y:0, z:0 }, { x:2, y:0, z:0 }];
for (const [height, downward] of [[3, true], [.5, false]]) {
    const thinOverhead = {
        positions:new Float32Array([...wallGeometry.positions.slice(0, 12), .9, height, -1, .9, height, 1, 1.1, height, -1, 1.1, height, 1]),
        indices:new Uint32Array([0, 1, 2, 2, 1, 3, ...(downward ? [4, 6, 5, 6, 7, 5] : [4, 5, 6, 6, 5, 7])]),
        offMeshConnections:[]
    };
    if (validateRouteGeometry({ geometry:thinOverhead }, shortClearanceRoute).valid) {
        throw new Error('Continuous body validation missed a thin overhead face between support samples.');
    }
}
const corridorWithWalls = width => ({
    positions:new Float32Array([...wallGeometry.positions.slice(0, 12),
        -20, 0, -width / 2, -20, 20, -width / 2, 20, 0, -width / 2, 20, 20, -width / 2,
        -20, 0, width / 2, -20, 20, width / 2, 20, 0, width / 2, 20, 20, width / 2
    ]),
    indices:new Uint32Array([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7, 8, 9, 10, 10, 9, 11]),
    offMeshConnections:[]
});
const narrowCorridor = corridorWithWalls(2);
if (validateRouteGeometry({ geometry:narrowCorridor }, throughWall).valid) {
    throw new Error('A centerline-only path passed through a corridor narrower than the actual player body.');
}
const narrowResult = await runRecastRoute({ geometry:narrowCorridor, start:throughWall[0], goal:throughWall[1] });
if (narrowResult.ok) throw new Error('Recast accepted a corridor narrower than the shared player radius.');
const wideCorridor = corridorWithWalls(8);
if (!validateRouteGeometry({ geometry:wideCorridor }, throughWall).valid) {
    throw new Error('Conservative lateral clearance rejected an unobstructed actor-sized corridor.');
}

const edgeLanding = {
    positions:new Float32Array([-20, 0, -10, -20, 0, 10, 20, 0, -10, 20, 0, 10]),
    indices:new Uint32Array([0, 1, 2, 2, 1, 3]),
    offMeshConnections:[]
};
const edgeStart = { x:-19.5, y:0, z:0 };
const edgeGoal = { x:19.5, y:0, z:0 };
const edgeResult = await runRecastRoute({ geometry:edgeLanding, start:edgeStart, goal:edgeGoal });
if (!edgeResult.ok || JSON.stringify(edgeResult.path[0]) !== JSON.stringify(edgeStart) ||
    JSON.stringify(edgeResult.path.at(-1)) !== JSON.stringify(edgeGoal) ||
    !validateRouteGeometry({ geometry:edgeLanding }, edgeResult.path).valid) {
    throw new Error('A complete navmesh corridor lost valid geometry-grounded connectors to the exact trusted endpoints.');
}
for (const request of [
    { start:{ x:0, y:3, z:0 }, goal:edgeGoal },
    { start:{ x:0, y:0, z:0 }, goal:{ x:20.5, y:0, z:0 } }
]) {
    const result = await runRecastRoute({ geometry:edgeLanding, ...request });
    if (result.ok || result.path.length) throw new Error('Navmesh snapping concealed an unsupported trusted endpoint.');
}
const realStep = {
    positions:new Float32Array([
        -20, 0, -10, -20, 0, 10, 0, 0, -10, 0, 0, 10,
        0, 1, -10, 0, 1, 10, 20, 1, -10, 20, 1, 10
    ]),
    indices:new Uint32Array([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7, 2, 4, 3, 3, 4, 5]),
    offMeshConnections:[]
};
for (const [start, goal] of [
    [{ x:-10, y:0, z:0 }, { x:10, y:1, z:0 }],
    [{ x:10, y:1, z:0 }, { x:-10, y:0, z:0 }]
]) {
    const result = await runRecastRoute({ geometry:realStep, start, goal });
    const hasRiser = result.path.some((point, index) => index > 0 &&
        Math.abs(Math.abs(point.y - result.path[index - 1].y) - 1) < .001 &&
        Math.hypot(point.x - result.path[index - 1].x, point.z - result.path[index - 1].z) <= .02);
    if (!result.ok || !hasRiser || !validateRouteGeometry({ geometry:realStep }, result.path).valid) {
        throw new Error('Recast projection lost the supported incoming/outgoing heights of a legal one-unit riser.');
    }
}

const timings = results.map(result => result.result.totalMs).filter(Number.isFinite).sort((a, b) => a - b);
const p95 = timings[Math.max(0, Math.ceil(timings.length * .95) - 1)];
console.log(`Recast ${RECAST_ENGINE_VERSION} corpus passed: ${results.length}/${results.length}; isolated queries p95 ${p95.toFixed(1)} ms.`);
