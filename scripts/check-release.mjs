import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error(`Invalid package version ${pkg.version}.`);
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('package.json and package-lock.json versions must match.');
}
if (!changelog.includes(`## ${pkg.version} -`)) throw new Error(`CHANGELOG.md needs a ${pkg.version} release heading.`);

for (const relative of ['../.github/workflows/build-windows.yml', '../.github/workflows/release.yml']) {
    const workflow = readFileSync(new URL(relative, import.meta.url), 'utf8');
    for (const required of ['npm ci', 'fetch-bootstrap-pack.mjs --required', 'Require signing certificate', 'Get-AuthenticodeSignature']) {
        if (!workflow.includes(required)) throw new Error(`${relative} is missing release gate: ${required}`);
    }
    if (/if:\s*\$\{\{\s*env\.WINDOWS_CERTIFICATE_PFX_BASE64/.test(workflow)) {
        throw new Error(`${relative} still permits unsigned output.`);
    }
}

console.log('Version and signed-release workflow checks passed.');
