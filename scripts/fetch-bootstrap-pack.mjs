import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'app/data/companion-pack.bootstrap.json');
const MANIFEST_URL = process.env.EQL_COMPANION_MANIFEST_URL || 'https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json';
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

try {
    const manifestResponse = await fetch(MANIFEST_URL, {
        headers: { 'User-Agent': 'EQLWiki-EyeOfZomm-build/0.3.0', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(10_000)
    });
    if (!manifestResponse.ok) fail(`Bootstrap manifest HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (!manifest?.version || !manifest?.pack) fail('Bootstrap manifest is missing version or pack');

    const packUrl = new URL(String(manifest.pack), MANIFEST_URL).toString();
    const packResponse = await fetch(packUrl, {
        headers: { 'User-Agent': 'EQLWiki-EyeOfZomm-build/0.3.0', 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(60_000)
    });
    if (!packResponse.ok) fail(`Eye of Zomm bootstrap pack HTTP ${packResponse.status}`);

    const compressed = Buffer.from(await packResponse.arrayBuffer());
    if (manifest.sha256) {
        const actual = createHash('sha256').update(compressed).digest('hex');
        if (actual.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
            fail('Eye of Zomm bootstrap pack failed SHA-256 verification');
        }
    }

    const decoded = JSON.parse(gunzipSync(compressed).toString('utf8'));
    if (!Array.isArray(decoded?.zones) || !Array.isArray(decoded?.npcs) || !Array.isArray(decoded?.items)) {
        fail('Eye of Zomm bootstrap pack schema is invalid');
    }

    decoded.meta = { ...(decoded.meta || {}), bundledAtBuild: true, manifestVersion: String(manifest.version) };
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, `${JSON.stringify(decoded)}\n`, 'utf8');
    console.log(`Bundled Eye of Zomm production dataset ${manifest.version}: ${decoded.zones.length} zones, ${decoded.npcs.length} NPCs, ${decoded.items.length} items.`);
} catch (error) {
    try { await rm(OUT, { force: true }); } catch {}
    fail('Unable to fetch production bootstrap pack', error);
}
