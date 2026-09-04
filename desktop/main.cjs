'use strict';

const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { URL } = require('node:url');
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
const MAX_PACK_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const MAX_API_REQUEST_BYTES = 64 * 1024;
const MAX_EQ_FILE_BYTES = 128 * 1024 * 1024;
const MAX_EQ_FILE_COUNT = 50000;
const SUPPORTED_EQ_EXTENSIONS = new Set(['.s3d', '.eqg', '.txt', '.eff', '.xmi', '.emt', '.zon']);

let server = null;
let windowRef = null;
let port = DEFAULT_PORT;
let normalWindowBounds = null;

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
    return {
        eqRootPath: '',
        logPath: '',
        logSelection: 'automatic',
        alwaysOnTop: false,
        minimalMode: false,
        ...(await readJson(configPath(), {}))
    };
}

async function updateConfig(values) {
    const config = await readConfig();
    const next = { ...config, ...values };
    await atomicWriteJson(configPath(), next);
    return next;
}

async function setAlwaysOnTop(enabled) {
    enabled = Boolean(enabled);
    windowRef?.setAlwaysOnTop(enabled, enabled ? 'screen-saver' : 'normal');
    windowRef?.setSkipTaskbar(false);
    await updateConfig({ alwaysOnTop: enabled });
    return enabled;
}

async function setMinimalMode(enabled) {
    enabled = Boolean(enabled);
    if (windowRef && !windowRef.isDestroyed()) {
        if (enabled) {
            normalWindowBounds ||= windowRef.getBounds();
            windowRef.setMinimumSize(720, 420);
            const bounds = windowRef.getBounds();
            windowRef.setBounds({ ...bounds, width: Math.min(bounds.width, 1040), height: Math.min(bounds.height, 680) }, true);
        } else {
            windowRef.setMinimumSize(1024, 700);
            if (normalWindowBounds) windowRef.setBounds(normalWindowBounds, true);
            normalWindowBounds = null;
        }
    }
    await updateConfig({ minimalMode: enabled });
    return enabled;
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
        version: '',
        lastStatus: 'never',
        lastError: ''
    });
}

async function savePackState(state) {
    await atomicWriteJson(packStatePath(), state);
}

async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'User-Agent': `EQLWiki-EyeOfZomm/${APP_VERSION}`,
                'Cache-Control': 'no-cache'
            }
        });
    } finally {
        clearTimeout(timer);
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

async function updateStaticDataPack(force = false) {
    await ensureUserDirs();
    const state = await readPackState();
    const now = new Date();

    state.lastCheckUtc = now.toISOString();

    try {
        const manifestResponse = await fetchWithTimeout(PACK_MANIFEST_URL, 8000);
        if (!manifestResponse.ok) throw new Error(`Manifest HTTP ${manifestResponse.status}`);
        const manifest = await manifestResponse.json();

        if (!manifest?.version || !manifest?.pack) {
            throw new Error('Eye of Zomm dataset manifest is missing version or pack.');
        }
        const packName = String(manifest.pack);
        if (!/^[A-Za-z0-9._-]+\.json\.gz$/.test(packName)) {
            throw new Error('Eye of Zomm dataset manifest contains an invalid pack filename.');
        }

        if (!fs.existsSync(productionPackPath()) && fs.existsSync(bundledBootstrapPath())) {
            const bundled = await readJson(bundledBootstrapPath(), null);
            if (String(bundled?.meta?.manifestVersion || '') === String(manifest.version)) {
                state.version = String(manifest.version);
                state.lastStatus = 'bundled-current';
                state.lastError = '';
                await savePackState(state);
                return { ok: true, skipped: true, status: 'bundled-current', version: state.version, productionPack: false, bundledPack: true };
            }
        }

        if (
            String(state.version || '') === String(manifest.version) &&
            fs.existsSync(productionPackPath())
        ) {
            state.lastStatus = 'current';
            state.lastError = '';
            await savePackState(state);
            return { ok: true, skipped: true, status: 'current', version: state.version, productionPack: true };
        }

        const packUrl = new URL(packName, PACK_MANIFEST_URL).toString();
        const response = await fetchWithTimeout(packUrl, 45000);
        if (!response.ok) throw new Error(`Pack HTTP ${response.status}`);

        const contentLength = Number(response.headers.get('content-length') || 0);
        if (contentLength > MAX_PACK_DOWNLOAD_BYTES) throw new Error('Eye of Zomm data pack is unexpectedly large.');

        const compressed = Buffer.from(await response.arrayBuffer());
        if (compressed.length > MAX_PACK_DOWNLOAD_BYTES) throw new Error('Eye of Zomm data pack exceeded the size limit.');

        if (manifest.sha256) {
            const actual = crypto.createHash('sha256').update(compressed).digest('hex');
            if (actual.toLowerCase() !== String(manifest.sha256).toLowerCase()) {
                throw new Error('Downloaded Eye of Zomm data pack failed SHA-256 verification.');
            }
        }

        const jsonBuffer = zlib.gunzipSync(compressed);
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
        await savePackState(state);

        return { ok: true, skipped: false, status: 'updated', version: state.version, productionPack: true };
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
            error: state.lastError
        };
    }
}

async function readLogWindow(offsetValue) {
    const logPath = await resolveLogPath();
    if (!logPath || !fs.existsSync(logPath)) {
        return { logPath, logExists: false, startOffset: 0, newOffset: 0, reset: true, text: '' };
    }

    const handle = await fsp.open(logPath, 'r');
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

        return {
            logPath,
            logExists: true,
            startOffset,
            newOffset: startOffset + bytesRead,
            length,
            reset,
            text: bytesRead ? buffer.subarray(0, bytesRead).toString('utf8') : ''
        };
    } finally {
        await handle.close();
    }
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

async function readEqFile(relativeValue) {
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
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
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
        dataPack: state,
        productionPack: fs.existsSync(productionPackPath()),
        windowState: {
            alwaysOnTop: Boolean(windowRef?.isAlwaysOnTop() ?? config.alwaysOnTop),
            minimalMode: Boolean(config.minimalMode)
        },
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
            '/api/window/always-on-top', '/api/window/minimal', '/api/update-pack'
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
            const body = await readEqFile(url.searchParams.get('path'));
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
        if (pathname === '/api/window/always-on-top') {
            const enabled = url.searchParams.get('enabled') === '1';
            await setAlwaysOnTop(enabled);
            return sendJson(res, 200, { ok: true, enabled });
        }
        if (pathname === '/api/window/minimal') {
            const enabled = url.searchParams.get('enabled') === '1';
            await setMinimalMode(enabled);
            return sendJson(res, 200, { ok: true, enabled });
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
        return sendBuffer(req, res, 200, mimeType(target), body, app.isPackaged ? 'public, max-age=3600' : 'no-store');
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

function createWindow(config = {}) {
    const minimalMode = Boolean(config.minimalMode);
    windowRef = new BrowserWindow({
        width: minimalMode ? 1040 : 1440,
        height: minimalMode ? 680 : 900,
        minWidth: minimalMode ? 720 : 1024,
        minHeight: minimalMode ? 420 : 700,
        backgroundColor: '#08101b',
        frame: false,
        autoHideMenuBar: true,
        skipTaskbar: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        }
    });
    windowRef.setAlwaysOnTop(Boolean(config.alwaysOnTop), config.alwaysOnTop ? 'screen-saver' : 'normal');
    windowRef.setSkipTaskbar(false);

    const openApprovedWikiUrl = url => {
        try {
            const target = new URL(url);
            if (target.protocol === 'https:' && ['eqlwiki.com', 'www.eqlwiki.com'].includes(target.hostname.toLowerCase())) {
                void shell.openExternal(target.toString());
            }
        } catch {}
    };

    windowRef.webContents.setWindowOpenHandler(({ url }) => {
        openApprovedWikiUrl(url);
        return { action: 'deny' };
    });

    windowRef.webContents.on('will-navigate', (event, url) => {
        const localPrefix = `http://${HOST}:${port}/`;
        if (!url.startsWith(localPrefix)) {
            event.preventDefault();
            openApprovedWikiUrl(url);
        }
    });

    windowRef.once('ready-to-show', () => windowRef.show());
    windowRef.on('closed', () => { windowRef = null; });
    void windowRef.loadURL(`http://${HOST}:${port}/`);
}

async function bootstrap() {
    await ensureUserDirs();
    await startServer();
    let config = await readConfig();
    if (!config.eqRootPath || !fs.existsSync(config.eqRootPath)) {
        await selectEqRoot({ firstRun: true });
        config = await readConfig();
        if ((!config.eqRootPath || !fs.existsSync(config.eqRootPath)) && config.alwaysOnTop) {
            config = await updateConfig({ alwaysOnTop: false });
        }
    }

    // Never delay first paint on remote data. The cached/bootstrap pack loads immediately;
    // a tiny GitHub dataset-manifest check runs in parallel on every startup.
    void updateStaticDataPack(false).catch(error => console.warn('[Eye of Zomm] data sync:', error));
    createWindow(config);
}

ipcMain.handle('eye-of-zomm:window', (_event, action) => {
    if (!windowRef || windowRef.isDestroyed()) return false;
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
        if (!windowRef) return;
        if (windowRef.isMinimized()) windowRef.restore();
        windowRef.show();
        windowRef.focus();
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

app.on('before-quit', () => {
    try { server?.close(); } catch {}
});
