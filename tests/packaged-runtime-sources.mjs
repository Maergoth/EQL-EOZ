import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import asar from '@electron/asar';
import { PACKAGED_RUNTIME_SOURCES, verifyPackagedRuntimeSources } from '../scripts/packaged-runtime-sources.mjs';

const requiredModules = [
    'app/zone-identity.js', 'app/viewer-zone-selection.js', 'app/zone-load-guard.js',
    'app/viewport-framing.js', 'app/established-route-guard.js', 'app/navigation-policy.js', 'app/route-validation.js', 'app/zoneviewer/ZoneViewerApp.js'
];
for (const relative of requiredModules) assert(PACKAGED_RUNTIME_SOURCES.includes(relative), `Package gate omits ${relative}`);
const checker = await readFile(new URL('../scripts/check-packaged-artifact.mjs', import.meta.url), 'utf8');
assert(checker.includes('verifyPackagedRuntimeSources(packagedText,'), 'Artifact verification must execute the source-byte gate');

const directory = await mkdtemp(join(tmpdir(), 'eoz-packaged-contract-'));
try {
    const fixture = join(directory, 'source');
    const archive = join(directory, 'app.asar');
    const sources = new Map(PACKAGED_RUNTIME_SOURCES.map(relative => [relative, `// Synthetic packaged source: ${relative}\n`]));
    for (const [relative, contents] of sources) {
        const path = join(fixture, relative);
        await mkdir(dirname(path), { recursive:true });
        await writeFile(path, contents);
    }
    const sourceText = relative => sources.get(relative);
    const packagedText = relative => {
        try { return asar.extractFile(archive, relative).toString('utf8'); }
        catch (error) {
            if (process.platform !== 'win32') throw error;
            return asar.extractFile(archive, relative.replaceAll('/', '\\')).toString('utf8');
        }
    };
    await asar.createPackage(fixture, archive);
    verifyPackagedRuntimeSources(packagedText, sourceText);

    // Verify each newly required runtime module against a real, incomplete ASAR.
    for (const relative of requiredModules) {
        await rm(join(fixture, relative));
        await asar.createPackage(fixture, archive);
        asar.uncache(archive);
        assert.throws(() => verifyPackagedRuntimeSources(packagedText, sourceText),
            error => error.message === `Packaged ${relative} is missing.`);
        await writeFile(join(fixture, relative), sources.get(relative));
    }
    await writeFile(join(fixture, 'app/route-validation.js'), '// Stale collision validation\n');
    await asar.createPackage(fixture, archive);
    asar.uncache(archive);
    assert.throws(() => verifyPackagedRuntimeSources(packagedText, sourceText),
        /Packaged app\/route-validation\.js differs from the tested source/);
} finally {
    asar.uncacheAll();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()), 'Cleanup must remain in the intended temporary directory');
    assert(basename(directory).startsWith('eoz-packaged-contract-'), 'Cleanup must target this test fixture');
    await rm(directory, { recursive:true, force:true });
}
console.log('Actual ASAR missing-module and stale runtime-source package contracts passed.');
