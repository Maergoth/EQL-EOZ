import { MAX_NAVIGATION_CLIMB_Z } from './navigation-policy.js';

const SAMPLE_SPACING = 2;
const SURFACE_TOLERANCE = .9;
const TRIANGLE_CELL_SIZE = 48;
const MAX_CELLS_PER_TRIANGLE = 64;
const spatialIndexCache = new WeakMap();

function finitePoint(point) {
    return point && ['x', 'y', 'z'].every(axis => Number.isFinite(Number(point[axis])));
}

function distance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function matchingDrop(from, to, connections) {
    return connections.some(connection => connection.kind === 'drop'
        && distance(from, connection.from) <= (Number(connection.radius) || 1) + SURFACE_TOLERANCE
        && distance(to, connection.to) <= (Number(connection.radius) || 1) + SURFACE_TOLERANCE);
}

function triangleSurfaceY(positions, indices, triangleOffset, point) {
    const ia = indices[triangleOffset] * 3;
    const ib = indices[triangleOffset + 1] * 3;
    const ic = indices[triangleOffset + 2] * 3;
    const ax = positions[ia];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cz = positions[ic + 2];
    const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(denominator) < 1e-7) return null;
    const u = ((bz - cz) * (point.x - cx) + (cx - bx) * (point.z - cz)) / denominator;
    const v = ((cz - az) * (point.x - cx) + (ax - cx) * (point.z - cz)) / denominator;
    const w = 1 - u - v;
    if (u < -.001 || v < -.001 || w < -.001) return null;
    return u * positions[ia + 1] + v * positions[ib + 1] + w * positions[ic + 1];
}

function spatialIndex(geometry) {
    const cached = spatialIndexCache.get(geometry);
    if (cached) return cached;
    const cells = new Map();
    const broadTriangles = [];
    const { positions, indices } = geometry;
    const cellCoordinate = value => Math.floor(value / TRIANGLE_CELL_SIZE);
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
        const ia = indices[offset] * 3;
        const ib = indices[offset + 1] * 3;
        const ic = indices[offset + 2] * 3;
        const xs = [positions[ia], positions[ib], positions[ic]];
        const zs = [positions[ia + 2], positions[ib + 2], positions[ic + 2]];
        if (![...xs, ...zs].every(Number.isFinite)) continue;
        const minX = cellCoordinate(Math.min(...xs));
        const maxX = cellCoordinate(Math.max(...xs));
        const minZ = cellCoordinate(Math.min(...zs));
        const maxZ = cellCoordinate(Math.max(...zs));
        const cellCount = (maxX - minX + 1) * (maxZ - minZ + 1);
        if (cellCount > MAX_CELLS_PER_TRIANGLE) {
            broadTriangles.push(offset);
            continue;
        }
        for (let x = minX; x <= maxX; x += 1) {
            for (let z = minZ; z <= maxZ; z += 1) {
                const key = `${x}:${z}`;
                const values = cells.get(key);
                if (values) values.push(offset);
                else cells.set(key, [offset]);
            }
        }
    }
    const index = { cells, broadTriangles, cellCoordinate };
    spatialIndexCache.set(geometry, index);
    return index;
}

function surfaceYs(point, geometry) {
    const values = [];
    const index = spatialIndex(geometry);
    const local = index.cells.get(`${index.cellCoordinate(point.x)}:${index.cellCoordinate(point.z)}`) || [];
    for (const offset of local) {
        const y = triangleSurfaceY(geometry.positions, geometry.indices, offset, point);
        if (y !== null) values.push(y);
    }
    for (const offset of index.broadTriangles) {
        const y = triangleSurfaceY(geometry.positions, geometry.indices, offset, point);
        if (y !== null) values.push(y);
    }
    return values;
}

function supported(point, geometry) {
    return surfaceYs(point, geometry).some(y => Math.abs(y - point.y) <= SURFACE_TOLERANCE);
}

/** Densify Detour's funnel result and restore the collision-surface height. */
export function projectRouteToGeometry(request, path) {
    const geometry = request?.geometry;
    if (!geometry?.positions || !geometry?.indices || !Array.isArray(path) || !path.length) return [];
    const projected = [];
    for (let segmentIndex = 1; segmentIndex < path.length; segmentIndex += 1) {
        const from = path[segmentIndex - 1];
        const to = path[segmentIndex];
        if (!finitePoint(from) || !finitePoint(to)) return [];
        if (segmentIndex === 1) {
            const startSurfaces = surfaceYs(from, geometry);
            const startY = startSurfaces.sort((a, b) => Math.abs(a - from.y) - Math.abs(b - from.y))[0];
            projected.push({ ...from, y:Number.isFinite(startY) ? startY : from.y });
        }
        if (matchingDrop(from, to, geometry.offMeshConnections || [])) {
            projected.push({ ...to });
            continue;
        }
        const planarLength = Math.hypot(to.x - from.x, to.z - from.z);
        const samples = Math.max(1, Math.ceil(planarLength / SAMPLE_SPACING));
        for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex += 1) {
            const t = sampleIndex / samples;
            const point = {
                x:from.x + (to.x - from.x) * t,
                y:from.y + (to.y - from.y) * t,
                z:from.z + (to.z - from.z) * t
            };
            const surfaces = surfaceYs(point, geometry);
            surfaces.sort((a, b) => Math.abs(a - point.y) - Math.abs(b - point.y));
            if (Number.isFinite(surfaces[0])) point.y = surfaces[0];
            projected.push(point);
        }
    }
    return projected;
}

/** First-party post-query guard; no candidate path is eligible without it. */
export function validateRouteGeometry(request, path) {
    const violations = [];
    const geometry = request?.geometry;
    if (!geometry?.positions || !geometry?.indices || !Array.isArray(path) || path.length < 2) {
        return { valid:false, violations:['route or geometry is incomplete'] };
    }
    for (let segmentIndex = 1; segmentIndex < path.length; segmentIndex += 1) {
        const from = path[segmentIndex - 1];
        const to = path[segmentIndex];
        if (!finitePoint(from) || !finitePoint(to)) {
            violations.push(`segment ${segmentIndex}: non-finite coordinate`);
            continue;
        }
        const deltaY = to.y - from.y;
        if (deltaY > MAX_NAVIGATION_CLIMB_Z) {
            violations.push(`segment ${segmentIndex}: exceeds upward climb limit`);
            continue;
        }
        const isDrop = deltaY < -MAX_NAVIGATION_CLIMB_Z && matchingDrop(from, to, geometry.offMeshConnections || []);
        if (deltaY < -MAX_NAVIGATION_CLIMB_Z && !isDrop) {
            violations.push(`segment ${segmentIndex}: undeclared drop`);
            continue;
        }
        if (isDrop) continue;
        const length = distance(from, to);
        const samples = Math.max(1, Math.ceil(length / SAMPLE_SPACING));
        for (let sampleIndex = 0; sampleIndex <= samples; sampleIndex += 1) {
            const t = sampleIndex / samples;
            const point = {
                x:from.x + (to.x - from.x) * t,
                y:from.y + deltaY * t,
                z:from.z + (to.z - from.z) * t
            };
            if (!supported(point, geometry)) {
                violations.push(`segment ${segmentIndex}: leaves walkable surface`);
                break;
            }
        }
    }
    return { valid:violations.length === 0, violations };
}
