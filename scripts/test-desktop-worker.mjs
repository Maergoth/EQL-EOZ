import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the real desktop response CSP and bundled browser worker, rather
// than only calling the navigation engine from Node. All files are synthetic.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const electron = require('electron');
const temporary = await mkdtemp(join(tmpdir(), 'eoz-worker-smoke-'));
try {
    const profile = join(temporary, 'profile');
    const game = join(temporary, 'synthetic-game');
    await mkdir(profile);
    await mkdir(join(game, 'Logs'), { recursive:true });
    const logPath = join(game, 'Logs', 'eqlog_Fixture_Test.txt');
    await writeFile(logPath, '');
    await writeFile(join(profile, 'eye-of-zomm-config.json'), JSON.stringify({ eqRootPath:game, logPath, logSelection:'manual' }));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    await writeFile(join(temporary, 'package.json'), JSON.stringify({ name:'eoz-worker-smoke', version:pkg.version, main:'main.cjs' }));
    const browserTest = async () => {
        const appUpdate = await window.eyeOfZommUpdates.getStatus();
        if (appUpdate.supported !== false || appUpdate.isPackaged !== false || appUpdate.status !== 'unsupported') {
            throw new Error('Development desktop updater must be exposed through trusted IPC without offering installation.');
        }
        if((await window.eyeOfZommUpdates.install()).status!=='unsupported')throw new Error('Development IPC cannot start a silent installer.');
        document.querySelector('[data-view="settings"]').click();
        if (!document.getElementById('check-app-update').disabled || !document.getElementById('install-app-update').hidden) {
            throw new Error('Application update controls must reflect development-mode support.');
        }
        let evalBlocked = false;
        try { new Function('return 1')(); } catch { evalBlocked = true; }
        const worker = new Worker('/workers/recast-route.worker.js', { type:'module' });
        try {
            const request = {
                start:{ x:5, y:0, z:5 }, goal:{ x:15, y:0, z:15 },
                geometry:{ positions:new Float32Array([0,0,0, 0,0,20, 20,0,20, 20,0,0]), indices:new Uint32Array([0,1,2, 0,2,3]) }
            };
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Browser worker timed out')), 10000);
                worker.onmessage = event => { clearTimeout(timer); resolve(event.data.result); };
                worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message)); };
                worker.postMessage({ id:'synthetic-smoke', action:'route', request });
            });
            return { evalBlocked, appUpdateStatus:appUpdate.status, ok:result.ok, status:result.status, violations:result.violationCount, reason:result.reason };
        } finally { worker.terminate(); }
    };
    const main = `const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(profile)});
BrowserWindow.prototype.show = () => {};
global.fetch = async () => { throw new Error('External network disabled for synthetic smoke'); };
setTimeout(() => app.exit(2), 20000).unref();
app.on('browser-window-created', (_event, window) => {
    window.webContents.once('did-finish-load', async () => {
        try {
            const result = await window.webContents.executeJavaScript(${JSON.stringify(`(${browserTest.toString()})()`)});
            console.log('EOZ_WORKER_SMOKE=' + JSON.stringify(result));
            app.exit(result.ok && result.evalBlocked && result.violations === 0 ? 0 : 1);
        } catch (error) { console.error(error.message); app.exit(1); }
    });
});
require(${JSON.stringify(join(root, 'desktop/main.cjs'))});
`;
    await writeFile(join(temporary, 'main.cjs'), main);
    const result = await new Promise((resolve, reject) => {
        const child = spawn(electron, [temporary, '--disable-gpu'], { windowsHide:true, stdio:['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; });
        child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', reject);
        child.once('exit', code => resolve({ code, output }));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /EOZ_WORKER_SMOKE=.*"ok":true/);
    assert.match(result.output, /"appUpdateStatus":"unsupported"/);
    console.log('Actual Electron updater IPC/UI and CSP/browser worker smoke passed: unsupported dev installer, WASM route ready, zero violations, JavaScript eval blocked.');
} finally {
    if (dirname(temporary) !== resolve(tmpdir()) || !basename(temporary).startsWith('eoz-worker-smoke-')) throw new Error('Unexpected smoke-test cleanup path');
    await rm(temporary, { recursive:true, force:true });
}
