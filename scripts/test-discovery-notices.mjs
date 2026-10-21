import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real app, parser, native windows, notice renderers and authenticated IPC.
// getSources returns only a generated bitmap; clipboard writes are recorded in
// memory. No real desktop pixels, clipboard contents or installed game are read.
const root = fileURLToPath(new URL('../', import.meta.url)), require = createRequire(import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), 'eoz-discovery-smoke-'));
const screenshotFlag = process.argv.indexOf('--screenshots');
const screenshots = screenshotFlag === -1 ? null : resolve(process.argv[screenshotFlag + 1] || '');
try {
    const profile = join(temporary, 'profile'), game = join(temporary, 'synthetic-game'), log = join(game, 'Logs', 'eqlog_Fixture_Test.txt');
    await mkdir(join(profile, 'data'), { recursive:true }); await mkdir(join(game, 'Logs'), { recursive:true });
    if (screenshots) await mkdir(screenshots, { recursive:true });
    await writeFile(log, `[${new Date().toISOString()}] Discovery fixture establishes the initial tail.\n`);
    await writeFile(join(profile, 'eye-of-zomm-config.json'), JSON.stringify({ eqRootPath:game, logPath:log, logSelection:'manual' }));
    await writeFile(join(profile, 'data', 'eye-of-zomm-pack.json'), JSON.stringify({
        meta:{ schemaVersion:3, version:'discovery-synthetic', wikiEntitiesComplete:true, currentEra:'Classic', sample:false },
        wikiEntities:{ npcs:['Known Synthetic Keeper'], items:['Known Synthetic Ring'], titles:['Known Synthetic Keeper', 'Known Synthetic Ring'] },
        zones:[{ name:'Mistmoore Castle', viewerName:'Mistmoore Castle', aliases:['mistmoore', 'The Castle of Mistmoore'] }],
        npcs:[{ name:'Known Synthetic Keeper', zone:'Mistmoore Castle', avgLevel:26, era:'Classic' }],
        items:[{ name:'Known Synthetic Ring', classes:['MNK'], slots:['FINGER'], stats:{ HP:1 }, era:'Classic', dropSources:[] }]
    }));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    await writeFile(join(temporary, 'package.json'), JSON.stringify({ name:'eoz-discovery-smoke', version:pkg.version, main:'main.cjs' }));
    const run = async ({ root, log, screenshots }) => {
        const electron = require('electron'), { app, BrowserWindow, nativeImage } = electron;
        const fs = require('node:fs/promises'), path = require('node:path'), Module = require('node:module'), assert = require('node:assert/strict');
        const fixtureImage = nativeImage.createFromBitmap(Buffer.from([30,80,140,255, 120,30,90,255, 50,180,40,255, 200,120,10,255]), { width:2, height:2 });
        assert(!fixtureImage.isEmpty());
        let captureCalls = 0, clipboardCalls = 0, lastPng = null, focusCalls = 0;
        const originalLoad = Module._load;
        Module._load = function(name, ...args) {
            if (name === 'electron') return { ...electron,
                desktopCapturer:{ async getSources() { captureCalls++; return [{ id:'synthetic:game', name:'EverQuest Legends (synthetic fixture)', thumbnail:fixtureImage }]; } },
                clipboard:{ ...electron.clipboard, writeImage(image) { clipboardCalls++; lastPng = image.toPNG(); } }
            };
            return originalLoad.call(this, name, ...args);
        };
        BrowserWindow.prototype.show = () => {}; BrowserWindow.prototype.showInactive = () => {};
        const originalFocus = BrowserWindow.prototype.focus;
        BrowserWindow.prototype.focus = function(...args) { focusCalls++; return originalFocus.apply(this, args); };
        global.fetch = async () => { throw new Error('External network disabled for discovery fixture'); };
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (predicate, label, timeout = 8000) => {
            const deadline = Date.now() + timeout;
            while (Date.now() < deadline) { try { const result = await predicate(); if (result) return result; } catch { /* A navigating frame may not be ready. */ } await wait(75); }
            throw new Error(`Timed out: ${label}`);
        };
        const execute = (window, fn, ...args) => window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        const panels = () => Object.fromEntries(BrowserWindow.getAllWindows().filter(window => window.webContents.getURL().includes('/overlay.html?panel=')).map(window => [new URL(window.webContents.getURL()).searchParams.get('panel'), window]));
        const append = async text => fs.appendFile(log, `[${new Date().toString().replace(/ GMT.*$/, '')}] ${text}\n`);
        const card = window => execute(window, () => document.querySelector('#wiki-discovery-notices .wiki-discovery-card')?.textContent || '');
        const control = (owner, name, value) => execute(owner, (name, value) => window.eyeOfZommOverlays.control(name, 'timers', value), name, value);
        const click = (window, command) => execute(window, command => {
            const button = document.querySelector(`#wiki-discovery-notices [data-discovery-command="${command}"]`);
            if (!button || button.disabled) throw new Error(`Missing enabled ${command} button`); button.click();
        }, command);
        const capturePage = async (window, name) => {
            if (!screenshots) return;
            window.webContents.invalidate(); await wait(100);
            await window.capturePage(undefined, { stayHidden:true, stayAwake:true }); await wait(75);
            const image = await window.capturePage(undefined, { stayHidden:true, stayAwake:true });
            assert(!image.isEmpty()); await fs.writeFile(path.join(screenshots, `${name}.png`), image.toPNG());
        };
        let started = false;
        app.on('browser-window-created', () => {
            if (started) return; started = true;
            void (async () => {
                const owner = await until(() => BrowserWindow.getAllWindows().find(window => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())), 'main owner');
                await until(() => execute(owner, () => document.querySelector('#bridge-status')?.textContent === 'Live log'), 'initial log cursor');
                await until(() => execute(owner, async () => (await window.eyeOfZommOverlays.getState()).sessionAvailable), 'shared session');
                await execute(owner, () => document.querySelector('[data-view="timers"]').click());
                await execute(owner, () => window.eyeOfZommOverlays.control('show-all'));
                await until(() => Object.keys(panels()).length === 4, 'four native panels');
                await until(() => execute(panels().timers, () => Boolean(document.querySelector('#wiki-discovery-notices'))), 'native notices component');
                assert.equal(BrowserWindow.getAllWindows().length, 5, 'one owner plus four native overlays');
                assert.equal(captureCalls, 0); assert.equal(clipboardCalls, 0);
                const focusBefore = focusCalls;
                const shared = () => execute(owner, async () => (await window.eyeOfZommOverlays.getState()).snapshot.session);
                await append('[26 MNK/SHM/BER] Fixture (Iksar) ZONE: The Castle of Mistmoore (mistmoore)');
                await until(async () => (await shared()).zone === 'Mistmoore Castle', 'fixture zone');
                const beforeConsider = (await shared()).intel.focusSequence;
                await append('Known Synthetic Keeper scowls at you (Lvl: 26)');
                await until(async () => (await shared()).intel.focusSequence > beforeConsider && (await shared()).intel.focusedNpcId.includes('known synthetic keeper'), 'known consider focuses Intel');
                const focusedId = (await shared()).intel.focusedNpcId, beforeKill = (await shared()).intel.focusSequence;
                await append('You have slain Known Synthetic Keeper!');
                await until(async () => (await shared()).intel.focusSequence > beforeKill && (await shared()).intel.focusedNpcId === focusedId, 'known kill refreshes the same Intel target');
                assert.equal((await shared()).discovery.length, 0, 'known listed consider/kill do not create missing-wiki notices');
                await append('You have looted a Synthetic Uncatalogued Sword.');
                await until(async () => (await card(panels().timers)).includes('Synthetic Uncatalogued Sword'), 'native inline item notice');
                assert.equal(await card(owner), '', 'visible interactive Timers panel owns the notice exclusively');
                assert.equal(captureCalls, 0, 'fresh log events never auto-capture');
                assert.equal(BrowserWindow.getAllWindows().length, 5, 'no fifth overlay or discovery popup');
                assert.equal(focusCalls, focusBefore, 'discovery never focuses a window');
                await capturePage(panels().timers, 'discovery-native-before');
                await control(owner, 'hide');
                await until(async () => (await card(owner)).includes('Synthetic Uncatalogued Sword') && !(await card(panels().timers)), 'hiding Timers moves the pending notice to the main page');
                await capturePage(owner, 'discovery-main-before');
                await control(owner, 'show');
                await until(async () => (await card(panels().timers)).includes('Synthetic Uncatalogued Sword') && !(await card(owner)), 'showing Timers moves the pending notice back exclusively');
                await control(owner, 'pass-through', true);
                await until(async () => (await card(owner)).includes('Synthetic Uncatalogued Sword') && !(await card(panels().timers)), 'click-through Timers falls back to interactive main notices');
                await control(owner, 'pass-through', false);
                await until(async () => (await card(panels().timers)).includes('Synthetic Uncatalogued Sword') && !(await card(owner)), 'restoring Timers mouse input restores its notice placement');
                await control(owner, 'hide');
                await until(async () => (await card(owner)).includes('Synthetic Uncatalogued Sword'), 'main notice before explicit Screenshot');
                await click(owner, 'capture');
                await until(async () => clipboardCalls === 1 && (await card(owner)).includes('Paste your clipboard into discord!'), 'main Screenshot result');
                assert.equal(captureCalls, 1); assert(lastPng.equals(fixtureImage.toPNG()), 'clipboard API receives exactly the synthetic source pixels');
                await capturePage(owner, 'discovery-main-copied');
                await click(owner, 'ignore');
                await until(async () => !(await card(owner)) && !(await card(panels().timers)), 'Ignore removes both shared notices');
                await control(owner, 'show');
                await append('an Uncatalogued Synthetic Keeper scowls at you (Lvl: 26)');
                await until(async () => (await card(panels().timers)).includes('Uncatalogued Synthetic Keeper'), 'native monster notice');
                assert.equal(captureCalls, 1, 'consider never auto-captures');
                await click(panels().timers, 'capture');
                await until(async () => clipboardCalls === 2 && (await card(panels().timers)).includes('Paste your clipboard into discord!'), 'native Screenshot result');
                await capturePage(panels().timers, 'discovery-native-copied');
                await click(panels().timers, 'ignore');
                await until(async () => !(await card(owner)) && !(await card(panels().timers)), 'native Ignore removes shared notice');
                await append('You have looted a Reload Recovery Fixture.');
                await until(async () => (await card(panels().timers)).includes('Reload Recovery Fixture'), 'pre-reload notice');
                owner.webContents.reload();
                await until(() => execute(owner, () => document.querySelector('#bridge-status')?.textContent === 'Live log'), 'owner reload');
                await until(() => execute(owner, async () => (await window.eyeOfZommOverlays.getState()).sessionAvailable), 'reloaded session');
                await execute(owner, () => document.querySelector('[data-view="timers"]').click());
                await until(() => execute(owner, async () => (await window.eyeOfZommDiscovery.action('get-state')).length === 0), 'host pending clear on owner reload');
                await control(owner, 'hide');
                await append('You have looted a Synthetic Uncatalogued Sword.');
                await wait(1500);
                assert.equal(await card(owner), '', 'Ignore persists after a real owner reload');
                await append('You have looted a New Owner Fresh Suggestion.');
                await until(async () => (await card(owner)).includes('New Owner Fresh Suggestion'), 'new owner registers fresh suggestion');
                assert.equal(await execute(owner, async () => (await window.eyeOfZommDiscovery.action('get-state')).length), 1);
                await control(owner, 'show');
                await until(async () => (await card(panels().timers)).includes('New Owner Fresh Suggestion') && !(await card(owner)), 'recovered owner still uses one notice placement');
                assert.equal(BrowserWindow.getAllWindows().length, 5);
                assert.equal(captureCalls, 2); assert.equal(clipboardCalls, 2);
                return { ok:true, overlays:4, popups:0, syntheticCaptures:captureCalls, clipboardCalls, listedConsiderFocus:true, listedKillFocus:true, ignorePersistent:true, reloadRecovery:true, screenshots };
            })().then(result => { console.log('EOZ_DISCOVERY_SMOKE=' + JSON.stringify(result)); app.exit(0); }).catch(error => { console.error(error.stack); app.exit(1); });
        });
        setTimeout(() => { console.error('Discovery smoke exceeded 40 seconds.'); app.exit(2); }, 40000).unref();
        require(path.join(root, 'desktop/main.cjs'));
    };
    await writeFile(join(temporary, 'main.cjs'), `const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});(${run.toString()})(${JSON.stringify({ root, log, screenshots })}).catch(error=>{console.error(error.stack);app.exit(1)});`);
    const result = await new Promise((resolve, reject) => {
        const child = spawn(require('electron'), [temporary, '--disable-gpu', '--mute-audio'], { windowsHide:true, stdio:['ignore', 'pipe', 'pipe'] });
        let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', reject); child.once('exit', code => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /EOZ_DISCOVERY_SMOKE=.*"ok":true/);
    console.log(result.output.match(/EOZ_DISCOVERY_SMOKE=.*/)[0]);
    console.log('Actual Electron inline discovery smoke passed. Only synthetic capture pixels and an in-memory clipboard spy were used; OS clipboard/game capture and physical focus are not certified.');
} finally {
    if (dirname(temporary) !== resolve(tmpdir()) || !basename(temporary).startsWith('eoz-discovery-smoke-')) throw new Error('Unexpected discovery smoke cleanup path');
    await rm(temporary, { recursive:true, force:true });
}
