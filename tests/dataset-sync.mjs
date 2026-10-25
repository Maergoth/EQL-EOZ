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
const classificationPack=(version,count=6)=>{
    const npcNames=Array.from({length:count},(_,i)=>'Synthetic Global Guardian '+i),counts={lootSourceCount:count,lootSourceCountComplete:true,lootSourceNpcs:npcNames};
    return {...pack(version),meta:{...pack(version).meta,sample:false,wikiEntitiesComplete:true,lootSourceCountsVersion:2,wikiRelationshipCoverageVersion:1},
        wikiEntities:{items:['Synthetic Gear','Statless Shared Material','Synthetic Staff: Water'],npcs:npcNames,titles:['Synthetic Gear','Statless Shared Material','Synthetic Staff: Water',...npcNames]},
        npcs:npcNames.map((name,index)=>({name,wikiTitle:name,zone:index%2?'Second Zone':'Synthetic Zone',aliases:index===0?['Guardian Redirect']:[]})),
        items:[{name:'Synthetic Gear',wikiTitle:'Synthetic Gear',contributionCard:{schemaVersion:1,complete:true,questContext:true},...counts}],
        wikiRelationshipCoverage:{'Statless Shared Material':{schemaVersion:1,kind:'item',wikiTitle:'Statless Shared Material',revisionId:73,state:'broad',complete:false,edges:[{npc:npcNames[0],zone:'',instance:'normal',field:'dropsfrom',precision:'npc',verifiedNpc:true,source:{wikiTitle:'Statless Shared Material',revisionId:73,field:'dropsfrom',section:'',instance:'normal'}}],scopes:[{zone:'',instance:'normal',field:'dropsfrom',state:'broad',reason:'generic-source-group'}],collectionRefs:[]}},
        lootSourceCounts:{'Synthetic Gear':counts,'Statless Shared Material':counts,'Synthetic Staff: Water':{lootSourceCount:2,lootSourceCountComplete:false,lootSourceNpcs:npcNames.slice(0,2)}}};
};
const compressedPack = version => gzipSync(JSON.stringify(pack(version)));
const manifestFor = (version, compressed = compressedPack(version)) => ({ version, pack:'synthetic.json.gz', sha256:createHash('sha256').update(compressed).digest('hex') });
const jsonResponse = value => new Response(JSON.stringify(value), { headers:{ 'content-type':'application/json' } });

function fakeClock(start = '2026-10-21T12:00:00Z') {
    let at = Date.parse(start), nextId = 0;
    const timers = new Map();
    class ClockDate extends Date {
        constructor(...args) { super(...(args.length ? args : [at])); }
        static now() { return at; }
    }
    return { Date:ClockDate, now:() => at, timers,
        setTimeout(callback, delay) { const timer = { id:++nextId, at:at + delay, delay, callback, unref() {} }; timers.set(timer.id, timer); return timer; },
        clearTimeout(timer) { timers.delete(timer?.id); },
        advance(milliseconds) {
            at += milliseconds;
            for (const timer of [...timers.values()].sort((a,b) => a.at - b.at)) if (timers.has(timer.id) && timer.at <= at) {
                timers.delete(timer.id); timer.callback();
            }
        }
    };
}

async function runtime(fetchImpl, options = {}) {
    const userData = await mkdtemp(path.join(tmpdir(), 'eoz-dataset-sync-'));
    const calls = [];
    const app = { getVersion:() => 'test', getPath:() => userData, on() {}, quit() {}, requestSingleInstanceLock:() => false };
    const context = vm.createContext({
        require:name => name === 'electron' ? { app, ipcMain:{ handle() {} } } : nativeRequire(name),
        __dirname:path.dirname(mainPath), process, console, Buffer, URL, AbortController, Date:options.clock?.Date || Date,
        setTimeout:options.clock?.setTimeout || ((callback, ms) => setTimeout(callback, options.timeoutCap ? Math.min(ms, options.timeoutCap) : ms)),
        clearTimeout:options.clock?.clearTimeout || clearTimeout,
        fetch:async (url, request) => { calls.push(url); return fetchImpl(url, request); }
    });
    vm.runInContext(source, context, { filename:mainPath });
    if(options.bundledPack){context.syntheticBootstrapPath=path.join(userData,'synthetic-bootstrap.json');await writeFile(context.syntheticBootstrapPath,JSON.stringify(options.bundledPack));vm.runInContext('bundledBootstrapPath=()=>syntheticBootstrapPath;',context);}
    const api = vm.runInContext('({ updateStaticDataPack, startDataPackRefresh, stopDataPackRefresh, dataPackRefreshState, readPackState, readResponseBytes, productionPackPath, packStatePath, sendBuffer, automaticWikiCatalog })', context);
    await mkdir(path.dirname(api.productionPackPath()), { recursive:true });
    return {
        ...api, calls,
        async cache(value, version, state = {}) {
            await writeFile(api.productionPackPath(), typeof value === 'string' ? value : JSON.stringify(value));
            await writeFile(api.packStatePath(), JSON.stringify({ version, ...state }));
        },
        cleanup:() => { api.stopDataPackRefresh(); return rm(userData, { recursive:true, force:true }); }
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

test('startup, manual and hourly checks share one transfer and schedule from completion', async () => {
    const clock = fakeClock(), hour = 60 * 60 * 1000;
    let releaseManifest, reportStarted;
    const gate = new Promise(resolve => { releaseManifest = resolve; });
    const started = new Promise(resolve => { reportStarted = resolve; });
    let manifests = 0;
    await withRuntime(() => {
        manifests++;
        if (manifests === 1) { reportStarted(); return gate; }
        return jsonResponse(manifestFor('same'));
    }, async api => {
        await api.cache(pack('same'), 'same');
        const startup = api.startDataPackRefresh();
        await started;
        assert.equal(api.startDataPackRefresh(), startup, 'Starting the owner twice cannot start another schedule or request');
        assert.equal(api.updateStaticDataPack(true), startup, 'A manual click joins the exact startup promise');
        assert.equal(api.updateStaticDataPack(false), startup);
        assert.equal(api.dataPackRefreshState().checking, true);
        assert.equal(api.dataPackRefreshState().nextCheckUtc, '', 'No hourly timer competes with a running transfer');
        clock.advance(1234);
        releaseManifest(jsonResponse(manifestFor('same')));
        const first = await startup;
        assert.equal(api.calls.length, 1, 'An unchanged dataset uses only the small manifest');
        assert.equal(first.status, 'current');
        assert.equal(first.dataPack.checking, false);
        assert.equal(first.dataPack.lastSuccessUtc, new clock.Date().toISOString());
        assert.equal(first.dataPack.generatedAtUtc, '2026-10-21T00:00:00Z', 'Dataset generation is distinct from the time this PC checked it');
        assert.equal(first.dataPack.nextCheckUtc, new clock.Date(clock.now() + hour).toISOString());
        assert.equal([...clock.timers.values()].filter(timer => timer.delay === hour).length, 1);
        clock.advance(hour - 1);
        assert.equal(api.calls.length, 1, 'No remote polling before the full completion-relative hour');
        clock.advance(1);
        const next = await api.updateStaticDataPack(true);
        assert.equal(api.calls.length, 2, 'A manual click during the hourly check joins it');
        assert.equal(next.dataPack.lastSuccessUtc, new clock.Date().toISOString());
        api.stopDataPackRefresh();
        clock.advance(2 * hour);
        assert.equal(api.calls.length, 2, 'Shutdown cancels future refreshes');
        assert.equal(api.dataPackRefreshState().nextCheckUtc, '');
    }, { clock });
});

test('manual sync moves the hourly deadline and a failed check preserves last-good data and success time', async () => {
    const clock = fakeClock(), hour = 60 * 60 * 1000;
    let unavailable = false;
    await withRuntime(() => {
        if (unavailable) throw Error('Synthetic offline manifest');
        return jsonResponse(manifestFor('same'));
    }, async api => {
        const downloadedAt = '2026-10-20T18:00:00Z';
        await api.cache(pack('same'), 'same', { lastUpdatedUtc:downloadedAt });
        await api.startDataPackRefresh();
        clock.advance(hour / 2);
        const manual = await api.updateStaticDataPack(true);
        const lastSuccess = manual.dataPack.lastSuccessUtc;
        assert.equal(manual.dataPack.lastUpdatedUtc, downloadedAt, 'A successful same-version check is not reported as a fresh download');
        assert.equal(manual.dataPack.nextCheckUtc, new clock.Date(clock.now() + hour).toISOString());
        clock.advance(hour / 2);
        assert.equal(api.calls.length, 2, 'The superseded startup deadline cannot fire after a manual check');
        unavailable = true;
        const before = await readFile(api.productionPackPath(), 'utf8');
        clock.advance(hour / 2);
        const failed = await api.updateStaticDataPack(true);
        assert.equal(api.calls.length, 3);
        assert.equal(failed.ok, false);
        assert.equal(failed.dataPack.lastStatus, 'unavailable');
        assert.match(failed.dataPack.lastError, /Synthetic offline/);
        assert.equal(failed.dataPack.lastSuccessUtc, lastSuccess);
        assert.equal(failed.dataPack.lastUpdatedUtc, downloadedAt);
        assert.equal(failed.dataPack.generatedAtUtc, '2026-10-21T00:00:00Z');
        assert.equal(failed.dataPack.version, 'same');
        assert.equal(await readFile(api.productionPackPath(), 'utf8'), before);
        assert.equal(failed.dataPack.nextCheckUtc, new clock.Date(clock.now() + hour).toISOString(), 'Offline checks retry hourly without a fast retry loop');
        assert.equal([...clock.timers.values()].filter(timer => timer.delay === hour).length, 1);
    }, { clock });
});

test('overlapping checks cannot download or atomically replace the pack twice', async () => {
    const clock = fakeClock(), compressed = compressedPack('new');
    let releaseDownload, reportStarted;
    const gate = new Promise(resolve => { releaseDownload = resolve; });
    const started = new Promise(resolve => { reportStarted = resolve; });
    await withRuntime(url => {
        if (url.endsWith('manifest.json')) return jsonResponse(manifestFor('new', compressed));
        reportStarted(); return gate;
    }, async api => {
        await api.cache(pack('old'), 'old');
        const first = api.startDataPackRefresh();
        await started;
        assert.equal(api.updateStaticDataPack(true), first);
        assert.equal(api.updateStaticDataPack(false), first);
        assert.equal(api.calls.length, 2, 'One manifest and one gzip serve every concurrent caller');
        assert.equal(JSON.parse(await readFile(api.productionPackPath(), 'utf8')).meta.version, 'old', 'The old pack stays usable until the complete download is verified');
        clock.advance(1000);
        releaseDownload(new Response(compressed));
        const result = await first;
        assert.equal(result.status, 'updated');
        assert.equal(result.dataPack.lastUpdatedUtc, new clock.Date().toISOString());
        assert.equal(result.dataPack.lastSuccessUtc, result.dataPack.lastUpdatedUtc);
        assert.equal(result.dataPack.generatedAtUtc, '2026-10-21T00:00:00Z');
        assert.equal(JSON.parse(await readFile(api.productionPackPath(), 'utf8')).meta.manifestVersion, 'new');
        assert.equal(api.calls.length, 2);
    }, { clock });
});

test('global loot counts and NPC aliases survive verified installation and native catalog replacement',async()=>{
    const value=classificationPack('global-counts-v1'),compressed=gzipSync(JSON.stringify(value));
    await withRuntime(url=>url.endsWith('manifest.json')?jsonResponse(manifestFor('global-counts-v1',compressed)):new Response(compressed),async api=>{
        assert.equal((await api.updateStaticDataPack(true)).status,'updated');
        const installed=JSON.parse(await readFile(api.productionPackPath(),'utf8'));
        assert.equal(installed.meta.lootSourceCountsVersion,2);
        assert.deepEqual(installed.lootSourceCounts,value.lootSourceCounts,'Statless/missing-item count index is retained outside the browse-item array');
        assert.deepEqual(installed.wikiRelationshipCoverage,value.wikiRelationshipCoverage,'Statless scoped positive facts and broad capabilities survive verified installation');
        assert.deepEqual(installed.items[0].contributionCard,value.items[0].contributionCard,'Verified installation retains full-card absence proof without reinterpreting quest context');
        assert.deepEqual(installed.items[0].lootSourceNpcs,value.items[0].lootSourceNpcs);
        assert.equal(installed.items[0].lootSourceCountComplete,true);
        assert.deepEqual(installed.npcs[0].aliases,['Guardian Redirect']);
        const first=await api.automaticWikiCatalog();assert.deepEqual(JSON.parse(JSON.stringify(first.lootSourceCounts)),value.lootSourceCounts,'Native contribution provider sees the full installed pack');
        assert.deepEqual(JSON.parse(JSON.stringify(first.wikiRelationshipCoverage)),value.wikiRelationshipCoverage);
        assert.deepEqual(JSON.parse(JSON.stringify(first.items[0].contributionCard)),value.items[0].contributionCard);
        const replacement=classificationPack('global-counts-v2',7);await api.cache(replacement,'global-counts-v2');
        const next=await api.automaticWikiCatalog();assert.equal(next.lootSourceCounts['Statless Shared Material'].lootSourceCount,7,'Provider reloads new file generation instead of retaining stale counts');assert.notEqual(first,next);
    });
});

test('native offline catalog fallback preserves bundled global count provenance',async()=>{
    const value=classificationPack('bundled-counts');
    await withRuntime(()=>{throw Error('The offline catalog must not contact the wiki or dataset host');},async api=>{
        const bundled=await api.automaticWikiCatalog();assert.deepEqual(JSON.parse(JSON.stringify(bundled.lootSourceCounts)),value.lootSourceCounts);assert.equal(bundled.meta.lootSourceCountsVersion,2);assert.deepEqual(Array.from(bundled.npcs[0].aliases),['Guardian Redirect']);assert.equal(api.calls.length,0);
        assert.deepEqual(JSON.parse(JSON.stringify(bundled.wikiRelationshipCoverage)),value.wikiRelationshipCoverage);
        assert.deepEqual(JSON.parse(JSON.stringify(bundled.items[0].contributionCard)),value.items[0].contributionCard);
    },{bundledPack:value});
});

test('Wiki data Settings distinguish successful checks, generation, downloads and offline errors', () => {
    const from = rendererSource.indexOf('function renderPackSyncStatus(');
    const to = rendererSource.indexOf('async function checkForDesktopPackRefresh()', from);
    assert(from >= 0 && to > from);
    const elements = new Map();
    const context = vm.createContext({ Date,
        pack:{ meta:{ generatedAt:'2026-10-19T00:00:00Z' } }, bridgeInfo:{ productionPack:true },
        $:selector => { if (!elements.has(selector)) elements.set(selector, { textContent:'', hidden:false }); return elements.get(selector); }
    });
    vm.runInContext(`${rendererSource.slice(from,to)};this.render=renderPackSyncStatus;`, context);
    context.render({ checking:false, lastStatus:'current', lastCheckUtc:'2026-10-21T12:00:00Z', lastSuccessUtc:'2026-10-21T12:00:00Z',
        generatedAtUtc:'2026-10-20T00:00:00Z',lastUpdatedUtc:'2026-10-20T06:00:00Z',nextCheckUtc:'2026-10-21T13:00:00Z' });
    assert.equal(elements.get('#pack-update-status').textContent,'current');
    assert.equal(elements.get('#pack-last-success').textContent,new Date('2026-10-21T12:00:00Z').toLocaleString());
    assert.equal(elements.get('#pack-data-generated').textContent,new Date('2026-10-20T00:00:00Z').toLocaleString());
    assert.equal(elements.get('#pack-last-download').textContent,new Date('2026-10-20T06:00:00Z').toLocaleString());
    assert.equal(elements.get('#pack-sync-error').hidden,true);
    context.render({ checking:true });
    assert.match(elements.get('#pack-update-status').textContent,/checking/);
    assert.match(elements.get('#pack-next-check').textContent,/completes/);
    context.render({ checking:false,lastStatus:'unavailable',lastError:'Synthetic offline check',lastSuccessUtc:'2026-10-21T12:00:00Z' });
    assert.equal(elements.get('#pack-sync-error').hidden,false);
    assert.equal(elements.get('#pack-sync-error').textContent,'Synthetic offline check');
    assert.equal(elements.get('#pack-last-success').textContent,new Date('2026-10-21T12:00:00Z').toLocaleString());
});

test('desktop response policy permits the local WASM worker without JavaScript eval', async () => {
    await withRuntime(() => { throw new Error('No network request expected'); }, async api => {
        let headers;
        api.sendBuffer({ method:'GET' }, { writeHead(_status, value) { headers = value; }, end() {} }, 200, 'text/javascript', Buffer.from('synthetic worker'));
        const policy = headers['Content-Security-Policy'];
        const script = policy.split(';').find(value => value.trim().startsWith('script-src '));
        assert.ok(script.includes("'wasm-unsafe-eval'"), 'Recast WebAssembly compilation must be allowed by the served policy');
        assert.equal(script.includes("'unsafe-eval'"), false, 'JavaScript eval remains disallowed');
        assert.match(policy, /worker-src 'self' blob:/);
        assert.match(policy, /connect-src 'self'/);
    });
});

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

test('bootstrap packaging preserves complete and incomplete global count records and aliases',async()=>{
    const value=classificationPack('global-bootstrap'),compressed=gzipSync(JSON.stringify(value)),result=await runBootstrap(manifestFor('global-bootstrap',compressed),compressed);
    assert.equal(result.code,0,result.output);const bundled=JSON.parse(result.bundled);
    assert.equal(bundled.meta.lootSourceCountsVersion,2);assert.deepEqual(bundled.lootSourceCounts,value.lootSourceCounts);assert.deepEqual(bundled.items[0].lootSourceNpcs,value.items[0].lootSourceNpcs);assert.deepEqual(bundled.npcs[0].aliases,['Guardian Redirect']);assert.equal(bundled.meta.bundledAtBuild,true);
    assert.equal(bundled.meta.wikiRelationshipCoverageVersion,1);assert.deepEqual(bundled.wikiRelationshipCoverage,value.wikiRelationshipCoverage);
    assert.deepEqual(bundled.items[0].contributionCard,value.items[0].contributionCard);
});

test('renderer fallback retains the whole producer count index for contribution previews',async()=>{
    const start=rendererSource.indexOf('async function loadPack()'),end=rendererSource.indexOf('async function connectBridge()',start),value=classificationPack('renderer-counts'),calls=[];
    const context=vm.createContext({pack:{meta:{},zones:[],npcs:[],items:[]},parser:{},settings:{},fetch:async url=>{calls.push(url);if(!url.includes('bootstrap'))throw Error('No local cache');return jsonResponse(value);},rebuildPackIndexes(){},buildEraSelect(){},buildItemSlotSelect(){},renderAll(){},$:()=>({textContent:''})});
    vm.runInContext(rendererSource.slice(start,end),context);await vm.runInContext('loadPack()',context);
    assert.deepEqual(context.pack.lootSourceCounts,value.lootSourceCounts);assert.equal(context.pack.meta.lootSourceCountsVersion,2);assert.deepEqual(context.pack.npcs[0].aliases,['Guardian Redirect']);assert.equal(calls.length,2);
    assert.deepEqual(context.pack.wikiRelationshipCoverage,value.wikiRelationshipCoverage);
    assert.deepEqual(context.pack.items[0].contributionCard,value.items[0].contributionCard);
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
