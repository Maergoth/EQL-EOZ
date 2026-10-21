// A lightweight native-window renderer. Session ownership and all log reads stay
// in the main app; opening or reloading a panel cannot create another parser.
const PANELS = Object.freeze({ parse:'Parse', intel:'Zone & loot', consider:'Consider', timers:'Timers' });
// PNUT M&M 28bbf8d _TabStrip/_HeaderBar and compact MeterTable, translated
// to native Electron panels with EQL colors and this app's supported metrics.
export const TABS = ['overview', 'damage', 'healing', 'taken', 'session'];
const TAB_LABELS = { overview:'Overview', damage:'Damage', healing:'Healing', taken:'Taken', session:'Session' };
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
    if (tab === 'session') scope = 'session';
    const encounters = Array.isArray(parse.encounters) ? parse.encounters : [];
    const current = encounters.find(encounter => encounter.active) || null;
    const previous = encounters.find(encounter => !encounter.active) || null;
    const chosen = scope === 'live' ? current : scope === 'previous' ? previous : encounters.find(encounter => String(encounter.id) === scope);
    const session = scope === 'session';
    const events = session ? encounters.flatMap(encounter => encounter.events || []) : chosen?.events || [];
    const types = { damage:'damage', healing:'heal', taken:'taken', runes:'rune' };
    const matching = events.filter(event => event.type === types[tab]);
    const breakdown = (session ? parse : chosen)?.breakdowns?.[tab];
    const aggregate = Array.isArray(breakdown) ? breakdown.map(row => ({ name:String(row.name || 'Unknown ability'), total:number(row.total), count:Number.isFinite(Number(row.count)) ? number(row.count) : null, rate:Number.isFinite(row.rate) ? row.rate : null })) : breakdown && typeof breakdown === 'object' ? Object.entries(breakdown).map(([name,total]) => ({ name, total:number(total), count:null, rate:null })) : null;
    const recordedTotal = aggregate ? aggregate.reduce((sum,row) => sum + row.total, 0) : matching.reduce((sum, event) => sum + number(event.amount), 0);
    const total = session && tab === 'damage' ? number(parse.totalDamage) : session && tab === 'healing' ? number(parse.totalHealing) : session && tab === 'taken' ? number(parse.totalTaken) : recordedTotal;
    const duration = session ? number(parse.sessionSeconds) : number(chosen?.duration);
    const rate = session && tab === 'damage' ? number(parse.sessionDps) : session && tab === 'taken' ? number(parse.sessionTakenPerSecond) : tab === 'taken' && chosen ? number(chosen.takenPerSecond) : duration ? total / duration : null;
    const groups = new Map();
    for (const event of matching) {
        const name = String(tab === 'taken' ? event.attacker || 'Unknown attacker' : event.source || event.kind || (tab === 'runes' ? 'Rune capacity granted' : 'Unknown ability'));
        const row = groups.get(name) || { name, total:0, count:0 };
        row.total += number(event.amount); row.count++; groups.set(name, row);
    }
    const source = session ? parse : chosen || {};
    const runeCapacity = (source.breakdowns?.runes || []).reduce((sum,row) => sum + number(row.total), 0);
    const metrics = { damage:session ? number(parse.totalDamage) : number(chosen?.damage), healing:session ? number(parse.totalHealing) : number(chosen?.healing), taken:session ? number(parse.totalTaken) : number(chosen?.taken), dps:session ? number(parse.sessionDps) : number(chosen?.dps), runeCapacity };
    return { scope, tab, character:parse.character || 'You', metrics, stats:parse,
        name:session ? 'Whole session · all zones' : chosen?.name || (scope === 'live' ? 'Waiting for combat…' : 'No completed encounter'), ended:Boolean(chosen && !chosen.active),
        title:session ? 'Session' : scope === 'live' ? current ? `Live · ${current.name || 'Encounter'}` : 'Live · waiting for combat' : scope === 'previous' ? previous ? `Previous · ${previous.name || 'Encounter'}` : 'Previous · no completed encounter' : chosen ? `${chosen.name || 'Encounter'} · saved encounter` : 'Selected encounter is no longer retained',
        total, rate, duration, recordedTotal, rows:(aggregate || [...groups.values()]).sort((a,b) => b.total - a.total),
        events:session ? (parse.recentEvents || []).slice(0, 40) : events.slice().reverse().slice(0, 40),
        available:session || Boolean(chosen), truncated:!aggregate && (session && total > recordedTotal || Boolean(chosen?.eventsTruncated)), feedTruncated:session || Boolean(chosen?.eventsTruncated) };
}
export function renderParseContent(view) {
    if (view.tab === 'session') {
        const s = view.stats;
        const rows = [['Damage',fmt(s.totalDamage)],['Healing',fmt(s.totalHealing)],['Damage taken',fmt(s.totalTaken)],['Own kills',fmt(s.totalOwnKills)],['Items looted',fmt(s.totalLoot)],['Encounters',fmt(s.encounterCount ?? s.encounters?.length)]];
        if (Number.isFinite(s.zoneCount)) rows.push(['Zones visited',fmt(s.zoneCount)]);
        rows.push(['Session elapsed',durationLabel(number(s.sessionSeconds) * 1000)],['Rune capacity granted',fmt(view.metrics.runeCapacity)]);
        return summaryRows(rows, 'Whole session');
    }
    if (view.tab === 'overview') {
        if (!view.available) return empty('Waiting for combat…');
        return `<table class="meter-table overview-table" aria-label="Your encounter overview"><thead><tr><th>Name</th><th>Damage</th><th>DPS</th><th>Heal</th><th>Taken</th></tr></thead><tbody><tr title="Your logged actions" style="--amount:100%"><td class="meter-name"><span class="meter-rank">1</span><span class="meter-label">${escapeHtml(view.character)}</span></td><td>${fmt(view.metrics.damage)}</td><td>${fmt(view.metrics.dps)}</td><td>${fmt(view.metrics.healing)}</td><td>${fmt(view.metrics.taken)}</td></tr></tbody></table>`;
    }
    const metric = TAB_LABELS[view.tab] || 'Damage';
    const heading = view.tab === 'taken' ? 'Attacker' : 'Ability';
    const rateLabel = view.tab === 'damage' ? 'DPS' : view.tab === 'healing' ? 'HPS' : 'DTPS';
    return `<table class="meter-table" aria-label="${attr(metric)} breakdown" title="${attr(view.title)} · your logged actions"><thead><tr><th>${heading}</th><th>${metric}</th><th>${rateLabel}</th><th>%</th><th>Hits</th></tr></thead><tbody>${view.rows.map((row,index) => {
        const percent = view.recordedTotal ? row.total / view.recordedTotal * 100 : 0;
        const width = view.rows[0]?.total ? row.total / view.rows[0].total * 100 : 0;
        const rate = view.tab === 'taken' && Number.isFinite(row.rate) ? row.rate : view.duration ? row.total / view.duration : null;
        return `<tr style="--amount:${width.toFixed(1)}%"><td class="meter-name" title="${attr(row.name)}"><span class="meter-rank">${index + 1}</span><span class="meter-label">${escapeHtml(row.name)}</span></td><td>${fmt(row.total)}</td><td>${rate === null ? '—' : fmt(rate)}</td><td>${fmt(percent)}%</td><td>${row.count === null ? '—' : fmt(row.count)}</td></tr>`;
    }).join('')}</tbody></table>` + (!view.rows.length ? empty(view.available ? 'No recorded actions.' : 'Waiting for combat…') : '') + (view.truncated ? '<div class="meter-caption">Retained events</div>' : '');
}
function summaryRows(rows, title) { return `<div class="summary-section">${escapeHtml(title)}</div><table class="summary-table"><tbody>${rows.map(([label,value]) => `<tr><td title="${label === 'Rune capacity granted' ? 'Logged capacity granted; damage absorbed is not measured.' : ''}">${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>`).join('')}</tbody></table>`; }
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
    if (panel === 'parse') return `<nav class="parse-tabs" aria-label="Parse metrics">${TABS.map(tab => `<button type="button" data-tab="${tab}" aria-pressed="${tab === 'damage'}" class="${tab === 'damage' ? 'is-active' : ''}">${TAB_LABELS[tab]}</button>`).join('')}</nav><div id="parse-body"></div>`;
    if (panel === 'intel') return '<div class="panel-toolbar"><label><input id="class-filter" type="checkbox"> My Class</label><button type="button" data-open-view="map">Map ↗</button></div><div id="intel-body"></div>';
    if (panel === 'consider') return '<div class="panel-toolbar"><label><input id="class-filter" type="checkbox"> My Class</label><button type="button" data-open-view="items">Items ↗</button></div><div id="consider-body"></div>';
    return '<div class="timer-display"><div id="timer-list"></div><div id="swing-body"></div></div>';
}
export function timerView(timer = {}, now = Date.now()) {
    const durationMs = number(timer.durationSeconds) * 1000;
    const running = timer.status === 'running';
    const remainingMs = running && Number.isFinite(timer.expiresAt) ? Math.max(0, timer.expiresAt - now) : number(timer.remainingMs ?? durationMs);
    const fraction = durationMs ? Math.min(1, Math.max(0, remainingMs / durationMs)) : 0;
    return { ...timer, durationMs, running, remainingMs, fraction };
}
export function renderTimerRows(timers = [], now = Date.now()) {
    return timers.length ? timers.map(source => {
        const timer = timerView(source, now);
        const color = timer.remainingMs <= 5000 ? '#dc7777' : timer.remainingMs <= 15000 ? '#d8b75c' : '#80b892';
        const status = timer.status === 'paused' ? ' · paused' : timer.status === 'ended' ? ' · ended' : '';
        return `<div class="timer-row ${timer.status === 'ended' ? 'is-ended' : ''}" style="--remaining:${(timer.fraction * 100).toFixed(1)}%;--timer-color:${color}" title="${attr(timer.label)}${timer.source === 'spawn' ? ' · estimated respawn' : ''}${status}"><span class="timer-ring" aria-hidden="true"></span><span class="timer-label">${escapeHtml(timer.label || 'Timer')}${timer.status === 'paused' ? ' Ⅱ' : ''}</span><span class="timer-value">${durationLabel(timer.remainingMs)}</span><span class="timer-line" aria-hidden="true"><span></span></span></div>`;
    }).join('') : empty('Timers: none running');
}
export function renderSwing(swing = {}, now = Date.now()) {
    if (swing.enabled === false) return '';
    const intervalMs = number(swing.intervalMs);
    const lastAt = swing.lastAt === null || swing.lastAt === undefined ? 0 : number(swing.lastAt);
    const stale = !lastAt || !intervalMs || now - lastAt > intervalMs * 2.5 + 1000;
    if (stale) return '<div class="swing-idle">Auto attack: waiting for swings</div>';
    const progress = swing.status === 'casting' ? 1 : Math.min(1, Math.max(0, (now - lastAt) / intervalMs));
    return `<div class="swing-row" title="Observed swing estimate from your log; timing has one-second precision"><strong>Observed ${(intervalMs / 1000).toFixed(1)}s</strong><span class="swing-track"><span style="--progress:${(progress * 100).toFixed(1)}%;--swing-color:${progress >= .85 ? '#80b892' : '#d8b75c'}"></span></span></div>`;
}
export function mountOverlay({ document = globalThis.document, bridge = globalThis.eyeOfZommOverlay, panel = new URLSearchParams(globalThis.location?.search || '').get('panel'), setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval, now = Date.now } = {}) {
    panel = Object.hasOwn(PANELS, panel) ? panel : 'parse';
    const $ = selector => document.querySelector(selector);
    if (!$('#panel-content')) return { dispose() {} };
    document.body.dataset.panel = panel;
    $('#overlay-title').textContent = PANELS[panel]; document.title = `Eye of Zomm · ${PANELS[panel]}`;
    $('#panel-content').innerHTML = panelMarkup(panel);
    if (panel === 'timers') {
        // The small PNUT-style dock is a display surface. Configuration and
        // timer management live in the main app; one hover button opens it.
        $('.hover-menu').innerHTML = '<button class="chrome-button" type="button" data-open-view="timers" aria-label="Edit timers" title="Edit timers">⚙</button>';
    }
    let state = {}, scope = 'live', tab = 'damage', disposed = false, status = '', request = 0, stateGeneration = 0, noticeGeneration = 0, lastNoticeId = '', unsubscribe;
    const listeners = [];
    const listen = (target,name,callback) => { target?.addEventListener(name,callback); listeners.push(() => target?.removeEventListener(name,callback)); };
    const session = () => state.snapshot?.session || {};
    const replace = (element, html) => { if (element && element.innerHTML !== html) element.innerHTML = html; };
    const report = message => { status = message; $('#overlay-status').textContent = message; };
    async function action(command,value) {
        if (disposed || !bridge?.action) return;
        if (command.startsWith('session:') && state.sessionAvailable !== true) { report('Session paused · open main app.'); return; }
        const owner = ++request, priorNotice = noticeGeneration;
        try {
            const next = await bridge.action(command,value);
            if (disposed) return;
            if (next?.preferences) { state = next; render(); }
            if (next?.error) { report(String(next.error)); return; }
            if (owner === request && priorNotice === noticeGeneration) report('');
        } catch { if (!disposed && owner === request) report('Action unavailable · open main app.'); }
    }
    function renderTimers() {
        const timers = session().timers || {};
        const visible = (timers.timers || []).filter(timer => timer.visible !== false);
        replace($('#timer-list'), !visible.length && timers.swing?.enabled !== false ? '' : renderTimerRows(visible, now()));
        replace($('#swing-body'), renderSwing(timers.swing, now()));
    }
    function render() {
        if (disposed) return;
        const prefs = state.preferences || {};
        document.documentElement.style.setProperty('--panel-opacity', String(Math.min(1, Math.max(.15, number(prefs.backgroundOpacity) || .85))));
        document.documentElement.style.setProperty('--font-scale', String(Math.min(1.75, Math.max(.75, number(prefs.fontScale) || 1))));
        $('#overlay').classList.toggle('is-locked', Boolean(prefs.locked));
        if (panel !== 'timers') {
            $('#layout-lock').checked = Boolean(prefs.locked); $('#ignore-mouse').checked = Boolean(prefs.passThrough);
            $('#panel-opacity').value = prefs.backgroundOpacity ?? .85; $('#panel-font').value = String(prefs.fontScale ?? 1);
        }
        const s = session(), notice = s.notice;
        if (notice?.id && notice.id !== lastNoticeId && (!notice.panel || notice.panel === panel)) { lastNoticeId = notice.id; noticeGeneration++; report(String(notice.message || 'Action unavailable.')); }
        $('#session-restart').hidden = !(Number(state.sessionRestartCount) > 0);
        if (panel === 'parse') {
            const parse = s.parse || {};
            const view = parseView(parse,scope,tab);
            const selector = $('#encounter-scope');
            const options = `<option value="live">${attr(parse.encounters?.find(encounter => encounter.active)?.name || 'Waiting for combat…')} · Live</option><option value="previous">Previous encounter</option><option value="session">Whole session</option>` + (parse.encounters || []).slice(0,50).map(encounter => `<option value="${attr(encounter.id)}">${escapeHtml(encounter.name || 'Encounter')} · ${new Date(number(encounter.startAt)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</option>`).join('');
            replace(selector, options + (!['live','previous','session'].includes(scope) && !(parse.encounters || []).some(encounter => String(encounter.id) === scope) ? `<option value="${attr(scope)}">Encounter no longer retained</option>` : ''));
            selector.value = scope; selector.hidden = tab === 'session';
            $('#overlay-title').hidden = tab !== 'session';
            if (tab === 'session') $('#overlay-title').textContent = 'Whole session · all zones';
            $('#encounter-stats').hidden = tab === 'session' || !view.available;
            replace($('#encounter-stats'), `${view.ended ? '<span class="ended">ended</span>' : ''}<span>${durationLabel(view.duration * 1000)}</span><span class="header-total">${fmt(view.metrics.damage)} <small>dmg</small></span><span><strong>${fmt(view.metrics.dps)}</strong> <small>dps</small></span>`);
            replace($('#parse-body'), renderParseContent(view));
        } else if (panel === 'intel') { $('#overlay-title').textContent = s.zone || 'Zone & loot'; $('#class-filter').checked = Boolean(s.intel?.myClassOnly); replace($('#intel-body'), renderIntel(s.intel)); }
        else if (panel === 'consider') { $('#overlay-title').textContent = s.consider?.name || 'Consider'; $('#class-filter').checked = Boolean(s.consider?.myClassOnly); replace($('#consider-body'), renderConsider(s.consider)); }
        else renderTimers();
        document.querySelectorAll('#panel-content button, #panel-content input, #panel-content select').forEach(element => {
            if (state.sessionAvailable !== true) { if (!element.disabled) element.dataset.sessionDisabled = 'true'; element.disabled = true; }
            else if (element.dataset.sessionDisabled) { element.disabled = false; delete element.dataset.sessionDisabled; }
        });
        $('#overlay-status').textContent = state.sessionAvailable !== true ? 'Session paused · open main app.' : status;
    }
    listen($('#panel-menu-button'),'click',event => { const menu = event.currentTarget.closest('.hover-menu'); menu.classList.remove('is-dismissed'); const open = menu.classList.toggle('is-open'); event.currentTarget.setAttribute('aria-expanded',String(open)); });
    listen($('.hover-menu'),'mouseleave',event => event.currentTarget.classList.remove('is-dismissed'));
    listen(document,'keydown',event => { if (event.key === 'Escape' && $('#panel-menu-button')) { $('.hover-menu').classList.remove('is-open'); $('.hover-menu').classList.add('is-dismissed'); $('#panel-menu-button').setAttribute('aria-expanded','false'); document.activeElement?.blur(); } });
    listen($('#layout-lock'),'change',event => { void action('lock',event.target.checked); });
    listen($('#ignore-mouse'),'change',event => { void action('pass-through',event.target.checked); });
    listen($('#panel-opacity'),'change',event => { void action('opacity',Number(event.target.value)); });
    listen($('#panel-font'),'change',event => { void action('font-scale',Number(event.target.value)); });
    listen($('#encounter-scope'),'change',event => { scope = event.target.value; render(); });
    listen($('#class-filter'),'change',event => { void action('session:class-filter',{panel,enabled:event.target.checked}); });
    listen(document,'click',event => {
        const button = event.target.closest?.('button'); if (!button || button.disabled) return;
        if (button.dataset.command) void action(button.dataset.command);
        if (button.dataset.openView) void action(state.sessionAvailable === true ? 'session:open' : 'show-main',state.sessionAvailable === true ? {view:button.dataset.openView} : undefined);
        if (button.dataset.tab) { tab = TABS.includes(button.dataset.tab) ? button.dataset.tab : 'damage'; document.querySelectorAll('[data-tab]').forEach(element => { const active = element.dataset.tab === tab; element.classList.toggle('is-active',active); element.setAttribute('aria-pressed',String(active)); }); render(); }
        const s = session();
        if (button.dataset.npcAction) {
            const npc = s.intel?.npcs?.[Number(button.dataset.npcIndex)]; if (!npc) return;
            const command = button.dataset.npcAction;
            void action(command === 'details' ? 'session:open' : `session:${command}`,{...(command === 'details' ? {view:'npcs'} : {}),npc:npc.name,zone:s.intel?.zone || s.zone});
        }
        if (button.dataset.considerAction && s.consider?.name) void action(button.dataset.considerAction === 'details' ? 'session:open' : 'session:route',{view:'npcs',npc:s.consider.name,zone:s.zone});
        if (button.dataset.itemIndex !== undefined) {
            const context = button.dataset.itemContext;
            const item = context?.startsWith('intel:') ? s.intel?.npcs?.[Number(context.slice(6))]?.drops?.[Number(button.dataset.itemIndex)] : s.consider?.drops?.[Number(button.dataset.itemIndex)];
            if (item) void action('session:open',{view:'items',item:item.name});
        }
    });
    if (bridge?.onState) unsubscribe = bridge.onState(next => { if (!disposed) { stateGeneration++; state = next || {}; render(); } });
    const initial = stateGeneration;
    Promise.resolve(bridge?.getState?.()).then(next => { if (!disposed && initial === stateGeneration && next) { state = next; render(); } }).catch(() => report('Open main app.'));
    const tick = setInterval(() => { if (!document.hidden && panel === 'timers' && state.sessionAvailable === true) renderTimers(); },100);
    render();
    return {render(next) {stateGeneration++; state = next || {}; render();},dispose() {disposed = true; listeners.forEach(remove => remove()); unsubscribe?.(); clearInterval(tick);}};
}
if (globalThis.document?.querySelector('#overlay')) mountOverlay();
