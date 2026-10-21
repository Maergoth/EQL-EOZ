import { init, NavMeshQuery, Detour, statusDetail } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';
import { projectRouteToGeometry, validateRouteGeometry } from './route-validation.js';
import { MAX_NAVIGATION_CLIMB_Z, NAVIGATION_AGENT_HEIGHT, NAVIGATION_AGENT_RADIUS } from './navigation-policy.js';

export const RECAST_ENGINE_VERSION = '0.43.1';

const GENERATOR_CONFIG = Object.freeze({
    cs:.25,
    ch:.25,
    walkableSlopeAngle:60,
    walkableHeight:Math.ceil(NAVIGATION_AGENT_HEIGHT / .25),
    walkableClimb:Math.floor(MAX_NAVIGATION_CLIMB_Z / .25),
    walkableRadius:Math.ceil(NAVIGATION_AGENT_RADIUS / .25),
    maxEdgeLen:48,
    maxSimplificationError:.5,
    minRegionArea:0,
    mergeRegionArea:0,
    maxVertsPerPoly:6,
    detailSampleDist:6,
    detailSampleMaxError:1
});

const QUERY_HALF_EXTENTS = Object.freeze({ x:3, y:8, z:3 });
const GOAL_TOLERANCE = 1;
const MAX_RASTER_CELLS = 4_000_000;
let initialization;

function now() {
    return globalThis.performance?.now?.() ?? Date.now();
}

function finitePoint(point) {
    return point && ['x', 'y', 'z'].every(axis => Number.isFinite(Number(point[axis])));
}

function validateRequest(request) {
    const geometry = request?.geometry;
    if (!finitePoint(request?.start) || !finitePoint(request?.goal)) throw new Error('Route request needs finite start and goal coordinates.');
    if (!geometry?.positions || geometry.positions.length < 9 || geometry.positions.length % 3 !== 0) throw new Error('Route request has invalid positions.');
    if (!geometry?.indices || geometry.indices.length < 3 || geometry.indices.length % 3 !== 0) throw new Error('Route request has invalid indices.');
}

function offMeshConnectionsFor(request) {
    return (request.geometry.offMeshConnections || []).map((connection, index) => ({
        startPosition:connection.from,
        endPosition:connection.to,
        radius:Number(connection.radius) || 1,
        bidirectional:connection.bidirectional === true,
        area:0,
        flags:1,
        userId:index + 1
    }));
}

function publicPoint(point) {
    return { x:Number(point.x), y:Number(point.y), z:Number(point.z) };
}

function reachedGoal(path, goal) {
    const last = path.at(-1);
    return finitePoint(last) && Math.hypot(last.x - goal.x, last.y - goal.y, last.z - goal.z) <= GOAL_TOLERANCE;
}

function completeNavMeshPath(query, request) {
    let corridor;
    let straight;
    try {
        const start = query.findClosestPoint(request.start, { halfExtents:QUERY_HALF_EXTENTS });
        const goal = query.findClosestPoint(request.goal, { halfExtents:QUERY_HALF_EXTENTS });
        if (!start.success || !goal.success || !start.polyRef || !goal.polyRef) return [];
        corridor = query.findPath(start.polyRef, goal.polyRef, start.point, goal.point, { maxPathPolys:512 });
        if (!corridor.success || !corridor.polys.size ||
            statusDetail(corridor.status, Detour.DT_PARTIAL_RESULT) ||
            statusDetail(corridor.status, Detour.DT_BUFFER_TOO_SMALL) ||
            corridor.polys.get(corridor.polys.size - 1) !== goal.polyRef) return [];
        // The high-level computePath helper uses unsnapped input positions for
        // its funnel. Near eroded edges that can clamp to the wrong height even
        // when the complete polygon corridor reaches the requested goal floor.
        straight = query.findStraightPath(start.point, goal.point, corridor.polys, { maxStraightPathPoints:512 });
        if (!straight.success || statusDetail(straight.status, Detour.DT_BUFFER_TOO_SMALL)) return [];
        const path = [];
        for (let index = 0; index < straight.straightPathCount; index += 1) {
            path.push({
                x:straight.straightPath.get(index * 3),
                y:straight.straightPath.get(index * 3 + 1),
                z:straight.straightPath.get(index * 3 + 2)
            });
        }
        return path.every(finitePoint) && reachedGoal(path, goal.point) ? path : [];
    } finally {
        corridor?.polys.destroy();
        straight?.straightPath.destroy();
        straight?.straightPathFlags.destroy();
        straight?.straightPathRefs.destroy();
    }
}

function anchoredProjectedRoute(request, rawPath) {
    const path = projectRouteToGeometry(request, [request.start, ...rawPath, request.goal]);
    if (path.length < 2) return [];
    // Navmesh snapping never authorizes a teleport. The connectors from the
    // exact trusted endpoints pass the same floor/body/elevation validation.
    path[0] = publicPoint(request.start);
    path[path.length - 1] = publicPoint(request.goal);
    return path;
}

async function initialize() {
    initialization ||= init();
    await initialization;
}

/** Run one isolated candidate-engine query. Partial Detour paths are rejected. */
export async function runRecastRoute(request) {
    const startedAt = now();
    let navMesh;
    let query;
    try {
        validateRequest(request);
        await initialize();
        let bounds = request.geometry.generationBounds;
        if (!bounds) {
            const minimum = [Infinity, Infinity, Infinity];
            const maximum = [-Infinity, -Infinity, -Infinity];
            for (let offset = 0; offset < request.geometry.positions.length; offset += 3) {
                for (let axis = 0; axis < 3; axis += 1) {
                    minimum[axis] = Math.min(minimum[axis], request.geometry.positions[offset + axis]);
                    maximum[axis] = Math.max(maximum[axis], request.geometry.positions[offset + axis]);
                }
            }
            bounds = [minimum, maximum];
        }
        const width = Math.ceil((bounds[1][0] - bounds[0][0]) / GENERATOR_CONFIG.cs) + 1;
        const depth = Math.ceil((bounds[1][2] - bounds[0][2]) / GENERATOR_CONFIG.cs) + 1;
        if (!Number.isFinite(width * depth) || width < 1 || depth < 1 || width * depth > MAX_RASTER_CELLS) {
            return {
                ok:false, status:'fallback', reason:'route-geometry-too-large',
                engine:'recast-navigation', engineVersion:RECAST_ENGINE_VERSION,
                totalMs:now() - startedAt
            };
        }
        const generationStartedAt = now();
        const generated = generateSoloNavMesh(request.geometry.positions, request.geometry.indices, {
            ...GENERATOR_CONFIG,
            ...(request.geometry.generationBounds ? { bounds:request.geometry.generationBounds } : {}),
            offMeshConnections:offMeshConnectionsFor(request)
        });
        const generationMs = now() - generationStartedAt;
        if (!generated.success) {
            return {
                ok:false,
                status:'fallback',
                reason:'generation-failed',
                detail:String(generated.error || 'Navigation mesh generation failed.'),
                engine:'recast-navigation',
                engineVersion:RECAST_ENGINE_VERSION,
                generationMs,
                totalMs:now() - startedAt
            };
        }

        navMesh = generated.navMesh;
        query = new NavMeshQuery(navMesh, { maxNodes:4096 });
        const queryStartedAt = now();
        const rawPath = completeNavMeshPath(query, request);
        const queryMs = now() - queryStartedAt;
        const complete = rawPath.length >= 2;
        const path = complete ? anchoredProjectedRoute(request, rawPath) : [];
        const validation = complete ? validateRouteGeometry(request, path) : { valid:false, violations:[] };
        const eligible = complete && validation.valid;
        return {
            ok:eligible,
            status:eligible ? 'ready' : (complete ? 'fallback' : 'no-path'),
            reason:eligible ? undefined : (complete ? 'validation-failed' : 'goal-unreachable'),
            violationCount:validation.violations.length,
            path:eligible ? path : [],
            engine:'recast-navigation',
            engineVersion:RECAST_ENGINE_VERSION,
            generationMs,
            queryMs,
            totalMs:now() - startedAt
        };
    } catch (error) {
        return {
            ok:false,
            status:'fallback',
            reason:'engine-error',
            detail:error instanceof Error ? error.message : String(error),
            engine:'recast-navigation',
            engineVersion:RECAST_ENGINE_VERSION,
            totalMs:now() - startedAt
        };
    } finally {
        query?.destroy();
        navMesh?.destroy();
    }
}
