import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real Electron/native-window smoke, with one normal application session and
// synthetic logs in a disposable profile. It never opens the actual EQ folder.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const electron = require('electron');
const temporary = await mkdtemp(join(tmpdir(), 'eoz-native-overlay-smoke-'));
const screenshotArgument = process.argv.indexOf('--screenshots');
const screenshots = screenshotArgument === -1 ? join(temporary, 'screenshots') : resolve(process.argv[screenshotArgument + 1] || '');
try {
    const profile = join(temporary, 'profile');
    const game = join(temporary, 'synthetic-game');
    const log = join(game, 'Logs', 'eqlog_Fixture_Test.txt');
    await mkdir(profile); await mkdir(join(game, 'Logs'), { recursive:true }); await mkdir(screenshots, { recursive:true });
    await mkdir(join(profile, 'data'));
    // Keep the smoke independent of the ignored production bootstrap and
    // network access. This tiny presentation pack exists only in this profile.
    await writeFile(join(profile, 'data', 'eye-of-zomm-pack.json'), JSON.stringify({
        meta:{ schemaVersion:3, version:'native-overlay-synthetic', currentEra:'Classic', sample:true },
        zones:[{ name:'Mistmoore Castle', viewerName:'Mistmoore Castle', aliases:['mistmoore', 'The Castle of Mistmoore'] }],
        npcs:[{ name:'Synthetic Keeper', zone:'Mistmoore Castle', avgLevel:26, levelMin:26, levelMax:26, era:'Classic', loc:[10,20,0] }],
        items:[{ name:'Synthetic Charm', era:'Classic', classes:['MNK','SHM','BER'], slots:['NECK'], stats:{HP:10}, iconId:'fixture', dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle'}] }],
        icons:{ fixture:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATklEQVR4nGNgGAWjgObg6saw//gwTQwl2zJcGjkEpLFikiwixlBi5LBaQo5riVFHtAWkBN3gtIDiIKJ5JNMlmRJj0YDkarIMHQWjgCQAAOw009RU8GzvAAAAAElFTkSuQmCC' }
    }));
    // A nonempty initial tail establishes the cursor before live fixture lines
    // arrive; initial/backfill reads must not trigger transient timers/considers.
    await writeFile(log, `[${new Date().toISOString()}] Synthetic overlay smoke begins.\n`);
    await writeFile(join(profile, 'eye-of-zomm-config.json'), JSON.stringify({ eqRootPath:game, logPath:log, logSelection:'manual' }));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    await writeFile(join(temporary, 'package.json'), JSON.stringify({ name:'eoz-native-overlay-smoke', version:pkg.version, main:'main.cjs' }));
    const run = async ({ root, log, screenshots }) => {
        const electron = require('electron');
        const { app, BrowserWindow } = electron;
        const fs = require('node:fs/promises');
        const path = require('node:path');
        const Module = require('node:module');
        const assert = require('node:assert/strict');
        const nativeOptions = new Map();
        const nativeCalls = new Map();
        // Record the options passed to real BrowserWindows. The wrapper returns
        // native instances; no fake host/window is substituted in this smoke.
        function RecordedWindow(options) {
            const window = new BrowserWindow(options);
            nativeOptions.set(window.id, options); nativeCalls.set(window.id, []);
            for (const name of ['setIgnoreMouseEvents', 'setResizable', 'setMovable', 'setFocusable']) {
                const original = window[name].bind(window);
                window[name] = (...args) => { nativeCalls.get(window.id).push([name, ...args]); return original(...args); };
            }
            return window;
        }
        Object.setPrototypeOf(RecordedWindow, BrowserWindow); RecordedWindow.prototype = BrowserWindow.prototype;
        const originalLoad = Module._load;
        Module._load = function(name, ...args) {
            if (name === 'electron') return { ...electron, BrowserWindow:RecordedWindow };
            return originalLoad.call(this, name, ...args);
        };
        // Keep test windows hidden. capturePage still paints the real renderer;
        // this does not test physical foreground-game compositing or focus.
        BrowserWindow.prototype.show = () => {};
        BrowserWindow.prototype.showInactive = () => {};
        global.fetch = async () => { throw new Error('External network disabled for synthetic smoke'); };
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (predicate, message, timeout = 6500) => {
            const end = Date.now() + timeout;
            while (Date.now() < end) { const result = await predicate(); if (result) return result; await wait(75); }
            throw new Error(`Timed out: ${message}`);
        };
        const execute = (window, fn, ...args) => window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        let owner;
        const panels = () => Object.fromEntries(BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes('/overlay.html?panel=')).map(window => [new URL(window.webContents.getURL()).searchParams.get('panel'), window]));
        const state = () => execute(owner, () => window.eyeOfZommOverlays.getState());
        const control = (action, panel, value) => execute(owner, (action, panel, value) => window.eyeOfZommOverlays.control(action, panel, value), action, panel, value);
        const action = (panel, command, payload) => execute(panels()[panel], (command, payload) => window.eyeOfZommOverlay.action(command, payload), command, payload);
        const append = async texts => {
            const stamp = new Date().toString().replace(/ GMT.*$/, '');
            await fs.appendFile(log, texts.map(text => `[${stamp}] ${text}\n`).join(''));
        };
        const screenshot = async (window, name) => {
            // Hidden native windows may have a previous compositor frame even
            // though executeJavaScript already sees the current DOM.
            await execute(window, () => { const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(style); });
            window.webContents.invalidate(); await wait(100);
            await window.capturePage(undefined, {stayHidden:true, stayAwake:true});
            await wait(100);
            const image = await window.capturePage(undefined, {stayHidden:true, stayAwake:true});
            assert(!image.isEmpty(), `${name} must render pixels`);
            await fs.writeFile(path.join(screenshots, `${name}.png`), image.toPNG());
        };
        const inspect = async () => {
            owner = await until(() => BrowserWindow.getAllWindows().find(window => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())), 'main app');
            await until(async () => execute(owner, () => Boolean(window.eyeOfZommOverlays && document.querySelector('#bridge-status')?.textContent === 'Live log')), 'initial log poll');
            await until(async () => (await state()).sessionAvailable, 'first shared snapshot');
            await execute(owner, () => localStorage.setItem('eoz-smoke-owner-only', 'synthetic-owner-preference'));
            await control('show-all');
            await until(() => Object.keys(panels()).length === 4, 'four native overlays');
            for (const window of Object.values(panels())) await until(async () => execute(window, () => Boolean(document.querySelector('#panel-content')?.children.length)), 'overlay renderer');
            const ids = Object.values(panels()).map(window => window.id);
            assert.equal(new Set(ids).size, 4);
            const bounds = Object.values(panels()).map(window => window.getBounds());
            assert.equal(new Set(bounds.map(bounds => `${bounds.x},${bounds.y}`)).size, 4, 'independent saved positions');
            for (const window of Object.values(panels())) {
                const options = nativeOptions.get(window.id);
                assert.equal(options.frame, false); assert.equal(options.transparent, true); assert.equal(options.alwaysOnTop, true);
                assert.equal(options.webPreferences.sandbox, true); assert.equal(options.webPreferences.contextIsolation, true); assert.equal(options.webPreferences.nodeIntegration, false);
                assert(window.getNativeWindowHandle().length > 0, 'native window handle exists');
                assert.equal(window.isAlwaysOnTop(), true);
                const surface = await execute(window, async () => {
                    let fetchBlocked = false;
                    try { await fetch('/api/info'); } catch { fetchBlocked = true; }
                    return { singular:typeof window.eyeOfZommOverlay?.getState, main:typeof window.eyeOfZommOverlays, updater:typeof window.eyeOfZommUpdates, files:typeof window.require,
                        fetchBlocked, mainPreference:localStorage.getItem('eoz-smoke-owner-only') };
                });
                assert.deepEqual(surface, { singular:'function', main:'undefined', updater:'undefined', files:'undefined', fetchBlocked:true, mainPreference:null });
            }
            await action('parse', 'lock', true);
            assert.equal(panels().parse.isResizable(), false); assert.equal(panels().parse.isMovable(), false); assert.equal(panels().parse.isFocusable(), true);
            await until(async () => execute(panels().parse, () => document.querySelector('#overlay').classList.contains('is-locked')), 'locked drag CSS');
            await execute(panels().parse, () => document.querySelector('[data-tab="healing"]').click());
            assert.equal(await execute(panels().parse, () => document.querySelector('[data-tab="healing"]').getAttribute('aria-pressed')), 'true', 'tabs remain usable in locked layouts');
            await execute(panels().parse, () => document.querySelector('#panel-menu-button').click());
            assert.equal(await execute(panels().parse, () => document.querySelector('#panel-menu-button').getAttribute('aria-expanded')), 'true');
            await execute(panels().parse, () => document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})));
            assert.equal(await execute(panels().parse, () => document.querySelector('#panel-menu-button').getAttribute('aria-expanded')), 'false');
            await action('parse', 'pass-through', true);
            assert(nativeCalls.get(panels().parse.id).some(call => call[0] === 'setIgnoreMouseEvents' && call[1] === true));
            await control('restore-mouse'); await control('unlock-all');
            assert.equal((await state()).panels.parse.passThrough, false);
            assert.equal(panels().parse.isResizable(), true); assert.equal(panels().parse.isMovable(), true); assert.equal(panels().parse.isFocusable(), true);
            assert.equal(nativeCalls.get(panels().parse.id).filter(call => call[0] === 'setIgnoreMouseEvents').at(-1)[1], false);
            await append(['[26 MNK/SHM/BER] Fixture (Iksar) ZONE: The Castle of Mistmoore (mistmoore)', 'You slash a synthetic skeleton for 100 points of damage.', 'You healed Fixture for 50 hit points by Mend.', 'a synthetic skeleton scowls at you (Lvl: 26)']);
            await until(async () => (await state()).snapshot.session.parse.totalDamage === 100, 'first synthetic parse');
            await until(async () => (await state()).snapshot.session.consider?.name === 'a synthetic skeleton', 'consider shared state');
            assert.equal((await state()).snapshot.session.intel.npcs[0]?.name, 'Synthetic Keeper', 'smoke uses its disposable synthetic pack, not an ignored production bootstrap');
            await until(async () => execute(panels().intel, () => [...document.querySelectorAll('img.item-icon')].some(image => image.complete && image.naturalWidth > 0)), 'dataset icons remain available with restrictive overlay CSP');
            const sessionId = (await state()).snapshot.sessionId;
            await execute(panels().timers, () => {
                const form = document.querySelector('#timer-form');
                form.closest('details').open = true;
                for (const [name,value] of Object.entries({label:'Synthetic pulse',type:'text',trigger:'SYNTHETIC PULSE',match:'contains',seconds:'90'})) form.elements.namedItem(name).value = value;
            });
            await wait(1250);
            assert.deepEqual(await execute(panels().timers, () => { const fields = document.querySelector('#timer-form').elements; return [fields.namedItem('label').value, fields.namedItem('trigger').value, fields.namedItem('seconds').value]; }), ['Synthetic pulse', 'SYNTHETIC PULSE', '90'], 'editor fields survive timer paint ticks and shared heartbeat');
            await execute(panels().timers, () => document.querySelector('#timer-form').requestSubmit());
            await until(async () => (await state()).snapshot.session.timers.definitions.length === 1, 'saved trigger');
            assert.equal((await state()).snapshot.session.timers.definitions[0].trigger, 'SYNTHETIC PULSE');
            await execute(panels().timers, () => { document.querySelector('#timer-form').closest('details').open = false; });
            await append(['SYNTHETIC PULSE', 'You slash a synthetic skeleton for 25 points of damage.']);
            await until(async () => (await state()).snapshot.session.parse.totalDamage === 125 && (await state()).snapshot.session.timers.timers.length === 1, 'timer and parse consume one shared log');
            await action('timers', 'timer:start', { label:'Manual fixture', durationSeconds:120 });
            await until(async () => (await state()).snapshot.session.timers.timers.length === 2, 'manual timer');
            const timerId = (await state()).snapshot.session.timers.timers.find(timer => timer.label === 'Manual fixture').id;
            await action('timers', 'timer:pause', { id:timerId });
            await until(async () => (await state()).snapshot.session.timers.timers.find(timer => timer.id === timerId)?.status === 'paused', 'paused timer');
            await action('timers', 'timer:resume', { id:timerId });
            await until(async () => (await state()).snapshot.session.timers.timers.find(timer => timer.id === timerId)?.status === 'running', 'resumed timer');
            await action('timers', 'timer:set-swing-delay', { delayTenths:25 });
            await action('timers', 'timer:reset-swing');
            await append(['You slash a synthetic skeleton for 5 points of damage.']);
            await until(async () => (await state()).snapshot.session.timers.swing.intervalMs === 2500, 'weapon delay swing seed');
            // Direct errors from a forwarded command must appear on that panel.
            await action('timers', 'timer:start', { definitionId:'missing-definition' });
            await until(async () => execute(panels().timers, () => /no longer exists/i.test(document.querySelector('#overlay-status').textContent)), 'timer error surfaced in overlay');
            await execute(panels().parse, () => document.querySelector('[data-tab="damage"]').click());
            await execute(panels().parse, () => { const select = document.querySelector('#encounter-scope'); select.value = 'session'; select.dispatchEvent(new Event('change')); });
            await until(async () => execute(panels().parse, () => document.querySelector('#parse-body').textContent.includes('130')), 'parse panel mirrors owner');
            await until(async () => execute(panels().timers, () => document.querySelector('#swing-body').textContent.includes('2.50s swing')), 'swing renderer reflects seed');
            await execute(owner, () => { document.querySelector('[data-view="settings"]').click(); document.querySelector('#overlay-controller').scrollIntoView({block:'center'}); });
            assert.equal(await execute(owner, () => document.querySelector('[data-view-panel="settings"]').classList.contains('is-active')), true);
            await screenshot(owner, 'main-controller');
            for (const [name, window] of Object.entries(panels())) await screenshot(window, name);
            const parseId = panels().parse.id;
            await panels().parse.webContents.reload();
            await until(async () => execute(panels().parse, () => Boolean(document.querySelector('#parse-body')?.textContent.includes('130'))).catch(() => false), 'reload same panel');
            assert.equal(panels().parse.id, parseId);
            assert.equal((await state()).snapshot.session.parse.totalDamage, 130, 'panel reload cannot reset or double-count');
            panels().intel.destroy();
            await control('show', 'intel');
            await until(async () => panels().intel && execute(panels().intel, () => Boolean(document.querySelector('#intel-body'))).catch(() => false), 'recreate destroyed panel');
            assert.equal((await state()).snapshot.sessionId, sessionId);
            owner.close();
            assert.equal(owner.isDestroyed(), false, 'closing main app with visible overlays keeps the one session owner');
            assert.equal(owner.isVisible(), false);
            const before = (await state()).snapshot.session.timers.timers[0].remainingMs;
            await append(['You slash a synthetic skeleton for 10 points of damage.', 'SYNTHETIC PULSE']);
            await until(async () => (await state()).snapshot.session.parse.totalDamage === 140, 'hidden owner continues log parsing');
            const after = await state();
            assert.equal(after.snapshot.sessionId, sessionId);
            assert.equal(after.snapshot.session.timers.timers.filter(timer => timer.label === 'Synthetic pulse').length, 1, 'repeated trigger replaces instead of duplicating');
            assert(after.snapshot.session.timers.timers.find(timer => timer.label === 'Manual fixture').remainingMs < 120000, 'hidden owner timers continue');
            assert(before > 0);
            return { ok:true, windows:ids.length, damage:after.snapshot.session.parse.totalDamage, timers:after.snapshot.session.timers.timers.length, sharedSession:true, screenshots };
        };
        let started = false;
        app.on('browser-window-created', () => { if (!started) { started = true; void inspect().then(result => { console.log('EOZ_NATIVE_OVERLAY_SMOKE=' + JSON.stringify(result)); app.exit(0); }).catch(error => { console.error(error.stack); app.exit(1); }); } });
        setTimeout(() => { console.error('Native overlay smoke exceeded 45 seconds.'); app.exit(2); }, 45000).unref();
        require(path.join(root, 'desktop/main.cjs'));
    };
    await writeFile(join(temporary, 'main.cjs'), `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(profile)});\n(${run.toString()})(${JSON.stringify({root, log, screenshots})}).catch(error => { console.error(error.stack); app.exit(1); });\n`);
    const result = await new Promise((resolve, reject) => {
        const child = spawn(electron, [temporary, '--disable-gpu'], { windowsHide:true, stdio:['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', reject); child.once('exit', code => resolve({code, output}));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /EOZ_NATIVE_OVERLAY_SMOKE=.*"ok":true/);
    console.log(result.output.match(/EOZ_NATIVE_OVERLAY_SMOKE=.*/)[0]);
    console.log('Actual Electron native overlay smoke passed: four isolated windows, CSP/API and storage isolation, layout lock/mouse recovery, shared log and timers, reload/recreate, hidden owner. Physical game compositing and OS scaling are not tested.');
} finally {
    if (dirname(temporary) !== resolve(tmpdir()) || !basename(temporary).startsWith('eoz-native-overlay-smoke-')) throw new Error('Unexpected native-overlay smoke cleanup path');
    await rm(temporary, { recursive:true, force:true });
}
