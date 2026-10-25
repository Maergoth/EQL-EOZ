import assert from 'node:assert/strict';
import './win32-hit-test-probe.mjs';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { OverlayHost, PANEL_IDS, RECOVERY_SHORTCUT, clampBounds, normalizePreferences, sessionCommand, globalOverlayMode, snapTriggersBounds } = require('../desktop/overlay-host.cjs');
const tests = [];
const test = (name, run) => tests.push({ name, run });
const display = (x = 0, y = 0, width = 1920, height = 1040) => ({ workArea:{ x, y, width, height } });

class Contents extends EventEmitter {
    constructor() { super(); this.mainFrame = { url:'' }; this.sent = [];this.session={
        webRequest:{onBeforeRequest:(_filter,callback)=>{this.requestPolicy=callback;}},
        setPermissionRequestHandler:callback=>{this.permissionRequest=callback;},
        setPermissionCheckHandler:callback=>{this.permissionCheck=callback;}}; }
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
    isMaximized() { return false; }
    restore() {}
    show() { this.visible = true; }
    focus() { this.nativeCalls.push(['focus']); }
    setIgnoreMouseEvents(...args) { this.ignoreMouse = args[0]; this.nativeCalls.push(['ignore-mouse', ...args]); }
    setResizable(value) { this.resizable = value; }
    setMovable(value) { this.movable = value; }
    setFocusable(value) { this.focusable = value; }
    showInactive() { this.visible = true; this.nativeCalls.push(['show-inactive']); }
    hide() { this.visible = false; }
    destroy() { this.destroyed = true; this.emit('closed'); }
    async loadURL(url) { this.loadedUrls ||= []; this.loadedUrls.push(url); this.webContents.mainFrame.url = url; queueMicrotask(() => this.webContents.emit('did-finish-load')); }
}

async function fixture(run, { saved = {}, shortcut = true, tray = true, trayFailure = null, platform } = {}) {
    const handlers = new Map(), writes = [], nativeWindows = [], nativeTrays = [], commands = [], warnings = [];
    const screen = new EventEmitter(); screen.displays = [display(), display(1920)]; screen.getAllDisplays = () => screen.displays;
    const main = new Window(); main.webContents.mainFrame.url = 'http://127.0.0.1:53147/';
    main.webContents.send = (...args) => commands.push(args);
    let shown = 0, quit = 0, shortcutHandler, unregister = '';
    const electron = {
        app:{ quit:() => { quit += 1; } }, screen,
        BrowserWindow:class extends Window { constructor(options) { super(options); nativeWindows.push(this); } },
        ipcMain:{ handle:(channel, handler) => handlers.set(channel, handler), removeHandler:channel => handlers.delete(channel) },
        nativeImage:{ createFromDataURL:value => value },
        Tray:class extends EventEmitter { constructor() { super(); if (!tray) throw new Error('No system tray');nativeTrays.push(this); } setToolTip() {if(trayFailure==='tooltip')throw Error('Synthetic tooltip failure');} setContextMenu(menu) {if(trayFailure==='menu')throw Error('Synthetic menu failure');this.menu = menu; } destroy() { this.destroyed = true; } },
        Menu:{ buildFromTemplate:value => value },
        globalShortcut:{ register:(name, handler) => { assert.equal(name, RECOVERY_SHORTCUT); shortcutHandler = handler; return shortcut; }, unregister:name => { unregister = name; } }
    };
    let now = 123000;
    const host = new OverlayHost({ electron, origin:'http://127.0.0.1:53147', getMainWindow:() => main,
        showMain:() => { shown += 1; }, readPreferences:async () => saved,
        writePreferences:async value => writes.push(value), now:() => now, warn:(...args) => warnings.push(args), platform });
    await host.initialize();
    const mainEvent = { sender:main.webContents, senderFrame:main.webContents.mainFrame };
    const overlayEvent = id => { const win = host.windows.get(id); return { sender:win.webContents, senderFrame:win.webContents.mainFrame }; };
    try { await run({ host, electron, main, mainEvent, overlayEvent, writes, commands, nativeWindows, nativeTrays, handlers, screen, warnings,
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
    assert.deepEqual(Object.keys(prefs), ['schemaVersion', 'appearance', 'panels']);
    assert.equal(prefs.panels.parse.visible, true); assert.equal(prefs.panels.parse.locked, false);
    assert.equal(prefs.panels.parse.backgroundOpacity, 1); assert.equal(prefs.panels.parse.fontScale, 0.75);
    assert.deepEqual(prefs.panels.parse.bounds, { x:720, y:0, width:1200, height:220 });
    assert.equal(prefs.panels.parse.unsafe, undefined);
    assert.equal(normalizePreferences({}, [display()]).panels.timers.visible, false);
});

test('upgrading a visible Consider panel enables Map with fresh defaults and preserves explicit choices', () => {
    const screens=[display()], defaults=normalizePreferences({},screens);
    const parse={visible:true,locked:false,backgroundOpacity:0.65,bounds:{x:120,y:100,width:460,height:390}};
    const migrated=normalizePreferences({panels:{parse,consider:{visible:true,locked:false,passThrough:true,
        backgroundOpacity:0.3,fontScale:1.6,bounds:{x:900,y:600,width:300,height:180}}}},screens);
    assert.deepEqual(migrated.panels.map,{...defaults.panels.map,visible:true},'Only visibility transfers from the retired panel');
    assert.deepEqual(migrated.panels.parse,normalizePreferences({panels:{parse}},screens).panels.parse);
    assert.equal(migrated.panels.consider,undefined);
    assert.deepEqual(Object.keys(migrated.panels),PANEL_IDS);
    assert.deepEqual(normalizePreferences(migrated,screens),migrated,'Saving normalized preferences makes migration stable');
    assert.equal(normalizePreferences({panels:{consider:{visible:true},map:{visible:false}}},screens).panels.map.visible,false);
    assert(Object.values(defaults.panels).every(panel=>panel.visible===false),'New profiles keep every native panel opt-in');
});

test('persisting upgraded preferences removes the retired Consider panel', () => fixture(async ({host,writes}) => {
    assert.equal(host.preferences.panels.map.visible,true);
    assert.equal(host.windows.has('map'),true);
    assert.equal(host.windows.has('consider'),false);
    await host.save();
    assert.equal(writes.at(-1).panels.consider,undefined);
    assert.equal(writes.at(-1).panels.map.visible,true);
}, {saved:{panels:{consider:{visible:true}}}}));

test('global cycle resolves mixed states and changes every known panel atomically', () => fixture(async ({host,writes,mainEvent,nativeWindows}) => {
    assert.equal(host.getState().globalMode,'hidden');assert.equal(nativeWindows.length,0);
    const preserved=JSON.parse(JSON.stringify(host.getState().panels));
    for(const expected of ['unlocked','locked','hidden','unlocked']){
        const state=await host.handleMainRequest(mainEvent,'control',{action:'cycle-all'});
        assert.equal(state.globalMode,expected);
        for(const id of PANEL_IDS){const prefs=state.panels[id],win=host.windows.get(id);assert.equal(prefs.visible,expected!=='hidden',`${id} visibility in ${expected}`);if(expected!=='hidden')assert.equal(prefs.locked,expected==='locked');assert.equal(win.resizable,false,'transparent windows use explicit renderer resize regions');assert.equal(win.movable,!prefs.locked);assert.equal(win.nativeCalls.some(call=>call[0]==='focus'),false);assert.deepEqual(prefs.bounds,preserved[id].bounds);assert.equal(prefs.passThrough,preserved[id].passThrough);assert.equal(prefs.fontScale,preserved[id].fontScale);assert.equal(prefs.backgroundOpacity,preserved[id].backgroundOpacity);}
        assert.equal(writes.at(-1).panels.map.visible,expected!=='hidden','one saved owner state includes panels that were never individually opened');
    }
    await host.control('cycle-all');await host.control('hide','map');assert.equal(host.getState().globalMode,'locked','a partially visible locked set resolves deterministically');
    await host.control('lock','map',false);assert.equal(host.getState().globalMode,'unlocked','a hidden unlocked panel is included in global state');
    await host.control('pass-through','parse',true);await host.control('cycle-all');assert.equal(host.getState().globalMode,'locked');assert.equal(host.getState().panels.parse.passThrough,true,'locking retains explicit Ignore mouse');
    await host.control('cycle-all');assert.equal(host.getState().globalMode,'hidden');assert.equal(host.getState().panels.parse.passThrough,true,'hiding retains explicit Ignore mouse');
    await host.control('cycle-all');assert.equal(host.getState().globalMode,'unlocked');assert(Object.values(host.getState().panels).every(panel=>panel.passThrough===false),'global layout editing restores mouse input on all four panels');
    assert.deepEqual([...host.windows.keys()],PANEL_IDS);assert.equal(nativeWindows.length,4,'cycles reuse existing windows');
}));

test('global mode ignores unknown panel IDs and hidden takes precedence over old lock settings',()=>{
    assert.equal(globalOverlayMode({retired:{visible:true,locked:false}}),'hidden');
    assert.equal(globalOverlayMode({parse:{visible:false,locked:false}}),'hidden');
    assert.equal(globalOverlayMode({parse:{visible:true,locked:true},map:{visible:false,locked:false}}),'unlocked');
});

test('Triggers magnet uses current Parse bounds, resize edges and one monitor only',()=>{
    const screens=[display(),display(1920)],parse={x:100,y:100,width:600,height:350};
    assert.deepEqual(snapTriggersBounds({x:107,y:459,width:420,height:64},parse,screens),{x:100,y:450,width:600,height:64});
    assert.deepEqual(snapTriggersBounds({x:101,y:456,width:591,height:64},parse,screens,{resizing:true}),{x:100,y:450,width:600,height:64});
    const distant={x:800,y:800,width:420,height:64};assert.deepEqual(snapTriggersBounds(distant,parse,screens),distant);
    const otherScreen={x:1923,y:456,width:420,height:64};assert.deepEqual(snapTriggersBounds(otherScreen,{x:1500,y:100,width:420,height:350},screens),otherScreen,'no cross-monitor magnet');
});

test('own-panel resize is bounded, unlocked-only and retains explicit Triggers height',()=>fixture(async({host,overlayEvent,mainEvent})=>{
    await host.control('show-all');
    await assert.rejects(host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:500,height:300}),/Unlock/);
    await host.control('unlock-all');
    const parse=host.windows.get('parse');parse.setBounds({x:100,y:100,width:600,height:350});
    const timer=host.windows.get('timers');timer.setBounds({x:102,y:458,width:420,height:64});
    const changed=await host.handleOverlayRequest(overlayEvent('timers'),'resize',{width:592,height:110});assert.equal(changed.ok,true);assert.deepEqual(timer.getBounds(),{x:100,y:450,width:600,height:110});assert.equal(host.getState().panels.timers.manualHeight,true);
    assert.equal(normalizePreferences(host.getState(),host.displays()).panels.timers.manualHeight,true,'manual height survives preference normalization/restart');
    await publish(host,mainEvent);assert.equal(timer.getBounds().height,110,'snapshot/content fitting cannot undo an explicit resize');
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',55);assert.equal(timer.getBounds().height,110);
    for(const value of [{width:NaN,height:100},{width:4001,height:100},{width:100,height:-1}])await assert.rejects(host.handleOverlayRequest(overlayEvent('parse'),'resize',value),/Invalid/);
    await host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:1,height:1});assert.equal(parse.getBounds().width,260);assert.equal(parse.getBounds().height,160);
    await host.handleOverlayRequest(overlayEvent('parse'),'resize',{deltaWidth:5,deltaHeight:20});assert.equal(parse.getBounds().width,265);assert.equal(parse.getBounds().height,180,'keyboard deltas use current native bounds');
    await host.handleOverlayRequest(overlayEvent('intel'),'resize',{width:500,height:300});assert.equal(host.windows.get('intel').getBounds().width,500,'all four overlays share the guarded resize path');
    const foreign={...overlayEvent('parse'),senderFrame:{url:host.panelUrl('parse')}};await assert.rejects(host.handleOverlayRequest(foreign,'resize',{width:500,height:300}),/unavailable/);
    await host.control('pass-through','parse',true);await assert.rejects(host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:500,height:300}),/Unlock/);await host.control('pass-through','parse',false);
    await host.control('hide','parse');await assert.rejects(host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:500,height:300}),/Unlock/);
    await host.control('reset-layout');assert.equal(host.getState().panels.timers.manualHeight,false);
}));

test('all-panel docks persist, share touching dimensions, follow resize chains and detach on drag-away',()=>fixture(async({host,overlayEvent})=>{
    await host.control('show-all');await host.control('unlock-all');
    const win=id=>host.windows.get(id);
    win('parse').setBounds({x:400,y:200,width:400,height:220});
    win('map').setBounds({x:1100,y:200,width:360,height:200});
    win('intel').setBounds({x:1100,y:650,width:360,height:200});
    win('timers').setBounds({x:406,y:429,width:280,height:64});
    assert.deepEqual(win('timers').getBounds(),{x:400,y:420,width:400,height:64});assert.deepEqual(host.getState().panels.timers.dock,{targetId:'parse',edge:'below'});
    win('map').setBounds({x:808,y:204,width:300,height:200});assert.deepEqual(win('map').getBounds(),{x:800,y:200,width:300,height:220});assert.deepEqual(host.getState().panels.map.dock,{targetId:'parse',edge:'right'});
    win('intel').setBounds({x:805,y:429,width:300,height:200});assert.deepEqual(host.getState().panels.intel.dock,{targetId:'map',edge:'below'});
    await host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:500,height:260});
    assert.deepEqual(win('timers').getBounds(),{x:400,y:460,width:500,height:64});assert.deepEqual(win('map').getBounds(),{x:900,y:200,width:300,height:260});assert.deepEqual(win('intel').getBounds(),{x:900,y:460,width:300,height:200});
    const restored=normalizePreferences(host.getState(),host.displays());assert.deepEqual(restored.panels.intel.dock,{targetId:'map',edge:'below'});assert.deepEqual(restored.panels.timers.dock,{targetId:'parse',edge:'below'});
    const before=Object.fromEntries(PANEL_IDS.map(id=>[id,win(id).getBounds()]));
    await host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:500,height:1000});
    for(const id of PANEL_IDS)assert.deepEqual(win(id).getBounds(),before[id],'a group that cannot fit does not jump/clamp followers or partially resize');
    win('timers').setBounds({x:100,y:700,width:500,height:64});assert.equal(host.getState().panels.timers.dock,undefined);
    await host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:540,height:300});assert.deepEqual(win('timers').getBounds(),{x:100,y:700,width:500,height:64});assert.deepEqual(win('map').getBounds(),{x:940,y:200,width:300,height:300});assert.deepEqual(win('intel').getBounds(),{x:940,y:500,width:300,height:200});
    await host.control('hide','map');assert.equal(host.getState().panels.intel.dock,undefined,'a hidden target no longer controls a visible child');
    await host.control('reset-layout');assert(PANEL_IDS.every(id=>host.getState().panels[id].dock===undefined));
}));

const savedDragGroup={panels:{
    parse:{visible:true,locked:false,bounds:{x:400,y:200,width:500,height:220}},
    timers:{visible:true,locked:false,bounds:{x:400,y:420,width:500,height:64},dock:{targetId:'parse',edge:'below'}},
    map:{visible:true,locked:false,bounds:{x:900,y:200,width:300,height:220},dock:{targetId:'parse',edge:'right'}},
    intel:{visible:true,locked:false,bounds:{x:900,y:420,width:300,height:200},dock:{targetId:'map',edge:'below'}}
}};

test('a gentle title drag detaches only incident docks and preserves every peer and the selected size',()=>fixture(async({host,overlayEvent,mainEvent,writes})=>{
    const before=Object.fromEntries(PANEL_IDS.map(id=>[id,host.windows.get(id).getBounds()]));
    const event=overlayEvent('parse');
    assert.deepEqual(await host.handleOverlayRequest(event,'move-start'),{ok:true,bounds:before.parse});
    assert.equal(host.preferences.panels.timers.dock,undefined,'the selected parent releases its direct children immediately');
    assert.equal(host.preferences.panels.map.dock,undefined);
    assert.deepEqual(host.preferences.panels.intel.dock,{targetId:'map',edge:'below'},'unrelated peer links remain intact');
    for(const delta of [1,2,4]){
        const result=await host.handleOverlayRequest(event,'move',{deltaX:delta,deltaY:delta});
        assert.deepEqual(result.bounds,{...before.parse,x:before.parse.x+delta,y:before.parse.y+delta},'total movement is based on the initial bounds, with no magnetic resize');
        host.windows.get('parse').emit('resize');
        await host.handleOverlayRequest(overlayEvent('timers'),'content-height',180);
        await publish(host,mainEvent);
        for(const id of ['timers','map','intel'])assert.deepEqual(host.windows.get(id).getBounds(),before[id],'content ticks and duplicate native notifications do not move peers during a drag');
    }
    await host.handleOverlayRequest(event,'move-end');
    assert.equal(host.preferences.panels.parse.dock,undefined,'the original connected group cannot pull a small drag back into place');
    assert.deepEqual(host.windows.get('parse').getBounds(),{...before.parse,x:404,y:204});
    await host.save();assert.deepEqual(writes.at(-1).panels.parse.bounds,host.windows.get('parse').getBounds());
    await host.handleOverlayRequest(overlayEvent('map'),'resize',{width:340,height:240});
    const map=host.windows.get('map').getBounds();
    assert.deepEqual(host.windows.get('intel').getBounds(),{x:map.x,y:map.y+map.height,width:map.width,height:200},'the unrelated peer chain still follows explicit resize');
    assert.deepEqual(host.windows.get('parse').getBounds(),{...before.parse,x:404,y:204},'a later peer resize cannot move the detached panel');
}, {saved:savedDragGroup}));

test('dragging a docked child releases its parent without a minimum breakaway distance',()=>fixture(async({host,overlayEvent})=>{
    const parse=host.windows.get('parse').getBounds(),before=host.windows.get('timers').getBounds();
    const event=overlayEvent('timers');
    await host.handleOverlayRequest(event,'move-start');
    assert.equal(host.preferences.panels.timers.dock,undefined);
    for(const deltaY of [1,2,3])await host.handleOverlayRequest(event,'move',{deltaX:0,deltaY});
    await host.handleOverlayRequest(event,'move-end');
    assert.deepEqual(host.windows.get('timers').getBounds(),{...before,y:before.y+3});
    assert.equal(host.preferences.panels.timers.manualHeight,false,'moving never changes the automatic height preference');
    assert.deepEqual(host.windows.get('parse').getBounds(),parse);
    assert.equal(host.preferences.panels.timers.dock,undefined);
}, {saved:savedDragGroup}));

test('release snapping uses a narrow new-target edge and cancellation leaves free placement intact',async()=>{
    for(const {gap,cancel,snaps} of [{gap:8,cancel:false,snaps:true},{gap:9,cancel:false,snaps:false},{gap:3,cancel:true,snaps:false}])await fixture(async({host,overlayEvent})=>{
        const event=overlayEvent('parse'),target=host.windows.get('map').getBounds();
        await host.handleOverlayRequest(event,'move-start');
        const moved=await host.handleOverlayRequest(event,'move',{deltaX:905,deltaY:350+gap});
        assert.deepEqual(moved.bounds,{x:1005,y:450+gap,width:400,height:220},'the panel keeps its dimensions until pointer release');
        const result=await host.handleOverlayRequest(event,'move-end',{cancel});
        assert.deepEqual(result.bounds,snaps?{x:1000,y:450,width:500,height:220}:moved.bounds);
        assert.deepEqual(host.preferences.panels.parse.dock,snaps?{targetId:'map',edge:'below'}:undefined);
        assert.deepEqual(host.windows.get('map').getBounds(),target,'a new attachment never moves the target');
        assert.equal(host.moveGestures.size,0);
    },{saved:{panels:{parse:{visible:true,locked:false,bounds:{x:100,y:100,width:400,height:220}},map:{visible:true,locked:false,bounds:{x:1000,y:200,width:500,height:250}}}}});
});

test('native move-only fallback also detaches gently and same-size resize never recreates a dock',async()=>{
    for(const announcesStart of [false,true])await fixture(async({host})=>{
        const win=host.windows.get('timers'),before=win.getBounds();
        const peers=Object.fromEntries(['parse','map','intel'].map(id=>[id,host.windows.get(id).getBounds()]));
        if(announcesStart)win.emit('will-move',{preventDefault(){assert.fail('an unlocked native move is allowed');}});
        for(const delta of [1,2,3]){win.bounds={...before,x:before.x+delta,y:before.y+delta};win.emit('move');win.emit('resize');}
        assert.deepEqual(win.getBounds(),{...before,x:403,y:423});
        assert.equal(host.preferences.panels.timers.dock,undefined);
        for(const id of Object.keys(peers))assert.deepEqual(host.windows.get(id).getBounds(),peers[id]);
        if(announcesStart)win.emit('moved');
        else await new Promise(resolve=>setTimeout(resolve,275));
        win.emit('resize');
        assert.equal(host.moveGestures.size,0);assert.equal(host.nativeMoveTimers.size,0);
        assert.equal(host.preferences.panels.timers.dock,undefined,'finishing native movement never snaps back');
        assert.deepEqual(win.getBounds(),{...before,x:403,y:423});
    },{saved:savedDragGroup});
});

test('own-panel drag validates owner, state and bounded total deltas',()=>fixture(async({host,overlayEvent})=>{
    await host.control('show','parse');const event=overlayEvent('parse');
    await assert.rejects(host.handleOverlayRequest(event,'move-start'),/Unlock/);
    await host.control('lock','parse',false);
    await assert.rejects(host.handleOverlayRequest(event,'move',{deltaX:1,deltaY:1}),/Start moving/);
    const foreign={...event,senderFrame:{url:host.panelUrl('parse')}};
    await assert.rejects(host.handleOverlayRequest(foreign,'move-start'),/unavailable/);
    await host.handleOverlayRequest(event,'move-start');const before=host.windows.get('parse').getBounds();
    for(const payload of [null,[],{deltaX:'1',deltaY:0},{deltaX:NaN,deltaY:0},{deltaX:0,deltaY:Infinity},{deltaX:20001,deltaY:0},{deltaX:0,deltaY:-20001}])await assert.rejects(host.handleOverlayRequest(event,'move',payload),/Invalid overlay movement/);
    assert.deepEqual(host.windows.get('parse').getBounds(),before);
    await host.handleOverlayRequest(event,'move-end',{cancel:true});
    await host.control('pass-through','parse',true);await assert.rejects(host.handleOverlayRequest(event,'move-start'),/Unlock/);
    await host.control('pass-through','parse',false);await host.control('hide','parse');await assert.rejects(host.handleOverlayRequest(event,'move-start'),/Unlock/);
}));

test('state changes, renderer loss and disposal end pending moves without a late release snap',async()=>{
    for(const stop of ['lock','hide','pass-through','reset-layout','hide-all','crash','closed','dispose'])await fixture(async({host,overlayEvent})=>{
        const event=overlayEvent('parse'),win=host.windows.get('parse');await host.handleOverlayRequest(event,'move-start');
        await host.handleOverlayRequest(event,'move',{deltaX:2,deltaY:2});
        if(stop==='crash')win.webContents.emit('render-process-gone');
        else if(stop==='closed')win.destroy();
        else if(stop==='dispose')host.dispose();
        else if(['reset-layout','hide-all'].includes(stop))await host.control(stop);
        else await host.control(stop,'parse',true);
        assert.equal(host.moveGestures.size,0,`${stop} clears the gesture`);assert.equal(host.nativeMoveTimers.size,0);
        if(!['closed','dispose'].includes(stop))await host.handleOverlayRequest(event,'move-end');
        assert.equal(host.preferences.panels.parse.dock,undefined,`${stop} cannot release-snap after the lifecycle has ended`);
    },{saved:savedDragGroup});
});

test('moving between different-sized monitors preserves the original width and height',()=>fixture(async({host,overlayEvent,screen})=>{
    screen.displays=[display(),display(1920,0,800,600)];
    const event=overlayEvent('parse');await host.handleOverlayRequest(event,'move-start');
    const result=await host.handleOverlayRequest(event,'move',{deltaX:930,deltaY:0});
    assert.deepEqual(result.bounds,{x:1920,y:0,width:1000,height:800},'translation can anchor to a smaller display without shrinking the overlay');
    await host.handleOverlayRequest(event,'move-end',{cancel:true});
    assert.deepEqual(host.windows.get('parse').getBounds(),result.bounds);
},{saved:{panels:{parse:{visible:true,locked:false,bounds:{x:1000,y:100,width:1000,height:800}}}}}));

test('north/west custom edges retain their opposite anchors and reject unsupported edge values',()=>fixture(async({host,overlayEvent})=>{
    await host.control('show','parse');await host.control('lock','parse',false);const win=host.windows.get('parse');win.setBounds({x:400,y:400,width:300,height:200});
    await host.handleOverlayRequest(overlayEvent('parse'),'resize',{edge:'nw',width:340,height:230});assert.deepEqual(win.getBounds(),{x:360,y:370,width:340,height:230});
    await assert.rejects(host.handleOverlayRequest(overlayEvent('parse'),'resize',{edge:'diagonal',width:500,height:300}),/resize edge/);
}));

test('startup drops stale docks after work-area clamping without changing independent saved bounds',()=>{
    const raw={panels:{parse:{visible:true,bounds:{x:1300,y:100,width:500,height:300}},map:{visible:true,bounds:{x:1800,y:100,width:500,height:300},dock:{targetId:'parse',edge:'right'}}}};
    const normalized=normalizePreferences(raw,[display()]);assert.equal(normalized.panels.map.dock,undefined,'an impossible saved follower cannot block later target resizing');assert.deepEqual(normalized.panels.map.bounds,{x:1420,y:100,width:500,height:300});
    raw.panels.parse.bounds.x=900;const mismatched=normalizePreferences(raw,[display()]);assert.equal(mismatched.panels.map.dock,undefined,'even a possible new attachment is not silently moved into alignment on startup');assert.equal(mismatched.panels.map.bounds.x,1420);
});

test('global Hidden suspends saved groups without propagation; re-show restores them and individual Hide detaches',()=>fixture(async({host,overlayEvent,mainEvent})=>{
    await host.control('show-all');await host.control('unlock-all');const parse=host.windows.get('parse'),timers=host.windows.get('timers');parse.setBounds({x:400,y:200,width:500,height:220});timers.setBounds({x:406,y:429,width:280,height:64});
    const before=host.getState();assert.deepEqual(before.panels.timers.dock,{targetId:'parse',edge:'below'});
    await host.control('hide-all');assert.equal(host.docksSuspended,true);assert.deepEqual(host.getState().panels.timers.dock,before.panels.timers.dock);
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',120);await publish(host,mainEvent);
    for(const id of PANEL_IDS)assert.deepEqual(host.getState().panels[id].bounds,before.panels[id].bounds,'hidden content ticks do not move or resize the suspended layout');
    const saved=normalizePreferences(host.getState(),host.displays());assert.deepEqual(saved.panels.timers.dock,before.panels.timers.dock,'a globally hidden dock survives restart normalization');
    await host.control('cycle-all');assert.equal(host.getState().globalMode,'unlocked');assert.equal(host.docksSuspended,false);assert.deepEqual(host.getState().panels.timers.dock,before.panels.timers.dock);assert.deepEqual(timers.getBounds(),before.panels.timers.bounds);
    await host.handleOverlayRequest(overlayEvent('parse'),'resize',{width:540,height:260});assert.deepEqual(timers.getBounds(),{x:400,y:460,width:540,height:64},'restored relation follows current target resizing again');
    await host.control('hide','parse');assert.equal(host.getState().panels.timers.dock,undefined,'individual Hide detaches affected links');
}));

test('startup retains a fitted globally hidden group without creating native windows',()=>fixture(async({host,nativeWindows})=>{
    assert.equal(nativeWindows.length,0);assert.equal(host.docksSuspended,true);assert.deepEqual(host.getState().panels.timers.dock,{targetId:'parse',edge:'below'});
    await host.control('cycle-all');assert.equal(host.getState().globalMode,'unlocked');assert.deepEqual(host.windows.get('timers').getBounds(),{x:400,y:420,width:500,height:60});
}, {saved:{panels:{parse:{visible:false,bounds:{x:400,y:200,width:500,height:220}},timers:{visible:false,manualHeight:true,bounds:{x:400,y:420,width:500,height:60},dock:{targetId:'parse',edge:'below'}}}}}));

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
        assert(panels.map.bounds.y < panels.intel.bounds.y);
        assert.equal(panels.consider, undefined, 'retired consider panel is never restored');
        const saved = { x:120, y:100, width:460, height:390 };
        assert.deepEqual(normalizePreferences({ panels:{ parse:{ bounds:saved } } }, [display(0, 0, width, height)]).panels.parse.bounds, saved);
    }
    const tiny = normalizePreferences({}, [display(0, 0, 300, 200)]);
    for (const prefs of Object.values(tiny.panels)) {
        const bounds = prefs.bounds;
        assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 300 && bounds.y + bounds.height <= 200);
    }
});

test('timer windows fit only visible countdown rows and the swing bar without a large minimum height', () => fixture(async ({ host, mainEvent, overlayEvent }) => {
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
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',245.3);
    assert.equal(host.windows.get('timers').getBounds().height,246,'Measured inline notice content expands the real timer surface');
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',36);
    assert.equal(host.windows.get('timers').getBounds().height,36,'Removing notices can shrink the surface again');
    for (const invalid of ['300',NaN,Infinity,35,2401]) await assert.rejects(host.handleOverlayRequest(overlayEvent('timers'),'content-height',invalid),/Invalid timer content height/);
    await host.control('show','parse');
    await assert.rejects(host.handleOverlayRequest(overlayEvent('parse'),'content-height',300),/Invalid timer content height/,'Only Timers can request content fitting');
}));

test('automatic Triggers height survives native rounding; only explicit height editing makes it manual',()=>fixture(async({host,overlayEvent})=>{
    await host.control('show','timers');const win=host.windows.get('timers'),nativeBounds=win.setBounds.bind(win);
    // Windows/DPI conversion may return a different logical size than requested.
    // A generic resize notification is not evidence of a user resize gesture.
    win.setBounds=value=>nativeBounds({...value,height:Math.ceil(value.height/2)*2});
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',37);
    assert.equal(win.getBounds().height,38);assert.equal(host.getState().panels.timers.manualHeight,false,'programmatic rounded auto-fit must not freeze as manual');
    await host.control('appearance',null,{fontFamily:'verdana',fontSize:20});await host.control('font-scale','timers',1.75);
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',94);
    assert.equal(win.getBounds().height,94,'a later enlarged font can still fit its complete content');assert.equal(host.getState().panels.timers.manualHeight,false);
    await host.control('lock','timers',false);
    await host.handleOverlayRequest(overlayEvent('timers'),'resize',{deltaWidth:20,deltaHeight:0});
    assert.equal(host.getState().panels.timers.manualHeight,false,'editing width alone retains content-height fitting');
    let prevented=false;win.emit('will-resize',{preventDefault(){prevented=true;}},{...win.getBounds(),height:120});assert.equal(prevented,false);win.setBounds({...win.getBounds(),height:120});
    assert.equal(host.getState().panels.timers.manualHeight,true,'a native user height resize remains an explicit choice');
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',150);assert.equal(win.getBounds().height,120);
    await host.control('reset-layout');await host.control('lock','timers',true);prevented=false;
    win.emit('will-resize',{preventDefault(){prevented=true;}},{...win.getBounds(),height:160});assert.equal(prevented,true);assert.equal(host.getState().panels.timers.manualHeight,false,'a blocked locked gesture does not change height policy');
}));

test('automatic Triggers native minimum can exceed computed height without becoming manual',()=>fixture(async({host,overlayEvent})=>{
    await host.control('show','timers');const win=host.windows.get('timers'),nativeBounds=win.setBounds.bind(win);
    win.setBounds=value=>nativeBounds({...value,height:Math.max(39,value.height)});
    win.setBounds({...win.getBounds(),height:50});
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',36);
    const automatic=host.getState().panels.timers;
    assert.equal(automatic.bounds.height,36,'The stored automatic request remains the measured content height');
    assert.equal(win.getBounds().height,39,'The native platform can enforce a different minimum');
    assert.equal(automatic.manualHeight,false);
    assert.deepEqual([win.getBounds().x,win.getBounds().y,win.getBounds().width],[automatic.bounds.x,automatic.bounds.y,automatic.bounds.width]);
    await host.control('lock','timers',false);
    await host.handleOverlayRequest(overlayEvent('timers'),'resize',{deltaWidth:0,deltaHeight:20});
    const manual=host.getState().panels.timers;
    assert.equal(manual.manualHeight,true);assert.equal(manual.bounds.height,59);assert.equal(win.getBounds().height,59,'An explicit manual height still matches actual native bounds');
    await host.handleOverlayRequest(overlayEvent('timers'),'content-height',36);
    assert.equal(win.getBounds().height,59,'Later content fitting cannot replace the user-selected manual height');
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

test('explicit show recovers only the crashed panel at its trusted URL without restarting the session', () => fixture(async ({ host, mainEvent, nativeWindows }) => {
    await host.control('show','parse');
    await host.control('show','intel');
    await host.control('lock','parse',true);
    await host.control('pass-through','parse',true);
    await host.control('opacity','parse',0.6);
    await publish(host,mainEvent);
    const win=host.windows.get('parse'), other=host.windows.get('intel');
    const preferences=structuredClone(host.getState().panels.parse), snapshot=host.snapshot;
    win.webContents.emit('render-process-gone',{}, {reason:'crashed'});
    assert.equal(host.ready.has('parse'),false);
    assert.equal(host.crashed.has('parse'),true);
    assert.equal(host.sessionAvailable,true,'One panel crash cannot suspend the sole parser owner');
    host.restoreBounds();
    await publish(host,mainEvent);
    await host.control('font-scale','intel',1.15);
    assert.equal(win.loadedUrls.length,1,'Ordinary updates do not automatically retry a failed renderer');
    await host.control('show','parse');
    assert.equal(host.windows.get('parse'),win);
    assert.equal(nativeWindows.length,2,'Recover the existing isolated panel without duplicating it');
    assert.deepEqual(win.loadedUrls,[host.panelUrl('parse'),host.panelUrl('parse')]);
    assert.equal(other.loadedUrls.length,1);
    assert.equal(host.crashed.has('parse'),false);
    assert.equal(host.ready.has('parse'),true);
    assert.equal(win.visible,true);
    assert.equal(win.ignoreMouse,true);
    assert.equal(win.resizable,false);
    assert.deepEqual(host.getState().panels.parse,preferences,'Layout and input preferences survive recovery');
    assert.deepEqual(host.snapshot,snapshot);
    assert.equal(host.sessionRestartCount,0);
    win.webContents.emit('render-process-gone',{}, {reason:'crashed'});
    await host.control('show-all');
    assert.equal(win.loadedUrls.length,3,'Show all also explicitly recovers crashed panels');
    win.webContents.emit('render-process-gone',{}, {reason:'crashed'});
    await host.control('toggle','parse');
    assert.equal(win.loadedUrls.length,3,'Hiding a crashed panel does not reload it');
    await host.control('toggle','parse');
    assert.equal(win.loadedUrls.length,4,'Showing the hidden panel through its tray toggle recovers it');
    win.webContents.emit('render-process-gone',{}, {reason:'crashed'});
    const load=win.loadURL.bind(win);
    win.loadURL=async url=>{win.loadedUrls.push(url);throw new Error('Synthetic load failure');};
    await host.control('show','parse');
    assert.equal(host.crashed.has('parse'),true,'A failed explicit reload remains recoverable');
    host.restoreBounds();
    assert.equal(win.loadedUrls.length,5,'A failed reload never starts an automatic retry loop');
    win.loadURL=load;
    await host.control('show','parse');
    assert.equal(win.loadedUrls.length,6);
    assert.equal(host.ready.has('parse'),true);
}));

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

test('only Map opts into the scoped readonly game-file frame bridge', () => fixture(async ({host})=>{
    await host.control('show-all');
    assert.equal(host.windows.get('parse').webContents.requestPolicy,undefined);
    assert.equal(host.panelUrl('map'),'http://127.0.0.1:53147/overlay-map.html?panel=map');
    const policy=host.windows.get('map').webContents.requestPolicy;
    assert.equal(typeof policy,'function');
    for(const [path,cancel] of [['/api/log',true],['/api/info',true],['/api/eq-file?path=Logs%2Feqlog_Fixture_Test.txt&surface=overlay-map',true],['/api/eq-file?path=Maps%2Fmistmoore.txt',true],['/api/eq-file?path=Maps%2Fmistmoore.txt&surface=overlay-map',false]]){
        let reply;policy({url:'http://127.0.0.1:53147'+path,method:'GET',resourceType:'xhr'},value=>{reply=value;});assert.equal(reply.cancel,cancel);
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
    assert.equal(win.resizable, false,'native transparent-window borders stay disabled when unlocked'); assert.equal(win.movable, true); assert.equal(win.focusable, true);
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

test('Linux click-through releases existing keyboard focus without activation', () => fixture(async ({host}) => {
    await host.control('show','intel');const win=host.windows.get('intel');let focused=true,blurred=0;
    win.isFocused=()=>focused;win.blur=()=>{blurred++;focused=false;};
    await host.control('pass-through','intel',true);assert.equal(blurred,1);assert.equal(focused,false);
    await host.control('pass-through','intel',false);assert.equal(blurred,1,'Restoring input never steals focus');
}, {platform:'linux'}));

test('global fonts persist independently of panel sizing and are owner-only', () => fixture(async ({host,mainEvent,overlayEvent,writes}) => {
    await host.control('show','intel');await host.control('font-scale','intel',1.3);
    const before=structuredClone(host.getState().panels.intel);
    await host.handleMainRequest(mainEvent,'control',{action:'appearance',value:{fontFamily:'georgia',fontSize:20,private:'ignored'}});
    assert.deepEqual(host.getState().appearance,{fontFamily:'georgia',fontSize:20});
    assert.deepEqual(host.getState('intel').appearance,host.getState().appearance);
    assert.deepEqual(host.getState().panels.intel,before,'Font settings preserve saved panel scale, position and lock');
    assert.deepEqual(writes.at(-1).appearance,{fontFamily:'georgia',fontSize:20});
    assert.deepEqual(normalizePreferences(writes.at(-1),[display()]).appearance,{fontFamily:'georgia',fontSize:20},'Restart normalization restores canonical fonts');
    await assert.rejects(host.handleOverlayRequest(overlayEvent('intel'),'appearance',{fontFamily:'arial',fontSize:10}),/Unknown overlay session action/);
    await host.control('appearance',null,{fontFamily:'url(https://untrusted.invalid/x)',fontSize:1000});
    assert.deepEqual(host.getState().appearance,{fontFamily:'theme',fontSize:20});
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

test('map and complete-drop requests resolve only through an authenticated main reply', () => fixture(async ({host,mainEvent,overlayEvent,commands}) => {
    await host.control('show','map'); await host.control('show','intel'); await publish(host,mainEvent);
    const map = host.handleOverlayRequest(overlayEvent('map'),'session:map-data',{zone:'Unrest'});
    const sent = commands.at(-1)[1];
    assert.equal(sent.action,'session:map-data'); assert.equal(sent.panel,'map'); assert(sent.requestId);
    await assert.rejects(host.handleMainRequest(overlayEvent('intel'),'reply',{requestId:sent.requestId,result:{private:'not accepted'}}),/unavailable/);
    assert.equal(host.pendingReplies.size,1);
    const result = {status:'ready',zone:'Unrest',lines:[[0,0,0,10,10,0,255,255,255,0]],labels:[]};
    assert.deepEqual(await host.handleMainRequest(mainEvent,'reply',{requestId:sent.requestId,result}),{ok:true});
    assert.deepEqual(await map,result);
    assert.deepEqual(await host.handleMainRequest(mainEvent,'reply',{requestId:sent.requestId,result}),{ok:false},'a response cannot be replayed');
    const drops = host.handleOverlayRequest(overlayEvent('intel'),'session:intel-drops',{npc:'Synthetic Keeper',zone:'Unrest',raidInstance:true});
    const requested = commands.at(-1)[1];
    assert.equal(requested.payload.raidInstance,true);
    const items = Array.from({length:12},(_,index) => ({name:`Synthetic item ${index}`}));
    await host.handleMainRequest(mainEvent,'reply',{requestId:requested.requestId,result:{items,total:12}});
    assert.deepEqual(await drops,{items,total:12},'lazy metadata has no former 3/5 item limit');
    assert.equal(host.pendingReplies.size,0);
}));

test('lazy data errors, oversized replies and session loss reject the waiting panel', () => fixture(async ({host,mainEvent,overlayEvent,commands}) => {
    await host.control('show','map'); await publish(host,mainEvent);
    const rejected = host.handleOverlayRequest(overlayEvent('map'),'session:map-data',{zone:'Unrest'});
    const failure = assert.rejects(rejected,/No matching client map/);
    await host.handleMainRequest(mainEvent,'reply',{requestId:commands.at(-1)[1].requestId,error:'No matching client map'}); await failure;
    const oversized = host.handleOverlayRequest(overlayEvent('map'),'session:map-data',{zone:'Unrest'});
    const bounded = assert.rejects(oversized,/too large/);
    await host.handleMainRequest(mainEvent,'reply',{requestId:commands.at(-1)[1].requestId,result:{huge:'x'.repeat(8*1024*1024)}}); await bounded;
    const interrupted = host.handleOverlayRequest(overlayEvent('map'),'session:map-data',{zone:'Unrest'});
    const unavailable = assert.rejects(interrupted,/unavailable/);
    host.markSessionUnavailable(); await unavailable;
    assert.equal(host.pendingReplies.size,0);
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
    for (const saved of writes) {
        assert.deepEqual(Object.keys(saved), ['schemaVersion', 'appearance', 'panels'], 'Only layout and appearance preferences persist; session/private data stays excluded');
        assert.deepEqual(saved.appearance, {fontFamily:'theme',fontSize:13}, 'Persist the complete bounded default appearance without arbitrary CSS or extra fields');
    }
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

test('a tray that fails after construction is destroyed and cannot claim recovery availability', async () => {
    for(const trayFailure of ['tooltip','menu'])await fixture(async({host,nativeTrays})=>{
        assert.equal(nativeTrays.length,1);assert.equal(nativeTrays[0].destroyed,true);
        assert.equal(host.tray,null);assert.equal(host.hasRecoveryControl(),false);
        assert.equal(host.preferences.panels.parse.passThrough,false);
        await assert.rejects(host.control('pass-through','parse',true),/working tray/);
    },{trayFailure,shortcut:false,saved:{panels:{parse:{visible:true,passThrough:true}}}});
});

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
    vm.runInContext('atomicWriteJson = async () => {}; overlayHost = fixtureHost; createWindow({});', context);
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
    const before = quits;
    prevented = false;
    win.emit('close', { preventDefault:() => { prevented = true; } });
    assert.equal(prevented, true, 'the first final close keeps the renderer alive for the shutdown drain');
    assert.equal(quits, before + 1, 'final close enters the app quit barrier');
    assert.equal(win.destroyed, false);
    vm.runInContext('quitting = true', context);
    prevented = false;
    win.emit('close', { preventDefault:() => { prevented = true; } });
    assert.equal(prevented, false, 'the second close during quit permits native destruction');
    assert.equal(quits, before + 1, 'a quitting close does not request another quit');
    win.emit('closed');
    assert.equal(quits, before + 1, 'the completed quit does not loop through app.quit');
    vm.runInContext('quitting = false; createWindow({});', context);
    state.visible = true; state.recovery = false;
    prevented = false;
    windows[1].emit('close', { preventDefault:() => { prevented = true; } });
    assert.equal(prevented, true, 'failed recovery controls still use the shutdown drain');
    assert.equal(quits, before + 2, 'failed recovery controls quit instead of hiding the main window');
    vm.runInContext('quitting = true', context);
    prevented = false;
    windows[1].emit('close', { preventDefault:() => { prevented = true; } });
    assert.equal(prevented, false, 'failed recovery controls cannot prevent the final quitting close');
    windows[1].emit('closed');
    assert.equal(quits, before + 2);
    vm.runInContext('quitting = false; createWindow({});', context);
    windows[2].emit('closed');
    assert.equal(quits, before + 3, 'an unexpected ownerless session still quits despite hidden native panels');
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
    assert.deepEqual(sessionCommand('session:new-session', {}), {});
    assert.throws(() => sessionCommand('session:new-session', {logOffset:0}), /does not accept options/);
    assert.throws(() => sessionCommand('session:class-filter', { panel:'timers', enabled:true }), /Invalid/);
    assert.throws(() => sessionCommand('timer:start', []), /object/);
    assert.throws(() => sessionCommand('session:wiki', { npc:'x'.repeat(241) }), /Invalid/);
    assert.throws(() => sessionCommand('eye-of-zomm:window', {}), /Unknown/);
    assert.throws(() => sessionCommand('session:class-filter', { panel:'consider', enabled:true }), /Invalid/);
    assert.throws(() => sessionCommand('session:intel-drops', {npc:'Synthetic Keeper',raidInstance:'true'}),/Invalid/);
    assert.throws(() => sessionCommand('session:map-data', {zone:{name:'Unrest'}}),/Invalid/);
});

test('opening a selected NPC rechecks its zone and native routing keeps the main window hidden', async () => {
    const source = await readFile(new URL('../app/app.js', import.meta.url), 'utf8');
    const start = source.indexOf('async function handleOverlayCommand(');
    const end = source.indexOf('\nfunction currentEraIndex(', start);
    assert(start >= 0 && end > start, 'Missing authoritative application handler.');
    async function routeFixture({ changeAt, changeZone = false, disablePaths = false } = {}) {
        let zone = 'Unrest';
        const routes = [];
        const selections = [], fields = {};
        const settings = { routingEnabled:true };
        const mutate = stage => {
            if (stage !== changeAt) return;
            if (changeZone) zone = 'Befallen';
            if (disablePaths) settings.routingEnabled = false;
        };
        const context = vm.createContext({
            state:() => ({ zone }), zoneKey:value => String(value).toLowerCase(), settings,
            npcRecordForName:(name, requestedZone) => name === 'a synthetic guard' ? { name, zone:requestedZone } : null,
            raidVariant:npc => npc?.raidInstance === true,
            window:{ eyeOfZommOverlays:{ control:async action => { assert.equal(action, 'show-main'); mutate('show'); } } },
            $:selector => fields[selector] ||= {value:''}, setView:view => selections.push(view), renderAll() {},
            pathToNpc:async (name,options) => { routes.push({ name, zone, options:JSON.parse(JSON.stringify(options)) }); }
        });
        vm.runInContext(source.slice(start, end), context);
        return { routes, selections, run:(action = 'session:open') => context.handleOverlayCommand({ action,
            payload:{ view:'npcs', npc:'a synthetic guard', zone:'Unrest', loc:[9999, 9999, 9999] } }) };
    }
    for (const changeAt of ['show']) {
        const zoned = await routeFixture({ changeAt, changeZone:true });
        await assert.rejects(zoned.run(), /previous zone/);
        assert.equal(zoned.routes.length, 0, `a zone change during ${changeAt} must not reuse the stale target`);
    }
    const valid = await routeFixture();
    await valid.run('session:route');
    assert.deepEqual(valid.routes, [{ name:'a synthetic guard', zone:'Unrest', options:{openMain:false,raidInstance:false} }]);
    await valid.run(); assert.deepEqual(valid.selections,['npcs']);
});

let failures = 0;
for (const { name, run } of tests) {
    try { await run(); console.log(`PASS native overlays: ${name}`); }
    catch (error) { failures += 1; console.error(`FAIL native overlays: ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
