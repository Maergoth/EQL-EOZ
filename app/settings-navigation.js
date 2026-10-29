// Settings discovery changes visibility only; each component keeps its own state.
export function mountSettingsNavigation({ root = globalThis.document?.querySelector('[data-view-panel="settings"]'), MutationObserver = globalThis.MutationObserver } = {}) {
    const search = root?.querySelector('#settings-search');
    if (!search) return { dispose() {} };
    const status = root.querySelector('#settings-search-status');
    const groups = [...root.querySelectorAll('[data-settings-group]')];
    const topics = [...root.querySelectorAll('[data-settings-topic]')];
    const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    function filter() {
        const terms = normalize(search.value).split(' ').filter(Boolean);
        let matches = 0;
        for (const group of groups) {
            const heading = group.querySelector('.settings-group-heading');
            const groupText = normalize(heading?.textContent);
            let visible = false;
            let available = false;
            for (const panel of group.querySelectorAll('.settings-group-panels > .panel')) {
                const text = normalize(`${groupText} ${panel.textContent} ${panel.dataset.settingsKeywords || ''}`);
                const enabled = !panel.closest('[data-feature-ui-hidden], [hidden]');
                available ||= enabled;
                const match = enabled && terms.every(term => text.includes(term));
                panel.toggleAttribute('data-settings-filtered', !match);
                if (match) { visible = true; matches++; }
            }
            group.toggleAttribute('data-settings-filtered', !visible);
            group.toggleAttribute('data-settings-empty', !available);
            for (const link of topics.filter(link => link.dataset.settingsTopic === group.dataset.settingsGroup)) link.toggleAttribute('data-settings-empty', !available);
        }
        if (status) status.textContent = !terms.length ? '' : matches ? `${matches} matching settings section${matches === 1 ? '' : 's'}.` : 'No settings match. Try another word or choose a topic.';
    }
    function topic(event) {
        const link = event.target.closest?.('[data-settings-topic]');
        if (!link || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const group = groups.find(item => item.dataset.settingsGroup === link.dataset.settingsTopic);
        if (!group || group.hasAttribute('data-settings-empty')) return;
        event.preventDefault();
        search.value = '';
        filter();
        group.scrollIntoView?.({ block:'start', behavior:'auto' });
        group.querySelector('.settings-group-heading h2')?.focus({ preventScroll:true });
    }
    search.addEventListener('input', filter);
    root.querySelector('.settings-topics')?.addEventListener('click', topic);
    // Capture, overlays and feature descriptions mount after their async state loads.
    const observer = MutationObserver ? new MutationObserver(filter) : null;
    observer?.observe(root.querySelector('.settings-grid'), { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['data-feature-ui-hidden', 'hidden'] });
    filter();
    return { filter, dispose() { observer?.disconnect();search.removeEventListener('input', filter);root.querySelector('.settings-topics')?.removeEventListener('click', topic); } };
}
