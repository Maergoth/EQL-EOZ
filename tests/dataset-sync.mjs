import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const mainPath = path.join(root, 'desktop/main.cjs');
const source = await readFile(mainPath, 'utf8');
const rendererSource = await readFile(path.join(root, 'app/app.js'), 'utf8');
const nativeRequire = createRequire(mainPath);
const pack = version => ({ meta:{ schemaVersion:3, version, manifestVersion:version, generatedAt:'2026-10-21T00:00:00Z' }, zones:[{ name:'Synthetic Zone' }], npcs:[], items:[] });
const compressedPack = version => gzipSync(JSON.stringify(pack(version)));
const manifestFor = (version, compressed = compressedPack(version)) => ({ version, pack:'synthetic.json.gz', sha256:createHash('sha256').update(compressed).digest('hex') });
const jsonResponse = value => new Response(JSON.stringify(value), { headers:{ 'content-type':'application/json' } });

async function runtime(fetchImpl, options = {}) {
    const userData = await mkdtemp(path.join(tmpdir(), 'eoz-dataset-sync-'));
    const calls = [];
    const app = { getVersion:() => 'test', getPath:() => userData, on() {}, quit() {}, requestSingleInstanceLock:() => false };
    const context = vm.createContext({
        require:name => name === 'electron' ? { app, ipcMain:{ handle() {} } } : nativeRequire(name),
        __dirname:path.dirname(mainPath), process, console, Buffer, URL, AbortController,
        setTimeout:(callback, ms) => setTimeout(callback, options.timeoutCap ? Math.min(ms, options.timeoutCap) : ms),
        clearTimeout,
        fetch:async (url, request) => { calls.push(url); return fetchImpl(url, request); }
    });
    vm.runInContext(source, context, { filename:mainPath });
    const api = vm.runInContext('({ updateStaticDataPack, readResponseBytes, productionPackPath, packStatePath })', context);
    await mkdir(path.dirname(api.productionPackPath()), { recursive:true });
    return {
        ...api, calls,
        async cache(value, version) {
            await writeFile(api.productionPackPath(), typeof value === 'string' ? value : JSON.stringify(value));
            await writeFile(api.packStatePath(), JSON.stringify({ version }));
        },
        cleanup:() => rm(userData, { recursive:true, force:true })
    };
}

async function withRuntime(fetchImpl, test, options) {
    const api = await runtime(fetchImpl, options);
    try { await test(api); }
    finally { await api.cleanup(); }
}

async function runBootstrap(manifest, compressed) {
    const directory = await mkdtemp(path.join(tmpdir(), 'eoz-bootstrap-sync-'));
    const server = http.createServer((request, response) => {
        response.end(request.url === '/manifest.json' ? JSON.stringify(manifest) : compressed);
    });
    try {
        await mkdir(path.join(directory, 'scripts'));
        await copyFile(path.join(root, 'scripts/fetch-bootstrap-pack.mjs'), path.join(directory, 'scripts/fetch-bootstrap-pack.mjs'));
        await writeFile(path.join(directory, 'package.json'), JSON.stringify({ version:'test' }));
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const result = await new Promise((resolve, reject) => {
            const child = spawn(process.execPath, [path.join(directory, 'scripts/fetch-bootstrap-pack.mjs'), '--required'], {
                env:{ ...process.env, EQL_EOZ_MANIFEST_URL:`http://127.0.0.1:${server.address().port}/manifest.json` },
                stdio:['ignore', 'pipe', 'pipe']
            });
            let output = '';
            child.stdout.on('data', chunk => { output += chunk; });
            child.stderr.on('data', chunk => { output += chunk; });
            child.on('error', reject);
            child.on('close', code => resolve({ code, output }));
        });
        const bundled = await readFile(path.join(directory, 'app/data/eye-of-zomm-pack.bootstrap.json'), 'utf8').catch(() => null);
        return { ...result, bundled };
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
        await rm(directory, { recursive:true, force:true });
    }
}

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('a corrupt same-version cache downloads a verified replacement', async () => {
    const compressed = compressedPack('new');
    await withRuntime(url => url.endsWith('manifest.json') ? jsonResponse(manifestFor('new', compressed)) : new Response(compressed), async api => {
        await api.cache('{truncated', 'new');
        const result = await api.updateStaticDataPack(true);
        assert.equal(result.status, 'updated');
        assert.equal(api.calls.length, 2);
        assert.equal(JSON.parse(await readFile(api.productionPackPath(), 'utf8')).meta.manifestVersion, 'new');
    });
});

test('a valid same-version cache avoids a pack download', async () => {
    await withRuntime(() => jsonResponse(manifestFor('same')), async api => {
        await api.cache(pack('same'), 'same');
        assert.equal((await api.updateStaticDataPack()).status, 'current');
        assert.equal(api.calls.length, 1);
    });
});

test('a manifest without SHA-256 cannot replace the last valid cache', async () => {
    const compressed = compressedPack('new');
    await withRuntime(url => url.endsWith('manifest.json') ? jsonResponse({ version:'new', pack:'synthetic.json.gz' }) : new Response(compressed), async api => {
        await api.cache(pack('old'), 'old');
        const before = await readFile(api.productionPackPath(), 'utf8');
        const result = await api.updateStaticDataPack();
        assert.equal(result.ok, false);
        assert.match(result.error, /SHA-256/i);
        assert.equal(await readFile(api.productionPackPath(), 'utf8'), before);
        assert.equal(api.calls.length, 1);
    });
});

test('a SHA-256 mismatch preserves the last valid cache', async () => {
    const compressed = compressedPack('new');
    await withRuntime(url => url.endsWith('manifest.json') ? jsonResponse({ ...manifestFor('new', compressed), sha256:'0'.repeat(64) }) : new Response(compressed), async api => {
        await api.cache(pack('old'), 'old');
        const before = await readFile(api.productionPackPath(), 'utf8');
        const result = await api.updateStaticDataPack();
        assert.equal(result.ok, false);
        assert.match(result.error, /SHA-256/i);
        assert.equal(await readFile(api.productionPackPath(), 'utf8'), before);
    });
});

test('an oversized manifest is rejected before downloading a pack', async () => {
    await withRuntime(() => new Response(' '.repeat(64 * 1024 + 1)), async api => {
        await api.cache(pack('old'), 'old');
        const result = await api.updateStaticDataPack();
        assert.equal(result.ok, false);
        assert.match(result.error, /size limit/i);
        assert.equal(api.calls.length, 1);
        assert.equal(JSON.parse(await readFile(api.productionPackPath(), 'utf8')).meta.manifestVersion, 'old');
    });
});

test('streamed download bytes are bounded even without a content-length header', async () => {
    await withRuntime(() => { throw new Error('No request expected'); }, async api => {
        let canceled = false;
        const response = new Response(new ReadableStream({
            start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(5)); },
            cancel() { canceled = true; }
        }));
        await assert.rejects(api.readResponseBytes(response, 8), /size limit/i);
        assert.equal(canceled, true);
        const exact = await api.readResponseBytes(new Response(new Uint8Array(8)), 8);
        assert.equal(exact.byteLength, 8);
    });
});

test('an oversized declared body is cancelled without waiting for remote cancellation', async () => {
    await withRuntime(() => { throw new Error('No request expected'); }, async api => {
        let canceled = false;
        const response = new Response(new ReadableStream({
            cancel() { canceled = true; return new Promise(() => {}); }
        }), { headers:{ 'content-length':'9' } });
        let timer;
        try {
            await assert.rejects(Promise.race([
                api.readResponseBytes(response, 8),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Waited on remote cancellation')), 100); })
            ]), /unexpectedly large/i);
            assert.equal(canceled, true);
        } finally { clearTimeout(timer); }
    });
});

test('a hash-verified gzip containing invalid pack data preserves the old cache', async () => {
    const compressed = gzipSync('{"meta":{"schemaVersion":3}}');
    await withRuntime(url => url.endsWith('manifest.json') ? jsonResponse(manifestFor('new', compressed)) : new Response(compressed), async api => {
        await api.cache(pack('old'), 'old');
        const before = await readFile(api.productionPackPath(), 'utf8');
        const result = await api.updateStaticDataPack();
        assert.equal(result.ok, false);
        assert.match(result.error, /schema/i);
        assert.equal(await readFile(api.productionPackPath(), 'utf8'), before);
    });
});

test('the download deadline covers a stalled response body after headers arrive', async () => {
    const compressed = compressedPack('new');
    let bodyAborted = false;
    await withRuntime((url, request) => {
        if (url.endsWith('manifest.json')) return jsonResponse(manifestFor('new', compressed));
        return new Response(new ReadableStream({
            start(controller) {
                const timer = setTimeout(() => { controller.enqueue(compressed); controller.close(); }, 100);
                request.signal.addEventListener('abort', () => {
                    bodyAborted = true;
                    clearTimeout(timer);
                    controller.error(new Error('Synthetic download body deadline expired'));
                }, { once:true });
            }
        }));
    }, async api => {
        await api.cache(pack('old'), 'old');
        const before = await readFile(api.productionPackPath(), 'utf8');
        const result = await api.updateStaticDataPack();
        assert.equal(result.ok, false);
        assert.equal(bodyAborted, true);
        assert.equal(await readFile(api.productionPackPath(), 'utf8'), before);
    }, { timeoutCap:20 });
});

test('bootstrap builds reject a manifest without SHA-256', async () => {
    const result = await runBootstrap({ version:'new', pack:'synthetic.json.gz' }, compressedPack('new'));
    assert.notEqual(result.code, 0);
    assert.match(result.output, /SHA-256/i);
    assert.equal(result.bundled, null);
});

test('bootstrap builds reject a SHA-256 mismatch', async () => {
    const result = await runBootstrap({ ...manifestFor('new'), sha256:'0'.repeat(64) }, compressedPack('new'));
    assert.notEqual(result.code, 0);
    assert.match(result.output, /SHA-256/i);
    assert.equal(result.bundled, null);
});

test('bootstrap builds reject hash-verified packs with missing or nonnumeric schemas', async () => {
    for (const schemaVersion of [undefined, 'not-a-schema']) {
        const invalid = { ...pack('new'), meta:{ schemaVersion } };
        const compressed = gzipSync(JSON.stringify(invalid));
        const result = await runBootstrap(manifestFor('new', compressed), compressed);
        assert.notEqual(result.code, 0);
        assert.match(result.output, /schema/i);
        assert.equal(result.bundled, null);
    }
});

test('bootstrap builds accept a verified pack and record its manifest version', async () => {
    const compressed = compressedPack('new');
    const result = await runBootstrap(manifestFor('new', compressed), compressed);
    assert.equal(result.code, 0, result.output);
    assert.equal(JSON.parse(result.bundled).meta.manifestVersion, 'new');
});

test('the renderer skips primary caches with missing or nonnumeric schema versions', async () => {
    const start = rendererSource.indexOf('async function loadPack()');
    const end = rendererSource.indexOf('async function connectBridge()', start);
    assert(start >= 0 && end > start, 'Renderer pack loader remains available for behavioral testing');
    for (const schemaVersion of [undefined, 'not-a-schema']) {
        const calls = [];
        const context = vm.createContext({
            pack:{ meta:{}, zones:[], npcs:[], items:[] }, parser:{}, settings:{},
            fetch:async url => {
                calls.push(url);
                return jsonResponse(url.includes('bootstrap') ? pack('fallback') : { ...pack('invalid'), meta:{ schemaVersion } });
            },
            rebuildPackIndexes() {}, buildEraSelect() {}, buildItemSlotSelect() {}, renderAll() {},
            $:() => ({ textContent:'' })
        });
        vm.runInContext(rendererSource.slice(start, end), context);
        await vm.runInContext('loadPack()', context);
        assert.equal(context.pack.meta.manifestVersion, 'fallback');
        assert.equal(calls.length, 2);
    }
});

let failures = 0;
for (const { name, run } of tests) {
    try { await run(); console.log(`PASS dataset sync: ${name}`); }
    catch (error) { failures += 1; console.error(`FAIL dataset sync: ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
