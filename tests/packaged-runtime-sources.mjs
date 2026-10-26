import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { finished } from 'node:stream/promises';
import asar from '@electron/asar';
import { packagedArchivePaths, PACKAGED_RUNTIME_SOURCES, PACKAGED_RUNTIME_IMAGES, verifyPackagedRuntimeSources, verifyPackagedRuntimeImages } from '../scripts/packaged-runtime-sources.mjs';

const bootstrapPath = 'app/data/eye-of-zomm-pack.bootstrap.json';
const requiredModules = [
    'app/appearance.js', 'app/appearance-presets.json', 'app/appearance-presets.generated.js', 'desktop/appearance.cjs', 'desktop/linux-runtime.cjs', 'desktop/log-selection.cjs', 'desktop/atomic-write-json.cjs',
    bootstrapPath,'app/assets/eye-of-zomm.svg',
    'app/whats-new.js','app/whats-new.css','app/release-history.js','app/release-history-state.js','desktop/window-placement.cjs',
    'app/overlay-map.html','app/map-overlay-3d.js','app/zoneviewer/overlay-mode.js','desktop/overlay-map-policy.cjs',
    'app/map-overlay.js', 'app/map-overlay-data.js', 'app/wiki-discovery.js', 'app/wiki-discovery-ui.js',
    'app/trigger-match-core.js', 'app/trigger-matcher.js', 'app/workers/trigger-match.worker.js',
    'app/timer-alerts.js', 'desktop/discovery-host.cjs', 'desktop/overlay-host.cjs', 'desktop/overlay-docking.cjs', 'desktop/overlay-preload.cjs', 'app/character-walkthrough.js',
    'app/contribution-evidence.js','app/contribution-choice-picker.js','app/contribution-review-view.js',
    'app/contribution-history.js','desktop/contribution-history.cjs','app/loot-classification.js',
    'app/contribution-ignore-identity.js','app/ignored-entities-view.js','desktop/contribution-ignores.cjs',
    'app/loot-set-coverage.js','app/tooltip-delay.js',
    'desktop/discovery-notice-window.cjs','desktop/discovery-notice-preload.cjs','app/discovery-notices.html','app/discovery-notices.js','app/discovery-notices.css',
    'app/character-itembox.js','app/catalog-itembox.js','app/wiki-itembox.css','app/overlay-drag.js','app/discovery-contribution-flow.js',
    'app/capture-png.worker.js','app/inventory-export.js','desktop/inventory-file-host.cjs',
    'app/achievement-export.js','app/character-export-import.js','app/character-achievements-view.js','desktop/achievement-file-host.cjs',
    'app/character-inventory-view.js','app/character-storage.js','app/character-profiles.js','desktop/character-storage.cjs',
    'desktop/live-wiki-cache.cjs','desktop/wiki-item-existence.cjs','app/live-wiki-overlay.js',
    'desktop/contribution-gap-verifier.cjs','app/contribution-discovery-gate.js',
    'app/zone-blueprint.js','app/zone-creation-view.js','app/contribution-queue-controls.js','app/log-context.js','desktop/log-context-history.cjs',
    'app/zone-identity.js', 'app/viewer-zone-selection.js', 'app/viewer-archive-discovery.js', 'app/viewer-archive-header.js', 'app/viewer-gltf-images.js', 'app/viewer-terrain-indices.js', 'app/zone-load-guard.js',
    'app/dot-cast-order.js',
    'app/viewport-framing.js', 'app/established-route-guard.js', 'app/drop-certification.js', 'app/navigation-policy.js', 'app/route-validation.js', 'app/zoneviewer/ZoneViewerApp.js'
];
assert.deepEqual(packagedArchivePaths('linux'), ['dist/linux-unpacked/resources/app.asar'], 'Linux package verification cannot select a stale Windows archive');
assert.deepEqual(packagedArchivePaths('win32'), ['dist/win-unpacked/resources/app.asar']);
assert.throws(() => packagedArchivePaths('unknown'), /No packaged archive contract/);
requiredModules.push('app/zoneviewer/player-state.js','app/character-catalog.js','app/item-base-recovery.js','app/item-base-review.js','app/item-base-review-ui.js','desktop/ocr-runtime.cjs');
for (const relative of requiredModules) assert(PACKAGED_RUNTIME_SOURCES.includes(relative), `Package gate omits ${relative}`);
const checker = await readFile(new URL('../scripts/check-packaged-artifact.mjs', import.meta.url), 'utf8');
assert(checker.includes('verifyPackagedRuntimeSources(packagedText,'), 'Artifact verification must execute the source-byte gate');
assert(checker.includes('verifyPackagedRuntimeImages(packagedBytes,'), 'Artifact verification must compare actual image bytes');

const directory = await mkdtemp(join(tmpdir(), 'eoz-packaged-contract-'));
try {
    const fixture = join(directory, 'source');
    const archive = join(directory, 'app.asar');
    async function buildArchive() {
        // Pinned @electron/asar 3.4.1 returns its WritableStream after end(),
        // before queued bytes finish writing. Wait for finish/close before
        // extracting or rebuilding this same archive, especially on Windows.
        const output = await asar.createPackage(fixture, archive);
        await finished(output, { cleanup:true });
        asar.uncache(archive);
    }
    const sources = new Map(PACKAGED_RUNTIME_SOURCES.map(relative => [relative, `// Synthetic packaged source: ${relative}\n`]));
    // Production-scale synthetic data would pass the older shape/count gate.
    // It must still fail if packaging retains a different dataset generation.
    const bootstrapFixture = {
        meta:{ schemaVersion:3, sample:false, manifestVersion:'fresh-synthetic-manifest', version:'fresh-synthetic-pack' },
        zones:Array.from({ length:124 }, (_, id) => ({ id:`synthetic-zone-${id}` })),
        npcs:Array.from({ length:1000 }, (_, id) => ({ name:`Synthetic NPC ${id}` })),
        items:Array.from({ length:1000 }, (_, id) => ({ name:`Synthetic Item ${id}` }))
    };
    sources.set(bootstrapPath, `${JSON.stringify(bootstrapFixture)}\n`);
    for (const [relative, contents] of sources) {
        const path = join(fixture, relative);
        await mkdir(dirname(path), { recursive:true });
        await writeFile(path, contents);
    }
    const images=new Map(PACKAGED_RUNTIME_IMAGES.map(relative=>[relative,Buffer.from([0x89,0x50,0x4e,0x47,0xff])]));
    for(const [relative,bytes] of images){const path=join(fixture,relative);await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);}
    const sourceText = relative => sources.get(relative);
    const packagedText = relative => {
        try { return asar.extractFile(archive, relative).toString('utf8'); }
        catch (error) {
            if (process.platform !== 'win32') throw error;
            return asar.extractFile(archive, relative.replaceAll('/', '\\')).toString('utf8');
        }
    };
    const packagedBytes=relative=>{try{return asar.extractFile(archive,relative);}catch(error){if(process.platform!=='win32')throw error;return asar.extractFile(archive,relative.replaceAll('/','\\'));}};
    await buildArchive();
    verifyPackagedRuntimeSources(packagedText, sourceText);
    verifyPackagedRuntimeImages(packagedBytes,relative=>images.get(relative));
    for(const relative of PACKAGED_RUNTIME_IMAGES){
        await rm(join(fixture,relative));await buildArchive();
        assert.throws(()=>verifyPackagedRuntimeImages(packagedBytes,path=>images.get(path)),error=>error.message===`Packaged ${relative} is missing.`);
        // 0xff/0xfe both decode to a UTF-8 replacement character. A text-only
        // comparison would miss this corruption; the image gate must not.
        await writeFile(join(fixture,relative),Buffer.from([0x89,0x50,0x4e,0x47,0xfe]));await buildArchive();
        assert.throws(()=>verifyPackagedRuntimeImages(packagedBytes,path=>images.get(path)),error=>error.message===`Packaged ${relative} differs from the reviewed image.`);
        await writeFile(join(fixture,relative),images.get(relative));
    }

    // Verify each newly required runtime module against a real, incomplete ASAR.
    requiredModules.push('app/zoneviewer/player-state.js','app/character-catalog.js','app/item-base-recovery.js','app/item-base-review.js','app/item-base-review-ui.js','desktop/ocr-runtime.cjs');
for (const relative of requiredModules) {
        await rm(join(fixture, relative));
        await buildArchive();
        assert.throws(() => verifyPackagedRuntimeSources(packagedText, sourceText),
            error => error.message === `Packaged ${relative} is missing.`);
        await writeFile(join(fixture, relative), sources.get(relative));
    }
    for (const relative of ['app/route-validation.js', 'app/capture-png.worker.js', 'app/character-inventory-view.js','app/character-storage.js','app/character-profiles.js','desktop/character-storage.cjs']) {
        await writeFile(join(fixture, relative), '// Stale packaged runtime\n');
        await buildArchive();
        assert.throws(() => verifyPackagedRuntimeSources(packagedText, sourceText),
            error => error.message === `Packaged ${relative} differs from the tested source.`);
        await writeFile(join(fixture, relative), sources.get(relative));
    }

    for (const change of [
        pack => { pack.meta.manifestVersion = 'old-synthetic-manifest'; pack.meta.version = 'old-synthetic-pack'; },
        pack => { pack.npcs[0].name = 'Different data with the same manifest version'; }
    ]) {
        const stale = structuredClone(bootstrapFixture);
        change(stale);
        await writeFile(join(fixture, bootstrapPath), `${JSON.stringify(stale)}\n`);
        await buildArchive();
        assert.throws(() => verifyPackagedRuntimeSources(packagedText, sourceText),
            /Packaged app\/data\/eye-of-zomm-pack\.bootstrap\.json differs from the tested source/);
    }
} finally {
    asar.uncacheAll();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()), 'Cleanup must remain in the intended temporary directory');
    assert(basename(directory).startsWith('eoz-packaged-contract-'), 'Cleanup must target this test fixture');
    await rm(directory, { recursive:true, force:true });
}
console.log('Actual ASAR missing/stale runtime-source and exact bootstrap freshness contracts passed.');
