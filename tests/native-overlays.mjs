import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { OverlayHost, PANEL_IDS, RECOVERY_SHORTCUT, clampBounds, normalizePreferences, sessionCommand } = require('../desktop/overlay-host.cjs');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const display = (x = 0, y = 0, width = 1920, height = 1040) => ({ workArea:{ x, y, width, height } });

class Contents extends EventEmitter {
    constructor() { super(); this.mainFrame = { url:'' }; this.sent = []; }
    setWindowOpenHandler(handler) { this.openHandler = handler; }
    send(...args) { this.sent.push(args); }
}
class Window extends EventEmitter {
    constructor(options = {}) { super(); this.options = options; this.webContents = new Contents(); this.bounds = { x:options.x, y:options.y, width:options.width, height:options.height }; this.visible = false; this.destroyed = false; this.nativeCalls = []; }
    isDestroyed() { return this.destroyed; }
    getBounds() { return { ...this.bounds }; }
    setBounds(value) { this.bounds = { ...value }; this.emit('resize'); }
    setAlwaysOnTop(...args) { this.nativeCalls.push(['top', ...args]); }
    setSkipTaskbar() {}
    isMinimized() { return false; }
    restore() {}
    show() { this.visible = true; }
    focus() {}
    setIgnoreMouseEvents(...args) { this.ignoreMouse = args[0]; this.nativeCalls.push(['ignore-mouse', ...args]); }
    setResizable(value) { this.resizable = value; }
    setMovable(value) { this.movable = value; }
    setFocusable(value) { this.focusable = value; }
    showInactive() { this.visible = true; this.nativeCalls.push(['show-inactive']); }
    hide() { this.visible = false; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    async loadURL(url) { this.loadedUrls ||= []; this.loadedUrls.push(url); this.webContents.mainFrame.url = url; queueMicrotask(() => this.webContents.emit('did-finish-load')); }
}

async function fixture(run, { saved = {}, shortcut = true, tray = true } = {}) {
    const handlers = new Map(), writes = [], nativeWindows = [], commands = [], warnings = [];
    const screen = new EventEmitter(); screen.displays = [display(), display(1920)]; screen.getAllDisplays = () => screen.displays;
    const main = new Window(); main.webContents.mainFrame.url = 'http://127.0.0.1:53147/';
    main.webContents.send = (...args) => commands.push(args);
    let shown = 0, quit = 0, shortcutHandler, unregister = '';
    const electron = {
        app:{ quit:() => { quit += 1; } }, screen,
        BrowserWindow:class extends Window { constructor(options) { super(options); nativeWindows.push(this); } },
        ipcMain:{ handle:(channel, handler) => handlers.set(channel, handler), removeHandler:channel => handlers.delete(channel) },
        nativeImage:{ createFromDataURL:value => value },
        Tray:class extends EventEmitter { constructor() { super(); if (!tray) throw new Error('No system tray'); } setToolTip() {} setContextMenu(menu) { this.menu = menu; } destroy() { this.destroyed = true; } },
        Menu:{ buildFromTemplate:value => value },
        globalShortcut:{ register:(name, handler) => { assert.equal(name, RECOVERY_SHORTCUT); shortcutHandler = handler; return shortcut; }, unregister:name => { unregister = name; } }
    };
    let now = 123000;
    const host = new OverlayHost({ electron, origin:'http://127.0.0.1:53147', getMainWindow:() => main,
        showMain:() => { shown += 1; }, readPreferences:async () => saved,
        writePreferences:async value => writes.push(value), now:() => now, warn:(...args) => warnings.push(args) });
    await host.initialize();
    const mainEvent = { sender:main.webContents, senderFrame:main.webContents.mainFrame };
    const overlayEvent = id => { const win = host.windows.get(id); return { sender:win.webContents, senderFrame:win.webContents.mainFrame }; };
    try { await run({ host, electron, main, mainEvent, overlayEvent, writes, commands, nativeWindows, handlers, screen, warnings,
        shown:() => shown, quit:() => quit, recover:() => shortcutHandler(), setNow:value => { now = value; } }); }
    finally { host.dispose(); await host.writeQueue; if (shortcut) assert.equal(unregister, RECOVERY_SHORTCUT); }
}

const publish = (host, event) => host.handleMainRequest(event, 'publish', {
    schemaVersion:1, sessionId:'synthetic-session', sequence:1, at:123000,
    session:{ character:'Fixture', zone:'Unrest', parse:{ live:{ damage:12 } }, timers:{ entries:[] } }
});

test('stored preferences are bounded and contain no session/log data', () => {
    const prefs = normalizePreferences({ panels:{ parse:{ visible:true, locked:false, passThrough:true,
        backgroundOpacity:4, fontScale:-1, bounds:{ x:999999, y:-9999, width:99999, height:Infinity }, unsafe:'ignored' } }, snapshot:{ private:'never store' } }, [display()]);
    assert.deepEqual(Object.keys(prefs), ['schemaVersion', 'panels']);
    assert.equal(prefs.panels.parse.visible, true); assert.equal(prefs.panels.parse.locked, false);
    assert.equal(prefs.panels.parse.backgroundOpacity, 1); assert.equal(prefs.panels.parse.fontScale, 0.75);
    assert.deepEqual(prefs.panels.parse.bounds, { x:720, y:0, width:1200, height:220 });
    assert.equal(prefs.panels.parse.unsafe, undefined);
    assert.equal(normalizePreferences({}, [display()]).panels.timers.visible, false);
});

test('bounds stay on the correct monitor and recover after disconnection', () => {
    assert.deepEqual(clampBounds({ x:2200, y:100, width:400, height:500 }, [display(), display(1920)]), { x:2200, y:100, width:400, height:500 });
    assert.deepEqual(clampBounds({ x:2200, y:100, width:400, height:500 }, [display()]), { x:1520, y:100, width:400, height:500 });
    assert.deepEqual(clampBounds({ x:-500, y:-100, width:800, height:900 }, [display(-1280, -900, 1280, 900)]), { x:-800, y:-900, width:800, height:900 });
});

test('fresh layouts keep compact timers below the parse without overlapping other panels', () => {
    for (const [width, height] of [[1280, 720], [1920, 1080]]) {
        const panels = normalizePreferences({}, [display(0, 0, width, height)]).panels;
        const rectangles = PANEL_IDS.map(id => panels[id].bounds);
        for (let index = 0; index < rectangles.length; index++) {
            const bounds = rectangles[index];
            assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
            assert(bounds.width >= 260 && bounds.height >= (PANEL_IDS[index] === 'timers' ? 36 : 160));
            for (const other of rectangles.slice(index + 1)) {
                const overlap = Math.max(0, Math.min(bounds.x + bounds.width, other.x + other.width) - Math.max(bounds.x, other.x)) *
                    Math.max(0, Math.min(bounds.y + bounds.height, other.y + other.height) - Math.max(bounds.y, other.y));
                assert.equal(overlap, 0, `fresh panels overlap at ${width}×${height}`);
            }
        }
        assert(panels.parse.bounds.x < panels.intel.bounds.x);
        assert(panels.parse.bounds.y < panels.timers.bounds.y);
        assert(panels.intel.bounds.y < panels.consider.bounds.y);
        const saved = { x:120, y:100, width:460, height:390 };
        assert.deepEqual(normalizePreferences({ panels:{ parse:{ bounds:saved } } }, [display(0, 0, width, height)]).panels.parse.bounds, saved);
    }
    const tiny = normalizePreferences({}, [display(0, 0, 300, 200)]);
    for (const prefs of Object.values(tiny.panels)) {
        const bounds = prefs.bounds;
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 300 && bounds.y + bounds.height <= 200);
    }
});

test('timer windows fit only visible countdown rows and the swing bar without a large minimum height', () => fixture(async ({ host, mainEvent }) => {
    await host.control('show', 'timers');
    const sendTimers = timers => host.handleMainRequest(mainEvent, 'publish', {
        schemaVersion:1, session:{ timers }
    });
    await sendTimers({ timers:[], swing:{ enabled:false } });
    assert.equal(host.windows.get('timers').getBounds().height, 36);
    assert.equal(host.windows.get('timers').options.minHeight, 36);
    await sendTimers({ timers:[{ visible:true }, { visible:false }, { visible:true }], swing:{ enabled:true } });
    assert.equal(host.windows.get('timers').getBounds().height, 98);
    await sendTimers({ timers:Array.from({ length:100 }, () => ({ visible:true })), swing:{ enabled:true } });
    assert.equal(host.windows.get('timers').getBounds().height, 296, 'eight visible rows cap the panel and leave scrolling');
    await host.control('font-scale', 'timers', 1.3);
    await sendTimers({ timers:[{ visible:true }], swing:{ enabled:true } });
    assert.equal(host.windows.get('timers').getBounds().height, 81);
}));

test('startup restores only the selected native panels with their independent lock and mouse state', () => fixture(async ({ host, nativeWindows }) => {
    assert.equal(nativeWindows.length, 1);
    assert.equal(host.windows.has('parse'), true);
    assert.equal(host.windows.has('intel'), false);
    const win = host.windows.get('parse');
    assert.equal(win.visible, true); assert.equal(win.ignoreMouse, true);
    assert.equal(win.options.focusable, false);
    assert.equal(win.options.movable, false); assert.equal(win.options.resizable, false);
    assert.deepEqual(win.getBounds(), { x:2200, y:100, width:400, height:300 });
    assert.equal(host.getState().panels.parse.backgroundOpacity, 0.6);
    assert.equal(host.getState().panels.parse.fontScale, 1.25);
}, { saved:{ panels:{ parse:{ visible:true, locked:true, passThrough:true,
    backgroundOpacity:0.6, fontScale:1.25, bounds:{ x:2200, y:100, width:400, height:300 } } } } }));

test('reset positions applies the same four-corner defaults and restores editing and mouse input', () => fixture(async ({ host, screen }) => {
    await host.control('show-all');
    await host.control('pass-through', 'parse', true);
    await host.control('reset-layout');
    const fresh = normalizePreferences({}, screen.displays).panels;
    for (const id of PANEL_IDS) {
        const prefs = host.getState().panels[id];
        assert.deepEqual(prefs.bounds, fresh[id].bounds);
        assert.equal(prefs.visible, true); assert.equal(prefs.locked, false); assert.equal(prefs.passThrough, false);
        assert.deepEqual(host.windows.get(id).getBounds(), fresh[id].bounds);
    }
}, { saved:{ panels:{ parse:{ visible:true, bounds:{ x:300, y:300, width:700, height:600 } } } } }));

test('every panel is a separate hardened native window without a parent', () => fixture(async ({ host, nativeWindows, overlayEvent }) => {
    assert.equal(nativeWindows.length, 0, 'native panels are opt-in on the first launch');
    await host.control('show-all');
    assert.equal(nativeWindows.length, 4);
    assert.deepEqual([...host.windows.keys()], PANEL_IDS);
    for (const [id, win] of host.windows) {
        assert.equal(win.options.parent, undefined);
        assert.equal(win.options.frame, false); assert.equal(win.options.transparent, true);
        assert.equal(win.options.webPreferences.sandbox, true); assert.equal(win.options.webPreferences.contextIsolation, true);
        assert.equal(win.options.webPreferences.nodeIntegration, false); assert.equal(win.options.webPreferences.backgroundThrottling, false);
        assert.equal(win.options.webPreferences.partition, `eoz-overlay-${id}`);
        assert.equal(win.options.webPreferences.partition.startsWith('persist:'), false);
        assert.match(win.options.webPreferences.preload, /overlay-preload\.cjs$/);
        assert.equal(win.visible, true);
        assert.equal(win.nativeCalls.some(value => value[0] === 'show-inactive'), true);
        assert.equal(win.openHandler, undefined);
        assert.deepEqual(win.webContents.openHandler({ url:'https://example.com' }), { action:'deny' });
        let prevented = false;
        win.webContents.emit('will-navigate', { preventDefault:() => { prevented = true; } }, 'https://example.com');
        assert.equal(prevented, true);
        assert.equal((await host.handleOverlayRequest(overlayEvent(id), 'get-state')).panel, id);
    }
}));

test('layout lock and click-through are independent and type checked', () => fixture(async ({ host }) => {
    await host.control('show', 'parse');
    const win = host.windows.get('parse');
    assert.equal(win.resizable, false); assert.equal(win.movable, false); assert.equal(win.focusable, true);
    assert.equal(win.ignoreMouse, false);
    let prevented = false;
    win.emit('will-move', { preventDefault:() => { prevented = true; } }); assert.equal(prevented, true);
    await host.control('lock', 'parse', false);
    assert.equal(win.resizable, true); assert.equal(win.movable, true); assert.equal(win.focusable, true);
    await host.control('pass-through', 'parse', true);
    assert.equal(win.ignoreMouse, true); assert.equal(win.focusable, false); assert.equal(host.getState().panels.parse.locked, false);
    await host.control('lock', 'parse', true);
    assert.equal(win.ignoreMouse, true);
    await host.control('pass-through', 'parse', false);
    assert.equal(win.focusable, true); assert.equal(win.resizable, false); assert.equal(win.movable, false);
    await assert.rejects(host.control('lock', 'parse', 'false'), /invalid/);
    await assert.rejects(host.control('opacity', 'parse', NaN), /invalid/);
    await host.control('opacity', 'parse', 0.01); assert.equal(host.getState().panels.parse.backgroundOpacity, 0.15);
    await host.control('font-scale', 'parse', 9); assert.equal(host.getState().panels.parse.fontScale, 1.75);
}));

test('the host accepts snapshots only from the exact main root frame', () => fixture(async ({ host, mainEvent, overlayEvent }) => {
    await host.control('show', 'intel');
    await publish(host, mainEvent);
    assert.equal(host.getState().sessionAvailable, true);
    await assert.rejects(publish(host, overlayEvent('intel')), /unavailable/);
    await assert.rejects(publish(host, { sender:mainEvent.sender, senderFrame:{ url:mainEvent.senderFrame.url } }), /unavailable/);
    await assert.rejects(publish(host, { sender:{}, senderFrame:mainEvent.senderFrame }), /unavailable/);
    await assert.rejects(host.handleMainRequest(mainEvent, 'publish', { schemaVersion:1, session:{}, tooBig:'x'.repeat(2 * 1024 * 1024) }), /too large/);
    mainEvent.senderFrame.url = 'http://127.0.0.1:53147/zoneviewer/viewer.html';
    await assert.rejects(publish(host, mainEvent), /unavailable/);
}));

test('overlay IPC rejects sibling iframes, navigated windows, and unrelated senders', () => fixture(async ({ host, overlayEvent }) => {
    await host.control('show', 'intel');
    const event = overlayEvent('intel');
    await assert.rejects(host.handleOverlayRequest({ sender:event.sender, senderFrame:{ url:event.senderFrame.url } }, 'get-state'), /unavailable/);
    await assert.rejects(host.handleOverlayRequest({ sender:{}, senderFrame:event.senderFrame }, 'get-state'), /unavailable/);
    event.senderFrame.url = 'http://127.0.0.1:53147/';
    await assert.rejects(host.handleOverlayRequest(event, 'get-state'), /unavailable/);
}));

test('only bounded allowlisted session commands reach the existing main renderer', () => fixture(async ({ host, mainEvent, overlayEvent, commands, nativeWindows }) => {
    await host.control('show', 'intel');
    const event = overlayEvent('intel');
    await assert.rejects(host.handleOverlayRequest(event, 'session:route', { npc:'Fixture' }), /unavailable/);
    await publish(host, mainEvent);
    await host.handleOverlayRequest(event, 'session:route', { npc:'Fixture', zone:'Unrest' });
    assert.deepEqual(commands.at(-1), ['eye-of-zomm:overlay-command', { panel:'intel', action:'session:route', payload:{ npc:'Fixture', zone:'Unrest' } }]);
    await host.handleOverlayRequest(event, 'timer:start', { definitionId:'fixture' });
    assert.equal(commands.at(-1)[1].action, 'timer:start');
    await assert.rejects(host.handleOverlayRequest(event, 'app-update:install', {}), /Unknown/);
    await assert.rejects(host.handleOverlayRequest(event, 'timer:unsafe', {}), /Unknown/);
    await assert.rejects(host.handleOverlayRequest(event, 'session:route', { npc:{ name:'Not accepted' } }), /Invalid/);
    await assert.rejects(host.handleOverlayRequest(event, 'session:open', { view:'external' }), /Unknown/);
    await assert.rejects(host.handleOverlayRequest(event, 'timer:start', { huge:'x'.repeat(16384) }), /too large/);
    assert.equal(nativeWindows.length, 1, 'session actions must not create another main parser window');
}));

test('close hides only its own panel and preference saves never include the session', () => fixture(async ({ host, mainEvent, writes }) => {
    await host.control('show-all'); await publish(host, mainEvent);
    let prevented = false;
    host.windows.get('parse').emit('close', { preventDefault:() => { prevented = true; } });
    await host.writeQueue;
    assert.equal(prevented, true);
    assert.equal(host.getState().panels.parse.visible, false);
    assert.equal(host.getState().panels.intel.visible, true);
    assert.equal(host.hasVisiblePanels(), true);
    assert(writes.length > 0);
    for (const saved of writes) assert.deepEqual(Object.keys(saved), ['schemaVersion', 'panels']);
    await host.control('hide-all'); assert.equal(host.hasVisiblePanels(), false);
}));

test('monitor removal restores every visible native window into a surviving work area', () => fixture(async ({ host, screen }) => {
    await host.control('show', 'parse');
    const win = host.windows.get('parse');
    win.bounds = { x:2400, y:100, width:380, height:300 }; win.emit('move');
    screen.displays = [display()]; screen.emit('display-removed');
    assert.deepEqual(win.getBounds(), { x:1540, y:100, width:380, height:300 });
    assert.deepEqual(host.getState().panels.parse.bounds, win.getBounds());
}));

test('tray and registered shortcut restore click-through and unlock without game input', () => fixture(async ({ host, recover, shown, quit }) => {
    await host.control('show', 'timers');
    await host.control('pass-through', 'timers', true);
    recover(); await new Promise(resolve => setImmediate(resolve));
    assert.equal(host.getState().panels.timers.passThrough, false);
    assert.equal(host.getState().panels.timers.locked, false);
    assert.equal(shown(), 1);
    const menu = host.tray.menu;
    menu.find(item => item.label === 'Quit Eye of Zomm').click(); assert.equal(quit(), 1);
}));

test('an unavailable shortcut is reported while tray recovery remains usable', () => fixture(async ({ host }) => {
    assert.equal(host.getState().recoveryShortcutRegistered, false);
    assert.equal(host.hasRecoveryControl(), true);
    await host.control('pass-through', 'timers', true);
    host.tray.menu.find(item => item.label === 'Restore overlay mouse interaction').click();
    await host.writeQueue;
    assert.equal(host.getState().panels.timers.passThrough, false);
}, { shortcut:false }));

test('when both recovery controls fail, saved click-through is cleared and enabling it is rejected', () => fixture(async ({ host, warnings }) => {
    assert.equal(host.hasRecoveryControl(), false);
    assert.equal(host.getState().panels.parse.passThrough, false);
    await assert.rejects(host.control('pass-through', 'parse', true), /working tray/);
    assert(warnings.some(value => String(value).includes('click-through is disabled')));
}, { shortcut:false, tray:false, saved:{ panels:{ parse:{ visible:true, passThrough:true } } } }));

test('session loss is explicit, keeps the last display, and rejects stale session actions', () => fixture(async ({ host, mainEvent, overlayEvent }) => {
    await host.control('show', 'parse'); await publish(host, mainEvent);
    host.markSessionUnavailable();
    const state = await host.handleOverlayRequest(overlayEvent('parse'), 'get-state');
    assert.equal(state.sessionAvailable, false); assert.equal(state.snapshot.session.character, 'Fixture');
    await assert.rejects(host.handleOverlayRequest(overlayEvent('parse'), 'timer:cancel-all', {}), /unavailable/);
    await host.handleOverlayRequest(overlayEvent('parse'), 'show-main');
    await publish(host, mainEvent); assert.equal(host.getState().sessionAvailable, true);
}));

test('the session window hides only while recoverable panels remain and otherwise quits with hidden windows', async () => {
    const mainPath = new URL('../desktop/main.cjs', import.meta.url);
    const nativeRequire = createRequire(mainPath);
    const windows = [];
    const state = { visible:true, recovery:true, restarts:0 };
    let quits = 0;
    const context = vm.createContext({
        require:name => name === 'electron' ? {
            app:{ getVersion:() => '0.8.2', getPath:() => '', requestSingleInstanceLock:() => false, quit:() => { quits += 1; }, on() {} },
            BrowserWindow:class extends Window { constructor(options) { super(options); windows.push(this); } },
            ipcMain:{ handle() {} }
        } : nativeRequire(name),
        __dirname:path.dirname(fileURLToPath(mainPath)), process, console, Buffer, URL,
        fixtureHost:{ hasVisiblePanels:() => state.visible, hasRecoveryControl:() => state.recovery, markSessionUnavailable() {}, noteSessionRestart:() => { state.restarts += 1; } }
    });
    vm.runInContext(await readFile(mainPath, 'utf8'), context);
    vm.runInContext('overlayHost = fixtureHost; createWindow({});', context);
    const win = windows[0];
    assert.equal(win.options.webPreferences.backgroundThrottling, false);
    win.webContents.emit('render-process-gone');
    assert.equal(win.loadedUrls.length, 1, 'a crash must not reload without an explicit recovery action');
    vm.runInContext('showMainWindow()', context);
    assert.equal(win.loadedUrls.length, 2);
    assert.equal(win.loadedUrls[1], 'http://127.0.0.1:53147/');
    assert.equal(state.restarts, 1);
    vm.runInContext('showMainWindow()', context);
    assert.equal(win.loadedUrls.length, 2, 'a healthy owner is shown without reloading');
    win.webContents.emit('unresponsive');
    assert.equal(win.loadedUrls.length, 2);
    vm.runInContext('showMainWindow()', context);
    assert.equal(win.loadedUrls.length, 3); assert.equal(state.restarts, 2);
    win.webContents.emit('unresponsive');
    win.webContents.emit('responsive');
    vm.runInContext('showMainWindow()', context);
    assert.equal(win.loadedUrls.length, 3, 'a transient stall that recovered must not discard its healthy owner');
    let prevented = false;
    win.emit('close', { preventDefault:() => { prevented = true; } });
    assert.equal(prevented, true); assert.equal(win.visible, false);
    state.visible = false;
    prevented = false;
    win.emit('close', { preventDefault:() => { prevented = true; } });
    assert.equal(prevented, false);
    const before = quits;
    win.emit('closed');
    assert.equal(quits, before + 1, 'hidden native panels must not keep an ownerless session alive');
    vm.runInContext('createWindow({});', context);
    state.visible = true; state.recovery = false;
    prevented = false;
    windows[1].emit('close', { preventDefault:() => { prevented = true; } });
    assert.equal(prevented, false, 'the main window must not hide when recovery controls failed');
});

test('overlay preload exposes no filesystem, updater, raw IPC, or Electron event objects', async () => {
    const exposed = {}, invoked = [], listeners = new Map();
    const preload = await readFile(new URL('../desktop/overlay-preload.cjs', import.meta.url), 'utf8');
    vm.runInNewContext(preload, { require:name => {
        assert.equal(name, 'electron');
        return { contextBridge:{ exposeInMainWorld:(key, value) => { exposed[key] = value; } }, ipcRenderer:{
            invoke:(...args) => { invoked.push(args); }, on:(channel, callback) => listeners.set(channel, callback),
            removeListener:(channel, callback) => { assert.equal(listeners.get(channel), callback); listeners.delete(channel); }
        } };
    } });
    assert.deepEqual(Object.keys(exposed), ['eyeOfZommOverlay']);
    const bridge = exposed.eyeOfZommOverlay;
    assert.deepEqual(Object.keys(bridge), ['getState', 'onState', 'action']);
    bridge.getState(); bridge.action('hide');
    assert.deepEqual(invoked, [['eye-of-zomm:overlay', 'get-state'], ['eye-of-zomm:overlay', 'hide', undefined]]);
    let received;
    const unsubscribe = bridge.onState(value => { received = value; });
    listeners.get('eye-of-zomm:overlay-state')({ secret:'Electron event' }, { panel:'parse' });
    assert.deepEqual(received, { panel:'parse' });
    unsubscribe(); assert.equal(listeners.size, 0);
});

test('malformed command objects do not escape the command allowlist', () => {
    assert.throws(() => sessionCommand('session:class-filter', { panel:'timers', enabled:true }), /Invalid/);
    assert.throws(() => sessionCommand('timer:start', []), /object/);
    assert.throws(() => sessionCommand('session:wiki', { npc:'x'.repeat(241) }), /Invalid/);
    assert.throws(() => sessionCommand('eye-of-zomm:window', {}), /Unknown/);
});

test('authoritative route actions recheck zone and path opt-in after every UI await', async () => {
    const source = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function handleOverlayCommand(');
    const end = source.indexOf('\nfunction currentEraIndex(', start);
    assert(start >= 0 && end > start, 'Missing authoritative application handler.');
    async function routeFixture({ changeAt, changeZone = false, disablePaths = false, minimal = false } = {}) {
        let zone = 'Unrest';
        const routes = [];
        const settings = { minimalRoutingVisible:true };
        const mutate = stage => {
            if (stage !== changeAt) return;
            if (changeZone) zone = 'Befallen';
            if (disablePaths) settings.minimalRoutingVisible = false;
        };
        const context = vm.createContext({
            state:() => ({ zone }), zoneKey:value => String(value).toLowerCase(), settings,
            npcRecordForName:(name, requestedZone) => name === 'a synthetic guard' ? { name, zone:requestedZone } : null,
            window:{ eyeOfZommOverlays:{ control:async action => { assert.equal(action, 'show-main'); mutate('show'); } } },
            document:{ body:{ classList:{ contains:() => minimal } } },
            toggleMinimalMode:async () => { minimal = false; mutate('toggle'); },
            pathToNpc:async name => { routes.push({ name, zone }); }
        });
        vm.runInContext(source.slice(start, end), context);
        return { routes, run:() => context.handleOverlayCommand({ action:'session:route',
            payload:{ npc:'a synthetic guard', zone:'Unrest', loc:[9999, 9999, 9999] } }) };
    }
    for (const changeAt of ['show', 'toggle']) {
        const zoned = await routeFixture({ changeAt, changeZone:true, minimal:true });
        await assert.rejects(zoned.run(), /previous zone/);
        assert.equal(zoned.routes.length, 0, `a zone change during ${changeAt} must not reuse the stale target`);
        const disabled = await routeFixture({ changeAt, disablePaths:true, minimal:true });
        await assert.rejects(disabled.run(), /disabled/);
        assert.equal(disabled.routes.length, 0, `disabling routes during ${changeAt} must not bypass the opt-in`);
    }
    const valid = await routeFixture({ minimal:true });
    await valid.run();
    assert.deepEqual(valid.routes, [{ name:'a synthetic guard', zone:'Unrest' }]);
});

let failures = 0;
for (const { name, run } of tests) {
    try { await run(); console.log(`PASS native overlays: ${name}`); }
    catch (error) { failures += 1; console.error(`FAIL native overlays: ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
