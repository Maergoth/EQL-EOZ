import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const uxVision = readFileSync(new URL('../docs/UX_VISION.md', import.meta.url), 'utf8');
const manualTest = readFileSync(new URL('../docs/V0.7_MANUAL_TEST.md', import.meta.url), 'utf8');
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error(`Invalid package version ${pkg.version}.`);
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('package.json and package-lock.json versions must match.');
}
if (!changelog.includes(`## ${pkg.version} -`)) throw new Error(`CHANGELOG.md needs a ${pkg.version} release heading.`);
for (const required of ['## 6. Click budgets', '## 8. End-to-end UX flows', '## 9. Feature specifications and user stories', '## 15. Acceptance scenarios for release candidates', '## 16. Road to v1']) {
    if (!uxVision.includes(required)) throw new Error(`UX vision is missing required section: ${required}`);
}
for (const required of ['X `-961`, Y `-30`, Z `-66`', '## 1. Continuous `/loc` tracking', '## 2. Rare-mob replacement map', '## 3. Minimal loot browsing', '## 4. Persistent golden path']) {
    if (!manualTest.includes(required)) throw new Error(`Windows acceptance test is missing: ${required}`);
}

for (const relative of ['../.github/workflows/build-windows.yml', '../.github/workflows/release.yml']) {
    const workflow = readFileSync(new URL(relative, import.meta.url), 'utf8');
    for (const required of ['npm ci', 'fetch-bootstrap-pack.mjs --required', 'npm run test:catalog', 'Determine signing mode', 'Get-AuthenticodeSignature', "steps.signing.outputs.enabled == 'true'", 'unsigned Windows']) {
        if (!workflow.includes(required)) throw new Error(`${relative} is missing release gate: ${required}`);
    }
    if (workflow.includes('Require signing certificate')) throw new Error(`${relative} still blocks unsigned output.`);
}

const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
for (const required of ['npm test', 'fetch-bootstrap-pack.mjs --required', 'npm run test:catalog']) {
    if (!ciWorkflow.includes(required)) throw new Error(`CI is missing production catalog gate: ${required}`);
}

console.log('Version and optional-signing workflow checks passed.');
