// These sources are exercised directly by the integration tests or generated
// from those sources. A current HTML wrapper is insufficient if one of its
// imported modules is missing or stale in the installer. The generated
// bootstrap must also match the verified pack fetched for this build.
export const PACKAGED_RUNTIME_SOURCES = Object.freeze([
    'app/data/eye-of-zomm-pack.bootstrap.json',
    'app/app.js',
    'app/item-browse.js',
    'app/item-scaling.js',
    'app/zone-identity.js',
    'app/viewer-zone-selection.js',
    'app/zone-load-guard.js',
    'app/viewport-framing.js',
    'app/established-route-guard.js',
    'app/drop-certification.js',
    'app/collision-geometry.js',
    'app/navigation-policy.js',
    'app/route-validation.js',
    'app/diagnostics.js',
    'app/recast-route-client.js',
    'app/recast-route-engine.js',
    'app/zoneviewer/viewer.html',
    'app/zoneviewer/ZoneViewerApp.js',
    'app/zoneviewer/zone-parser.worker.js',
    'app/zoneviewer/navigation.worker.js',
    'app/workers/recast-route.worker.js',
    'desktop/main.cjs'
]);

export function verifyPackagedRuntimeSources(packagedText, sourceText) {
    for (const relative of PACKAGED_RUNTIME_SOURCES) {
        let packaged;
        try {
            packaged = packagedText(relative);
        } catch {
            throw new Error(`Packaged ${relative} is missing.`);
        }
        if (packaged !== sourceText(relative)) {
            throw new Error(`Packaged ${relative} differs from the tested source.`);
        }
    }
}
