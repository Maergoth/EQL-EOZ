import { FEATURE_IDS, normalizeFeatures } from './feature-registry.js';

// Presentation is a projection of availability, never the component's own hidden
// state. Space-separated identities require every listed feature to be enabled.
export function mountFeatureVisibility({ root = globalThis.document, features = {}, MutationObserver = globalThis.MutationObserver } = {}) {
    let available = normalizeFeatures(features);
    let disposed = false;
    function project() {
        if (disposed || !root?.querySelectorAll) return;
        const nodes = [...root.querySelectorAll('[data-feature-ui]')];
        if (root.matches?.('[data-feature-ui]')) nodes.unshift(root);
        for (const node of nodes) {
            const ids = String(node.getAttribute('data-feature-ui') || '').trim().split(/\s+/).filter(Boolean);
            const visible = ids.length > 0 && ids.every(id => FEATURE_IDS.includes(id) && available[id]);
            node.toggleAttribute('data-feature-ui-hidden', !visible);
        }
    }
    const observer = MutationObserver && root ? new MutationObserver(records => {
        for (const record of records) if (record.type === 'attributes' && !record.target.hasAttribute('data-feature-ui')) record.target.removeAttribute('data-feature-ui-hidden');
        project();
    }) : null;
    observer?.observe(root, { childList:true, subtree:true, attributes:true, attributeFilter:['data-feature-ui'] });
    project();
    return {
        setFeatures(value) { available = normalizeFeatures(value);project(); },
        dispose() { disposed = true;observer?.disconnect(); }
    };
}
