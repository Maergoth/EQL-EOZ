import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const { AppUpdater, RELEASES_URL, MAX_METADATA_BYTES, MAX_INSTALLER_BYTES, compareVersions, selectRelease,
    isReleaseNotesUrl, trustedDownloadRedirect } = require('../desktop/app-updater.cjs');
const installer = Buffer.from('MZ synthetic installer fixture; never executed.');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonResponse = value => new Response(JSON.stringify(value));
const release = (version = '0.8.2', overrides = {}) => {
    const tag = `v${version}`;
    const name = `EQLWiki-Eye-of-Zomm-Setup-${version}-x64.exe`;
    return { tag_name:tag, draft:false, prerelease:version.startsWith('0.') || version.includes('-'), assets:[{
        name, size:installer.length, digest:`sha256:${sha256(installer)}`,
        browser_download_url:`https://github.com/Maergoth/EQL-EOZ/releases/download/${tag}/${name}`
    }], ...overrides };
};
const tests = [];
const test = (name, run) => tests.push({ name, run });

async function withUpdater(testBody, options = {}) {
    const directory = await mkdtemp(path.join(tmpdir(), 'eoz-app-update-'));
    const calls = [], launches = [], confirmations = [];
    let quits = 0;
    const defaults = {
        version:'0.8.1', cacheDirectory:directory, isPackaged:true, platform:'win32', arch:'x64',
        fetchImpl:async (url, request) => { calls.push({ url, request }); return url === RELEASES_URL ? jsonResponse([release()]) : new Response(installer); },
        confirmInstall:async version => { confirmations.push(version); return true; },
        launchInstaller:async target => { launches.push(target); return ''; },
        onInstallerLaunched:() => { quits += 1; }
    };
    const updater = new AppUpdater({ ...defaults, ...options });
    try { await testBody({ updater, directory, calls, launches, confirmations, quits:() => quits, defaults }); }
    finally { updater.shutdown(); await rm(directory, { recursive:true, force:true }); }
}

test('semantic versions sort numeric fields and prereleases without downgrades', () => {
    assert.equal(compareVersions('0.8.10', '0.8.2'), 1);
    assert.equal(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1);
    assert.equal(compareVersions('1.0.0', '1.0.0-beta.9'), 1);
    assert.equal(compareVersions('1.0.0+new', '1.0.0+old'), 0);
    assert.equal(compareVersions('1.0.0-2', '1.0.0-beta'), -1);
    assert.throws(() => compareVersions('1.0.0-02', '1.0.0'), /version/);
    assert.equal(selectRelease([release('0.8.0'), release('0.8.1')], '0.8.1'), null);
});

test('beta releases are discovered from the releases list and stable users stay stable', () => {
    assert.equal(selectRelease([release('0.8.2'), release('0.8.3'), release('0.8.4', { draft:true })], '0.8.1').version, '0.8.3');
    assert.equal(selectRelease([release('1.1.0-beta.2'), release('1.0.1')], '1.0.0').version, '1.0.1');
    assert.equal(selectRelease([release('1.0.0-beta.2')], '1.0.0-beta.1').version, '1.0.0-beta.2');
    assert.equal(selectRelease([release('1.0.0-beta.2')], '0.8.1'), null);
    assert.equal(selectRelease([release('1.0.0', { prerelease:false })], '0.8.1').version, '1.0.0');
});

test('the newest release must have one exact installer with valid GitHub size and digest', () => {
    for (const mutate of [
        value => { value.assets = []; },
        value => { value.assets.push({ ...value.assets[0] }); },
        value => { value.assets[0].browser_download_url = 'https://github.com/other/repo/releases/download/v0.8.2/evil.exe'; },
        value => { value.assets[0].name = 'other.exe'; },
        value => { value.assets[0].size = MAX_INSTALLER_BYTES + 1; },
        value => { value.assets[0].size = '100'; },
        value => { delete value.assets[0].digest; },
        value => { value.assets[0].digest = 'sha256:invalid'; }
    ]) {
        const value = release();
        mutate(value);
        assert.throws(() => selectRelease([value], '0.8.1'));
    }
    assert.throws(() => selectRelease([release('0.8.3', { assets:[] }), release()], '0.8.1'), /newest release/);
});

test('release notes and redirects stay within the exact project and GitHub asset CDN', () => {
    assert(isReleaseNotesUrl('https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2'));
    assert(isReleaseNotesUrl('https://github.com/Maergoth/EQL-EOZ/releases/tag/v1.0.0-beta.1'));
    for (const url of ['http://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2', 'https://github.com/Maergoth/EQL-EOZ/issues',
        'https://github.com/Maergoth/other/releases/tag/v0.8.2', 'https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2?evil=1',
        'https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2/../../x', 'https://github.com@evil.test/Maergoth/EQL-EOZ/releases/tag/v0.8.2']) assert.equal(isReleaseNotesUrl(url), false);
    const original = release().assets[0].browser_download_url;
    assert(trustedDownloadRedirect('https://release-assets.githubusercontent.com/github-production-release-asset/123/id?token=synthetic', original));
    assert(trustedDownloadRedirect('https://objects.githubusercontent.com/github-production-release-asset-2e65be/123/id', original));
    for (const url of ['https://evil.test/installer.exe', 'http://release-assets.githubusercontent.com/github-production-release-asset/123/id',
        'https://release-assets.githubusercontent.com/arbitrary.exe', 'https://github.com/other/repo/releases/download/v1/foo.exe',
        'https://user@release-assets.githubusercontent.com/github-production-release-asset/123/id']) assert.equal(trustedDownloadRedirect(url, original), false);
});

test('development and unsupported platforms never access the update network or cache', async () => {
    for (const options of [{ isPackaged:false }, { platform:'linux' }, { arch:'arm64' }]) {
        await withUpdater(async ({ updater, calls, directory }) => {
            assert.equal((await updater.startup()).status, 'unsupported');
            await updater.check(); await updater.download(); await updater.install();
            assert.equal(calls.length, 0);
            assert.deepEqual(await readdir(directory), []);
        }, options);
    }
});

test('quiet startup only checks metadata by default, then manual download verifies bytes', async () => {
    await withUpdater(async ({ updater, calls, launches, confirmations, directory }) => {
        const available = await updater.startup();
        assert.equal(available.status, 'available');
        assert.equal(available.availableVersion, '0.8.2');
        assert.equal(available.automaticDownload, false);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, RELEASES_URL);
        assert.equal(calls[0].request.redirect, 'manual');
        const ready = await updater.download();
        assert.equal(ready.status, 'ready');
        assert.equal(ready.downloadedBytes, installer.length);
        assert.equal(calls.length, 2);
        assert.deepEqual(await readFile(path.join(directory, release().assets[0].name)), installer);
        assert.equal(JSON.parse(await readFile(path.join(directory, 'ready.json'))).release.version, '0.8.2');
        assert.equal(launches.length, 0);
        assert.equal(confirmations.length, 0);
        assert.equal(JSON.stringify(ready).includes(directory), false);
    });
});

test('an opt-in survives relaunch, downloads on startup, and never starts an installer', async () => {
    await withUpdater(async ({ updater, defaults, launches, confirmations }) => {
        assert.equal((await updater.setStartupDownload(true)).automaticDownload, true);
        const relaunched = new AppUpdater(defaults);
        assert.equal((await relaunched.startup()).status, 'ready');
        assert.equal((await relaunched.getStatus()).automaticDownload, true);
        assert.equal(launches.length, 0);
        assert.equal(confirmations.length, 0);
        await relaunched.setStartupDownload(false);
        assert.equal((await relaunched.getStatus()).automaticDownload, false);
    });
});

test('a verified ready installer survives quitting without auto execution and is ignored after upgrading', async () => {
    await withUpdater(async ({ updater, defaults, launches }) => {
        await updater.check(); await updater.download();
        const relaunched = new AppUpdater(defaults);
        assert.equal((await relaunched.getStatus()).status, 'ready');
        assert.equal((await relaunched.startup()).status, 'ready');
        assert.equal(launches.length, 0);
        const upgraded = new AppUpdater({ ...defaults, version:'0.8.2' });
        assert.equal((await upgraded.startup()).status, 'current');
    });
});

test('Later keeps the app running; explicit confirmed install hands off only the verified local package', async () => {
    let accept = false;
    await withUpdater(async ({ updater, launches, directory, quits }) => {
        await updater.check(); await updater.download();
        assert.equal((await updater.install()).status, 'ready');
        assert.equal(launches.length, 0);
        assert.equal(quits(), 0);
        accept = true;
        assert.equal((await updater.install()).status, 'installing');
        assert.deepEqual(launches, [path.join(directory, release().assets[0].name)]);
        assert.equal(quits(), 1);
    }, { confirmInstall:async () => accept });
});

test('an edited installer fails re-verification and permits a verified replacement download', async () => {
    await withUpdater(async ({ updater, directory, launches, quits }) => {
        await updater.check(); await updater.download();
        const edited = Buffer.from(installer); edited[0] ^= 1;
        await writeFile(path.join(directory, release().assets[0].name), edited);
        const result = await updater.install();
        assert.equal(result.status, 'available');
        assert.match(result.error, /SHA-256/);
        assert.equal(launches.length, 0);
        assert.equal(quits(), 0);
        assert.equal((await updater.download()).status, 'ready');
        assert.equal((await updater.install()).status, 'installing');
        assert.equal(launches.length, 1);
        assert.equal(quits(), 1);
    });
});

test('Windows handoff failure keeps Eye of Zomm running and exposes no raw operating-system text', async () => {
    await withUpdater(async ({ updater, quits }) => {
        await updater.check(); await updater.download();
        const result = await updater.install();
        assert.equal(result.status, 'ready');
        assert.match(result.error, /Windows could not start/);
        assert.equal(result.error.includes('private'), false);
        assert.equal(quits(), 0);
    }, { launchInstaller:async () => 'private filesystem diagnostic' });
});

test('a hash mismatch never stages a ready update and removes partial files', async () => {
    await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /SHA-256/);
        assert.equal((await readdir(directory)).length, 0);
    }, { fetchImpl:async url => url === RELEASES_URL ? jsonResponse([release('0.8.2', { assets:[{ ...release().assets[0], digest:`sha256:${'0'.repeat(64)}` }] })]) : new Response(installer) });
});

test('declared, streamed, and incomplete installer sizes are rejected', async () => {
    for (const body of [
        () => new Response(installer, { headers:{ 'content-length':String(installer.length + 1) } }),
        () => new Response(Buffer.concat([installer, Buffer.from('extra')])),
        () => new Response(installer.subarray(0, installer.length - 1))
    ]) await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /size|incomplete/);
        assert.deepEqual(await readdir(directory), []);
    }, { fetchImpl:async url => url === RELEASES_URL ? jsonResponse([release()]) : body() });
});

test('metadata response bytes and HTTP errors are bounded without exposing response bodies', async () => {
    for (const response of [
        () => new Response('x'.repeat(MAX_METADATA_BYTES + 1)),
        () => new Response('private remote body', { status:429 }),
        () => new Response('{bad-json')
    ]) await withUpdater(async ({ updater }) => {
        const result = await updater.check();
        assert.equal(result.status, 'unavailable');
        assert.equal(result.error.includes('private'), false);
        assert.ok(result.error.length < 200);
    }, { fetchImpl:async () => response() });
});

test('decoded HTTP response lengths do not confuse compressed transport bytes with installer bytes', async () => {
    await withUpdater(async ({ updater }) => {
        assert.equal((await updater.check()).status, 'available');
        assert.equal((await updater.download()).status, 'ready');
    }, { fetchImpl:async url => new Response(url === RELEASES_URL ? JSON.stringify([release()]) : installer,
        { headers:{ 'content-encoding':'gzip', 'content-length':'5' } }) });
});

test('redirects are manual and an unexpected host cannot receive the installer request', async () => {
    const seen = [];
    await withUpdater(async ({ updater }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /unexpected address/);
        assert.equal(seen.length, 2);
    }, { fetchImpl:async url => { seen.push(url); return url === RELEASES_URL ? jsonResponse([release()]) : new Response(null, { status:302, headers:{ location:'https://evil.test/private.exe' } }); } });
});

test('the exact GitHub CDN redirect can stream and verify the package', async () => {
    const cdn = 'https://release-assets.githubusercontent.com/github-production-release-asset/123/fixture?synthetic=1';
    const seen = [];
    await withUpdater(async ({ updater }) => {
        await updater.check();
        assert.equal((await updater.download()).status, 'ready');
        assert.deepEqual(seen, [RELEASES_URL, release().assets[0].browser_download_url, cdn]);
    }, { fetchImpl:async url => {
        seen.push(url);
        if (url === RELEASES_URL) return jsonResponse([release()]);
        if (url === cdn) return new Response(installer);
        return new Response(null, { status:302, headers:{ location:cdn } });
    } });
});

function stalledResponse(signal, started = () => {}) {
    return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener('abort', () => controller.error(new Error('synthetic private abort text')), { once:true });
        started();
    } }));
}

test('a download deadline remains active after response headers arrive', async () => {
    await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /timed out/);
        assert.deepEqual(await readdir(directory), []);
    }, { downloadTimeoutMs:20, fetchImpl:async (url, { signal }) => url === RELEASES_URL ? jsonResponse([release()]) : stalledResponse(signal) });
});

test('cancelling a streamed download removes staging and permits a later retry', async () => {
    let started;
    const bodyStarted = new Promise(resolve => { started = resolve; });
    let stall = true;
    await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const downloading = updater.download();
        await bodyStarted;
        assert.equal((await updater.getStatus()).status, 'downloading');
        await updater.cancel();
        const result = await downloading;
        assert.equal(result.status, 'available');
        assert.equal(result.error, '');
        assert.deepEqual(await readdir(directory), []);
        stall = false;
        assert.equal((await updater.download()).status, 'ready');
    }, { fetchImpl:async (url, { signal }) => url === RELEASES_URL ? jsonResponse([release()]) : stall ? stalledResponse(signal, started) : new Response(installer) });
});

test('concurrent checks and downloads share one operation instead of duplicating network work', async () => {
    let started;
    const bodyStarted = new Promise(resolve => { started = resolve; });
    let installerRequests = 0;
    await withUpdater(async ({ updater }) => {
        await updater.check();
        const downloading = updater.download();
        await bodyStarted;
        assert.equal((await updater.download()).status, 'downloading');
        assert.equal((await updater.check()).status, 'downloading');
        assert.equal(installerRequests, 1);
        await updater.cancel(); await downloading;
    }, { fetchImpl:async (url, { signal }) => {
        if (url === RELEASES_URL) return jsonResponse([release()]);
        installerRequests += 1;
        return stalledResponse(signal, started);
    } });
});

test('saved records cannot point outside the owned update cache', async () => {
    await withUpdater(async ({ updater, directory, launches }) => {
        const saved = { version:'0.8.2', tag:'v0.8.2', name:'../../other.exe', url:'https://evil.test/other.exe', size:1, sha256:'0'.repeat(64) };
        await writeFile(path.join(directory, 'ready.json'), JSON.stringify({ schema:1, release:saved }));
        const result = await updater.getStatus();
        assert.notEqual(result.status, 'ready');
        await updater.install();
        assert.equal(launches.length, 0);
    });
});

test('preload exposes only the fixed updater actions and main rejects iframe or unrelated IPC senders', async () => {
    const exposures = {}, invoked = [];
    const preload = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
    vm.runInNewContext(preload, { require:() => ({ contextBridge:{ exposeInMainWorld:(name, api) => { exposures[name] = api; } },
        ipcRenderer:{ invoke:(...args) => { invoked.push(args); return Promise.resolve(); } } }) });
    const bridge = exposures.eyeOfZommUpdates;
    await bridge.getStatus(); await bridge.check(); await bridge.download(); await bridge.cancel(); await bridge.setStartupDownload(true); await bridge.install();
    assert.deepEqual(invoked, [['eye-of-zomm:app-update', 'get-status'], ['eye-of-zomm:app-update', 'check'], ['eye-of-zomm:app-update', 'download'],
        ['eye-of-zomm:app-update', 'cancel'], ['eye-of-zomm:app-update', 'startup-download', true], ['eye-of-zomm:app-update', 'install']]);

    const mainPath = new URL('../desktop/main.cjs', import.meta.url);
    const nativeRequire = createRequire(mainPath);
    const handlers = {};
    const mainFrame = { url:'http://127.0.0.1:53147/' };
    const contents = { mainFrame };
    const testWindow = { isDestroyed:() => false, webContents:contents };
    const context = vm.createContext({
        require:name => name === 'electron' ? { app:{ getVersion:() => '0.8.1', getPath:() => tmpdir(), requestSingleInstanceLock:() => false, quit() {}, on() {} },
            ipcMain:{ handle:(name, handler) => { handlers[name] = handler; } } } : name === './app-updater.cjs' ? {
                AppUpdater:class { getStatus() { return { status:'mocked' }; } }, isReleaseNotesUrl
            } : nativeRequire(name),
        __dirname:path.dirname(mainPath.pathname.replace(/^\/(\w:)/, '$1')), process, console, Buffer, URL, testWindow
    });
    vm.runInContext(await readFile(mainPath, 'utf8'), context);
    vm.runInContext('windowRef = testWindow', context);
    const handler = handlers['eye-of-zomm:app-update'];
    const trusted = { sender:contents, senderFrame:mainFrame };
    assert.equal((await handler(trusted, 'get-status')).status, 'mocked');
    await assert.rejects(handler({ sender:{}, senderFrame:mainFrame }, 'download'), /unavailable/);
    await assert.rejects(handler({ sender:contents, senderFrame:{ url:mainFrame.url } }, 'install'), /unavailable/);
    await assert.rejects(handler(trusted, 'arbitrary-action'), /Unknown/);
    await assert.rejects(handler(trusted, 'startup-download', 'true'), /Unknown/);
});

let failures = 0;
for (const { name, run } of tests) {
    try { await run(); console.log(`PASS application updater: ${name}`); }
    catch (error) { failures += 1; console.error(`FAIL application updater: ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
