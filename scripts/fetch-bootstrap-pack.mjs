import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'app/data/eye-of-zomm-pack.bootstrap.json');
const APP_VERSION = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8')).version;
const USER_AGENT = `EQLWiki-EyeOfZomm-build/${APP_VERSION}`;
const MANIFEST_URL = process.env.EQL_EOZ_MANIFEST_URL || 'https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json';
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024 * 1024;
const required = process.argv.includes('--required');

function fail(message, error) {
    const detail = error ? `: ${error.message || error}` : '';
    if (required) {
        console.error(`${message}${detail}`);
        process.exit(1);
    }
    console.warn(`${message}${detail}`);
    process.exit(0);
}

async function readResponseBytes(response, maxBytes) {
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxBytes) {
        void response.body?.cancel().catch(() => {});
        throw new Error('Eye of Zomm bootstrap download is unexpectedly large.');
    }
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                void reader.cancel().catch(() => {});
                throw new Error('Eye of Zomm bootstrap download exceeded the size limit.');
            }
            chunks.push(Buffer.from(value));
        }
        return Buffer.concat(chunks, size);
    } finally {
        reader.releaseLock();
    }
}

try {
    const manifestResponse = await fetch(MANIFEST_URL, {
        headers: { 'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(10_000)
    });
    if (!manifestResponse.ok) fail(`Bootstrap manifest HTTP ${manifestResponse.status}`);
    const manifest = JSON.parse((await readResponseBytes(manifestResponse, MAX_MANIFEST_BYTES)).toString('utf8'));
    if (!manifest?.version || !manifest?.pack) fail('Bootstrap manifest is missing version or pack');
    if (!/^[A-Za-z0-9._-]+\.json\.gz$/.test(String(manifest.pack))) fail('Bootstrap manifest contains an invalid pack filename');
    if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ''))) fail('Bootstrap manifest is missing a valid SHA-256 checksum');

    const packUrl = new URL(String(manifest.pack), MANIFEST_URL).toString();
    const packResponse = await fetch(packUrl, {
        headers: { 'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(60_000)
    });
    if (!packResponse.ok) fail(`Eye of Zomm bootstrap pack HTTP ${packResponse.status}`);

    const compressed = await readResponseBytes(packResponse, MAX_DOWNLOAD_BYTES);
    const actual = createHash('sha256').update(compressed).digest('hex');
    if (actual.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
        fail('Eye of Zomm bootstrap pack failed SHA-256 verification');
    }

    const decoded = JSON.parse(gunzipSync(compressed, { maxOutputLength:MAX_JSON_BYTES }).toString('utf8'));
    if (!(Number(decoded?.meta?.schemaVersion) >= 3) || !Array.isArray(decoded?.zones) || !Array.isArray(decoded?.npcs) || !Array.isArray(decoded?.items)) {
        fail('Eye of Zomm bootstrap pack schema v3 or newer is required');
    }

    decoded.meta = { ...(decoded.meta || {}), bundledAtBuild: true, manifestVersion: String(manifest.version) };
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(decoded)}\n`, 'utf8');
    console.log(`Bundled Eye of Zomm production dataset ${manifest.version}: ${decoded.zones.length} zones, ${decoded.npcs.length} NPCs, ${decoded.items.length} items.`);
} catch (error) {
    try { await rm(OUT, { force: true }); } catch {}
    fail('Unable to fetch production bootstrap pack', error);
}
