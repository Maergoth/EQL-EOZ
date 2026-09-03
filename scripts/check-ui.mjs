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
for (const required of ['id="top-classes"', 'data-map-mode="first"', 'data-map-mode="top"', 'data-map-mode="map"', 'minimal-map-mode-switch', 'id="map-source-status"', 'id="map-readiness"', 'id="map-destination"', 'id="route-status"', 'id="minimal-rare-search"', 'Named &amp; rare mobs', 'id="settings-eq-root"', 'id="settings-map-status"', 'id="item-current-zone"', 'id="item-slot"', 'id="item-sort"', 'id="item-context"', 'id="desktop-titlebar"', 'id="consider-loot-tray"', 'id="consider-my-class"', 'id="toast-region"']) {
    if (!html.includes(required)) throw new Error(`Required UI element is missing: ${required}`);
}
for (const removed of ['CURRENT TARGET', 'Last /location', 'id="settings-server"']) {
    if (html.includes(removed)) throw new Error(`Removed UI copy remains: ${removed}`);
}

const desktop = readFileSync(join(root, 'desktop/main.cjs'), 'utf8');
for (const required of ['frame: false', 'skipTaskbar: false', "setSkipTaskbar(false)", "'screen-saver'"]) {
    if (!desktop.includes(required)) throw new Error(`Pinned-window behavior is missing: ${required}`);
}
if (/setSkipTaskbar\((?:true|enabled)/.test(desktop)) throw new Error('Pinned mode must remain in the taskbar.');

const viewer = readFileSync(join(root, 'app/zoneviewer/viewer.html'), 'utf8');
for (const required of ['setView(mode)', 'const changedZone = zoneIdentity !== loadedZoneIdentity', 'selectedFloorIndices?.clear?.()', 'app.eqMapToThree', 'lastSyncedLocation', 'lastSyncedGround', 'findGroundPointAt(point.x, point.z, point.y)', 'focusTopViewAt(lastSyncedGround)', 'headingTracker.push', 'setRareMobs(records = [])', 'eoz-rare-mob-selected', 'eyeOfZommHasZoneArchives', "reason:'no-zone-archives'", 'navigationResult', 'clearPath()']) {
    if (!viewer.includes(required)) throw new Error(`Map integration check is missing: ${required}`);
}

const application = readFileSync(join(root, 'app/app.js'), 'utf8');
for (const required of ['showConsiderTray(event.target)', 'CONSIDER_TRAY_DURATION', 'armConsiderTrayTimeout(8000)', 'npcNameKey(sourceName)', 'ensureViewerFolderConnected', 'mapReadinessMessage', 'renderMapReadiness', 'mapDestinationNames', 'rareMobsForZone', 'syncRareMobsToViewer', 'queueLatestLocationSync', 'pendingViewerLocation', 'scheduleRouteRefresh', 'ROUTE_REFRESH_DISTANCE', "result.source === 'map-label' ? 'local map label' : 'EQLWiki location'", 'itemBrowsePriority', 'Tier ${tier} adjusted stats', 'showNotice']) {
    if (!application.includes(required)) throw new Error(`Consider loot tray behavior is missing: ${required}`);
}
if (application.includes('alert(')) throw new Error('Focus-stealing browser alerts remain in the application shell.');

const styles = readFileSync(join(root, 'app/styles.css'), 'utf8');
for (const required of ['.con-light-blue', '.npc-con-light-blue']) {
    if (!styles.includes(required)) throw new Error(`Modern con presentation is missing: ${required}`);
}

console.log('UI wording and release surface checks passed.');
