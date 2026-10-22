import presets from './appearance-presets.generated.js';

export const FONT_PRESETS = Object.freeze(presets.fonts.map(font => Object.freeze({...font})));
export const DEFAULT_APPEARANCE = Object.freeze({...presets.default});
export const MIN_FONT_SIZE = presets.minimumSize;
export const MAX_FONT_SIZE = presets.maximumSize;
export function normalizeAppearance(value) {
    return {
        fontFamily:FONT_PRESETS.some(font => font.id === value?.fontFamily) ? value.fontFamily : DEFAULT_APPEARANCE.fontFamily,
        fontSize:typeof value?.fontSize === 'number' && Number.isFinite(value.fontSize)
            ? Math.max(MIN_FONT_SIZE,Math.min(MAX_FONT_SIZE,Math.round(value.fontSize))) : DEFAULT_APPEARANCE.fontSize
    };
}
export function appearanceFont(value) {
    const appearance = normalizeAppearance(value);
    return FONT_PRESETS.find(font => font.id === appearance.fontFamily);
}
export function applyAppearance(document,value,{panelScale=1}={}) {
    const appearance = normalizeAppearance(value), font = appearanceFont(appearance);
    const multiplier = typeof panelScale === 'number' && Number.isFinite(panelScale) ? Math.max(.75,Math.min(1.75,panelScale)) : 1;
    const root = document?.documentElement;
    if (root) {
        root.dataset.fontFamily = appearance.fontFamily;
        root.dataset.fontSize = String(appearance.fontSize);
        root.dataset.fontMultiplier = String(multiplier);
        root.style.setProperty('--ui-font-family',font.stack);
        root.style.setProperty('--ui-heading-family',font.heading || font.stack);
        root.style.setProperty('--ui-code-family',appearance.fontFamily === 'theme' ? 'ui-monospace, Consolas, monospace' : font.stack);
        root.style.setProperty('--ui-font-scale',String(appearance.fontSize / DEFAULT_APPEARANCE.fontSize));
        root.style.setProperty('--font-scale',String(appearance.fontSize / DEFAULT_APPEARANCE.fontSize * multiplier));
        root.style.setProperty('--text-scale',String(appearance.fontSize / DEFAULT_APPEARANCE.fontSize * multiplier));
    }
    return appearance;
}
// The same-origin 3D viewer keeps its geometry/camera unchanged. Its rem-based
// controls inherit the selected typography without changing the vendor bundle.
export function inheritViewerAppearance(parentDocument,viewerDocument) {
    if (!viewerDocument?.documentElement || !parentDocument?.documentElement) return;
    const source = parentDocument.documentElement;
    applyAppearance(viewerDocument,{fontFamily:source.dataset.fontFamily,fontSize:Number(source.dataset.fontSize)},{panelScale:Number(source.dataset.fontMultiplier)||1});
    let style = viewerDocument.getElementById('eoz-viewer-appearance');
    if (!style) {
        style = viewerDocument.createElement('style'); style.id = 'eoz-viewer-appearance';
        style.textContent = `html{font-size:calc(16px * var(--font-scale,1))}:where(.eqlzv-app,.eqlzv-app *){font-family:var(--ui-font-family)!important}
            .eoz-minimap-controls button{height:max(20px,1.25rem);font-size:.6875rem!important}
            .eoz-rare-marker{font-size:.6875rem!important}.eoz-rare-marker small{font-size:.5rem!important}
            .eoz-route-guidance strong{font-size:.875rem!important}.eoz-route-guidance small{font-size:.625rem!important}
            @media(max-height:400px){.eqlzv-toolbar .eqlzv-button,.eqlzv-toolbar .eqlzv-select{font-size:.75rem!important}}`;
        viewerDocument.head.append(style);
    }
}
