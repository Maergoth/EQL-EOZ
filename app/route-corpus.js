import { MAX_NAVIGATION_CLIMB_Z, canTraverseElevation } from './navigation-policy.js';

function nodeMap(fixture) {
    return new Map((fixture.nodes || []).map(node => [node.id, node]));
}

function edgeKey(from, to) {
    return `${from}->${to}`;
}

function traversableEdge(edge, from, to) {
    if (edge.open === false || edge.collisionValid === false) return false;
    const delta = Number(to.y) - Number(from.y);
    if (!canTraverseElevation(from.y, to.y)) return false;
    if (delta < -MAX_NAVIGATION_CLIMB_Z && edge.exposedDrop !== true) return false;
    return true;
}

function fixtureEdges(fixture) {
    const nodes = nodeMap(fixture);
    const edges = new Map();
    for (const edge of fixture.edges || []) {
        const from = nodes.get(edge.from);
        const to = nodes.get(edge.to);
        if (!from || !to) continue;
        edges.set(edgeKey(edge.from, edge.to), { ...edge, from:edge.from, to:edge.to });
        if (edge.bidirectional !== false) {
            edges.set(edgeKey(edge.to, edge.from), { ...edge, from:edge.to, to:edge.from });
        }
    }
    return { nodes, edges };
}

function segmentDistance(from, to) {
    return Math.hypot(Number(to.x) - Number(from.x), Number(to.y) - Number(from.y), Number(to.z) - Number(from.z));
}

function addQuad(positions, indices, corners) {
    const base = positions.length / 3;
    for (const corner of corners) positions.push(Number(corner.x), Number(corner.y), Number(corner.z));
    // Winding produces an upward-facing normal in the viewer's right-handed,
    // Y-up coordinate system expected by Recast's OpenGL-style input.
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

/**
 * Convert a corpus topology into redistributable triangle geometry. Every node
 * gets a small landing. Valid non-drop connections become floor/ramp strips;
 * closed connections stay physically separate and drops become directed links.
 */
export function buildFixtureGeometry(fixture, options = {}) {
    const landingSize = Number(options.landingSize) || 2;
    const corridorWidth = Number(options.corridorWidth) || 2;
    const landingHalf = landingSize / 2;
    const corridorHalf = corridorWidth / 2;
    const nodes = nodeMap(fixture);
    const positions = [];
    const indices = [];
    const offMeshConnections = [];

    for (const node of nodes.values()) {
        addQuad(positions, indices, [
            { x:node.x - landingHalf, y:node.y, z:node.z - landingHalf },
            { x:node.x + landingHalf, y:node.y, z:node.z - landingHalf },
            { x:node.x + landingHalf, y:node.y, z:node.z + landingHalf },
            { x:node.x - landingHalf, y:node.y, z:node.z + landingHalf }
        ]);
    }

    for (const edge of fixture.edges || []) {
        const from = nodes.get(edge.from);
        const to = nodes.get(edge.to);
        if (!from || !to || edge.open === false || edge.collisionValid === false) continue;
        if (edge.exposedDrop === true) {
            offMeshConnections.push({
                from:{ x:Number(from.x), y:Number(from.y), z:Number(from.z) },
                to:{ x:Number(to.x), y:Number(to.y), z:Number(to.z) },
                radius:Number(edge.radius) || 1,
                bidirectional:false,
                kind:'drop'
            });
            continue;
        }
        const dx = Number(to.x) - Number(from.x);
        const dz = Number(to.z) - Number(from.z);
        const planarLength = Math.hypot(dx, dz);
        if (planarLength < .0001) continue;
        const px = -dz / planarLength * corridorHalf;
        const pz = dx / planarLength * corridorHalf;
        addQuad(positions, indices, [
            { x:Number(from.x) + px, y:from.y, z:Number(from.z) + pz },
            { x:Number(from.x) - px, y:from.y, z:Number(from.z) - pz },
            { x:Number(to.x) - px, y:to.y, z:Number(to.z) - pz },
            { x:Number(to.x) + px, y:to.y, z:Number(to.z) + pz }
        ]);
    }

    return {
        coordinateSystem:'viewer-right-handed-y-up',
        units:'eq-units',
        positions:new Float32Array(positions),
        indices:new Uint32Array(indices),
        offMeshConnections,
        agent:{ maxClimb:MAX_NAVIGATION_CLIMB_Z }
    };
}

export function fixtureRouteRequest(fixture, expectation) {
    const nodes = nodeMap(fixture);
    const start = nodes.get(expectation?.from);
    const goal = nodes.get(expectation?.to);
    if (!start || !goal) throw new Error(`Unknown route expectation in ${fixture?.id || 'fixture'}.`);
    return {
        fixtureId:String(fixture.id),
        category:String(fixture.category || ''),
        geometry:buildFixtureGeometry(fixture),
        start:{ x:Number(start.x), y:Number(start.y), z:Number(start.z) },
        goal:{ x:Number(goal.x), y:Number(goal.y), z:Number(goal.z) }
    };
}

/** Deterministic reference router for redistributable synthetic fixtures. */
export function findFixtureRoute(fixture, startId, goalId) {
    const { nodes, edges } = fixtureEdges(fixture);
    if (!nodes.has(startId) || !nodes.has(goalId)) return null;
    const distances = new Map([[startId, 0]]);
    const previous = new Map();
    const pending = new Set(nodes.keys());

    while (pending.size) {
        let current = null;
        let best = Infinity;
        for (const id of pending) {
            const distance = distances.get(id) ?? Infinity;
            if (distance < best) {
                current = id;
                best = distance;
            }
        }
        if (current === null || !Number.isFinite(best)) break;
        pending.delete(current);
        if (current === goalId) break;
        for (const edge of edges.values()) {
            if (edge.from !== current || !pending.has(edge.to)) continue;
            const from = nodes.get(edge.from);
            const to = nodes.get(edge.to);
            if (!traversableEdge(edge, from, to)) continue;
            const candidate = best + segmentDistance(from, to);
            if (candidate < (distances.get(edge.to) ?? Infinity)) {
                distances.set(edge.to, candidate);
                previous.set(edge.to, current);
            }
        }
    }

    if (!distances.has(goalId)) return null;
    const route = [];
    for (let id = goalId; id; id = previous.get(id)) {
        route.push(id);
        if (id === startId) break;
    }
    route.reverse();
    return route[0] === startId ? route : null;
}

export function validateFixtureRoute(fixture, route, startId, goalId) {
    if (!Array.isArray(route) || route[0] !== startId || route.at(-1) !== goalId) {
        return { valid:false, violations:['route endpoints do not match the expectation'] };
    }
    const { nodes, edges } = fixtureEdges(fixture);
    const violations = [];
    for (let index = 1; index < route.length; index += 1) {
        const fromId = route[index - 1];
        const toId = route[index];
        const edge = edges.get(edgeKey(fromId, toId));
        const from = nodes.get(fromId);
        const to = nodes.get(toId);
        if (!from || !to) violations.push(`${fromId} -> ${toId}: unknown node`);
        else if (!edge) violations.push(`${fromId} -> ${toId}: no declared connection`);
        else if (!traversableEdge(edge, from, to)) violations.push(`${fromId} -> ${toId}: collision or directed-elevation policy violation`);
    }
    return { valid:violations.length === 0, violations };
}

export function runRouteCorpus(corpus = ROUTE_CORPUS, routeFinder = findFixtureRoute) {
    const results = [];
    for (const fixture of corpus) {
        for (const expectation of fixture.expectations || []) {
            const route = routeFinder(fixture, expectation.from, expectation.to);
            const hasPath = Array.isArray(route);
            const validation = hasPath
                ? validateFixtureRoute(fixture, route, expectation.from, expectation.to)
                : { valid:true, violations:[] };
            results.push({
                fixture:fixture.id,
                category:fixture.category,
                from:expectation.from,
                to:expectation.to,
                expectedPath:Boolean(expectation.path),
                hasPath,
                route,
                violations:validation.violations,
                passed:hasPath === Boolean(expectation.path) && validation.valid
            });
        }
    }
    const passed = results.filter(result => result.passed).length;
    return {
        total:results.length,
        passed,
        passRate:results.length ? passed / results.length : 0,
        segmentPolicyViolations:results.reduce((sum, result) => sum + result.violations.length, 0),
        failures:results.filter(result => !result.passed),
        results
    };
}

export const ROUTE_CORPUS = Object.freeze([
    {
        id:'outdoor-open', category:'outdoor',
        nodes:[{ id:'west', x:0, y:0, z:0 }, { id:'center', x:50, y:0, z:0 }, { id:'east', x:100, y:0, z:0 }],
        edges:[{ from:'west', to:'center' }, { from:'center', to:'east' }],
        expectations:[{ from:'west', to:'east', path:true }]
    },
    {
        id:'indoor-corridor', category:'indoor',
        nodes:[{ id:'entry', x:0, y:0, z:0 }, { id:'corner', x:0, y:0, z:20 }, { id:'hall', x:20, y:0, z:20 }, { id:'room', x:20, y:0, z:40 }],
        edges:[{ from:'entry', to:'corner' }, { from:'corner', to:'hall' }, { from:'hall', to:'room' }],
        expectations:[{ from:'entry', to:'room', path:true }]
    },
    {
        id:'stacked-floor-stairs', category:'stacked-floor',
        nodes:[{ id:'low', x:0, y:0, z:0 }, { id:'low-hall', x:20, y:0, z:0 }, { id:'stair-a', x:25, y:5, z:0 }, { id:'stair-b', x:30, y:10, z:0 }, { id:'high-hall', x:20, y:10, z:0 }, { id:'high', x:0, y:10, z:0 }],
        edges:[{ from:'low', to:'low-hall' }, { from:'low-hall', to:'stair-a' }, { from:'stair-a', to:'stair-b' }, { from:'stair-b', to:'high-hall' }, { from:'high-hall', to:'high' }],
        expectations:[{ from:'low', to:'high', path:true }]
    },
    {
        id:'legal-ramp', category:'ramp',
        nodes:[{ id:'bottom', x:0, y:0, z:0 }, { id:'middle', x:10, y:5, z:0 }, { id:'top', x:20, y:10, z:0 }],
        edges:[{ from:'bottom', to:'middle' }, { from:'middle', to:'top' }],
        expectations:[{ from:'bottom', to:'top', path:true }]
    },
    {
        id:'closed-door', category:'door',
        nodes:[{ id:'outside', x:0, y:0, z:0 }, { id:'inside', x:5, y:0, z:0 }],
        edges:[{ from:'outside', to:'inside', collisionValid:false }],
        expectations:[{ from:'outside', to:'inside', path:false }]
    },
    {
        id:'exposed-drop', category:'drop',
        nodes:[{ id:'ledge', x:0, y:20, z:0 }, { id:'floor', x:5, y:0, z:0 }],
        edges:[{ from:'ledge', to:'floor', exposedDrop:true }],
        expectations:[{ from:'ledge', to:'floor', path:true }, { from:'floor', to:'ledge', path:false }]
    },
    {
        id:'illegal-ascent', category:'elevation',
        nodes:[{ id:'lower', x:0, y:0, z:0 }, { id:'upper', x:2, y:7, z:0 }],
        edges:[{ from:'lower', to:'upper' }],
        expectations:[{ from:'lower', to:'upper', path:false }]
    }
]);
