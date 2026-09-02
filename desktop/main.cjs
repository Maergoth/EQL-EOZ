'use strict';

const { app, BrowserWindow, dialog, shell } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { URL } = require('node:url');

const APP_VERSION = app.getVersion();
const HOST = '127.0.0.1';
const DEFAULT_PORT = 53147;
const INITIAL_TAIL_BYTES = 512 * 1024;
const MAX_READ_BYTES = 2 * 1024 * 1024;
const PACK_MANIFEST_URL = 'https://raw.githubusercontent.com/Maergoth/EQL-EOZ/dataset/manifest.json';
const MAX_PACK_DOWNLOAD_BYTES = 128 * 1024 * 1024;

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
    return path.join(userDataDir(), 'companion-config.json');
}

function packStatePath() {
    return path.join(userDataDir(), 'companion-pack-state.json');
}

function productionPackPath() {
    return path.join(userDataDir(), 'data', 'companion-pack.json');
}

function bundledBootstrapPath() {
    return path.join(appRoot(), 'data', 'companion-pack.bootstrap.json');
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
        logPath: '',
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

async function saveConfig(logPath) {
    await updateConfig({ logPath: String(logPath || '') });
}

async function setAlwaysOnTop(enabled) {
    enabled = Boolean(enabled);
    windowRef?.setAlwaysOnTop(enabled);
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

function logFamily(filePath) {
    if (!filePath) return null;
    const directory = path.dirname(filePath);
    const name = path.basename(filePath);
    const match = name.match(/^(eqlog_[^_]+_[^.]+)/i);
    return {
        directory,
        prefix: match ? match[1] : path.basename(name, path.extname(name))
    };
}

async function resolveLogPath() {
    const config = await readConfig();
    const configured = String(config.logPath || '');
    if (!configured) return '';

    const family = logFamily(configured);
    if (!family) return configured;

    try {
        const entries = await fsp.readdir(family.directory, { withFileTypes: true });
        const candidates = [];
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            if (!entry.name.toLowerCase().startsWith(family.prefix.toLowerCase())) continue;
            if (path.extname(entry.name).toLowerCase() !== '.txt' && entry.name !== family.prefix) continue;
            const full = path.join(family.directory, entry.name);
            try {
                const stat = await fsp.stat(full);
                candidates.push({ full, mtimeMs: stat.mtimeMs });
            } catch {}
        }
        candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
        return candidates[0]?.full || configured;
    } catch {
        return configured;
    }
}

async function selectLogFile() {
    const current = await resolveLogPath();
    const result = await dialog.showOpenDialog(windowRef || undefined, {
        title: 'Select the active EverQuest log file',
        defaultPath: current ? path.dirname(current) : undefined,
        properties: ['openFile'],
        filters: [
            { name: 'EverQuest logs', extensions: ['txt'] },
            { name: 'All files', extensions: ['*'] }
        ]
    });
    if (result.canceled || !result.filePaths[0]) return '';
    await saveConfig(result.filePaths[0]);
    return result.filePaths[0];
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
        return { logPath, startOffset: 0, newOffset: 0, reset: true, text: '' };
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
        'X-Content-Type-Options': 'nosniff'
    });
    res.end(body);
}

function sendBuffer(req, res, status, contentType, body, cacheControl = 'no-store') {
    res.writeHead(status, {
        'Content-Type': contentType,
        'Content-Length': body.length,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
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

async function requestHandler(req, res) {
    try {
        if (!['GET', 'HEAD'].includes(req.method)) {
            return sendJson(res, 405, { error: 'Method not allowed' });
        }

        const url = new URL(req.url, `http://${HOST}:${port}`);
        const pathname = url.pathname;

        if (pathname === '/api/info') return sendJson(res, 200, await apiInfo());
        if (pathname === '/api/log') return sendJson(res, 200, await readLogWindow(url.searchParams.get('offset')));
        if (pathname === '/api/select-log') {
            await selectLogFile();
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
        if (pathname === '/data/companion-pack.json') {
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
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        }
    });
    windowRef.setAlwaysOnTop(Boolean(config.alwaysOnTop));

    windowRef.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    windowRef.webContents.on('will-navigate', (event, url) => {
        const localPrefix = `http://${HOST}:${port}/`;
        if (!url.startsWith(localPrefix)) {
            event.preventDefault();
            if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
        }
    });

    windowRef.once('ready-to-show', () => windowRef.show());
    windowRef.on('closed', () => { windowRef = null; });
    void windowRef.loadURL(`http://${HOST}:${port}/`);
}

async function bootstrap() {
    await ensureUserDirs();
    const config = await readConfig();
    await startServer();

    // Never delay first paint on remote data. The cached/bootstrap pack loads immediately;
    // a tiny GitHub dataset-manifest check runs in parallel on every startup.
    void updateStaticDataPack(false).catch(error => console.warn('[Eye of Zomm] data sync:', error));
    createWindow(config);
}

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
