import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
const modules = [...html.matchAll(/<script\s+type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)];

if (!modules.length) {
    throw new Error('No inline Zone Viewer module was found to validate.');
}

for (const required of ['window.eqlEyeOfZommViewer', 'useConfiguredFolder()', 'setView(mode)', 'syncLocation(location, options = {})', 'setRareMobs(records = [])']) {
    if (!html.includes(required)) throw new Error(`Zone Viewer integration is missing ${required}.`);
}
for (const required of ['playerMapSetLabel(sourceLabel)', 'default map set', 'app.mapData?.sourceLabel']) {
    if (!html.includes(required)) throw new Error(`Zone Viewer map-set status is missing ${required}.`);
}

for (const required of ['app.setMiniMapVisible?.(true)', 'Path to ${label} ready ·', 'configureViewerMovement(app.fp)', 'EyeOfZommNavigationPolicy', 'LocationHeadingTracker']) {
    if (!html.includes(required)) throw new Error(`Zone Viewer integration is missing ${required}.`);
}
for (const required of ['currentPresentation()', 'restorePresentation(presentation)', 'startRouteWithoutChangingPresentation']) {
    if (!html.includes(required)) throw new Error(`Zone Viewer integration is missing presentation-safe routing: ${required}.`);
}
if (html.includes("if (app.mode !== 'first') app.setMode('first')")) {
    throw new Error('Wiki-coordinate routing still forces First Person mode.');
}

const viewer = readFileSync(new URL('../app/zoneviewer/ZoneViewerApp.js', import.meta.url), 'utf8');
for (const required of [
    'Building walkable-mesh route',
    'this.findNavigationPathAttempt(',
    'navigationCanTraverseElevation(fromElevation, toElevation)',
    'navigationCanUseSurface(fromElevation, candidateElevation',
    'const headingUp =',
    'this.navigationPath?.length > 1',
    'jumpHeight:this.fp?.jumpHeight||6',
    'same six-unit upward step limit as Grounded mode',
    'this.findGroundPointAt(f.x,f.z,f.y)||f',
    'this.findGroundPointAt(o.x,o.z,o.y)||o.clone()',
    'xt=Object.freeze({swap:!0,sx:1,sz:-1})',
    'eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}',
    'threeToWorld(e){return{x:e.z,y:-e.x,z:e.y}}',
    'u=/^maps$/i.test(l.directory)?1:0,d=/^maps$/i.test(c.directory)?1:0',
    'threeToEq(e){return this.threeToWorld(e)}',
    'this.els.coord.textContent=`Map X ${i.y.toFixed(2)}   Y ${i.x.toFixed(2)}   Z ${i.z.toFixed(2)}`',
    'e.userData.eqlLocalTexturePath=t.path',
    'fh="v16"'
]) {
    if (!viewer.includes(required)) throw new Error(`Zone Viewer bundle is missing ${required}.`);
}
if (!html.includes('Synced to in-game map ${formatWorldLocationForGameMap(worldLocation)} · ${playerMapSetLabel(app.mapData?.sourceLabel)}.')) {
    throw new Error('Zone Viewer sync status does not use the in-game Map-window convention.');
}

const worker = readFileSync(new URL('../app/zoneviewer/zone-parser.worker.js', import.meta.url), 'utf8');
for (const required of [
    'this.images=i',
    'bitmapNames?.[0]?.fileName',
    'x.fileName.toLowerCase()',
    'A.name?.toLowerCase().replace(/\\.(?:dds|bmp)$/i,"")'
]) {
    if (!worker.includes(required)) throw new Error(`Zone parser texture patch is missing ${required}.`);
}

for (const [index, match] of modules.entries()) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
        input: match[1],
        encoding: 'utf8'
    });
    if (result.status !== 0) {
        process.stderr.write(result.stderr || `Inline Zone Viewer module ${index + 1} is invalid.\n`);
        process.exit(result.status || 1);
    }
}

console.log(`Validated ${modules.length} inline Zone Viewer module${modules.length === 1 ? '' : 's'}.`);
