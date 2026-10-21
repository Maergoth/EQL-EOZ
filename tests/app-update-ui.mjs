import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appUpdatePresentation, mountAppUpdates } from '../app/app-update-ui.js';

class Element extends EventTarget {
    hidden = false; disabled = false; checked = false; textContent = ''; value = 0;
    removeAttribute(name) { delete this[name]; }
    click() { this.dispatchEvent(new Event('click')); }
}
const ids = ['app-update-status', 'app-update-detail', 'app-update-progress', 'app-update-progress-label',
    'check-app-update', 'download-app-update', 'install-app-update', 'cancel-app-update',
    'later-app-update', 'app-update-startup-download', 'app-update-notes', 'app-update-badge'];
const state = (status, extra = {}) => ({ supported:true, status, currentVersion:'0.8.2', availableVersion:'0.8.3',
    releaseUrl:'https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.3', ...extra });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(bridge) {
    const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
    const document = Object.assign(new EventTarget(), { hidden:false, getElementById:id => elements[id] });
    const timers = new Map(); let timerId = 0; let openedSettings = 0;
    const controller = mountAppUpdates({ document, bridge,
        openSettings:() => { openedSettings++; },
        setTimeout:callback => { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout:id => timers.delete(id)
    });
    return { elements, document, controller, timers, openedSettings:() => openedSettings,
        async tick() { const [id, callback] = [...timers][0]; timers.delete(id); await callback(); }
    };
}

for (const status of ['available', 'downloading', 'ready', 'installing']) {
    assert.equal(appUpdatePresentation(state(status)).showBadge, true);
}
assert.equal(appUpdatePresentation(state('available')).badge, 'Update Available');
assert.equal(appUpdatePresentation(state('ready')).showInstall, true);
assert.equal(appUpdatePresentation(state('available')).showInstall, false);
assert.equal(appUpdatePresentation(state('downloading', { downloadedBytes:20, totalBytes:10 })).percent, 100);
assert.equal(appUpdatePresentation(state('downloading', { totalBytes:Infinity })).percent, null);
assert.equal(appUpdatePresentation({ status:'unsupported' }).checkDisabled, true);
for (const [status, error] of [['available', 'SHA-256 verification failed.'], ['ready', 'Windows could not open the installer.'], ['current', 'Update preference could not be saved.']]) {
    assert.equal(appUpdatePresentation(state(status, { error })).detail, error, 'Retryable failures remain visible without removing the retry action');
}

const browser = fixture(undefined);
assert(browser.elements['check-app-update'].disabled);
assert.match(browser.elements['app-update-status'].textContent, /installed Windows x64/);
assert.equal(browser.timers.size, 0);
browser.controller.dispose();

let current = state('available');
const calls = [];
const download = deferred();
const app = fixture({
    getStatus:async () => current,
    check:async () => { calls.push('check'); return current; },
    download:async () => { calls.push('download'); current = state('downloading'); return download.promise; },
    cancel:async () => { calls.push('cancel'); current = state('available'); return current; },
    install:async () => { calls.push('install'); return current; },
    setStartupDownload:async enabled => { calls.push(['automatic', enabled]); current = { ...current, automaticDownload:enabled }; return current; }
});
await flush();
assert.equal(app.elements['download-app-update'].hidden, false);
assert.equal(app.elements['install-app-update'].hidden, true);
assert.equal(app.elements['app-update-notes'].href, current.releaseUrl);
assert.equal(app.elements['app-update-badge'].textContent,'Update Available');
assert.equal(app.elements['app-update-badge'].hidden,false);
app.elements['app-update-badge'].click();
assert.equal(app.openedSettings(), 1);
app.elements['download-app-update'].click();
await flush();
assert.equal(app.elements['cancel-app-update'].hidden, false);
assert.equal(app.elements['check-app-update'].disabled, true);
current = state('downloading', { downloadedBytes:25, totalBytes:100 });
await app.tick();
assert.equal(app.elements['app-update-progress'].value, 25);
app.elements['cancel-app-update'].click();
await flush();
download.resolve(state('ready'));
await flush();
assert.deepEqual(calls, ['download', 'cancel']);
assert.equal(app.elements['install-app-update'].hidden, true, 'Late completed download cannot undo cancellation');
assert.equal(app.elements['download-app-update'].hidden, false);

current = state('ready');
await app.controller.refresh();
assert.equal(app.elements['install-app-update'].hidden, false);
assert(!calls.includes('install'), 'Polling a restored download never starts installation');
current = state('ready', { error:'Windows could not open the installer.' });
await app.controller.refresh();
assert.equal(app.elements['app-update-detail'].hidden, false);
assert.match(app.elements['app-update-detail'].textContent, /could not open/);
app.elements['later-app-update'].click();
assert.equal(app.elements['app-update-badge'].hidden, false, 'An available update remains reachable from the header after Later');
assert.equal(app.elements['later-app-update'].hidden,true);
app.elements['app-update-badge'].click();
assert.equal(app.openedSettings(),2,'The retained header update button still opens Settings');
assert.equal(app.elements['install-app-update'].hidden, false, 'Later retains the staged update in Settings');
app.elements['app-update-startup-download'].checked = true;
app.elements['app-update-startup-download'].dispatchEvent(new Event('change'));
await flush();
assert.deepEqual(calls.at(-1), ['automatic', true]);
app.elements['install-app-update'].click();
await flush();
assert.equal(calls.at(-1), 'install', 'Only explicit activation requests the native installation prompt');
current = state('available', { releaseUrl:'https://github.com.evil.invalid/Maergoth/EQL-EOZ/releases/tag/v0.8.3' });
await app.controller.refresh();
assert.equal(app.elements['app-update-notes'].hidden, true);
app.controller.dispose();
assert.equal(app.timers.size, 0);
app.elements['check-app-update'].click();
assert.equal(calls.filter(call => call === 'check').length, 0, 'Disposal removes update actions');

const oldStatus = deferred();
const race = fixture({ getStatus:() => oldStatus.promise, check:async () => state('available', { availableVersion:'0.8.4' }) });
race.elements['check-app-update'].click();
await flush();
oldStatus.resolve(state('current', { availableVersion:'' }));
await flush();
assert.match(race.elements['app-update-status'].textContent, /v0\.8\.4/, 'Older polling cannot overwrite a newer check result');
race.controller.dispose();

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
for (const id of ids) assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `Native updater control ${id} exists exactly once`);
assert(html.includes('id="update-pack"'), 'Wiki data synchronization remains a separate action');
console.log('Application update presentation, progress, cancellation, Later, native approval, and stale-result controls passed.');
