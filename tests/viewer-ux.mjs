import { readFileSync } from 'node:fs';

const viewer = readFileSync(new URL('../app/zoneviewer/ZoneViewerApp.js', import.meta.url), 'utf8');
const integration = readFileSync(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../app/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/zoneviewer/ext.eqlZoneViewer.css', import.meta.url), 'utf8');

for (const marker of [
    't.append(y,L,h,u,_,N,Ee,X,l)',
    'e.append(t,G,ue)',
    'eqlzv-z-slicer',
    'Hide geometry above Z',
    'this.fp.setFly(!0)',
    'findSuccorPoint() {',
    'Reset to this zone\\u2019s Succor point.',
    'texture.wrapS = 1000',
    'texture.wrapT = 1000'
]) {
    if (!viewer.includes(marker)) throw new Error(`Viewer UX contract is missing: ${marker}`);
}
for (const marker of [
    't.filter(a=>Object.prototype.hasOwnProperty.call(ls,a.id))',
    'l.eyeOfZommReadFile?await l.eyeOfZommReadFile():l'
]) {
    if (!viewer.includes(marker)) throw new Error(`Lazy archive contract is missing: ${marker}`);
}
if (!integration.includes('eyeOfZommReadFile:() => handle.readFile()')) throw new Error('Desktop directory integration eagerly loads archive bytes.');
for (const marker of [
    "from '../collision-geometry.js'",
    'startCollisionGeometryExport(zoneIdentity)',
    'cropCollisionGeometryForRoute(fullGeometry, guidePoints',
    'transferGeometry:true',
    "type:'eoz-route-candidate-ready'"
]) {
    if (!integration.includes(marker)) throw new Error(`Guarded collision candidate integration is missing: ${marker}`);
}

if (viewer.includes('G.append(te,he,ae,He,qe,Le,Ue,ne,ye,$,z,ie)')) {
    throw new Error('The click-to-enter prompt is still mounted over the map.');
}
if (viewer.includes('e.append(t,c,G,ue)')) throw new Error('A second viewer header is still mounted.');

const routeMethod = viewer.slice(viewer.indexOf('async findNavigationPath(start, goal, token) {'), viewer.indexOf('async findNavigationPathAttempt('));
if (!routeMethod.includes('requestNavigationWorkerRoute') || routeMethod.includes('this.findNavigationPathAttempt(')) {
    throw new Error('Routing performs its expensive graph search on the renderer thread.');
}

if (!integration.includes("type:'eoz-route-cancelled'") ||
    !app.includes("event.data?.type === 'eoz-route-cancelled'") ||
    !app.includes('clearActiveRoute({ clearViewer:false })')) {
    throw new Error('Cancel Path does not clear the owner state that drives automatic rerouting.');
}
if (!integration.includes('.eqlzv-toolbar>.eqlzv-toolbar-label') ||
    !integration.includes("root.querySelectorAll('.eqlzv-toolbar .eqlzv-button')")) {
    throw new Error('Merged toolbar exposes duplicate view, help, or fullscreen controls.');
}

if (!css.includes('.eqlzv-z-slicer:not([open])') || !css.includes('.eqlzv-fps-enter { display: none !important; }')) {
    throw new Error('Compact Z popover or prompt-removal CSS is missing.');
}

console.log('Fly-only viewer UX, Succor reset, non-blocking routes, cancellation, and texture sampling contracts passed.');
