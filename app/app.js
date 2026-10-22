import { EQLogParser } from './parser.js';
import { conForLevel } from './con-colors.js';
import { scaledItemStats } from './item-scaling.js';
import { itemHasClassStats, itemHasZoneSource, itemMatchesClasses, scoreItemForBrowse } from './item-browse.js';
import { locationPollDelay } from './movement-tracking.js';
import { buildDiagnosticSnapshot } from './diagnostics.js';
import { routeDistanceLabel } from './route-guidance.js';
import { formatWorldLocationForPlayer, waypointCommandForWorldLocation, wikiLocationToWorld } from './coordinate-system.js';
import { resolveZoneRecord } from './zone-identity.js';
import { mountAppUpdates } from './app-update-ui.js';
import { compactParseSnapshot, createOverlaySession } from './overlay-session.js';
import { mountOverlayController } from './overlay-controller.js';
import { mountTimerSettings } from './timer-settings.js';
import { createMapDataLoader } from './map-overlay-data.js';
import { createTimerAlerts } from './timer-alerts.js';
import { createWikiDiscovery } from './wiki-discovery.js';
import { mountWikiDiscoveryNotices } from './wiki-discovery-ui.js';
import { mountWhatsNew } from './whats-new.js';
import { FONT_PRESETS, DEFAULT_APPEARANCE, normalizeAppearance, applyAppearance, inheritViewerAppearance } from './appearance.js';
import { mountSystemFontSettings } from './system-font-settings.js';
import { isItemStatModified } from './item-stat-presentation.js';

const CLASSES = ['WAR','CLR','PAL','RNG','SHD','DRU','MNK','BRD','ROG','SHM','NEC','WIZ','MAG','ENC','BST','BER'];
const ERAS = ['Classic','Kunark','Velious','Luclin','Planes of Power','Legacy of Ykesha','Lost Dungeons of Norrath','Gates of Discord','Omens of War'];

const parser = new EQLogParser();
let pack = { meta:{}, zones:[], npcs:[], items:[] };
let lootByNpcZone = new Map();
let lootByNpcName = new Map();
let itemByName = new Map();
let normalizedZoneKeys = new Map();
let bridgeInfo = null;
let logOffset = 0;
let partialLine = '';
let viewerReady = false;
let pollTimer = null;
let packRefreshTimer = null;
let selectedEncounterId = '';
let fightExpiryTimer = null;
let viewerSyncChain = Promise.resolve();
let latestLocationSync = null;
let pendingViewerLocation = null;
let viewerFolderPromise = null;
let viewerFolderPath = '';
let viewerFolderStatus = 'idle';
let viewerZoneState = { zone:'', status:'idle', message:'' };
let focusedIntelTarget = null;
let intelFocusSequence = 0;
let overlayMapFocus = null;
let overlayMapFocusSequence = 0;
let nativeMapVisible = false;
let discoveryInNative = false;
let mapDataRevision = 0;
let activeTooltipItem = null;
let activeTooltipTarget = null;
let activeTooltipMode = '';
let lastTooltipPointer = null;
let activeRoute = null;
let mapLootSelection = null;
let mapLootTier = 0;
let routeRefreshTimer = null;
let routeRequestSerial = 0;
let renderedDestinationZone = '';
let renderedDestinationCount = 0;
let renderedRareViewerKey = '';
let rareCatalogCache = new Map();
const renderedItemLists = new WeakMap();
const ROUTE_REFRESH_DISTANCE = 8;

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
    intelMyClassOnly: true,
    intelNamedOnly: true,
    itemCurrentZoneOnly: true,
    itemZoneFilterExplicit: false,
    itemSlot: '',
    itemSort: 'recommended',
    mapMode: 'first',
    lastView: 'overview',
    routingEnabled: false
}, prefs.load());
// Preserve deliberate filters from older installs while retiring the mode.
const legacyOverlayPrefs = prefs.load();
settings.intelMyClassOnly = legacyOverlayPrefs.intelMyClassOnly ?? legacyOverlayPrefs.minimalMyClassOnly ?? true;
settings.intelNamedOnly = legacyOverlayPrefs.intelNamedOnly ?? legacyOverlayPrefs.minimalNamedOnly ?? true;
settings.routingEnabled = legacyOverlayPrefs.routingEnabled ?? legacyOverlayPrefs.minimalRoutingVisible ?? false;
for (const key of Object.keys(settings)) if (key.startsWith('minimal') || key === 'considerMyClassOnly') delete settings[key];
if (!['first', 'top', 'map'].includes(settings.mapMode)) settings.mapMode = 'first';
if (!['recommended', 'name'].includes(settings.itemSort)) settings.itemSort = 'recommended';
if (!['overview', 'map', 'npcs', 'items', 'drops', 'combat', 'timers', 'settings'].includes(settings.lastView)) settings.lastView = 'overview';
let itemZoneFilterExplicit = Boolean(settings.itemZoneFilterExplicit || settings.itemCurrentZoneOnly === false);
settings.appearance = normalizeAppearance(settings.appearance);
applyAppearance(document,settings.appearance);
let appearanceGeneration = 0, appearancePending = 0, appearanceDraft = false;
let systemFontSettings = null;
parser.setEncounterGapSeconds(settings.encounterGapSeconds);

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
function syncViewerAppearance() {
    try { inheritViewerAppearance(document,$('#zone-viewer')?.contentDocument); } catch { /* The same-origin viewer may still be loading. */ }
}

function renderAppearanceSettings() {
    $('#settings-font-family').value = settings.appearance.fontFamily;
    $('#settings-font-size').value = String(settings.appearance.fontSize);
    $('#settings-font-size-value').textContent = `${settings.appearance.fontSize} px`;
    $('#settings-font-size').setAttribute('aria-valuetext',`${settings.appearance.fontSize} pixels`);
    systemFontSettings?.render(settings.appearance);
}
function acceptAppearance(value) {
    const next = normalizeAppearance(value), changed = JSON.stringify(next) !== JSON.stringify(settings.appearance);
    settings.appearance = next; applyAppearance(document,next); renderAppearanceSettings();
    syncViewerAppearance();
    if (changed) prefs.save(settings);
    refreshItemTooltip();
}
async function saveAppearance(value) {
    const generation = ++appearanceGeneration;
    appearanceDraft = false; appearancePending = generation;
    settings.appearance = normalizeAppearance(value); prefs.save(settings);
    applyAppearance(document,settings.appearance); renderAppearanceSettings();
    syncViewerAppearance();
    try {
        const result = await window.eyeOfZommOverlays?.control?.('appearance',null,settings.appearance);
        if (generation !== appearanceGeneration) return;
        if (result?.appearance) acceptAppearance(result.appearance);
        $('#settings-appearance-status').textContent = 'Font settings saved.';
    } catch {
        if (generation === appearanceGeneration) $('#settings-appearance-status').textContent = 'The main window font is saved. Change a font setting again to retry applying it to native overlays.';
    } finally { if (appearancePending === generation) appearancePending = 0; }
}

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

function showNotice(message, options = {}) {
    const host = $('#toast-region');
    if (!host || !message) return;
    const tone = ['success', 'warning', 'error'].includes(options.tone) ? options.tone : 'info';
    const toast = document.createElement('div');
    toast.className = `toast toast-${tone}`;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    const copy = document.createElement('span');
    copy.textContent = String(message);
    toast.append(copy);
    if (options.actionLabel && typeof options.onAction === 'function') {
        const action = document.createElement('button');
        action.type = 'button';
        action.textContent = options.actionLabel;
        action.addEventListener('click', () => {
            options.onAction();
            toast.remove();
        });
        toast.append(action);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.textContent = '×';
    close.addEventListener('click', () => toast.remove());
    toast.append(close);
    host.prepend(toast);
    while (host.children.length > 4) host.lastElementChild?.remove();
    const duration = Number(options.duration ?? (tone === 'error' ? 9000 : 5000));
    if (duration > 0) setTimeout(() => toast.remove(), duration);
}

async function writeClipboardText(text) {
    const value = String(text || '');
    if (!value) return false;
    if (window.eyeOfZommWindow?.copyText) {
        const result = await window.eyeOfZommWindow.copyText(value);
        if (result?.ok !== false) return true;
    }
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
    }
    const fallback = document.createElement('textarea');
    fallback.value = value;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand('copy');
    fallback.remove();
    return copied;
}

function waypointNameControl(name, worldLocation) {
    const command = waypointCommandForWorldLocation(worldLocation);
    if (!command) return `<span class="waypoint-npc-label">${esc(name)}</span>`;
    return `<button type="button" class="waypoint-npc" data-waypoint="${esc(command)}" title="Copy ${esc(command)}" aria-label="Copy waypoint for ${esc(name)}"><span>${esc(name)}</span><span class="waypoint-copy-cue" aria-hidden="true">⧉</span></button>`;
}

function bindWaypointButtons(host = document) {
    host?.querySelectorAll?.('.waypoint-npc').forEach(button => {
        if (button.dataset.eqlCopyBound) return;
        button.dataset.eqlCopyBound = '1';
        button.addEventListener('click', async () => {
            const command = button.dataset.waypoint || '';
            try {
                if (!await writeClipboardText(command)) throw new Error('Clipboard unavailable');
                showNotice(`Copied ${command}`, { tone:'success', duration:3000 });
            } catch {
                showNotice(`Could not copy automatically. Use ${command}`, { tone:'error', duration:8000 });
            }
        });
    });
}

function showSettingsNotice(message, tone = 'warning') {
    showNotice(message, {
        tone,
        actionLabel:'Open Settings',
        onAction:() => setView('settings')
    });
}

function zoneRecord(name) {
    return resolveZoneRecord(pack.zones, name);
}

function zoneKey(name) {
    const cacheKey = String(name || '');
    if (normalizedZoneKeys.has(cacheKey)) return normalizedZoneKeys.get(cacheKey);
    const record = zoneRecord(name);
    const normalized = String(record?.name || name || '')
        .toLowerCase()
        .replace(/\s+\d+\s+\([^)]*\)\s*$/,'')
        .replace(/^the\s+/,'')
        .replace(/\s+/g,' ')
        .trim();
    normalizedZoneKeys.set(cacheKey, normalized);
    return normalized;
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

function itemHoverAttrs(itemOrName, extraClass = '') {
    const item = typeof itemOrName === 'string' ? itemRecord(itemOrName) : itemOrName;
    const name = item?.name || itemOrName || '';
    return `class="item-hover${extraClass ? ` ${esc(extraClass)}` : ''}" data-item-title="${esc(name)}" tabindex="0" aria-describedby="item-tooltip"`;
}
function itemIconHtml(item) {
    const icon = itemIconSource(item);
    return `<span ${itemHoverAttrs(item,'item-card-icon')} role="img" aria-label="${esc(`Stats for ${item.name}`)}">${icon ? `<img src="${esc(icon)}" alt="">` : '◇'}</span>`;
}
function itemHoverIdentity(target) {
    if (!target?.dataset?.itemTitle) return '';
    return JSON.stringify([target.dataset.itemTitle,target.closest('[data-item-tooltip-source]')?.dataset.itemTooltipSource || '',target.classList.contains('item-card-icon') ? 'icon' : target.tagName]);
}
function replaceItemList(host,markup) {
    if (renderedItemLists.get(host) === markup) return false;
    const focused = document.activeElement?.closest?.('[data-item-title]');
    const focusKey = focused && host.contains(focused) ? itemHoverIdentity(focused) : '';
    host.innerHTML = markup; renderedItemLists.set(host,markup);
    if (focusKey) {
        const next = [...host.querySelectorAll('[data-item-title]')].find(target => itemHoverIdentity(target) === focusKey);
        if (next) next.focus({preventScroll:true}); else hideItemTooltip();
    }
    return true;
}

function itemMatchesProfile(item, profile) {
    return itemMatchesClasses(item, profile.classes);
}

function itemDropsInZone(item, zone) {
    return itemHasZoneSource(item, zone, zoneKey);
}

function itemBrowsePriority(item, zone) {
    return scoreItemForBrowse(item, { zone, normalizeZone:zoneKey, isNamedSource });
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
            if (!nextPack || !(Number(nextPack.meta?.schemaVersion) >= 3) || !Array.isArray(nextPack.zones) || !Array.isArray(nextPack.npcs) || !Array.isArray(nextPack.items)) {
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
    if (parser.zoneShortName) {
        parser.zone = zoneRecord(parser.zoneShortName)?.name || parser.zone;
    }
    if (!settings.era) settings.era = pack.meta.currentEra || 'Classic';
    $('#pack-version').textContent = pack.meta.version || 'unknown';
    $('#pack-mode').textContent = pack.meta.sample ? 'Sample' : 'Production';
    buildEraSelect();
    buildItemSlotSelect();
    renderAll();
}

async function connectBridge() {
    try {
        bridgeInfo = await api('/api/info');
        whatsNew.refresh();
        mapDataLoader.invalidate(); mapDataRevision++;
        parser.setCharacterFromFilename(bridgeInfo.logPath || '');
        $('#app-version').textContent = bridgeInfo.version || 'unknown';
        $('#titlebar-version').textContent = `v${bridgeInfo.version || 'unknown'}`;
        document.title = `EQLWiki - Eye of Zomm v${bridgeInfo.version || 'unknown'}`;
        $('#bridge-status').textContent = bridgeInfo.logExists ? 'Live log' : 'Waiting for log';
        $('#bridge-status').className = bridgeInfo.logExists ? 'status-pill status-ok' : 'status-pill status-warn';
        $('#settings-eq-root').textContent = bridgeInfo.eqRootPath || 'No folder selected';
        $('#settings-log-path').textContent = bridgeInfo.logPath || 'No log selected';
        $('#settings-log-mode').textContent = bridgeInfo.logSelection === 'manual' ? 'Specific file' : 'Newest log automatically';
        $('#automatic-log').hidden = bridgeInfo.logSelection !== 'manual';
        $('#setup-overlay').hidden = Boolean(bridgeInfo.eqRootExists);
        renderPackSyncStatus(bridgeInfo.dataPack);
        applyWindowSettings(bridgeInfo.windowState || {});
        if (!logOffset) logOffset = 0;
        schedulePoll(50);
        schedulePackRefreshCheck();
        if (bridgeInfo.eqRootExists) {
            queueViewerSync(async () => {
                const connected = await ensureViewerFolderConnected(false);
                if (!connected) return false;
                const s = state();
                if (s.zone) await syncZoneToViewer(false);
                if (s.location) return syncLocationToViewer(false);
                return true;
            });
        } else {
            updateViewerFolderStatus('missing');
        }
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

function renderPackSyncStatus(sync = bridgeInfo?.dataPack || {}) {
    const dateLabel = value => {
        const at = Date.parse(String(value || ''));
        return Number.isFinite(at) ? new Date(at).toLocaleString() : '—';
    };
    $('#pack-update-status').textContent = sync.checking ? 'checking…' : sync.lastStatus || (bridgeInfo?.productionPack ? 'cached' : 'sample fallback');
    $('#pack-last-check').textContent = dateLabel(sync.lastCheckUtc);
    $('#pack-last-success').textContent = dateLabel(sync.lastSuccessUtc);
    $('#pack-data-generated').textContent = dateLabel(sync.generatedAtUtc || pack.meta?.generatedAt);
    $('#pack-last-download').textContent = dateLabel(sync.lastUpdatedUtc);
    $('#pack-next-check').textContent = sync.checking ? 'After this check completes' : dateLabel(sync.nextCheckUtc);
    const error = $('#pack-sync-error');
    error.textContent = sync.lastStatus === 'unavailable' ? String(sync.lastError || 'The last check could not complete. Using saved wiki data.') : '';
    error.hidden = !error.textContent;
}

async function checkForDesktopPackRefresh() {
    try {
        const info = await api('/api/info');
        bridgeInfo = { ...(bridgeInfo || {}), dataPack:info.dataPack, productionPack:info.productionPack };
        const stateVersion = String(info?.dataPack?.version || '');
        const activeManifestVersion = String(pack?.meta?.manifestVersion || '');
        if (info?.productionPack && stateVersion && stateVersion !== activeManifestVersion) {
            await loadPack();
        }
        renderPackSyncStatus(info.dataPack);
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
        let requiresFullRender = false;
        const previousLogReady = Boolean(bridgeInfo?.logExists);
        if (data.logPath && (!bridgeInfo || data.logPath !== bridgeInfo.logPath)) {
            const previousLog = bridgeInfo?.logPath || '';
            bridgeInfo = bridgeInfo || {};
            bridgeInfo.logPath = data.logPath;
            parser.setCharacterFromFilename(data.logPath);
            $('#settings-log-path').textContent = data.logPath;
            changed = true;
            requiresFullRender = true;
            if (previousLog) showNotice(`Now following ${data.logPath.split(/[\\/]/).pop()}.`, { tone:'success' });
        }
        if (bridgeInfo) bridgeInfo.logExists = Boolean(data.logExists);
        if (previousLogReady !== Boolean(data.logExists)) {
            changed = true;
            requiresFullRender = true;
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
            if (incoming) {
                const outcome = consumeText(incoming, !data.reset);
                requiresFullRender ||= outcome.requiresFullRender;
            }
            changed = Boolean(incoming);
        }
        logOffset = Number(data.newOffset ?? logOffset);
        $('#bridge-status').textContent = data.logExists ? 'Live log' : 'Waiting for log';
        $('#bridge-status').className = data.logExists ? 'status-pill status-ok' : 'status-pill status-warn';
        if (changed) {
            if (requiresFullRender) renderAll();
            else renderLiveLocation();
        }
        schedulePoll(locationPollDelay({
            mapVisible:nativeMapVisible || document.body.classList.contains('map-active'),
            routeActive:Boolean(activeRoute)
        }));
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
    let zoneChanged = false;
    let latestLocation = null;
    let requiresFullRender = false;
    for (const line of lines) {
        const previousZone = parser.zone;
        const event = parser.parse(line, { recordSession:allowTransientUi || parser.sessionNumber === 1 });
        if (event && event.type !== 'location') requiresFullRender = true;
        if (event?.type === 'zone') {
            const canonicalZone = zoneRecord(event.zoneShortName || event.zone)?.name || event.zoneShortName || event.zone;
            event.zone = canonicalZone;
            parser.zone = canonicalZone;
            if (zoneKey(previousZone) !== zoneKey(canonicalZone)) parser.location = null;
            if (activeRoute && zoneKey(activeRoute.zone) !== zoneKey(event.zone)) clearActiveRoute({ clearViewer:false });
            zoneChanged = true;
            latestLocation = null;
        }
        if (event?.type === 'location') latestLocation = { ...event.location };
        const originalAt = Date.parse(line.match(/^\[([^\]]+)\]/)?.[1] || '');
        const freshTimerEvent = Number.isFinite(originalAt) && Math.abs(Date.now() - originalAt) <= 10000;
        let listedTarget = false;
        if (allowTransientUi && freshTimerEvent && ['consider','kill'].includes(event?.type)) listedTarget = focusIntelForConsider(event.type === 'consider' ? event.target : {name:event.victim});
        if (!listedTarget) wikiDiscovery.consume(event,{live:allowTransientUi && freshTimerEvent,logId:bridgeInfo?.logPath || 'current-log',zone:parser.zone,at:parser.currentLineAt});
        overlaySession.consume(event, { zone:parser.zone, character:parser.character, live:allowTransientUi && freshTimerEvent,
            text:line, at:parser.currentLineAt, logId:bridgeInfo?.logPath || 'current-log' });
    }
    overlaySession.flush();
    if (zoneChanged) {
        pendingViewerLocation = null;
        queueViewerSync(async () => {
            const loaded = await syncZoneToViewer(false);
            if (loaded && latestLocation) {
                const synced = await syncLocationToViewer(false, latestLocation);
                if (synced) scheduleRouteRefresh(latestLocation);
                return synced;
            }
            return loaded;
        });
    } else if (latestLocation) {
        queueLatestLocationSync(latestLocation);
    }
    return { requiresFullRender, locationChanged:Boolean(latestLocation) };
}

function state() {
    return parser.snapshot();
}

function startNewSession() {
    // Split at the current consumed cursor. Keep logOffset and partialLine so
    // the next poll completes unread lines without replaying the previous tail.
    parser.startNewSession();
    selectedEncounterId = '';
    clearTimeout(fightExpiryTimer);
    renderAll();
    void overlaySession.publish();
    showNotice('New session started. Combat and loot totals have been cleared.', { tone:'success' });
}

const raidVariant = npc => npc?.raidInstance === true || npc?.instanceType === 'raid';
const intelIdentity = npc => `${zoneKey(npc?.zone)}|${npcNameKey(npc?.name)}|${raidVariant(npc) ? 'raid' : 'normal'}`;
function focusIntelForConsider(target) {
    if (!target?.name || !state().zone) return;
    const s = state();
    const matches = rareMobsForZone(s, effectiveProfile(s)).filter(source => npcNameKey(source.name) === npcNameKey(target.name));
    const source = matches.find(source => intelIdentity(source) === focusedIntelTarget?.id) || matches.find(source => !raidVariant(source)) || matches[0];
    if (!source) return;
    focusedIntelTarget = { id:intelIdentity(source), name:source.name, zone:s.zone, raidInstance:raidVariant(source) };
    intelFocusSequence++;
    timerAlerts.blip();
    void overlaySession.publish();
    return true;
}

function overlayItemSummary(item, budget) {
    let icon = itemIconSource(item);
    if (icon.length > 12000 || icon.length > budget.remaining) icon = '';
    budget.remaining -= icon.length;
    const boundedStats = stats => Object.fromEntries(Object.entries(stats || {}).slice(0,24)
        .filter(([,value]) => typeof value === 'number' && Number.isFinite(value) || typeof value === 'string')
        .map(([key,value]) => [key.slice(0,40), typeof value === 'string' ? value.slice(0,80) : value]));
    return { name:String(item.name || '').slice(0,240), icon,
        slots:(item.slots || []).slice(0,8).map(slot => String(slot).slice(0,60)),
        classes:(Array.isArray(item.classes) ? item.classes : []).slice(0,20).map(value => String(value).slice(0,40)),
        displayLines:(Array.isArray(item.displayLines) ? item.displayLines : []).slice(0,12).map(value => String(value).slice(0,240)),
        notes:String(item.notes || '').slice(0,1200), baseStats:boundedStats(item.stats),
        stats:boundedStats(scaledItemStats(item,settings.itemTier)), tier:Number(settings.itemTier) || 0 };
}
const mapDataLoader = createMapDataLoader({ getManifest:() => api('/api/eq-files'),
    readText:async path => { const response = await fetch(`/api/eq-file?path=${encodeURIComponent(path)}`); if (!response.ok) throw new Error('The local map could not be read.'); return response.text(); },
    resolveZone:zoneRecord, getRootKey:() => bridgeInfo?.eqRootPath || '' });

function overlaySessionSnapshot() {
    const s = state();
    const profile = effectiveProfile(s);
    const budget = { remaining:240 * 1024 };
    const canRoute = Boolean(settings.routingEnabled && s.zone && s.location);
    const sources = rareMobsForZone(s, profile, { includeGeneric:!settings.intelNamedOnly });
    const npcs = sources.map(source => ({
        id:intelIdentity(source), name:source.name, raidInstance:raidVariant(source), level:source.npc?.avgLevel || 0,
        levelMin:source.npc?.levelMin || 0, levelMax:source.npc?.levelMax || 0,
        con:conForLevel(source.npc?.avgLevel, profile.level), named:isNamedSource(source.name), rare:true,
        distance:Number.isFinite(source.distance) ? source.distance : null,
        waypoint:Boolean(waypointCommandForWorldLocation(source.loc)),
        dropCount:(settings.intelMyClassOnly ? source.items : source.allItems).length,
        drops:(settings.intelMyClassOnly ? source.items : source.allItems).slice(0, 3).map(item => overlayItemSummary(item,budget))
    }));
    const selected = focusedIntelTarget && zoneKey(focusedIntelTarget.zone) === zoneKey(s.zone) ? focusedIntelTarget : null;
    const navigation = activeRoute?.status === 'ready' && zoneKey(activeRoute.zone) === zoneKey(s.zone) ? viewerApi()?.overlayNavigation?.() : null;
    return { character:s.character, zone:s.zone, logStatus:bridgeInfo?.logExists ? 'Following selected log' : 'Waiting for log',
        parse:compactParseSnapshot(s), discovery:discoveryInNative ? wikiDiscovery.snapshot().pending : [], intel:{ npcs, zone:s.zone, myClassOnly:Boolean(settings.intelMyClassOnly), itemTier:Number(settings.itemTier) || 0, canRoute,
            packVersion:pack.meta?.manifestVersion || pack.meta?.version || '', profileKey:JSON.stringify([profile.classes.slice().sort(),settings.itemTier,settings.era]),
            focusedNpcId:selected?.id || '', focusSequence:intelFocusSequence },
        map:{ zone:s.zone, viewerZone:zoneRecord(s.zone)?.viewerName || zoneRecord(s.zone)?.name || s.zone, dataVersion:mapDataRevision, location:s.location, selectedNpcId:selected?.id || '', selectedNpcName:selected?.name || '',
            focus:overlayMapFocus && overlayMapFocus.dataVersion === mapDataRevision && zoneKey(overlayMapFocus.zone) === zoneKey(s.zone) ? overlayMapFocus : null,
            npcs:sources.filter(source => source.loc?.length >= 2).map(source => ({id:intelIdentity(source),name:source.name,loc:source.loc,raidInstance:raidVariant(source)})),
            route:{ points:navigation?.points || [], message:activeRoute && zoneKey(activeRoute.zone) === zoneKey(s.zone) ? activeRoute.message : '' } } };
}

async function handleOverlayCommand({ action, payload = {} }) {
    if (action === 'session:new-session') { startNewSession(); return; }
    const requestedZone = state().zone;
    const resolveNpc = () => {
        const currentZone = state().zone;
        if (!currentZone || zoneKey(requestedZone) !== zoneKey(currentZone) ||
            (payload.zone && zoneKey(payload.zone) !== zoneKey(currentZone))) throw new Error('That NPC belongs to a previous zone.');
        const npc = npcRecordForName(payload.npc, currentZone, payload.raidInstance);
        if (!npc || (npc.zone && zoneKey(npc.zone) !== zoneKey(currentZone))) throw new Error('That NPC is no longer available in the current zone.');
        if (payload.id !== undefined && payload.id !== intelIdentity(npc)) throw new Error('That NPC source is no longer available.');
        return npc;
    };
    if (action === 'session:item-tier') {
        if (!Number.isInteger(payload.tier) || payload.tier < 0 || payload.tier > 10) throw new Error('Choose an item level from Base to 10.');
        settings.itemTier = payload.tier;
        prefs.save(settings); renderAll(); refreshItemTooltip(); return;
    }
    if (action === 'session:class-filter') {
        if (payload.panel !== 'intel' || typeof payload.enabled !== 'boolean') return;
        settings.intelMyClassOnly = payload.enabled;
        prefs.save(settings); renderAll(); return;
    }
    if (action === 'session:map-data') {
        if (!payload.zone || zoneKey(payload.zone) !== zoneKey(requestedZone)) throw new Error('That map belongs to a previous zone.');
        const rootKey = bridgeInfo?.eqRootPath, revision = mapDataRevision;
        const data = await mapDataLoader.load(requestedZone,parser.zoneShortName);
        if (zoneKey(state().zone) !== zoneKey(requestedZone) || rootKey !== bridgeInfo?.eqRootPath || revision !== mapDataRevision) throw new Error('The map context changed while it was loading.');
        return data;
    }
    if (action === 'session:intel-drops') {
        const npc = resolveNpc(), profile = effectiveProfile(state());
        const items = knownDropsForNpc(npc).filter(item => eraAllowed(item.era) && (!settings.intelMyClassOnly || (itemMatchesProfile(item,profile) && itemHasClassStats(item))));
        const budget = {remaining:1024*1024};
        return {items:items.map(item => overlayItemSummary(item,budget)),total:items.length};
    }
    if (action === 'session:select-npc') {
        const npc = resolveNpc(); focusedIntelTarget = {id:intelIdentity(npc),name:npc.name,zone:requestedZone,raidInstance:raidVariant(npc)}; intelFocusSequence++; return;
    }
    if (action === 'session:map-focus') {
        const npc = resolveNpc(), loc = wikiLocationToWorld(npc.loc);
        if (!loc || loc.length < 2) throw new Error('No map location is known for this NPC.');
        overlayMapFocus = {sequence:++overlayMapFocusSequence,id:intelIdentity(npc),name:npc.name,zone:requestedZone,
            loc,mode:'first',dataVersion:mapDataRevision};
        focusedIntelTarget = {id:intelIdentity(npc),name:npc.name,zone:requestedZone,raidInstance:raidVariant(npc)};
        // Camera preview is independent of the log parser and its route start.
        await window.eyeOfZommOverlays.control('show','map'); return;
    }
    if (action === 'session:cancel-route') { clearActiveRoute(); return; }
    if (action === 'session:copy-waypoint') {
        const command = waypointCommandForWorldLocation(wikiLocationToWorld(resolveNpc().loc));
        if (!command || !await writeClipboardText(command)) throw new Error('No waypoint could be copied for this NPC.');
        showNotice(`Copied ${command}`, { tone:'success' }); return;
    }
    if (action === 'session:wiki') { const npc = resolveNpc(); openExternal(wikiUrl(npc.wikiTitle || npc.name)); return; }
    if (action === 'session:route') {
        resolveNpc();
        if (!settings.routingEnabled) throw new Error('Enable path controls in Settings before requesting a route.');
        const npc = resolveNpc();
        if (!settings.routingEnabled) throw new Error('Path controls were disabled.');
        await pathToNpc(npc.name,{openMain:false,raidInstance:raidVariant(npc)}); return;
    }
    if (action === 'session:open') {
        if (!['map', 'items', 'npcs', 'combat', 'timers', 'settings'].includes(payload.view)) return;
        const npc = payload.npc ? resolveNpc() : null;
        const item = payload.item ? itemRecord(payload.item) : null;
        if (payload.item && !item) throw new Error('That item is no longer available in the current dataset.');
        await window.eyeOfZommOverlays?.control('show-main');
        if (npc) $('#npc-search').value = resolveNpc().name;
        if (item) $('#item-search').value = item.name;
        setView(payload.view); renderAll();
    }
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
    normalizedZoneKeys = new Map();
    renderedDestinationZone = '';
    renderedDestinationCount = 0;
    renderedRareViewerKey = '';
    rareCatalogCache = new Map();
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
        // A named NPC in another zone or instance must not leak its loot here.
        if (!(item.dropSources || []).some(source => npcNameKey(source.name) === nameKey &&
            (!source.zone || zoneKey(source.zone) === zoneKey(npc?.zone)) && raidVariant(source) === raidVariant(npc))) return false;
        const key = String(item?.wikiTitle || item?.name || '').toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function selectMapLoot(name, raidInstance) {
    const npc = npcRecordForName(name, state().zone, raidInstance);
    if (!npc) return;
    mapLootSelection = {name:npc.name,zone:state().zone,raidInstance:raidVariant(npc)};
    viewerApi()?.setActiveRareMob?.(npc.name);
    renderMapLootPane(state(),effectiveProfile(state()));
}

function renderMapLootPane(s,profile) {
    const host = $('#map-loot-pane');
    mapLootTier=Number(settings.itemTier)||0;
    if (!host) return;
    if (!mapLootSelection || zoneKey(mapLootSelection.zone) !== zoneKey(s.zone)) {
        mapLootSelection = null; host.hidden = true; host.replaceChildren(); return;
    }
    const npc = npcRecordForName(mapLootSelection.name,s.zone,mapLootSelection.raidInstance);
    if (!npc) { mapLootSelection = null; host.hidden = true; host.replaceChildren(); return; }
    const drops = knownDropsForNpc(npc).slice().sort((a,b) =>
        Number(itemMatchesProfile(b,profile))-Number(itemMatchesProfile(a,profile)) || String(a.name).localeCompare(String(b.name)));
    const location = wikiLocationToWorld(npc.loc);
    const markup = `<div class="map-loot-heading"><div><span class="eyebrow">${raidVariant(npc)?'RAID ZONE':'NORMAL ZONE'}</span><h2>${esc(npc.name)}</h2><p class="sub">${npc.avgLevel?`Level ${esc(npc.avgLevel)} · `:''}${drops.length} known drops</p></div><button type="button" class="text-button" data-close-map-loot aria-label="Close loot pane">✕</button></div>
        <div class="map-loot-controls"><label>Item tier <input type="range" min="0" max="10" step="1" value="${mapLootTier}" data-map-loot-tier><output>${mapLootTier?`Tier ${mapLootTier}`:'Base'}</output></label>
        <div class="card-actions"><button type="button" class="mini-button" data-map-loot-route>Route</button>${location?`<button type="button" class="mini-button" data-map-loot-waypoint>Copy /waypoint</button>`:''}<a class="mini-button" href="${wikiUrl(npc.wikiTitle||npc.name)}" target="_blank" rel="noopener">Monster wiki</a></div></div>
        <div class="map-loot-items">${drops.map(item => {
            const stats = scaledItemStats(item,mapLootTier);
            return `<article class="data-card map-loot-item" data-item-tooltip-source="map-loot:${esc(item.wikiTitle||item.name)}"><div class="item-card-heading">${itemIconHtml(item)}<div><h3 ${itemHoverAttrs(item)}>${esc(item.name)}</h3><div class="sub">${esc((item.slots||[]).join(' · ')||'Unknown slot')}</div></div></div>
                <div class="pill-row">${(item.classes||[]).map(c=>`<span class="pill">${esc(c)}</span>`).join('')}${item.era?`<span class="pill">${esc(item.era)}</span>`:''}</div>
                <div class="stats">${Object.entries(stats).map(([key,value])=>`<div class="stat ${isItemStatModified(item.stats?.[key],value,mapLootTier)?'is-scaled':''}"><span>${esc(key.replace(/_/g,' '))}</span><strong>${formatNum(value)}</strong></div>`).join('')||'<span class="sub">Stats have not been recorded on the wiki.</span>'}</div>
                ${item.notes?`<p class="sub">${esc(item.notes)}</p>`:''}<a class="mini-button" href="${wikiUrl(item.wikiTitle||item.name)}" target="_blank" rel="noopener">Item wiki</a></article>`;
        }).join('')||'<div class="empty-state">No drops recorded in the current wiki dataset.</div>'}</div>`;
    host.hidden = false;
    if (replaceItemList(host,markup)) {
        host.querySelector('[data-close-map-loot]').onclick = () => {mapLootSelection=null;renderMapLootPane(state(),effectiveProfile(state()));};
        host.querySelector('[data-map-loot-route]').onclick = () => {void pathToNpc(npc.name,{raidInstance:raidVariant(npc)});};
        host.querySelector('[data-map-loot-waypoint]')?.addEventListener('click',async()=>{
            const command=waypointCommandForWorldLocation(location);
            if (command && await writeClipboardText(command)) showNotice(`Copied ${command}`,{tone:'success'});
        });
        host.querySelector('[data-map-loot-tier]').oninput = event => {
            event.target.nextElementSibling.textContent=Number(event.target.value)?`Tier ${event.target.value}`:'Base';
        };
        host.querySelector('[data-map-loot-tier]').onchange = event => {
            mapLootTier=Number(event.target.value)||0;settings.itemTier=mapLootTier;prefs.save(settings);renderMapLootPane(state(),effectiveProfile(state()));
        };
    }
    refreshItemTooltip();
}

function npcRecordForName(name, zone = state().zone, raidInstance) {
    const wanted = npcNameKey(name);
    if (!wanted) return null;
    const matches = allNpcsForState(state()).filter(npc =>
        npcNameKey(npc.name) === wanted &&
        (!zone || !npc.zone || zoneKey(npc.zone) === zoneKey(zone)) &&
        (typeof raidInstance !== 'boolean' || raidVariant(npc) === raidInstance)
    );
    const direct = matches.find(npc => !raidVariant(npc)) || matches[0];
    if (direct) return direct;
    const source = rareMobsForZone(state(),effectiveProfile(state()),{includeGeneric:true}).find(source =>
        npcNameKey(source.name) === wanted && (!zone || zoneKey(source.zone) === zoneKey(zone)) &&
        (typeof raidInstance !== 'boolean' || raidVariant(source) === raidInstance));
    return source ? {...source.npc,name:source.name,zone:source.zone,raidInstance:raidVariant(source)} : null;
}

function allNpcsForState(s) {
    const observed = s.observed.map(o => ({
        name:o.name, zone:o.zone, avgLevel:o.level || 0, levelMin:o.level || 0, levelMax:o.level || 0,
        era:'Observed', wikiTitle:o.name, observed:true, damageDone:o.damageDone || 0
    }));
    const merged = new Map();
    for (const npc of [...pack.npcs, ...observed]) {
        const key = intelIdentity(npc);
        const old = merged.get(key);
        if (!old || npc.observed) merged.set(key, Object.assign({}, old || {}, npc));
    }
    return Array.from(merged.values());
}

function rareMobsForZone(s, profile, options = {}) {
    if (!s.zone) return [];
    const includeGeneric = Boolean(options.includeGeneric);
    const cacheKey = JSON.stringify([
        zoneKey(s.zone),
        settings.era,
        profile.classes.slice().sort(),
        includeGeneric,
        pack.meta?.manifestVersion || pack.meta?.version || ''
    ]);
    let catalog = rareCatalogCache.get(cacheKey);
    if (!catalog) {
        const sources = new Map();
        const addSource = (name, raidInstance = false) => {
            name = String(name || '').trim();
            if (!name || (!includeGeneric && !isNamedSource(name))) return null;
            const key = `${npcNameKey(name)}|${raidInstance ? 'raid' : 'normal'}`;
            if (!sources.has(key)) sources.set(key, { name, zone:s.zone, raidInstance, npc:null, allItems:[], items:[] });
            return sources.get(key);
        };

        for (const npc of pack.npcs || []) {
            if (zoneKey(npc.zone) !== zoneKey(s.zone)) continue;
            const source = addSource(npc.name,raidVariant(npc));
            if (source) source.npc = npc;
        }
        for (const item of pack.items || []) {
            if (!eraAllowed(item.era)) continue;
            for (const drop of item.dropSources || []) {
                if (zoneKey(drop.zone) !== zoneKey(s.zone)) continue;
                const source = addSource(drop.name,raidVariant(drop));
                if (source) source.allItems.push(item);
            }
        }

        for (const source of sources.values()) {
            const seen = new Set();
            source.allItems = source.allItems.filter(item => {
                const key = String(item.wikiTitle || item.name || '').toLowerCase();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            source.items = source.allItems.filter(item => itemMatchesProfile(item, profile) && itemHasClassStats(item));
            source.loc = wikiLocationToWorld(source.npc?.loc);
        }
        catalog = Array.from(sources.values());
        rareCatalogCache.set(cacheKey, catalog);
    }

    return catalog.map(source => ({
        ...source,
        distance:source.loc?.length >= 2 && s.location
            ? Math.hypot(
                source.loc[0] - s.location.x,
                source.loc[1] - s.location.y,
                ...(source.loc.length >= 3 ? [source.loc[2] - s.location.z] : [])
            )
            : Infinity
    })).sort((left, right) =>
        right.items.length - left.items.length ||
        Number(Boolean(right.loc?.length >= 2)) - Number(Boolean(left.loc?.length >= 2)) ||
        left.distance - right.distance ||
        left.name.localeCompare(right.name)
    );
}

function syncRareMobsToViewer(force = false) {
    const s = state();
    const apiObj = viewerApi();
    if (!apiObj?.setRareMobs || !apiObj.status?.().zone || !s.zone) return false;
    const profile = effectiveProfile(s);
    const sources = rareMobsForZone(s, profile)
        .filter(source => source.loc?.length >= 2)
        .sort((left, right) =>
            right.items.length - left.items.length ||
            right.allItems.length - left.allItems.length ||
            left.name.localeCompare(right.name)
        )
        .slice(0, 180);
    const payload = sources.map(source => ({
        id:intelIdentity(source),
        raidInstance:raidVariant(source),
        name:source.name,
        wikiTitle:source.npc?.wikiTitle || source.name,
        loc:source.loc,
        level:Number(source.npc?.avgLevel) || 0,
        dropCount:source.allItems.length,
        classDropCount:source.items.length
    }));
    const key = JSON.stringify([
        zoneKey(s.zone),
        pack.meta?.manifestVersion || pack.meta?.version || '',
        profile.classes.slice().sort(),
        payload.map(entry => [entry.id, entry.name, entry.loc, entry.dropCount, entry.classDropCount])
    ]);
    if (!force && key === renderedRareViewerKey) return true;
    renderedRareViewerKey = key;
    apiObj.setRareMobs(payload);
    apiObj.setActiveRareMob?.(mapLootSelection?.name || activeRoute?.name || '');
    return true;
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
    if (e.type === 'location') return formatWorldLocationForPlayer(e.location, 1);
    if (e.type === 'consider') return `${e.target.name} considered at level ${e.target.level}`;
    if (e.type === 'damage') return `${e.source}: ${e.amount} → ${e.victim}`;
    if (e.type === 'heal') return `${e.source}: healed ${e.target}`;
    if (e.type === 'kill') return `Slain ${e.victim}`;
    if (e.type === 'rune') return `Rune capacity granted: ${e.amount}`;
    if (e.type === 'loot') return `${Number(e.quantity) > 1 ? `${e.quantity}× ` : ''}${e.item} · from ${e.source || 'Unknown'}`;
    return e.type;
}

function renderEvents(s) {
    // Repeated /loc lines drive the map but should not flood the Overview.
    const events = s.recentEvents.filter(event => event.type !== 'location').slice(0,12);
    const html = events.map(e => `<div class="event-row"><span class="event-type">${esc(e.type)}</span><span>${esc(eventText(e))}</span><span class="event-value">${e.amount ? formatNum(e.amount) : ''}</span></div>`).join('');
    $('#recent-events').className = events.length ? 'event-feed' : 'event-feed empty-state';
    $('#recent-events').innerHTML = events.length ? html : 'Waiting for log activity.';
}

function renderCombat(s) {
    $('#combat-damage').textContent = formatNum(s.totalDamage);
    $('#combat-dps').textContent = formatNum(s.sessionDps);
    $('#combat-healing').textContent = formatNum(s.totalHealing);
    $('#combat-rune-capacity').textContent = `${formatNum(s.totalRuneCapacity)} rune capacity granted`;
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

function tooltipHtml(item,target) {
    const tier = target?.closest('#map-loot-pane') ? mapLootTier : Number(settings.itemTier) || 0;
    const stats = scaledItemStats(item, tier);
    const statHtml = Object.entries(stats).slice(0, 18).map(([key, value]) => {
        const base = Number(item?.stats?.[key]);
        const changed = isItemStatModified(item?.stats?.[key],value,tier);
        return `<div class="tooltip-stat ${changed ? 'is-scaled' : ''}"><span>${esc(key.replace(/_/g, ' '))}:</span><strong>${Number(value) > 0 ? '+' : ''}${formatNum(value)}${changed ? `<small> (${base > 0 ? '+' : ''}${formatNum(base)})</small>` : ''}</strong></div>`;
    }
    ).join('');
    const sources = (item.dropSources || []).slice(0, 8)
        .map(source => esc(`${source.zone ? `${source.zone} · ` : ''}${source.name}`))
        .join('<br>');
    const icon = itemIconSource(item);
    const displayLines = Array.isArray(item.displayLines) ? item.displayLines.slice(0, 12) : [];
    return `<div class="itembox-title"><span>${esc(item.name)}</span>${tier > 0 ? `<span class="itembox-tier">Tier ${tier}</span>` : ''}</div>
        <div class="itembox-body">
            <div class="itembox-summary">${icon ? `<img class="itembox-icon" src="${esc(icon)}" alt="">` : '<span class="itembox-icon item-icon-placeholder">◇</span>'}<div>
                ${displayLines.length ? displayLines.map(line => `<div>${esc(line)}</div>`).join('') : `<div>${esc((item.slots || []).length ? `Slot: ${(item.slots || []).join(' ')}` : 'Slot: Unknown')}</div><div>Class: ${esc((item.classes || []).join(' ') || 'Unknown')}</div>`}
            </div></div>
            ${statHtml ? `<div class="tooltip-scale-label">${tier > 0 ? `Tier ${tier} adjusted stats <small>(base)</small>` : 'Base stats'}</div><div class="tooltip-stats">${statHtml}</div>` : ''}
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
    if (!item || !tooltip) { hideItemTooltip(); return; }
    activeTooltipItem = item;
    activeTooltipTarget = target;
    activeTooltipMode = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY) ? 'pointer' : 'focus';
    const rect = target.getBoundingClientRect();
    lastTooltipPointer = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
        ? { clientX:event.clientX, clientY:event.clientY }
        : { clientX:Math.min(window.innerWidth - 8, rect.right), clientY:Math.min(window.innerHeight - 8, rect.bottom) };
    tooltip.innerHTML = tooltipHtml(item,target);
    tooltip.hidden = false;
    positionTooltip(lastTooltipPointer);
}

function refreshItemTooltip() {
    const tooltip = $('#item-tooltip');
    if (!activeTooltipItem || !tooltip || tooltip.hidden) return;
    // A changed list may reorder rows or contain duplicate drops. Resolve the
    // actual pointer/focus surface, never another occurrence of the old name.
    const target = activeTooltipMode === 'pointer'
        ? document.elementFromPoint(lastTooltipPointer?.clientX,lastTooltipPointer?.clientY)?.closest?.('[data-item-title]')
        : document.activeElement?.closest?.('[data-item-title]');
    if (!target?.closest('.view.is-active')) { hideItemTooltip(); return; }
    activeTooltipItem = itemRecord(target.dataset.itemTitle); activeTooltipTarget = target;
    if (!activeTooltipItem) { hideItemTooltip(); return; }
    tooltip.innerHTML = tooltipHtml(activeTooltipItem,target);
    if (lastTooltipPointer) positionTooltip(lastTooltipPointer);
}

function hideItemTooltip() {
    const tooltip = $('#item-tooltip');
    if (tooltip) tooltip.hidden = true;
    activeTooltipItem = null;
    activeTooltipTarget = null;
    activeTooltipMode = '';
    lastTooltipPointer = null;
}

function renderNpcList(s, profile) {
    const query = $('#npc-search')?.value.trim().toLowerCase() || '';
    const currentOnly = $('#npc-current-zone')?.checked ?? true;
    let npcs = allNpcsForState(s).filter(n => (eraAllowed(n.era) || n.observed));
    if (currentOnly && s.zone) npcs = npcs.filter(n => zoneKey(n.zone) === zoneKey(s.zone));
    if (query) npcs = npcs.filter(n => `${n.name} ${n.zone}`.toLowerCase().includes(query));
    const relevance = new Map(npcs.map(npc => {
        const classDrops = knownDropsForNpc(npc).filter(item => eraAllowed(item.era) && itemMatchesProfile(item, profile)).length;
        const levelDistance = npc.avgLevel && profile.level ? Math.abs(Number(npc.avgLevel) - Number(profile.level)) : 50;
        return [npc, (isNamedSource(npc.name) ? 200 : 0) + Math.min(classDrops, 8) * 25 - levelDistance];
    }));
    npcs.sort((a,b) => relevance.get(b) - relevance.get(a) || a.name.localeCompare(b.name));
    const total = npcs.length;
    const visible = npcs.slice(0, 300);

    let markup = visible.map(n => {
        const con = conForLevel(n.avgLevel, profile.level);
        const knownDrops = knownDropsForNpc(n).filter(item => eraAllowed(item.era));
        const drops = knownDrops.slice().sort((left, right) =>
            Number(itemMatchesProfile(right, profile)) - Number(itemMatchesProfile(left, profile)) ||
            itemBrowsePriority(right, s.zone) - itemBrowsePriority(left, s.zone)
        ).slice(0, 4);
        const worldLocation = wikiLocationToWorld(n.loc);
        return `<article class="data-card npc-card npc-con-${con.key}" data-item-tooltip-source="${esc(intelIdentity(n))}">
            <div class="card-top">
                <div><h3>${waypointNameControl(n.name, worldLocation)}</h3><div class="sub">${esc(n.zone || 'Unknown zone')}</div></div>
                <span class="pill ${conClass(con.key)}">${esc(con.label)}</span>
            </div>
            <div class="pill-row" style="margin-top:9px">
                <span class="pill">${n.avgLevel ? `Level ${n.avgLevel}` : 'Level unknown'}</span>
                ${n.era && n.era !== 'Observed' ? `<span class="pill">${esc(n.era)}</span>` : ''}
                ${n.observed ? '<span class="pill">Observed locally</span>' : ''}
            </div>
            ${drops.length ? `<div class="known-drops"><span class="filter-label">Known drops</span>${drops.map(item => { const icon = itemIconSource(item); return `<a href="${wikiUrl(item.wikiTitle || item.name)}" target="_blank" rel="noopener" ${itemHoverAttrs(item)}>${icon ? `<img class="known-drop-icon" src="${esc(icon)}" alt="">` : '<span class="known-drop-icon item-icon-placeholder" aria-hidden="true">◇</span>'}<span class="known-drop-name">${esc(item.name)}</span></a>`; }).join('')}</div>` : ''}
            ${n.damageDone ? `<div class="sub" style="margin-top:9px">${formatNum(n.damageDone)} damage observed this session</div>` : ''}
            <div class="card-actions">
                <a class="mini-button" href="${wikiUrl(n.wikiTitle || n.name)}" target="_blank" rel="noopener">Open on Wiki</a>
                <button class="mini-button path-npc" data-npc="${esc(n.name)}">Path in map</button>
            </div>
        </article>`;
    }).join('') || '<div class="empty-state">No NPCs match the current filters.</div>';
    if (total > visible.length) {
        markup += `<div class="result-limit">Showing the first ${visible.length.toLocaleString()} of ${total.toLocaleString()} matches. Narrow the search to see more.</div>`;
    }
    const host = $('#npc-list');
    if (replaceItemList(host,markup)) {
        bindPathButtons(host); bindWaypointButtons(host);
    }
    refreshItemTooltip();
}

function renderItems(s, profile) {
    const query = $('#item-search')?.value.trim().toLowerCase() || '';
    const tier = Number(settings.itemTier) || 0;
    const selectedSlot = String($('#item-slot')?.value || settings.itemSlot || '').toUpperCase();
    const sortMode = $('#item-sort')?.value || settings.itemSort || 'recommended';
    const currentZoneOnly = Boolean($('#item-current-zone')?.checked && s.zone);
    let items = pack.items.filter(item => eraAllowed(item.era));
    if (query) items = items.filter(i => `${i.name} ${(i.classes||[]).join(' ')} ${(i.slots||[]).join(' ')} ${(i.dropSources||[]).map(d => `${d.name} ${d.zone||''}`).join(' ')}`.toLowerCase().includes(query));
    if (profile.classes.length) {
        items = items.filter(item => itemMatchesProfile(item, profile));
    }
    if (currentZoneOnly) items = items.filter(item => itemDropsInZone(item, s.zone));
    if (selectedSlot) items = items.filter(item => (item.slots || []).some(slot => String(slot).toUpperCase() === selectedSlot));
    const priorities = new Map(items.map(item => [item, itemBrowsePriority(item, s.zone)]));
    items.sort((a,b) => sortMode === 'name'
        ? String(a.name || '').localeCompare(String(b.name || ''))
        : priorities.get(b) - priorities.get(a) || String(a.name || '').localeCompare(String(b.name || ''))
    );
    const total = items.length;
    const visible = items.slice(0, 250);
    const classLabel = profile.classes.length ? profile.classes.join('/') : 'all classes';
    const scopeLabel = currentZoneOnly ? `in <strong>${esc(s.zone)}</strong>` : 'across all zones';
    const slotLabel = selectedSlot ? ` · <strong>${esc(selectedSlot)}</strong>` : '';
    const rankingLabel = sortMode === 'recommended' ? ' · useful gear and named drops first' : ' · sorted by name';
    $('#item-context').innerHTML = `${total.toLocaleString()} item${total === 1 ? '' : 's'} for <strong>${esc(classLabel)}</strong> ${scopeLabel} through <strong>${esc(settings.era)}</strong>${slotLabel}${query ? ` matching “${esc($('#item-search').value.trim())}”` : ''}${rankingLabel}.`;
    let markup = visible.map(item => {
        const stats = scaledItemStats(item, tier);
        const statHtml = Object.entries(stats).map(([key,val]) => `<div class="stat ${isItemStatModified(item?.stats?.[key],val,tier)?'is-scaled':''}"><span>${esc(key.replace(/_/g,' '))}</span><strong>${formatNum(val)}</strong></div>`).join('');
        return `<article class="data-card" data-item-tooltip-source="${esc(`item:${item.wikiTitle || item.name}`)}">
            <div class="card-top">
                <div class="item-card-heading">${itemIconHtml(item)}<div><h3 ${itemHoverAttrs(item)}>${esc(item.name)}</h3><div class="sub">${esc((item.slots||[]).join(' · ') || 'Unknown slot')}${tier ? ` · Tier ${tier}` : ''}</div></div></div>
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
    }).join('') || `<div class="empty-state item-empty-state">No matching items are known${currentZoneOnly ? ` in ${esc(s.zone)}` : ''}.${currentZoneOnly ? ' <button type="button" class="secondary-button" data-broaden-items>Show all zones</button>' : ''}</div>`;
    if (total > visible.length) {
        markup += `<div class="result-limit">Showing the first ${visible.length.toLocaleString()} of ${total.toLocaleString()} matches. Narrow the search to see more.</div>`;
    }
    const host = $('#item-list');
    if (replaceItemList(host,markup)) {
        bindPathButtons(host);
        host.querySelector('[data-broaden-items]')?.addEventListener('click', () => {
            itemZoneFilterExplicit = true;
            settings.itemCurrentZoneOnly = false;
            settings.itemZoneFilterExplicit = true;
            prefs.save(settings);
            $('#item-current-zone').checked = false;
            renderItems(state(), effectiveProfile(state()));
        });
    }
    refreshItemTooltip();
}

function buildClassChips() {
    for (const host of [$('#class-chips'), $('#settings-class-chips')]) {
        host.innerHTML = `<button class="chip" data-class-auto="1">Auto</button>${CLASSES.map(c => `<button class="chip" data-class="${c}">${c}</button>`).join('')}`;
        host.querySelector('[data-class-auto]').addEventListener('click', () => {
            settings.manualClasses = [];
            prefs.save(settings);
            updateClassChipState();
            renderAll();
        });
        host.querySelectorAll('.chip').forEach(btn => btn.addEventListener('click', () => {
            const c = btn.dataset.class;
            if (!c) return;
            settings.manualClasses = settings.manualClasses.includes(c)
                ? settings.manualClasses.filter(x => x !== c)
                : [...settings.manualClasses, c];
            prefs.save(settings);
            updateClassChipState();
            renderAll();
        }));
    }
    updateClassChipState();
}

function updateClassChipState() {
    const detected = new Set((state().classes || []).map(value => String(value).toUpperCase()));
    const automatic = !settings.manualClasses.length;
    $$('[data-class-auto]').forEach(button => {
        button.classList.toggle('is-active', automatic);
        button.title = automatic
            ? (detected.size ? `Using ${Array.from(detected).join('/')}` : 'Classes will be read from the active log')
            : 'Use the classes detected in the active log';
    });
    $$('[data-class]').forEach(button => {
        const selected = automatic ? detected.has(button.dataset.class) : settings.manualClasses.includes(button.dataset.class);
        button.classList.toggle('is-active', selected);
        button.classList.toggle('is-auto', automatic && selected);
    });
}

function buildEraSelect() {
    const select = $('#era-select');
    const available = ERAS.filter(era => (pack.items || []).some(item => item.era === era));
    const choices = available.length ? available : ['Classic'];
    // Later expansions with no catalog records appeared to be a broken filter.
    // Keep cumulative progression explicit and offer eras present in this pack.
    if (!choices.includes(settings.era)) {
        settings.era = choices.filter(era => ERAS.indexOf(era) <= currentEraIndex()).at(-1) || choices[0];
        prefs.save(settings);
    }
    select.innerHTML = choices.map(e => `<option value="${esc(e)}" ${e === settings.era ? 'selected' : ''}>${esc(e)}</option>`).join('');
}

function buildItemSlotSelect() {
    const select = $('#item-slot');
    if (!select) return;
    const slots = Array.from(new Set((pack.items || []).flatMap(item => item.slots || [])
        .map(slot => String(slot || '').trim().toUpperCase()).filter(Boolean))).sort();
    if (settings.itemSlot && !slots.includes(String(settings.itemSlot).toUpperCase())) settings.itemSlot = '';
    select.innerHTML = `<option value="">All slots</option>${slots.map(slot => `<option value="${esc(slot)}">${esc(slot)}</option>`).join('')}`;
    select.value = settings.itemSlot || '';
}

function mapDestinationNames(s = state()) {
    if (!s.zone) return [];
    const names = new Map();
    const add = value => {
        const name = String(value || '').trim();
        if (name && isNamedSource(name)) names.set(npcNameKey(name), name);
    };
    for (const npc of pack.npcs || []) {
        if (zoneKey(npc.zone) === zoneKey(s.zone)) add(npc.name);
    }
    for (const item of pack.items || []) {
        for (const source of item.dropSources || []) {
            if (zoneKey(source.zone) === zoneKey(s.zone)) add(source.name);
        }
    }
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b));
}

function routeDestinationInputs() {
    return [$('#map-destination')].filter(Boolean);
}

function preferredRouteDestinationInput() { return $('#map-destination'); }

function setRouteDestinationValue(value, source = null) {
    for (const input of routeDestinationInputs()) {
        if (input !== source) input.value = value;
    }
}

function renderMapRoutePlanner(s = state()) {
    const zoneIdentity = `${zoneKey(s.zone)}:${pack.meta?.version || ''}`;
    const list = $('#map-destinations');
    if (list && renderedDestinationZone !== zoneIdentity) {
        const names = mapDestinationNames(s);
        list.innerHTML = names.map(name => `<option value="${esc(name)}"></option>`).join('');
        renderedDestinationZone = zoneIdentity;
        renderedDestinationCount = names.length;
    }
    for (const destinationInput of routeDestinationInputs()) {
        destinationInput.disabled = !s.zone;
        if (activeRoute && document.activeElement !== destinationInput) destinationInput.value = activeRoute.name;
        destinationInput.placeholder = s.zone ? 'Named mob or map label' : 'Waiting for a zone';
    }
    $('#start-route').disabled = !s.zone;
    $('#clear-route').hidden = !activeRoute;
    const status = $('#route-status');
    if (!status) return;
    if (!activeRoute) {
        const count = renderedDestinationCount;
        status.className = 'route-status';
        status.textContent = s.zone
            ? `${count.toLocaleString()} named destination${count === 1 ? '' : 's'} available · route starts at your latest /loc.`
            : 'Waiting for a detected zone.';
        return;
    }
    status.className = `route-status is-${activeRoute.status || 'working'}`;
    status.textContent = activeRoute.message || `Path to ${activeRoute.name}`;
}

function applyRouteGuidance(guidance) {
    if (!activeRoute || !guidance?.active) return false;
    activeRoute.guidance = {
        active:true,
        cue:String(guidance.cue || ''),
        cueKind:String(guidance.cueKind || ''),
        remainingDistance:Number(guidance.remainingDistance) || 0,
        offRouteDistance:Number(guidance.offRouteDistance) || 0,
        distanceToTurn:Number.isFinite(Number(guidance.distanceToTurn)) ? Number(guidance.distanceToTurn) : null,
        turnDirection:String(guidance.turnDirection || '')
    };
    if (activeRoute.status === 'ready') {
        activeRoute.message = `${activeRoute.name} · ${routeDistanceLabel(activeRoute.guidance.remainingDistance)} units remaining · ${activeRoute.guidance.cue}.`;
    }
    renderMapRoutePlanner(state());
    return true;
}

function renderMapReadiness(s = state()) {
    const states = {
        folder:Boolean(bridgeInfo?.eqRootExists),
        log:Boolean(bridgeInfo?.logExists),
        zone:Boolean(s.zone && viewerZoneState.status === 'ready' && viewerZoneState.zone === zoneKey(s.zone)),
        location:Boolean(s.location)
    };
    let waitingFound = false;
    for (const name of ['folder', 'log', 'zone', 'location']) {
        const node = $(`[data-readiness="${name}"]`);
        if (!node) continue;
        node.className = waitingFound ? 'is-blocked' : states[name] ? 'is-ready' : 'is-waiting';
        if (name === 'folder') node.title = bridgeInfo?.eqRootPath || 'No EverQuest folder selected';
        if (name === 'log') node.title = bridgeInfo?.logPath || 'No active eqlog_*.txt';
        waitingFound ||= !states[name];
    }
    const primary = $('#sync-location');
    if (primary) {
        primary.textContent = !states.folder
            ? 'Choose folder'
            : !states.log
                ? 'Find active log'
                : !states.zone
                    ? s.zone ? 'Load current zone' : 'Waiting for zone'
                    : !states.location
                        ? 'How to place me'
                        : 'Center on last /loc';
    }
    const reload = $('#sync-zone');
    if (reload) reload.disabled = !s.zone;
}

function renderViewPanel(view, s, profile) {
    if (view === 'map') {
        renderMapLootPane(s,profile);
    } else if (view === 'overview') {
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
    }
}

function renderLiveLocation() {
    const s = state();
    const profile = effectiveProfile(s);
    renderHeader(s, profile);
    $('#map-subtitle').textContent = mapReadinessMessage(s);
    renderMapReadiness(s);
    renderMapRoutePlanner(s);
}

function renderAll() {
    const s = state();
    const profile = effectiveProfile(s);
    const activeView = $('.nav-button.is-active')?.dataset.view || 'overview';
    const itemQueryActive = Boolean($('#item-search')?.value.trim());
    $('#item-current-zone').checked = itemZoneFilterExplicit
        ? settings.itemCurrentZoneOnly !== false
        : !itemQueryActive;
    updateClassChipState();
    renderAppearanceSettings();
    renderHeader(s, profile);
    renderMetrics(s, profile);
    renderViewPanel(activeView, s, profile);
    $('#map-title').textContent = s.zone ? `${s.zone} · Zone Viewer` : 'Zone Viewer';
    $('#map-subtitle').textContent = mapReadinessMessage(s);
    $('#manual-level').value = settings.manualLevel || '';
    $('#item-tier').value = settings.itemTier || 0;
    $('#item-tier-value').textContent = settings.itemTier ? `Tier ${settings.itemTier}` : 'Base';
    $('#item-slot').value = settings.itemSlot || '';
    $('#item-sort').value = settings.itemSort || 'recommended';
    $('#encounter-gap').value = settings.encounterGapSeconds || 15;
    $('#settings-routing-enabled').checked = Boolean(settings.routingEnabled);
    if ($('#era-select').value !== settings.era) $('#era-select').value = settings.era;
    setActiveMapMode(settings.mapMode || 'first');
    renderMapReadiness(s);
    renderMapRoutePlanner(s);
    syncRareMobsToViewer(false);
}

function setView(view, options = {}) {
    if (!$(`[data-view-panel="${view}"]`)) view = 'overview';
    $$('.nav-button').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
    $$('[data-view-panel]').forEach(p => p.classList.toggle('is-active', p.dataset.viewPanel === view));
    document.body.classList.toggle('map-active', view === 'map');
    if (options.remember !== false) {
        settings.lastView = view;
        prefs.save(settings);
    }
    const s = state();
    renderViewPanel(view, s, effectiveProfile(s));
    renderMapReadiness(s);
    renderMapRoutePlanner(s);
    if (view === 'map' && options.sync !== false) setTimeout(() => syncZoneToViewer(false), 100);
}

function applyWindowSettings(windowState = {}) {
    const supported = typeof window.eyeOfZommWindow?.setSettings === 'function';
    $('#settings-minimize-to-tray').checked = Boolean(windowState.minimizeToTray);
    $('#settings-start-minimized').checked = Boolean(windowState.startMinimized);
    $('#settings-minimize-to-tray').disabled = !supported;
    $('#settings-start-minimized').disabled = !supported;
    $('#settings-window-status').textContent = !supported
        ? 'Window settings are available in the desktop app.'
        : windowState.trayAvailable
            ? 'Window size and position are saved. Restore from the taskbar or the tray menu.'
            : 'Window size and position are saved. If the tray is unavailable, minimize uses the taskbar.';
}

async function saveWindowSetting(key, enabled) {
    const controls = [$('#settings-minimize-to-tray'), $('#settings-start-minimized')];
    controls.forEach(control => { control.disabled = true; });
    try {
        const result = await window.eyeOfZommWindow.setSettings({ [key]:enabled });
        bridgeInfo ||= {};
        bridgeInfo.windowState = result;
        applyWindowSettings(result);
    } catch (error) {
        applyWindowSettings(bridgeInfo?.windowState || {});
        showNotice(`Unable to save window settings: ${error.message}`, { tone:'error' });
    }
}

function viewerApi() {
    const frame = $('#zone-viewer');
    return frame?.contentWindow?.eqlEyeOfZommViewer || null;
}

function updateViewerFolderStatus(status, detail = '') {
    viewerFolderStatus = status;
    const labels = {
        missing:'Folder needed',
        connecting:'Connecting files…',
        ready:'Game folder ready',
        error:'Folder unavailable',
        idle:'Checking folder…'
    };
    const label = detail || labels[status] || labels.idle;
    const badge = $('#map-source-status');
    if (badge) {
        badge.textContent = label;
        badge.title = bridgeInfo?.eqRootPath || 'No EverQuest folder selected';
        badge.className = `map-source-status ${status === 'ready' ? 'is-ready' : status === 'error' || status === 'missing' ? 'is-error' : 'is-waiting'}`;
    }
    const settingsStatus = $('#settings-map-status');
    if (settingsStatus) settingsStatus.textContent = label;
    renderMapReadiness(state());
}

function mapReadinessMessage(s = state()) {
    if (!bridgeInfo?.eqRootExists) return 'Choose your EverQuest folder to load maps and logs.';
    if (viewerFolderStatus === 'connecting' || viewerFolderStatus === 'idle') return 'Connecting to the Maps and game files in your selected folder…';
    if (viewerFolderStatus === 'error') return 'The selected folder is saved, but its map files could not be opened.';
    if (!bridgeInfo.logExists) return 'Game folder ready · waiting for an eqlog_*.txt file in Logs.';
    if (!s.zone) return 'Game folder and log ready · waiting for the next zone line.';
    if (viewerZoneState.zone !== zoneKey(s.zone) || viewerZoneState.status !== 'ready') {
        return viewerZoneState.zone === zoneKey(s.zone) && viewerZoneState.message
            ? viewerZoneState.message
            : `${s.zone} detected · waiting for its local map to load.`;
    }
    if (!s.location) return `${s.zone} ready · type /loc in game once to place yourself on the map.`;
    return formatWorldLocationForPlayer(s.location, 1);
}

function queueViewerSync(operation) {
    viewerSyncChain = viewerSyncChain.catch(() => false).then(operation);
    return viewerSyncChain;
}

function queueLatestLocationSync(location) {
    pendingViewerLocation = { ...location };
    if (latestLocationSync) return latestLocationSync;
    latestLocationSync = queueViewerSync(async () => {
        let result = false;
        while (pendingViewerLocation) {
            const newest = pendingViewerLocation;
            pendingViewerLocation = null;
            result = await syncLocationToViewer(false, newest);
            if (result) scheduleRouteRefresh(newest);
        }
        return result;
    }).finally(() => {
        latestLocationSync = null;
        if (pendingViewerLocation) queueLatestLocationSync(pendingViewerLocation);
    });
    return latestLocationSync;
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

async function ensureViewerFolderConnected(showFeedback = false, force = false) {
    if (!bridgeInfo?.eqRootExists) {
        updateViewerFolderStatus('missing');
        if (showFeedback) showSettingsNotice('Choose your EverQuest folder first.');
        return false;
    }

    const targetPath = String(bridgeInfo.eqRootPath || '');
    if (viewerFolderPromise) await viewerFolderPromise.catch(() => false);
    const apiObj = await waitForViewerApi();
    if (!apiObj) {
        updateViewerFolderStatus('error', 'Viewer unavailable');
        if (showFeedback) showNotice('The Zone Viewer did not finish loading. Reopen Live Map and try again.', { tone:'error' });
        return false;
    }
    if (!force && viewerFolderPath === targetPath && apiObj.status?.().directorySelected) {
        updateViewerFolderStatus('ready');
        return true;
    }

    updateViewerFolderStatus('connecting');
    viewerFolderPromise = (async () => {
        try {
            const result = await apiObj.useConfiguredFolder?.();
            const ready = result?.ok === true || (result == null && Boolean(apiObj.status?.().directorySelected));
            if (ready) {
                viewerFolderPath = targetPath;
                updateViewerFolderStatus('ready');
                return true;
            }
            const message = result?.reason === 'permission-required'
                ? 'Folder permission needed'
                : result?.reason === 'no-zone-archives'
                    ? 'No zone archives found'
                : 'Folder unavailable';
            updateViewerFolderStatus('error', message);
            if (showFeedback) showSettingsNotice('The folder is saved, but its game/map files could not be opened. Choose it again.', 'error');
            return false;
        } catch (error) {
            updateViewerFolderStatus('error');
            if (showFeedback) showSettingsNotice(`Unable to open the selected EverQuest folder: ${error.message}`, 'error');
            return false;
        }
    })();
    try {
        return await viewerFolderPromise;
    } finally {
        viewerFolderPromise = null;
    }
}

async function syncZoneToViewer(showFeedback = true) {
    const s = state();
    if (!s.zone) {
        if (showFeedback) showNotice('The folder and log are ready. Eye of Zomm is waiting for the next zone line.', { tone:'warning' });
        return false;
    }
    const request = { zone:zoneKey(s.zone), status:'loading', message:`Loading ${s.zone} from your local EverQuest files…` };
    viewerZoneState = request;
    const isCurrent = () => viewerZoneState === request && zoneKey(state().zone) === request.zone;
    const fail = message => {
        if (!isCurrent()) return false;
        Object.assign(request, { status:'error', message });
        $('#map-subtitle').textContent = message;
        renderMapReadiness();
        if (showFeedback) showNotice(message, { tone:'error' });
        return false;
    };
    renderMapReadiness(s);
    try {
        const apiObj = await waitForViewerApi();
        if (!isCurrent()) return false;
        if (!apiObj) return fail('The Zone Viewer did not finish loading. Reopen Live Map and try again.');
        const folderReady = await ensureViewerFolderConnected(showFeedback);
        if (!isCurrent()) return false;
        if (!folderReady) return fail('The current zone could not load because its local map files are unavailable.');
        $('#map-subtitle').textContent = request.message;
        const record = zoneRecord(s.zone);
        let result = await apiObj.loadZone(record?.viewerName || record?.name || s.zone);
        if (!isCurrent()) return false;
        if (result?.reason === 'select-eq-folder-first') {
            const reconnected = await ensureViewerFolderConnected(false, true);
            if (!isCurrent()) return false;
            if (reconnected) {
                result = await apiObj.loadZone(record?.viewerName || record?.name || s.zone);
                if (!isCurrent()) return false;
            }
        }
        if (!result?.ok) {
            const messages = {
                'select-eq-folder-first': bridgeInfo?.eqRootExists
                    ? 'Your folder is saved, but the Zone Viewer has not finished opening its game files. Check the Map files status in Settings.'
                    : 'Choose your EverQuest folder in Settings first.',
                'zone-not-found': `The Zone Viewer could not match ${s.zone} to a local zone archive.`,
                'load-failed': result.message || `The local files for ${s.zone} could not be loaded.`
            };
            return fail(messages[result?.reason] || 'The current zone could not be synchronized.');
        }
        renderedRareViewerKey = '';
        Object.assign(request, { status:'ready', message:'' });
        renderMapReadiness();
        syncRareMobsToViewer(true);
        $('#map-subtitle').textContent = `${s.zone} loaded · ${result.status || 'ready for location sync'}`;
        return true;
    } catch (error) {
        return fail(`Zone sync failed: ${error.message}`);
    }
}

async function syncLocationToViewer(showFeedback = true, requestedLocation = null) {
    const s = state();
    const location = requestedLocation || s.location;
    if (!location) {
        const message = !bridgeInfo?.eqRootExists
            ? 'Choose your EverQuest folder in Settings first.'
            : !bridgeInfo.logExists
                ? 'The game folder is ready, but no eqlog_*.txt file was found in its Logs folder.'
                : 'The folder and log are ready. Type /loc in EverQuest once, then Eye of Zomm will follow later /loc updates automatically.';
        $('#map-subtitle').textContent = message;
        if (showFeedback) showNotice(message, {
            tone:'warning',
            ...(!bridgeInfo?.eqRootExists ? {
                actionLabel:'Choose folder',
                onAction:() => chooseEqFolder().catch(error => showNotice(error.message, { tone:'error' }))
            } : {})
        });
        return false;
    }
    const apiObj = await waitForViewerApi();
    if (!apiObj) {
        if (showFeedback) showNotice('The Zone Viewer did not finish loading.', { tone:'error' });
        return false;
    }
    if (!apiObj.status()?.zone || viewerZoneState.status !== 'ready' || viewerZoneState.zone !== zoneKey(s.zone)) {
        const loaded = await syncZoneToViewer(showFeedback);
        if (!loaded) return false;
    }
    if (zoneKey(state().zone) !== zoneKey(s.zone)) return false;
    const result = apiObj.syncLocation(location, { mode:settings.mapMode || 'first', timestamp:Date.now() });
    if (!result?.ok) {
        const message = result?.message || 'The zone is not ready for location sync yet.';
        $('#map-subtitle').textContent = message;
        if (showFeedback) showNotice(message, { tone:'warning' });
        return false;
    }
    settings.mapMode = result.mode || settings.mapMode || 'first';
    setActiveMapMode(settings.mapMode || 'first');
    applyRouteGuidance(result.guidance);
    $('#map-subtitle').textContent = `Synced to ${formatWorldLocationForPlayer(location, 1)} in ${s.zone}.`;
    return true;
}

function setActiveMapMode(mode) {
    $$('[data-map-mode]').forEach(button => button.classList.toggle('is-active', button.dataset.mapMode === mode));
}

async function setMapMode(mode, showFeedback = true) {
    const apiObj = await waitForViewerApi();
    if (!apiObj) return false;
    if (!apiObj.status?.().zone || viewerZoneState.status !== 'ready' || viewerZoneState.zone !== zoneKey(state().zone)) {
        const loaded = await syncZoneToViewer(showFeedback);
        if (!loaded) return false;
    }
    const result = await apiObj.setView(mode);
    if (!result?.ok) {
        if (showFeedback) showNotice(result?.message || 'That map view is not available for this zone.', { tone:'warning' });
        return false;
    }
    settings.mapMode = result.mode || mode;
    prefs.save(settings);
    setActiveMapMode(settings.mapMode);
    return true;
}

function bindPathButtons(host = document) {
    host?.querySelectorAll?.('.path-npc').forEach(btn => {
        if (btn.dataset.eqlBound) return;
        btn.dataset.eqlBound = '1';
        btn.addEventListener('click', () => pathToNpc(btn.dataset.npc));
    });
}

function locationDistance(left, right) {
    if (!left || !right) return Infinity;
    return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y), Number(left.z) - Number(right.z));
}

function clearActiveRoute(options = {}) {
    clearTimeout(routeRefreshTimer);
    routeRefreshTimer = null;
    routeRequestSerial += 1;
    activeRoute = null;
    viewerApi()?.setActiveRareMob?.('');
    if (options.keepInput !== true) setRouteDestinationValue('');
    if (options.clearViewer !== false) viewerApi()?.clearPath?.();
    renderMapRoutePlanner(state());
}

function scheduleRouteRefresh(location) {
    if (!activeRoute || zoneKey(activeRoute.zone) !== zoneKey(state().zone)) return;
    if (activeRoute.status === 'working' || routeRefreshTimer) return;
    if (locationDistance(location, activeRoute.lastRoutedLocation) < ROUTE_REFRESH_DISTANCE) return;
    routeRefreshTimer = setTimeout(() => calculateActiveRoute({ automatic:true }), 280);
}

async function calculateActiveRoute(options = {}) {
    if (!activeRoute) return false;
    const route = activeRoute;
    const automatic = Boolean(options.automatic);
    const routeIdentity = `${zoneKey(activeRoute.zone)}|${npcNameKey(activeRoute.name)}`;
    const requestSerial = ++routeRequestSerial;
    const isCurrent = () => requestSerial === routeRequestSerial && activeRoute === route &&
        `${zoneKey(route.zone)}|${npcNameKey(route.name)}` === routeIdentity && zoneKey(state().zone) === zoneKey(route.zone);
    clearTimeout(routeRefreshTimer);
    routeRefreshTimer = null;
    const s = state();
    if (zoneKey(activeRoute.zone) !== zoneKey(s.zone)) {
        clearActiveRoute();
        return false;
    }
    if (!s.location) {
        activeRoute.status = 'waiting';
        activeRoute.message = `Destination saved · type /loc in EverQuest to start the path from your position.`;
        renderMapRoutePlanner(s);
        if (!automatic) showNotice('Destination saved. Type /loc in EverQuest once and the route will start automatically.', { tone:'warning' });
        return false;
    }

    activeRoute.status = 'working';
    activeRoute.message = automatic ? `Updating path to ${activeRoute.name} from your latest /loc…` : `Calculating path to ${activeRoute.name}…`;
    renderMapRoutePlanner(s);
    const apiObj = await waitForViewerApi();
    if (!isCurrent()) return false;
    const folderReady = apiObj && await ensureViewerFolderConnected(!automatic);
    if (!isCurrent()) return false;
    if (!apiObj || !folderReady) {
        if (isCurrent()) {
            activeRoute.status = 'error';
            activeRoute.message = 'Map files are not ready. Your destination is still saved.';
            renderMapRoutePlanner(state());
        }
        return false;
    }
    if (!automatic || !apiObj.status?.().zone) {
        const zoneReady = await syncZoneToViewer(!automatic);
        if (!isCurrent()) return false;
        if (!zoneReady) {
            activeRoute.status = 'error';
            activeRoute.message = 'The zone map is not ready. Your destination is still saved; another /loc will retry.';
            renderMapRoutePlanner(state());
            return false;
        }
    }
    const locationReady = await syncLocationToViewer(false, s.location);
    if (!isCurrent()) return false;
    if (!locationReady) {
        if (isCurrent()) {
            activeRoute.status = 'error';
            activeRoute.message = 'Your destination is saved, but the latest /loc could not be placed on this zone.';
            renderMapRoutePlanner(state());
        }
        return false;
    }

    const npc = npcRecordForName(activeRoute.name, activeRoute.zone, activeRoute.raidInstance);
    const worldLocation = wikiLocationToWorld(npc?.loc);
    const wikiLocation = worldLocation?.slice(0, Number(pack.meta?.schemaVersion) >= 3 ? 3 : 2) || null;
    apiObj.clearPath?.();
    const result = await apiObj.pathTo(activeRoute.name, wikiLocation);
    if (!isCurrent()) return false;

    activeRoute.lastRoutedLocation = { ...s.location };
    if (!result?.ok) {
        activeRoute.status = 'error';
        activeRoute.message = `No local map label or EQLWiki location was found for ${activeRoute.name}.`;
        if (!automatic) showNotice(activeRoute.message, {
            tone:'warning',
            actionLabel:'Open Wiki',
            onAction:() => openExternal(wikiUrl(npc?.wikiTitle || activeRoute?.name))
        });
    } else if (result.routed) {
        activeRoute.status = 'ready';
        activeRoute.source = result.source;
        activeRoute.message = `${result.label || activeRoute.name} · ${routeDistanceLabel(result.distance)} units remaining · following /loc.`;
        applyRouteGuidance(result.guidance);
    } else {
        const source = result.source === 'map-label' ? 'local map label' : 'EQLWiki location';
        activeRoute.status = 'marked';
        activeRoute.message = `${result.label || activeRoute.name} marked from ${source}; no collision-valid route was found.`;
        if (!automatic) showNotice(activeRoute.message, { tone:'warning' });
    }

    const desiredMode = settings.mapMode || 'first';
    if (desiredMode !== 'first') await apiObj.setView(desiredMode);
    if (!isCurrent()) return false;
    setActiveMapMode(desiredMode);
    renderMapRoutePlanner(state());
    scheduleRouteRefresh(state().location);
    return Boolean(result?.ok);
}

async function pathToNpc(name, options = {}) {
    name = String(name || '').trim();
    if (!name) {
        showNotice('Choose a named mob or enter a map label first.', { tone:'warning' });
        preferredRouteDestinationInput()?.focus();
        return false;
    }
    if (options.openMain !== false) setView('map', { sync:false });
    const s = state();
    if (!s.zone) {
        showNotice('A current zone must be detected before choosing a destination.', { tone:'warning' });
        return false;
    }
    activeRoute = {
        name,
        raidInstance:options.raidInstance,
        zone:s.zone,
        status:s.location ? 'working' : 'waiting',
        message:s.location ? `Preparing path to ${name}…` : `Destination saved · waiting for /loc.`
    };
    viewerApi()?.setActiveRareMob?.(name);
    setRouteDestinationValue(name);
    renderMapRoutePlanner(s);
    return calculateActiveRoute({ automatic:false });
}

function runWikiSearch() {
    const input = $('#wiki-search');
    const query = input?.value.trim() || '';
    if (!query) return;
    openExternal(wikiSearchUrl(query));
}

function exportDiagnostics() {
    const snapshot = buildDiagnosticSnapshot({
        version:bridgeInfo?.version,
        pack,
        parserState:state(),
        settings,
        bridgeInfo,
        viewerStatus:viewerApi()?.status?.(),
        activeRoute
    });
    const blob = new Blob([`${JSON.stringify(snapshot, null, 2)}\n`], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `eye-of-zomm-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice('Redacted diagnostics exported. Character names, log contents, and filesystem paths were excluded.', { tone:'success' });
}

async function applyLogSelection(info) {
    const previousRoot = String(bridgeInfo?.eqRootPath || '');
    bridgeInfo = info;
    whatsNew.refresh();
    logOffset = 0;
    partialLine = '';
    parser.character = '';
    parser.setCharacterFromFilename(info.logPath || '');
    $('#settings-eq-root').textContent = info.eqRootPath || 'No folder selected';
    $('#settings-log-path').textContent = info.logPath || 'No log selected';
    $('#settings-log-mode').textContent = info.logSelection === 'manual' ? 'Specific file' : 'Newest log automatically';
    $('#app-version').textContent = info.version || bridgeInfo?.version || 'unknown';
    $('#titlebar-version').textContent = `v${info.version || bridgeInfo?.version || 'unknown'}`;
    $('#automatic-log').hidden = info.logSelection !== 'manual';
    $('#setup-overlay').hidden = Boolean(info.eqRootExists);
    if (previousRoot !== String(info.eqRootPath || '')) { viewerFolderPath = ''; mapDataLoader.invalidate(); mapDataRevision++; }
    if (info.eqRootExists) await ensureViewerFolderConnected(false, previousRoot !== String(info.eqRootPath || ''));
    else updateViewerFolderStatus('missing');
    renderAll();
}

async function chooseEqFolder() {
    const previousRoot = String(bridgeInfo?.eqRootPath || '');
    const info = await mutate('/api/select-eq-root');
    await applyLogSelection(info);
    if (info.eqRootExists) {
        if (String(info.eqRootPath || '') !== previousRoot) {
            const logName = String(info.logPath || '').split(/[\\/]/).pop();
            showNotice(logName
                ? `Folder saved. Following ${logName}. Type /loc in EverQuest once to place yourself.`
                : 'Folder saved. Waiting for the newest eqlog_*.txt in its Logs folder.', { tone:'success', duration:8000 });
        }
        queueViewerSync(async () => {
            const s = state();
            if (s.zone) await syncZoneToViewer(false);
            if (s.location) return syncLocationToViewer(false);
            return true;
        });
    }
}

async function handleMapPrimaryAction() {
    const s = state();
    if (!bridgeInfo?.eqRootExists) return chooseEqFolder();
    if (!bridgeInfo?.logExists) {
        showSettingsNotice(`The folder is ready, but no eqlog_*.txt was found under ${bridgeInfo.eqRootPath}\\Logs.`);
        return false;
    }
    if (!s.zone) {
        showNotice('The folder and log are ready. Enter or zone in EverQuest; the map will load automatically.', { tone:'warning' });
        return false;
    }
    if (viewerZoneState.status !== 'ready' || viewerZoneState.zone !== zoneKey(s.zone)) {
        return syncZoneToViewer(true);
    }
    if (!s.location) {
        showNotice('Type /loc in EverQuest once. Eye of Zomm will center automatically and follow later /loc updates.', { tone:'warning', duration:8000 });
        return false;
    }
    return syncLocationToViewer(true);
}

function wireUi() {
    $('#zone-viewer').addEventListener('load',syncViewerAppearance);
    syncViewerAppearance();
    $('#settings-font-family').innerHTML = FONT_PRESETS.map(font => `<option value="${font.id}">${esc(font.label)}</option>`).join('')+'<option value="local">Installed font…</option>';
    renderAppearanceSettings();
    $('#settings-font-family').addEventListener('change',event => { if(event.target.value!=='local')void saveAppearance({...settings.appearance,fontFamily:event.target.value}); });
    systemFontSettings = mountSystemFontSettings({document,getAppearance:()=>settings.appearance,saveAppearance});
    $('#settings-font-size').addEventListener('input',event => {
        appearanceGeneration++; appearanceDraft = true;
        settings.appearance = normalizeAppearance({...settings.appearance,fontSize:Number(event.target.value)});
        applyAppearance(document,settings.appearance); renderAppearanceSettings(); syncViewerAppearance(); refreshItemTooltip();
    });
    $('#settings-font-size').addEventListener('change',() => { void saveAppearance(settings.appearance); });
    $('#reset-appearance').addEventListener('click',() => { void saveAppearance(DEFAULT_APPEARANCE); });
    $$('.nav-button').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
    $$('[data-go-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.goView)));
    $('#npc-search').addEventListener('input', () => { const s = state(); renderNpcList(s, effectiveProfile(s)); });
    $('#npc-current-zone').addEventListener('change', () => { const s = state(); renderNpcList(s, effectiveProfile(s)); });
    $('#item-search').addEventListener('input', () => {
        if (!itemZoneFilterExplicit) $('#item-current-zone').checked = !$('#item-search').value.trim();
        const s = state();
        renderItems(s, effectiveProfile(s));
    });
    $('#item-current-zone').addEventListener('change', event => {
        itemZoneFilterExplicit = true;
        settings.itemCurrentZoneOnly = Boolean(event.target.checked);
        settings.itemZoneFilterExplicit = true;
        prefs.save(settings);
        const s = state();
        renderItems(s, effectiveProfile(s));
    });
    $('#item-tier').addEventListener('input', e => {
        settings.itemTier = Number(e.target.value) || 0;
        prefs.save(settings);
        $('#item-tier-value').textContent = settings.itemTier ? `Tier ${settings.itemTier}` : 'Base';
        const s = state();
        renderItems(s, effectiveProfile(s));
        refreshItemTooltip();
    });
    $('#item-slot').addEventListener('change', e => {
        settings.itemSlot = e.target.value;
        prefs.save(settings);
        const s = state();
        renderItems(s, effectiveProfile(s));
    });
    $('#item-sort').addEventListener('change', e => {
        settings.itemSort = e.target.value;
        prefs.save(settings);
        const s = state();
        renderItems(s, effectiveProfile(s));
    });
    $('#reset-item-filters').addEventListener('click', () => {
        $('#item-search').value = '';
        itemZoneFilterExplicit = false;
        settings.itemCurrentZoneOnly = true;
        settings.itemZoneFilterExplicit = false;
        settings.itemSlot = '';
        settings.itemSort = 'recommended';
        $('#item-current-zone').checked = true;
        $('#item-slot').value = '';
        $('#item-sort').value = 'recommended';
        prefs.save(settings);
        const s = state();
        renderItems(s, effectiveProfile(s));
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
    $('#new-session').addEventListener('click', startNewSession);
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
            showNotice(`Unable to change log: ${error.message}`, { tone:'error' });
        }
    });
    $('#automatic-log').addEventListener('click', async () => {
        try {
            await applyLogSelection(await mutate('/api/log/automatic'));
            showNotice('Automatic log selection is on. Eye of Zomm will follow the newest eqlog_*.txt.', { tone:'success' });
        } catch (error) {
            showNotice(`Unable to select the newest log: ${error.message}`, { tone:'error' });
        }
    });
    $('#change-eq-folder').addEventListener('click', () => chooseEqFolder().catch(error => showNotice(`Unable to change folder: ${error.message}`, { tone:'error' })));
    $('#setup-choose-folder').addEventListener('click', () => chooseEqFolder().catch(error => showNotice(`Unable to choose folder: ${error.message}`, { tone:'error' })));
    $('#update-pack').addEventListener('click', async () => {
        const button = $('#update-pack');
        button.disabled = true;
        $('#pack-update-status').textContent = 'checking…';
        try {
            const result = await mutate('/api/update-pack?force=1');
            if (result.dataPack) {
                bridgeInfo = { ...(bridgeInfo || {}), dataPack:result.dataPack, productionPack:result.productionPack };
                renderPackSyncStatus(result.dataPack);
            }
            $('#pack-update-status').textContent = result.status || (result.ok ? 'current' : 'unavailable');
            if (result.productionPack) await loadPack();
            if (!result.ok && result.error) {
                showNotice(`Using the last valid dataset. Update unavailable: ${result.error}`, { tone:'warning' });
            } else {
                showNotice('EQLWiki dataset is current.', { tone:'success' });
            }
        } catch (error) {
            $('#pack-update-status').textContent = 'unavailable';
            showNotice(`Using the last valid dataset. Unable to sync: ${error.message}`, { tone:'error' });
        } finally {
            button.disabled = false;
        }
    });
    $('#settings-routing-enabled').addEventListener('change', event => { settings.routingEnabled = event.target.checked; prefs.save(settings); renderAll(); });
    $('#export-diagnostics').addEventListener('click', exportDiagnostics);
    $('#wiki-search-form').addEventListener('submit', e => { e.preventDefault(); runWikiSearch(); });
    $('#wiki-search-button').addEventListener('click', runWikiSearch);
    $('#settings-minimize-to-tray').addEventListener('change', event => { void saveWindowSetting('minimizeToTray', event.target.checked); });
    $('#settings-start-minimized').addEventListener('change', event => { void saveWindowSetting('startMinimized', event.target.checked); });
    document.addEventListener('pointerover', event => {
        const target = event.target.closest?.('[data-item-title]');
        if (target) showItemTooltip(target, event);
    });
    document.addEventListener('pointermove', event => {
        const target = event.target.closest?.('[data-item-title]');
        if (target && (activeTooltipTarget !== target || !activeTooltipItem)) showItemTooltip(target,event);
        if (activeTooltipItem && activeTooltipMode === 'pointer') lastTooltipPointer = { clientX:event.clientX, clientY:event.clientY };
        positionTooltip(event);
    });
    document.addEventListener('pointerout', event => {
        const target = event.target.closest?.('[data-item-title]');
        if (target && !target.contains(event.relatedTarget) && document.activeElement !== target) hideItemTooltip();
    });
    document.addEventListener('focusin', event => {
        const target = event.target.closest?.('[data-item-title]');
        if (target) showItemTooltip(target);
    });
    document.addEventListener('focusout', event => {
        const target = event.target.closest?.('[data-item-title]');
        if (target && !target.contains(event.relatedTarget)) hideItemTooltip();
    });
    document.addEventListener('keydown', event => {
        const editing = /^(?:INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName || '');
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            const input = $('#wiki-search');
            input?.focus();
            input?.select();
        } else if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const input = $('#wiki-search');
            input?.focus();
        } else if (event.key === 'Escape') {
            hideItemTooltip();
        }
    });
    $$('[data-map-mode]').forEach(button => button.addEventListener('click', () => setMapMode(button.dataset.mapMode, true)));
    $('#sync-zone').addEventListener('click', () => { mapDataLoader.invalidate(); mapDataRevision++; void overlaySession.publish(); void syncZoneToViewer(true); });
    $('#sync-location').addEventListener('click', () => handleMapPrimaryAction().catch(error => showNotice(error.message, { tone:'error' })));
    $('#start-route').addEventListener('click', () => pathToNpc($('#map-destination').value));
    for (const input of routeDestinationInputs()) {
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                pathToNpc(event.currentTarget.value);
            }
        });
        input.addEventListener('input', event => {
            setRouteDestinationValue(event.currentTarget.value, event.currentTarget);
            if (activeRoute && npcNameKey(event.currentTarget.value) !== npcNameKey(activeRoute.name)) clearActiveRoute({ keepInput:true });
        });
    }
    $('#clear-route').addEventListener('click', () => clearActiveRoute());

    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || event.source !== $('#zone-viewer')?.contentWindow) return;
        if (event.data?.type === 'eoz-viewer-ready') {
            viewerReady = true;
            queueViewerSync(async () => {
                const connected = await ensureViewerFolderConnected(false);
                if (!connected) return false;
                const s = state();
                if (s.zone) await syncZoneToViewer(false);
                if (s.location) return syncLocationToViewer(false);
                return true;
            });
        } else if (event.data?.type === 'eoz-rare-mob-selected' && event.data.name) {
            selectMapLoot(event.data.name,event.data.raidInstance);
        } else if (event.data?.type === 'eoz-route-candidate-ready' && event.data.name) {
            if (!activeRoute || npcNameKey(event.data.name) !== npcNameKey(activeRoute.name) ||
                zoneKey(activeRoute.zone) !== zoneKey(state().zone)) return;
            const distance = Number(event.data.distance);
            activeRoute.status = 'ready';
            activeRoute.source = 'collision-navmesh';
            activeRoute.message = `${event.data.name} · ${routeDistanceLabel(distance)} units remaining · following /loc.`;
            applyRouteGuidance(event.data.guidance);
            renderMapRoutePlanner(state());
            scheduleRouteRefresh(state().location);
        } else if (event.data?.type === 'eoz-route-cancelled') {
            clearActiveRoute({ clearViewer:false });
        }
    });
}

buildClassChips();
wireUi();
const overlaySession = createOverlaySession({ api:window.eyeOfZommOverlays, getSession:overlaySessionSnapshot,
    onCommand:handleOverlayCommand, onCues:cues => timerAlerts.play(cues), notify:message => showNotice(message, { tone:'warning' }) });
const timerAlerts = createTimerAlerts();
const wikiDiscovery = createWikiDiscovery({getPack:()=>pack,
    onMissing:entry=>window.eyeOfZommDiscovery?.show(entry) || Promise.reject(new Error('The desktop discovery prompt is unavailable.')),
    onWarning:message=>showNotice(message,{tone:'warning'})});
window.eyeOfZommDiscovery?.onAction?.(({action,id})=>{if(action==='ignore')wikiDiscovery.ignore(id);else wikiDiscovery.dismiss(id);void overlaySession.publish();});
window.eyeOfZommOverlays?.onState?.(next => {
    if (next.appearance && !appearancePending && !appearanceDraft) acceptAppearance(next.appearance);
    nativeMapVisible = Boolean(next.panels?.map?.visible);
    const useNative = Boolean(next.panels?.timers?.visible && !next.panels.timers.passThrough);
    if (discoveryInNative !== useNative) { discoveryInNative=useNative; void overlaySession.publish(); }
});
const initialAppearanceGeneration = appearanceGeneration;
Promise.resolve(window.eyeOfZommOverlays?.getState?.()).then(next => {
    if (next?.appearance && appearanceGeneration === initialAppearanceGeneration) acceptAppearance(next.appearance);
}).catch(() => {});
const overlayController = mountOverlayController({ root:document.getElementById('overlay-controller'), api:window.eyeOfZommOverlays });
const timerSettings = mountTimerSettings({ root:document.getElementById('timer-settings'), session:overlaySession });
const discoveryNotices = mountWikiDiscoveryNotices({root:document.getElementById('wiki-discovery-notices'),action:(action,value)=>window.eyeOfZommDiscovery.action(action,value)});
overlaySession.onTimers(()=>discoveryNotices.render(discoveryInNative ? [] : wikiDiscovery.snapshot().pending));
$('#open-native-overlays').addEventListener('click', async () => {
    try { await window.eyeOfZommOverlays.control('show-all'); }
    catch { showNotice('Native overlays require the Eye of Zomm desktop app.', { tone:'warning' }); }
});
const appUpdatesUi = mountAppUpdates({
    openSettings:async () => {
        setView('settings');
        document.getElementById('check-app-update').focus();
    }
});
const whatsNew = mountWhatsNew({ button:$('#open-whats-new'), navigate:view => setView(view),getVersion:()=>bridgeInfo?.version });
window.addEventListener('pagehide', () => { whatsNew.dispose(); appUpdatesUi.dispose(); timerSettings.dispose(); discoveryNotices.dispose(); overlaySession.dispose(); overlayController.dispose(); timerAlerts.dispose(); }, { once:true });
setView(settings.lastView || 'overview', { remember:false });
loadPack();
connectBridge();
renderAll();
