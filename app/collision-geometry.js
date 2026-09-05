import { MAX_NAVIGATION_CLIMB_Z } from './navigation-policy.js';

export const COLLISION_COORDINATE_SYSTEM = 'viewer-right-handed-y-up';
export const DEFAULT_ROUTE_CORRIDOR_MARGIN = 96;
export const MAX_ROUTE_TRIANGLES = 250_000;

function finitePoint(point) {
    return point && ['x', 'y', 'z'].every(axis => Number.isFinite(Number(point[axis])));
}

function defaultYieldControl() {
    if (globalThis.scheduler?.yield) return globalThis.scheduler.yield();
    return new Promise(resolve => setTimeout(resolve, 0));
}

function matrixElements(object) {
    const elements = object?.matrixWorld?.elements;
    return elements?.length === 16 ? elements : [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];
}

function matrixDeterminantSign(object, elements) {
    const determinant = object?.matrixWorld?.determinant?.();
    if (Number.isFinite(determinant)) return determinant < 0 ? -1 : 1;
    const value =
        elements[0] * (elements[5] * elements[10] - elements[6] * elements[9]) -
        elements[4] * (elements[1] * elements[10] - elements[2] * elements[9]) +
        elements[8] * (elements[1] * elements[6] - elements[2] * elements[5]);
    return value < 0 ? -1 : 1;
}

function transformPosition(attribute, index, elements) {
    const x = Number(attribute.getX(index));
    const y = Number(attribute.getY(index));
    const z = Number(attribute.getZ(index));
    const w = elements[3] * x + elements[7] * y + elements[11] * z + elements[15];
    const divisor = w && Number.isFinite(w) ? w : 1;
    return [
        (elements[0] * x + elements[4] * y + elements[8] * z + elements[12]) / divisor,
        (elements[1] * x + elements[5] * y + elements[9] * z + elements[13]) / divisor,
        (elements[2] * x + elements[6] * y + elements[10] * z + elements[14]) / divisor
    ];
}

function collisionEnabled(object, root) {
    if (!object?.isMesh || !object.geometry?.attributes?.position) return false;
    for (let current = object; current; current = current.parent) {
        if (current.userData?.eqlCollision === false || current.userData?.eqlProp === true || current.userData?.passThrough === true) return false;
        if (current === root) break;
    }
    return true;
}

function triangleIsDegenerate(positions, a, b, c) {
    const ai = a * 3;
    const bi = b * 3;
    const ci = c * 3;
    const abx = positions[bi] - positions[ai];
    const aby = positions[bi + 1] - positions[ai + 1];
    const abz = positions[bi + 2] - positions[ai + 2];
    const acx = positions[ci] - positions[ai];
    const acy = positions[ci + 1] - positions[ai + 1];
    const acz = positions[ci + 2] - positions[ai + 2];
    const cx = aby * acz - abz * acy;
    const cy = abz * acx - abx * acz;
    const cz = abx * acy - aby * acx;
    return cx * cx + cy * cy + cz * cz < 1e-10;
}

/**
 * Flatten the viewer's already-transformed collision meshes without inventing
 * another EQ/map coordinate conversion. Work is chunked so large zones do not
 * monopolize the renderer thread after the visible scene is ready.
 */
export async function exportViewerCollisionGeometry(root, options = {}) {
    if (!root?.traverse) return null;
    root.updateMatrixWorld?.(true);
    const records = [];
    root.traverse(object => {
        if (!collisionEnabled(object, root)) return;
        const position = object.geometry.attributes.position;
        const index = object.geometry.index || null;
        const indexCount = index ? index.count : position.count;
        if (position.count < 3 || indexCount < 3) return;
        const elements = matrixElements(object);
        records.push({
            position,
            index,
            indexCount:indexCount - (indexCount % 3),
            vertexCount:position.count,
            elements,
            reverseWinding:matrixDeterminantSign(object, elements) < 0
        });
    });
    if (!records.length) return null;

    const totalVertices = records.reduce((sum, record) => sum + record.vertexCount, 0);
    const maximumIndices = records.reduce((sum, record) => sum + record.indexCount, 0);
    const positions = new Float32Array(totalVertices * 3);
    const validVertices = new Uint8Array(totalVertices);
    const indices = new Uint32Array(maximumIndices);
    const bounds = {
        min:{ x:Infinity, y:Infinity, z:Infinity },
        max:{ x:-Infinity, y:-Infinity, z:-Infinity }
    };
    const yieldEveryMs = Math.max(1, Number(options.yieldEveryMs) || 6);
    const yieldControl = options.yieldControl || defaultYieldControl;
    const shouldCancel = options.shouldCancel || (() => false);
    let lastYield = performance.now();
    let vertexBase = 0;
    let indexOffset = 0;
    let sourceTriangles = 0;
    let skippedTriangles = 0;

    for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
        const record = records[recordIndex];
        for (let vertex = 0; vertex < record.vertexCount; vertex += 1) {
            const target = (vertexBase + vertex) * 3;
            const transformed = transformPosition(record.position, vertex, record.elements);
            const valid = transformed.every(Number.isFinite);
            validVertices[vertexBase + vertex] = valid ? 1 : 0;
            if (valid) {
                positions[target] = transformed[0];
                positions[target + 1] = transformed[1];
                positions[target + 2] = transformed[2];
                bounds.min.x = Math.min(bounds.min.x, transformed[0]);
                bounds.min.y = Math.min(bounds.min.y, transformed[1]);
                bounds.min.z = Math.min(bounds.min.z, transformed[2]);
                bounds.max.x = Math.max(bounds.max.x, transformed[0]);
                bounds.max.y = Math.max(bounds.max.y, transformed[1]);
                bounds.max.z = Math.max(bounds.max.z, transformed[2]);
            }
            if (shouldCancel()) return null;
            if (performance.now() - lastYield >= yieldEveryMs) {
                options.onProgress?.((recordIndex + vertex / record.vertexCount) / records.length * .65);
                await yieldControl();
                lastYield = performance.now();
                if (shouldCancel()) return null;
            }
        }

        for (let offset = 0; offset < record.indexCount; offset += 3) {
            sourceTriangles += 1;
            const local = record.index
                ? [record.index.getX(offset), record.index.getX(offset + 1), record.index.getX(offset + 2)]
                : [offset, offset + 1, offset + 2];
            if (record.reverseWinding) [local[1], local[2]] = [local[2], local[1]];
            const triangle = local.map(value => Number(value) + vertexBase);
            if (local.some(value => !Number.isInteger(Number(value)) || value < 0 || value >= record.vertexCount) ||
                triangle.some(value => !validVertices[value]) || triangleIsDegenerate(positions, ...triangle)) {
                skippedTriangles += 1;
                continue;
            }
            indices[indexOffset++] = triangle[0];
            indices[indexOffset++] = triangle[1];
            indices[indexOffset++] = triangle[2];
            if (shouldCancel()) return null;
            if (performance.now() - lastYield >= yieldEveryMs) {
                options.onProgress?.(.65 + (recordIndex + offset / record.indexCount) / records.length * .35);
                await yieldControl();
                lastYield = performance.now();
                if (shouldCancel()) return null;
            }
        }
        vertexBase += record.vertexCount;
    }

    if (!indexOffset || !Number.isFinite(bounds.min.x)) return null;
    options.onProgress?.(1);
    return {
        coordinateSystem:COLLISION_COORDINATE_SYSTEM,
        units:'eq-units',
        positions,
        indices:indices.slice(0, indexOffset),
        offMeshConnections:[],
        agent:{ maxClimb:MAX_NAVIGATION_CLIMB_Z },
        bounds,
        stats:{
            sourceMeshes:records.length,
            sourceTriangles,
            skippedTriangles,
            vertices:positions.length / 3,
            triangles:indexOffset / 3
        }
    };
}

export function routeCorridorMargin(points = []) {
    const valid = points.filter(finitePoint);
    if (valid.length < 2) return DEFAULT_ROUTE_CORRIDOR_MARGIN;
    let distance = 0;
    for (let index = 1; index < valid.length; index += 1) {
        distance += Math.hypot(valid[index].x - valid[index - 1].x, valid[index].z - valid[index - 1].z);
    }
    return Math.max(DEFAULT_ROUTE_CORRIDOR_MARGIN, Math.min(320, distance * .16));
}

export function directedDropsFromPath(points = []) {
    const drops = [];
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (!finitePoint(from) || !finitePoint(to)) continue;
        const drop = Number(from.y) - Number(to.y);
        const planar = Math.hypot(Number(to.x) - Number(from.x), Number(to.z) - Number(from.z));
        if (drop <= MAX_NAVIGATION_CLIMB_Z || planar > 64) continue;
        drops.push({
            from:{ x:Number(from.x), y:Number(from.y), z:Number(from.z) },
            to:{ x:Number(to.x), y:Number(to.y), z:Number(to.z) },
            radius:Math.max(2, Math.min(6, planar * .2 || 2)),
            bidirectional:false,
            kind:'drop'
        });
    }
    return drops;
}

/** Build a bounded worker payload around the already-visible fallback path. */
export async function cropCollisionGeometryForRoute(geometry, points, options = {}) {
    const validPoints = (points || []).filter(finitePoint);
    const dropPoints = Array.isArray(options.dropPath)
        ? options.dropPath.filter(finitePoint)
        : validPoints;
    if (!geometry?.positions || !geometry?.indices || validPoints.length < 2) {
        return { ok:false, reason:'route-geometry-incomplete' };
    }
    const margin = Math.max(1, Number(options.margin) || routeCorridorMargin(validPoints));
    const bounds = validPoints.reduce((value, point) => ({
        minX:Math.min(value.minX, Number(point.x)),
        maxX:Math.max(value.maxX, Number(point.x)),
        minZ:Math.min(value.minZ, Number(point.z)),
        maxZ:Math.max(value.maxZ, Number(point.z))
    }), { minX:Infinity, maxX:-Infinity, minZ:Infinity, maxZ:-Infinity });
    bounds.minX -= margin;
    bounds.maxX += margin;
    bounds.minZ -= margin;
    bounds.maxZ += margin;

    const selected = [];
    const shouldCancel = options.shouldCancel || (() => false);
    const yieldEveryMs = Math.max(1, Number(options.yieldEveryMs) || 6);
    const yieldControl = options.yieldControl || defaultYieldControl;
    const maximumTriangles = Math.max(1, Number(options.maxTriangles) || MAX_ROUTE_TRIANGLES);
    let lastYield = performance.now();
    const triangleCount = Math.floor(geometry.indices.length / 3);

    for (let offset = 0; offset + 2 < geometry.indices.length; offset += 3) {
        if (shouldCancel()) return { ok:false, reason:'cancelled' };
        const a = geometry.indices[offset] * 3;
        const b = geometry.indices[offset + 1] * 3;
        const c = geometry.indices[offset + 2] * 3;
        const minX = Math.min(geometry.positions[a], geometry.positions[b], geometry.positions[c]);
        const maxX = Math.max(geometry.positions[a], geometry.positions[b], geometry.positions[c]);
        const minZ = Math.min(geometry.positions[a + 2], geometry.positions[b + 2], geometry.positions[c + 2]);
        const maxZ = Math.max(geometry.positions[a + 2], geometry.positions[b + 2], geometry.positions[c + 2]);
        if (maxX >= bounds.minX && minX <= bounds.maxX && maxZ >= bounds.minZ && minZ <= bounds.maxZ) {
            selected.push(offset);
            if (selected.length > maximumTriangles) {
                return {
                    ok:false,
                    reason:'route-geometry-too-large',
                    stats:{ sourceTriangles:triangleCount, selectedTriangles:selected.length, margin }
                };
            }
        }
        if (performance.now() - lastYield >= yieldEveryMs) {
            options.onProgress?.((offset / Math.max(1, geometry.indices.length)) * .65);
            await yieldControl();
            lastYield = performance.now();
        }
    }
    if (!selected.length) {
        return { ok:false, reason:'no-route-geometry', stats:{ sourceTriangles:triangleCount, selectedTriangles:0, margin } };
    }

    const positions = new Float32Array(selected.length * 9);
    const indices = new Uint32Array(selected.length * 3);
    let targetVertex = 0;
    for (let selectedIndex = 0; selectedIndex < selected.length; selectedIndex += 1) {
        const sourceOffset = selected[selectedIndex];
        for (let corner = 0; corner < 3; corner += 1) {
            const source = geometry.indices[sourceOffset + corner] * 3;
            const target = targetVertex * 3;
            positions[target] = geometry.positions[source];
            positions[target + 1] = geometry.positions[source + 1];
            positions[target + 2] = geometry.positions[source + 2];
            indices[targetVertex] = targetVertex;
            targetVertex += 1;
        }
        if (performance.now() - lastYield >= yieldEveryMs) {
            if (shouldCancel()) return { ok:false, reason:'cancelled' };
            options.onProgress?.(.65 + selectedIndex / selected.length * .35);
            await yieldControl();
            lastYield = performance.now();
        }
    }

    options.onProgress?.(1);
    return {
        ok:true,
        geometry:{
            coordinateSystem:COLLISION_COORDINATE_SYSTEM,
            units:'eq-units',
            positions,
            indices,
            offMeshConnections:[
                ...(geometry.offMeshConnections || []),
                ...directedDropsFromPath(dropPoints)
            ],
            agent:{ maxClimb:MAX_NAVIGATION_CLIMB_Z }
        },
        stats:{ sourceTriangles:triangleCount, selectedTriangles:selected.length, margin }
    };
}
