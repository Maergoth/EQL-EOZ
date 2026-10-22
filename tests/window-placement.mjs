import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const {normalizeWindowPlacement,WindowPlacement}=require('../desktop/window-placement.cjs');
const display=(x=0,y=0,width=1920,height=1040)=>({workArea:{x,y,width,height}});
class Window extends EventEmitter {
    constructor(options={}) {super();this.options=options;this.bounds={x:options.x??10,y:options.y??10,width:options.width??1200,height:options.height??800};this.normal={...this.bounds};this.maximized=false;this.minimized=false;this.visible=false;this.showCalls=0;this.hideCalls=0;this.boundsCalls=0;this.focusCalls=0;this.webContents=new EventEmitter();this.webContents.session={setPermissionRequestHandler(handler){this.requestPermission=handler;},setPermissionCheckHandler(handler){this.checkPermission=handler;}};this.webContents.mainFrame={url:''};this.webContents.setWindowOpenHandler=handler=>{this.webContents.openHandler=handler;};}
    isDestroyed(){return false;} isMinimized(){return this.minimized;} isMaximized(){return this.maximized;} isFullScreen(){return false;}
    getBounds(){return {...this.bounds};} getNormalBounds(){return {...this.normal};}
    setBounds(bounds){this.boundsCalls++;this.bounds={...bounds};this.normal={...bounds};this.emit('resize');}
    setMinimumSize(){} setSkipTaskbar(){} setAlwaysOnTop(){throw Error('The main app must never be pinned');}
    maximize(){this.maximized=true;this.emit('maximize');}
    unmaximize(){this.maximized=false;this.bounds={...this.normal};this.emit('unmaximize');}
    minimize(){this.minimized=true;this.emit('minimize',{preventDefault(){}});}
    restore(){this.minimized=false;this.emit('restore');}
    show(){this.visible=true;this.showCalls++;} hide(){this.visible=false;this.hideCalls++;} focus(){this.focusCalls++;}
    close(){this.emit('close',{preventDefault(){}});}
    async loadURL(url){this.webContents.mainFrame.url=url;}
}

const initial={schemaVersion:1,bounds:{x:2100,y:150,width:1300,height:800},maximized:true};
assert.deepEqual(normalizeWindowPlacement(initial,[display(),display(1920)]),initial);
assert.deepEqual(normalizeWindowPlacement(initial,[display()]).bounds,{x:620,y:150,width:1300,height:800});
assert.deepEqual(normalizeWindowPlacement({bounds:{x:-1100,y:-750,width:1100,height:750}},[display(),display(-1280,-900,1280,900)]).bounds,{x:-1100,y:-750,width:1100,height:750});
const invalid=normalizeWindowPlacement({bounds:{x:Infinity,y:'private',width:NaN,height:-1},maximized:'true',log:'excluded'},[display(0,0,800,600)]);
assert.deepEqual(invalid,{schemaVersion:1,bounds:{x:0,y:0,width:800,height:600},maximized:false});

const screen=new EventEmitter();screen.displays=[display(),display(1920)];screen.getAllDisplays=()=>screen.displays;
const win=new Window({x:500,y:100,width:1200,height:800}),writes=[];
const placement=new WindowPlacement({window:win,screen,initial:{bounds:win.bounds},write:async state=>writes.push(state)});
try {
    for(const x of [1000,1400,1800,2100]) {win.bounds.x=x;win.normal.x=x;win.emit('move');assert.equal(win.bounds.x,x);}
    assert.equal(win.boundsCalls,0,'Dragging through the monitor boundary must never snap the live window back');
    await placement.flush();assert.equal(writes.at(-1).bounds.x,2100);
    win.maximize();await placement.flush();assert.equal(writes.at(-1).maximized,true);assert.equal(writes.at(-1).bounds.x,2100);
    win.minimize();await placement.flush();assert.equal(writes.at(-1).maximized,true,'Minimize cannot erase saved maximization');
    screen.displays=[display()];screen.emit('display-removed');
    assert.equal(win.boundsCalls,0,'Display recovery must not show or unmaximize a minimized window');
    win.restore();win.unmaximize();assert.equal(win.bounds.x,720,'Restoring after display removal clamps into the surviving work area');
    await placement.flush();assert.equal(writes.at(-1).maximized,false);
    assert.deepEqual(Object.keys(writes.at(-1)),['schemaVersion','bounds','maximized']);
} finally {await placement.dispose();}

// Run the actual main handlers with disposable in-memory storage and native
// event mocks. No installed profile, external network or game folder is read.
const mainPath=new URL('../desktop/main.cjs',import.meta.url),nativeRequire=createRequire(mainPath),source=await readFile(mainPath,'utf8');
async function runtime(run,{config={},saved={},tray=true}={}) {
    const handlers={},appEvents={},windows=[],stored={...config},writes=[],opened=[];
    const app={getVersion:()=> 'fixture',getPath:()=> 'fixture-profile',requestSingleInstanceLock:()=>false,quit(){this.quits=(this.quits||0)+1;},on:(event,handler)=>{appEvents[event]=handler;}};
    const contents={markSessionUnavailable(){},noteSessionRestart(){},hasVisiblePanels:()=>false,hasRecoveryControl:()=>tray,tray:tray?{}:null,dispose(){},writeQueue:Promise.resolve()};
    const context=vm.createContext({require:name=>name==='electron'?{app,screen,
        BrowserWindow:class extends Window {constructor(options){super(options);windows.push(this);}},
        ipcMain:{handle:(name,handler)=>{handlers[name]=handler;}},shell:{openExternal:url=>{opened.push(url);}}}:nativeRequire(name),
        __dirname:path.dirname(fileURLToPath(mainPath)),process,console,Buffer,URL,
        fixtureHost:contents,fixtureConfig:config,fixturePlacement:saved,
        fixtureRead:async()=>({...stored}),fixtureWrite:async(_file,value)=>{await new Promise(resolve=>setImmediate(resolve));Object.assign(stored,value);delete stored.alwaysOnTop;writes.push(value);}});
    vm.runInContext(source,context);
    vm.runInContext('readJson = fixtureRead; atomicWriteJson = fixtureWrite; overlayHost = fixtureHost; createWindow(fixtureConfig,fixturePlacement);',context);
    const win=windows[0],event={sender:win.webContents,senderFrame:win.webContents.mainFrame},handler=handlers['eye-of-zomm:window'];
    try {await run({context,win,stored,writes,app,appEvents,handler,event,opened});}
    finally {await vm.runInContext('windowPlacement.dispose()',context);}
}
await runtime(async({context,win,stored,handler,event,opened})=>{
    assert.equal(win.options.frame,true);assert.equal(win.options.skipTaskbar,false);
    assert.equal(win.options.alwaysOnTop,undefined);
    for(const url of ['https://github.com/Maergoth/EQL-EOZ','https://github.com/Maergoth/EQL-EOZ/','https://github.com/Other/Repo','https://github.com/Maergoth/EQL-EOZ/issues','https://github.com/Maergoth/EQL-EOZ?redirect=1','http://github.com/Maergoth/EQL-EOZ'])win.webContents.openHandler({url});
    assert.deepEqual(opened,['https://github.com/Maergoth/EQL-EOZ','https://github.com/Maergoth/EQL-EOZ/'],'Project links allow only the exact repository root');
    win.emit('ready-to-show');assert.equal(win.visible,true);assert.equal(win.focusCalls,0);
    await Promise.all([handler(event,'set-settings',{minimizeToTray:true}),handler(event,'set-settings',{startMinimized:true})]);
    assert.equal(stored.minimizeToTray,true);assert.equal(stored.startMinimized,true);assert.equal(stored.logPath,'synthetic.log');
    assert.equal(stored.alwaysOnTop,undefined);
    const settings=await handler(event,'get-settings');assert.equal(settings.trayAvailable,true);
    for(const payload of [{minimizeToTray:'true'},{alwaysOnTop:true},[],null]) await assert.rejects(handler(event,'set-settings',payload),/Invalid/);
    await assert.rejects(handler({...event,sender:{}},'set-settings',{startMinimized:false}),/unavailable/);
    await assert.rejects(handler({...event,senderFrame:{url:event.senderFrame.url}},'get-settings'),/unavailable/);
    win.minimize();assert.equal(win.visible,false,'Enabled minimize-to-tray hides the window');
    vm.runInContext('showMainWindow()',context);assert.equal(win.visible,true);assert.equal(win.minimized,false);
},{config:{alwaysOnTop:true,logPath:'synthetic.log'}});
await runtime(async({context,win})=>{
    win.emit('ready-to-show');assert.equal(win.showCalls,0);assert.equal(win.visible,false);assert.equal(win.maximized,false,'Hidden startup does not flash a maximized window');
    vm.runInContext('showMainWindow()',context);assert.equal(win.maximized,true);assert.equal(win.visible,true);
},{config:{minimizeToTray:true,startMinimized:true},saved:initial});
await runtime(async({win,handler,event})=>{
    win.emit('ready-to-show');assert.equal(win.minimized,true);assert.equal(win.hideCalls,0,'A failed tray uses taskbar minimize');
    assert.equal((await handler(event,'get-settings')).trayAvailable,false);
},{config:{minimizeToTray:true,startMinimized:true},tray:false});
await runtime(async({context,win})=>{
    win.emit('ready-to-show');assert.equal(win.minimized,true);assert.equal(win.maximized,false);
    win.restore();assert.equal(win.maximized,true,'Native taskbar restore applies the saved maximization without Open main');
    assert.equal(win.showCalls,0);assert.equal(win.focusCalls,0);
    win.unmaximize();vm.runInContext('showMainWindow()',context);
    assert.equal(win.maximized,false,'The saved initial state is consumed once and cannot undo a later user unmaximize');
},{config:{startMinimized:true,minimizeToTray:false},saved:initial,tray:false});

const exposures={},calls=[];
vm.runInNewContext(await readFile(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:()=>({
    contextBridge:{exposeInMainWorld:(name,value)=>{exposures[name]=value;}},ipcRenderer:{invoke:(...args)=>{calls.push(args);}}})});
exposures.eyeOfZommWindow.getSettings();exposures.eyeOfZommWindow.setSettings({startMinimized:true});
assert.deepEqual(calls,[['eye-of-zomm:window','get-settings'],['eye-of-zomm:window','set-settings',{startMinimized:true}]]);
console.log('Window placement/lifecycle: normal bounds, maximization, monitor recovery, free dragging, native frame, authenticated settings, serialized writes, tray fallback and hidden startup passed.');
