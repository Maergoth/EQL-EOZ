// A lightweight native-window renderer. Session ownership and all log reads stay
// in the main app; opening or reloading a panel cannot create another parser.
import { applyAppearance } from './appearance.js';
import { isItemStatModified, itemAccuracyIsPercent } from './item-stat-presentation.js';
import { catalogItemboxMarkup } from './catalog-itembox.js';
import { characterItemboxStatLabel } from './character-itembox.js';
import { mountOverlayDrag } from './overlay-drag.js';
import { createTooltipHover } from './tooltip-delay.js';
const PANELS = Object.freeze({ parse:'Parse', intel:'Zone & loot', timers:'Triggers', map:'Map' });
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
    const runeCapacity = Number.isFinite(source.totalRuneCapacity) ? number(source.totalRuneCapacity) : (source.breakdowns?.runes || []).reduce((sum,row) => sum + number(row.total), 0);
    const metrics = { damage:session ? number(parse.totalDamage) : number(chosen?.damage), healing:session ? number(parse.totalHealing) : number(chosen?.healing), taken:session ? number(parse.totalTaken) : number(chosen?.taken), dps:session ? number(parse.sessionDps) : number(chosen?.dps), runeCapacity };
    return { scope, tab, character:parse.character || 'You', metrics, stats:parse,
        combatants:Array.isArray(source.combatants) ? source.combatants : [],
        combatantSeconds:session ? number(parse.combatantSeconds) : duration,
        name:session ? 'Whole session · all zones' : chosen?.name || (scope === 'live' ? 'Waiting for combat…' : 'No completed encounter'), ended:Boolean(chosen && !chosen.active),
        title:session ? 'Session' : scope === 'live' ? current ? `Live · ${current.name || 'Encounter'}` : 'Live · waiting for combat' : scope === 'previous' ? previous ? `Previous · ${previous.name || 'Encounter'}` : 'Previous · no completed encounter' : chosen ? `${chosen.name || 'Encounter'} · saved encounter` : 'Selected encounter is no longer retained',
        total, rate, duration, recordedTotal, rows:(aggregate || [...groups.values()]).sort((a,b) => b.total - a.total),
        events:session ? (parse.recentEvents || []).slice(0, 40) : events.slice().reverse().slice(0, 40),
        available:session || Boolean(chosen), truncated:!aggregate && (session && total > recordedTotal || Boolean(chosen?.eventsTruncated)), feedTruncated:session || Boolean(chosen?.eventsTruncated) };
}
export function renderParseContent(view, expanded = new Set()) {
    if (view.tab === 'session') {
        const s = view.stats;
        const rows = [['Damage',fmt(s.totalDamage)],['Healing',fmt(s.totalHealing)],['Damage taken',fmt(s.totalTaken)],['AA Gained',fmt(s.totalAaGained)],['Own kills',fmt(s.totalOwnKills)],['Items looted',fmt(s.totalLoot)],['Encounters',fmt(s.encounterCount ?? s.encounters?.length)]];
        if (Number.isFinite(s.zoneCount)) rows.push(['Zones visited',fmt(s.zoneCount)]);
        rows.push(['Session elapsed',durationLabel(number(s.sessionSeconds) * 1000)]);
        return '<div class="session-actions"><button type="button" data-new-session>New session</button><span>Split the parse here; keep your running triggers.</span></div>' + summaryRows(rows, 'Whole session');
    }
    if (view.tab === 'overview') {
        if (!view.available) return empty('Waiting for combat…');
        const rows = view.combatants.length ? view.combatants : [{name:view.character,...view.metrics}];
        return `<table class="meter-table overview-table" aria-label="Logged combatants overview"><thead><tr><th>Name</th><th>Damage</th><th>DPS</th><th>Heal</th><th>Taken</th></tr></thead><tbody>${rows.map((row,index) => `<tr title="Logged actions; names do not imply player or NPC status" style="--amount:${rows[0]?.damage ? Math.min(100,number(row.damage) / number(rows[0].damage) * 100).toFixed(1) : 0}%"><td class="meter-name" title="${attr(row.name)}"><span class="meter-rank">${index + 1}</span><span class="meter-label">${escapeHtml(row.name)}</span></td><td>${fmt(row.damage)}</td><td>${fmt(row.dps)}</td><td>${fmt(row.healing)}</td><td>${fmt(row.taken)}</td></tr>`).join('')}</tbody></table>` + combatantCaption(view);
    }
    if (view.combatants.length && ['damage','healing','taken'].includes(view.tab)) return renderCombatantDetails(view,expanded) + (view.tab === 'healing' ? summaryRows([['Rune capacity granted',fmt(view.metrics.runeCapacity)]], 'Your rune capacity granted') + '<div class="meter-caption">Logged capacity granted; damage absorbed is not measured. Excluded from healing and HPS.</div>' : '') + combatantCaption(view);
    const metric = TAB_LABELS[view.tab] || 'Damage';
    const heading = view.tab === 'taken' ? 'Attacker' : 'Ability';
    const rateLabel = view.tab === 'damage' ? 'DPS' : view.tab === 'healing' ? 'HPS' : 'DTPS';
    return `<table class="meter-table" aria-label="${attr(metric)} breakdown" title="${attr(view.title)} · your logged actions"><thead><tr><th>${heading}</th><th>${metric}</th><th>${rateLabel}</th><th>%</th><th>Hits</th></tr></thead><tbody>${view.rows.map((row,index) => {
        const percent = view.recordedTotal ? row.total / view.recordedTotal * 100 : 0;
        const width = view.rows[0]?.total ? row.total / view.rows[0].total * 100 : 0;
        const rate = view.tab === 'taken' && Number.isFinite(row.rate) ? row.rate : view.duration ? row.total / view.duration : null;
        return `<tr style="--amount:${width.toFixed(1)}%"><td class="meter-name" title="${attr(row.name)}"><span class="meter-rank">${index + 1}</span><span class="meter-label">${escapeHtml(row.name)}</span></td><td>${fmt(row.total)}</td><td>${rate === null ? '—' : fmt(rate)}</td><td>${fmt(percent)}%</td><td>${row.count === null ? '—' : fmt(row.count)}</td></tr>`;
    }).join('')}</tbody></table>` + (!view.rows.length ? empty(view.available ? 'No recorded actions.' : 'Waiting for combat…') : '') + (view.truncated ? '<div class="meter-caption">Retained events</div>' : '') + (view.tab === 'healing' ? summaryRows([['Rune capacity granted',fmt(view.metrics.runeCapacity)]], 'Rune capacity granted') + '<div class="meter-caption">Logged capacity granted; damage absorbed is not measured. Excluded from healing and HPS.</div>' : '');
}
function combatantCaption(view) {
    return '<div class="meter-caption">Logged combatants only; pets keep their own names. Damage given and damage taken describe the same hits; do not add them together.</div>' +
        (view.scope === 'session' ? `<div class="meter-caption">Other combatant rates use ${durationLabel(view.combatantSeconds * 1000)} of observed combat. Your DPS keeps its existing outgoing-damage clock.</div>` : '<div class="meter-caption">Rates use this encounter’s duration. Overlapping disconnected fights have separate encounters.</div>') +
        (view.stats.encounterHistoryLimited ? '<div class="meter-caption">Encounter history was regrouped from retained events. Older encounter details may be incomplete; whole-session combatant totals are retained.</div>' : '');
}
function renderCombatantDetails(view, expanded) {
    const metric = view.tab, rateKey = {damage:'dps',healing:'hps',taken:'dtps'}[metric], rateLabel = {damage:'DPS',healing:'HPS',taken:'DTPS'}[metric];
    const actors = view.combatants.filter(row => number(row[metric]) > 0 || number(row[`${metric}Hits`]) > 0).slice().sort((a,b) => number(b[metric]) - number(a[metric]));
    const total = actors.reduce((sum,row) => sum + number(row[metric]),0);
    if (!actors.length) return empty('No recorded actions.');
    return `<div class="combatant-columns" aria-hidden="true"><span>Combatant · expand</span><span>${TAB_LABELS[metric]}</span><span>${rateLabel}</span></div>` + actors.map(actor => {
        const key = JSON.stringify([view.scope,view.tab,actor.name]), rows = actor.breakdowns?.[metric] || [];
        const seconds = metric === 'damage' && view.scope === 'session' && actor.name?.toLowerCase() === view.character.toLowerCase() ? number(view.stats.sessionSeconds) : view.combatantSeconds;
        return `<details class="combatant-details" data-combatant-key="${attr(key)}"${expanded.has(key) ? ' open' : ''}><summary title="${attr(actor.name)} · ${fmt(total ? number(actor[metric]) / total * 100 : 0)}% of logged ${metric}"><span class="combatant-name">${escapeHtml(actor.name)}</span><strong>${fmt(actor[metric])}</strong><span>${fmt(actor[rateKey])}</span></summary><table class="meter-table" aria-label="${attr(actor.name)} ${TAB_LABELS[metric]} breakdown"><thead><tr><th>${metric === 'taken' ? 'Attacker' : 'Ability'}</th><th>${TAB_LABELS[metric]}</th><th>${rateLabel}</th><th>%</th><th>Hits</th></tr></thead><tbody>${rows.map((row,index) => `<tr style="--amount:${rows[0]?.total ? (number(row.total) / number(rows[0].total) * 100).toFixed(1) : 0}%"><td class="meter-name" title="${attr(row.name)}"><span class="meter-rank">${index + 1}</span><span class="meter-label">${escapeHtml(row.name)}</span></td><td>${fmt(row.total)}</td><td>${seconds ? fmt(number(row.total) / seconds) : '—'}</td><td>${fmt(number(actor[metric]) ? number(row.total) / number(actor[metric]) * 100 : 0)}%</td><td>${fmt(row.count)}</td></tr>`).join('')}</tbody></table></details>`;
    }).join('');
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
export const isRaidSource = source => source?.raidInstance === true || source?.instanceType === 'raid';
export const intelNpcKey = (npc, context = '') => {
    const intel = typeof context === 'object' && context ? context : {zone:context};
    return JSON.stringify([String(intel.zone || ''),Boolean(intel.myClassOnly),String(intel.packVersion || ''),String(intel.profileKey || ''),intelTierValue(intel.itemTier),String(npc?.id || npc?.name || ''),isRaidSource(npc)]);
};
export const intelTierValue = value => Math.max(0,Math.min(10,Math.trunc(Number(value)||0)));
const crawlDefeated = (npc,intel) => intel?.crawlEnabled === true && npc?.defeated === true;
export const intelSectionKey = (intel,raid) => JSON.stringify([String(intel?.zone || ''),raid ? 'raid' : 'normal']);
export function intelMobAction(command,npc,zone) {
    const payload = {npc:npc.name,zone,raidInstance:isRaidSource(npc)};
    if (command === 'map') return {action:'session:map-focus',payload:{id:npc.id,...payload}};
    return {action:command === 'details' ? 'session:open' : `session:${command}`,payload:{...(command === 'details' ? {view:'npcs'} : {}),...payload}};
}
export function renderItem(item = {}, index = 0, context = '') {
    const icon = itemIcon(item.icon);
    const stats = Object.entries(item.stats || {}).filter(([,value]) => ['string', 'number'].includes(typeof value)).slice(0, 18);
    const statText=(key,value)=>key==='ACCURACY'&&itemAccuracyIsPercent(item)?`${Number(value)>0?'+':''}${value}%`:value;
    const hoverAttrs = `data-item-hover data-item-index="${index}" data-item-context="${attr(context)}" data-item-name="${attr(item.name || 'Unknown item')}" aria-describedby="intel-item-tooltip"`;
    return `<div class="item-card"><div class="item-heading"><button type="button" class="item-icon-button" ${hoverAttrs} aria-label="${attr(`Stats for ${item.name || 'Unknown item'}`)}">${icon ? `<img class="item-icon" src="${attr(icon)}" alt="">` : '<span class="item-icon item-icon-placeholder" aria-hidden="true">◇</span>'}</button><div><button type="button" class="item-name" ${hoverAttrs}>${escapeHtml(item.name || 'Unknown item')}</button><div class="item-meta">${escapeHtml((item.slots || []).join(' · ') || 'Item')}${number(item.tier) ? ` · Tier ${number(item.tier)}` : ' · Base'}</div></div></div>${stats.length ? `<div class="item-stats">${stats.map(([key,value]) => `<span${isItemStatModified(item.baseStats?.[key],value,item.tier)?' class="is-scaled"':''}>${escapeHtml(characterItemboxStatLabel(key))} ${escapeHtml(statText(key,value))}</span>`).join(' · ')}</div>` : ''}</div>`;
}
export function renderItemTooltip(item = {}) {
    return catalogItemboxMarkup(item);
}
export function renderIntel(intel = {}, {query = '', expanded = new Set(), loading = new Set(), dropCache = new Map(), errors = new Map(), actionKey = '', collapsedSections = new Set()} = {}) {
    const needle = String(query).trim().toLocaleLowerCase();
    // Distances change as logged positions arrive. Keep the research list in a
    // stable name order while preserving the source index used by its actions.
    const npcs = (Array.isArray(intel.npcs) ? intel.npcs : []).map((npc,index) => ({npc,index})).filter(({npc}) => !needle || String(npc.name).toLocaleLowerCase().includes(needle)).sort((a,b)=>String(a.npc.name||'').localeCompare(String(b.npc.name||''))||String(a.npc.id||'').localeCompare(String(b.npc.id||'')));
    return [true,false].map(raid => {
        const sources = npcs.filter(({npc}) => isRaidSource(npc) === raid);
        const section = raid ? 'raid' : 'normal', label = raid ? 'Raid Zone' : 'Normal Zone', closed = collapsedSections.has(intelSectionKey(intel,raid));
        return `<section class="intel-group ${raid ? 'is-raid' : ''}${closed ? ' is-collapsed' : ''}" data-intel-section="${section}" aria-label="${label}"><h2><button type="button" class="intel-section-toggle" data-intel-section-toggle="${section}" aria-expanded="${!closed}" aria-controls="intel-section-${section}"><span class="intel-section-chevron" aria-hidden="true">${closed ? '▸' : '▾'}</span>${label}<span class="intel-section-count">${sources.length}${closed ? ' · collapsed' : ''}</span></button></h2><div id="intel-section-${section}" class="intel-section-content"${closed ? ' hidden' : ''}>${sources.length ? sources.map(({npc,index}) => {
            const key = intelNpcKey(npc,intel);
            const defeated = crawlDefeated(npc,intel);
            const open = !defeated && expanded.has(key);
            const cached = dropCache.get(key);
            const drops = Array.isArray(cached?.items) ? cached.items : Array.isArray(npc.drops) ? npc.drops : [];
            const shown = defeated ? [] : open ? drops : drops.slice(0,3);
            const total = number(cached?.total ?? npc.dropCount ?? drops.length);
            const previewCount = Math.min(3,(npc.drops || []).length);
            const pending = open && loading.has(key) && drops.length < total;
            const focused = !defeated && Boolean(intel.focusedNpcId && String(npc.id || npc.name) === String(intel.focusedNpcId));
            return `<article class="npc-row con-${conKey(npc.con)}${defeated ? ' is-defeated' : ''} ${focused ? 'is-focused' : ''}" data-intel-key="${attr(key)}" ${focused ? 'aria-current="true"' : ''}><div class="npc-summary${!defeated && actionKey === key ? ' is-actions-open' : ''}"><div class="npc-heading"><button type="button" class="npc-name" aria-label="${attr(defeated ? `${npc.name} · defeated in Crawl mode` : `Actions for ${npc.name}`)}" ${defeated ? 'disabled' : `aria-describedby="npc-actions-${index}"`}>${escapeHtml(npc.name)}</button>${raid ? '<span class="raid-source-badge">Raid</span>' : ''}<small>${npc.level || npc.levelMax ? `L${escapeHtml(npc.level || (npc.levelMin === npc.levelMax ? npc.levelMax : `${npc.levelMin}–${npc.levelMax}`))}` : ''}<span data-intel-distance-index="${index}">${Number.isFinite(npc.distance) ? ` · ${fmt(npc.distance)}u` : ''}</span></small></div><div class="npc-meta">${defeated ? 'Defeated · ' : ''}${npc.named ? 'Named' : npc.rare ? 'Rare' : 'NPC'} · ${knownDropLabel({...npc,drops,dropCount:total},intel.myClassOnly,shown.length)}${npc.waypoint ? ' · waypoint available' : ''}</div><div id="npc-actions-${index}" class="row-actions"${defeated ? ' hidden inert' : ''} role="group" aria-label="${attr(`Actions for ${npc.name}`)}"><button type="button" data-npc-action="details" data-npc-index="${index}">Details</button><button type="button" data-npc-action="route" data-npc-index="${index}" ${!intel.canRoute || !npc.waypoint ? 'disabled title="Enable maps and use a current logged location in the main app"' : ''}>Route</button><button type="button" data-npc-action="copy-waypoint" data-npc-index="${index}" ${!npc.waypoint ? 'disabled' : ''}>Copy /waypoint</button><button type="button" data-npc-action="wiki" data-npc-index="${index}">Wiki</button><button type="button" data-npc-action="map" data-npc-index="${index}" ${!npc.waypoint ? 'disabled title="No known location for this mob"' : 'title="Open native Map at this mob"'}>Map</button></div></div><div class="npc-drop-list" ${pending ? 'aria-busy="true"' : ''}>${shown.map((item,itemIndex) => renderItem(item,itemIndex,`intel:${index}`)).join('')}</div>${!defeated && total > previewCount ? `<button type="button" class="show-more-drops" data-intel-expand="${attr(key)}" data-npc-index="${index}" aria-expanded="${open}">${open ? 'Show Less' : `Show More (${Math.max(0,total - previewCount)})`}</button>` : ''}${pending ? '<div class="npc-meta">Loading remaining drops…</div>' : ''}${open && errors.has(key) ? `<div class="intel-drop-error" role="status">${escapeHtml(errors.get(key))}</div><button type="button" class="show-more-drops" data-intel-retry="${attr(key)}" data-npc-index="${index}">Retry loading drops</button>` : ''}</article>`;
        }).join('') : `<div class="intel-empty">${needle ? 'No matching mobs.' : raid ? 'No raid-instance mobs in this zone.' : 'No matching named or rare mobs.'}</div>`}</div></section>`;
    }).join('');
}
export function panelMarkup(panel) {
    if (panel === 'parse') return `<nav class="parse-tabs" aria-label="Parse metrics">${TABS.map(tab => `<button type="button" data-tab="${tab}" aria-pressed="${tab === 'damage'}" class="${tab === 'damage' ? 'is-active' : ''}">${TAB_LABELS[tab]}</button>`).join('')}</nav><div id="parse-body"></div>`;
    if (panel === 'intel') return '<div class="intel-controls"><div class="panel-toolbar intel-filter-row"><label class="intel-tier-label" for="intel-item-tier">Item level <output id="intel-item-tier-value" for="intel-item-tier">Base</output></label><input id="intel-item-tier" type="range" min="0" max="10" step="1" value="0" aria-label="Item level"><label class="intel-class-label"><input id="class-filter" type="checkbox"> My Class</label><label class="intel-crawl-label" title="Keep defeated mobs dimmed until the next zone entry"><input id="intel-crawl-mode" type="checkbox"> Crawl</label></div><input id="intel-search" class="intel-search" type="search" maxlength="160" placeholder="Find named or rare mob…" aria-label="Search named and rare mobs"><span id="intel-attention" class="sr-only" role="status" aria-live="polite"></span></div><div id="intel-body" class="intel-mob-list" role="region" aria-label="Named and rare mob loot"></div>';
    if (panel === 'map') return '<div id="native-map-root"></div>';
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
        const validColor = (value,fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
        const color = timer.remainingMs <= number(timer.lowSeconds ?? 5)*1000 ? validColor(timer.lowColor,'#dc7777') : timer.warningSeconds && timer.remainingMs <= number(timer.warningSeconds)*1000 ? validColor(timer.warningColor,'#d8b75c') : validColor(timer.color,'#80b892');
        const status = timer.status === 'paused' ? ' · paused' : timer.status === 'ended' ? ' · ended' : '';
        return `<div class="timer-row ${timer.status === 'ended' ? 'is-ended' : ''}" style="--remaining:${(timer.fraction * 100).toFixed(1)}%;--timer-color:${color}" title="${attr(timer.label)}${timer.source === 'spawn' ? ' · estimated respawn' : ''}${status}"><span class="timer-ring" aria-hidden="true"></span><span class="timer-label">${escapeHtml(timer.label || 'Timer')}${timer.status === 'paused' ? ' Ⅱ' : ''}</span><span class="timer-value">${durationLabel(timer.remainingMs)}</span><span class="timer-line" aria-hidden="true"><span></span></span></div>`;
    }).join('') : empty('No active countdowns');
}
export function renderTimerNotifications(notifications = [], now = Date.now()) {
    return notifications.filter(item => number(item.expiresAt) > now).slice(-4).map(item => `<div class="timer-notification" style="opacity:${Math.min(1,Math.max(0,(number(item.expiresAt)-now)/1000)).toFixed(2)}">${escapeHtml(item.label)}</div>`).join('');
}
export function renderSwing(swing = {}, now = Date.now()) {
    if (swing.enabled !== true) return '';
    const intervalMs = number(swing.intervalMs);
    const lastAt = swing.lastAt === null || swing.lastAt === undefined ? 0 : number(swing.lastAt);
    const stale = !lastAt || !intervalMs || now - lastAt > intervalMs * 2.5 + 1000;
    if (stale) return '<div class="swing-idle">Auto attack: waiting for swings</div>';
    const progress = swing.status === 'casting' ? 1 : Math.min(1, Math.max(0, (now - lastAt) / intervalMs));
    return `<div class="swing-row" title="Observed swing estimate from your log; timing has one-second precision"><strong>Observed ${(intervalMs / 1000).toFixed(1)}s</strong><span class="swing-track"><span style="--progress:${(progress * 100).toFixed(1)}%;--swing-color:${progress >= .85 ? '#80b892' : '#d8b75c'}"></span></span></div>`;
}
export function mountOverlay({ document = globalThis.document, bridge = globalThis.eyeOfZommOverlay, panel = new URLSearchParams(globalThis.location?.search || '').get('panel'), setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout, now = Date.now } = {}) {
    panel = Object.hasOwn(PANELS, panel) ? panel : 'parse';
    const $ = selector => document.querySelector(selector);
    if (!$('#panel-content')) return { dispose() {} };
    document.body.dataset.panel = panel;
    $('#overlay-title').textContent = PANELS[panel]; document.title = `Eye of Zomm · ${PANELS[panel]}`;
    $('#panel-content').innerHTML = panelMarkup(panel);
    if (panel === 'timers') {
        // The small PNUT-style dock is a display surface. Configuration and
        // timer management live in the main app; one hover button opens it.
        $('.hover-menu').innerHTML = '<button class="chrome-button" type="button" data-open-view="timers" aria-label="Edit triggers" title="Edit triggers">⚙</button>';
    }
    let state = {}, scope = 'live', tab = 'damage', disposed = false, status = '', request = 0, stateGeneration = 0, noticeGeneration = 0, lastNoticeId = '', unsubscribe, mapController, measuredTimerHeight = 0;
    let intelQuery = '', lastIntelFocus = '', lastIntelFocusEvent = '', draftIntelTier = null, intelActionKey = '', activeItemTooltip = null, itemTooltipHideTimer = null, lastParseSession = null;
    const expandedIntel = new Set(), collapsedIntelSections = new Set(), intelLoading = new Map(), intelDropCache = new Map(), intelErrors = new Map();
    const expandedCombatants = new Set();
    let lastIntelContent='',lastSessionAvailability=null,intelDistances=[],intelDropRevision=0;
    const itemTooltipHover=createTooltipHover({show:showItemTooltip,valid:target=>!disposed && state.sessionAvailable===true && state.preferences?.visible!==false && target?.isConnected && !target.closest('[hidden]'),setTimeout,clearTimeout});
    const listeners = [];
    let resizeDrag=null,resizePending=null,resizeBusy=false;
    const listen = (target,name,callback) => { target?.addEventListener(name,callback); listeners.push(() => target?.removeEventListener(name,callback)); };
    const session = () => state.snapshot?.session || {};
    const replace = (element, html) => { if (element && element.innerHTML !== html) element.innerHTML = html; };
    const report = message => { status = message; $('#overlay-status').textContent = message; measureTimers(); };
    const overlayItemForTarget = target => {
        const context = target?.dataset?.itemContext;
        const npc = context?.startsWith('intel:') ? session().intel?.npcs?.[Number(context.slice(6))] : null;
        const items = npc ? intelDropCache.get(intelNpcKey(npc,session().intel))?.items || npc.drops : null;
        return {item:items?.[Number(target?.dataset?.itemIndex)],npc};
    };
    function cancelTooltipDismissal() { if (itemTooltipHideTimer !== null) globalThis.clearTimeout(itemTooltipHideTimer); itemTooltipHideTimer = null; }
    function hideItemTooltip() { itemTooltipHover.cancel(); cancelTooltipDismissal(); activeItemTooltip = null; if ($('#intel-item-tooltip')) $('#intel-item-tooltip').hidden = true; }
    function scheduleTooltipDismissal() {
        itemTooltipHover.cancel();
        if (disposed) return;
        cancelTooltipDismissal();
        itemTooltipHideTimer = globalThis.setTimeout(() => {
            itemTooltipHideTimer = null;
            const tooltip = $('#intel-item-tooltip'), focused = document.activeElement;
            if (tooltip?.contains(focused) || focused?.matches?.('[data-item-hover]')) return;
            hideItemTooltip();
        },180);
    }
    function positionItemTooltip(target,point) {
        const tooltip = $('#intel-item-tooltip'); if (!tooltip || tooltip.hidden) return;
        const bounds = target.getBoundingClientRect(), viewport = document.documentElement;
        const x = Number.isFinite(point?.clientX) ? point.clientX : bounds.right, y = Number.isFinite(point?.clientY) ? point.clientY : bounds.bottom;
        const rect = tooltip.getBoundingClientRect(), width = viewport.clientWidth, height = viewport.clientHeight, gap = 12;
        tooltip.style.left = `${Math.max(8,Math.min(width - rect.width - 8,x + gap + rect.width <= width - 8 ? x + gap : x - rect.width - gap))}px`;
        tooltip.style.top = `${Math.max(8,Math.min(height - rect.height - 8,y + gap + rect.height <= height - 8 ? y + gap : y - rect.height - gap))}px`;
    }
    function showItemTooltip(target,event,preserveDismissal = false) {
        itemTooltipHover.cancel();
        const {item,npc} = overlayItemForTarget(target), tooltip = $('#intel-item-tooltip');
        if (!item || !npc || !tooltip) { hideItemTooltip(); return; }
        if (!preserveDismissal) cancelTooltipDismissal();
        const point = Number.isFinite(event?.clientX) ? {clientX:event.clientX,clientY:event.clientY} : null;
        const scroll = activeItemTooltip?.name === item.name && activeItemTooltip.npcId === String(npc.id || npc.name) && activeItemTooltip.raid === isRaidSource(npc) ? tooltip.scrollTop : 0;
        activeItemTooltip = {name:item.name,npcId:String(npc.id || npc.name),raid:isRaidSource(npc),point,kind:target.classList.contains('item-icon-button') ? 'icon' : 'name'};
        replace(tooltip,renderItemTooltip(item)); tooltip.hidden = false; tooltip.scrollTop = scroll; positionItemTooltip(target,point);
    }
    function refreshItemTooltip() {
        if (!activeItemTooltip) return;
        const active = activeItemTooltip;
        const targets = [...($('#intel-body')?.querySelectorAll('[data-item-hover]') || [])];
        const target = targets.find(target => {
            if ((target.classList.contains('item-icon-button') ? 'icon' : 'name') !== active.kind) return false;
            const {item,npc} = overlayItemForTarget(target);
            return item?.name === active.name && String(npc?.id || npc?.name) === active.npcId && isRaidSource(npc) === active.raid && !target.closest('[hidden]');
        });
        if (target) showItemTooltip(target,active.point,true); else hideItemTooltip();
    }
    function measureTimers() {
        if (disposed || panel !== 'timers') return;
        const height = Math.max(36,Math.ceil(10 + ['#timer-list','#swing-body','#session-restart','#overlay-status'].reduce((sum,selector) => sum + ($(selector)?.getBoundingClientRect().height || 0),0)));
        if (height !== measuredTimerHeight) {measuredTimerHeight = height; void Promise.resolve(bridge?.action?.('content-height',height)).catch(() => {});}
    }
    const currentIntelNpc = key => (session().intel?.npcs || []).find(npc => intelNpcKey(npc,session().intel) === key);
    const defeatedIntelNpc = npc => session().crawl?.enabled === true && npc?.defeated === true;
    async function loadIntelDrops(npc,key) {
        if (disposed || defeatedIntelNpc(npc) || state.sessionAvailable !== true || intelLoading.has(key) || !bridge?.action) return;
        const token = Symbol(key);
        intelLoading.set(key,token); intelErrors.delete(key); render();
        try {
            const result = await bridge.action('session:intel-drops',{npc:npc.name,zone:session().intel?.zone || session().zone,raidInstance:isRaidSource(npc)});
            if (disposed || intelLoading.get(key) !== token || !currentIntelNpc(key) || defeatedIntelNpc(currentIntelNpc(key))) return;
            if (!Array.isArray(result?.items)) throw new Error(result?.error || 'The remaining drops could not be loaded.');
            intelDropCache.set(key,{items:result.items,total:number(result.total ?? result.items.length)});
            intelDropRevision++;
            // Keep memory bounded across long sessions with many visited zones.
            while (intelDropCache.size > 80) intelDropCache.delete(intelDropCache.keys().next().value);
        } catch (error) {
            if (!disposed && currentIntelNpc(key) && !defeatedIntelNpc(currentIntelNpc(key))) intelErrors.set(key,String(error?.message || 'The remaining drops could not be loaded.'));
        } finally {
            if (intelLoading.get(key) === token) intelLoading.delete(key);
            if (!disposed && currentIntelNpc(key)) render();
        }
    }
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
    const resizeHandle=$('#overlay-resize-handle')||document.createElement('button'),dragGrip=$('#parse-drag-grip'),resizeHandles=[];
    resizeHandle.id='overlay-resize-handle';resizeHandle.className='overlay-resize-handle';
    for(const edge of ['n','ne','e','se','s','sw','w','nw']){
        const handle=edge==='se'?resizeHandle:document.createElement('button');handle.type='button';handle.classList.add('overlay-resize-edge');handle.dataset.resizeEdge=edge;handle.draggable=false;
        handle.tabIndex=edge==='se'?0:-1;handle.setAttribute('aria-label',edge==='se'?'Resize panel; drag or use arrow keys':`Resize ${edge} edge`);
        handle.title=edge==='se'?'Resize: drag this corner, or focus it and use arrow keys':'Drag to resize';
        // Keep hit regions outside all native draggable ancestors, including
        // the compact Triggers content and its title/gear strip.
        document.body.append(handle);resizeHandles.push(handle);
    }
    if(dragGrip){dragGrip.setAttribute('aria-label',`Drag ${PANELS[panel]} to move the unlocked window`);dragGrip.title=`Drag to move ${PANELS[panel]}`;}
    const moveController=mountOverlayDrag({document,bridge,panel,canMove:()=>!disposed&&!resizeDrag&&!resizeBusy&&!resizePending&&state.preferences?.visible===true&&!state.preferences?.locked&&!state.preferences?.passThrough,onError:report});
    function finishResize(){const id=resizeDrag?.id,handle=resizeDrag?.handle;resizeDrag=null;document.body.classList.remove('is-resizing');if(id!==undefined&&handle?.hasPointerCapture?.(id))handle.releasePointerCapture(id);}
    async function flushResize(){
        if(resizeBusy||disposed)return;resizeBusy=true;
        try{while(resizePending&&!disposed){const size=resizePending;resizePending=null;await bridge.action('resize',size);}}
        catch{resizePending=null;finishResize();if(!disposed)report('Resize unavailable. Show and unlock this panel, then retry.');}
        finally{resizeBusy=false;}
    }
    function requestResize(width,height,edge='se'){resizePending={width:Math.max(1,Math.min(4000,Math.round(width))),height:Math.max(1,Math.min(4000,Math.round(height))),edge};void flushResize();}
    function requestResizeDelta(deltaWidth,deltaHeight){resizePending={deltaWidth:Math.max(-4000,Math.min(4000,(resizePending?.deltaWidth||0)+deltaWidth)),deltaHeight:Math.max(-4000,Math.min(4000,(resizePending?.deltaHeight||0)+deltaHeight))};void flushResize();}
    function resizePointer(event){if(!resizeDrag||event.pointerId!==resizeDrag.id)return;const {edge}=resizeDrag,dx=event.screenX-resizeDrag.x,dy=event.screenY-resizeDrag.y;requestResize(resizeDrag.width+(edge.includes('e')?dx:edge.includes('w')?-dx:0),resizeDrag.height+(edge.includes('s')?dy:edge.includes('n')?-dy:0),edge);}
    for(const handle of resizeHandles){
        listen(handle,'dragstart',event=>event.preventDefault());
        listen(handle,'pointerdown',event=>{if(event.button!==0||moveController.isActive()||state.preferences?.locked||state.preferences?.passThrough||!state.preferences?.visible)return;event.preventDefault();resizeDrag={handle,edge:handle.dataset.resizeEdge,id:event.pointerId,x:event.screenX,y:event.screenY,width:document.documentElement.clientWidth,height:document.documentElement.clientHeight};handle.setPointerCapture(event.pointerId);document.body.style.setProperty('--resize-cursor',getComputedStyle(handle).cursor);document.body.classList.add('is-resizing');});
        listen(handle,'pointermove',resizePointer);listen(handle,'pointerup',event=>{resizePointer(event);finishResize();});listen(handle,'pointercancel',finishResize);
    }
    listen(resizeHandle,'keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||moveController.isActive()||state.preferences?.locked||state.preferences?.passThrough||!state.preferences?.visible)return;event.preventDefault();const step=event.shiftKey?20:5;requestResizeDelta(({ArrowLeft:-step,ArrowRight:step}[event.key]||0),({ArrowUp:-step,ArrowDown:step}[event.key]||0));});
    function renderTimers() {
        const timers = session().timers || {};
        const visible = (timers.timers || []).filter(timer => timer.visible !== false);
        const notifications = renderTimerNotifications(timers.notifications,now());
        replace($('#timer-list'), (!visible.length && (timers.swing?.enabled === true || notifications) ? '' : renderTimerRows(visible, now()))+notifications);
        replace($('#swing-body'), renderSwing(timers.swing, now()));
        measureTimers();
    }
    function render() {
        if (disposed) return;
        let intelDomChanged=false;
        if(state.sessionAvailable!==true||state.preferences?.visible===false)hideItemTooltip();
        const prefs = state.preferences || {};
        document.documentElement.style.setProperty('--panel-opacity', String(Math.min(1, Math.max(.15, number(prefs.backgroundOpacity) || .85))));
        applyAppearance(document,state.appearance,{panelScale:Number(prefs.fontScale) || 1});
        $('#overlay').classList.toggle('is-locked', Boolean(prefs.locked));
        for(const handle of resizeHandles){handle.disabled=Boolean(prefs.locked||prefs.passThrough||!prefs.visible);handle.hidden=handle.disabled;}
        if(prefs.locked||prefs.passThrough||!prefs.visible){resizePending=null;finishResize();moveController.cancel();}
        if (panel !== 'timers') {
            $('#layout-lock').checked = Boolean(prefs.locked); $('#ignore-mouse').checked = Boolean(prefs.passThrough);
            $('#panel-opacity').value = prefs.backgroundOpacity ?? .85; $('#panel-font').value = String(prefs.fontScale ?? 1);
        }
        const s = session(), notice = s.notice;
        if (notice?.id && notice.id !== lastNoticeId && (!notice.panel || notice.panel === panel)) { lastNoticeId = notice.id; noticeGeneration++; draftIntelTier = null; report(String(notice.message || 'Action unavailable.')); }
        $('#session-restart').hidden = !(Number(state.sessionRestartCount) > 0);
        if (panel === 'parse') {
            const parse = s.parse || {};
            const parseSessionChanged = lastParseSession !== null && parse.sessionNumber !== lastParseSession;
            if (parseSessionChanged) { scope = 'live'; expandedCombatants.clear(); }
            lastParseSession = parse.sessionNumber;
            const view = parseView(parse,scope,tab);
            const selector = $('#encounter-scope');
            const options = `<option value="live">${attr(parse.encounters?.find(encounter => encounter.active)?.name || 'Waiting for combat…')} · Live</option><option value="previous">Previous encounter</option><option value="session">Whole session</option>` + (parse.encounters || []).slice(0,50).map(encounter => `<option value="${attr(encounter.id)}">${escapeHtml(encounter.name || 'Encounter')} · ${new Date(number(encounter.startAt)).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</option>`).join('');
            replace(selector, options + (!['live','previous','session'].includes(scope) && !(parse.encounters || []).some(encounter => String(encounter.id) === scope) ? `<option value="${attr(scope)}">Encounter no longer retained</option>` : ''));
            selector.value = scope; selector.hidden = tab === 'session';
            $('#overlay-title').hidden = tab !== 'session';
            if (tab === 'session') $('#overlay-title').textContent = 'Whole session · all zones';
            $('#encounter-stats').hidden = tab === 'session' || !view.available;
            replace($('#encounter-stats'), `${view.ended ? '<span class="ended">ended</span>' : ''}<span>${durationLabel(view.duration * 1000)}</span><span class="header-total">${fmt(view.metrics.damage)} <small>dmg</small></span><span><strong>${fmt(view.metrics.dps)}</strong> <small>dps</small></span>`);
            const focusedCombatant = document.activeElement?.tagName === 'SUMMARY' ? document.activeElement.closest('[data-combatant-key]')?.dataset.combatantKey : null;
            for (const details of parseSessionChanged ? [] : $('#parse-body').querySelectorAll('[data-combatant-key]')) {
                if (details.open) expandedCombatants.add(details.dataset.combatantKey); else expandedCombatants.delete(details.dataset.combatantKey);
            }
            while (expandedCombatants.size > 1024) expandedCombatants.delete(expandedCombatants.values().next().value);
            replace($('#parse-body'), renderParseContent(view,expandedCombatants));
            if (focusedCombatant && !parseSessionChanged) [...$('#parse-body').querySelectorAll('[data-combatant-key]')].find(details => details.dataset.combatantKey === focusedCombatant)?.querySelector('summary')?.focus({preventScroll:true});
        } else if (panel === 'intel') {
            const intel = {...s.intel,crawlEnabled:s.crawl?.enabled === true};
            $('#overlay-title').textContent = s.zone || 'Zone & loot'; $('#class-filter').checked = Boolean(intel.myClassOnly);
            $('#intel-crawl-mode').checked = s.crawl?.enabled === true;
            for(const npc of intel.npcs || [])if(crawlDefeated(npc,intel)){
                const key=intelNpcKey(npc,intel);expandedIntel.delete(key);intelErrors.delete(key);
                if(intelActionKey===key)intelActionKey='';
            }
            if (state.sessionAvailable !== true || draftIntelTier === intelTierValue(intel.itemTier)) draftIntelTier = null;
            const tier = draftIntelTier ?? intelTierValue(intel.itemTier);
            $('#intel-item-tier').value = String(tier); $('#intel-item-tier-value').textContent = tier ? `Tier ${tier}` : 'Base';
            $('#intel-item-tier').setAttribute('aria-valuetext',tier ? `Tier ${tier}` : 'Base item stats');
            const focused = (intel.npcs || []).find(npc => !crawlDefeated(npc,intel) && intel.focusedNpcId && String(npc.id || npc.name) === String(intel.focusedNpcId));
            const key = focused ? intelNpcKey(focused,intel) : '';
            const focusEvent = JSON.stringify([intel.zone,intel.focusedNpcId,intel.focusSequence]);
            const focus = focused ? `${key}|${focusEvent}` : '';
            const freshFocus = Boolean(state.sessionAvailable === true && focused && focus !== lastIntelFocus);
            const newFocusEvent = freshFocus && focusEvent !== lastIntelFocusEvent;
            if (freshFocus) {
                lastIntelFocus = focus; expandedIntel.add(key);
                if (newFocusEvent) {
                    lastIntelFocusEvent = focusEvent;
                    collapsedIntelSections.delete(intelSectionKey(intel,isRaidSource(focused)));
                    if (!String(focused.name).toLocaleLowerCase().includes(intelQuery.trim().toLocaleLowerCase())) { intelQuery = ''; $('#intel-search').value = ''; }
                    $('#intel-attention').textContent = `${focused.name} · drops selected`;
                    const shell = $('#overlay'); shell.classList.remove('intel-focus-flash'); void shell.offsetWidth; shell.classList.add('intel-focus-flash');
                    shell.dataset.focusSequence = String(intel.focusSequence || '');
                }
            } else if (!focused) { lastIntelFocus = ''; }
            // Timer, parse and position heartbeats share this snapshot. Keep
            // the scrolling Intel DOM intact unless its displayed content
            // changes; distance-only updates need no row geometry or markup.
            const contentKey=JSON.stringify([{...intel,npcs:(intel.npcs||[]).map(({distance,...npc})=>npc)},intelQuery,[...expandedIntel],[...intelLoading.keys()],intelDropRevision,[...intelErrors],intelActionKey,[...collapsedIntelSections]]);
            intelDomChanged=contentKey!==lastIntelContent;
            if(intelDomChanged){
            lastIntelContent=contentKey;itemTooltipHover.cancel();
            const list=$('#intel-body'),listTop=list.getBoundingClientRect().top,previousScroll=list.scrollTop;
            const anchor=[...list.querySelectorAll('[data-intel-key]')].find(row=>row.getBoundingClientRect().bottom>listTop+2),anchorKey=anchor?.dataset.intelKey,anchorOffset=anchor?anchor.getBoundingClientRect().top-listTop:0;
            const active=document.hasFocus()?document.activeElement:null,activeRow=active&&list.contains(active)?active.closest('[data-intel-key]'):null;
            const activeAction=active?.dataset?.npcAction,activeItem=active?.dataset?.itemName,activeTag=active?.tagName,activeWasName=active?.classList?.contains('npc-name'),activeWasExpand=active?.hasAttribute?.('data-intel-expand'),activeWasRetry=active?.hasAttribute?.('data-intel-retry');
            replace(list, renderIntel(intel,{query:intelQuery,expanded:expandedIntel,loading:intelLoading,dropCache:intelDropCache,errors:intelErrors,actionKey:intelActionKey,collapsedSections:collapsedIntelSections}));
            intelDistances=[...list.querySelectorAll('[data-intel-distance-index]')];
            if(!newFocusEvent){
                const rows=[...list.querySelectorAll('[data-intel-key]')],newAnchor=rows.find(row=>row.dataset.intelKey===anchorKey);
                if(activeRow&&!active?.isConnected){const row=rows.find(row=>row.dataset.intelKey===activeRow.dataset.intelKey),target=activeAction?[...row?.querySelectorAll('[data-npc-action]')||[]].find(button=>button.dataset.npcAction===activeAction):activeWasName?row?.querySelector('.npc-name'):activeWasExpand?row?.querySelector('[data-intel-expand]'):activeWasRetry?row?.querySelector('[data-intel-retry]'):activeItem?[...row?.querySelectorAll('[data-item-hover]')||[]].find(item=>item.dataset.itemName===activeItem&&item.tagName===activeTag):null;target?.focus({preventScroll:true});}
                list.scrollTop=newAnchor?list.scrollTop+newAnchor.getBoundingClientRect().top-listTop-anchorOffset:previousScroll;
            }
            refreshItemTooltip();
            }
            intelDistances.forEach(distance=>{
                const npc=intel.npcs?.[Number(distance.dataset.intelDistanceIndex)];if(!npc)return;
                const text=Number.isFinite(npc.distance)?` · ${fmt(npc.distance)}u`:'';
                if(distance.textContent!==text)distance.textContent=text;
            });
            if (freshFocus) {
                if (newFocusEvent) [...document.querySelectorAll('[data-intel-key]')].find(element => element.dataset.intelKey === key)?.scrollIntoView({block:'start',behavior:'instant'});
                if (!intelDropCache.has(key) && (focused.drops?.length || 0) < number(focused.dropCount)) void loadIntelDrops(focused,key);
            }
        }
        else if (panel === 'map') { $('#overlay-title').textContent = s.zone || 'Map'; mapController?.setVisible?.(state.preferences?.visible !== false); mapController?.render(s); }
        else renderTimers();
        if(panel!=='intel'||intelDomChanged||lastSessionAvailability!==state.sessionAvailable)document.querySelectorAll('#panel-content button, #panel-content input, #panel-content select').forEach(element => {
            if (state.sessionAvailable !== true) { if (!element.disabled) element.dataset.sessionDisabled = 'true'; element.disabled = true; }
            else if (element.dataset.sessionDisabled) { element.disabled = false; delete element.dataset.sessionDisabled; }
        });
        lastSessionAvailability=state.sessionAvailable;
        $('#overlay-status').textContent = state.sessionAvailable !== true ? 'Session paused · open main app.' : status;
        measureTimers();
    }
    listen($('#panel-menu-button'),'click',event => { const menu = event.currentTarget.closest('.hover-menu'); menu.classList.remove('is-dismissed'); const open = menu.classList.toggle('is-open'); event.currentTarget.setAttribute('aria-expanded',String(open)); });
    listen($('.hover-menu'),'mouseleave',event => event.currentTarget.classList.remove('is-dismissed'));
    listen(document,'keydown',event => { if (event.key === 'Escape' && $('#panel-menu-button')) { const active = document.activeElement; $('.hover-menu').classList.remove('is-open'); $('.hover-menu').classList.add('is-dismissed'); $('#panel-menu-button').setAttribute('aria-expanded','false'); if ($('#panel-menu')?.contains(active)) active?.blur(); } });
    listen($('#layout-lock'),'change',event => { void action('lock',event.target.checked); });
    listen($('#ignore-mouse'),'change',event => { void action('pass-through',event.target.checked); });
    listen($('#panel-opacity'),'change',event => { void action('opacity',Number(event.target.value)); });
    listen($('#panel-font'),'change',event => { void action('font-scale',Number(event.target.value)); });
    listen($('#encounter-scope'),'change',event => { scope = event.target.value; render(); });
    listen($('#class-filter'),'change',event => { void action('session:class-filter',{panel,enabled:event.target.checked}); });
    listen($('#intel-crawl-mode'),'change',event => { void action('session:crawl-mode',{enabled:event.target.checked}); });
    listen($('#intel-item-tier'),'input',event => { draftIntelTier = intelTierValue(event.target.value); $('#intel-item-tier-value').textContent = draftIntelTier ? `Tier ${draftIntelTier}` : 'Base'; event.target.setAttribute('aria-valuetext',draftIntelTier ? `Tier ${draftIntelTier}` : 'Base item stats'); });
    listen($('#intel-item-tier'),'change',event => { draftIntelTier = intelTierValue(event.target.value); void action('session:item-tier',{tier:draftIntelTier}); });
    listen($('#intel-search'),'input',event => { intelQuery = event.target.value; render(); });
    // Only entering the mob name opens pointer actions. Keep the group open
    // while crossing its metadata or buttons; keyboard focus works separately.
    listen($('#intel-body'),'pointerover',event => {
        const name = event.target.closest?.('.npc-name'); if (!name || name.closest('.is-defeated')) return;
        const summary = name.closest('.npc-summary');
        intelActionKey = summary.closest('[data-intel-key]').dataset.intelKey;
        $('#intel-body').querySelectorAll('.npc-summary.is-actions-open').forEach(row => row.classList.remove('is-actions-open'));
        summary.classList.add('is-actions-open');
    });
    listen($('#intel-body'),'pointerout',event => {
        const summary = event.target.closest?.('.npc-summary');
        if (!summary || summary.contains(event.relatedTarget)) return;
        const key = summary.closest('[data-intel-key]').dataset.intelKey;
        if (key === intelActionKey) intelActionKey = '';
        summary.classList.remove('is-actions-open');
    });
    // Focusing a button can reveal its previously hidden strip after Chromium
    // has chosen a native focus scroll. Settle layout, then reveal its full
    // bounds within this horizontal scroller without moving the mob list.
    function revealIntelAction(button) {
        const strip = button?.closest('.row-actions');
        if (!strip) return;
        for (let pass = 0; pass < 2; pass++) {
            const viewport = strip.getBoundingClientRect(), bounds = button.getBoundingClientRect();
            const left = viewport.left + strip.clientLeft + 2, right = viewport.left + strip.clientLeft + strip.clientWidth - 2;
            const delta = bounds.right > right ? Math.ceil(bounds.right - right) : bounds.left < left ? Math.floor(bounds.left - left) : 0;
            if (!delta) break;
            strip.scrollLeft = Math.max(0,Math.min(strip.scrollWidth - strip.clientWidth,strip.scrollLeft + delta));
        }
    }
    listen($('#intel-body'),'focusin',event => {
        const button = event.target.closest?.('[data-npc-action]'); if (!button) return;
        revealIntelAction(button);
        // Keep the measured correction after the browser completes its own
        // focusing steps as well as during the synchronous focus event.
        queueMicrotask(() => { if (!disposed && document.activeElement === button) revealIntelAction(button); });
    });
    listen($('#intel-body'),'pointerover',event => { const target = event.target.closest?.('[data-item-hover]'); if (target && !target.contains(event.relatedTarget)) { hideItemTooltip(); itemTooltipHover.queue(target,event); } });
    listen($('#intel-body'),'pointermove',event => { const target = event.target.closest?.('[data-item-hover]'); if (target && activeItemTooltip) { activeItemTooltip.point = {clientX:event.clientX,clientY:event.clientY}; positionItemTooltip(target,event); } else if(target)itemTooltipHover.queue(target,event); });
    listen($('#intel-body'),'pointerout',event => { const target = event.target.closest?.('[data-item-hover]'); if (target && !target.contains(event.relatedTarget) && !$('#intel-item-tooltip')?.contains(event.relatedTarget)) scheduleTooltipDismissal(); });
    listen($('#intel-body'),'focusin',event => { const target = event.target.closest?.('[data-item-hover]'); if (target) showItemTooltip(target); });
    listen($('#intel-body'),'focusout',event => { if (event.target.closest?.('[data-item-hover]') && !$('#intel-item-tooltip')?.contains(event.relatedTarget)) scheduleTooltipDismissal(); });
    listen($('#intel-body'),'scroll',hideItemTooltip);
    listen(document.defaultView,'blur',hideItemTooltip);
    listen(document.defaultView,'pagehide',hideItemTooltip);
    listen($('#intel-item-tooltip'),'pointerover',cancelTooltipDismissal);
    listen($('#intel-item-tooltip'),'pointerout',event => { if (!event.currentTarget.contains(event.relatedTarget)) scheduleTooltipDismissal(); });
    listen($('#intel-item-tooltip'),'focusin',cancelTooltipDismissal);
    listen($('#intel-item-tooltip'),'focusout',event => { if (!event.currentTarget.contains(event.relatedTarget)) scheduleTooltipDismissal(); });
    listen(document,'keydown',event => {
        if (event.key === 'Escape') hideItemTooltip();
        else if (activeItemTooltip && event.target.closest?.('[data-item-hover]') && ['ArrowDown','ArrowUp','PageDown','PageUp'].includes(event.key)) {
            const tooltip = $('#intel-item-tooltip'); if (!tooltip || tooltip.hidden) return;
            event.preventDefault(); tooltip.scrollTop += (event.key.startsWith('Page') ? tooltip.clientHeight * .8 : 36) * (event.key.endsWith('Up') ? -1 : 1);
        }
    });
    listen(document,'click',event => {
        const button = event.target.closest?.('button'); if (!button || button.disabled) return;
        if (button.dataset.command) void action(button.dataset.command);
        if (button.dataset.openView) void action(state.sessionAvailable === true ? 'session:open' : 'show-main',state.sessionAvailable === true ? {view:button.dataset.openView} : undefined);
        if (button.dataset.tab) { tab = TABS.includes(button.dataset.tab) ? button.dataset.tab : 'damage'; document.querySelectorAll('[data-tab]').forEach(element => { const active = element.dataset.tab === tab; element.classList.toggle('is-active',active); element.setAttribute('aria-pressed',String(active)); }); render(); }
        if (button.hasAttribute('data-new-session')) void action('session:new-session',{});
        const s = session();
        if (button.dataset.intelSectionToggle) {
            const sectionKey = intelSectionKey(s.intel,button.dataset.intelSectionToggle === 'raid');
            if (collapsedIntelSections.has(sectionKey)) collapsedIntelSections.delete(sectionKey); else collapsedIntelSections.add(sectionKey);
            while (collapsedIntelSections.size > 80) collapsedIntelSections.delete(collapsedIntelSections.values().next().value);
            hideItemTooltip(); render();
            [...$('#intel-body').querySelectorAll('[data-intel-section-toggle]')].find(target => target.dataset.intelSectionToggle === button.dataset.intelSectionToggle)?.focus({preventScroll:true});
        }
        if (button.dataset.npcAction) {
            const npc = s.intel?.npcs?.[Number(button.dataset.npcIndex)]; if (!npc || defeatedIntelNpc(npc)) return;
            const command = intelMobAction(button.dataset.npcAction,npc,s.intel?.zone || s.zone);
            void action(command.action,command.payload);
        }
        if (button.dataset.intelExpand || button.dataset.intelRetry) {
            const key = button.dataset.intelExpand || button.dataset.intelRetry;
            const npc = currentIntelNpc(key); if (!npc || defeatedIntelNpc(npc)) return;
            if (expandedIntel.has(key) && !button.dataset.intelRetry) expandedIntel.delete(key);
            else {
                expandedIntel.add(key);
                const total = number(npc.dropCount ?? npc.drops?.length);
                if (!intelDropCache.has(key) && (npc.drops?.length || 0) < total) void loadIntelDrops(npc,key);
            }
            render();
        }
        if (button.dataset.itemIndex !== undefined) {
            const context = button.dataset.itemContext;
            const npc = context?.startsWith('intel:') ? s.intel?.npcs?.[Number(context.slice(6))] : null;
            const items = npc ? intelDropCache.get(intelNpcKey(npc,s.intel))?.items || npc.drops : null;
            const item = npc ? items?.[Number(button.dataset.itemIndex)] : null;
            if (item) void action('session:open',{view:'items',item:item.name});
        }
    });
    if (bridge?.onState) unsubscribe = bridge.onState(next => { if (!disposed) { stateGeneration++; state = next || {}; render(); } });
    const initial = stateGeneration;
    Promise.resolve(bridge?.getState?.()).then(next => { if (!disposed && initial === stateGeneration && next) { state = next; render(); } }).catch(() => report('Open main app.'));
    const tick = setInterval(() => { if (!document.hidden && panel === 'timers' && state.sessionAvailable === true) renderTimers(); },100);
    if (panel === 'map') {
        void import('./map-overlay.js').then(({mountMapOverlay}) => {
            if (disposed) return;
            mapController = mountMapOverlay({root:$('#native-map-root'),bridge,getSession:session});
            mapController.setVisible?.(state.preferences?.visible !== false);
            mapController.render(session());
        }).catch(() => report('Map overlay unavailable · open the main map.'));
    }
    render();
    return {render(next) {stateGeneration++; state = next || {}; render();},dispose() {disposed = true;itemTooltipHover.dispose();moveController.dispose();resizePending=null;finishResize();resizeHandles.forEach(handle=>handle.remove()); hideItemTooltip(); listeners.forEach(remove => remove()); unsubscribe?.(); mapController?.dispose(); clearInterval(tick);}};
}
if (globalThis.document?.querySelector('#overlay')) mountOverlay();
