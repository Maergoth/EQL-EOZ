import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EQLogParser } from '../app/parser.js';
import { formatWorldLocationForGameMap, formatWorldLocationForPlayer } from '../app/coordinate-system.js';
import { resolveZoneRecord, viewerZoneName } from '../app/zone-identity.js';

const source = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const wrapper = readFileSync(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
function between(source, start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert(from >= 0 && to > from, `Missing tested source boundary: ${start}`);
    return source.slice(from, to);
}

const zones = [
    { name:'Mistmoore Castle', viewerName:'Mistmoore Castle', aliases:['mistmoore'] },
    { name:'Befallen', viewerName:'Befallen', aliases:['befallen'] },
    { name:'North Ro', viewerName:'North Ro', aliases:['nro'] },
    { name:'The Temple of Cazic Thule', aliases:['cazicthule'] },
    { name:'The Temple of Cazic Thule (revamped)', aliases:['cazicthule_revamp'] }
];
assert.equal(resolveZoneRecord(zones, 'The Castle of Mistmoore').name, 'Mistmoore Castle');
assert.equal(resolveZoneRecord(zones, 'The Castle of Mistmoore 1595 (mistmoore)').name, 'Mistmoore Castle');
assert.equal(viewerZoneName('The Castle of Mistmoore'), 'Mistmoore Castle');
assert.equal(resolveZoneRecord(zones, 'The Northern Desert of Ro').name, 'North Ro');
assert.equal(resolveZoneRecord(zones, 'The Temple of Cazic Thule').name, 'The Temple of Cazic Thule');
assert.equal(resolveZoneRecord(zones, 'cazicthule_revamp').name, 'The Temple of Cazic Thule (revamped)');
assert.equal(resolveZoneRecord(zones, 'Temple of Cazic'), null, 'Ambiguous partial names cannot select a historical variant');
assert.equal(resolveZoneRecord(zones, 'Unknown Zone'), null);

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function harness() {
    const parser = new EQLogParser();
    parser.setCharacterFromFilename('eqlog_Synthetic_example.txt');
    const nodes = new Map();
    const node = selector => {
        if (!nodes.has(selector)) nodes.set(selector, { textContent:'', title:'', className:'', disabled:false });
        return nodes.get(selector);
    };
    const viewer = {
        zone:'', loadResult:{ ok:true }, calls:[], locations:[], clears:0,
        status() { return { zone:this.zone }; },
        async loadZone(name) { this.calls.push(name); if (this.loadResult.ok) this.zone = name; return this.loadResult; },
        syncLocation(location) { this.locations.push({ ...location }); return { ok:true, mode:'top' }; },
        clearPlayerLocation() { this.clears++; return {ok:true}; }
    };
    const operations = [];
    const context = vm.createContext({
        parser, pack:{ zones }, normalizedZoneKeys:new Map(), resolveZoneRecord, formatWorldLocationForPlayer,
        settings:{ mapMode:'top' }, bridgeInfo:{ eqRootExists:true, logExists:true,eqRootPath:'synthetic-root-a',logPath:'eqlog_Synthetic_example.txt' },mapDataRevision:0,
        viewerFolderStatus:'ready', viewerZoneState:{ zone:'', status:'idle', message:'' },
        partialLine:'', activeRoute:null, renderedRareViewerKey:'', pendingViewerLocation:null,latestLocationSync:null,
        overlaySession:{ inputs:[], consume(event, context) { this.inputs.push({ event, context }); }, flush() {} },
        wikiDiscovery:{consume() {}},
        observedLogCursor:0,captureWorkspace:{consumeLog() {}},
        $:node, state:() => parser.snapshot(), viewerApi:() => viewer,
        waitForViewerApi:async () => viewer, ensureViewerFolderConnected:async () => true,
        queueViewerSync:operation => { const pending = operation(); operations.push(pending); return pending; },
        queueLatestLocationSync:location => { operations.push(context.syncLocationToViewer(false, location)); },
        scheduleRouteRefresh() {}, syncRareMobsToViewer() {}, showNotice() {},
        clearActiveRoute() {}, focusIntelForConsider() {}, setActiveMapMode() {}, applyRouteGuidance() {}
    });
    const code = [
        between(source, 'function mapSourceContext(', 'async function pollLog('),
        between(source, 'function zoneRecord(', 'function npcNameKey('),
        between(source, 'function consumeText(', 'function state('),
        between(source, 'function renderMapReadiness(', 'function renderViewPanel('),
        between(source, 'function mapReadinessMessage(', 'function queueViewerSync('),
        between(source, 'async function syncZoneToViewer(', 'function setActiveMapMode(')
    ].join('\n');
    vm.runInContext(code, context);
    return { context, parser, viewer, node, async consume(text) {
        context.consumeText(`${text}\n`);
        while (operations.length) await operations.shift();
        context.renderMapReadiness();
    } };
}

// Switching character/log/root invalidates positions even when the next
// character happens to be in the same zone. Run the real source owners and
// location sync across the preparation awaits instead of copying their guards.
function sourceOwners(h){
    const polls=[];
    Object.assign(h.context,{logOffset:0,nativeMapVisible:false,viewerFolderPath:'synthetic-root-a',
        whatsNew:{refresh(){}},mapDataLoader:{invalidations:0,invalidate(){this.invalidations++;}},
        document:{body:{classList:{contains(){return false;}}}},
        locationPollDelay:()=>100,schedulePoll:delay=>polls.push(delay),renderAll(){},renderLiveLocation(){},updateViewerFolderStatus(){}});
    vm.runInContext(between(source,'async function pollLog(', 'function consumeText(')+between(source,'async function applyLogSelection(', 'async function chooseEqFolder('),h.context);
    return polls;
}
for(const field of ['logPath','eqRootPath','mapDataRevision'])for(const phase of ['api','zone']){
    const h=harness(),blocked=deferred(),arrived=deferred();
    h.parser.zone='Mistmoore Castle';h.parser.location={x:12,y:34,z:56};h.viewer.zone='Mistmoore Castle';
    h.context.viewerZoneState={zone:'mistmoore castle',status:phase==='zone'?'idle':'ready'};
    if(phase==='api')h.context.waitForViewerApi=()=>{arrived.resolve();return blocked.promise;};
    else h.context.syncZoneToViewer=()=>{arrived.resolve();return blocked.promise;};
    const syncing=h.context.syncLocationToViewer(false,{...h.parser.location});await arrived.promise;
    if(field==='mapDataRevision')h.context.mapDataRevision++;
    else h.context.bridgeInfo[field]+='-changed';
    blocked.resolve(phase==='api'?h.viewer:true);
    assert.equal(await syncing,false,`${phase}/${field}: an old source sample is rejected in the same zone`);
    assert.equal(h.viewer.locations.length,0);
}
for(const change of ['log','root','both','mode-only']){
    const h=harness();sourceOwners(h);
    h.parser.zone='Mistmoore Castle';h.parser.location={x:12,y:34,z:56};h.context.pendingViewerLocation={x:12,y:34,z:56};
    const next={...h.context.bridgeInfo,logSelection:'manual'};
    if(change==='log'||change==='both')next.logPath='eqlog_Another_example.txt';
    if(change==='root'||change==='both')next.eqRootPath='synthetic-root-b';
    await h.context.applyLogSelection(next);
    const changed=change!=='mode-only';
    assert.equal(h.parser.location===null,changed,`${change}: only an actual source change clears coordinates`);
    assert.equal(h.context.pendingViewerLocation===null,changed);
    assert.equal(h.viewer.clears,changed?1:0);
    assert.equal(h.context.mapDataRevision,changed?1:0,'one source change invalidates the map generation once');
    assert.equal(h.context.mapDataLoader.invalidations,change==='root'||change==='both'?1:0);
}
{
    const h=harness();sourceOwners(h);h.parser.location={x:12,y:34,z:56};h.context.pendingViewerLocation={...h.parser.location};h.context.partialLine='Old source fragment';
    h.context.api=async()=>({logPath:'eqlog_Another_example.txt',logExists:true,text:'',newOffset:20});await h.context.pollLog();
    assert.equal(h.parser.character,'Another');assert.equal(h.parser.location,null);assert.equal(h.context.pendingViewerLocation,null);assert.equal(h.context.partialLine,'');assert.equal(h.context.mapDataRevision,1);assert.equal(h.viewer.clears,1,'automatic newest-log following clears the displayed player');
}
{
    const h=harness(),blocked=deferred();const polls=sourceOwners(h);
    h.context.api=()=>blocked.promise;const polling=h.context.pollLog();
    await h.context.applyLogSelection({...h.context.bridgeInfo,logPath:'eqlog_Another_example.txt'});
    blocked.resolve({logPath:'eqlog_Synthetic_example.txt',logExists:true,text:'Your Location is 1.00, 2.00, 3.00\n',newOffset:99});await polling;
    assert.equal(h.context.bridgeInfo.logPath,'eqlog_Another_example.txt','an old poll cannot revert a manual log selection');assert.equal(h.parser.location,null);assert.equal(h.context.logOffset,0);assert.equal(polls.at(-1),0,'a stale poll schedules a fresh read without advancing its offset');
}
{
    const h=harness(),blocked=deferred();const polls=sourceOwners(h);h.context.api=()=>blocked.promise;
    const polling=h.context.pollLog();await h.context.applyLogSelection({...h.context.bridgeInfo,logPath:'eqlog_Another_example.txt'});h.node('#bridge-status').textContent='Fresh source ready';
    blocked.reject(Error('Retired source failed'));await polling;assert.equal(h.node('#bridge-status').textContent,'Fresh source ready','a retired request failure cannot replace current-source feedback');assert.equal(polls.at(-1),0);
}
{
    const h=harness(),queued=[];let loads=0;
    h.context.queueViewerSync=operation=>{queued.push(operation);return Promise.resolve();};h.context.syncZoneToViewer=async()=>{loads++;return true;};
    h.context.consumeText('You have entered The Castle of Mistmoore.\nYour Location is 1.00, 2.00, 3.00\n');
    h.context.bridgeInfo.logPath='eqlog_Another_example.txt';h.context.clearSourceLocation();
    assert.equal(await queued.shift()(),false,'an old queued zone-and-location batch cannot gain the replacement source identity when it finally starts');assert.equal(loads,0);assert.equal(h.viewer.locations.length,0);
}
{
    const h=harness(),queued=[];h.parser.zone='Mistmoore Castle';h.viewer.zone='Mistmoore Castle';h.context.viewerZoneState={zone:'mistmoore castle',status:'ready'};
    h.context.queueViewerSync=operation=>{const gate=deferred();queued.push({operation,gate});return gate.promise;};
    vm.runInContext(between(source,'function queueLatestLocationSync(', 'async function waitForViewerApi('),h.context);
    const older=h.context.queueLatestLocationSync({x:1,y:2,z:3});h.context.bridgeInfo.logPath='eqlog_Another_example.txt';h.context.clearSourceLocation();
    h.parser.location={x:10,y:20,z:30};h.context.queueLatestLocationSync(h.parser.location);
    const retired=queued.shift();assert.equal(await retired.operation(),false);retired.gate.resolve(false);await older;
    const current=queued.shift();assert.ok(current,'the replacement pending sample is requeued under the current source');assert.equal(await current.operation(),true);current.gate.resolve(true);await Promise.resolve();
    assert.equal(h.viewer.locations.length,1);assert.deepEqual(h.viewer.locations[0],{x:10,y:20,z:30});
}

{
    const h = harness();
    const fresh = new Date().toUTCString();
    const stale = new Date(Date.now() - 60000).toUTCString();
    h.context.consumeText(`[${fresh}] You hit a synthetic rat for 11 points of damage.\n`);
    h.context.consumeText(`[${stale}] You hit a synthetic rat for 12 points of damage.\n`);
    h.context.consumeText('You hit a synthetic rat for 13 points of damage.\n');
    h.context.consumeText(`[${fresh}] You hit a synthetic rat for 14 points of damage.\n`, false);
    assert.deepEqual(h.context.overlaySession.inputs.map(input => input.context.live), [true, false, false, false],
        'Only fresh original timestamps in an appended live batch can drive timers; stale, missing timestamp and initial-tail events cannot.');
    assert.equal(h.parser.snapshot().totalDamage, 50, 'Timer freshness never discards normal parse history.');
}

{
    const h = harness();
    await h.consume('You have entered The Castle of Mistmoore.');
    assert.equal(h.parser.zone, 'Mistmoore Castle', 'Normal zoning selects the same catalog as the /who short name');
    assert.deepEqual(h.viewer.calls, ['Mistmoore Castle']);
    assert.equal(h.node('[data-readiness="zone"]').className, 'is-ready');
    assert.equal(h.node('[data-readiness="location"]').className, 'is-waiting');
    await h.consume('Your Location is -330.00, 120.00, -178.13');
    assert.equal(h.node('[data-readiness="location"]').className, 'is-ready');
    assert.equal(h.viewer.locations.length, 1);
    assert.equal(h.node('#map-subtitle').textContent, 'Synced to /loc -330.0, 120.0, -178.1 in Mistmoore Castle.',
        'Shell sync text uses the game display order instead of internal axes');
    await h.consume('[26 MNK/SHM/BER] Synthetic (Iksar) <Guild> ZONE: The Castle of Mistmoore 1595 (mistmoore)');
    assert.ok(h.parser.location, 'A confirming /who for the same zone retains its valid location');
    await h.consume('You have entered Befallen.');
    assert.equal(h.parser.location, null, 'Actual zoning invalidates coordinates from the previous map');
    assert.equal(h.node('[data-readiness="location"]').className, 'is-waiting');
    await h.consume('Your Location is -30.00, -961.00, -66.00');
    assert.equal(h.viewer.locations.at(-1).z, -66);
}

{
    const h = harness();
    await h.consume('You have entered The Castle of Mistmoore.');
    await h.consume('Your Location is -330.00, 120.00, -178.13');
    const previousCalls = h.viewer.locations.length;
    const pending = h.context.syncLocationToViewer(false, { ...h.parser.location });
    h.parser.zone = 'Befallen';
    h.parser.location = null;
    assert.equal(await pending, false, 'An awaited old-zone sample cannot win after a zone change');
    assert.equal(h.viewer.locations.length, previousCalls);
}

{
    const h = harness();
    h.viewer.zone = 'Befallen';
    h.viewer.loadResult = { ok:false, reason:'zone-not-found' };
    await h.consume('You have entered Unknown Zone.');
    await h.consume('Your Location is -5.00, 6.00, 7.00');
    assert.equal(h.node('[data-readiness="zone"]').className, 'is-waiting', 'A failed zone load cannot appear ready');
    assert.equal(h.node('[data-readiness="location"]').className, 'is-blocked', 'A fresh /loc cannot bypass a failed zone load');
    assert.equal(h.node('#sync-zone').disabled, false, 'Retry stays available after a failed load');
    assert.equal(h.viewer.locations.length, 0, 'A previous map may not accept the new zone location');
    assert.match(h.context.mapReadinessMessage(), /could not match Unknown Zone/);
}

// Late failures, including exceptions during preparation and retry, cannot
// overwrite the successful newer zone's readiness or its visible status.
for (const phase of ['api', 'folder', 'load', 'retry-folder', 'retry-load']) {
for (const outcome of ['failure', 'exception']) {
    const h = harness();
    const blocked = deferred();
    const arrived = deferred();
    let folderCalls = 0, loadCalls = 0, apiCalls = 0;
    h.context.waitForViewerApi = async () => {
        if (phase === 'api' && ++apiCalls === 1) { arrived.resolve(); return blocked.promise; }
        return h.viewer;
    };
    h.context.ensureViewerFolderConnected = async () => {
        folderCalls += 1;
        if (phase === 'folder' && folderCalls === 1 || phase === 'retry-folder' && folderCalls === 2) {
            arrived.resolve(); return blocked.promise;
        }
        return true;
    };
    h.viewer.loadZone = async name => {
        loadCalls += 1;
        if (phase.startsWith('retry-') && loadCalls === 1) return { ok:false, reason:'select-eq-folder-first' };
        if (phase === 'load' && loadCalls === 1 || phase === 'retry-load' && loadCalls === 2) {
            arrived.resolve(); return blocked.promise;
        }
        h.viewer.zone = name;
        return { ok:true };
    };
    h.parser.zone = 'Mistmoore Castle';
    const older = h.context.syncZoneToViewer(false);
    await arrived.promise;
    h.parser.zone = 'Befallen';
    assert.equal(await h.context.syncZoneToViewer(false), true);
    const newestState = h.context.viewerZoneState;
    const newestMessage = h.node('#map-subtitle').textContent;
    if (outcome === 'exception') blocked.reject(new Error('Synthetic late failure'));
    else blocked.resolve(phase === 'api' ? null : phase.includes('folder') ? false : { ok:false, reason:'load-failed' });
    assert.equal(await older, false, `${phase}/${outcome}: stale preparation exits`);
    assert.equal(h.context.viewerZoneState, newestState, `${phase}/${outcome}: newer request retains state ownership`);
    assert.equal(h.context.viewerZoneState.status, 'ready');
    assert.equal(h.node('#map-subtitle').textContent, newestMessage);
}
}

// Execute the actual route owner across each preparation await. Cancel and
// replacement must abort before clearing/routing and before mutating a newer
// route, including cancellation while the presentation update is pending.
for (const phase of ['api', 'folder', 'zone', 'location', 'path', 'view']) {
for (const action of ['cancel', 'replace', 'zone-change']) {
    const blocked = deferred();
    const arrived = deferred();
    const calls = [];
    const route = { name:'Synthetic destination', zone:'Mistmoore Castle' };
    const snapshot = { zone:'Mistmoore Castle', location:{ x:12, y:34, z:56 } };
    const waitAt = async (name, result) => {
        if (phase === name) { arrived.resolve(); await blocked.promise; }
        return result;
    };
    const api = {
        status:() => ({ zone:'Mistmoore Castle' }),
        clearPath() { calls.push('clear'); },
        pathTo:async () => { calls.push('path'); return waitAt('path', { ok:true, routed:true, distance:20 }); },
        setView:async () => waitAt('view', { ok:true })
    };
    const context = vm.createContext({
        activeRoute:route, routeRequestSerial:0, routeRefreshTimer:null, pack:{ meta:{ schemaVersion:3 } },
        settings:{ mapMode:'top' }, state:() => snapshot,
        zoneKey:value => String(value).toLowerCase(), npcNameKey:value => String(value).toLowerCase(),
        clearTimeout, renderMapRoutePlanner() {}, showNotice() {},
        waitForViewerApi:() => waitAt('api', api),
        ensureViewerFolderConnected:() => waitAt('folder', true),
        syncZoneToViewer:() => waitAt('zone', true),
        syncLocationToViewer:() => waitAt('location', true),
        npcRecordForName:() => ({ loc:[1, 2, 3] }), wikiLocationToWorld:value => value,
        routeDistanceLabel:String, applyRouteGuidance() {},
        setActiveMapMode() { calls.push('active-mode'); }, scheduleRouteRefresh() { calls.push('refresh'); }
    });
    vm.runInContext(between(source, 'async function calculateActiveRoute(', 'async function pathToNpc('), context);
    const pending = context.calculateActiveRoute();
    await arrived.promise;
    const previousCalls = [...calls];
    if (action === 'zone-change') snapshot.zone = 'Befallen';
    else {
        context.activeRoute = action === 'cancel' ? null : { name:'New destination', zone:'Mistmoore Castle', status:'waiting' };
        context.routeRequestSerial += 1;
    }
    blocked.resolve();
    assert.equal(await pending, false, `${phase}/${action}: superseded route exits without throwing`);
    assert.deepEqual(calls, previousCalls, `${phase}/${action}: no stale route or presentation effects after cancellation`);
    if (action === 'replace') assert.equal(context.activeRoute.status, 'waiting', 'A previous route cannot mutate the replacement');
}
}

for (const outcome of ['load-failure', 'same-zone-supersession']) {
    const h = harness();
    const blocked = deferred(), arrived = deferred();
    let loadCalls = 0, refreshCount = 0;
    h.parser.zone = 'Mistmoore Castle';
    h.parser.location = { x:12, y:34, z:56 };
    Object.assign(h.context, {
        activeRoute:{ name:'Synthetic destination', zone:'Mistmoore Castle' },
        routeRequestSerial:0, routeRefreshTimer:null, ROUTE_REFRESH_DISTANCE:8,
        npcNameKey:value => String(value).toLowerCase(),
        clearTimeout() {}, setTimeout() { refreshCount += 1; return refreshCount; },
        renderMapRoutePlanner() {}
    });
    vm.runInContext(between(source, 'function locationDistance(', 'function clearActiveRoute(') +
        between(source, 'function scheduleRouteRefresh(', 'async function pathToNpc('), h.context);
    h.viewer.loadZone = async name => {
        loadCalls += 1;
        if (outcome === 'load-failure') return { ok:false, reason:'load-failed' };
        if (loadCalls === 1) { arrived.resolve(); return blocked.promise; }
        h.viewer.zone = name;
        return { ok:true };
    };
    const pending = h.context.calculateActiveRoute();
    if (outcome === 'same-zone-supersession') {
        await arrived.promise;
        assert.equal(await h.context.syncZoneToViewer(false), true);
        blocked.resolve({ ok:true });
    }
    assert.equal(await pending, false);
    assert.equal(h.context.activeRoute.status, 'error', `${outcome}: preparation settles instead of remaining working`);
    assert.match(h.context.activeRoute.message, /destination is still saved/);
    h.context.scheduleRouteRefresh({ x:32, y:34, z:56 });
    assert.equal(refreshCount, 1, `${outcome}: later movement can schedule another route attempt`);
}

{
    // The real wrapper must preserve raw /loc text while the camera uses a
    // nearby grounded surface. Frame, pan, and mode updates call this method.
    const context = vm.createContext({
        app:{ currentZoneRecord:{ id:'synthetic', format:'S3D' }, els:{ coord:{ textContent:'' } },
            updateCoordinateHud() { this.els.coord.textContent = 'Map X -330.00 Y 120.00 Z -181.94'; } },
        lastSyncedLocation:{ x:120, y:-330, z:-178.13 }, loadedZoneIdentity:'synthetic:S3D',
        formatWorldLocationForGameMap
    });
    vm.runInContext(between(wrapper, 'const originalUpdateCoordinateHud =', 'const headingTracker ='), context);
    context.app.updateCoordinateHud(true);
    assert.equal(context.app.els.coord.textContent, 'Map X -330.00  Y 120.00  Z -178.13');
    context.app.currentZoneRecord = { id:'another', format:'S3D' };
    context.app.updateCoordinateHud(true);
    assert.match(context.app.els.coord.textContent, /-181\.94$/, 'An earlier zone cannot override a new zone readout');
}

console.log('Zone matching, map readiness, cross-zone/source location freshness, retired poll/queued-sample rejection and raw /loc HUD checks passed.');
