import {
    COLLISION_COORDINATE_SYSTEM,
    cropCollisionGeometryForRoute,
    directedDropsFromPath,
    exportViewerCollisionGeometry
} from '../app/collision-geometry.js';
import { buildFixtureGeometry } from '../app/route-corpus.js';
import { runRecastRoute } from '../app/recast-route-engine.js';
import { validateRouteGeometry } from '../app/route-validation.js';

function attribute(values, itemSize = 3) {
    return {
        count:values.length / itemSize,
        getX(index) { return values[index * itemSize]; },
        getY(index) { return values[index * itemSize + 1]; },
        getZ(index) { return values[index * itemSize + 2]; }
    };
}

function indexAttribute(values) {
    return { count:values.length, getX(index) { return values[index]; } };
}

const identity = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
];

function mesh(positions, indices, options = {}) {
    return {
        isMesh:true,
        geometry:{
            attributes:{ position:attribute(positions) },
            index:indices ? indexAttribute(indices) : null
        },
        matrixWorld:{
            elements:options.matrix || identity,
            determinant:() => Number(options.determinant ?? 1)
        },
        userData:options.userData || {},
        children:[]
    };
}

function group(children = [], userData = {}) {
    const value = {
        children,
        userData,
        updateMatrixWorld() {},
        traverse(visitor) {
            const walk = object => {
                visitor(object);
                for (const child of object.children || []) walk(child);
            };
            walk(value);
        }
    };
    const link = (object, parent) => {
        object.parent = parent;
        for (const child of object.children || []) link(child, object);
    };
    for (const child of children) link(child, value);
    return value;
}

const outdoor = {
    nodes:[
        { id:'west', x:0, y:0, z:0 },
        { id:'center', x:50, y:0, z:0 },
        { id:'east', x:100, y:0, z:0 }
    ],
    edges:[{ from:'west', to:'center' }, { from:'center', to:'east' }]
};
const fixture = buildFixtureGeometry(outdoor);
const distant = mesh(
    [1000, 0, 1000, 1000, 0, 1010, 1010, 0, 1000],
    [0, 1, 2]
);
const prop = mesh(
    [5, 10, 0, 5, 10, 2, 7, 10, 0],
    [0, 1, 2],
    { userData:{ eqlProp:true } }
);
const source = group([mesh([...fixture.positions], [...fixture.indices]), distant, prop]);
const exported = await exportViewerCollisionGeometry(source);

if (!exported || exported.coordinateSystem !== COLLISION_COORDINATE_SYSTEM ||
    !(exported.positions instanceof Float32Array) || !(exported.indices instanceof Uint32Array) ||
    ![...exported.positions].every(Number.isFinite)) {
    throw new Error('Viewer collision export did not return finite typed geometry in the documented basis.');
}
if (exported.stats.sourceMeshes !== 2) throw new Error('Viewer collision export included prop geometry.');

const route = [{ x:0, y:0, z:0 }, { x:50, y:0, z:0 }, { x:100, y:0, z:0 }];
const cropped = await cropCollisionGeometryForRoute(exported, route, { margin:20 });
if (!cropped.ok || cropped.stats.selectedTriangles >= cropped.stats.sourceTriangles) {
    throw new Error('Route crop did not isolate nearby collision triangles.');
}
const oversized = await cropCollisionGeometryForRoute(exported, route, { margin:20, maxTriangles:1 });
if (oversized.ok || oversized.reason !== 'route-geometry-too-large') {
    throw new Error('Route crop did not enforce its worker-payload triangle cap.');
}
const result = await runRecastRoute({
    geometry:cropped.geometry,
    start:route[0],
    goal:route.at(-1)
});
if (!result.ok || !validateRouteGeometry({ geometry:cropped.geometry }, result.path).valid) {
    throw new Error(`Exported/cropped viewer geometry failed Recast integration: ${result.reason || 'invalid route'}.`);
}

const mirrored = group([mesh(
    [0, 0, 0, 1, 0, 0, 0, 0, 1],
    [0, 2, 1],
    {
        matrix:[
            -1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ],
        determinant:-1
    }
)]);
const mirroredExport = await exportViewerCollisionGeometry(mirrored);
const [ia, ib, ic] = mirroredExport.indices;
const point = index => ({
    x:mirroredExport.positions[index * 3],
    y:mirroredExport.positions[index * 3 + 1],
    z:mirroredExport.positions[index * 3 + 2]
});
const a = point(ia);
const b = point(ib);
const c = point(ic);
const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
if (!(normalY > 0)) throw new Error('Mirrored collision export reversed upward winding.');

const invalidTriangles = await exportViewerCollisionGeometry(group([mesh(
    [
        0, 0, 0, 1, 0, 0, 0, 0, 1,
        2, 0, 0, Number.NaN, 0, 1, 2, 0, 2,
        3, 0, 0, 4, 0, 0, 5, 0, 0
    ],
    [0, 2, 1, 3, 4, 5, 6, 7, 8]
)]));
if (!invalidTriangles || invalidTriangles.indices.length !== 3 || invalidTriangles.stats.skippedTriangles !== 2) {
    throw new Error('Viewer collision export did not reject non-finite and degenerate triangles.');
}

const cancelled = await exportViewerCollisionGeometry(source, { shouldCancel:() => true });
if (cancelled !== null) throw new Error('Cancelled viewer collision export returned usable geometry.');

const drops = directedDropsFromPath([{ x:0, y:20, z:0 }, { x:5, y:0, z:0 }]);
const ascents = directedDropsFromPath([{ x:5, y:0, z:0 }, { x:0, y:20, z:0 }]);
if (drops.length !== 1 || drops[0].bidirectional || ascents.length) {
    throw new Error('Collision route crop did not retain downward-only drop semantics.');
}
const markerOnly = await cropCollisionGeometryForRoute(exported, [{ x:0, y:20, z:0 }, { x:5, y:0, z:0 }], {
    margin:20,
    dropPath:[]
});
if (!markerOnly.ok || markerOnly.geometry.offMeshConnections.length) {
    throw new Error('An unvalidated direct destination marker invented a drop connection.');
}

console.log('Viewer collision export, crop, winding, cancellation, drop, and Recast integration contracts passed.');
