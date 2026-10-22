'use strict';

const path = require('node:path');
const {allowMapRequest}=require('./overlay-map-policy.cjs');
const {normalizeAppearance}=require('./appearance.cjs');

const PANEL_IDS = Object.freeze(['parse', 'map', 'intel', 'timers']);
const PANEL_NAMES = Object.freeze({ parse:'Combat parse', map:'Map & intel', intel:'Zone intel', timers:'Triggers' });
const IPC_MAIN = 'eye-of-zomm:overlays';
const IPC_OVERLAY = 'eye-of-zomm:overlay';
const RECOVERY_SHORTCUT = 'CommandOrControl+Shift+O';
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_BYTES = 16 * 1024;
const MAX_REPLY_BYTES = 8 * 1024 * 1024;
const SESSION_ACTIONS = new Set([
    'session:open', 'session:new-session', 'session:route', 'session:copy-waypoint', 'session:class-filter', 'session:item-tier', 'session:wiki',
    'session:map-data', 'session:map-focus', 'session:intel-drops', 'session:select-npc', 'session:cancel-route',
    'timer:fire-definition', 'timer:save-definition', 'timer:remove-definition', 'timer:start', 'timer:pause', 'timer:resume',
    'timer:reset', 'timer:cancel', 'timer:delete', 'timer:create-spawn', 'timer:reset-swing',
    'timer:set-zone', 'timer:cancel-all', 'timer:set-swing-enabled', 'timer:set-swing-delay'
]);
const SIZES = { parse:[420, 220], map:[520, 380], intel:[520, 420], timers:[420, 64] };
// A small gold eye is embedded so the packaged tray never depends on build resources.
const TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATklEQVR4nGNgGAWjgObg6saw//gwTQwl2zJcGjkEpLFikiwixlBi5LBaQo5riVFHtAWkBN3gtIDiIKJ5JNMlmRJj0YDkarIMHQWjgCQAAOw009RU8GzvAAAAAElFTkSuQmCC';

function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function finite(value, fallback) { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function panelId(value) { return PANEL_IDS.includes(value) ? value : null; }

function clampBounds(input, displays, fallback = { x:40, y:40, width:380, height:320 }, minimumHeight = 160) {
    const areas = displays.map(display => display.workArea).filter(area => area && area.width > 0 && area.height > 0);
    if (!areas.length) areas.push({ x:0, y:0, width:1280, height:720 });
    const requested = {
        x:Math.round(finite(input?.x, fallback.x)), y:Math.round(finite(input?.y, fallback.y)),
        width:Math.round(finite(input?.width, fallback.width)), height:Math.round(finite(input?.height, fallback.height))
    };
    // Choose the screen with the greatest surviving intersection, or the primary
    // work area after a monitor has been unplugged. Coordinates are Electron DIPs.
    let best = areas[0], largest = 0;
    for (const area of areas) {
        const overlap = Math.max(0, Math.min(requested.x + requested.width, area.x + area.width) - Math.max(requested.x, area.x)) *
            Math.max(0, Math.min(requested.y + requested.height, area.y + area.height) - Math.max(requested.y, area.y));
        if (overlap > largest) { largest = overlap; best = area; }
    }
    const width = clamp(requested.width, Math.min(260, best.width), Math.min(1200, best.width));
    const height = clamp(requested.height, Math.min(minimumHeight, best.height), Math.min(1200, best.height));
    return { x:clamp(requested.x, best.x, best.x + best.width - width),
        y:clamp(requested.y, best.y, best.y + best.height - height), width, height };
}

function normalizePreferences(raw, displays) {
    const primary = displays[0]?.workArea || { x:0, y:0, width:1280, height:720 };
    const panels = {};
    // The retired Consider panel becomes Map on upgrade. Transfer only its
    // enabled state; Map needs its own defaults and any explicit choice wins.
    const legacyMapVisible = !Object.hasOwn(raw?.panels || {}, 'map') && raw?.panels?.consider?.visible === true;
    const margin = 24;
    const columnWidth = Math.max(260, Math.floor((primary.width - 3 * margin) / 2));
    const rowHeight = Math.max(160, Math.floor((primary.height - 3 * margin) / 2));
    PANEL_IDS.forEach(id => {
        const saved = raw?.panels?.[id] || {};
        const width = Math.min(SIZES[id][0], columnWidth);
        const height = Math.min(SIZES[id][1], rowHeight);
        const right = id === 'intel' || id === 'map';
        const bottom = id === 'timers' || id === 'intel';
        // Fresh layouts keep the center clear. Each panel gets one corner;
        // saved positions are used directly and only clamped to live screens.
        const fallback = { x:primary.x + (right ? primary.width - margin - width : margin),
            y:primary.y + (bottom ? primary.height - margin - height : margin), width, height };
        if (id === 'timers') fallback.y = primary.y + margin + Math.min(SIZES.parse[1], rowHeight) + 6;
        panels[id] = {
            visible:saved.visible === true || (id === 'map' && legacyMapVisible), locked:saved.locked !== false,
            passThrough:saved.passThrough === true,
            backgroundOpacity:clamp(finite(saved.backgroundOpacity, 0.9), 0.15, 1),
            fontScale:clamp(finite(saved.fontScale, 1), 0.75, 1.75),
            bounds:clampBounds(saved.bounds, displays, fallback, id === 'timers' ? 36 : 160)
        };
    });
    return { schemaVersion:1, appearance:normalizeAppearance(raw?.appearance), panels };
}

function jsonObject(value, maxBytes) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Overlay payload must be an object.');
    let encoded;
    try { encoded = JSON.stringify(value); } catch { throw new Error('Overlay payload must be JSON.'); }
    if (Buffer.byteLength(encoded || '') > maxBytes) throw new Error('Overlay payload is too large.');
    return JSON.parse(encoded);
}

function sessionCommand(action, payload) {
    if (!SESSION_ACTIONS.has(action)) throw new Error('Unknown overlay session action.');
    const value = jsonObject(payload || {}, MAX_COMMAND_BYTES);
    if (action === 'session:new-session' && Object.keys(value).length) throw new Error('New session does not accept options.');
    if (action === 'session:open' && !['map', 'items', 'npcs', 'combat', 'timers', 'settings'].includes(value.view)) throw new Error('Unknown application view.');
    if (action === 'session:open' && ['npc', 'item'].some(key => value[key] !== undefined &&
        (typeof value[key] !== 'string' || value[key].length > 240))) throw new Error('Invalid application selection.');
    if (['session:route', 'session:copy-waypoint', 'session:wiki', 'session:intel-drops', 'session:select-npc', 'session:map-focus'].includes(action) &&
        (typeof value.npc !== 'string' || !value.npc.trim() || value.npc.length > 240 ||
        (value.zone !== undefined && (typeof value.zone !== 'string' || value.zone.length > 160)))) throw new Error('Invalid NPC action.');
    if (value.raidInstance !== undefined && typeof value.raidInstance !== 'boolean') throw new Error('Invalid NPC variant.');
    if(value.id!==undefined&&(typeof value.id!=='string'||value.id.length>512))throw new Error('Invalid NPC identity.');
    if (action === 'session:map-data' && (typeof value.zone !== 'string' || value.zone.length > 160)) throw new Error('Invalid map zone.');
    if (action === 'session:class-filter' && (value.panel !== 'intel' || typeof value.enabled !== 'boolean')) throw new Error('Invalid class filter.');
    if(action==='session:item-tier'&&(!Number.isInteger(value.tier)||value.tier<0||value.tier>10))throw new Error('Invalid item tier.');
    return value;
}

class OverlayHost {
    constructor({ electron, origin, getMainWindow, showMain, readPreferences, writePreferences, trayIcon, now = Date.now, warn = console.warn, platform = process.platform }) {
        this.electron = electron;
        this.platform = platform;
        this.origin = origin.replace(/\/$/, '');
        this.getMainWindow = getMainWindow;
        this.showMain = showMain;
        this.readPreferences = readPreferences;
        this.writePreferences = writePreferences;
        this.trayIcon = trayIcon;
        this.now = now;
        this.warn = warn;
        this.windows = new Map();
        this.pendingReplies = new Map();
        this.nextRequestId = 0;
        this.ready = new Set();
        this.crashed = new Set();
        this.preferences = null;
        this.snapshot = null;
        this.snapshotAt = 0;
        this.sessionAvailable = false;
        this.sessionRestartCount = 0;
        this.disposed = false;
        this.writeQueue = Promise.resolve();
        this.saveTimer = null;
        this.tray = null;
        this.recoveryShortcutRegistered = false;
        this.onDisplaysChanged = () => this.restoreBounds();
    }

    displays() { return this.electron.screen.getAllDisplays(); }
    async initialize() {
        this.preferences = normalizePreferences(await this.readPreferences(), this.displays());
        this.electron.ipcMain.handle(IPC_MAIN, (event, action, value) => this.handleMainRequest(event, action, value));
        this.electron.ipcMain.handle(IPC_OVERLAY, (event, action, payload) => this.handleOverlayRequest(event, action, payload));
        for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) this.electron.screen.on(event, this.onDisplaysChanged);
        this.createTray();
        try {
            this.recoveryShortcutRegistered = this.electron.globalShortcut.register(RECOVERY_SHORTCUT, () => {
                void this.control('restore-mouse').then(() => this.control('unlock-all')).then(() => this.showMain()).catch(this.warn);
            }) === true;
        } catch { this.recoveryShortcutRegistered = false; }
        if (!this.hasRecoveryControl()) {
            for (const id of PANEL_IDS) this.preferences.panels[id].passThrough = false;
            this.warn('[Eye of Zomm] overlay tray and recovery shortcut are unavailable; click-through is disabled.');
        }
        for (const id of PANEL_IDS) if (this.preferences.panels[id].visible) this.createPanel(id);
        // A renderer crash or an unresponsive session must not leave apparently
        // live combat numbers. Snapshots are ephemeral and never stored on disk.
        this.staleTimer = setInterval(() => {
            if (this.sessionAvailable && this.now() - this.snapshotAt > 10000) this.markSessionUnavailable();
        }, 2500);
        this.staleTimer.unref?.();
        return this.getState();
    }

    isMain(event) {
        const main = this.getMainWindow();
        return Boolean(main && !main.isDestroyed() && event.sender === main.webContents &&
            event.senderFrame === main.webContents.mainFrame && event.senderFrame?.url === `${this.origin}/`);
    }
    overlaySender(event) {
        for (const [id, win] of this.windows) {
            if (!win.isDestroyed() && event.sender === win.webContents && event.senderFrame === win.webContents.mainFrame &&
                event.senderFrame?.url === this.panelUrl(id)) return id;
        }
        return null;
    }
    panelUrl(id) { return `${this.origin}/${id==='map'?'overlay-map.html':'overlay.html'}?panel=${id}`; }
    getState(id = null) {
        const common = { appearance:this.preferences.appearance, snapshot:this.snapshot, sessionAvailable:this.sessionAvailable,
            lastSnapshotAt:this.snapshotAt, sessionRestartCount:this.sessionRestartCount, recoveryShortcut:RECOVERY_SHORTCUT,
            recoveryShortcutRegistered:this.recoveryShortcutRegistered };
        return clone(id ? { panel:id, preferences:this.preferences.panels[id], ...common } : { panels:this.preferences.panels, ...common });
    }

    async handleMainRequest(event, action, value) {
        if (!this.isMain(event)) throw new Error('Overlay control is unavailable.');
        if (action === 'get-state') return this.getState();
        if (action === 'reply') {
            const pending = this.pendingReplies.get(value?.requestId);
            if (!pending) return { ok:false };
            this.pendingReplies.delete(value.requestId); clearTimeout(pending.timeout);
            if (value.error) pending.reject(new Error(String(value.error).slice(0, 240)));
            else {
                try { pending.resolve(jsonObject(value.result || {}, MAX_REPLY_BYTES)); }
                catch (error) { pending.reject(error); }
            }
            return { ok:true };
        }
        if (action === 'publish') {
            const snapshot = jsonObject(value, MAX_SNAPSHOT_BYTES);
            if (snapshot.schemaVersion !== 1 || !snapshot.session || typeof snapshot.session !== 'object') throw new Error('Invalid overlay snapshot.');
            this.snapshot = snapshot;
            this.fitTimerWindow();
            this.snapshotAt = this.now();
            this.sessionAvailable = true;
            this.broadcast(false);
            return { ok:true };
        }
        if (action === 'control' && value && typeof value === 'object') return this.control(value.action, value.panel, value.value);
        throw new Error('Unknown overlay control.');
    }

    async handleOverlayRequest(event, action, payload) {
        const id = this.overlaySender(event);
        if (!id) throw new Error('Overlay request is unavailable.');
        if (action === 'get-state') return this.getState(id);
        if (action === 'content-height') {
            if (id !== 'timers' || typeof payload !== 'number' || !Number.isFinite(payload) || payload < 36 || payload > 2400) throw new Error('Invalid timer content height.');
            this.timerContentHeight = Math.min(1200,Math.ceil(payload)); this.fitTimerWindow(); return {ok:true};
        }
        if (action === 'show-main') { this.showMain(); return { ok:true }; }
        if (['hide', 'lock', 'pass-through', 'opacity', 'font-scale'].includes(action)) {
            await this.control(action, id, payload);
            return this.getState(id);
        }
        const value = sessionCommand(action, payload);
        const main = this.getMainWindow();
        if (!this.sessionAvailable || !main || main.isDestroyed()) throw new Error('The application session is unavailable. Open Eye of Zomm to reconnect.');
        if (['session:map-data', 'session:intel-drops'].includes(action)) {
            if (this.pendingReplies.size >= 8) throw new Error('Please wait for the current overlay request.');
            const requestId = `overlay-request-${++this.nextRequestId}`;
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => { this.pendingReplies.delete(requestId); reject(new Error('Overlay data request timed out. Retry from the panel.')); }, 10000);
                timeout.unref?.();
                this.pendingReplies.set(requestId, { resolve, reject, timeout, panel:id });
                main.webContents.send('eye-of-zomm:overlay-command', { panel:id, action, payload:value, requestId });
            });
        }
        main.webContents.send('eye-of-zomm:overlay-command', { panel:id, action, payload:value });
        if (action === 'session:open') this.showMain();
        return { ok:true };
    }

    createPanel(id) {
        if (this.windows.has(id)) return this.windows.get(id);
        const prefs = this.preferences.panels[id];
        const win = new this.electron.BrowserWindow({
            ...prefs.bounds, minWidth:260, minHeight:id === 'timers' ? 36 : 160, maxWidth:1200, maxHeight:1200,
            title:`Eye of Zomm — ${PANEL_NAMES[id]}`, frame:false, transparent:true,
            backgroundColor:'#00000000', autoHideMenuBar:true, show:false,
            skipTaskbar:true, alwaysOnTop:true, hasShadow:false,
            resizable:!prefs.locked, movable:!prefs.locked, focusable:!prefs.passThrough,
            maximizable:false, minimizable:false, fullscreenable:false,
            webPreferences:{ preload:path.join(__dirname, 'overlay-preload.cjs'), sandbox:true,
                contextIsolation:true, nodeIntegration:false, webSecurity:true, backgroundThrottling:false,
                // Separate memory-only sessions prevent a view from reading
                // the owner's persisted storage or another panel's storage.
                partition:`eoz-overlay-${id}` }
        });
        this.windows.set(id, win);
        if(id==='map')win.webContents.session.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>callback({cancel:!allowMapRequest(details,this.origin)}));
        win.setAlwaysOnTop(true, 'screen-saver');
        win.setIgnoreMouseEvents(prefs.passThrough, { forward:true });
        win.webContents.setWindowOpenHandler(() => ({ action:'deny' }));
        win.webContents.on('will-navigate', (event, url) => { if (url !== this.panelUrl(id)) event.preventDefault(); });
        win.webContents.on('will-attach-webview', event => event.preventDefault());
        win.webContents.on('did-finish-load', () => {
            this.crashed.delete(id);
            this.ready.add(id);
            if (prefs.visible) win.showInactive();
            this.broadcast(false);
        });
        win.webContents.on('render-process-gone', () => { this.ready.delete(id); this.crashed.add(id); });
        win.on('will-move', event => { if (prefs.locked) event.preventDefault(); });
        win.on('will-resize', event => { if (prefs.locked) event.preventDefault(); });
        const saveBounds = () => {
            if (win.isDestroyed() || this.disposed) return;
            prefs.bounds = clampBounds(win.getBounds(), this.displays(), prefs.bounds, id === 'timers' ? 36 : 160);
            this.scheduleSave();
        };
        win.on('move', saveBounds);
        win.on('resize', saveBounds);
        win.on('close', event => {
            if (this.disposed) return;
            event.preventDefault();
            void this.control('hide', id).catch(this.warn);
        });
        win.on('closed', () => { this.windows.delete(id); this.ready.delete(id); this.crashed.delete(id); });
        void win.loadURL(this.panelUrl(id)).catch(error => this.warn('[Eye of Zomm] overlay load unavailable:', error?.message));
        return win;
    }

    recoverPanel(id) {
        const win = this.windows.get(id);
        if (!this.crashed.has(id) || !win || win.isDestroyed() || this.disposed) return;
        // Explicit Show is the recovery boundary. Clock ticks, monitor changes,
        // and preference updates must not cause a renderer crash/reload loop.
        this.crashed.delete(id);
        void win.loadURL(this.panelUrl(id)).catch(error => {
            if (!this.disposed && this.windows.get(id) === win && !win.isDestroyed()) this.crashed.add(id);
            this.warn('[Eye of Zomm] overlay recovery unavailable:', error?.message);
        });
    }

    async control(action, panel, value) {
        if (this.disposed) throw new Error('Overlays have closed.');
        const all = ['show-all', 'hide-all', 'unlock-all', 'restore-mouse', 'reset-layout'];
        if (action === 'show-main') { this.showMain(); return this.getState(); }
        if (action === 'appearance') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid appearance settings.');
            this.preferences.appearance = normalizeAppearance(value);
            this.timerContentHeight = null; this.fitTimerWindow();
        } else if (all.includes(action)) {
            const defaults = normalizePreferences({}, this.displays());
            for (const id of PANEL_IDS) {
                const prefs = this.preferences.panels[id];
                if (action === 'show-all') prefs.visible = true;
                if (action === 'hide-all') prefs.visible = false;
                if (action === 'unlock-all') prefs.locked = false;
                if (action === 'restore-mouse') prefs.passThrough = false;
                if (action === 'reset-layout') { prefs.bounds = defaults.panels[id].bounds; prefs.locked = false; prefs.passThrough = false; }
                if (action === 'show-all') this.recoverPanel(id);
                this.apply(id);
            }
        } else {
            const id = panelId(panel);
            if (!id) throw new Error('Unknown overlay panel.');
            const prefs = this.preferences.panels[id];
            if (action === 'show') prefs.visible = true;
            else if (action === 'hide') prefs.visible = false;
            else if (action === 'toggle') prefs.visible = !prefs.visible;
            else if (action === 'lock' && typeof value === 'boolean') prefs.locked = value;
            else if (action === 'pass-through' && typeof value === 'boolean') {
                if (value && !this.hasRecoveryControl()) throw new Error('Click-through needs a working tray or recovery shortcut.');
                prefs.passThrough = value;
            }
            else if (action === 'opacity' && typeof value === 'number' && Number.isFinite(value)) prefs.backgroundOpacity = clamp(value, 0.15, 1);
            else if (action === 'font-scale' && typeof value === 'number' && Number.isFinite(value)) prefs.fontScale = clamp(value, 0.75, 1.75);
            else throw new Error('Unknown overlay action or invalid value.');
            if (prefs.visible && (action === 'show' || action === 'toggle')) this.recoverPanel(id);
            this.apply(id);
        }
        this.broadcast();
        await this.save();
        return this.getState();
    }

    apply(id) {
        const prefs = this.preferences.panels[id];
        let win = this.windows.get(id);
        if (!win && prefs.visible) win = this.createPanel(id);
        if (!win || win.isDestroyed()) return;
        // Layout lock affects native movement and resizing only. Tab/menu mouse
        // interaction stays available until click-through is explicitly enabled.
        win.setResizable(!prefs.locked);
        win.setMovable(!prefs.locked);
        win.setFocusable(!prefs.passThrough);
        if (this.platform === 'linux' && prefs.passThrough && win.isFocused?.()) win.blur?.();
        win.setIgnoreMouseEvents(prefs.passThrough, { forward:true });
        const current = win.getBounds();
        if (Object.keys(prefs.bounds).some(key => current[key] !== prefs.bounds[key])) win.setBounds(prefs.bounds);
        if (!prefs.visible) win.hide();
        else if (this.ready.has(id)) win.showInactive();
    }

    fitTimerWindow() {
        const prefs = this.preferences?.panels.timers;
        if (!prefs) return;
        const timers = this.snapshot?.session?.timers || {};
        const count = Math.min(8, (timers.timers || []).filter(timer => timer.visible !== false).length);
        const swingHeight = timers.swing?.enabled === false ? 0 : 22;
        const notificationsHeight = Math.min(4,timers.notifications?.length || 0) * 24 + (timers.matchingStatus ? 22 : 0);
        const discoveryHeight = Math.min(4,this.snapshot?.session?.discovery?.length || 0) * 90;
        const scale = prefs.fontScale * this.preferences.appearance.fontSize / 13;
        const height = this.timerContentHeight || Math.max(36, Math.ceil(10 + count * (30 * scale + 3) + (swingHeight + notificationsHeight + discoveryHeight) * scale));
        prefs.bounds = clampBounds({ ...prefs.bounds, height }, this.displays(), prefs.bounds, 36);
        this.apply('timers');
    }

    hasVisiblePanels() { return Boolean(this.preferences && PANEL_IDS.some(id => this.preferences.panels[id].visible)); }
    hasRecoveryControl() { return Boolean(this.tray || this.recoveryShortcutRegistered); }
    markSessionUnavailable() {
        this.sessionAvailable = false;
        for (const pending of this.pendingReplies.values()) { clearTimeout(pending.timeout); pending.reject(new Error('The shared session is unavailable. Retry after reconnecting.')); }
        this.pendingReplies.clear();
        if (this.preferences) this.broadcast();
    }
    noteSessionRestart() { this.sessionRestartCount += 1; this.markSessionUnavailable(); }
    restoreBounds() {
        if (!this.preferences || this.disposed) return;
        for (const id of PANEL_IDS) {
            const prefs = this.preferences.panels[id];
            prefs.bounds = clampBounds(prefs.bounds, this.displays(), prefs.bounds, id === 'timers' ? 36 : 160);
            this.apply(id);
        }
        this.broadcast();
        this.scheduleSave();
    }
    broadcast(includeMain = true) {
        for (const [id, win] of this.windows) if (!win.isDestroyed() && this.ready.has(id)) win.webContents.send('eye-of-zomm:overlay-state', this.getState(id));
        const main = this.getMainWindow();
        if (includeMain && main && !main.isDestroyed()) main.webContents.send('eye-of-zomm:overlays-state', this.getState());
        if (includeMain) this.updateTray();
    }
    scheduleSave() {
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => { void this.save().catch(this.warn); }, 300);
        this.saveTimer.unref?.();
    }
    save() {
        clearTimeout(this.saveTimer);
        const preferences = clone(this.preferences);
        this.writeQueue = this.writeQueue.catch(() => {}).then(() => this.writePreferences(preferences));
        return this.writeQueue;
    }

    createTray() {
        try {
            const icon = this.trayIcon || this.electron.nativeImage.createFromDataURL(TRAY_ICON);
            this.tray = new this.electron.Tray(icon);
            this.tray.setToolTip('Eye of Zomm overlays');
            this.tray.on('double-click', () => this.showMain());
            this.updateTray();
        } catch (error) {
            // Construction can succeed before tooltip/menu initialization
            // fails. A partial tray cannot serve as a recovery control.
            const failedTray=this.tray;this.tray=null;
            try { failedTray?.destroy(); } catch {}
            this.warn('[Eye of Zomm] overlay tray unavailable:', error?.message);
        }
    }
    updateTray() {
        if (!this.tray || this.disposed) return;
        const action = (name, id) => () => { void this.control(name, id).catch(this.warn); };
        this.tray.setContextMenu(this.electron.Menu.buildFromTemplate([
            { label:'Open Eye of Zomm', click:() => this.showMain() }, { type:'separator' },
            ...PANEL_IDS.map(id => ({ label:PANEL_NAMES[id], type:'checkbox', checked:this.preferences.panels[id].visible, click:action('toggle', id) })),
            { type:'separator' }, { label:'Show all overlays', click:action('show-all') }, { label:'Hide all overlays', click:action('hide-all') },
            { label:'Unlock all overlays', click:action('unlock-all') }, { label:'Restore overlay mouse interaction', click:action('restore-mouse') },
            { label:'Reset overlay positions', click:action('reset-layout') }, { type:'separator' },
            { label:'Quit Eye of Zomm', click:() => this.electron.app.quit() }
        ]));
    }
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.markSessionUnavailable();
        clearInterval(this.staleTimer);
        clearTimeout(this.saveTimer);
        void this.save().catch(this.warn);
        this.electron.ipcMain.removeHandler(IPC_MAIN);
        this.electron.ipcMain.removeHandler(IPC_OVERLAY);
        if (this.recoveryShortcutRegistered) this.electron.globalShortcut.unregister(RECOVERY_SHORTCUT);
        for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) this.electron.screen.removeListener(event, this.onDisplaysChanged);
        this.tray?.destroy();
        for (const win of this.windows.values()) if (!win.isDestroyed()) win.destroy();
        this.windows.clear();
        this.crashed.clear();
    }
}

module.exports = { OverlayHost, PANEL_IDS, IPC_MAIN, IPC_OVERLAY, RECOVERY_SHORTCUT,
    clampBounds, normalizePreferences, sessionCommand };
