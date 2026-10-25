// These sources are exercised directly by the integration tests or generated
// from those sources. A current HTML wrapper is insufficient if one of its
// imported modules is missing or stale in the installer. The generated
// bootstrap must also match the verified pack fetched for this build.
import { RELEASE_HISTORY } from '../app/release-history.js';
export const PACKAGED_RUNTIME_SOURCES = Object.freeze([
    'app/appearance.js',
    'app/appearance-presets.json',
    'app/appearance-presets.generated.js',
    'desktop/appearance.cjs',
    'desktop/linux-runtime.cjs',
    'desktop/log-selection.cjs',
    'app/data/eye-of-zomm-pack.bootstrap.json',
    'app/index.html',
    'app/styles.css',
    'app/app.js',
    'app/capture-workspace.js',
    'app/contribution-history.js',
    'desktop/contribution-history.cjs',
    'app/loot-classification.js',
    'app/loot-set-coverage.js',
    'app/tooltip-delay.js',
    'app/contribution-reader.js',
    'app/automatic-item-contribution.js',
    'app/automatic-source-results.js',
    'app/automatic-source-policy.js',
    'app/contribution-coverage.js',
    'desktop/automatic-log-reader.cjs',
    'desktop/automatic-loot-sources.cjs',
    'app/contribution-editor.js',
    'app/contribution-choice-picker.js',
    'app/contribution-review-view.js',
    'app/contribution-presentation.js',
    'app/contribution-update.js',
    'app/character-item-card.js',
    'app/character-itembox.js',
    'app/catalog-itembox.js',
    'app/wiki-itembox.css',
    'app/overlay-drag.js',
    'app/discovery-contribution-flow.js',
    'app/wiki-identity.js',
    'app/generated-pets.js',
    'app/contribution-reasons.js',
    'app/contribution-tier-zero.js',
    'app/drop-observations.js',
    'app/icon-finder.js',
    'app/icon-fingerprint.js',
    'desktop/icon-finder-host.cjs',
    'desktop/drop-observation-storage.cjs',
    'desktop/drop-observation-host.cjs',
    'desktop/renderer-drain.cjs',
    'desktop/wiki-attachments.cjs',
    'desktop/spawn-prompt-preload.cjs',
    'app/spawn-prompt.html',
    'app/spawn-prompt.js',
    'app/spawn-prompt.css',
    'app/inventory-export.js',
    'desktop/inventory-file-host.cjs',
    'app/character-inventory-view.js',
    'app/character-totals.js',
    'app/character-inspect-view.js',
    'app/character-wiki-sheet.js',
    'app/capture-workspace.css',
    'app/contribution-queue.js',
    'app/contribution-evidence.js',
    'app/contribution-model.js',
    'app/character-model.js',
    'app/character-storage.js',
    'app/character-profiles.js',
    'desktop/character-storage.cjs',
    'app/character-walkthrough.js',
    'app/character-catalog.js',
    'app/item-base-recovery.js',
    'app/item-base-review.js',
    'app/item-base-review-ui.js',
    'app/character-share.js',
    'app/capture-source.html',
    'app/capture-source.js',
    'app/capture-png.worker.js',
    'app/screen-read-parser.js',
    'desktop/capture-host.cjs',
    'desktop/screen-read-journal.cjs',
    'desktop/capture-image.cjs',
    'desktop/capture-reader.cjs',
    'desktop/ocr-service.cjs',
    'desktop/ocr-runtime.cjs',
    'desktop/ocr-worker.cjs',
    'desktop/capture-source-preload.cjs',
    'desktop/wiki-client.cjs',
    'desktop/wiki-host.cjs',
    'desktop/share-host.cjs',
    'THIRD_PARTY/OCR/README.md',
    'THIRD_PARTY/OCR/APACHE-2.0.txt',
    'app/item-stat-presentation.js',
    'app/system-font-settings.js',
    'desktop/font-permissions.cjs',
    'app/whats-new.js',
    'app/whats-new.css',
    'app/release-history.js',
    'app/release-history-state.js',
    'app/map-overlay.js',
    'app/map-overlay-3d.js',
    'app/map-overlay-data.js',
    'app/timer-alerts.js',
    'app/wiki-discovery.js',
    'app/wiki-discovery-ui.js',
    'app/trigger-match-core.js',
    'app/trigger-matcher.js',
    'app/workers/trigger-match.worker.js',
    'desktop/discovery-host.cjs',
    'desktop/discovery-notice-window.cjs',
    'desktop/discovery-notice-preload.cjs',
    'app/discovery-notices.html',
    'app/discovery-notices.js',
    'app/discovery-notices.css',
    'app/app-update-ui.js',
    'app/parser.js',
    'app/coordinate-system.js',
    'app/timer-engine.js',
    'app/timer-settings.js',
    'THIRD_PARTY/PNUT/MIT.txt',
    'THIRD_PARTY/PNUT/THIRD_PARTY_NOTICES.md',
    'app/overlay-session.js',
    'app/overlay-controller.js',
    'app/overlay.html',
    'app/overlay-map.html',
    'app/overlay.css',
    'app/overlay.js',
    'app/item-browse.js',
    'app/item-scaling.js',
    'app/vendor/item-scaling-core.js',
    'app/vendor/item-scaling-core.LICENSE',
    'app/vendor/item-scaling-rules.json',
    'app/vendor/item-scaling-rules.js',
    'app/vendor/item-scaling-source.json',
    'app/zone-identity.js',
    'app/viewer-zone-selection.js',
    'app/minimap-controls.js',
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
    'app/zoneviewer/overlay-mode.js',
    'app/zoneviewer/player-state.js',
    'app/zoneviewer/ZoneViewerApp.js',
    'app/zoneviewer/zone-parser.worker.js',
    'app/zoneviewer/navigation.worker.js',
    'app/workers/recast-route.worker.js',
    'desktop/main.cjs',
    'desktop/window-placement.cjs',
    'desktop/preload.cjs',
    'desktop/app-updater.cjs',
    'desktop/overlay-host.cjs',
    'desktop/overlay-docking.cjs',
    'desktop/overlay-map-policy.cjs',
    'desktop/overlay-preload.cjs'
]);

export function packagedArchivePaths(platform = process.platform) {
    if (platform === 'win32') return ['dist/win-unpacked/resources/app.asar'];
    if (platform === 'linux') return ['dist/linux-unpacked/resources/app.asar'];
    if (platform === 'darwin') return [
        'dist/mac/EQLWiki - Eye of Zomm.app/Contents/Resources/app.asar',
        'dist/mac-arm64/EQLWiki - Eye of Zomm.app/Contents/Resources/app.asar'
    ];
    throw new Error(`No packaged archive contract for ${platform}.`);
}

export const PACKAGED_RUNTIME_IMAGES=Object.freeze([...new Set([
    ...['Itemtop','Itembot','Itemshot'].map(name=>`app/assets/wiki-item-card/${name}.gif`),
    ...['workspace','map','intel','timers'].map(name=>`app/assets/whats-new/${name}.png`),
    ...RELEASE_HISTORY.flatMap(release=>release.steps.map(step=>`app/assets/whats-new/${step.image}.png`))
])]);

export function verifyPackagedRuntimeImages(packagedBytes,sourceBytes){
    for(const relative of PACKAGED_RUNTIME_IMAGES){
        let packaged;
        try{packaged=packagedBytes(relative);}catch{throw new Error(`Packaged ${relative} is missing.`);}
        if(!Buffer.from(packaged).equals(Buffer.from(sourceBytes(relative))))throw new Error(`Packaged ${relative} differs from the reviewed image.`);
    }
}

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
