import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { releaseAssetNames, releaseDownloadNotes, writeReleaseChecksums, verifyReleaseChecksums } from '../scripts/release-assets.mjs';
import { Arch, getArtifactArchName } from 'builder-util/out/arch.js';
import { expandMacro } from 'app-builder-lib/out/util/macroExpander.js';

const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
// Exercise the pinned builder's real macro expansion: Linux ${arch} means
// x86_64 for AppImage and amd64 for deb, while our updater contract uses x64.
const builtNames=['AppImage','deb'].map(ext=>expandMacro(pkg.build.linux.artifactName,getArtifactArchName(Arch.x64,ext),pkg,{ext}));
assert.deepEqual(builtNames,releaseAssetNames(pkg.version,'linux'),'Actual electron-builder names must match checksum, workflow and updater names');
assert(pkg.build.linux.target.every(target=>target.arch.every(arch=>arch==='x64')),'The fixed x64 filename contract requires x64-only Linux targets');
const sourceCommit='a'.repeat(40), notes=releaseDownloadNotes(pkg.version,sourceCommit);
for(const platform of ['win32','linux'])for(const name of releaseAssetNames(pkg.version,platform))assert(notes.includes(`https://github.com/Maergoth/EQL-EOZ/releases/download/v${pkg.version}/${name}`),'Release notes directly link every updater-supported package');
assert(notes.includes(`Build source: https://github.com/Maergoth/EQL-EOZ/commit/${sourceCommit}`),'Draft recovery retains exact source ownership');
assert.throws(()=>releaseDownloadNotes(pkg.version,'main'));

const directory = await mkdtemp(join(tmpdir(), 'eoz-release-assets-'));
try {
    for (const platform of ['win32', 'linux']) {
        const names = releaseAssetNames('0.8.8', platform);
        assert.equal(names.length, platform === 'linux' ? 2 : 1);
        for (const name of names) await writeFile(join(directory, name), `Synthetic ${name}`);
        await writeReleaseChecksums(directory, '0.8.8', platform);
        await verifyReleaseChecksums(directory, '0.8.8', platform);
        await writeFile(join(directory, names[0]), 'Changed after verification');
        await assert.rejects(verifyReleaseChecksums(directory, '0.8.8', platform), /do not match/);
    }
    assert.throws(() => releaseAssetNames('../invalid', 'linux'), /version/);
    assert.throws(() => releaseAssetNames('0.8.8', 'darwin'), /Unsupported/);
} finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert(basename(directory).startsWith('eoz-release-assets-'));
    await rm(directory, { recursive:true, force:true });
}
console.log('Windows/Linux release names and corrupted-asset checksum rejection passed.');
