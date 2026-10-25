import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {JSDOM} from 'jsdom';
import {mountDiscoveryNoticeWindow} from '../app/discovery-notices.js';
const require=createRequire(import.meta.url),{DiscoveryNoticeWindow}=require('../desktop/discovery-notice-window.cjs');
const origin='http://127.0.0.1:53147',created=[];
class Contents extends EventEmitter{
 constructor(){super();this.mainFrame={url:'about:blank'};this.sent=[];this.session={setPermissionRequestHandler:fn=>this.permission=fn,setPermissionCheckHandler:fn=>this.check=fn,webRequest:{onBeforeRequest:(_filter,fn)=>this.before=fn}};}
 send(...args){this.sent.push(args);}setWindowOpenHandler(fn){this.open=fn;}
}
let loadGate=null;
class Window extends EventEmitter{
 constructor(options){super();Object.assign(this,{options,webContents:new Contents(),destroyed:false,shown:0,focusCalls:0,hidden:0});created.push(this);}
 isDestroyed(){return this.destroyed;}async loadURL(url){this.webContents.mainFrame.url=url;if(loadGate)await loadGate;}
 setBounds(bounds){this.bounds=bounds;}getBounds(){return this.bounds;}setAlwaysOnTop(...args){this.top=args;}showInactive(){this.shown++;}focus(){this.focusCalls++;}hide(){this.hidden++;}destroy(){this.destroyed=true;this.emit('closed');}
}
const screen=new EventEmitter();let displays=[{id:1,workArea:{x:-1920,y:0,width:1920,height:1040}},{id:2,workArea:{x:0,y:0,width:1280,height:1024}}];
screen.getAllDisplays=()=>displays;screen.getDisplayMatching=bounds=>displays.find(d=>bounds.x>=d.workArea.x&&bounds.x<d.workArea.x+d.workArea.width)||displays[0];
let mainBounds={x:20,y:20,width:800,height:600},state=[];const main={isDestroyed:()=>false,getBounds:()=>mainBounds};
const surface=new DiscoveryNoticeWindow({electron:{BrowserWindow:Window,screen},origin,getMainWindow:()=>main,getState:()=>state});
await surface.show();assert.equal(created.length,0,'An empty session never creates a popup or a Timers window');
state=[{id:'one',kind:'item',purpose:'item-link',name:'Synthetic blade'}];await surface.show();const popup=surface.window;
assert.equal(created.length,1);assert.equal(popup.shown,1);assert.equal(popup.focusCalls,0);assert.deepEqual(popup.bounds,{x:888,y:852,width:380,height:160});
assert.equal(popup.options.show,false);assert.equal(popup.options.skipTaskbar,true);assert.equal(popup.options.webPreferences.sandbox,true);assert.equal(popup.options.webPreferences.contextIsolation,true);assert.equal(popup.options.webPreferences.nodeIntegration,false);assert.equal(popup.options.webPreferences.partition,'eoz-discovery-notices');assert.deepEqual(popup.top,[true,'screen-saver']);
const frame={sender:popup.webContents,senderFrame:popup.webContents.mainFrame};assert(surface.allowed(frame));
for(const event of [{sender:popup.webContents,senderFrame:{url:popup.webContents.mainFrame.url}},{sender:{},senderFrame:popup.webContents.mainFrame}])assert.equal(surface.allowed(event),false);
popup.webContents.mainFrame.url+='?spoof';assert.equal(surface.allowed(frame),false);popup.webContents.mainFrame.url=`${origin}/discovery-notices.html`;
for(const url of [`${origin}/discovery-notices.js`,`${origin}/wiki-discovery-ui.js`]){let result;popup.webContents.before({url},value=>result=value);assert.equal(result.cancel,false);}
for(const url of [`${origin}/api/config`,`${origin}/discovery-notices.js?spoof`,'https://eqlwiki.com/','file:///private']){let result;popup.webContents.before({url},value=>result=value);assert.equal(result.cancel,true);}
let allowed;popup.webContents.permission(null,'clipboard-read',value=>allowed=value);assert.equal(allowed,false);assert.equal(popup.webContents.check(),false);assert.deepEqual(popup.webContents.open(),{action:'deny'});
let prevented=false;popup.webContents.emit('will-navigate',{preventDefault(){prevented=true;}},'https://eqlwiki.com/');assert(prevented);
surface.resize(500);assert.deepEqual(popup.bounds,{x:888,y:512,width:380,height:500});
for(const value of [NaN,Infinity,0,-1,10001,'400'])assert.throws(()=>surface.resize(value),/Invalid/);
state.push({id:'two'});await surface.show();assert.equal(created.length,1,'Stack updates reuse the dedicated window');assert.equal(popup.focusCalls,0);
displays=[displays[0]];screen.emit('display-removed');surface.resize(9999);assert.deepEqual(popup.bounds,{x:-392,y:12,width:380,height:1016},'A removed monitor clamps the popup into the surviving work area');
state=[];surface.publish();assert.equal(popup.hidden,1);assert.equal(surface.displayId,null);
surface.dispose();assert(popup.destroyed);for(const name of ['display-metrics-changed','display-removed','display-added'])assert.equal(screen.listenerCount(name),0);
let finish;loadGate=new Promise(resolve=>finish=resolve);state=[{id:'late'}];const late=new DiscoveryNoticeWindow({electron:{BrowserWindow:Window,screen},origin,getMainWindow:()=>main,getState:()=>state}),loading=late.show(),old=late.window;late.clear();finish();await loading;assert(old.destroyed);assert.equal(old.shown,0,'Clearing the owner during load cannot show a stale notice');late.dispose();loadGate=null;

// Real DOM plus real notice queue: the popup is the sole presentation owner.
const dom=new JSDOM('<main id="wiki-discovery-notices"></main>',{url:`${origin}/discovery-notices.html`}),root=dom.window.document.querySelector('main');root.getClientRects=()=>[{}];
let tick,clock=0,listener,resolveInitial,unsubscribed=false;const calls=[],heights=[];
const api={getState:()=>new Promise(resolve=>resolveInitial=resolve),onState:fn=>{listener=fn;return()=>{unsubscribed=true;};},resize:async value=>heights.push(value),action:async(name,value)=>{calls.push({name,value});return name==='contribute'?{pendingCapture:true,captureRequest:'capture-1'}:{ok:true};}};
const view=mountDiscoveryNoticeWindow({document:dom.window.document,api,ResizeObserver:null,now:()=>clock,setInterval:fn=>{tick=fn;return 1;},clearInterval(){}});
const prompt={id:'new',kind:'item',purpose:'item-link',name:'Synthetic <blade>'};listener([prompt]);resolveInitial([{...prompt,id:'stale'}]);await new Promise(resolve=>setImmediate(resolve));
assert(root.textContent.includes('Synthetic <blade>'));assert(!root.innerHTML.includes('<blade>'));assert(!root.querySelector('[data-discovery-id="stale"]'),'A late get-state response cannot overwrite newer state');assert.equal(calls.length,0,'Displaying the popup starts no capture');
root.querySelector('[data-discovery-command="contribute"]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls[0].name,'contribute');clock=60000;tick();assert.equal(calls.length,1,'Explicit capture waiting remains held');
listener([{...prompt,captureState:'captured',captureRequest:'capture-1'}]);clock+=900;tick();await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.at(-1).name,'dismiss');assert.equal(root.innerHTML,'');assert(heights.length>0);
view.dispose();assert(unsubscribed);dom.window.close();
console.log('Discovery popup: independent non-activating window, exact frame/resources, bottom-right monitor fitting, stacking, load cancellation and real-DOM contribution lifecycle passed.');
