// A lightweight native-window renderer. Session ownership and all log reads stay
// in the main app; opening or reloading a panel cannot create another parser.
const PANELS = Object.freeze({ parse:'Parse', intel:'Zone & loot', consider:'Consider', timers:'Timers' });
const TABS = ['damage', 'healing', 'runes', 'feed'];
const TAB_LABELS = { damage:'Damage', healing:'Healing', runes:'Runes', feed:'Feed' };
const CON_KEYS = new Set(['gray', 'green', 'light-blue', 'blue', 'white', 'yellow', 'red']);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const fmt = value => number(value).toLocaleString(undefined, { maximumFractionDigits:1 });
const conKey = value => CON_KEYS.has(typeof value === 'object' ? value?.key : value) ? (value?.key || value) : 'unknown';
const empty = message => `<div class="empty">${escapeHtml(message)}</div>`;
const attr = escapeHtml;
export function durationLabel(milliseconds) {
    const seconds = Math.ceil(number(milliseconds) / 1000);
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export function parseView(parse = {}, scope = 'live', tab = 'damage') {
    const encounters = Array.isArray(parse.encounters) ? parse.encounters : [];
    const current = encounters.find(encounter => encounter.active) || null;
    const previous = encounters.find(encounter => !encounter.active) || null;
    const chosen = scope === 'live' ? current : scope === 'previous' ? previous : encounters.find(encounter => String(encounter.id) === scope);
    const session = scope === 'session';
    const events = session ? encounters.flatMap(encounter => encounter.events || []) : chosen?.events || [];
    const types = { damage:'damage', healing:'heal', runes:'rune' };
    const matching = events.filter(event => event.type === types[tab]);
    const breakdown = (session ? parse : chosen)?.breakdowns?.[tab];
    const aggregate = Array.isArray(breakdown) ? breakdown.map(row => ({ name:String(row.name || 'Unknown ability'), total:number(row.total), count:Number.isFinite(Number(row.count)) ? number(row.count) : null })) : breakdown && typeof breakdown === 'object' ? Object.entries(breakdown).map(([name,total]) => ({ name, total:number(total), count:null })) : null;
    const recordedTotal = aggregate ? aggregate.reduce((sum,row) => sum + row.total, 0) : matching.reduce((sum, event) => sum + number(event.amount), 0);
    const total = session && tab === 'damage' ? number(parse.totalDamage) : session && tab === 'healing' ? number(parse.totalHealing) : recordedTotal;
    const duration = session ? number(parse.sessionSeconds) : number(chosen?.duration);
    const rate = session && tab === 'damage' ? number(parse.sessionDps) : duration ? total / duration : null;
    const groups = new Map();
    for (const event of matching) {
        const name = String(event.source || event.kind || (tab === 'runes' ? 'Rune capacity granted' : 'Unknown ability'));
        const row = groups.get(name) || { name, total:0, count:0 };
        row.total += number(event.amount); row.count++; groups.set(name, row);
    }
    return { scope, tab, title:session ? 'Session' : scope === 'live' ? current ? `Live · ${current.name || 'Encounter'}` : 'Live · waiting for combat' : scope === 'previous' ? previous ? `Previous · ${previous.name || 'Encounter'}` : 'Previous · no completed encounter' : chosen ? `${chosen.name || 'Encounter'} · saved encounter` : 'Selected encounter is no longer retained',
        total, rate, duration, recordedTotal, rows:(aggregate || [...groups.values()]).sort((a,b) => b.total - a.total),
        events:session ? (parse.recentEvents || []).slice(0, 40) : events.slice().reverse().slice(0, 40),
        available:session || Boolean(chosen), truncated:!aggregate && (session && total > recordedTotal || Boolean(chosen?.eventsTruncated)), feedTruncated:session || Boolean(chosen?.eventsTruncated) };
}
export function renderParseContent(view) {
    if (view.tab === 'feed') return `<div class="parse-context">${escapeHtml(view.title)} · latest retained events</div>` + (view.events.length ? view.events.map(event => `<div class="feed-row"><span>${escapeHtml(eventDescription(event))}</span><small>${event.amount ? fmt(event.amount) : escapeHtml(event.type)}</small></div>`).join('') : empty('Waiting for recorded events in this selection.'));
    const unit = view.tab === 'healing' ? 'healing' : view.tab === 'runes' ? 'capacity granted' : 'damage';
    return `<div class="parse-summary"><strong>${fmt(view.total)}</strong><span>${unit}${view.tab === 'runes' || view.rate === null ? '' : ` · ${fmt(view.rate)} /s`}</span></div>
        <div class="parse-context">${escapeHtml(view.title)}${view.duration ? ` · ${view.duration.toFixed(1)}s` : ''}<br>${view.tab === 'runes' ? 'Logged rune capacity granted; damage absorbed is not measured.' : 'Your logged actions only.'}${view.truncated ? ' Ability breakdown covers retained events.' : ''}</div>` +
        (view.rows.length ? view.rows.map(row => `<div class="ability-row" style="--amount:${Math.min(100, view.recordedTotal ? row.total / view.recordedTotal * 100 : 0).toFixed(1)}%"><span title="${attr(row.name)}">${escapeHtml(row.name)}${row.count === null ? '' : ` <small>×${row.count}</small>`}</span><strong>${fmt(row.total)}</strong></div>`).join('') : empty(view.available ? 'No matching actions in this selection.' : 'Waiting for combat in this selection.'));
}
function eventDescription(event) {
    if (event.type === 'damage') return `${event.source || event.kind || 'Damage'} → ${event.victim || 'target'}`;
    if (event.type === 'heal') return `${event.source || 'Heal'} → ${event.target || 'target'}`;
    if (event.type === 'rune') return 'Rune capacity granted';
    if (event.type === 'kill') return `Slain ${event.victim || 'target'}`;
    if (event.type === 'loot') return `${event.quantity > 1 ? `${event.quantity}× ` : ''}${event.item || 'Loot'}`;
    if (event.type === 'zone') return `Entered ${event.zone || 'zone'}`;
    if (event.type === 'consider') return `Considered ${event.target?.name || 'target'}`;
    if (event.type === 'location') return 'Location updated';
    return String(event.type || 'Event');
}
function itemIcon(value) {
    // Only packaged data images are accepted. Dataset text never becomes an
    // external image request or executable URL inside a privileged overlay.
    return typeof value === 'string' && /^data:image\/(?:png|gif|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(value) ? value : '';
}
function knownDropLabel(source, myClassOnly, limit = Infinity) {
    const shown = Math.min((source.drops || []).length, limit);
    const total = number(source.dropCount ?? source.drops?.length);
    return `${total} known ${myClassOnly ? 'class ' : ''}drops${total > shown ? ` · ${shown} shown` : ''}`;
}
export function renderItem(item = {}, index = 0, context = 'consider') {
    const icon = itemIcon(item.icon);
    const stats = Object.entries(item.stats || {}).filter(([,value]) => ['string', 'number'].includes(typeof value)).slice(0, 18);
    return `<div class="item-card"><div class="item-heading">${icon ? `<img class="item-icon" src="${attr(icon)}" alt="">` : '<span class="item-icon item-icon-placeholder" aria-hidden="true">◇</span>'}<div><button type="button" data-item-index="${index}" data-item-context="${attr(context)}">${escapeHtml(item.name || 'Unknown item')}</button><div class="item-meta">${escapeHtml((item.slots || []).join(' · ') || 'Item')}${number(item.tier) ? ` · Tier ${number(item.tier)}` : ' · Base'}</div></div></div>${stats.length ? `<div class="item-stats">${stats.map(([key,value]) => `${escapeHtml(key)} ${escapeHtml(value)}`).join(' · ')}</div>` : ''}</div>`;
}
export function renderIntel(intel = {}) {
    const npcs = Array.isArray(intel.npcs) ? intel.npcs : [];
    return npcs.length ? npcs.map((npc,index) => `<article class="npc-row con-${conKey(npc.con)}"><div class="npc-heading"><strong>${escapeHtml(npc.name)}</strong><small>${npc.level || npc.levelMax ? `L${escapeHtml(npc.level || (npc.levelMin === npc.levelMax ? npc.levelMax : `${npc.levelMin}–${npc.levelMax}`))}` : ''}${Number.isFinite(npc.distance) ? ` · ${fmt(npc.distance)}u` : ''}</small></div><div class="npc-meta">${npc.named ? 'Named' : npc.rare ? 'Rare' : 'NPC'} · ${knownDropLabel(npc, intel.myClassOnly, 3)}${npc.waypoint ? ' · waypoint available' : ''}</div><div class="row-actions"><button type="button" data-npc-action="route" data-npc-index="${index}" ${!intel.canRoute || !npc.waypoint ? 'disabled title="Enable maps and use a current logged location in the main app"' : ''}>Route</button><button type="button" data-npc-action="copy-waypoint" data-npc-index="${index}" ${!npc.waypoint ? 'disabled' : ''}>Copy /waypoint</button><button type="button" data-npc-action="details" data-npc-index="${index}">Details</button><button type="button" data-npc-action="wiki" data-npc-index="${index}">Wiki</button></div>${(npc.drops || []).slice(0, 3).map((item,itemIndex) => renderItem(item,itemIndex,`intel:${index}`)).join('')}</article>`).join('') : empty('No matching named or rare NPCs in the current zone. Check your log and class filters in the main app.');
}
export function renderConsider(consider = {}) {
    if (!consider.name) return empty('Consider a target in game to see its known loot here.');
    return `<h2 class="consider-heading con-${conKey(consider.con)}">${escapeHtml(consider.name)}</h2><div class="npc-meta">${consider.level ? `Level ${escapeHtml(consider.level)} · ` : ''}${escapeHtml(consider.con?.label || consider.con || 'Unknown con')} · ${knownDropLabel(consider, consider.myClassOnly)}</div><div class="row-actions"><button type="button" data-consider-action="route" ${consider.canRoute === false || !consider.waypoint ? 'disabled' : ''}>Route</button><button type="button" data-consider-action="details">NPC details</button></div><div class="drops-list">${(consider.drops || []).map((item,index) => renderItem(item,index)).join('') || empty(consider.myClassOnly ? 'No known drops match your class. Turn off My Class to see everything.' : 'No drops are known for this NPC in the current dataset.')}</div>`;
}
function panelMarkup(panel) {
    if (panel === 'parse') return `<div class="panel-toolbar"><label for="encounter-scope">View</label><select id="encounter-scope" aria-label="Encounter selection"></select><button type="button" data-open-view="combat" title="Open complete parse history">↗</button></div><nav class="parse-tabs" aria-label="Parse metrics">${TABS.map(tab => `<button type="button" data-tab="${tab}" aria-pressed="${tab === 'damage'}" class="${tab === 'damage' ? 'is-active' : ''}">${TAB_LABELS[tab]}</button>`).join('')}</nav><div id="parse-body"></div>`;
    if (panel === 'intel') return '<div class="panel-toolbar"><label><input id="class-filter" type="checkbox"> My Class</label><button type="button" data-open-view="map">Map Explorer ↗</button></div><div id="intel-body"></div>';
    if (panel === 'consider') return '<div class="panel-toolbar"><label><input id="class-filter" type="checkbox"> My Class</label><button type="button" data-open-view="items">Item browser ↗</button></div><div id="consider-body"></div>';
    return `<div class="panel-toolbar"><label><input id="swing-enabled" type="checkbox"> Swing timer</label><label>Delay <input id="swing-delay" type="number" min="0" max="200" step="1" value="0" title="Weapon delay in tenths of a second. Zero learns automatically."></label></div><div id="swing-body"></div><div id="timer-list"></div><div id="saved-timers"></div><details class="timer-editor"><summary>Add timer</summary><form id="timer-form"><label class="stacked">Name<input name="label" type="text" maxlength="80" placeholder="Camp respawn" required></label><label>Type<select name="type"><option value="manual">Manual countdown</option><option value="text">Log text trigger</option><option value="spawn">NPC kill / respawn</option></select></label><label>Duration (seconds)<input name="seconds" type="number" min="1" max="604800" value="60" required></label><label class="stacked">Trigger text / NPC name<input name="trigger" type="text" maxlength="180" placeholder="Exact log text or NPC name"></label><label>Text match<select name="match"><option value="contains">Contains</option><option value="starts">Starts with</option><option value="equals">Exact line</option></select></label><label class="stacked">Zone (optional)<input name="zone" type="text" maxlength="120" placeholder="Limit to a zone"></label><label><input name="repeat" type="checkbox"> Repeat countdown</label><p>Log text uses literal text. Respawns start on a matching logged death and remain estimates; no spawn is observed.</p><button type="submit">Save timer</button></form></details><div id="spawn-from-kill"></div>`;
}
export function mountOverlay({ document = globalThis.document, bridge = globalThis.eyeOfZommOverlay, panel = new URLSearchParams(globalThis.location?.search || '').get('panel'), setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval, now = Date.now } = {}) {
    panel = Object.hasOwn(PANELS, panel) ? panel : 'parse';
    const $ = selector => document.querySelector(selector);
    if (!$('#panel-content')) return { dispose() {} };
    $('#overlay-title').textContent = PANELS[panel]; document.title = `Eye of Zomm · ${PANELS[panel]}`;
    $('#panel-content').innerHTML = panelMarkup(panel);
    let state = {}, scope = 'live', tab = 'damage', disposed = false, status = '', request = 0, stateGeneration = 0, noticeGeneration = 0, lastNoticeId = '', unsubscribe;
    const listeners = [];
    const listen = (target, name, callback) => { target?.addEventListener(name, callback); listeners.push(() => target?.removeEventListener(name, callback)); };
    const session = () => state.snapshot?.session || {};
    const replace = (element, html) => { if (element && element.innerHTML !== html) element.innerHTML = html; };
    const report = value => { status = value; $('#overlay-status').textContent = value; };
    async function action(command, value) {
        if (disposed || !bridge?.action) return;
        if ((command.startsWith('session:') || command.startsWith('timer:')) && state.sessionAvailable !== true) { report('Session paused. Open the main app to reconnect.'); return; }
        const owner = ++request;
        const priorNotice = noticeGeneration;
        try {
            const next = await bridge.action(command, value);
            if (disposed) return;
            if (next?.preferences) { state = next; render(); }
            if (next?.error) { report(String(next.error)); return; }
            if (owner === request && priorNotice === noticeGeneration) report(command === 'pass-through' && value ? 'Mouse passthrough enabled. Recover from the main app or tray.' : command.startsWith('session:') || command.startsWith('timer:') ? 'Requested.' : '');
        } catch { if (!disposed && owner === request) report('This action could not complete. Retry from the main app.'); }
    }
    function render() {
        if (disposed) return;
        const prefs = state.preferences || {};
        document.documentElement.style.setProperty('--panel-opacity', String(Math.min(1, Math.max(.15, number(prefs.backgroundOpacity) || .92))));
        document.documentElement.style.setProperty('--font-scale', String(Math.min(1.3, Math.max(.85, number(prefs.fontScale) || 1))));
        $('#overlay').classList.toggle('is-locked', Boolean(prefs.locked));
        $('#layout-status').textContent = prefs.locked ? 'Locked' : 'Drag to place';
        $('#layout-lock').checked = Boolean(prefs.locked); $('#ignore-mouse').checked = Boolean(prefs.passThrough);
        $('#panel-opacity').value = prefs.backgroundOpacity ?? .92; $('#panel-font').value = String(prefs.fontScale ?? 1);
        const s = session();
        const notice = s.notice;
        if (notice?.id && notice.id !== lastNoticeId && (!notice.panel || notice.panel === panel)) { lastNoticeId = notice.id; noticeGeneration++; report(String(notice.message || 'The action needs attention.')); }
        $('#session-character').textContent = s.character || 'Waiting for character';
        $('#session-zone').textContent = s.zone || s.logStatus || 'Waiting for log';
        $('#session-restart').hidden = !(Number(state.sessionRestartCount) > 0);
        if (panel === 'parse') {
            const parse = s.parse || {};
            const options = '<option value="live">Live</option><option value="previous">Previous encounter</option><option value="session">Session</option>' + (parse.encounters || []).slice(0, 50).map(encounter => `<option value="${attr(encounter.id)}">${escapeHtml(encounter.name || 'Encounter')} · ${new Date(number(encounter.startAt)).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</option>`).join('');
            const selector = $('#encounter-scope');
            // A pinned encounter stays selected even if a bounded snapshot ages
            // it out; it must never silently become a differently labeled fight.
            replace(selector, options + (!['live', 'previous', 'session'].includes(scope) && !(parse.encounters || []).some(encounter => String(encounter.id) === scope) ? `<option value="${attr(scope)}">Encounter no longer retained</option>` : ''));
            selector.value = scope;
            replace($('#parse-body'), renderParseContent(parseView(parse, scope, tab)));
        } else if (panel === 'intel') { $('#class-filter').checked = Boolean(s.intel?.myClassOnly); replace($('#intel-body'), renderIntel(s.intel)); }
        else if (panel === 'consider') { $('#class-filter').checked = Boolean(s.consider?.myClassOnly); replace($('#consider-body'), renderConsider(s.consider)); }
        else renderTimers(s.timers || {}, { $, replace, now:now(), available:state.sessionAvailable === true });
        document.querySelectorAll('#panel-content button, #panel-content input, #panel-content select').forEach(element => {
            if (state.sessionAvailable !== true) { if (!element.disabled) element.dataset.sessionDisabled = 'true'; element.disabled = true; }
            else if (element.dataset.sessionDisabled) { element.disabled = false; delete element.dataset.sessionDisabled; }
        });
        if (state.sessionAvailable !== true) $('#overlay-status').textContent = 'Session paused · open the main app to reconnect.';
        else if (!status) $('#overlay-status').textContent = s.logStatus || '';
    }
    listen($('#panel-menu-button'), 'click', event => { const menu = event.currentTarget.closest('.hover-menu'); menu.classList.remove('is-dismissed'); const open = menu.classList.toggle('is-open'); event.currentTarget.setAttribute('aria-expanded', String(open)); });
    listen($('.hover-menu'), 'mouseleave', event => { event.currentTarget.classList.remove('is-dismissed'); });
    listen(document, 'keydown', event => { if (event.key === 'Escape') { $('.hover-menu').classList.remove('is-open'); $('.hover-menu').classList.add('is-dismissed'); $('#panel-menu-button').setAttribute('aria-expanded', 'false'); document.activeElement?.blur(); } });
    listen($('#layout-lock'), 'change', event => { void action('lock', event.target.checked); });
    listen($('#ignore-mouse'), 'change', event => { void action('pass-through', event.target.checked); });
    listen($('#panel-opacity'), 'change', event => { void action('opacity', Number(event.target.value)); });
    listen($('#panel-font'), 'change', event => { void action('font-scale', Number(event.target.value)); });
    listen($('#encounter-scope'), 'change', event => { scope = event.target.value; render(); });
    listen($('#class-filter'), 'change', event => { void action('session:class-filter', { panel, enabled:event.target.checked }); });
    listen(document, 'click', event => {
        const button = event.target.closest?.('button'); if (!button || button.disabled) return;
        if (button.dataset.command) void action(button.dataset.command);
        if (button.dataset.openView) void action('session:open', { view:button.dataset.openView });
        if (button.dataset.tab) { tab = TABS.includes(button.dataset.tab) ? button.dataset.tab : 'damage'; document.querySelectorAll('[data-tab]').forEach(element => { const active = element.dataset.tab === tab; element.classList.toggle('is-active', active); element.setAttribute('aria-pressed', String(active)); }); render(); }
        const s = session();
        if (button.dataset.npcAction) {
            const npc = s.intel?.npcs?.[Number(button.dataset.npcIndex)]; if (!npc) return;
            const command = button.dataset.npcAction;
            void action(command === 'details' ? 'session:open' : `session:${command}`, { ...(command === 'details' ? { view:'npcs' } : {}), npc:npc.name, zone:s.intel?.zone || s.zone });
        }
        if (button.dataset.considerAction && s.consider?.name) void action(button.dataset.considerAction === 'details' ? 'session:open' : 'session:route', { view:'npcs', npc:s.consider.name, zone:s.zone });
        if (button.dataset.itemIndex !== undefined) {
            const context = button.dataset.itemContext;
            const item = context?.startsWith('intel:') ? s.intel?.npcs?.[Number(context.slice(6))]?.drops?.[Number(button.dataset.itemIndex)] : s.consider?.drops?.[Number(button.dataset.itemIndex)];
            if (item) void action('session:open', { view:'items', item:item.name });
        }
        if (button.dataset.timerAction) void action(`timer:${button.dataset.timerAction}`, { id:button.dataset.timerId });
        if (button.dataset.definitionAction) void action(`timer:${button.dataset.definitionAction}`, { [button.dataset.definitionAction === 'start' ? 'definitionId' : 'id']:button.dataset.definitionId });
        if (button.id === 'swing-reset') void action('timer:reset-swing');
        if (button.id === 'spawn-start') {
            const seconds = Number($('#spawn-seconds')?.value);
            if (seconds >= 1 && seconds <= 604800) void action('timer:create-spawn', { durationSeconds:seconds });
        }
    });
    listen($('#swing-enabled'), 'change', event => { void action('timer:set-swing-enabled', { enabled:event.target.checked }); });
    listen($('#swing-delay'), 'change', event => { void action('timer:set-swing-delay', { delayTenths:Number(event.target.value) }); });
    bindTimerForm({ $, listen, action, report });
    if (bridge?.onState) unsubscribe = bridge.onState(next => { if (!disposed) { stateGeneration++; state = next || {}; render(); } });
    const initial = stateGeneration;
    Promise.resolve(bridge?.getState?.()).then(next => { if (!disposed && initial === stateGeneration && next) { state = next; render(); } }).catch(() => report('Open Eye of Zomm to restore the overlay connection.'));
    const tick = setInterval(() => { if (!document.hidden && panel === 'timers' && state.sessionAvailable === true) renderTimers(session().timers || {}, { $, replace, now:now(), available:true }); }, 100);
    render();
    return { render(next) { stateGeneration++; state = next || {}; render(); }, dispose() { disposed = true; listeners.forEach(remove => remove()); unsubscribe?.(); clearInterval(tick); } };
}

// Timer snapshot adaptation is kept here so native panels do no independent
// scheduling. The shared engine supplies due times and owns persistence.
export function timerView(timer = {}, now = Date.now()) {
    const durationMs = number(timer.durationMs ?? number(timer.durationSeconds) * 1000);
    const running = timer.status === 'running' || timer.running === true;
    const dueAt = timer.expiresAt ?? timer.dueAt;
    const remainingMs = running && dueAt !== null && dueAt !== undefined && Number.isFinite(Number(dueAt)) ? Math.max(0, Number(dueAt) - now) : number(timer.remainingMs ?? durationMs);
    return { ...timer, durationMs, running, remainingMs, progress:durationMs ? Math.min(100, Math.max(0, (1 - remainingMs / durationMs) * 100)) : 0 };
}
export function renderTimerRows(timers = [], now = Date.now()) {
    return timers.length ? timers.map(source => {
        const timer = timerView(source, now);
        return `<article class="timer-row"><div class="timer-heading"><strong>${escapeHtml(timer.label || 'Timer')}</strong><span class="timer-value ${!timer.remainingMs ? 'is-due' : ''}">${durationLabel(timer.remainingMs)}</span></div><div class="timer-meta">${escapeHtml(timer.source || 'manual')} · ${escapeHtml(timer.status || (timer.running ? 'running' : 'ready'))}${timer.npc ? ` · ${escapeHtml(timer.npc)}` : ''}${timer.source === 'spawn' ? ' · estimated' : ''}</div><div class="timer-progress"><span style="--progress:${timer.progress.toFixed(1)}%"></span></div><div class="row-actions">${timer.status === 'ended' ? '' : `<button type="button" data-timer-action="${timer.running ? 'pause' : 'resume'}" data-timer-id="${attr(timer.id)}">${timer.running ? 'Pause' : 'Resume'}</button>`}<button type="button" data-timer-action="reset" data-timer-id="${attr(timer.id)}">${timer.status === 'ended' ? 'Start again' : 'Reset'}</button><button type="button" data-timer-action="delete" data-timer-id="${attr(timer.id)}">Delete</button></div></article>`;
    }).join('') : empty('Add a countdown, log trigger or estimated respawn timer.');
}
function renderTimers(timers, { $, replace, now, available }) {
    const swing = timers.swing || {};
    const intervalMs = number(swing.intervalMs ?? swing.periodMs);
    const nextAt = swing.lastAt !== null && swing.lastAt !== undefined && intervalMs ? number(swing.lastAt) + intervalMs : 0;
    const stale = !nextAt || now - number(swing.lastAt) > intervalMs * 2.5 + 1000;
    const remaining = swing.status === 'casting' || stale ? 0 : Math.max(0, nextAt - now);
    const progress = intervalMs ? Math.min(100, Math.max(0, (1 - remaining / intervalMs) * 100)) : 0;
    $('#swing-enabled').checked = swing.enabled !== false;
    if ($('#swing-delay') !== globalThis.document?.activeElement) $('#swing-delay').value = swing.delayTenths || 0;
    $('#swing-body').hidden = swing.enabled === false;
    replace($('#swing-body'), `<div class="section-label">Swing timer · observed estimate</div><div class="timer-heading"><strong>${intervalMs && !stale ? `${(intervalMs / 1000).toFixed(2)}s swing` : 'Learning your swing'}</strong><span class="timer-value">${intervalMs && !stale ? `${(remaining / 1000).toFixed(1)}s` : '—'}</span></div><div class="swing-progress"><span style="--progress:${stale ? 0 : progress.toFixed(1)}%"></span></div><div class="timer-meta">${escapeHtml(swing.status || 'idle')} · ${number(swing.samples)} samples. Log timing is approximate; multiple attacks, misses and haste can affect the estimate. Delay 0 learns automatically; other values use weapon delay in tenths.</div><div class="row-actions"><button id="swing-reset" type="button" ${!available ? 'disabled' : ''}>Relearn swing</button></div>`);
    const visible = (timers.timers || []).filter(timer => timer.visible !== false);
    const hidden = (timers.timers || []).length - visible.length;
    replace($('#timer-list'), renderTimerRows(visible, now) + (hidden ? `<div class="timer-meta">${hidden} timer${hidden === 1 ? '' : 's'} in other zones hidden.</div>` : ''));
    const definitions = timers.definitions || [];
    replace($('#saved-timers'), definitions.length ? `<div class="section-label">Saved timers</div>${definitions.map(definition => `<div class="timer-row"><div class="timer-heading"><strong>${escapeHtml(definition.label)}</strong><span>${durationLabel(number(definition.durationSeconds) * 1000)}</span></div><div class="timer-meta">${escapeHtml(definition.type)}${definition.zone ? ` · ${escapeHtml(definition.zone)}` : ''}${definition.trigger || definition.npc ? ` · ${escapeHtml(definition.trigger || definition.npc)}` : ''}</div><div class="row-actions"><button type="button" data-definition-action="start" data-definition-id="${attr(definition.id)}">Start now</button><button type="button" data-definition-action="remove-definition" data-definition-id="${attr(definition.id)}">Delete saved</button></div></div>`).join('')}` : '');
    const kill = timers.lastKill;
    const spawn = $('#spawn-from-kill');
    // Keep the duration input alive while the shared clock paints other rows.
    if (spawn?.dataset.kill !== `${kill?.name}|${kill?.at}`) {
        spawn.dataset.kill = `${kill?.name}|${kill?.at}`;
        replace(spawn, kill ? `<div class="section-label">Last logged kill</div><div class="timer-meta">${escapeHtml(kill.name)} · ${escapeHtml(kill.zone || 'Unknown zone')}</div><div class="swing-controls"><label>Seconds <input id="spawn-seconds" type="number" min="1" max="604800" value="360"></label><button id="spawn-start" type="button">Start respawn</button></div>` : '');
    }
}
function bindTimerForm({ $, listen, action, report }) {
    const form = $('#timer-form'); if (!form) return;
    listen(form, 'submit', event => {
        event.preventDefault();
        const fields = form.elements;
        const type = fields.namedItem('type').value;
        const label = fields.namedItem('label').value.trim();
        const seconds = Number(fields.namedItem('seconds').value);
        const trigger = fields.namedItem('trigger').value.trim();
        const match = fields.namedItem('match').value;
        const zone = fields.namedItem('zone').value.trim();
        if (!label || !Number.isFinite(seconds) || seconds < 1 || seconds > 604800 || (type !== 'manual' && !trigger)) { report('Enter a name, 1–604800 seconds, and trigger text or an NPC name.'); return; }
        void action('timer:save-definition', { label, type, durationSeconds:seconds, trigger:type === 'text' ? trigger : '', npc:type === 'spawn' ? trigger : '', match, zone, repeat:fields.namedItem('repeat').checked, enabled:true, overlap:'replace' });
    });
}

if (globalThis.document?.querySelector('#overlay')) mountOverlay();
