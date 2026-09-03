import { EQLogParser } from './parser.js';
import { conForLevel } from './con-colors.js';
import { scaledItemStats } from './item-scaling.js';

const CLASSES = ['WAR','CLR','PAL','RNG','SHD','DRU','MNK','BRD','ROG','SHM','NEC','WIZ','MAG','ENC','BST','BER'];
const ERAS = ['Classic','Kunark','Velious','Luclin','Planes of Power','Legacy of Ykesha','Lost Dungeons of Norrath','Gates of Discord','Omens of War'];

const parser = new EQLogParser();
let pack = { meta:{}, zones:[], npcs:[], items:[] };
let lootByNpcZone = new Map();
let lootByNpcName = new Map();
let itemByName = new Map();
let bridgeInfo = null;
let logOffset = 0;
let partialLine = '';
let viewerReady = false;
let pollTimer = null;
let packRefreshTimer = null;
let selectedEncounterId = '';
let fightExpiryTimer = null;
let viewerSyncChain = Promise.resolve();
let consideredTarget = null;
let considerTrayTimer = null;
const CONSIDER_TRAY_DURATION = 16000;

const prefs = {
    get key(){ return 'eql-eye-of-zomm-prefs-v1'; },
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
    itemTier: 0,
    encounterGapSeconds: 15,
    minimalMyClassOnly: true,
    minimalNamedOnly: true,
    considerMyClassOnly: true
}, prefs.load());
parser.setEncounterGapSeconds(settings.encounterGapSeconds);

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

function npcNameKey(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/['’‘`]/g, '')
        .replace(/[_\s]+/g, ' ')
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

function formatTime(value) {
    const date = new Date(Number(value) || Date.now());
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function itemRecord(name) {
    return itemByName.get(String(name || '').trim().toLowerCase()) || null;
}

function itemIconSource(item) {
    const id = String(item?.iconId || '');
    const source = id && pack.icons ? pack.icons[id] : '';
    return typeof source === 'string' && source.startsWith('data:image/') ? source : '';
}

function itemHoverAttrs(itemOrName) {
    const item = typeof itemOrName === 'string' ? itemRecord(itemOrName) : itemOrName;
    const name = item?.name || itemOrName || '';
    return `class="item-hover" data-item-title="${esc(name)}"`;
}

function itemMatchesProfile(item, profile) {
    if (!profile.classes.length) return true;
    const classes = (item.classes || []).map(c => String(c).toUpperCase());
    return !classes.length || classes.includes('ALL') || profile.classes.some(c => classes.includes(c));
}

function isNamedSource(name) {
    const clean = String(name || '').trim();
    if (!clean) return false;
    if (/^(?:a|an|some)\s+/i.test(clean)) return false;
    // Lowercase "the ..." names are generic descriptions, while canonical
    // named NPCs such as "The Spiroc Lord" retain their title casing.
    if (/^the\s+[a-z]/.test(clean)) return false;
    return true;
}

async function api(path, options) {
    const nextOptions = Object.assign({ cache:'no-store' }, options || {});
    nextOptions.headers = Object.assign({ 'X-Eye-Of-Zomm-Request':'1' }, nextOptions.headers || {});
    const response = await fetch(path, nextOptions);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const type = response.headers.get('content-type') || '';
    return type.includes('json') ? response.json() : response.text();
}

function mutate(path) {
    return api(path, { method:'POST' });
}

async function loadPack() {
    // Prefer a real locally-cached/exported production pack. The bundled
    // sample remains a safe offline fallback and never causes wiki API work.
    const candidates = [
        './data/eye-of-zomm-pack.json',
        './data/eye-of-zomm-pack.bootstrap.json',
        './data/eye-of-zomm-pack.sample.json'
    ];
    let lastError = null;

    for (const url of candidates) {
        try {
            const res = await fetch(url, { cache:'no-store' });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            const nextPack = await res.json();
            if (!nextPack || Number(nextPack.meta?.schemaVersion) < 3 || !Array.isArray(nextPack.zones) || !Array.isArray(nextPack.npcs) || !Array.isArray(nextPack.items)) {
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
        $('#bridge-status').textContent = bridgeInfo.logExists ? 'Live log' : 'Waiting for log';
        $('#bridge-status').className = bridgeInfo.logExists ? 'status-pill status-ok' : 'status-pill status-warn';
        $('#settings-eq-root').textContent = bridgeInfo.eqRootPath || 'No folder selected';
        $('#settings-log-path').textContent = bridgeInfo.logPath || 'No log selected';
        $('#settings-log-mode').textContent = bridgeInfo.logSelection === 'manual' ? 'Specific file' : 'Newest log automatically';
        $('#automatic-log').hidden = bridgeInfo.logSelection !== 'manual';
        $('#setup-overlay').hidden = Boolean(bridgeInfo.eqRootExists);
        const packState = bridgeInfo.dataPack || {};
        $('#pack-update-status').textContent = packState.lastStatus || (bridgeInfo.productionPack ? 'cached' : 'sample fallback');
        applyWindowState(bridgeInfo.windowState || {});
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
        let changed = false;
        if (data.logPath && (!bridgeInfo || data.logPath !== bridgeInfo.logPath)) {
            bridgeInfo = bridgeInfo || {};
            bridgeInfo.logPath = data.logPath;
            parser.setCharacterFromFilename(data.logPath);
            $('#settings-log-path').textContent = data.logPath;
        }
        if (bridgeInfo) bridgeInfo.logExists = Boolean(data.logExists);
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
            if (incoming) consumeText(incoming, !data.reset);
            changed = Boolean(incoming);
        }
        logOffset = Number(data.newOffset ?? logOffset);
        $('#bridge-status').textContent = data.logExists ? 'Live log' : 'Waiting for log';
        $('#bridge-status').className = data.logExists ? 'status-pill status-ok' : 'status-pill status-warn';
        if (changed) renderAll();
        schedulePoll(700);
    } catch (error) {
        $('#bridge-status').textContent = 'Reconnecting';
        $('#bridge-status').className = 'status-pill status-warn';
        schedulePoll(1800);
    }
}

function consumeText(text, allowTransientUi = true) {
    const combined = partialLine + text;
    const lines = combined.split(/\n/);
    partialLine = lines.pop() || '';
    const viewerOperations = [];
    for (const line of lines) {
        const event = parser.parse(line);
        if (event?.type === 'zone') {
            viewerOperations.length = 0;
            viewerOperations.push({ type:'zone' });
        }
        if (event?.type === 'location') viewerOperations.push({ type:'location', location:{ ...event.location } });
        if (allowTransientUi && event?.type === 'consider') showConsiderTray(event.target);
    }
    for (const operation of viewerOperations) {
        if (operation.type === 'zone') queueViewerSync(() => syncZoneToViewer(false));
        else queueViewerSync(() => syncLocationToViewer(false, operation.location));
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
    itemByName = new Map();
    for (const item of pack.items || []) {
        for (const key of [item.name, item.wikiTitle]) {
            if (key) itemByName.set(String(key).trim().toLowerCase(), item);
        }
        for (const source of item.dropSources || []) {
            const sourceName = String(source?.name || '').trim();
            if (!sourceName) continue;
            const nameKey = npcNameKey(sourceName);
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
    const nameKey = npcNameKey(npc?.name);
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

function npcRecordForName(name, zone = state().zone) {
    const wanted = npcNameKey(name);
    if (!wanted) return null;
    return allNpcsForState(state()).find(npc =>
        npcNameKey(npc.name) === wanted &&
        (!zone || !npc.zone || zoneKey(npc.zone) === zoneKey(zone))
    ) || null;
}

function hideConsiderTray() {
    clearTimeout(considerTrayTimer);
    considerTrayTimer = null;
    consideredTarget = null;
    const tray = $('#consider-loot-tray');
    if (tray) tray.hidden = true;
}

function armConsiderTrayTimeout(delay = CONSIDER_TRAY_DURATION) {
    clearTimeout(considerTrayTimer);
    const tray = $('#consider-loot-tray');
    if (!consideredTarget || tray?.matches(':hover')) return;
    considerTrayTimer = setTimeout(hideConsiderTray, delay);
}

function renderConsiderTray() {
    const tray = $('#consider-loot-tray');
    if (!tray || !consideredTarget) return;
    const s = state();
    const profile = effectiveProfile(s);
    const npc = npcRecordForName(consideredTarget.name, consideredTarget.zone || s.zone) || {
        name:consideredTarget.name,
        zone:consideredTarget.zone || s.zone,
        avgLevel:Number(consideredTarget.level) || 0,
        wikiTitle:consideredTarget.name,
        observed:true
    };
    const allDrops = knownDropsForNpc(npc).filter(item => eraAllowed(item.era));
    const drops = settings.considerMyClassOnly
        ? allDrops.filter(item => itemMatchesProfile(item, profile))
        : allDrops;
    const con = conForLevel(Number(consideredTarget.level) || npc.avgLevel, profile.level);

    tray.className = `consider-loot-tray npc-con-${con.key}`;
    tray.hidden = false;
    $('#consider-tray-name').textContent = consideredTarget.name;
    $('#consider-tray-meta').textContent = `${consideredTarget.level ? `Level ${consideredTarget.level} · ` : ''}${con.label} · ${drops.length}${settings.considerMyClassOnly && allDrops.length !== drops.length ? ` of ${allDrops.length}` : ''} known drops`;
    $('#consider-my-class').checked = Boolean(settings.considerMyClassOnly);
    $('#consider-path').dataset.npc = consideredTarget.name;
    $('#consider-path').hidden = !s.zone;

    const host = $('#consider-tray-drops');
    host.innerHTML = drops.length ? drops.slice(0, 16).map(item => {
        const icon = itemIconSource(item);
        const slot = (item.slots || []).join(' · ') || 'Item';
        return `<a class="consider-drop-card item-hover" href="${wikiUrl(item.wikiTitle || item.name)}" target="_blank" rel="noopener" data-item-title="${esc(item.name)}">
            ${icon ? `<img src="${esc(icon)}" alt="">` : '<span class="consider-drop-icon">◇</span>'}
            <span><strong>${esc(item.name)}</strong><small>${esc(slot)}</small></span>
        </a>`;
    }).join('') : `<div class="consider-empty">${settings.considerMyClassOnly && allDrops.length ? 'No known drops match your class. Turn off My Class to see everything.' : 'No drops are known for this NPC in the current dataset.'}</div>`;
}

function showConsiderTray(target) {
    if (!target?.name) return;
    consideredTarget = { ...target, zone:state().zone };
    renderConsiderTray();
    armConsiderTrayTimeout();
}

function allNpcsForState(s) {
    const observed = s.observed.map(o => ({
        name:o.name, zone:o.zone, avgLevel:o.level || 0, levelMin:o.level || 0, levelMax:o.level || 0,
        era:'Observed', wikiTitle:o.name, observed:true, damageDone:o.damageDone || 0
    }));
    const merged = new Map();
    for (const npc of [...pack.npcs, ...observed]) {
        const key = `${zoneKey(npc.zone)}|${npcNameKey(npc.name)}`;
        const old = merged.get(key);
        if (!old || npc.observed) merged.set(key, Object.assign({}, old || {}, npc));
    }
    return Array.from(merged.values());
}

function renderMinimalZoneDrops(s, profile) {
    const host = $('#minimal-zone-drops');
    $('#minimal-zone-title').textContent = s.zone || 'Waiting for zone';
    if (!s.zone) {
        host.className = 'minimal-zone-drops empty-state';
        host.textContent = 'Waiting for a detected zone.';
        return;
    }

    const myClassOnly = Boolean(settings.minimalMyClassOnly);
    const namedOnly = Boolean(settings.minimalNamedOnly);
    $('#minimal-my-class').checked = myClassOnly;
    $('#minimal-named-only').checked = namedOnly;
    const bySource = new Map();
    const addSource = name => {
        name = String(name || '').trim();
        if (!name || (namedOnly && !isNamedSource(name))) return null;
        const key = name.toLowerCase();
        if (!bySource.has(key)) bySource.set(key, { name, items: [], npc:null });
        return bySource.get(key);
    };

    for (const npc of pack.npcs || []) {
        if (zoneKey(npc.zone) === zoneKey(s.zone) && (!namedOnly || isNamedSource(npc.name))) {
            const source = addSource(npc.name);
            if (source) source.npc = npc;
        }
    }
    for (const item of pack.items || []) {
        if (!eraAllowed(item.era) || (myClassOnly && !itemMatchesProfile(item, profile))) continue;
        for (const source of item.dropSources || []) {
            if (zoneKey(source.zone) !== zoneKey(s.zone)) continue;
            addSource(source.name)?.items.push(item);
        }
    }

    const sources = Array.from(bySource.values())
        .filter(source => source.items.length || namedOnly)
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 120);
    if (!sources.length) {
        host.className = 'minimal-zone-drops empty-state';
        host.textContent = myClassOnly && profile.classes.length
            ? 'No matching named drops are known for your class in this zone.'
            : 'No named or drop records are known for this zone.';
        return;
    }

    host.className = 'minimal-zone-drops';
    host.innerHTML = sources.map(source => {
        const con = conForLevel(source.npc?.avgLevel, profile.level);
        return `<div class="minimal-drop-row npc-con-${con.key}">
        <div class="minimal-mob-heading"><div><strong>${esc(source.name)}</strong>${source.npc?.avgLevel ? `<small class="${conClass(con.key)}">Level ${source.npc.avgLevel} · ${esc(con.label)}</small>` : ''}</div><button type="button" class="text-button path-npc" data-npc="${esc(source.name)}">Path</button></div>
        ${source.items.length ? source.items.slice(0, 12).map(item => `<a href="${wikiUrl(item.wikiTitle || item.name)}" target="_blank" rel="noopener" ${itemHoverAttrs(item)}>${esc(item.name)}</a>`).join('') : '<small>No known item drops in the current dataset.</small>'}
    </div>`;
    }).join('');
    bindPathButtons(host);
}

function renderHeader(s, profile) {
    $('#top-character').textContent = s.character || '—';
    $('#top-classes').textContent = profile.classes.length ? profile.classes.join('/') : '—';
    $('#top-level').textContent = profile.level || '—';
    $('#top-zone').textContent = s.zone || 'Waiting for log';
    $('#hero-zone').textContent = s.zone || 'Waiting for EverQuest log…';
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
    const fight = s.fight?.active ? s.fight : null;
    $('#metric-fight').textContent = fight ? `${formatNum(fight.dps)} DPS` : '0 DPS';
    $('#metric-fight-detail').textContent = fight ? `${fight.name} · ${formatNum(fight.damage)} damage${fight.active ? ' · active' : ''}` : 'No outgoing damage yet';
    $('#minimal-fight-dps').textContent = fight ? `${formatNum(fight.dps)} DPS` : '0 DPS';
    $('#minimal-fight-name').textContent = fight ? `${fight.name} · ${formatNum(fight.damage)} damage` : 'No active fight';
    clearTimeout(fightExpiryTimer);
    if (fight) {
        const remaining = (settings.encounterGapSeconds * 1000) - (Date.now() - Number(fight.lastAt || 0));
        fightExpiryTimer = setTimeout(renderAll, Math.max(100, remaining + 50));
    }
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
        return `<div class="list-row npc-con-${con.key}">
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
    if (e.type === 'rune') return `Rune absorbed ${e.amount}`;
    if (e.type === 'loot') return `${Number(e.quantity) > 1 ? `${e.quantity}× ` : ''}${e.item} · from ${e.source || 'Unknown'}`;
    return e.type;
}

function renderEvents(s) {
    const events = s.recentEvents.slice(0,12);
    const html = events.map(e => `<div class="event-row"><span class="event-type">${esc(e.type)}</span><span>${esc(eventText(e))}</span><span class="event-value">${e.amount ? formatNum(e.amount) : ''}</span></div>`).join('');
    $('#recent-events').className = events.length ? 'event-feed' : 'event-feed empty-state';
    $('#recent-events').innerHTML = events.length ? html : 'Waiting for log activity.';
}

function renderCombat(s) {
    $('#combat-damage').textContent = formatNum(s.totalDamage);
    $('#combat-dps').textContent = formatNum(s.sessionDps);
    $('#combat-healing').textContent = formatNum(s.totalHealing);
    $('#combat-observed').textContent = s.observed.length.toLocaleString();
}

function encounterLabel(encounter) {
    return `${encounter.name || 'Encounter'} · ${formatTime(encounter.startAt)}`;
}

function renderEncounters(s) {
    const encounters = s.encounters || [];
    if (!encounters.length) {
        selectedEncounterId = '';
        $('#combat-encounters').className = 'encounter-list empty-state';
        $('#combat-encounters').textContent = 'No encounters yet.';
        $('#encounter-detail-title').textContent = 'Select an encounter';
        $('#combat-events').innerHTML = '<div class="empty-state">No parsed combat events yet.</div>';
        return;
    }

    if (!encounters.some(encounter => encounter.id === selectedEncounterId)) {
        selectedEncounterId = encounters[0].id;
    }
    $('#combat-encounters').className = 'encounter-list';
    $('#combat-encounters').innerHTML = encounters.slice(0, 100).map(encounter => `
        <button type="button" class="encounter-row ${encounter.id === selectedEncounterId ? 'is-active' : ''}" data-encounter-id="${esc(encounter.id)}">
            <strong>${esc(encounterLabel(encounter))}</strong>
            <small><span>${encounter.active ? 'Active · ' : ''}${formatNum(encounter.damage)} damage · ${formatNum(encounter.dps)} DPS</span><span>${encounter.duration.toFixed(1)}s</span></small>
        </button>`).join('');
    $('#combat-encounters').querySelectorAll('[data-encounter-id]').forEach(button => {
        button.addEventListener('click', () => {
            selectedEncounterId = button.dataset.encounterId;
            renderEncounters(state());
        });
    });

    const selected = encounters.find(encounter => encounter.id === selectedEncounterId) || encounters[0];
    $('#encounter-detail-title').textContent = encounterLabel(selected);
    $('#combat-events').innerHTML = selected.events.slice().reverse().map(e => `
        <div class="combat-line"><span>${esc(e.type)}</span><span>${esc(eventText(e))}</span><span>${esc(e.victim || e.target || '')}</span><span>${e.amount ? formatNum(e.amount) : ''}</span></div>`
    ).join('') || '<div class="empty-state">No events recorded for this encounter.</div>';
}

function renderDropLog(s) {
    const entries = s.lootLog || [];
    const itemCount = entries.reduce((sum, entry) => sum + Math.max(1, Number(entry.quantity) || 1), 0);
    $('#drop-count').textContent = itemCount.toLocaleString();
    $('#drop-source-count').textContent = new Set(entries.map(entry => `${entry.zone}|${entry.source}`)).size.toLocaleString();
    $('#drop-current-zone').textContent = s.zone || '—';
    const host = $('#drop-log');
    if (!entries.length) {
        host.className = 'drop-table empty-state';
        host.textContent = 'No loot lines observed yet.';
        return;
    }
    host.className = 'drop-table';
    host.innerHTML = entries.slice(0, 500).map(entry => {
        const item = itemRecord(entry.item);
        const rate = entry.estimatedRate === null
            ? 'Collecting kill data'
            : `${entry.estimatedRate.toFixed(entry.estimatedRate < 10 ? 1 : 0)}% observed`;
        const evidence = entry.killsObserved
            ? `${entry.dropsObserved} drop${entry.dropsObserved === 1 ? '' : 's'} / ${entry.killsObserved} kill${entry.killsObserved === 1 ? '' : 's'}`
            : 'No matching kill count yet';
        return `<div class="drop-row">
            <div><strong ${itemHoverAttrs(item || entry.item)}>${Number(entry.quantity) > 1 ? `${entry.quantity}× ` : ''}${esc(entry.item)}</strong><small>${esc(entry.zone || 'Unknown zone')}</small></div>
            <div>${esc(entry.source || 'Unknown source')}</div>
            <div>${formatTime(entry.at)}</div>
            <div class="drop-rate">${rate}<small>${evidence}</small></div>
        </div>`;
    }).join('');
}

function tooltipHtml(item) {
    const tier = Number(settings.itemTier) || 0;
    const stats = scaledItemStats(item, tier);
    const statHtml = Object.entries(stats).slice(0, 18).map(([key, value]) =>
        `<div class="tooltip-stat"><span>${esc(key.replace(/_/g, ' '))}:</span><strong>${Number(value) > 0 ? '+' : ''}${formatNum(value)}</strong></div>`
    ).join('');
    const sources = (item.dropSources || []).slice(0, 8)
        .map(source => esc(`${source.zone ? `${source.zone} · ` : ''}${source.name}`))
        .join('<br>');
    const icon = itemIconSource(item);
    const displayLines = Array.isArray(item.displayLines) ? item.displayLines.slice(0, 12) : [];
    return `<div class="itembox-title">${esc(item.name)}</div>
        <div class="itembox-body">
            <div class="itembox-summary">${icon ? `<img class="itembox-icon" src="${esc(icon)}" alt="">` : '<span class="itembox-icon item-icon-placeholder">◇</span>'}<div>
                ${displayLines.length ? displayLines.map(line => `<div>${esc(line)}</div>`).join('') : `<div>${esc((item.slots || []).length ? `Slot: ${(item.slots || []).join(' ')}` : 'Slot: Unknown')}</div><div>Class: ${esc((item.classes || []).join(' ') || 'Unknown')}</div>`}
            </div></div>
            ${statHtml && !displayLines.length ? `<div class="tooltip-stats">${statHtml}</div>` : ''}
            ${sources ? `<div class="tooltip-source"><strong>Drops from</strong><br>${sources}</div>` : ''}
            ${item.notes ? `<div class="tooltip-source">${esc(item.notes)}</div>` : ''}
        </div>`;
}

function positionTooltip(event) {
    const tooltip = $('#item-tooltip');
    if (!tooltip || tooltip.hidden) return;
    const gap = 14;
    const rect = tooltip.getBoundingClientRect();
    let left = event.clientX + gap;
    let top = event.clientY + gap;
    if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - gap;
    if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - gap;
    tooltip.style.left = `${Math.max(8, left)}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
}

function showItemTooltip(target, event) {
    const item = itemRecord(target?.dataset?.itemTitle);
    const tooltip = $('#item-tooltip');
    if (!item || !tooltip) return;
    tooltip.innerHTML = tooltipHtml(item);
    tooltip.hidden = false;
    positionTooltip(event);
}

function hideItemTooltip() {
    const tooltip = $('#item-tooltip');
    if (tooltip) tooltip.hidden = true;
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
        return `<article class="data-card npc-card npc-con-${con.key}">
            <div class="card-top">
                <div><h3>${esc(n.name)}</h3><div class="sub">${esc(n.zone || 'Unknown zone')}</div></div>
                <span class="pill ${conClass(con.key)}">${esc(con.label)}</span>
            </div>
            <div class="pill-row" style="margin-top:9px">
                <span class="pill">${n.avgLevel ? `Level ${n.avgLevel}` : 'Level unknown'}</span>
                ${n.era && n.era !== 'Observed' ? `<span class="pill">${esc(n.era)}</span>` : ''}
                ${n.observed ? '<span class="pill">Observed locally</span>' : ''}
            </div>
            ${drops.length ? `<div class="known-drops"><span class="filter-label">Known drops</span>${drops.map(item => `<a href="${wikiUrl(item.wikiTitle || item.name)}" target="_blank" rel="noopener" ${itemHoverAttrs(item)}>${esc(item.name)}</a>`).join('')}</div>` : ''}
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

    bindPathButtons($('#npc-list'));
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
                <div><h3 ${itemHoverAttrs(item)}>${esc(item.name)}</h3><div class="sub">${esc((item.slots||[]).join(' · ') || 'Unknown slot')}</div></div>
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

    bindPathButtons($('#item-list'));
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

function renderViewPanel(view, s, profile) {
    if (view === 'overview') {
        renderOverviewNpcs(s, profile);
        renderEvents(s);
    } else if (view === 'npcs') {
        renderNpcList(s, profile);
    } else if (view === 'items') {
        renderItems(s, profile);
    } else if (view === 'drops') {
        renderDropLog(s);
    } else if (view === 'combat') {
        renderCombat(s);
        renderEncounters(s);
    } else if (view === 'map') {
        renderMinimalZoneDrops(s, profile);
    }
}

function renderAll() {
    const s = state();
    const profile = effectiveProfile(s);
    const activeView = $('.nav-button.is-active')?.dataset.view || 'overview';
    renderHeader(s, profile);
    renderMetrics(s, profile);
    renderViewPanel(activeView, s, profile);
    if (document.body.classList.contains('minimal-mode') && activeView !== 'map') {
        renderMinimalZoneDrops(s, profile);
    }
    if (consideredTarget && !$('#consider-loot-tray')?.hidden) renderConsiderTray();
    $('#map-title').textContent = s.zone ? `${s.zone} · Zone Viewer` : 'Zone Viewer';
    $('#map-subtitle').textContent = s.location
        ? `${s.location.x.toFixed(1)}, ${s.location.y.toFixed(1)}, ${s.location.z.toFixed(1)}`
        : (bridgeInfo?.eqRootPath ? 'Waiting for a logged /location.' : 'Choose your EverQuest folder in Settings.');
    $('#manual-level').value = settings.manualLevel || '';
    $('#item-tier').value = settings.itemTier || 0;
    $('#item-tier-value').textContent = settings.itemTier || 0;
    $('#encounter-gap').value = settings.encounterGapSeconds || 15;
    if ($('#era-select').value !== settings.era) $('#era-select').value = settings.era;
}

function setView(view) {
    $$('.nav-button').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
    $$('[data-view-panel]').forEach(p => p.classList.toggle('is-active', p.dataset.viewPanel === view));
    const s = state();
    renderViewPanel(view, s, effectiveProfile(s));
    if (view === 'map') setTimeout(() => syncZoneToViewer(false), 100);
}

function applyWindowState(windowState = {}) {
    const pinned = Boolean(windowState.alwaysOnTop);
    const minimal = Boolean(windowState.minimalMode);
    document.body.classList.toggle('minimal-mode', minimal);
    document.body.classList.toggle('pinned-mode', pinned);
    for (const button of [$('#pin-window'), $('#settings-pin-window')]) {
        if (!button) continue;
        button.classList.toggle('is-active', pinned);
        button.setAttribute('aria-pressed', String(pinned));
        button.textContent = pinned ? '◆ Pinned to top' : '◇ Pin to top';
    }
    for (const button of [$('#minimal-mode'), $('#settings-minimal-mode')]) {
        if (!button) continue;
        button.classList.toggle('is-active', minimal);
        button.setAttribute('aria-pressed', String(minimal));
        button.textContent = minimal ? 'Full view' : 'Minimal view';
    }
    if (minimal) setView('map');
    setTimeout(() => viewerApi()?.resize?.(), 80);
}

async function toggleAlwaysOnTop() {
    const current = Boolean(bridgeInfo?.windowState?.alwaysOnTop);
    const result = await mutate(`/api/window/always-on-top?enabled=${current ? '0' : '1'}`);
    bridgeInfo ||= {};
    bridgeInfo.windowState = { ...(bridgeInfo.windowState || {}), alwaysOnTop: Boolean(result.enabled) };
    applyWindowState(bridgeInfo.windowState);
}

async function toggleMinimalMode() {
    const current = Boolean(bridgeInfo?.windowState?.minimalMode);
    const result = await mutate(`/api/window/minimal?enabled=${current ? '0' : '1'}`);
    bridgeInfo ||= {};
    bridgeInfo.windowState = { ...(bridgeInfo.windowState || {}), minimalMode: Boolean(result.enabled) };
    applyWindowState(bridgeInfo.windowState);
    renderAll();
}

function viewerApi() {
    const frame = $('#zone-viewer');
    return frame?.contentWindow?.eqlEyeOfZommViewer || null;
}

function queueViewerSync(operation) {
    viewerSyncChain = viewerSyncChain.catch(() => false).then(operation);
    return viewerSyncChain;
}

async function waitForViewerApi(timeout = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const apiObj = viewerApi();
        if (apiObj) return apiObj;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
}

async function syncZoneToViewer(showFeedback = true) {
    const s = state();
    if (!s.zone) {
        if (showFeedback) alert('No current zone has been detected from the log yet.');
        return false;
    }
    const apiObj = await waitForViewerApi();
    if (!apiObj) {
        if (showFeedback) alert('The Zone Viewer did not finish loading. Reopen Live Map and try again.');
        return false;
    }
    $('#map-subtitle').textContent = `Loading ${s.zone} from your local EverQuest files…`;
    try {
        const record = zoneRecord(s.zone);
        const result = await apiObj.loadZone(record?.viewerName || record?.name || s.zone);
        if (!result?.ok) {
            const messages = {
                'select-eq-folder-first': 'Choose your EverQuest folder in Settings first.',
                'zone-not-found': `The Zone Viewer could not match ${s.zone} to a local zone archive.`,
                'load-failed': result.message || `The local files for ${s.zone} could not be loaded.`
            };
            const message = messages[result?.reason] || 'The current zone could not be synchronized.';
            $('#map-subtitle').textContent = message;
            if (showFeedback) alert(message);
            return false;
        }
        $('#map-subtitle').textContent = `${s.zone} loaded · ${result.status || 'ready for location sync'}`;
        return true;
    } catch (error) {
        $('#map-subtitle').textContent = `Zone sync failed: ${error.message}`;
        if (showFeedback) alert(`Zone sync failed: ${error.message}`);
        return false;
    }
}

async function syncLocationToViewer(showFeedback = true, requestedLocation = null) {
    const s = state();
    const location = requestedLocation || s.location;
    if (!location) {
        if (showFeedback) alert('No logged /location coordinate is available yet.');
        return false;
    }
    const apiObj = await waitForViewerApi();
    if (!apiObj) {
        if (showFeedback) alert('The Zone Viewer did not finish loading.');
        return false;
    }
    if (!apiObj.status()?.zone) {
        const loaded = await syncZoneToViewer(showFeedback);
        if (!loaded) return false;
    }
    const result = apiObj.syncLocation(location);
    if (!result?.ok) {
        const message = result?.message || 'The zone is not ready for location sync yet.';
        $('#map-subtitle').textContent = message;
        if (showFeedback) alert(message);
        return false;
    }
    setActiveMapMode('first');
    $('#map-subtitle').textContent = `Synced to ${location.x.toFixed(1)}, ${location.y.toFixed(1)}, ${location.z.toFixed(1)} in ${s.zone}.`;
    return true;
}

function setActiveMapMode(mode) {
    $$('[data-map-mode]').forEach(button => button.classList.toggle('is-active', button.dataset.mapMode === mode));
}

async function setMapMode(mode, showFeedback = true) {
    const apiObj = await waitForViewerApi();
    if (!apiObj) return false;
    const result = await apiObj.setView(mode);
    if (!result?.ok) {
        if (showFeedback) alert(result?.message || 'That map view is not available for this zone.');
        return false;
    }
    setActiveMapMode(result.mode || mode);
    return true;
}

function bindPathButtons(host = document) {
    host?.querySelectorAll?.('.path-npc').forEach(btn => {
        if (btn.dataset.eqlBound) return;
        btn.dataset.eqlBound = '1';
        btn.addEventListener('click', () => pathToNpc(btn.dataset.npc));
    });
}

async function pathToNpc(name) {
    setView('map');
    const loaded = await syncZoneToViewer(false);
    if (!loaded) return;
    const npc = npcRecordForName(name);
    setTimeout(async () => {
        const rawLocation = Array.isArray(npc?.loc) ? npc.loc.map(Number).filter(Number.isFinite) : null;
        const location = rawLocation && rawLocation.length >= 2
            ? rawLocation.slice(0, Number(pack.meta?.schemaVersion) >= 3 ? 3 : 2)
            : null;
        const result = await viewerApi()?.pathTo(name, location);
        if (!result?.ok) alert(`No baked-in map label or wiki location is available for “${name}”.`);
        else setActiveMapMode('first');
    }, 400);
}

function runWikiSearch() {
    const input = $('#wiki-search');
    const query = input?.value.trim() || '';
    if (!query) return;
    openExternal(wikiSearchUrl(query));
}

async function applyLogSelection(info) {
    bridgeInfo = info;
    logOffset = 0;
    partialLine = '';
    parser.character = '';
    parser.setCharacterFromFilename(info.logPath || '');
    $('#settings-eq-root').textContent = info.eqRootPath || 'No folder selected';
    $('#settings-log-path').textContent = info.logPath || 'No log selected';
    $('#settings-log-mode').textContent = info.logSelection === 'manual' ? 'Specific file' : 'Newest log automatically';
    $('#automatic-log').hidden = info.logSelection !== 'manual';
    $('#setup-overlay').hidden = Boolean(info.eqRootExists);
    const apiObj = await waitForViewerApi(2500);
    if (apiObj && info.eqRootExists) await apiObj.useConfiguredFolder?.();
    renderAll();
}

async function chooseEqFolder() {
    const info = await mutate('/api/select-eq-root');
    await applyLogSelection(info);
    if (info.eqRootExists) {
        queueViewerSync(async () => {
            await syncZoneToViewer(false);
            return syncLocationToViewer(false);
        });
    }
}

function wireUi() {
    $$('.nav-button').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
    $$('[data-go-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.goView)));
    $('#npc-search').addEventListener('input', () => { const s = state(); renderNpcList(s, effectiveProfile(s)); });
    $('#npc-current-zone').addEventListener('change', () => { const s = state(); renderNpcList(s, effectiveProfile(s)); });
    $('#item-search').addEventListener('input', () => { const s = state(); renderItems(s, effectiveProfile(s)); });
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
    $('#encounter-gap').addEventListener('change', e => {
        settings.encounterGapSeconds = Math.max(3, Math.min(300, Number(e.target.value) || 15));
        parser.setEncounterGapSeconds(settings.encounterGapSeconds);
        selectedEncounterId = '';
        prefs.save(settings);
        renderAll();
    });
    $('#change-log').addEventListener('click', async () => {
        try {
            await applyLogSelection(await mutate('/api/select-log'));
        } catch (error) {
            alert(`Unable to change log: ${error.message}`);
        }
    });
    $('#automatic-log').addEventListener('click', async () => {
        try {
            await applyLogSelection(await mutate('/api/log/automatic'));
        } catch (error) {
            alert(`Unable to select the newest log: ${error.message}`);
        }
    });
    $('#change-eq-folder').addEventListener('click', () => chooseEqFolder().catch(error => alert(`Unable to change folder: ${error.message}`)));
    $('#setup-choose-folder').addEventListener('click', () => chooseEqFolder().catch(error => alert(`Unable to choose folder: ${error.message}`)));
    $('#update-pack').addEventListener('click', async () => {
        const button = $('#update-pack');
        button.disabled = true;
        $('#pack-update-status').textContent = 'checking…';
        try {
            const result = await mutate('/api/update-pack?force=1');
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
    $('#wiki-search-form').addEventListener('submit', e => { e.preventDefault(); runWikiSearch(); });
    $('#wiki-search-button').addEventListener('click', runWikiSearch);
    $('#minimal-my-class').addEventListener('change', event => {
        settings.minimalMyClassOnly = Boolean(event.target.checked);
        prefs.save(settings);
        renderAll();
    });
    $('#minimal-named-only').addEventListener('change', event => {
        settings.minimalNamedOnly = Boolean(event.target.checked);
        prefs.save(settings);
        renderAll();
    });
    $('#consider-my-class').addEventListener('change', event => {
        settings.considerMyClassOnly = Boolean(event.target.checked);
        prefs.save(settings);
        renderConsiderTray();
        armConsiderTrayTimeout();
    });
    $('#consider-path').addEventListener('click', event => {
        const name = event.currentTarget.dataset.npc;
        if (name) pathToNpc(name);
    });
    $('#consider-close').addEventListener('click', hideConsiderTray);
    $('#consider-loot-tray').addEventListener('pointerenter', () => clearTimeout(considerTrayTimer));
    $('#consider-loot-tray').addEventListener('pointerleave', () => armConsiderTrayTimeout(8000));
    $('#consider-loot-tray').addEventListener('focusin', () => clearTimeout(considerTrayTimer));
    $('#consider-loot-tray').addEventListener('focusout', event => {
        if (!event.currentTarget.contains(event.relatedTarget)) armConsiderTrayTimeout(8000);
    });
    for (const button of [$('#pin-window'), $('#settings-pin-window')]) {
        button.addEventListener('click', () => toggleAlwaysOnTop().catch(error => alert(`Unable to change pinning: ${error.message}`)));
    }
    for (const button of [$('#minimal-mode'), $('#settings-minimal-mode')]) {
        button.addEventListener('click', () => toggleMinimalMode().catch(error => alert(`Unable to change the window view: ${error.message}`)));
    }
    document.addEventListener('pointerover', event => {
        const target = event.target.closest?.('[data-item-title]');
        if (target) showItemTooltip(target, event);
    });
    document.addEventListener('pointermove', positionTooltip);
    document.addEventListener('pointerout', event => {
        const target = event.target.closest?.('[data-item-title]');
        if (target && !target.contains(event.relatedTarget)) hideItemTooltip();
    });
    $$('[data-map-mode]').forEach(button => button.addEventListener('click', () => setMapMode(button.dataset.mapMode, true)));
    $('#sync-zone').addEventListener('click', () => syncZoneToViewer(true));
    $('#sync-location').addEventListener('click', () => syncLocationToViewer(true));
    $('#window-minimize').addEventListener('click', () => window.eyeOfZommWindow?.minimize());
    $('#window-maximize').addEventListener('click', () => window.eyeOfZommWindow?.toggleMaximize());
    $('#window-close').addEventListener('click', () => window.eyeOfZommWindow?.close());
    $('#desktop-titlebar').addEventListener('dblclick', event => {
        if (!event.target.closest('button')) window.eyeOfZommWindow?.toggleMaximize();
    });
    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'eoz-viewer-ready') {
            viewerReady = true;
            viewerApi()?.useConfiguredFolder?.().then(() =>
                queueViewerSync(async () => {
                    await syncZoneToViewer(false);
                    return syncLocationToViewer(false);
                })
            );
        }
    });
}

buildClassChips();
wireUi();
loadPack();
connectBridge();
renderAll();
