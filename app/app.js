import { EQLogParser } from './parser.js';
import { conForLevel } from './con-colors.js';
import { scaledItemStats } from './item-scaling.js';

const CLASSES = ['WAR','CLR','PAL','RNG','SHD','DRU','MNK','BRD','ROG','SHM','NEC','WIZ','MAG','ENC','BST','BER'];
const ERAS = ['Classic','Kunark','Velious','Luclin','Planes of Power','Legacy of Ykesha','Lost Dungeons of Norrath','Gates of Discord','Omens of War'];

const parser = new EQLogParser();
let pack = { meta:{}, zones:[], npcs:[], items:[] };
let lootByNpcZone = new Map();
let lootByNpcName = new Map();
let bridgeInfo = null;
let logOffset = 0;
let partialLine = '';
let viewerReady = false;
let pollTimer = null;
let packRefreshTimer = null;

const prefs = {
    get key(){ return 'eql-companion-prefs-v1'; },
    load() {
        try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch { return {}; }
    },
    save(value) { localStorage.setItem(this.key, JSON.stringify(value)); }
};
let settings = Object.assign({
    manualLevel: 0,
    manualClasses: [],
    era: '',
    currentZoneOnly: true,
    itemTier: 0
}, prefs.load());

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function esc(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function wikiUrl(title) {
    return `https://eqlwiki.com/${encodeURIComponent(String(title || '').replace(/ /g,'_')).replace(/%2F/g,'/')}`;
}

function wikiSearchUrl(query) {
    return `https://eqlwiki.com/index.php?title=Special:Search&search=${encodeURIComponent(String(query || '').trim())}`;
}

function openExternal(url) {
    if (!url) return;
    window.open(String(url), '_blank', 'noopener');
}

function zoneRecord(name) {
    const n = String(name || '').toLowerCase().replace(/\s+\d+\s+\([^)]*\)\s*$/,'').trim();
    if (!n) return null;
    return pack.zones.find(z => [z.name,z.viewerName,z.wikiTitle,...(z.aliases||[])]
        .some(v => String(v||'').toLowerCase() === n)) ||
        pack.zones.find(z => String(z.name||'').toLowerCase().includes(n) || n.includes(String(z.name||'').toLowerCase()));
}

function zoneKey(name) {
    const record = zoneRecord(name);
    return String(record?.name || name || '')
        .toLowerCase()
        .replace(/\s+\d+\s+\([^)]*\)\s*$/,'')
        .replace(/^the\s+/,'')
        .replace(/\s+/g,' ')
        .trim();
}

function effectiveProfile(state) {
    const detectedLevel = Number(state.level) || 0;
    const detectedClasses = Array.isArray(state.classes) ? state.classes : [];
    return {
        level: Number(settings.manualLevel) || detectedLevel,
        classes: settings.manualClasses.length ? settings.manualClasses : detectedClasses
    };
}

function conClass(key) { return `con-${key || 'unknown'}`; }

function formatNum(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

async function api(path, options) {
    const response = await fetch(path, Object.assign({ cache:'no-store' }, options || {}));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const type = response.headers.get('content-type') || '';
    return type.includes('json') ? response.json() : response.text();
}

async function loadPack() {
    // Prefer a real locally-cached/exported production pack. The bundled
    // sample remains a safe offline fallback and never causes wiki API work.
    const candidates = [
        './data/companion-pack.json',
        './data/companion-pack.bootstrap.json',
        './data/companion-pack.sample.json'
    ];
    let lastError = null;

    for (const url of candidates) {
        try {
            const res = await fetch(url, { cache:'no-store' });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const nextPack = await res.json();
            if (!nextPack || !Array.isArray(nextPack.zones) || !Array.isArray(nextPack.npcs) || !Array.isArray(nextPack.items)) {
                throw new Error('invalid Eye of Zomm data pack');
            }
            pack = nextPack;
            break;
        } catch (error) {
            lastError = error;
        }
    }

    if (!pack.zones.length && !pack.npcs.length && !pack.items.length) {
        throw lastError || new Error('No Eye of Zomm data pack could be loaded.');
    }

    rebuildPackIndexes();
    if (!settings.era) settings.era = pack.meta.currentEra || 'Classic';
    $('#pack-version').textContent = pack.meta.version || 'unknown';
    $('#pack-mode').textContent = pack.meta.sample ? 'Sample' : 'Production';
    buildEraSelect();
    renderAll();
}

async function connectBridge() {
    try {
        bridgeInfo = await api('/api/info');
        parser.setCharacterFromFilename(bridgeInfo.logPath || '');
        $('#bridge-status').textContent = 'Live log';
        $('#bridge-status').className = 'status-pill status-ok';
        $('#settings-log-path').textContent = bridgeInfo.logPath || 'No log selected';
        $('#settings-server').textContent = bridgeInfo.server || location.host;
        const packState = bridgeInfo.dataPack || {};
        $('#pack-update-status').textContent = packState.lastStatus || (bridgeInfo.productionPack ? 'cached' : 'sample fallback');
        if (!logOffset) logOffset = 0;
        schedulePoll(50);
        schedulePackRefreshCheck();
    } catch (error) {
        $('#bridge-status').textContent = 'Bridge offline';
        $('#bridge-status').className = 'status-pill status-bad';
        schedulePoll(2000);
    }
}

function schedulePackRefreshCheck(delay = 15000) {
    clearTimeout(packRefreshTimer);
    packRefreshTimer = setTimeout(checkForDesktopPackRefresh, delay);
}

async function checkForDesktopPackRefresh() {
    try {
        const info = await api('/api/info');
        const stateVersion = String(info?.dataPack?.version || '');
        const activeManifestVersion = String(pack?.meta?.manifestVersion || '');
        if (info?.productionPack && stateVersion && stateVersion !== activeManifestVersion) {
            await loadPack();
            $('#pack-update-status').textContent = info?.dataPack?.lastStatus || 'updated';
        }
    } catch {}
    schedulePackRefreshCheck(30000);
}

function schedulePoll(delay = 700) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(pollLog, delay);
}

async function pollLog() {
    try {
        const data = await api(`/api/log?offset=${encodeURIComponent(logOffset)}`);
        if (data.logPath && (!bridgeInfo || data.logPath !== bridgeInfo.logPath)) {
            bridgeInfo = bridgeInfo || {};
            bridgeInfo.logPath = data.logPath;
            parser.setCharacterFromFilename(data.logPath);
            $('#settings-log-path').textContent = data.logPath;
        }
        if (data.reset) {
            logOffset = Number(data.startOffset) || 0;
            partialLine = '';
        }
        if (typeof data.text === 'string' && data.text.length) {
            let incoming = data.text;
            // The initial tail may begin in the middle of a UTF-8/log line.
            // Drop that one fragment rather than inventing a malformed event.
            if (data.reset && Number(data.startOffset) > 0) {
                const firstNewline = incoming.indexOf('\n');
                incoming = firstNewline >= 0 ? incoming.slice(firstNewline + 1) : '';
            }
            if (incoming) consumeText(incoming);
        }
        logOffset = Number(data.newOffset ?? logOffset);
        $('#bridge-status').textContent = 'Live log';
        $('#bridge-status').className = 'status-pill status-ok';
        renderAll();
        schedulePoll(700);
    } catch (error) {
        $('#bridge-status').textContent = 'Reconnecting';
        $('#bridge-status').className = 'status-pill status-warn';
        schedulePoll(1800);
    }
}

function consumeText(text) {
    const combined = partialLine + text;
    const lines = combined.split(/\n/);
    partialLine = lines.pop() || '';
    for (const line of lines) {
        const event = parser.parse(line);
        if (event?.type === 'zone') syncZoneToViewer(false);
        if (event?.type === 'location') syncLocationToViewer(false);
    }
}

function state() {
    return parser.snapshot();
}

function currentEraIndex() {
    const idx = ERAS.indexOf(settings.era);
    return idx < 0 ? ERAS.length - 1 : idx;
}

function eraAllowed(era) {
    if (!era) return true;
    if (String(era).toLowerCase() === 'unknown') return false;
    const idx = ERAS.indexOf(era);
    return idx < 0 || idx <= currentEraIndex();
}

function rebuildPackIndexes() {
    lootByNpcZone = new Map();
    lootByNpcName = new Map();
    for (const item of pack.items || []) {
        for (const source of item.dropSources || []) {
            const sourceName = String(source?.name || '').trim();
            if (!sourceName) continue;
            const nameKey = sourceName.toLowerCase();
            const zoneNameKey = `${zoneKey(source?.zone)}|${nameKey}`;
            if (!lootByNpcName.has(nameKey)) lootByNpcName.set(nameKey, []);
            lootByNpcName.get(nameKey).push(item);
            if (source?.zone) {
                if (!lootByNpcZone.has(zoneNameKey)) lootByNpcZone.set(zoneNameKey, []);
                lootByNpcZone.get(zoneNameKey).push(item);
            }
        }
    }
}

function knownDropsForNpc(npc) {
    const nameKey = String(npc?.name || '').toLowerCase();
    const exact = lootByNpcZone.get(`${zoneKey(npc?.zone)}|${nameKey}`) || [];
    const fallback = lootByNpcName.get(nameKey) || [];
    const seen = new Set();
    return [...exact, ...fallback].filter(item => {
        const key = String(item?.wikiTitle || item?.name || '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function allNpcsForState(s) {
    const observed = s.observed.map(o => ({
        name:o.name, zone:o.zone, avgLevel:o.level || 0, levelMin:o.level || 0, levelMax:o.level || 0,
        era:'Observed', wikiTitle:o.name, observed:true, damageDone:o.damageDone || 0
    }));
    const merged = new Map();
    for (const npc of [...pack.npcs, ...observed]) {
        const key = `${zoneKey(npc.zone)}|${String(npc.name).toLowerCase()}`;
        const old = merged.get(key);
        if (!old || npc.observed) merged.set(key, Object.assign({}, old || {}, npc));
    }
    return Array.from(merged.values());
}

function renderHeader(s, profile) {
    $('#top-character').textContent = s.character || '—';
    $('#top-zone').textContent = s.zone || 'Waiting for log';
    $('#top-level').textContent = profile.level || '—';
    $('#hero-zone').textContent = s.zone || 'Waiting for EverQuest log…';
    $('#hero-detail').textContent = s.zone
        ? `Detected from the local log. ${profile.classes.length ? profile.classes.join(' / ') : 'Set classes in Settings if /who has not exposed them yet.'}`
        : 'Zone changes are detected automatically from “You have entered …” lines.';

    const zr = zoneRecord(s.zone);
    const link = $('#zone-wiki-link');
    if (zr || s.zone) {
        link.href = wikiUrl(zr?.wikiTitle || s.zone);
        link.style.display = '';
    } else {
        link.removeAttribute('href');
        link.style.display = 'none';
    }
}

function renderMetrics(s, profile) {
    $('#metric-player').textContent = s.character ? `${s.character}${profile.level ? ` · ${profile.level}` : ''}` : '—';
    $('#metric-classes').textContent = profile.classes.length ? profile.classes.join(' / ') : 'Classes not detected';
    $('#metric-location').textContent = s.location ? `${s.location.x.toFixed(1)}, ${s.location.y.toFixed(1)}, ${s.location.z.toFixed(1)}` : '—';

    if (s.target) {
        $('#metric-target').textContent = s.target.name;
        const con = conForLevel(s.target.level, profile.level);
        $('#metric-con').innerHTML = s.target.level
            ? `<span class="${conClass(con.key)}">${esc(con.label)} · L${s.target.level}${con.delta === null ? '' : ` (${con.delta >= 0 ? '+' : ''}${con.delta})`}</span>`
            : 'Target level unknown';
    } else {
        $('#metric-target').textContent = '—';
        $('#metric-con').textContent = 'No consider level yet';
    }

    const fight = s.fight;
    $('#metric-fight').textContent = fight ? `${formatNum(fight.dps)} DPS` : '0 DPS';
    $('#metric-fight-detail').textContent = fight ? `${fight.victim} · ${formatNum(fight.damage)} damage${fight.active ? ' · active' : ''}` : 'No outgoing damage yet';
}

function renderOverviewNpcs(s, profile) {
    const host = $('#overview-npcs');
    let npcs = allNpcsForState(s).filter(n => !s.zone || zoneKey(n.zone) === zoneKey(s.zone));
    npcs = npcs.filter(n => eraAllowed(n.era) || n.observed);
    npcs.sort((a,b) => {
        const da = a.avgLevel ? Math.abs(a.avgLevel - profile.level) : 999;
        const db = b.avgLevel ? Math.abs(b.avgLevel - profile.level) : 999;
        return da - db || a.name.localeCompare(b.name);
    });
    npcs = npcs.slice(0,6);
    if (!npcs.length) {
        host.className = 'list-stack empty-state';
        host.textContent = 'No NPCs known for the current zone yet. Consider or fight something and it will appear here.';
        return;
    }
    host.className = 'list-stack';
    host.innerHTML = npcs.map(n => {
        const con = conForLevel(n.avgLevel, profile.level);
        return `<div class="list-row">
            <span class="con-dot ${conClass(con.key)}"></span>
            <div><strong>${esc(n.name)}</strong><small>${n.avgLevel ? `Level ${n.avgLevel}` : 'Level unknown'}${n.observed ? ' · observed' : ''}</small></div>
            <span class="${conClass(con.key)}">${esc(con.label)}</span>
        </div>`;
    }).join('');
}

function eventText(e) {
    if (e.type === 'zone') return `Entered ${e.zone}`;
    if (e.type === 'profile') return `${e.character || 'Character'} detected at level ${e.level} · ${(e.classes||[]).join('/')}`;
    if (e.type === 'location') return `Location ${e.location.x.toFixed(1)}, ${e.location.y.toFixed(1)}, ${e.location.z.toFixed(1)}`;
    if (e.type === 'consider') return `${e.target.name} considered at level ${e.target.level}`;
    if (e.type === 'damage') return `${e.source}: ${e.amount} → ${e.victim}`;
    if (e.type === 'heal') return `${e.source}: healed ${e.target}`;
    if (e.type === 'kill') return `Slain ${e.victim}`;
    if (e.type === 'target') return `Targeted ${e.target.name}`;
    if (e.type === 'rune') return `Rune absorbed ${e.amount}`;
    return e.type;
}

function renderEvents(s) {
    const events = s.recentEvents.slice(0,12);
    const html = events.map(e => `<div class="event-row"><span class="event-type">${esc(e.type)}</span><span>${esc(eventText(e))}</span><span class="event-value">${e.amount ? formatNum(e.amount) : ''}</span></div>`).join('');
    $('#recent-events').className = events.length ? 'event-feed' : 'event-feed empty-state';
    $('#recent-events').innerHTML = events.length ? html : 'Waiting for log activity.';
    $('#combat-events').innerHTML = s.recentEvents.slice(0,35).map(e => `<div class="combat-line"><span>${esc(e.type)}</span><span>${esc(eventText(e))}</span><span>${e.victim ? esc(e.victim) : ''}</span><span>${e.amount ? formatNum(e.amount) : ''}</span></div>`).join('') || '<div class="empty-state">No parsed combat events yet.</div>';
}

function renderCombat(s) {
    $('#combat-damage').textContent = formatNum(s.totalDamage);
    $('#combat-dps').textContent = formatNum(s.sessionDps);
    $('#combat-healing').textContent = formatNum(s.totalHealing);
    $('#combat-observed').textContent = s.observed.length.toLocaleString();
}

function renderNpcList(s, profile) {
    const query = $('#npc-search')?.value.trim().toLowerCase() || '';
    const currentOnly = $('#npc-current-zone')?.checked ?? true;
    let npcs = allNpcsForState(s).filter(n => (eraAllowed(n.era) || n.observed));
    if (currentOnly && s.zone) npcs = npcs.filter(n => zoneKey(n.zone) === zoneKey(s.zone));
    if (query) npcs = npcs.filter(n => `${n.name} ${n.zone}`.toLowerCase().includes(query));
    npcs.sort((a,b) => a.name.localeCompare(b.name));
    const total = npcs.length;
    const visible = npcs.slice(0, 300);

    $('#npc-list').innerHTML = visible.map(n => {
        const con = conForLevel(n.avgLevel, profile.level);
        const drops = knownDropsForNpc(n).filter(item => eraAllowed(item.era)).slice(0, 4);
        return `<article class="data-card">
            <div class="card-top">
                <div><h3>${esc(n.name)}</h3><div class="sub">${esc(n.zone || 'Unknown zone')}</div></div>
                <span class="pill ${conClass(con.key)}">${esc(con.label)}</span>
            </div>
            <div class="pill-row" style="margin-top:9px">
                <span class="pill">${n.avgLevel ? `Level ${n.avgLevel}` : 'Level unknown'}</span>
                ${n.era && n.era !== 'Observed' ? `<span class="pill">${esc(n.era)}</span>` : ''}
                ${n.observed ? '<span class="pill">Observed locally</span>' : ''}
            </div>
            ${drops.length ? `<div class="known-drops"><span class="filter-label">Known drops</span>${drops.map(item => `<a href="${wikiUrl(item.wikiTitle || item.name)}" target="_blank" rel="noopener">${esc(item.name)}</a>`).join('')}</div>` : ''}
            ${n.damageDone ? `<div class="sub" style="margin-top:9px">${formatNum(n.damageDone)} damage observed this session</div>` : ''}
            <div class="card-actions">
                <a class="mini-button" href="${wikiUrl(n.wikiTitle || n.name)}" target="_blank" rel="noopener">Open on Wiki</a>
                <button class="mini-button path-npc" data-npc="${esc(n.name)}">Path in map</button>
            </div>
        </article>`;
    }).join('') || '<div class="empty-state">No NPCs match the current filters.</div>';

    if (total > visible.length) {
        $('#npc-list').insertAdjacentHTML('beforeend', `<div class="result-limit">Showing the first ${visible.length.toLocaleString()} of ${total.toLocaleString()} matches. Narrow the search to see more.</div>`);
    }

    $$('.path-npc').forEach(btn => {
        if (!btn.dataset.eqlBound) {
            btn.dataset.eqlBound = '1';
            btn.addEventListener('click', () => pathToNpc(btn.dataset.npc));
        }
    });
}

function renderItems(s, profile) {
    const query = $('#item-search')?.value.trim().toLowerCase() || '';
    const tier = Number(settings.itemTier) || 0;
    let items = pack.items.filter(item => eraAllowed(item.era));
    if (query) items = items.filter(i => `${i.name} ${(i.classes||[]).join(' ')} ${(i.slots||[]).join(' ')} ${(i.dropSources||[]).map(d => `${d.name} ${d.zone||''}`).join(' ')}`.toLowerCase().includes(query));
    if (profile.classes.length) {
        items = items.filter(item => {
            const classes = (item.classes || []).map(c => String(c).toUpperCase());
            return classes.includes('ALL') || profile.classes.some(c => classes.includes(c));
        });
    }
    items.sort((a,b) => String(a.name || '').localeCompare(String(b.name || '')));
    const total = items.length;
    const visible = items.slice(0, 250);
    $('#item-list').innerHTML = visible.map(item => {
        const stats = scaledItemStats(item, tier);
        const statHtml = Object.entries(stats).map(([key,val]) => `<div class="stat"><span>${esc(key.replace(/_/g,' '))}</span><strong>${formatNum(val)}</strong></div>`).join('');
        return `<article class="data-card">
            <div class="card-top">
                <div><h3>${esc(item.name)}</h3><div class="sub">${esc((item.slots||[]).join(' · ') || 'Unknown slot')}</div></div>
                <span class="pill">${esc(item.era || '')}</span>
            </div>
            <div class="pill-row" style="margin-top:9px">${(item.classes||[]).map(c => `<span class="pill">${esc(c)}</span>`).join('')}</div>
            <div class="stats">${statHtml}</div>
            ${(item.dropSources||[]).length ? `<div class="item-sources"><span class="filter-label">Sources</span>${item.dropSources.slice(0,6).map(source => {
                const canPath = Boolean(s.zone && source.zone && zoneKey(source.zone) === zoneKey(s.zone));
                return `<div class="source-row"><span>${source.zone ? `${esc(source.zone)} · ` : ''}${esc(source.name)}</span><span class="source-actions"><a class="text-button" href="${wikiUrl(source.name)}" target="_blank" rel="noopener">Wiki</a>${canPath ? `<button class="text-button path-npc" data-npc="${esc(source.name)}">Path</button>` : ''}</span></div>`;
            }).join('')}</div>` : ''}
            ${item.notes ? `<div class="sub" style="margin-top:9px">${esc(item.notes)}</div>` : ''}
            <div class="card-actions"><a class="mini-button" href="${wikiUrl(item.wikiTitle || item.name)}" target="_blank" rel="noopener">Item wiki</a></div>
        </article>`;
    }).join('') || '<div class="empty-state">No items match the selected class/era filters in the current data pack.</div>';

    if (total > visible.length) {
        $('#item-list').insertAdjacentHTML('beforeend', `<div class="result-limit">Showing the first ${visible.length.toLocaleString()} of ${total.toLocaleString()} matches. Narrow the search to see more.</div>`);
    }

    $$('.path-npc').forEach(btn => {
        if (!btn.dataset.eqlBound) {
            btn.dataset.eqlBound = '1';
            btn.addEventListener('click', () => pathToNpc(btn.dataset.npc));
        }
    });
}

function buildClassChips() {
    for (const host of [$('#class-chips'), $('#settings-class-chips')]) {
        host.innerHTML = CLASSES.map(c => `<button class="chip ${settings.manualClasses.includes(c) ? 'is-active' : ''}" data-class="${c}">${c}</button>`).join('');
        host.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
            const c = btn.dataset.class;
            settings.manualClasses = settings.manualClasses.includes(c)
                ? settings.manualClasses.filter(x => x !== c)
                : [...settings.manualClasses, c];
            prefs.save(settings);
            buildClassChips();
            renderAll();
        }));
    }
}

function buildEraSelect() {
    const select = $('#era-select');
    select.innerHTML = ERAS.map(e => `<option ${e === settings.era ? 'selected' : ''}>${e}</option>`).join('');
}

function renderAll() {
    const s = state();
    const profile = effectiveProfile(s);
    renderHeader(s, profile);
    renderMetrics(s, profile);
    renderOverviewNpcs(s, profile);
    renderEvents(s);
    renderCombat(s);
    renderNpcList(s, profile);
    renderItems(s, profile);
    $('#map-title').textContent = s.zone ? `${s.zone} · Zone Viewer` : 'Zone Viewer';
    $('#map-subtitle').textContent = s.location
        ? `Latest logged location: ${s.location.x.toFixed(1)}, ${s.location.y.toFixed(1)}, ${s.location.z.toFixed(1)}`
        : 'Select your EverQuest folder in the viewer. Type /location in-game when you want an exact camera sync.';
    $('#manual-level').value = settings.manualLevel || '';
    $('#item-tier').value = settings.itemTier || 0;
    $('#item-tier-value').textContent = settings.itemTier || 0;
    if ($('#era-select').value !== settings.era) $('#era-select').value = settings.era;
}

function setView(view) {
    $$('.nav-button').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
    $$('[data-view-panel]').forEach(p => p.classList.toggle('is-active', p.dataset.viewPanel === view));
    if (view === 'map') setTimeout(() => syncZoneToViewer(false), 100);
}

function viewerApi() {
    const frame = $('#zone-viewer');
    return frame?.contentWindow?.eqlCompanionViewer || null;
}

async function syncZoneToViewer(showFeedback = true) {
    const s = state();
    const apiObj = viewerApi();
    if (!s.zone || !apiObj) return false;
    const result = await apiObj.loadZone(s.zone);
    if (showFeedback && result && !result.ok && result.reason === 'select-eq-folder-first') {
        alert('Select your EverQuest folder inside the Zone Viewer first. After that, zone changes can sync automatically.');
    }
    return Boolean(result?.ok);
}

function syncLocationToViewer(showFeedback = true) {
    const s = state();
    const apiObj = viewerApi();
    if (!s.location || !apiObj) {
        if (showFeedback) alert('No logged /location coordinate is available yet.');
        return false;
    }
    const result = apiObj.syncLocation(s.location);
    if (showFeedback && !result?.ok) alert('Load the current zone in the Zone Viewer first, then sync the logged location.');
    return Boolean(result?.ok);
}

async function pathToNpc(name) {
    setView('map');
    await syncZoneToViewer(false);
    setTimeout(async () => {
        const result = await viewerApi()?.pathTo(name);
        if (!result?.ok) alert(`The loaded local map does not currently have a path label matching “${name}”.`);
    }, 400);
}

function globalSearchMatches(query) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];

    const s = state();
    const currentZone = zoneKey(s.zone);
    const rows = [];
    const seen = new Set();

    function add(kind, name, wikiTitle, meta, bonus = 0) {
        const hay = `${name || ''} ${wikiTitle || ''} ${meta || ''}`.toLowerCase();
        if (!hay.includes(q)) return;
        const key = `${kind}|${String(wikiTitle || name).toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        const normalizedName = String(name || '').toLowerCase();
        let score = bonus;
        if (normalizedName === q) score += 100;
        else if (normalizedName.startsWith(q)) score += 55;
        else score += 20;
        score -= Math.min(18, Math.abs(normalizedName.length - q.length) * 0.15);
        rows.push({ kind, name, wikiTitle: wikiTitle || name, meta, score });
    }

    for (const z of pack.zones || []) {
        add('Zone', z.name, z.wikiTitle || z.name, (z.aliases || []).join(' '), zoneKey(z.name) === currentZone ? 20 : 0);
    }
    for (const n of pack.npcs || []) {
        add('NPC', n.name, n.wikiTitle || n.name, `${n.zone || ''} ${n.era || ''}`, zoneKey(n.zone) === currentZone ? 18 : 0);
    }
    for (const item of pack.items || []) {
        add('Item', item.name, item.wikiTitle || item.name, `${(item.classes || []).join(' ')} ${(item.slots || []).join(' ')} ${item.era || ''}`);
    }

    return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, 8);
}

function closeGlobalSearch() {
    const host = $('#wiki-search-results');
    if (!host) return;
    host.hidden = true;
    host.innerHTML = '';
}

function renderGlobalSearch(query) {
    const host = $('#wiki-search-results');
    if (!host) return;
    const clean = String(query || '').trim();
    if (clean.length < 2) {
        closeGlobalSearch();
        return;
    }

    const matches = globalSearchMatches(clean);
    host.innerHTML = [
        ...matches.map(row => `<button type="button" class="global-search-result" data-wiki-title="${esc(row.wikiTitle)}">
            <span class="global-search-kind">${esc(row.kind)}</span>
            <span class="global-search-name">${esc(row.name)}</span>
            <span class="global-search-meta">${esc(row.meta || '')}</span>
        </button>`),
        `<button type="button" class="global-search-result global-search-footer" data-wiki-search="${esc(clean)}">
            <span class="global-search-kind">Wiki</span>
            <span class="global-search-name">Search all of EQL Wiki for “${esc(clean)}”</span>
            <span class="global-search-meta">Open in browser ↗</span>
        </button>`
    ].join('');
    host.hidden = false;

    host.querySelectorAll('[data-wiki-title]').forEach(button => {
        button.addEventListener('click', () => {
            openExternal(wikiUrl(button.dataset.wikiTitle));
            closeGlobalSearch();
        });
    });
    host.querySelectorAll('[data-wiki-search]').forEach(button => {
        button.addEventListener('click', () => {
            openExternal(wikiSearchUrl(button.dataset.wikiSearch));
            closeGlobalSearch();
        });
    });
}

function runWikiSearch() {
    const input = $('#wiki-search');
    const query = input?.value.trim() || '';
    if (!query) return;
    const exact = globalSearchMatches(query).find(row => row.name.toLowerCase() === query.toLowerCase());
    openExternal(exact ? wikiUrl(exact.wikiTitle) : wikiSearchUrl(query));
    closeGlobalSearch();
}

function wireUi() {
    $$('.nav-button').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
    $$('[data-go-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.goView)));
    $('#npc-search').addEventListener('input', renderAll);
    $('#npc-current-zone').addEventListener('change', renderAll);
    $('#item-search').addEventListener('input', renderAll);
    $('#item-tier').addEventListener('input', e => {
        settings.itemTier = Number(e.target.value) || 0;
        prefs.save(settings);
        renderAll();
    });
    $('#era-select').addEventListener('change', e => {
        settings.era = e.target.value;
        prefs.save(settings);
        renderAll();
    });
    $('#manual-level').addEventListener('change', e => {
        settings.manualLevel = Number(e.target.value) || 0;
        prefs.save(settings);
        renderAll();
    });
    $('#change-log').addEventListener('click', async () => {
        try {
            const info = await api('/api/select-log');
            bridgeInfo = info;
            logOffset = 0;
            partialLine = '';
            parser.character = '';
            parser.setCharacterFromFilename(info.logPath || '');
            $('#settings-log-path').textContent = info.logPath || 'No log selected';
            renderAll();
        } catch (error) {
            alert(`Unable to change log: ${error.message}`);
        }
    });
    $('#update-pack').addEventListener('click', async () => {
        const button = $('#update-pack');
        button.disabled = true;
        $('#pack-update-status').textContent = 'checking…';
        try {
            const result = await api('/api/update-pack?force=1');
            $('#pack-update-status').textContent = result.status || (result.ok ? 'current' : 'unavailable');
            if (result.productionPack) await loadPack();
            if (!result.ok && result.error) {
                alert(`Wiki dataset sync is not available yet: ${result.error}`);
            }
        } catch (error) {
            $('#pack-update-status').textContent = 'unavailable';
            alert(`Unable to sync wiki dataset: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    });
    const wikiSearch = $('#wiki-search');
    wikiSearch.addEventListener('input', e => renderGlobalSearch(e.target.value));
    wikiSearch.addEventListener('focus', e => renderGlobalSearch(e.target.value));
    wikiSearch.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); runWikiSearch(); }
        if (e.key === 'Escape') closeGlobalSearch();
    });
    $('#wiki-search-button').addEventListener('click', runWikiSearch);
    document.addEventListener('pointerdown', e => {
        if (!e.target.closest('.global-search')) closeGlobalSearch();
    });
    $('#sync-zone').addEventListener('click', () => syncZoneToViewer(true));
    $('#sync-location').addEventListener('click', () => syncLocationToViewer(true));
    window.addEventListener('message', event => {
        if (event.data?.type === 'eoz-viewer-ready') {
            viewerReady = true;
            syncZoneToViewer(false);
        }
    });
}

buildClassChips();
wireUi();
loadPack();
connectBridge();
renderAll();
