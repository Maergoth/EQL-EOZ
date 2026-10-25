// Native submission receipts. Corrections open the current page's wiki editor.
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const statuses = Object.freeze({pending:'Pending',submitted:'Published','partly-submitted':'Partly published','needs-attention':'Needs attention'});
const pageStatuses = Object.freeze({pending:'Pending',applied:'Saved',unknown:'Not confirmed',failed:'Failed'});
const accountKey = account => account && Number.isSafeInteger(account.id) && account.id > 0 && typeof account.name === 'string' ? `${account.id}:${account.name}` : '';
function safeLink(value, origin) {
    try {
        const url = new URL(value);
        if (url.origin !== origin || url.origin !== 'https://eqlwiki.com' || url.username || url.password) return '';
        return url.href;
    } catch { return ''; }
}
function link(label, value, origin) {
    const url = safeLink(value, origin);
    return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : '';
}
function editLink(page, origin) {
    if (!safeLink(page.url,origin) || typeof page.title !== 'string' || !page.title.trim() || page.title.length > 300) return '';
    return link('Edit on wiki',`${origin}/index.php?${new URLSearchParams({title:page.title,action:'edit'})}`,origin);
}
function timeMarkup(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `<time datetime="${escape(date.toISOString())}" title="${escape(date.toISOString())}">${escape(new Intl.DateTimeFormat(undefined, {dateStyle:'medium',timeStyle:'short'}).format(date))}</time>`;
}
export function contributionHistoryEntriesMarkup(entries = [], filter = 'all') {
    const rows = entries.filter(entry => entry && Object.hasOwn(statuses, entry.status) && (filter === 'all' || entry.status === filter));
    return rows.map(entry => {
        const pages = Array.isArray(entry.pages) ? entry.pages.slice(0, 13) : [];
        const title = entry.title || pages[0]?.title || 'Wiki contribution';
        return `<details class="contribution-history-entry" data-history-entry="${escape(entry.id)}"><summary><strong>${escape(title)}</strong><span class="contribution-history-status is-${escape(entry.status)}">${statuses[entry.status]}</span></summary><div class="contribution-history-meta">${timeMarkup(entry.updatedAt || entry.createdAt)}<span>${entry.mode === 'automatic' ? 'Automatic' : 'Reviewed submission'}</span>${entry.account?.name ? `<span>${escape(entry.account.name)}</span>` : ''}</div><ul class="contribution-history-pages">${pages.map(page => `<li><div><strong>${escape(page.title)}</strong><span>${page.operation === 'create' ? 'Create page' : page.operation === 'upload' ? 'Upload screenshot' : 'Update page'} · ${pageStatuses[page.status] || 'Not confirmed'}</span></div><nav aria-label="Links for ${escape(page.title)}">${[link('Page',page.url,entry.origin),link('Saved revision',page.revisionUrl,entry.origin),link('Diff',page.diffUrl,entry.origin),editLink(page,entry.origin)].filter(Boolean).join(' · ')}</nav></li>`).join('')}</ul>${entry.status === 'needs-attention' ? '<p class="settings-helper">Some results could not be confirmed. Check the page history before retrying from the discovery queue.</p>' : ''}</details>`;
    }).join('');
}
export function mountContributionHistory({host, wiki} = {}) {
    if (!host) return {setActive(){},setAccount(){},markChanged(){},refresh:async()=>{},dispose(){}};
    let entries = [], knownAccount = null, filter = 'all', nextCursor = null;
    let active = false, dirty = true, loading = false, disposed = false, epoch = 0, warning = '', error = '';
    host.innerHTML = `<div class="contribution-history-heading"><div><h3>Contribution History</h3><p class="settings-helper">Automatic additions and reviewed submissions saved on this device for the signed-in wiki account. Open an entry to view its changes or edit the current page on the wiki.</p></div><button class="secondary-button" data-history-refresh>Refresh history</button></div><div class="contribution-history-tools"><label>Show<select data-history-filter aria-label="Filter contribution history"><option value="all">All submissions</option>${Object.entries(statuses).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><span data-history-count></span></div><p data-history-status role="status"></p><div data-history-entries></div><button class="secondary-button" data-history-more hidden>Load older contributions</button>`;
    const find = selector => host.querySelector(selector);
    function render() {
        if (disposed) return;
        find('[data-history-refresh]').disabled = loading || !wiki?.contributionHistory;
        find('[data-history-more]').hidden = !nextCursor || loading;
        const shown = entries.filter(entry => filter === 'all' || entry.status === filter);
        find('[data-history-count]').textContent = entries.length ? `${shown.length} of ${entries.length} loaded` : '';
        find('[data-history-entries]').innerHTML = contributionHistoryEntriesMarkup(entries,filter);
        find('[data-history-status]').classList.toggle('capture-warning', Boolean(error || warning));
        find('[data-history-status]').textContent = error || warning || (loading ? 'Loading contribution history…' : !wiki?.contributionHistory ? 'Contribution history requires the updated desktop app.' : knownAccount === '' ? 'Log in to the wiki to view your contribution history.' : !entries.length ? 'No submissions recorded on this device for this account yet.' : !shown.length ? 'No loaded submissions match this filter.' : '');
    }
    async function refresh(older = false) {
        if (disposed || !active || !wiki?.contributionHistory || older && (loading || !nextCursor)) return;
        const request = ++epoch, previousAccount = knownAccount, before = older ? nextCursor : undefined;
        loading = true; error = ''; warning = '';
        if (!older) { entries = []; nextCursor = null; }
        render();
        try {
            const result = await wiki.contributionHistory({limit:50,...(before ? {before} : {})});
            if (disposed || request !== epoch) return;
            if (!result || !Array.isArray(result.entries)) throw Error('The saved contribution history could not be read.');
            const key = accountKey(result.account);
            if (older && key !== previousAccount) { entries = []; nextCursor = null; }
            knownAccount = key;
            const received = key ? result.entries.filter(entry => entry && accountKey(entry.account) === key && Object.hasOwn(statuses,entry.status)) : [];
            const combined = older && key === previousAccount ? [...entries,...received] : received;
            entries = [...new Map(combined.map(entry => [entry.id,entry])).values()];
            nextCursor = key && result.hasMore && typeof result.nextCursor === 'string' ? result.nextCursor : null;
            warning = typeof result.warning === 'string' ? result.warning : '';
            dirty = false;
        } catch (failure) {
            if (!disposed && request === epoch) { error = failure?.message || 'Contribution history is unavailable. Try refreshing it.'; dirty = true; }
        } finally { if (!disposed && request === epoch) { loading = false; render(); } }
    }
    const onRefresh = () => void refresh(), onMore = () => void refresh(true), onFilter = () => { filter = find('[data-history-filter]').value; render(); };
    find('[data-history-refresh]').addEventListener('click',onRefresh);
    find('[data-history-more]').addEventListener('click',onMore);
    find('[data-history-filter]').addEventListener('change',onFilter);
    render();
    return {
        setActive(value) {
            const next = value === true, opening = next && !active;
            active = next;
            // Cookies can expire or change while hidden without a status event.
            // Every open clears cached rows and verifies the native account.
            if (active && (opening || dirty && !loading)) void refresh();
        },
        setAccount(status) {
            const key = status?.authenticated ? accountKey(status.user) : '';
            if (key === knownAccount) return;
            epoch++; loading = false; entries = []; nextCursor = null; knownAccount = key; dirty = true; warning = ''; error = '';
            render(); if (active && key) void refresh();
        },
        markChanged() { dirty = true; if (active) void refresh(); },
        refresh,
        dispose() { disposed = true; epoch++; find('[data-history-refresh]').removeEventListener('click',onRefresh); find('[data-history-more]').removeEventListener('click',onMore); find('[data-history-filter]').removeEventListener('change',onFilter); }
    };
}
