import {
    COLLISION_COORDINATE_SYSTEM,
    cropCollisionGeometryForRoute,
    directedDropsFromPath,
    exportViewerCollisionGeometry
} from '../app/collision-geometry.js';
import { buildFixtureGeometry } from '../app/route-corpus.js';
import { runRecastRoute } from '../app/recast-route-engine.js';
import { validateRouteGeometry } from '../app/route-validation.js';
import { readFileSync } from 'node:fs';
import { installEstablishedRouteGuard } from '../app/established-route-guard.js';

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

const broadTriangle = {
    positions:new Float32Array([-1000, 0, -1000, 1000, 0, -1000, 0, 0, 1000]),
    indices:new Uint32Array([0, 2, 1]),
    offMeshConnections:[]
};
const shortRoute = [{ x:-10, y:0, z:0 }, { x:10, y:0, z:0 }];
const boundedCrop = await cropCollisionGeometryForRoute(broadTriangle, shortRoute, { margin:20 });
if (!boundedCrop.ok || boundedCrop.geometry.generationBounds[0][0] !== -30 ||
    boundedCrop.geometry.generationBounds[1][0] !== 30 ||
    boundedCrop.geometry.generationBounds[0][2] !== -20 ||
    boundedCrop.geometry.generationBounds[1][2] !== 20 ||
    Math.min(...boundedCrop.geometry.positions) !== -1000) {
    throw new Error('Route crop either lost broad collision geometry or expanded its generation bounds to far vertices.');
}
const broadResult = await runRecastRoute({ geometry:boundedCrop.geometry, start:shortRoute[0], goal:shortRoute[1] });
if (!broadResult.ok || !validateRouteGeometry({ geometry:boundedCrop.geometry }, broadResult.path).valid) {
    throw new Error('Recast could not route across a broad triangle using bounded corridor generation.');
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

// Exercise the shipped viewer methods: pass-through metadata must survive
// material batching before collision export or the established raycasts run.
const viewer = readFileSync(new URL('../app/zoneviewer/ZoneViewerApp.js', import.meta.url), 'utf8');
const shippedMethod = (start, end) => {
    const from = viewer.indexOf(start);
    const to = viewer.indexOf(end, from);
    if (from < 0 || to < 0) throw new Error(`Cannot locate shipped viewer method ${start}`);
    return viewer.slice(from, to);
};
class MockMatrix {
    elements = identity;
    copy() { return this; }
}
class MockMesh {
    constructor(geometry, material) {
        this.isMesh = true;
        this.geometry = geometry;
        this.material = material;
        this.userData = {};
        this.matrix = new MockMatrix();
        this.matrixWorld = new MockMatrix();
    }
}
const geometryStub = () => ({
    attributes:{ position:attribute([0, 0, 0, 0, 0, 10, 10, 0, 0]) },
    index:indexAttribute([0, 1, 2]),
    boundingBox:{ getCenter:() => ({ x:1, y:0, z:1 }) },
    clone:() => geometryStub(),
    applyMatrix4() {}, clearGroups() {}, dispose() {},
    computeBoundingBox() {}, computeBoundingSphere() {}
});
const shipped = new Function('ht', 'A', 'ke', '$d', `return ({
    ${shippedMethod('prepareObject(object, isProp) {', 'materialRegistryKey(')},
    ${shippedMethod('collectZoneBatchRecords(e){', 'collectPropBatchRecords(')},
    ${shippedMethod('buildStaticBatches(e,t,n){', 'splitInstanceRecords(e){')},
    ${shippedMethod('createMergedBatch(e,t,n){', 'createFallbackMesh(')},
    ${shippedMethod('createFallbackMesh(e,t){', 'estimateParsedBytes(')}
});`)(MockMesh, class {}, MockMatrix, () => geometryStub());
const sharedMaterial = {};
const solidMesh = new MockMesh(geometryStub(), sharedMaterial);
const passMesh = new MockMesh(geometryStub(), sharedMaterial);
const passParent = group([passMesh], { passThrough:true });
const rawScene = group([solidMesh, passParent]);
const batchContext = {
    ...shipped,
    cloneMaterial:value => value,
    cloneAndBakeMeshGeometry:() => geometryStub(),
    materialBatchId:() => 1,
    geometryBatchSignature:() => 'fixture',
    splitMergeRecords:records => [records]
};
batchContext.prepareObject(rawScene, false);
if (!solidMesh.userData.eqlCollision || passMesh.userData.eqlCollision) {
    throw new Error('Viewer preparation did not retain inherited pass-through metadata.');
}
const records = batchContext.collectZoneBatchRecords(rawScene);
const batches = [];
batchContext.buildStaticBatches(records.batchable, { add:mesh => batches.push(mesh) }, false);
if (batches.length !== 2 || batches.filter(mesh => mesh.userData.eqlCollision).length !== 1) {
    throw new Error('Viewer batching merged pass-through faces into solid collision geometry.');
}
const passRecord = records.batchable.find(record => record.collision === false);
if (!passRecord || batchContext.createFallbackMesh(passRecord, false).userData.eqlCollision) {
    throw new Error('Viewer merge fallback reintroduced pass-through collision geometry.');
}
const exportedBatches = await exportViewerCollisionGeometry(group(batches));
if (exportedBatches?.stats.triangles !== 1) {
    throw new Error('The exported viewer batches included pass-through triangles.');
}

const establishedApp = { navigationBuildToken:1, findNavigationPath:async () => route };
const establishedStates = [];
installEstablishedRouteGuard(establishedApp, {
    getGeometry:() => exported,
    getZoneIdentity:() => 'fixture',
    onState:state => establishedStates.push(state)
});
if (await establishedApp.findNavigationPath(route[0], route.at(-1), 1) !== route || establishedStates.at(-1)?.status !== 'ready') {
    throw new Error('Established route guard did not retain a supported route.');
}
const climbPath = [{ x:0, y:0, z:0 }, { x:0, y:20, z:0 }];
const climbApp = { navigationBuildToken:1, findNavigationPath:async () => climbPath };
installEstablishedRouteGuard(climbApp, { getGeometry:() => exported, getZoneIdentity:() => 'fixture' });
if (await climbApp.findNavigationPath(climbPath[0], climbPath[1], 1) !== null) {
    throw new Error('Established route guard allowed a same-planar-position ascent to be displayed.');
}
let releaseGeometry;
const waitingGeometry = new Promise(resolve => { releaseGeometry = resolve; });
const staleApp = { navigationBuildToken:1, findNavigationPath:async () => route };
installEstablishedRouteGuard(staleApp, { getGeometry:() => waitingGeometry, getZoneIdentity:() => 'fixture' });
const pendingEstablished = staleApp.findNavigationPath(route[0], route.at(-1), 1);
await Promise.resolve();
staleApp.navigationBuildToken += 1;
releaseGeometry(exported);
if (await pendingEstablished !== null) throw new Error('Established route validation revived cancelled work.');

console.log('Viewer collision export, crop, winding, cancellation, drop, and Recast integration contracts passed.');
