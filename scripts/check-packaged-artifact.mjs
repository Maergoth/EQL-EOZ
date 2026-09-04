import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import asar from '@electron/asar';

const packageRoot = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const archivePath = fileURLToPath(new URL('../dist/win-unpacked/resources/app.asar', import.meta.url));

if (!existsSync(archivePath)) {
    throw new Error('Packaged app.asar was not found. Build the Windows unpacked app before this check.');
}

function packagedText(relativePath) {
    try {
        return asar.extractFile(archivePath, relativePath).toString('utf8');
    } catch (error) {
        // @electron/asar 4 resolves archive entries with the host separator.
        // Linux accepts POSIX paths; Windows runners require backslashes.
        if (process.platform !== 'win32') throw error;
        return asar.extractFile(archivePath, relativePath.replaceAll('/', '\\')).toString('utf8');
    }
}

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

for (const [name, content, required] of [
    ['title bar', index, 'id="titlebar-version"'],
    ['runtime version binding', app, "$('#titlebar-version').textContent"],
    ['/who zone parser', parser, "source:'who'"],
    ['/who canonical zone resolution', app, 'event.zoneShortName || event.zone'],
    ['game-map formatter', coordinates, 'formatWorldLocationForGameMap'],
    ['sync status', viewerHtml, 'Synced to in-game map ${formatWorldLocationForGameMap(worldLocation)}'],
    ['viewer world transform', viewerBundle, 'eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}'],
    ['viewer map HUD', viewerBundle, 'this.els.coord.textContent=`Map X ${i.y.toFixed(2)}   Y ${i.x.toFixed(2)}   Z ${i.z.toFixed(2)}`'],
    ['intel-first minimal settings', app, 'minimalMapVisible: false'],
    ['lazy archive hydration', viewerBundle, 'l.eyeOfZommReadFile?await l.eyeOfZommReadFile():l'],
    ['lazy local file bridge', viewerHtml, 'eyeOfZommReadFile:() => handle.readFile()'],
    ['WLD material group alignment', viewerWorker, 'p+=T.polygonCount;continue']
]) {
    if (!content.includes(required)) throw new Error(`Packaged ${name} is missing ${required}.`);
}

console.log(`Packaged Windows app verified as v${packagedPackage.version} with current coordinate code.`);
