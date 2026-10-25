'use strict';

const electron = require('electron');
const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = electron;
const { configureLinuxRuntime } = require('./linux-runtime.cjs');
configureLinuxRuntime(app, { platform:process.platform, env:process.env });
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { URL } = require('node:url');
const { AppUpdater, isReleaseNotesUrl, launchSilentNsisInstaller } = require('./app-updater.cjs');
const { OverlayHost } = require('./overlay-host.cjs');
const { safeMapFile } = require('./overlay-map-policy.cjs');
const { DiscoveryHost } = require('./discovery-host.cjs');
const { CaptureHost } = require('./capture-host.cjs');
const { AutomaticLogReader } = require('./automatic-log-reader.cjs');
const { AutomaticLootSources } = require('./automatic-loot-sources.cjs');
const { WikiHost } = require('./wiki-host.cjs');
const { DropObservationHost } = require('./drop-observation-host.cjs');
const { IconFinderHost } = require('./icon-finder-host.cjs');
const { RendererDrain } = require('./renderer-drain.cjs');
const { ShareHost } = require('./share-host.cjs');
const { CharacterStorage } = require('./character-storage.cjs');
const { InventoryFileHost } = require('./inventory-file-host.cjs');
const { installLocalFontPermissions } = require('./font-permissions.cjs');
const { normalizeWindowPlacement, WindowPlacement } = require('./window-placement.cjs');
const {
    inferEqRootPath,
    isEqLogName,
    isPathInside,
    resolveConfiguredLog
} = require('./log-selection.cjs');

const APP_VERSION = app.getVersion();
const HOST = '127.0.0.1';
const DEFAULT_PORT = 53147;
const INITIAL_TAIL_BYTES = 512 * 1024;
const MAX_READ_BYTES = 2 * 1024 * 1024;
const PACK_MANIFEST_URL = 'https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json';
const PACK_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const MAX_PACK_MANIFEST_BYTES = 64 * 1024;
const MAX_PACK_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const MAX_PACK_JSON_BYTES = 512 * 1024 * 1024;
const MAX_API_REQUEST_BYTES = 64 * 1024;
const MAX_EQ_FILE_BYTES = 128 * 1024 * 1024;
const MAX_EQ_FILE_COUNT = 50000;
const SUPPORTED_EQ_EXTENSIONS = new Set(['.s3d', '.eqg', '.txt', '.eff', '.xmi', '.emt', '.zon']);

let server = null;
let windowRef = null;
let port = DEFAULT_PORT;
let appUpdater = null;
let overlayHost = null;
let discoveryHost = null;
let captureHost = null;
let automaticLogReader = null;
let automaticLootSources = null;
let automaticCatalog = null;
let automaticCatalogKey = '';
let wikiHost = null;
let observationHost = null;
let iconFinderHost = null;
let rendererDrain = null;
let reloading = false;
let shareHost = null;
let characterStorage = null;
let inventoryFileHost = null;
let quitting = false;
let sessionNeedsReload = false;
let windowPlacement = null;
let pendingInitialMaximize = false;
let desktopSettings = { minimizeToTray:false, startMinimized:false };
let configWriteQueue = Promise.resolve();
let quitFlush = null;
let quitReady = false;
let dataPackSyncPromise = null;
let dataPackRefreshTimer = null;
let dataPackRefreshEnabled = false;
let dataPackCheckStartedUtc = '';
let nextDataPackCheckUtc = '';

function getAppUpdater() {
    if (!appUpdater) appUpdater = new AppUpdater({
        version:APP_VERSION,
        cacheDirectory:path.join(userDataDir(), 'app-updates'),
        isPackaged:app.isPackaged,
        linuxPackage:process.env.APPIMAGE ? 'AppImage' : 'deb',
        launchInstaller:target => process.platform === 'linux' ? shell.openPath(path.dirname(target))
            : launchSilentNsisInstaller(target, { installDirectory:path.dirname(process.execPath) }),
        onInstallerLaunched:() => app.quit()
    });
    return appUpdater;
}

function rootDir() {
    return path.join(__dirname, '..');
}

function appRoot() {
    return path.join(rootDir(), 'app');
}

function userDataDir() {
    return app.getPath('userData');
}

function configPath() {
    return path.join(userDataDir(), 'eye-of-zomm-config.json');
}

function packStatePath() {
    return path.join(userDataDir(), 'eye-of-zomm-pack-state.json');
}

function overlayPreferencesPath() {
    return path.join(userDataDir(), 'eye-of-zomm-overlays.json');
}

function windowPlacementPath() { return path.join(userDataDir(),'eye-of-zomm-window.json'); }

function windowSettings(config = desktopSettings) {
    return { minimizeToTray:config.minimizeToTray === true, startMinimized:config.startMinimized === true,
        trayAvailable:Boolean(overlayHost?.tray) };
}

function showMainWindow(focus = true) {
    if (!windowRef || windowRef.isDestroyed()) return;
    if (sessionNeedsReload) {
        sessionNeedsReload = false;
        overlayHost?.noteSessionRestart();
        // Recovery is explicit through Open Eye of Zomm, the tray, or the
        // recovery shortcut. Reload only the app-owned root, never a frame URL.
        // Active timers restore from their saved deadlines; parse history is
        // reconstructed from the available log tail by the new session owner.
        void windowRef.loadURL(`http://${HOST}:${port}/`).catch(() => {
            sessionNeedsReload = true;
            overlayHost?.markSessionUnavailable();
        });
    }
    if (windowRef.isMinimized()) windowRef.restore();
    windowPlacement?.restoreBounds();
    if (pendingInitialMaximize) { pendingInitialMaximize=false;windowRef.maximize(); }
    windowRef.show();
    if (focus) windowRef.focus();
}

async function reloadMainWindow(url=`http://${HOST}:${port}/`) {
    if(reloading||quitting||!windowRef||windowRef.isDestroyed())return;
    reloading=true;
    try{
        if(rendererDrain && !await rendererDrain.drain()){rendererDrain.resume();dialog.showErrorBox('Eye of Zomm could not save pending observations','The current page has been kept open. Check available disk space, then try again.');return;}
        await windowRef.loadURL(url);
    }catch{sessionNeedsReload=true;overlayHost?.markSessionUnavailable();}
    finally{reloading=false;}
}

function productionPackPath() {
    return path.join(userDataDir(), 'data', 'eye-of-zomm-pack.json');
}

function bundledBootstrapPath() {
    return path.join(appRoot(), 'data', 'eye-of-zomm-pack.bootstrap.json');
}

async function ensureUserDirs() {
    await fsp.mkdir(path.dirname(productionPackPath()), { recursive: true });
}

async function readJson(filePath, fallback) {
    try {
        return JSON.parse(await fsp.readFile(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

async function atomicWriteJson(filePath, value) {
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
    await fsp.rename(tmp, filePath);
}

async function readConfig() {
    const raw=await readJson(configPath(),{});
    const saved=raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const { alwaysOnTop:_retiredPin, ...current }=saved;
    return {
        eqRootPath: '',
        logPath: '',
        logSelection: 'automatic',
        ...current,
        minimizeToTray:saved.minimizeToTray === true,
        startMinimized:saved.startMinimized === true
    };
}

function updateConfig(values) {
    const operation=configWriteQueue.catch(()=>{}).then(async()=>{
        const config=await readConfig(), next={...config,...values};
        if(['eqRootPath','logPath','logSelection'].some(key=>Object.hasOwn(values,key)&&config[key]!==next[key]))automaticLogReader?.reset();
        delete next.alwaysOnTop;
        await atomicWriteJson(configPath(),next);
        desktopSettings=windowSettings(next);
        return next;
    });
    configWriteQueue=operation;
    return operation;
}

async function resolveLogPath() {
    return resolveConfiguredLog(await readConfig());
}

async function selectEqRoot({ firstRun = false } = {}) {
    const config = await readConfig();
    const knownRoot = String(config.eqRootPath || inferEqRootPath(config.logPath));
    const standardLegendsRoot = process.platform === 'win32' && fs.existsSync('C:\\EverQuest Legends')
        ? 'C:\\EverQuest Legends'
        : '';
    const result = await dialog.showOpenDialog(windowRef || undefined, {
        title: firstRun ? 'Choose your EverQuest Legends folder' : 'Change EverQuest Legends folder',
        message: 'Choose the folder that contains Logs, Maps, and the EverQuest game files.',
        buttonLabel: 'Use this folder',
        defaultPath: knownRoot || standardLegendsRoot || undefined,
        properties: ['openDirectory', 'dontAddToRecent']
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true, config };
    const eqRootPath = path.resolve(inferEqRootPath(result.filePaths[0]));
    const next = await updateConfig({ eqRootPath, logPath: '', logSelection: 'automatic' });
    return { canceled: false, config: next, logPath: await resolveConfiguredLog(next) };
}

async function selectLogFile() {
    const config = await readConfig();
    const current = await resolveConfiguredLog(config);
    const result = await dialog.showOpenDialog(windowRef || undefined, {
        title: 'Choose a specific EverQuest log',
        buttonLabel: 'Use this log',
        defaultPath: current ? path.dirname(current) : (config.eqRootPath || undefined),
        properties: ['openFile', 'dontAddToRecent'],
        filters: [{ name: 'EverQuest logs', extensions: ['txt'] }]
    });
    if (result.canceled || !result.filePaths[0]) return '';
    const logPath = path.resolve(result.filePaths[0]);
    if (!isEqLogName(path.basename(logPath))) {
        await dialog.showMessageBox(windowRef || undefined, {
            type: 'warning',
            title: 'Not an EverQuest log',
            message: 'Choose a file named eqlog_*.txt.'
        });
        return '';
    }
    await updateConfig({
        eqRootPath: inferEqRootPath(logPath),
        logPath,
        logSelection: 'manual'
    });
    return logPath;
}

async function useAutomaticLogSelection() {
    const config = await updateConfig({ logPath: '', logSelection: 'automatic' });
    return resolveConfiguredLog(config);
}

async function readPackState() {
    return readJson(packStatePath(), {
        lastCheckUtc: '',
        lastSuccessUtc: '',
        lastUpdatedUtc: '',
        generatedAtUtc: '',
        version: '',
        lastStatus: 'never',
        lastError: ''
    });
}

async function savePackState(state) {
    await atomicWriteJson(packStatePath(), state);
}

async function fetchWithTimeout(url, timeoutMs, readResponse) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'User-Agent': `EQLWiki-EyeOfZomm/${APP_VERSION}`,
                'Cache-Control': 'no-cache'
            }
        });
        // fetch resolves when headers arrive; keep the deadline active until
        // the caller has consumed the response body as well.
        return await readResponse(response);
    } finally {
        clearTimeout(timer);
    }
}

async function readResponseBytes(response, maxBytes) {
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxBytes) {
        void response.body?.cancel().catch(() => {});
        throw new Error('Eye of Zomm data download is unexpectedly large.');
    }
    if (!response.body) return Buffer.alloc(0);

    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
                void reader.cancel().catch(() => {});
                throw new Error('Eye of Zomm data download exceeded the size limit.');
            }
            chunks.push(Buffer.from(value));
        }
        return Buffer.concat(chunks, size);
    } finally {
        reader.releaseLock();
    }
}

function validatePack(pack) {
    return Boolean(
        pack &&
        Number(pack.meta?.schemaVersion) >= 3 &&
        Array.isArray(pack.zones) &&
        Array.isArray(pack.npcs) &&
        Array.isArray(pack.items)
    );
}

function dataPackRefreshState(state = {}) {
    return { ...state, lastCheckUtc:dataPackCheckStartedUtc || state.lastCheckUtc || '',
        checking:Boolean(dataPackSyncPromise), nextCheckUtc:nextDataPackCheckUtc,
        refreshIntervalMs:PACK_REFRESH_INTERVAL_MS };
}

function scheduleDataPackRefresh() {
    clearTimeout(dataPackRefreshTimer);
    dataPackRefreshTimer = null;
    nextDataPackCheckUtc = '';
    if (!dataPackRefreshEnabled || quitting) return;
    nextDataPackCheckUtc = new Date(Date.now() + PACK_REFRESH_INTERVAL_MS).toISOString();
    dataPackRefreshTimer = setTimeout(() => {
        dataPackRefreshTimer = null;
        nextDataPackCheckUtc = '';
        void updateStaticDataPack(false).catch(error => console.warn('[Eye of Zomm] data sync:', error));
    }, PACK_REFRESH_INTERVAL_MS);
    dataPackRefreshTimer.unref?.();
}

function startDataPackRefresh() {
    if (dataPackRefreshEnabled) return dataPackSyncPromise || Promise.resolve();
    dataPackRefreshEnabled = true;
    return updateStaticDataPack(false);
}

function stopDataPackRefresh() {
    dataPackRefreshEnabled = false;
    clearTimeout(dataPackRefreshTimer);
    dataPackRefreshTimer = null;
    nextDataPackCheckUtc = '';
}

function updateStaticDataPack(force = false) {
    // Startup, hourly and manual requests share the same transfer and atomic
    // commit. A click during a running check joins it rather than queueing a
    // second download or overwriting its state with an older result.
    if (dataPackSyncPromise) return dataPackSyncPromise;
    clearTimeout(dataPackRefreshTimer);
    dataPackRefreshTimer = null;
    nextDataPackCheckUtc = '';
    dataPackCheckStartedUtc = new Date().toISOString();
    dataPackSyncPromise = performStaticDataPackUpdate(force).then(result => {
        dataPackSyncPromise = null;
        scheduleDataPackRefresh();
        return { ...result, dataPack:dataPackRefreshState(result.dataPack) };
    }, error => {
        dataPackSyncPromise = null;
        scheduleDataPackRefresh();
        throw error;
    });
    return dataPackSyncPromise;
}

async function performStaticDataPackUpdate(force = false) {
    await ensureUserDirs();
    const state = await readPackState();
    const now = new Date();

    state.lastCheckUtc = now.toISOString();

    try {
        const manifest = await fetchWithTimeout(PACK_MANIFEST_URL, 8000, async response => {
            if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
            const bytes = await readResponseBytes(response, MAX_PACK_MANIFEST_BYTES);
            return JSON.parse(bytes.toString('utf8'));
        });

        if (!manifest?.version || !manifest?.pack) {
            throw new Error('Eye of Zomm dataset manifest is missing version or pack.');
        }
        const packName = String(manifest.pack);
        if (!/^[A-Za-z0-9._-]+\.json\.gz$/.test(packName)) {
            throw new Error('Eye of Zomm dataset manifest contains an invalid pack filename.');
        }
        if (!/^[a-f0-9]{64}$/i.test(String(manifest.sha256 || ''))) {
            throw new Error('Eye of Zomm dataset manifest is missing a valid SHA-256 checksum.');
        }

        if (!fs.existsSync(productionPackPath()) && fs.existsSync(bundledBootstrapPath())) {
            const bundled = await readJson(bundledBootstrapPath(), null);
            if (validatePack(bundled) && String(bundled.meta?.manifestVersion || '') === String(manifest.version)) {
                state.version = String(manifest.version);
                state.lastStatus = 'bundled-current';
                state.lastError = '';
                state.lastSuccessUtc = new Date().toISOString();
                state.generatedAtUtc = String(bundled.meta?.generatedAt || '');
                await savePackState(state);
                return { ok: true, skipped: true, status: 'bundled-current', version: state.version, productionPack: false, bundledPack: true, dataPack:state };
            }
        }

        if (
            String(state.version || '') === String(manifest.version) &&
            fs.existsSync(productionPackPath())
        ) {
            const cached = await readJson(productionPackPath(), null);
            if (validatePack(cached) && String(cached.meta?.manifestVersion || '') === String(manifest.version)) {
                state.lastStatus = 'current';
                state.lastError = '';
                state.lastSuccessUtc = new Date().toISOString();
                state.generatedAtUtc = String(cached.meta?.generatedAt || '');
                await savePackState(state);
                return { ok: true, skipped: true, status: 'current', version: state.version, productionPack: true, dataPack:state };
            }
        }

        const packUrl = new URL(packName, PACK_MANIFEST_URL).toString();
        const compressed = await fetchWithTimeout(packUrl, 45000, async response => {
            if (!response.ok) throw new Error(`Pack HTTP ${response.status}`);
            return readResponseBytes(response, MAX_PACK_DOWNLOAD_BYTES);
        });

        const actual = crypto.createHash('sha256').update(compressed).digest('hex');
        if (actual.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
            throw new Error('Downloaded Eye of Zomm data pack failed SHA-256 verification.');
        }

        const jsonBuffer = zlib.gunzipSync(compressed, { maxOutputLength:MAX_PACK_JSON_BYTES });
        const decoded = JSON.parse(jsonBuffer.toString('utf8'));
        if (!validatePack(decoded)) throw new Error('Downloaded Eye of Zomm data pack has an invalid schema.');
        decoded.meta = { ...(decoded.meta || {}), manifestVersion: String(manifest.version), cachedByDesktop: true };

        const target = productionPackPath();
        const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
        await fsp.writeFile(tmp, JSON.stringify(decoded), 'utf8');
        await fsp.rename(tmp, target);

        state.version = String(manifest.version);
        state.lastStatus = 'updated';
        state.lastError = '';
        state.lastSuccessUtc = new Date().toISOString();
        state.lastUpdatedUtc = state.lastSuccessUtc;
        state.generatedAtUtc = String(decoded.meta?.generatedAt || '');
        await savePackState(state);

        return { ok: true, skipped: false, status: 'updated', version: state.version, productionPack: true, dataPack:state };
    } catch (error) {
        state.lastStatus = 'unavailable';
        state.lastError = String(error?.message || error);
        await savePackState(state);
        return {
            ok: false,
            skipped: false,
            status: 'unavailable',
            version: String(state.version || ''),
            productionPack: fs.existsSync(productionPackPath()),
            dataPack:state,
            error: state.lastError
        };
    }
}

async function readLogWindow(offsetValue) {
    const logPath = await resolveLogPath();
    if (!logPath || !fs.existsSync(logPath)) {
        automaticLogReader?.reset();
        return { logPath, logExists: false, startOffset: 0, newOffset: 0, reset: true, text: '' };
    }

    const handle = await fsp.open(logPath, 'r').catch(error=>{automaticLogReader?.reset();throw error;});
    try {
        const stat = await handle.stat();
        const length = stat.size;
        let offset = Number(offsetValue) || 0;
        let reset = false;

        if (offset <= 0 || offset > length) {
            offset = Math.max(0, length - INITIAL_TAIL_BYTES);
            reset = true;
        }

        const startOffset = offset;
        const remaining = Math.max(0, Math.min(MAX_READ_BYTES, length - offset));
        const buffer = Buffer.alloc(remaining);
        const { bytesRead } = remaining ? await handle.read(buffer, 0, remaining, offset) : { bytesRead: 0 };

        const result = {
            logPath,
            logExists: true,
            startOffset,
            newOffset: startOffset + bytesRead,
            length,
            reset,
            text: bytesRead ? buffer.subarray(0, bytesRead).toString('utf8') : ''
        };
        // Only actual configured-file bytes authorize automatic source edits.
        // Renderer-proposed log observations continue to populate local drafts.
        await automaticLogReader?.ingest(result).catch(()=>{});
        return result;
    } finally {
        await handle.close();
    }
}

async function automaticWikiCatalog(){
    const file=fs.existsSync(productionPackPath())?productionPackPath():bundledBootstrapPath();
    const stat=await fsp.stat(file).catch(()=>null),key=stat?`${file}:${stat.mtimeMs}:${stat.size}`:'';
    if(!key)return {};
    if(key!==automaticCatalogKey){const loaded=await readJson(file,null);if(!loaded)return {};automaticCatalog=loaded;automaticCatalogKey=key;}
    return automaticCatalog||{};
}

async function eqFileManifest() {
    const config = await readConfig();
    const root = String(config.eqRootPath || '');
    if (!root) return { rootName: '', files: [] };

    const rootReal = await fsp.realpath(root).catch(() => '');
    if (!rootReal) return { rootName: path.basename(root), files: [] };
    const files = [];

    async function walk(directory, relativeDirectory = '', depth = 0, insideMaps = false) {
        if (files.length >= MAX_EQ_FILE_COUNT) return;
        let entries;
        try {
            entries = await fsp.readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));

        for (const entry of entries) {
            if (files.length >= MAX_EQ_FILE_COUNT) break;
            const fullPath = path.join(directory, entry.name);
            const relativePath = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) {
                const nextInsideMaps = insideMaps || /^maps$/i.test(entry.name);
                const allowedTopDirectory = depth === 0 && /^(resources|assets|maps)$/i.test(entry.name);
                if ((nextInsideMaps && depth < 7) || allowedTopDirectory) {
                    await walk(fullPath, relativePath, depth + 1, nextInsideMaps);
                }
                continue;
            }
            if (!entry.isFile() || !SUPPORTED_EQ_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
            let stat;
            try { stat = await fsp.stat(fullPath); } catch { continue; }
            if (stat.size > MAX_EQ_FILE_BYTES) continue;
            files.push({
                path: relativePath.split(path.sep).join('/'),
                size: stat.size,
                lastModified: Math.floor(stat.mtimeMs)
            });
        }
    }

    await walk(rootReal);
    return { rootName: path.basename(rootReal), files, truncated: files.length >= MAX_EQ_FILE_COUNT };
}

async function readEqFile(relativeValue, {mapOnly=false} = {}) {
    const config = await readConfig();
    const root = String(config.eqRootPath || '');
    const relative = String(relativeValue || '').replace(/\\/g, '/');
    if (!root || !relative || path.posix.isAbsolute(relative) || relative.split('/').includes('..')) return null;
    if (!SUPPORTED_EQ_EXTENSIONS.has(path.extname(relative).toLowerCase())) return null;

    const candidate = path.resolve(root, ...relative.split('/'));
    if (!isPathInside(root, candidate)) return null;
    const [rootReal, candidateReal] = await Promise.all([
        fsp.realpath(root).catch(() => ''),
        fsp.realpath(candidate).catch(() => '')
    ]);
    if (!rootReal || !candidateReal || !isPathInside(rootReal, candidateReal)) return null;
    // Map's optional 3D frame has no log-reading capability, including through
    // a guessed Maps junction/symlink that resolves elsewhere in the game root.
    if (mapOnly && !safeMapFile(path.relative(rootReal, candidateReal).split(path.sep).join('/'))) return null;
    const stat = await fsp.stat(candidateReal).catch(() => null);
    if (!stat?.isFile() || stat.size > MAX_EQ_FILE_BYTES) return null;
    return fsp.readFile(candidateReal);
}

function mimeType(filePath) {
    switch (path.extname(filePath).toLowerCase()) {
        case '.html': return 'text/html; charset=utf-8';
        case '.js': return 'text/javascript; charset=utf-8';
        case '.css': return 'text/css; charset=utf-8';
        case '.json': return 'application/json; charset=utf-8';
        case '.svg': return 'image/svg+xml';
        case '.png': return 'image/png';
        case '.jpg': case '.jpeg': return 'image/jpeg';
        case '.woff2': return 'font/woff2';
        default: return 'application/octet-stream';
    }
}

function sendJson(res, status, value) {
    const body = Buffer.from(JSON.stringify(value));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer'
    });
    res.end(body);
}

function sendBuffer(req, res, status, contentType, body, cacheControl = 'no-store') {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
    });
    if (req.method === 'HEAD') res.end();
    else res.end(body);
}

function safeStaticPath(urlPath) {
    const decoded = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
    const relative = decoded.replace(/^\/+/, '');
    const candidate = path.resolve(appRoot(), relative);
    const base = path.resolve(appRoot());
    if (candidate !== base && !candidate.startsWith(`${base}${path.sep}`)) return null;
    return candidate;
}

async function apiInfo() {
    const logPath = await resolveLogPath();
    const state = await readPackState();
    const config = await readConfig();
    return {
        version: APP_VERSION,
        server: `${HOST}:${port}`,
        logPath,
        logExists: Boolean(logPath && fs.existsSync(logPath)),
        eqRootPath: String(config.eqRootPath || inferEqRootPath(logPath)),
        eqRootExists: Boolean(config.eqRootPath && fs.existsSync(config.eqRootPath)),
        logSelection: config.logSelection === 'manual' ? 'manual' : 'automatic',
        safety: 'log/local-file reads only; optional static wiki data pack',
        dataPack: dataPackRefreshState(state),
        productionPack: fs.existsSync(productionPackPath()),
        windowState: windowSettings(config),
        desktop: true
    };
}

function validRequestHost(req) {
    return String(req.headers.host || '').toLowerCase() === `${HOST}:${port}`;
}

function trustedMutation(req, pathname) {
    if (!pathname.startsWith('/api/')) return false;
    return req.method === 'POST' &&
        req.headers['x-eye-of-zomm-request'] === '1' &&
        (!req.headers.origin || req.headers.origin === `http://${HOST}:${port}`);
}

async function requestHandler(req, res) {
    try {
        if (!validRequestHost(req)) return sendJson(res, 403, { error: 'Forbidden host' });
        const contentLength = Number(req.headers['content-length'] || 0);
        if (!Number.isFinite(contentLength) || contentLength > MAX_API_REQUEST_BYTES) {
            return sendJson(res, 413, { error: 'Request too large' });
        }

        const url = new URL(req.url, `http://${HOST}:${port}`);
        const pathname = url.pathname;
        const isMutation = [
            '/api/select-eq-root', '/api/select-log', '/api/log/automatic',
            '/api/update-pack'
        ].includes(pathname);
        if (isMutation && !trustedMutation(req, pathname)) {
            return sendJson(res, req.method === 'POST' ? 403 : 405, { error: 'Trusted POST required' });
        }
        if (!isMutation && !['GET', 'HEAD'].includes(req.method)) {
            return sendJson(res, 405, { error: 'Method not allowed' });
        }

        if (pathname === '/api/info') return sendJson(res, 200, await apiInfo());
        if (pathname === '/api/log') return sendJson(res, 200, await readLogWindow(url.searchParams.get('offset')));
        if (pathname === '/api/eq-files') return sendJson(res, 200, await eqFileManifest());
        if (pathname === '/api/eq-file') {
            const body = await readEqFile(url.searchParams.get('path'), {mapOnly:url.searchParams.get('surface') === 'overlay-map'});
            if (!body) return sendJson(res, 404, { error: 'EverQuest file not available' });
            return sendBuffer(req, res, 200, 'application/octet-stream', body, 'no-store');
        }
        if (pathname === '/api/select-eq-root') {
            await selectEqRoot();
            return sendJson(res, 200, await apiInfo());
        }
        if (pathname === '/api/select-log') {
            await selectLogFile();
            return sendJson(res, 200, await apiInfo());
        }
        if (pathname === '/api/log/automatic') {
            await useAutomaticLogSelection();
            return sendJson(res, 200, await apiInfo());
        }
        if (pathname === '/api/update-pack') {
            return sendJson(res, 200, await updateStaticDataPack(url.searchParams.get('force') === '1'));
        }

        // The production data pack lives in Electron's writable userData folder.
        if (pathname === '/data/eye-of-zomm-pack.json') {
            const target = productionPackPath();
            if (!fs.existsSync(target)) return sendJson(res, 404, { error: 'No cached production pack' });
            const body = await fsp.readFile(target);
            return sendBuffer(req, res, 200, 'application/json; charset=utf-8', body, 'no-store');
        }

        const target = safeStaticPath(pathname);
        if (!target) return sendJson(res, 400, { error: 'Bad path' });
        let stat;
        try { stat = await fsp.stat(target); } catch { return sendJson(res, 404, { error: 'Not found' }); }
        if (!stat.isFile()) return sendJson(res, 404, { error: 'Not found' });
        const body = await fsp.readFile(target);
        return sendBuffer(req, res, 200, mimeType(target), body, 'no-store');
    } catch (error) {
        console.error('[Eye of Zomm] request error', error);
        return sendJson(res, 500, { error: 'Internal error' });
    }
}

async function startServer() {
    server = http.createServer((req, res) => void requestHandler(req, res));
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(DEFAULT_PORT, HOST, () => resolve());
    }).catch(async error => {
        if (error?.code !== 'EADDRINUSE') throw error;
        // If a stale/dev process owns the usual port, choose a loopback ephemeral port.
        await new Promise((resolve, reject) => {
            server.removeAllListeners('error');
            server.once('error', reject);
            server.listen(0, HOST, () => resolve());
        });
    });
    port = server.address().port;
}

function createWindow(config = {}, savedPlacement = {}) {
    desktopSettings=windowSettings(config);
    const placement=normalizeWindowPlacement(savedPlacement,electron.screen?.getAllDisplays?.() || []);
    pendingInitialMaximize=placement.maximized;
    windowRef = new BrowserWindow({
        ...placement.bounds,
        minWidth: Math.min(1024,placement.bounds.width),
        minHeight: Math.min(700,placement.bounds.height),
        title:`EQLWiki - Eye of Zomm v${APP_VERSION}`,
        backgroundColor: '#08101b',
        frame: true,
        autoHideMenuBar: true,
        skipTaskbar: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            autoplayPolicy: 'no-user-gesture-required',
            // This renderer is the sole log/session owner even when only
            // independent native overlays are visible.
            backgroundThrottling: false
        }
    });
    windowRef.setSkipTaskbar(false);
    installLocalFontPermissions({session:windowRef.webContents.session,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef});
    windowPlacement=new WindowPlacement({window:windowRef,screen:electron.screen,initial:placement,
        getMaximized:()=>pendingInitialMaximize || windowRef?.isMaximized(),
        write:value=>atomicWriteJson(windowPlacementPath(),value)});

    const openApprovedExternalUrl = url => {
        try {
            const target = new URL(url);
            if ((target.protocol === 'https:' && ['eqlwiki.com', 'www.eqlwiki.com'].includes(target.hostname.toLowerCase())) ||
                url === 'https://github.com/Maergoth/EQL-EOZ' || url === 'https://github.com/Maergoth/EQL-EOZ/' || isReleaseNotesUrl(url)) {
                void shell.openExternal(target.toString());
            }
        } catch {}
    };

    windowRef.webContents.setWindowOpenHandler(({ url }) => {
        openApprovedExternalUrl(url);
        return { action: 'deny' };
    });

    windowRef.webContents.on('will-navigate', (event, url) => {
        const localPrefix = `http://${HOST}:${port}/`;
        if (!url.startsWith(localPrefix)) {
            event.preventDefault();
            openApprovedExternalUrl(url);
        } else {
            event.preventDefault();void reloadMainWindow(url);
        }
    });
    windowRef.webContents.on('before-input-event',(event,input)=>{
        if(input.type==='keyDown'&&(input.key==='F5'||((input.control||input.meta)&&input.key.toLowerCase()==='r'))){event.preventDefault();void reloadMainWindow();}
    });

    windowRef.once('ready-to-show', () => {
        if (desktopSettings.startMinimized) {
            if (desktopSettings.minimizeToTray && overlayHost?.tray) windowRef.hide();
            else windowRef.minimize();
        } else showMainWindow(false);
    });
    windowRef.on('minimize', event => {
        if (desktopSettings.minimizeToTray && overlayHost?.tray) { event?.preventDefault?.();windowRef.hide(); }
    });
    windowRef.on('restore', () => {
        // A taskbar restore can bypass Open main. Consume the saved initial
        // maximization here too, without adding a separate show/focus action.
        if (pendingInitialMaximize) { pendingInitialMaximize=false;windowRef.maximize(); }
    });
    windowRef.on('close', event => {
        void windowPlacement?.flush().catch(error=>console.warn('[Eye of Zomm] window placement:',error?.message));
        if (!quitting && overlayHost?.hasVisiblePanels() && overlayHost.hasRecoveryControl()) {
            event.preventDefault();
            windowRef.hide();
        } else if(!quitting) {
            event.preventDefault();app.quit();
        }
    });
    const unavailable = () => { sessionNeedsReload = true; overlayHost?.markSessionUnavailable(); };
    windowRef.webContents.on('render-process-gone', unavailable);
    windowRef.webContents.on('render-process-gone',()=>rendererDrain?.reset());
    windowRef.webContents.on('render-process-gone', () => {discoveryHost?.clear();void captureHost?.stop().catch(()=>{});});
    windowRef.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (isMainFrame && !isInPlace) {rendererDrain?.reset();discoveryHost?.clear();void captureHost?.stop().catch(()=>{});}
    });
    windowRef.webContents.on('unresponsive', unavailable);
    windowRef.webContents.on('responsive', () => { sessionNeedsReload = false; });
    windowRef.webContents.on('did-start-loading', () => overlayHost?.markSessionUnavailable());
    // Hidden overlay windows still count as open Electron windows. Once the
    // session window really closes, quit rather than leaving orphaned panels.
    windowRef.on('closed', () => { void windowPlacement?.dispose().catch(error=>console.warn('[Eye of Zomm] window placement:',error?.message));windowRef = null; if (!quitting) app.quit(); });
    void windowRef.loadURL(`http://${HOST}:${port}/`);
}

async function bootstrap() {
    await ensureUserDirs();
    await startServer();
    let config = await readConfig();
    if (!config.eqRootPath || !fs.existsSync(config.eqRootPath)) {
        await selectEqRoot({ firstRun: true });
        config = await readConfig();
    }

    // Never delay first paint on remote data. The cached/bootstrap pack loads immediately;
    // a tiny GitHub manifest check runs now and hourly while EoZ stays open.
    void startDataPackRefresh().catch(error => console.warn('[Eye of Zomm] data sync:', error));
    overlayHost = new OverlayHost({
        electron,
        origin:`http://${HOST}:${port}`,
        getMainWindow:() => windowRef,
        showMain:showMainWindow,
        readPreferences:() => readJson(overlayPreferencesPath(), {}),
        writePreferences:preferences => atomicWriteJson(overlayPreferencesPath(), preferences)
    });
    await overlayHost.initialize();
    // Previous releases cached unversioned HTML/JS for an hour. Discard that
    // cache on upgrade so the new executable also displays its new interface.
    if (config.frontendCacheVersion !== APP_VERSION) {
        await electron.session.defaultSession.clearCache();
        config=await updateConfig({frontendCacheVersion:APP_VERSION});
    }
    characterStorage = new CharacterStorage({directory:userDataDir(),electron,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef,
        warn:message=>console.warn('[Eye of Zomm]',message)});
    await characterStorage.initialize();
    inventoryFileHost = new InventoryFileHost({electron,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef,readConfig});
    captureHost = new CaptureHost({electron,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef});
    wikiHost = new WikiHost({electron,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef,
        stateDir:path.join(userDataDir(),'wiki-contributions'),version:APP_VERSION,
        onStatus:status=>{void observationHost?.accountChanged(status);if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('eye-of-zomm:wiki-state',status);},
        onAttachmentPrepared:({png})=>captureHost.importPng(png,{mode:'contribution'}),
        onCaptureEvidence:proof=>captureHost.getItemEvidence(proof),
        onItemCatalog:automaticWikiCatalog,
        onIconRequest:(action,value)=>iconFinderHost.handle(action,value)});
    const sourceReceipt=result=>{if(windowRef&&!windowRef.isDestroyed())windowRef.webContents.send('eye-of-zomm:automatic-source-result',{
        ...result,itemTitle:result.item||'',npcTitle:result.npc||'',zoneTitle:result.zone||''});};
    automaticLootSources=new AutomaticLootSources({client:wikiHost.client,onResult:sourceReceipt,onDeferred:sourceReceipt});
    automaticLogReader=new AutomaticLogReader({getPack:automaticWikiCatalog,onReset:()=>automaticLootSources.cancel(),
        onObservation:record=>automaticLootSources.observe(record)});
    iconFinderHost = new IconFinderHost({session:wikiHost.session,stateDir:path.join(userDataDir(),'wiki-icons'),nativeImage:electron.nativeImage});
    observationHost = new DropObservationHost({electron,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef,
        stateDir:path.join(userDataDir(),'drop-observations'),client:wikiHost.client,version:APP_VERSION});
    await observationHost.ready;
    // Resolve the cookie-backed account before new events enter the outbox.
    const wikiCookies=await wikiHost.session.cookies.get({url:'https://eqlwiki.com/'}).catch(()=>[]);
    await observationHost.accountChanged(wikiCookies.length?await wikiHost.client.status().catch(()=>({authenticated:false})):{authenticated:false});
    rendererDrain = new RendererDrain({ipcMain,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef});
    shareHost = new ShareHost({electron,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef});
    discoveryHost = new DiscoveryHost({electron,origin:`http://${HOST}:${port}`,getMainWindow:()=>windowRef,
        isTimerPanel:event=>overlayHost.overlaySender(event)==='timers',captureScreenshot:value=>captureHost.captureScreenshot(value)});
    createWindow(config,await readJson(windowPlacementPath(),{}));
    // Metadata checks are quiet. Application downloads require an explicit
    // request or the saved opt-in; a staged installer never runs on startup.
    void getAppUpdater().startup().catch(() => console.warn('[Eye of Zomm] application update check unavailable.'));
}

ipcMain.handle('eye-of-zomm:app-update', async (event, action, value) => {
    // Only the main local application frame can control an installer. The
    // embedded zone viewer and unrelated loopback clients have no update API.
    if (!windowRef || windowRef.isDestroyed() || event.sender !== windowRef.webContents ||
        event.senderFrame !== windowRef.webContents.mainFrame ||
        event.senderFrame?.url !== `http://${HOST}:${port}/`) {
        throw new Error('Application update request is unavailable.');
    }
    const updater = getAppUpdater();
    if (action === 'get-status') return updater.getStatus();
    if (action === 'check') return updater.check();
    if (action === 'download') return updater.download();
    if (action === 'cancel') return updater.cancel();
    if (action === 'startup-download' && typeof value === 'boolean') return updater.setStartupDownload(value);
    if (action === 'install') return updater.install();
    throw new Error('Unknown application update request.');
});

ipcMain.handle('eye-of-zomm:window', async (event, action, value) => {
    if (!windowRef || windowRef.isDestroyed() || event.sender !== windowRef.webContents ||
        event.senderFrame !== windowRef.webContents.mainFrame || event.senderFrame?.url !== `http://${HOST}:${port}/`) {
        throw new Error('Window request is unavailable.');
    }
    if (action === 'get-settings') return windowSettings(await readConfig());
    if (action === 'set-settings') {
        if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>
            !['minimizeToTray','startMinimized'].includes(key) || typeof value[key] !== 'boolean')) throw new Error('Invalid window settings.');
        return windowSettings(await updateConfig(value));
    }
    if (action === 'minimize') windowRef.minimize();
    else if (action === 'toggle-maximize') windowRef.isMaximized() ? windowRef.unmaximize() : windowRef.maximize();
    else if (action === 'close') windowRef.close();
    else if (action === 'is-maximized') return windowRef.isMaximized();
    else return false;
    return true;
});

ipcMain.handle('eye-of-zomm:clipboard', (_event, text) => {
    const value = String(text || '');
    if (!value || value.length > 512) return { ok:false };
    clipboard.writeText(value);
    return { ok:true };
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        showMainWindow();
    });

    app.whenReady().then(bootstrap).catch(error => {
        console.error(error);
        dialog.showErrorBox('EQLWiki - Eye of Zomm failed to start', String(error?.stack || error));
        app.quit();
    });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', event => {
    if (quitReady) return;
    event.preventDefault();if (quitFlush) return;quitting = true;
    quitFlush=(async()=>{
        if(rendererDrain && !await rendererDrain.drain() && windowRef && !windowRef.isDestroyed()){
            quitting=false;rendererDrain.resume();
            dialog.showErrorBox('Eye of Zomm could not save pending observations','The app has been left open. Check available disk space and try closing it again.');return;
        }
        stopDataPackRefresh();automaticLogReader?.dispose();automaticLootSources?.dispose();overlayHost?.dispose();discoveryHost?.dispose();wikiHost?.dispose();iconFinderHost?.dispose();shareHost?.dispose();inventoryFileHost?.dispose();appUpdater?.shutdown();
        try { server?.close(); } catch {}
        await Promise.allSettled([windowPlacement?.dispose(),configWriteQueue,overlayHost?.writeQueue,captureHost?.dispose(),wikiHost?.client.persistChain,characterStorage?.close(),observationHost?.close()]);
        rendererDrain?.dispose();electron.session.defaultSession.flushStorageData();quitReady=true;app.quit();
    })().finally(()=>{quitFlush=null;});
});
