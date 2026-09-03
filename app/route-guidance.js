const DEFAULTS = Object.freeze({
    arrivalDistance:10,
    offRouteDistance:30,
    facingAngle:35,
    turnAngle:28,
    minimumSegment:1
});

function point(value) {
    const x = Number(value?.x);
    const y = Number(value?.y);
    const z = Number(value?.z);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function distance3d(left, right) {
    return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function planarVector(left, right) {
    return { x:right.x - left.x, z:right.z - left.z };
}

function normalized(vector) {
    const length = Math.hypot(vector.x, vector.z);
    return length > .0001 ? { x:vector.x / length, z:vector.z / length, length } : null;
}

function angleBetween(left, right) {
    const dot = Math.max(-1, Math.min(1, left.x * right.x + left.z * right.z));
    return Math.acos(dot) * 180 / Math.PI;
}

function turnDirection(from, to) {
    return from.x * to.z - from.z * to.x >= 0 ? 'right' : 'left';
}

function roundedDistance(value) {
    return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

/**
 * Derive a concise live cue from the viewer's collision-valid navigation path.
 * Inputs intentionally accept plain objects as well as Three.js vectors so the
 * spatial contract can be verified without loading the renderer.
 */
export function routeGuidance(path, position, forward, options = {}) {
    const config = { ...DEFAULTS, ...options };
    const points = Array.isArray(path) ? path.map(point).filter(Boolean) : [];
    const current = point(position);
    if (!current || points.length < 2) return { active:false };

    let nearest = null;
    for (let index = 0; index < points.length - 1; index += 1) {
        const start = points[index];
        const end = points[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lengthSq = dx * dx + dz * dz;
        if (lengthSq < .0001) continue;
        const t = Math.max(0, Math.min(1, ((current.x - start.x) * dx + (current.z - start.z) * dz) / lengthSq));
        const projection = {
            x:start.x + dx * t,
            y:start.y + (end.y - start.y) * t,
            z:start.z + dz * t
        };
        const planarDistance = Math.hypot(current.x - projection.x, current.z - projection.z);
        if (!nearest || planarDistance < nearest.planarDistance) nearest = { index, projection, planarDistance };
    }
    if (!nearest) return { active:false };

    const remainingPoints = [nearest.projection, ...points.slice(nearest.index + 1)];
    const remainingDistance = remainingPoints.slice(1).reduce(
        (sum, next, index) => sum + distance3d(remainingPoints[index], next),
        0
    );
    const base = {
        active:true,
        remainingDistance,
        offRouteDistance:nearest.planarDistance,
        nearestSegment:nearest.index,
        distanceToTurn:null,
        turnDirection:''
    };

    if (remainingDistance <= config.arrivalDistance) {
        return { ...base, cue:'Destination ahead', cueKind:'arrival' };
    }
    if (nearest.planarDistance > config.offRouteDistance) {
        return { ...base, cue:'Return to the golden path', cueKind:'off-route' };
    }

    let initial = null;
    for (let index = 0; index < remainingPoints.length - 1; index += 1) {
        initial = normalized(planarVector(remainingPoints[index], remainingPoints[index + 1]));
        if (initial && initial.length >= config.minimumSegment) break;
    }
    const facing = normalized({ x:Number(forward?.x), z:Number(forward?.z) });
    if (initial && facing) {
        const facingAngle = angleBetween(facing, initial);
        const dot = facing.x * initial.x + facing.z * initial.z;
        if (dot < -.5) return { ...base, cue:'Turn around', cueKind:'facing' };
        if (facingAngle >= config.facingAngle) {
            const direction = turnDirection(facing, initial);
            return { ...base, cue:`Face ${direction}`, cueKind:'facing', turnDirection:direction };
        }
    }

    let distanceToVertex = distance3d(nearest.projection, points[nearest.index + 1]);
    for (let vertex = nearest.index + 1; vertex < points.length - 1; vertex += 1) {
        const incoming = normalized(planarVector(points[vertex - 1], points[vertex]));
        const outgoing = normalized(planarVector(points[vertex], points[vertex + 1]));
        if (incoming && outgoing && incoming.length >= config.minimumSegment && outgoing.length >= config.minimumSegment &&
            angleBetween(incoming, outgoing) >= config.turnAngle) {
            const direction = turnDirection(incoming, outgoing);
            return {
                ...base,
                cue:`Turn ${direction} in ${roundedDistance(distanceToVertex)} units`,
                cueKind:'turn',
                turnDirection:direction,
                distanceToTurn:distanceToVertex
            };
        }
        distanceToVertex += distance3d(points[vertex], points[vertex + 1]);
    }

    return {
        ...base,
        cue:`Continue for ${roundedDistance(remainingDistance)} units`,
        cueKind:'continue'
    };
}

