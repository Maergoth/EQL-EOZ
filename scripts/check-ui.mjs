import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const textExtensions = new Set(['.md', '.js', '.cjs', '.mjs', '.json', '.html', '.css', '.php', '.sh', '.txt', '.yml', '.yaml']);
const ignoredDirectories = new Set(['.git', 'dist', 'node_modules', 'THIRD_PARTY']);
const ignoredContentFiles = new Set(['eye-of-zomm-pack.bootstrap.json']);
const files = [];

function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes:true })) {
        if (entry.isDirectory()) {
            if (!ignoredDirectories.has(entry.name)) visit(join(directory, entry.name));
        } else if (!ignoredContentFiles.has(entry.name) && textExtensions.has(extname(entry.name).toLowerCase())) {
            files.push(join(directory, entry.name));
        }
    }
}
visit(root);

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const retiredName = new RegExp(`\\b${'com' + 'panion'}\\b`, 'i');
    if (retiredName.test(text)) throw new Error(`Retired product wording remains in ${file.slice(root.length + 1)}.`);
}

const html = readFileSync(join(root, 'app/index.html'), 'utf8');
for (const required of ['id="top-classes"', 'data-map-mode="first"', 'data-map-mode="top"', 'data-map-mode="map"', 'id="map-source-status"', 'id="map-readiness"', 'id="map-destination"', 'id="route-status"', 'id="settings-routing-enabled"', 'id="overlay-controller"', 'id="settings-eq-root"', 'id="settings-map-status"', 'id="export-diagnostics"', 'id="item-current-zone"', 'id="item-slot"', 'id="item-sort"', 'id="item-context"', 'id="settings-minimize-to-tray"', 'id="settings-start-minimized"', 'id="titlebar-version"', 'id="toast-region"']) {
    if (!html.includes(required)) throw new Error(`Required UI element is missing: ${required}`);
}
for (const removed of ['id="minimal-route-form"', 'id="minimal-map-destination"', 'id="minimal-start-route"', 'id="minimal-clear-route"', 'id="pin-window"', 'id="settings-pin-window"', 'id="desktop-titlebar"']) {
    if (html.includes(removed)) throw new Error(`Removed minimal route search is still present: ${removed}`);
}
for (const removed of ['CURRENT TARGET', 'Last /location', 'id="settings-server"']) {
    if (html.includes(removed)) throw new Error(`Removed UI copy remains: ${removed}`);
}

const desktop = readFileSync(join(root, 'desktop/main.cjs'), 'utf8');
for (const required of ['frame: true', 'skipTaskbar: false']) {
    if (!desktop.includes(required)) throw new Error(`Normal main-window behavior is missing: ${required}`);
}
if (/setAlwaysOnTop|always-on-top/.test(desktop)) throw new Error('Main-window pin behavior must remain removed.');

const viewer = readFileSync(join(root, 'app/zoneviewer/viewer.html'), 'utf8');
for (const required of ['setView(mode)', 'installZoneLoadGuard(app, {', 'zoneLoadGuard.isReady(selected)', 'app.currentZoneRecord.id !== selected.id', 'app.currentZoneRecord.format !== selected.format', 'selectViewerZoneOption(select.options, zoneName)', 'selectedFloorIndices?.clear?.()', 'app.eqWorldToThree', 'lastSyncedLocation', 'lastSyncedGround', "from './player-state.js'", 'installViewerPlayerState({app,root,externalSlice:overlayMode})', 'playerState.observe(sample,{heading:movement.heading})', 'const ground = observation.ground', 'clearPlayerLocation()', 'focusTopViewAt(lastSyncedGround)', 'headingTracker.push', 'setRareMobs(records = [])', 'eoz-rare-mob-selected', 'eyeOfZommHasZoneArchives', "reason:'no-zone-archives'", 'routeGuidance', 'renderRouteGuidance', 'navigationResult', 'clearPath()']) {
    if (!viewer.includes(required)) throw new Error(`Map integration check is missing: ${required}`);
}
const playerState = readFileSync(join(root, 'app/zoneviewer/player-state.js'), 'utf8');
for (const required of ['knownViewerLocation', 'findGroundPointAt?.(point.x,point.z,point.y)', 'ground=(grounded?probe:point).clone()', "ring.name='eoz-player-ground-marker'", 'setAutoZ', 'clear()']) {
    if (!playerState.includes(required)) throw new Error(`Shared player marker integration check is missing: ${required}`);
}
if (!viewer.includes("type:'eoz-route-cancelled'")) throw new Error('Viewer cancel does not notify the route owner.');
for (const required of ['exportViewerCollisionGeometry', 'cropCollisionGeometryForRoute', 'scheduleCandidateRoute', 'resetSpatialRouteState', "type:'eoz-route-candidate-ready'", 'spatial:{']) {
    if (!viewer.includes(required)) throw new Error(`Spatial candidate integration is missing: ${required}`);
}

const application = readFileSync(join(root, 'app/app.js'), 'utf8');
if(!application.includes('catalogItemboxMarkup'))throw new Error('Main item hovers must use the shared wiki Itembox renderer.');
if (!application.includes("event.data?.type === 'eoz-route-cancelled'") || !application.includes('clearActiveRoute({ clearViewer:false })')) {
    throw new Error('Route cancellation can still be restarted by automatic rerouting.');
}
for (const required of ['npcNameKey(sourceName)', 'ensureViewerFolderConnected', 'mapReadinessMessage', 'renderMapReadiness', 'mapDestinationNames', 'rareMobsForZone', 'rareCatalogCache', 'syncRareMobsToViewer', 'queueLatestLocationSync', 'pendingViewerLocation', 'renderLiveLocation', 'scheduleRouteRefresh', 'ROUTE_REFRESH_DISTANCE', 'applyRouteGuidance', 'buildDiagnosticSnapshot', 'exportDiagnostics', "result.source === 'map-label' ? 'local map label' : 'EQLWiki location'", 'itemBrowsePriority', 'catalogItemboxMarkup', 'focusIntelForConsider', "action === 'session:intel-drops'", "action === 'session:map-data'", 'showNotice', 'waypointCommandForWorldLocation', 'bindWaypointButtons', 'writeClipboardText', 'routeDestinationInputs', 'preferredRouteDestinationInput', 'loggedZoneName(pack.zones,event.zone,event.zoneShortName)', 'loggedZoneName(pack.zones,parser.zone,parser.zoneShortName)', "$('#titlebar-version').textContent", 'document.title']) {
    if (!application.includes(required)) throw new Error(`Overlay integration behavior is missing: ${required}`);
}
if (application.includes('alert(')) throw new Error('Focus-stealing browser alerts remain in the application shell.');
if (!application.includes("event.data?.type === 'eoz-route-candidate-ready'")) throw new Error('Application does not own validated candidate route updates.');

const styles = readFileSync(join(root, 'app/styles.css'), 'utf8');
if (/minimal-mode|consider-loot-tray/.test(html + styles)) throw new Error('Retired play mode or Consider tray remains.');
for (const required of ['.con-light-blue', '.npc-con-light-blue', '.waypoint-npc', '.titlebar-version']) {
    if (!styles.includes(required)) throw new Error(`Modern con presentation is missing: ${required}`);
}
if (styles.includes('.minimal-route-search')) throw new Error('Removed Minimal destination styling remains in the stylesheet.');

const preload = readFileSync(join(root, 'desktop/preload.cjs'), 'utf8');
const desktopMain = readFileSync(join(root, 'desktop/main.cjs'), 'utf8');
if (!preload.includes("ipcRenderer.invoke('eye-of-zomm:clipboard', text)")) throw new Error('Clipboard bridge is missing from the preload surface.');
if (!desktopMain.includes("ipcMain.handle('eye-of-zomm:clipboard'")) throw new Error('Clipboard bridge is missing from the desktop process.');

console.log('UI wording and release surface checks passed.');
