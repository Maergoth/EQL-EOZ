import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';
import { packagedArchivePaths, verifyPackagedRuntimeSources, verifyPackagedRuntimeImages } from './packaged-runtime-sources.mjs';

const packageRoot = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const platformIndex = process.argv.indexOf('--platform');
const platform = platformIndex < 0 ? process.platform : process.argv[platformIndex + 1];
const archivePath = packagedArchivePaths(platform)
    .map(relative => fileURLToPath(new URL(`../${relative}`, import.meta.url))).find(existsSync);

if (!archivePath) {
    throw new Error(`Packaged ${platform} app.asar was not found. Build that platform before this check.`);
}

function packagedBytes(relativePath) {
    try {
        return asar.extractFile(archivePath, relativePath);
    } catch (error) {
        // @electron/asar 4 resolves archive entries with the host separator.
        // Linux accepts POSIX paths; Windows runners require backslashes.
        if (process.platform !== 'win32') throw error;
        return asar.extractFile(archivePath, relativePath.replaceAll('/', '\\'));
    }
}

function packagedText(relativePath) { return packagedBytes(relativePath).toString('utf8'); }

const packagedPackage = JSON.parse(packagedText('package.json'));
if (packagedPackage.version !== packageRoot.version) {
    throw new Error(`Packaged version ${packagedPackage.version} does not match source ${packageRoot.version}.`);
}

const index = packagedText('app/index.html');
const app = packagedText('app/app.js');
const parser = packagedText('app/parser.js');
const coordinates = packagedText('app/coordinate-system.js');
const viewerHtml = packagedText('app/zoneviewer/viewer.html');
const viewerBundle = packagedText('app/zoneviewer/ZoneViewerApp.js');
const viewerWorker = packagedText('app/zoneviewer/zone-parser.worker.js');
const collisionGeometry = packagedText('app/collision-geometry.js');
const recastClient = packagedText('app/recast-route-client.js');
const recastWorker = packagedText('app/workers/recast-route.worker.js');
const bootstrap = JSON.parse(packagedText('app/data/eye-of-zomm-pack.bootstrap.json'));

// The integration regressions run against source. Require those exact runtime
// bytes in the ASAR so a stale package cannot pass on older marker strings.
verifyPackagedRuntimeSources(packagedText, relative => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
verifyPackagedRuntimeImages(packagedBytes, relative => readFileSync(new URL(`../${relative}`, import.meta.url)));

for (const [name, content, required] of [
    ['header version', index, 'id="titlebar-version"'],
    ['runtime version binding', app, "$('#titlebar-version').textContent"],
    ['/who zone parser', parser, "source:'who'"],
    ['/who canonical zone resolution', app, 'event.zoneShortName || event.zone'],
    ['game-map formatter', coordinates, 'formatWorldLocationForGameMap'],
    ['sync status', viewerHtml, 'Synced to in-game map ${formatWorldLocationForGameMap(worldLocation)}'],
    ['viewer world transform', viewerBundle, 'eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}'],
    ['viewer map HUD', viewerBundle, 'this.els.coord.textContent=`Map X ${i.y.toFixed(2)}   Y ${i.x.toFixed(2)}   Z ${i.z.toFixed(2)}`'],
    ['overlay route opt-in', app, 'routingEnabled: false'],
    ['native map snapshot', app, 'dataVersion:mapDataRevision'],
    ['complete lazy drop broker', app, "action === 'session:intel-drops'"],
    ['lazy archive hydration', viewerBundle, 'l.eyeOfZommReadFile?await l.eyeOfZommReadFile():l'],
    ['lazy local file bridge', viewerHtml, 'eyeOfZommReadFile:() => handle.readFile()'],
    ['WLD material group alignment', viewerWorker, 'p+=T.polygonCount;continue'],
    ['collision exporter', collisionGeometry, 'exportViewerCollisionGeometry'],
    ['route corridor crop', collisionGeometry, 'cropCollisionGeometryForRoute'],
    ['transferable route client', recastClient, 'transferGeometry'],
    ['spatial candidate viewer wiring', viewerHtml, 'scheduleCandidateRoute'],
    ['spatial candidate owner wiring', app, "event.data?.type === 'eoz-route-candidate-ready'"],
    ['bundled Recast worker', recastWorker, 'recast-navigation']
]) {
    if (!content.includes(required)) throw new Error(`Packaged ${name} is missing ${required}.`);
}

if (Number(bootstrap?.meta?.schemaVersion) < 3 || bootstrap?.meta?.sample === true ||
    !Array.isArray(bootstrap?.zones) || bootstrap.zones.length < 100 ||
    !Array.isArray(bootstrap?.npcs) || bootstrap.npcs.length < 1000 ||
    !Array.isArray(bootstrap?.items) || bootstrap.items.length < 1000) {
    throw new Error('Packaged bootstrap is missing the production-scale schema-v3 dataset.');
}
if (bootstrap.meta.wikiEntitiesComplete !== true || !['npcs','items','titles'].every(key => bootstrap.wikiEntities?.[key]?.length > 0) ||
    !bootstrap.npcs.some(npc => npc.raidInstance === true)) {
    throw new Error('Packaged bootstrap must include the complete wiki presence catalog and exported raid variants.');
}
const npcKey = npc => JSON.stringify([String(npc.zone).toLowerCase(),String(npc.name).toLowerCase()]);
const legacyNpcs = new Map(bootstrap.npcs.map(npc => [npcKey(npc),npc]));
if (bootstrap.npcs.some(npc => !npc.raidInstance && legacyNpcs.get(npcKey(npc))?.raidInstance)) {
    throw new Error('Packaged bootstrap must preserve normal NPC coordinates for older clients.');
}

console.log(`Packaged app verified as v${packagedPackage.version} with production data and current coordinate, texture, and spatial-candidate code.`);
console.log(`Bundled dataset verified against freshly fetched source: manifest ${bootstrap.meta.manifestVersion}, pack ${bootstrap.meta.version}; ${bootstrap.zones.length} zones, ${bootstrap.npcs.length} NPCs, ${bootstrap.items.length} items.`);
