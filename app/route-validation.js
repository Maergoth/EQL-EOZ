import { MAX_NAVIGATION_CLIMB_Z, NAVIGATION_AGENT_HEIGHT, NAVIGATION_AGENT_RADIUS, canUseDropSurface } from './navigation-policy.js';

const SAMPLE_SPACING = 2;
const SURFACE_TOLERANCE = .9;
const TRIANGLE_CELL_SIZE = 48;
const MAX_CELLS_PER_TRIANGLE = 64;
const MIN_WALKABLE_NORMAL_Y = .5;
const WALL_CHECK_HEIGHT = NAVIGATION_AGENT_HEIGHT;
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

function triangleSurfaceY(positions, indices, triangleOffset, point, requireInside = true) {
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
    if (requireInside && (u < -.001 || v < -.001 || w < -.001)) return null;
    return u * positions[ia + 1] + v * positions[ib + 1] + w * positions[ic + 1];
}

function spatialIndex(geometry) {
    const cached = spatialIndexCache.get(geometry);
    if (cached) return cached;
    const cells = new Map();
    const broadTriangles = [];
    const walkableTriangles = new Set();
    const wallTriangles = new Set();
    const { positions, indices } = geometry;
    const cellCoordinate = value => Math.floor(value / TRIANGLE_CELL_SIZE);
    for (let offset = 0; offset + 2 < indices.length; offset += 3) {
        const ia = indices[offset] * 3;
        const ib = indices[offset + 1] * 3;
        const ic = indices[offset + 2] * 3;
        const xs = [positions[ia], positions[ib], positions[ic]];
        const zs = [positions[ia + 2], positions[ib + 2], positions[ic + 2]];
        if (![...xs, ...zs].every(Number.isFinite)) continue;
        const abx = positions[ib] - positions[ia];
        const aby = positions[ib + 1] - positions[ia + 1];
        const abz = positions[ib + 2] - positions[ia + 2];
        const acx = positions[ic] - positions[ia];
        const acy = positions[ic + 1] - positions[ia + 1];
        const acz = positions[ic + 2] - positions[ia + 2];
        const nx = aby * acz - abz * acy;
        const ny = abz * acx - abx * acz;
        const nz = abx * acy - aby * acx;
        const normalY = ny / Math.hypot(nx, ny, nz);
        if (normalY >= MIN_WALKABLE_NORMAL_Y) walkableTriangles.add(offset);
        if (normalY < MIN_WALKABLE_NORMAL_Y) wallTriangles.add(offset);
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
    const index = { cells, broadTriangles, cellCoordinate, walkableTriangles, wallTriangles };
    spatialIndexCache.set(geometry, index);
    return index;
}

function surfaceYs(point, geometry, walkableOnly = true) {
    const values = [];
    const index = spatialIndex(geometry);
    const local = index.cells.get(`${index.cellCoordinate(point.x)}:${index.cellCoordinate(point.z)}`) || [];
    for (const offset of local) {
        if (walkableOnly && !index.walkableTriangles.has(offset)) continue;
        const y = triangleSurfaceY(geometry.positions, geometry.indices, offset, point);
        if (y !== null) values.push(y);
    }
    for (const offset of index.broadTriangles) {
        if (walkableOnly && !index.walkableTriangles.has(offset)) continue;
        const y = triangleSurfaceY(geometry.positions, geometry.indices, offset, point);
        if (y !== null) values.push(y);
    }
    return values;
}

function hasClearance(point, geometry) {
    return !surfaceYs(point, geometry, false).some(y =>
        y > point.y + .001 && y < point.y + NAVIGATION_AGENT_HEIGHT);
}

function exposedTakeoff(from, to, geometry) {
    const at = t => ({ x:from.x + (to.x - from.x) * t, y:from.y, z:from.z + (to.z - from.z) * t });
    const upperSurface = point => surfaceYs(point, geometry).find(y => Math.abs(y - from.y) <= SURFACE_TOLERANCE);
    const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .5));
    let last = 0;
    for (let index = 1; index <= steps; index += 1) {
        const t = index / steps;
        if (Number.isFinite(upperSurface(at(t)))) { last = t; continue; }
        let low = last;
        let high = t;
        for (let iteration = 0; iteration < 18; iteration += 1) {
            const middle = (low + high) / 2;
            if (Number.isFinite(upperSurface(at(middle)))) low = middle;
            else high = middle;
        }
        const point = at(low);
        point.y = upperSurface(point) ?? from.y;
        return point;
    }
    return null;
}

function intersectsWallTriangle(from, to, geometry, offset, height = WALL_CHECK_HEIGHT, includeEndpoints = true) {
    const { positions, indices } = geometry;
    const ia = indices[offset] * 3;
    const ib = indices[offset + 1] * 3;
    const ic = indices[offset + 2] * 3;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const e1x = positions[ib] - positions[ia];
    const e1y = positions[ib + 1] - positions[ia + 1];
    const e1z = positions[ib + 2] - positions[ia + 2];
    const e2x = positions[ic] - positions[ia];
    const e2y = positions[ic + 1] - positions[ia + 1];
    const e2z = positions[ic + 2] - positions[ia + 2];
    const px = dy * e2z - dz * e2y;
    const py = dz * e2x - dx * e2z;
    const pz = dx * e2y - dy * e2x;
    const determinant = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(determinant) < 1e-8) return false;
    const tx = from.x - positions[ia];
    const ty = from.y + height - positions[ia + 1];
    const tz = from.z - positions[ia + 2];
    const u = (tx * px + ty * py + tz * pz) / determinant;
    if (u < -1e-7 || u > 1 + 1e-7) return false;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) / determinant;
    if (v < -1e-7 || u + v > 1 + 1e-7) return false;
    const t = (e2x * qx + e2y * qy + e2z * qz) / determinant;
    return includeEndpoints ? t >= -1e-7 && t <= 1 + 1e-7 : t > 1e-7 && t < 1 - 1e-7;
}

function segmentTriangleCandidates(from, to, geometry, margin = 0) {
    const index = spatialIndex(geometry);
    const offsets = new Set(index.broadTriangles);
    const minX = index.cellCoordinate(Math.min(from.x, to.x) - margin);
    const maxX = index.cellCoordinate(Math.max(from.x, to.x) + margin);
    const minZ = index.cellCoordinate(Math.min(from.z, to.z) - margin);
    const maxZ = index.cellCoordinate(Math.max(from.z, to.z) + margin);
    for (let x = minX; x <= maxX; x += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
            for (const offset of index.cells.get(`${x}:${z}`) || []) offsets.add(offset);
        }
    }
    return { index, offsets };
}

/** Match the established route's eye-height wall check, in either direction. */
function segmentCrossesWall(from, to, geometry) {
    const { index, offsets } = segmentTriangleCandidates(from, to, geometry);
    for (const offset of offsets) {
        if (index.wallTriangles.has(offset) && intersectsWallTriangle(from, to, geometry, offset)) return true;
    }
    return false;
}

function dropCrossesSurface(from, to, geometry) {
    const { offsets } = segmentTriangleCandidates(from, to, geometry);
    return [...offsets].some(offset => intersectsWallTriangle(from, to, geometry, offset, 0, false));
}

function clippedTriangleIntersectsBox(vertices, minimum, maximum) {
    let polygon = vertices;
    for (let axis = 0; axis < 3; axis += 1) {
        for (const [bound, sign] of [[minimum[axis], 1], [maximum[axis], -1]]) {
            const output = [];
            for (let index = 0; index < polygon.length; index += 1) {
                const previous = polygon[(index + polygon.length - 1) % polygon.length];
                const current = polygon[index];
                const previousDistance = (previous[axis] - bound) * sign;
                const currentDistance = (current[axis] - bound) * sign;
                if ((previousDistance >= 0) !== (currentDistance >= 0)) {
                    const t = previousDistance / (previousDistance - currentDistance);
                    output.push(previous.map((value, coordinate) => value + (current[coordinate] - value) * t));
                }
                if (currentDistance >= 0) output.push(current);
            }
            polygon = output;
            if (!polygon.length) return false;
        }
    }
    return polygon.length > 0;
}

/** Continuous upright body sweep; thin barriers cannot hide between samples. */
function segmentBodyBlocked(from, to, geometry) {
    const radius = NAVIGATION_AGENT_RADIUS;
    const { index, offsets } = segmentTriangleCandidates(from, to, geometry, radius * Math.SQRT2);
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const directionX = length > .0001 ? (to.x - from.x) / length : 1;
    const directionZ = length > .0001 ? (to.z - from.z) / length : 0;
    const sections = length > .0001 ? [
        { minimumU:0, maximumU:length, start:from, end:to, slope:(to.y - from.y) / length, floorY:from.y },
        { minimumU:-radius, maximumU:0, start:from, end:from, slope:0, floorY:from.y },
        { minimumU:length, maximumU:length + radius, start:to, end:to, slope:0, floorY:to.y }
    ] : [{ minimumU:-radius, maximumU:radius, start:from, end:from, slope:0, floorY:from.y }];
    for (const offset of offsets) {
        const points = [0, 1, 2].map(corner => {
            const vertex = geometry.indices[offset + corner] * 3;
            return { x:geometry.positions[vertex], y:geometry.positions[vertex + 1], z:geometry.positions[vertex + 2] };
        });
        for (const section of sections) {
            const walkable = index.walkableTriangles.has(offset);
            if (walkable) {
                // A climbable surface beside the feet is not a lateral wall.
                // Its overhead intersection still blocks the continuous
                // center body sweep; solid walls/ceilings use the full radius.
                if (section !== sections[0] || length <= .0001) continue;
                const startY = triangleSurfaceY(geometry.positions, geometry.indices, offset, section.start, false);
                const endY = triangleSurfaceY(geometry.positions, geometry.indices, offset, section.end, false);
                // A walkable supporting ramp is not a body obstacle. Its
                // upward face is still checked whenever it lies overhead.
                if (Math.abs(startY - section.start.y) <= .001 &&
                    Math.abs(endY - section.end.y) <= .001) continue;
            }
            const transformed = points.map(point => {
                const dx = point.x - from.x;
                const dz = point.z - from.z;
                const u = dx * directionX + dz * directionZ;
                const v = -dx * directionZ + dz * directionX;
                return [u, v, point.y - section.floorY - section.slope * u];
            });
            if (clippedTriangleIntersectsBox(transformed,
                [section.minimumU, walkable ? 0 : -radius, .001],
                [section.maximumU, walkable ? 0 : radius, NAVIGATION_AGENT_HEIGHT - .001])) return true;
        }
    }
    return false;
}

function surfaceEdgeParameters(from, to, geometry) {
    const { index, offsets } = segmentTriangleCandidates(from, to, geometry);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const values = [];
    for (const offset of offsets) {
        if (!index.walkableTriangles.has(offset)) continue;
        for (let corner = 0; corner < 3; corner += 1) {
            const a = geometry.indices[offset + corner] * 3;
            const b = geometry.indices[offset + (corner + 1) % 3] * 3;
            const ax = geometry.positions[a] - from.x;
            const az = geometry.positions[a + 2] - from.z;
            const ex = geometry.positions[b] - geometry.positions[a];
            const ez = geometry.positions[b + 2] - geometry.positions[a + 2];
            const determinant = dx * ez - dz * ex;
            if (Math.abs(determinant) < 1e-8) continue;
            const t = (ax * ez - az * ex) / determinant;
            const u = (ax * dz - az * dx) / determinant;
            if (t > 1e-7 && t < 1 - 1e-7 && u >= -1e-7 && u <= 1 + 1e-7) values.push(t);
        }
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
            const takeoff = exposedTakeoff(projected.at(-1), to, geometry);
            if (takeoff && distance(projected.at(-1), takeoff) > .01) projected.push(takeoff);
            projected.push({ ...to });
            continue;
        }
        const planarLength = Math.hypot(to.x - from.x, to.z - from.z);
        const samples = Math.max(1, Math.ceil(planarLength / SAMPLE_SPACING));
        const parameters = [...surfaceEdgeParameters(from, to, geometry)];
        for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex += 1) parameters.push(sampleIndex / samples);
        parameters.sort((a, b) => a - b);
        for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex += 1) {
            const t = parameters[parameterIndex];
            if (parameterIndex && t - parameters[parameterIndex - 1] < 1e-7) continue;
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
        if (segmentCrossesWall(from, to, geometry)) {
            violations.push(`segment ${segmentIndex}: crosses solid wall`);
            continue;
        }
        if (segmentBodyBlocked(from, to, geometry)) {
            violations.push(`segment ${segmentIndex}: insufficient body clearance`);
            continue;
        }
        if (isDrop) {
            if (!supported(from, geometry) || !supported(to, geometry) || !hasClearance(from, geometry) || !hasClearance(to, geometry) ||
                !canUseDropSurface(from.y, to.y, surfaceYs(to, geometry))) {
                violations.push(`segment ${segmentIndex}: drop is unsupported or not exposed`);
                continue;
            }
            if (dropCrossesSurface(from, to, geometry)) {
                violations.push(`segment ${segmentIndex}: drop crosses solid geometry`);
                continue;
            }
            // A declared connection is not proof of an exposed takeoff. A
            // diagonal descent starting inside a platform can otherwise pass
            // through that platform before reaching the exposed landing.
            const samples = Math.max(2, Math.ceil(distance(from, to) / SAMPLE_SPACING));
            for (let sampleIndex = 1; sampleIndex < samples; sampleIndex += 1) {
                const t = sampleIndex / samples;
                const point = {
                    x:from.x + (to.x - from.x) * t,
                    y:from.y + deltaY * t,
                    z:from.z + (to.z - from.z) * t
                };
                if (surfaceYs(point, geometry).some(y => y > point.y + SURFACE_TOLERANCE && y <= from.y + MAX_NAVIGATION_CLIMB_Z)) {
                    violations.push(`segment ${segmentIndex}: drop intersects an intervening walkable floor`);
                    break;
                }
                if (!hasClearance(point, geometry)) {
                    violations.push(`segment ${segmentIndex}: insufficient headroom`);
                    break;
                }
            }
            continue;
        }
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
            if (!hasClearance(point, geometry)) {
                violations.push(`segment ${segmentIndex}: insufficient headroom`);
                break;
            }
        }
    }
    return { valid:violations.length === 0, violations };
}

/** Cooperatively validate established lines on the renderer's shared geometry. */
export async function validateRouteGeometryAsync(request, path, options = {}) {
    if (!Array.isArray(path) || path.length < 2) return validateRouteGeometry(request, path);
    const violations = [];
    const shouldCancel = options.shouldCancel || (() => false);
    const yieldControl = options.yieldControl || (() => new Promise(resolve => setTimeout(resolve, 0)));
    let lastYield = performance.now();
    for (let index = 1; index < path.length; index += 1) {
        if (shouldCancel()) return { valid:false, violations:['validation cancelled'] };
        const result = validateRouteGeometry(request, [path[index - 1], path[index]]);
        violations.push(...result.violations);
        if (performance.now() - lastYield >= 6) {
            await yieldControl();
            lastYield = performance.now();
        }
    }
    return { valid:violations.length === 0, violations };
}
