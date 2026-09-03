import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const html = readFileSync(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
const modules = [...html.matchAll(/<script\s+type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi)];

if (!modules.length) {
    throw new Error('No inline Zone Viewer module was found to validate.');
}

for (const required of ['window.eqlEyeOfZommViewer', 'useConfiguredFolder()', 'setView(mode)', 'syncLocation(location)']) {
    if (!html.includes(required)) throw new Error(`Zone Viewer integration is missing ${required}.`);
}

for (const required of ['app.setMiniMapVisible(true)', 'Path to ${label} ready ·']) {
    if (!html.includes(required)) throw new Error(`Zone Viewer integration is missing ${required}.`);
}

const viewer = readFileSync(new URL('../app/zoneviewer/ZoneViewerApp.js', import.meta.url), 'utf8');
for (const required of ['Building walkable-mesh route', 'this.findNavigationPathAttempt(', 'const headingUp =', 'this.navigationPath?.length > 1']) {
    if (!viewer.includes(required)) throw new Error(`Zone Viewer bundle is missing ${required}.`);
}

const worker = readFileSync(new URL('../app/zoneviewer/zone-parser.worker.js', import.meta.url), 'utf8');
for (const required of ['this.images=i', 'bitmapNames?.[0]?.name']) {
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
