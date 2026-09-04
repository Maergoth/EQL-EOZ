import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const uxVision = readFileSync(new URL('../docs/UX_VISION.md', import.meta.url), 'utf8');
const manualTest = readFileSync(new URL('../docs/V0.7_MANUAL_TEST.md', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const handoff = readFileSync(new URL('../docs/HANDOFF.md', import.meta.url), 'utf8');
const implementationStatus = readFileSync(new URL('../docs/IMPLEMENTATION_STATUS.md', import.meta.url), 'utf8');
const routeCorpus = readFileSync(new URL('../app/route-corpus.js', import.meta.url), 'utf8');
const navmeshEvaluation = readFileSync(new URL('../docs/NAVMESH_EVALUATION.md', import.meta.url), 'utf8');
const recastNotices = readFileSync(new URL('../THIRD_PARTY/RecastNavigation/THIRD_PARTY_NOTICES.md', import.meta.url), 'utf8');
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error(`Invalid package version ${pkg.version}.`);
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('package.json and package-lock.json versions must match.');
}
if (!changelog.includes(`## ${pkg.version} -`)) throw new Error(`CHANGELOG.md needs a ${pkg.version} release heading.`);
for (const required of ['## 6. Click budgets', '## 8. End-to-end UX flows', '## 9. Feature specifications and user stories', '## 15. Acceptance scenarios for release candidates', '## 16. Road to v1']) {
    if (!uxVision.includes(required)) throw new Error(`UX vision is missing required section: ${required}`);
}
for (const required of ['`/loc -30.00, -961.00, -66.00`', 'client-map anchor X `961`, Y `30`, Z `-66`', '`/loc -330.00, 120.00, -178.13`', 'Succor anchor X `-120`, Y `330`, Z `-180`', '## 1. Continuous `/loc` tracking', '## 2. Rare-mob replacement map', '## 3. Minimal loot browsing', '## 4. Map Overlay versus S3D textures', '## 5. Persistent golden path']) {
    if (!manualTest.includes(required)) throw new Error(`Windows acceptance test is missing: ${required}`);
}
for (const required of ['docs/UX_VISION.md', 'docs/IMPLEMENTATION_STATUS.md', 'docs/HANDOFF.md', 'docs/NAVMESH_EVALUATION.md', 'VALIDATION.md']) {
    if (!readme.includes(required)) throw new Error(`README is missing project-documentation link: ${required}`);
}
for (const required of ['recast-navigation` 0.43.1', '## Player-facing UX contract', 'dedicated module worker', 'current collision-validated pathfinder', 'MIT', 'Zlib']) {
    if (!navmeshEvaluation.includes(required)) throw new Error(`Navmesh evaluation is missing: ${required}`);
}
for (const required of ['recast-navigation-js 0.43.1', 'Recast Navigation / Detour', 'MIT', 'Zlib']) {
    if (!recastNotices.includes(required)) throw new Error(`Recast notice is missing: ${required}`);
}
for (const required of ['## Exact next work', 'IMPLEMENTATION_STATUS.md', 'UX_VISION.md', 'npm test', 'npm run test:catalog']) {
    if (!handoff.includes(required)) throw new Error(`Contributor handoff is missing: ${required}`);
}
for (const required of ['Code baseline:', '## Current highest-priority task', '0.8 route corpus', 'HANDOFF.md', 'UX_VISION.md']) {
    if (!implementationStatus.includes(required)) throw new Error(`Implementation status is missing: ${required}`);
}
for (const required of ['outdoor-open', 'indoor-corridor', 'stacked-floor-stairs', 'legal-ramp', 'closed-door', 'exposed-drop', 'illegal-ascent']) {
    if (!routeCorpus.includes(required)) throw new Error(`Route corpus is missing: ${required}`);
}

for (const relative of ['../.github/workflows/build-windows.yml', '../.github/workflows/release.yml']) {
    const workflow = readFileSync(new URL(relative, import.meta.url), 'utf8');
    for (const required of ['npm ci', 'npm run audit:deps', 'fetch-bootstrap-pack.mjs --required', 'npm run test:catalog', 'Determine signing mode', 'Get-AuthenticodeSignature', "steps.signing.outputs.enabled == 'true'", 'unsigned Windows']) {
        if (!workflow.includes(required)) throw new Error(`${relative} is missing release gate: ${required}`);
    }
    if (workflow.includes('Require signing certificate')) throw new Error(`${relative} still blocks unsigned output.`);
}

const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
for (const required of ['npm run audit:deps', 'npm test', 'fetch-bootstrap-pack.mjs --required', 'npm run test:catalog']) {
    if (!ciWorkflow.includes(required)) throw new Error(`CI is missing production catalog gate: ${required}`);
}

console.log('Version and optional-signing workflow checks passed.');
