import { directedDropsFromPath } from './collision-geometry.js';
import { MAX_NAVIGATION_CLIMB_Z, NAVIGATION_AGENT_RADIUS } from './navigation-policy.js';
import { projectRouteToGeometry, validateRouteGeometryAsync } from './route-validation.js';

const MAX_DIRECT_DROP_HEIGHT = 60;
const MAX_DIRECT_DROP_SPAN = 64;
const DROP_ATTACHMENT_MARGIN = .75;

/**
 * A marker is only a proposal. Certify a short exposed descent against all
 * collision triangles in its crop before permitting a directed worker link.
 * Projection finds the real takeoff; the independent guard still checks the
 * approach, full body, intervening floors, exposed landing, and climb policy.
 */
export async function certifyDirectDrop(geometry, start, goal, options = {}) {
    const finite = point => point && ['x', 'y', 'z'].every(axis => Number.isFinite(Number(point[axis])));
    const shouldCancel = options.shouldCancel || (() => false);
    if (shouldCancel()) return { ok:false, reason:'cancelled' };
    if (!finite(start) || !finite(goal) || !geometry?.positions || !geometry?.indices) return { ok:false, reason:'drop-geometry-incomplete' };
    const height = Number(start.y) - Number(goal.y);
    const span = Math.hypot(Number(goal.x) - Number(start.x), Number(goal.z) - Number(start.z));
    if (height <= MAX_NAVIGATION_CLIMB_Z || height > MAX_DIRECT_DROP_HEIGHT || span > MAX_DIRECT_DROP_SPAN) {
        return { ok:false, reason:'drop-outside-local-bounds' };
    }
    const proposal = directedDropsFromPath([start, goal])[0];
    if (!proposal) return { ok:false, reason:'no-directed-drop' };
    const yieldControl = options.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)));
    await yieldControl();
    if (shouldCancel()) return { ok:false, reason:'cancelled' };
    const request = { geometry:{ ...geometry, offMeshConnections:[proposal] } };
    const path = projectRouteToGeometry(request, [start, goal]);
    if (shouldCancel()) return { ok:false, reason:'cancelled' };
    if (path.length < 2) return { ok:false, reason:'no-directed-drop' };
    // Surface projection cannot authorize a vertical teleport at either end.
    path[0] = { x:Number(start.x), y:Number(start.y), z:Number(start.z) };
    path[path.length - 1] = { x:Number(goal.x), y:Number(goal.y), z:Number(goal.z) };
    // A marker can be several units behind the ledge. Authorize only the
    // projected exposed takeoff, never a diagonal from the platform interior.
    const drops = directedDropsFromPath(path);
    if (drops.length !== 1) return { ok:false, reason:'no-directed-drop' };
    const connection = drops[0];
    // Recast erodes its landing polygons by the real player radius. This
    // attachment tolerance does not waive any independent collision checks.
    connection.radius = Math.max(NAVIGATION_AGENT_RADIUS + DROP_ATTACHMENT_MARGIN, connection.radius);
    request.geometry.offMeshConnections = [connection];
    const validation = await validateRouteGeometryAsync(request, path, { shouldCancel, yieldControl });
    if (shouldCancel()) return { ok:false, reason:'cancelled' };
    return validation.valid
        ? { ok:true, connection }
        : { ok:false, reason:'drop-not-certified', violationCount:validation.violations.length };
}
