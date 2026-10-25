import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { clientMapToViewer, worldToClientMap, worldToViewer } from '../app/coordinate-system.js';

// Exercise the actual desktop wrapper with the shipped viewer's label router.
// All points, collision responses, and DOM nodes are synthetic; no client files
// or wiki pack are needed to catch a mismatch between these two boundaries.
const wrapper = readFileSync(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
const viewer = readFileSync(new URL('../app/zoneviewer/ZoneViewerApp.js', import.meta.url), 'utf8');

function between(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert(from >= 0 && to > from, `Missing tested source boundary: ${start}`);
    return source.slice(from, to);
}

class Point {
    constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); }
    clone() { return new Point(this.x, this.y, this.z); }
    set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
    copy(point) { return this.set(point.x, point.y, point.z); }
    add(point) { this.x += point.x; this.y += point.y; this.z += point.z; return this; }
    distanceToSquared(point) { return (this.x - point.x) ** 2 + (this.y - point.y) ** 2 + (this.z - point.z) ** 2; }
    distanceTo(point) { return Math.sqrt(this.distanceToSquared(point)); }
}

function node() {
    return { dataset:{}, style:{}, attributes:{},setAttribute(key,value){this.attributes[key]=String(value);},classList:{ toggle() {} }, append() {}, replaceChildren() {}, addEventListener() {} };
}

function harness({ realModeTransitions = false } = {}) {
    const calls = [];
    const candidates = [];
    const candidateCancellations = [];
    const app = {
        currentZoneRecord:{ id:'synthetic', format:'S3D' },
        currentBounds:{ max:{ y:200 } },
        currentStart:new Point(4, -20, 6),
        mode:'top', mapFileVisible:true, mapData:{ lines:[{}] },
        navigationBuildToken:0, navigationPath:[], gotoNpcEntries:[],
        els:{ namedMobs:{ checked:true }, gotoNpc:{ value:'' }, statusText:{ textContent:'' } },
        eqWorldToThree(x, y, z) { const point = worldToViewer({ x, y, z }); return new Point(point.x, point.y, point.z); },
        eqMapToThree(x, y, z) { const point = clientMapToViewer({ x, y, z }); return new Point(point.x, point.y, point.z); },
        threeToEq(point) { return { x:point.z, y:-point.x, z:point.y }; },
        findGroundPointAt(x, z, y) { return new Point(x, y > 200 ? -20 : y, z); },
        navigationStartPoint() { return this.currentStart.clone(); },
        clearNavigationGuide() { this.navigationBuildToken += 1; this.navigationTarget = null; this.navigationPath = []; },
        setNavigationBuildActive() {}, addNavigationBeam() {}, updateNavigationOverlay() {}, requestRender() {}, updateNamedMobLabels() {},
        setGameMapVisible(value) { this.mapFileVisible = value; },
        setMode(value) { this.mode = value; },
        setStatus(value) { this.els.statusText.textContent = value; },
        async findNavigationPath(start, goal, token) {
            calls.push({ start:start.clone(), goal:goal.clone(), token });
            if (this.pendingRoute) return this.pendingRoute;
            return [start.clone(), goal.clone()];
        },
        addNavigationPath(path) { this.navigationPath = path; }
    };
    if (realModeTransitions) {
        app.zoneGroup = { children:[{}] };
        app.findGroundPointAt = (x, z) => new Point(x, -20, z);
        app.setGameMapVisible = value => { app.mapFileVisible = value; if (value) app.mode = 'top'; };
        app.els.top = { disabled:false };
        app.fp = { eyeHeight:6, maxStepUp:6, activate() {} };
        app.perspective = app.camera = { position:app.currentStart.clone().add({ x:0, y:6, z:0 }), up:new Point(), lookAt() {} };
        app.orbit = {};
        app.configureModeControls = mode => { app.mode = mode; };
        app.captureCameraState = () => ({ position:app.camera.position.clone() });
        app.restoreCameraState = state => { if (!state) return false; app.camera.position.copy(state.position); return true; };
        app.resetTopView = () => {};
        app.getTopFitBounds = () => ({ getCenter:() => new Point() });
        app.findFirstPersonSpawn = () => (app.lastPick || app.currentStart).clone().add({ x:0, y:6, z:0 });
        app.captureFirstPersonPose = () => {
            app.lastFirstPersonPose = { position:app.camera.position.clone().add({ x:0, y:-6, z:0 }), forward:new Point(0, 0, -1) };
        };
        app.resize = app.updateCoordinateHud = app.drawMiniMap = () => {};
    }
    const context = vm.createContext({
        overlayMode:false,
        app, A:Point, worldToClientMap, document:{ createElement:node, createTextNode:value => value },
        rareLayer:node(), renderRareMobs() {}, renderRouteGuidance() {},
        navigationResult(label, source) { return { ok:true, label, source }; },
        cancelCandidateRoute(reason) { candidateCancellations.push(reason); },
        scheduleCandidateRoute() { candidates.push(app.navigationTarget?.requestStart?.clone()); },
        hf:async () => {},
        window:{ parent:{ postMessage() {} }, location:{ origin:'http://127.0.0.1' } }
    });
    const helpers = between(wrapper, 'function currentPresentation()', 'function currentRouteGuidance()') +
        between(wrapper, 'function clearRareMobs()', 'function renderRareMobs()') +
        between(wrapper, 'function normalizedNpcName(', 'let collisionExportSerial') +
        between(wrapper, 'function syncedNavigationGround()', '// The camera is grounded');
    const methods = between(wrapper, '    setRareMobs(records = []) {', '    setActiveRareMob(') +
        between(wrapper, '    async pathTo(label, wikiLocation = null) {', '    clearPath()');
    const goto = between(viewer, 'async gotoNpcLabel(', 'updateNamedMobLabels(){');
    const modes = realModeTransitions ? between(viewer, 'setMode(e){', 'resetTopView(){') : '';
    const navigationStart = realModeTransitions ? between(viewer, 'navigationStartPoint(){', 'addNavigationBeam(') : '';
    vm.runInContext(`let rareGotoEntries = [], rareMobMarkers = [], activeRareMob = '';
        let lastSyncedLocation = null, lastSyncedGround = null, loadedZoneIdentity = 'synthetic:S3D';
        ${realModeTransitions ? `Object.assign(app, { ${modes}, ${navigationStart} });` : ''}
        ${helpers}
        app.gotoNpcLabel = ({ ${goto} }).gotoNpcLabel;
        globalThis.api = { ${methods} };
        globalThis.markers = () => rareMobMarkers;
        globalThis.syncGround = point => {
            lastSyncedLocation = point ? {} : null;
            lastSyncedGround = point?.clone() || null;
        };`, context);
    return { app, calls, candidates, candidateCancellations, api:context.api, markers:context.markers, syncGround:context.syncGround };
}

function coordinates(point) { return { x:point.x, y:point.y, z:point.z }; }

for (const mode of ['first', 'top', 'map']) {
for (const location of [[41, -73, -20], [-52, 89, 16], [41, -73]]) {
    const h = harness();
    h.app.mode = mode === 'map' ? 'top' : mode;
    h.app.mapFileVisible = mode === 'map';
    h.api.setRareMobs([{ name:'Synthetic Sentinel', loc:location }]);
    const marker = h.markers()[0];
    const entry = h.app.gotoNpcEntries[0];
    const target = h.app.eqMapToThree(entry.point.x, entry.point.y, entry.point.z);
    assert.deepEqual(coordinates(target), { x:marker.position.x, y:marker.eqZ, z:marker.position.z },
        'A wiki marker and its injected map-label destination must occupy the same viewer point');
    await h.api.pathTo('Synthetic Sentinel', location);
    assert.deepEqual(coordinates(h.calls[0].goal), coordinates(target));
    assert.equal(h.app.mapFileVisible ? 'map' : h.app.mode, mode, 'Routing preserves the selected presentation');
    assert.equal(h.candidates.length, 1);
}
}

// A second call for the same destination must use the newest request position,
// including map labels with no wiki coordinates and direct wiki fallbacks.
for (const source of ['wiki-marker', 'map-label', 'wiki-fallback']) {
    const h = harness();
    const location = [41, -73, -20];
    if (source === 'wiki-marker') h.api.setRareMobs([{ name:'Synthetic Sentinel', loc:location }]);
    if (source === 'map-label') {
        h.app.gotoNpcEntries.push({ label:'Synthetic Sentinel', rawLabel:'Synthetic Sentinel', search:'synthetic sentinel',
            point:{ ...worldToClientMap({ x:41, y:-73, z:-20 }), label:'Synthetic Sentinel', size:2 } });
    }
    const fallback = source === 'map-label' ? null : location;
    await h.api.pathTo('Synthetic Sentinel', fallback);
    h.app.currentStart = new Point(30, -20, 19);
    await h.api.pathTo('Synthetic Sentinel', fallback);
    assert.equal(h.calls.length, 2, `${source}: movement must refresh the same destination`);
    assert.deepEqual(coordinates(h.calls[1].start), coordinates(h.app.currentStart));
    assert.deepEqual(coordinates(h.candidates.at(-1)), coordinates(h.app.currentStart));
    assert.equal(h.app.mapFileVisible, true);
    await h.api.pathTo('Synthetic Sentinel', fallback);
    assert.equal(h.calls.length, 2, 'An unchanged start and destination reuse the completed route');
}

// A cancelled or superseded map request may not restart through wiki fallback
// or schedule a stale spatial candidate after its worker returns.
for (const action of ['cancel', 'replace']) {
    const h = harness();
    h.api.setRareMobs([{ name:'Synthetic Sentinel', loc:[41, -73, -20] }]);
    let finish;
    h.app.pendingRoute = new Promise(resolve => { finish = resolve; });
    const pending = h.api.pathTo('Synthetic Sentinel', [41, -73, -20]);
    assert.deepEqual(h.candidateCancellations, ['rerouting'], 'Prior candidate is invalidated before awaiting the line worker');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, 1);
    h.app.clearNavigationGuide();
    if (action === 'replace') h.app.navigationTarget = { key:'new-destination', label:'New destination' };
    finish(null);
    const result = await pending;
    assert.equal(result.ok, false, `${action}: stale request must fail without fallback`);
    assert.equal(h.calls.length, 1, `${action}: stale request must not launch another route`);
    assert.equal(h.candidates.length, 0);
    assert.equal(h.app.navigationTarget?.key ?? null, action === 'replace' ? 'new-destination' : null);
}

{
    const h = harness();
    h.api.setRareMobs([{ name:'Synthetic Sentinel', loc:[41, -73, -20] }]);
    const pending = h.api.pathTo('Synthetic Sentinel', [41, -73, -20]);
    h.app.clearNavigationGuide();
    assert.equal((await pending).ok, false, 'Cancelling before the viewer frame yield cannot restart the target');
    assert.equal(h.app.navigationTarget, null);
    assert.equal(h.candidates.length, 0);
}

console.log('Wiki/map destination alignment, same-target rerouting, presentation, and stale/cancel contracts passed.');

// The actual vendor mode switch spawns First at lastPick. A route stores its
// destination there, so routing again from Top/Map previously used that old
// destination as the new player's start and could produce a zero-length line.
for (const mode of ['top', 'map']) {
    const h = harness({ realModeTransitions:true });
    const loggedStart = h.app.currentStart.clone();
    h.app.mode = 'top';
    h.app.mapFileVisible = mode === 'map';
    h.app.lastFirstPersonPose = { position:loggedStart.clone(), forward:new Point(0, 0, -1) };
    h.syncGround(loggedStart);
    h.api.setRareMobs([
        { name:'Synthetic first target', loc:[41, -73, -20] },
        { name:'Synthetic second target', loc:[41, -73, -20] }
    ]);
    await h.api.pathTo('Synthetic first target');
    h.app.clearNavigationGuide();
    // Model the shipped viewer's poisoned pose independently of the pose
    // preservation fix; routing must still trust the current logged sample.
    h.app.lastFirstPersonPose.position = new Point(73, -20, 41);
    await h.api.pathTo('Synthetic second target');
    assert.equal(h.calls.length, 2);
    assert.deepEqual(coordinates(h.calls[1].start), coordinates(loggedStart), `${mode}: replacement retains the logged start`);
    assert(h.calls[1].start.distanceTo(h.calls[1].goal) > 1, `${mode}: replacement cannot become a zero-length route at the goal`);
    assert.deepEqual(coordinates(h.app.lastFirstPersonPose.position), coordinates(loggedStart), `${mode}: arrow remains at the logged position`);
    assert.deepEqual(coordinates(h.app.lastPick), coordinates(loggedStart), `${mode}: later First spawns at the logged position`);
    assert.equal(h.app.mapFileVisible ? 'map' : h.app.mode, mode);
    h.app.setMode('first');
    assert.deepEqual(coordinates(h.app.lastFirstPersonPose.position), coordinates(loggedStart), 'Entering First later uses the logged position');
    h.app.setMode('top');

    const movedStart = new Point(30, -20, 19);
    h.syncGround(movedStart);
    await h.api.pathTo('Synthetic second target');
    assert.deepEqual(coordinates(h.calls.at(-1).start), coordinates(movedStart), 'Newer logged movement wins');
    const clone = h.app.navigationStartPoint();
    clone.x += 100;
    assert.deepEqual(coordinates(h.app.navigationStartPoint()), coordinates(movedStart), 'Callers cannot mutate the stored log position');

    h.app.currentZoneRecord = { id:'another', format:'S3D' };
    h.app.lastFirstPersonPose = { position:new Point(7, -20, 9), forward:new Point(0, 0, -1) };
    assert.deepEqual(coordinates(h.app.navigationStartPoint()), { x:7, y:-20, z:9 }, 'A different zone cannot reuse the previous log position');
    h.app.currentZoneRecord = { id:'synthetic', format:'S3D' };
    h.syncGround(null);
    assert.deepEqual(coordinates(h.app.navigationStartPoint()), { x:7, y:-20, z:9 }, 'Unsynced manual navigation retains the vendor start behavior');
}

{
    const h = harness({ realModeTransitions:true });
    const loggedStart = h.app.currentStart.clone();
    h.app.mode = 'top'; h.app.mapFileVisible = false;
    h.app.lastFirstPersonPose = { position:loggedStart.clone(), forward:new Point(0, 0, -1) };
    h.syncGround(loggedStart);
    h.api.setRareMobs([{ name:'Synthetic awaited target', loc:[41, -73, -20] }]);
    let finish;
    h.app.pendingRoute = new Promise(resolve => { finish = resolve; });
    const pending = h.api.pathTo('Synthetic awaited target');
    await new Promise(resolve => setImmediate(resolve));
    const newest = new Point(30, -20, 19);
    h.syncGround(newest);
    h.app.lastFirstPersonPose.position = newest.clone();
    finish([loggedStart, new Point(73, -20, 41)]);
    await pending;
    assert.deepEqual(coordinates(h.app.lastFirstPersonPose.position), coordinates(newest), 'A completing old request cannot restore an earlier logged pose');
}
console.log('Actual vendor camera transitions retain current-zone logged route starts, player poses, and manual fallback.');
