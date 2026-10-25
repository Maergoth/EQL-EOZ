import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {createDiscoveryNoticeQueue} from '../app/wiki-discovery-ui.js';
const require=createRequire(import.meta.url),{DiscoveryHost,SPAWN_CHANNEL}=require('../desktop/discovery-host.cjs'),origin='http://127.0.0.1:53147';
const handlers=new Map(),windows=[];
class Contents extends EventEmitter{constructor(url){super();this.mainFrame={url};this.sent=[];this.session={setPermissionRequestHandler:callback=>this.permission=callback,setPermissionCheckHandler:callback=>this.permissionCheck=callback,webRequest:{onBeforeRequest:(_filter,callback)=>this.before=callback}};}send(...args){this.sent.push(args);}setWindowOpenHandler(callback){this.windowOpen=callback;}}
class Window extends EventEmitter{constructor(options={}){super();this.options=options;this.webContents=new Contents('about:blank');this.destroyed=false;this.shownInactive=0;this.hidden=0;this.focused=0;this.shown=0;windows.push(this);}isDestroyed(){return this.destroyed;}async loadURL(url){this.webContents.mainFrame.url=url;}setBounds(value){this.bounds=value;}setAlwaysOnTop(...value){this.top=value;}showInactive(){this.shownInactive++;}show(){this.shown++;}focus(){this.focused++;}hide(){this.hidden++;}destroy(){this.destroyed=true;this.emit('closed');}}
const main=new Window(),timer=new Window();main.webContents.mainFrame.url=`${origin}/`;timer.webContents.mainFrame.url=`${origin}/overlay.html?panel=timers`;
const frame=window=>({sender:window.webContents,senderFrame:window.webContents.mainFrame}),electron={BrowserWindow:Window,ipcMain:{handle:(key,callback)=>handlers.set(key,callback),removeHandler:key=>handlers.delete(key)},screen:{getCursorScreenPoint:()=>({x:2100,y:900}),getDisplayNearestPoint:()=>({workArea:{x:1920,y:0,width:1280,height:1024}})}};
const host=new DiscoveryHost({electron,origin,getMainWindow:()=>main,itemExistence:{check:async()=>({status:'missing'}),clear(){},dispose(){}}});
const prompt=(id='1')=>({id:`spawn-${id}`,candidateId:id,kind:'monster',name:`Synthetic <monster> ${id}`,zone:'Synthetic Vale',purpose:'spawn-location'});
await host.handle(frame(main),'show',{id:'ordinary',kind:'item',name:'Ordinary Missing Item'});assert.equal(windows.length,3,'Ordinary notices use their own window independently of the spawn prompt');
await host.handle(frame(main),'show',prompt());const popup=host.spawnWindow;assert(popup);assert.equal(popup.shownInactive,1);assert.equal(main.focused,0);assert.equal(main.shown,0);assert.equal(popup.options.show,false);assert.equal(popup.options.skipTaskbar,true);assert.equal(popup.options.webPreferences.sandbox,true);assert.equal(popup.options.webPreferences.nodeIntegration,false);assert.equal(popup.options.webPreferences.contextIsolation,true);assert.equal(popup.options.webPreferences.partition,'eoz-spawn-prompt');assert.deepEqual(popup.bounds,{x:2788,y:712,width:400,height:300});
let permission;popup.webContents.permission(null,'clipboard-read',value=>permission=value);assert.equal(permission,false);assert.equal(popup.webContents.permissionCheck(),false);
for(const url of [`${origin}/spawn-prompt.js`,`${origin}/wiki-discovery-ui.js`]){let result;popup.webContents.before({url},value=>result=value);assert.equal(result.cancel,false);}
for(const url of [`${origin}/api/config`,'https://eqlwiki.com/','file:///C:/private.txt',`${origin}/spawn-prompt.html?other`]){let result;popup.webContents.before({url},value=>result=value);assert.equal(result.cancel,true);}
assert.deepEqual(popup.webContents.windowOpen(),{action:'deny'});
let prevented=false;popup.webContents.emit('will-navigate',{preventDefault(){prevented=true;}},'https://eqlwiki.com/');assert(prevented);
for(const event of [frame(main),frame(timer),{sender:popup.webContents,senderFrame:{url:`${origin}/spawn-prompt.html`}}])await assert.rejects(host.handleSpawn(event,'get-state'),/unavailable/);
await assert.rejects(host.handle(frame(popup),'capture',{id:'ordinary'}),/unavailable/,'Spawn preload has no old screenshot bridge');
await assert.rejects(host.handleSpawn(frame(popup),'capture',{id:'spawn-1'}),/Unknown/);
assert.deepEqual((await host.handleSpawn(frame(popup),'get-state')).map(value=>value.id),['spawn-1']);
assert.equal(host.spawnState()[0].notable,undefined,'Unanswered is distinct from No');
for(const event of [frame(main),frame(timer),{sender:popup.webContents,senderFrame:{url:`${origin}/spawn-prompt.html`}}])await assert.rejects(host.handleSpawn(event,'set-notable',{id:'spawn-1',candidateId:'1',notable:true}),/unavailable/);
await assert.rejects(host.handleSpawn(frame(popup),'set-notable',{id:'spawn-1',candidateId:'other',notable:true}),/does not match/);
await assert.rejects(host.handleSpawn(frame(popup),'set-notable',{id:'spawn-1',candidateId:'1',notable:'false'}),/does not match/);
let priorChoice;
for(const notable of [true,false]){
    const selected=await host.handleSpawn(frame(popup),'set-notable',{id:'spawn-1',candidateId:'1',notable});assert(selected.pending);assert.equal(host.spawnState()[0].notablePending,true);
    const request=main.webContents.sent.at(-1)[1];assert.equal(request.action,'set-notable');assert.equal(request.notable,notable);assert.equal(request.previousNotable,priorChoice??null);assert.equal(main.focused,0,'Choosing notable never activates the main app');
    await assert.rejects(host.handleSpawn(frame(popup),'set-notable',{id:'spawn-1',candidateId:'1',notable}),/Wait/);
    const ack={id:request.id,candidateId:request.candidateId,notableChoiceId:request.notableChoiceId,ok:true,notable};
    for(const event of [frame(popup),frame(timer)])await assert.rejects(host.handle(event,'notable-status',ack),/unavailable/);
    await assert.rejects(host.handle(frame(main),'notable-status',{...ack,notableChoiceId:'old'}),/no longer active/);
    await host.handle(frame(main),'notable-status',ack);assert.equal(host.spawnState()[0].notable,notable);assert.equal(host.spawnState()[0].notablePending,false);priorChoice=notable;
}
const staleChoice=await host.handleSpawn(frame(popup),'set-notable',{id:'spawn-1',candidateId:'1',notable:true});const staleAck=main.webContents.sent.at(-1)[1];
await host.handle(frame(main),'show',prompt('2'));assert.equal(host.spawnWindow,popup);assert.deepEqual(host.spawnState().map(value=>value.candidateId),['2']);assert(host.state().some(value=>value.id==='ordinary'),'Replacing a spawn request preserves ordinary notices');
await assert.rejects(host.handle(frame(main),'notable-status',{...staleAck,ok:true}),/no longer active/,'A late choice confirmation cannot mutate the replacement NPC');assert.equal(host.spawnState()[0].notable,undefined);
await assert.rejects(host.handleSpawn(frame(popup),'contribute',{id:'spawn-1'}),/expired/);
const request=await host.handleSpawn(frame(popup),'contribute',{id:'spawn-2'});assert.equal(main.shown,1);assert.equal(main.focused,1);assert(main.webContents.sent.some(([channel,value])=>channel==='eye-of-zomm:discovery-action'&&value.action==='contribute'&&value.candidateId==='2'&&value.captureRequest===request.captureRequest));assert.equal(popup.hidden,0);assert.equal(host.spawnState().length,1,'Contribute keeps the location prompt open');assert.equal(host.spawnState()[0].captureState,'waiting');
const completion={id:'spawn-2',purpose:'spawn-location',captureRequest:request.captureRequest,candidateId:'2',status:'captured'};
await assert.rejects(host.handle(frame(timer),'capture-status',completion),/unavailable/);await assert.rejects(host.handle(frame(main),'capture-status',{...completion,candidateId:'another'}),/does not match/);
await host.handle(frame(main),'capture-status',completion);assert.equal(host.spawnState()[0].captureState,'captured');assert.equal(popup.hidden,0,'The renderer owns the brief green interval before closing');
await host.handleSpawn(frame(popup),'dismiss',{id:'spawn-2'});assert(popup.hidden);assert.equal(host.spawnState().length,0);assert.equal(main.webContents.sent.at(-1)[1].captureRequest,request.captureRequest);
await host.handle(frame(main),'show',prompt('3'));await host.handleSpawn(frame(popup),'ignore',{id:'spawn-3'});assert.equal(main.focused,1,'Ignore never activates main');assert(main.webContents.sent.some(([,value])=>value.action==='ignore'&&value.candidateId==='3'));
let clock=0;const notices=createDiscoveryNoticeQueue({now:()=>clock,maxVisible:1});notices.reconcile([prompt('4')]);clock=14000;assert.deepEqual(notices.tick(),[]);notices.hold('spawn-4','hover',true);clock+=60000;assert.deepEqual(notices.tick(),[],'The reused notice clock pauses while hovered');notices.hold('spawn-4','hover',false);clock+=1001;assert.deepEqual(notices.tick(),['spawn-4'],'Fifteen visible seconds expire after hover release');
notices.reconcile([{...prompt('5'),captureState:'waiting',captureRequest:'capture-20'}]);clock+=120000;assert.deepEqual(notices.tick(),[],'An armed explicit location request stays pinned');notices.captureStatus('spawn-5','captured','','capture-20');notices.hold('spawn-5','hover',true);clock+=14999;assert.deepEqual(notices.tick(),[]);clock++;assert.deepEqual(notices.tick(),['spawn-5'],'A captured location remains visible for15seconds, even while hovered');
await host.handle(frame(main),'show',prompt('6'));const cancelled=await host.handleSpawn(frame(popup),'contribute',{id:'spawn-6'});await host.handleSpawn(frame(popup),'dismiss',{id:'spawn-6'});assert.equal(host.spawnState().length,0);assert.equal(main.webContents.sent.at(-1)[1].captureRequest,cancelled.captureRequest);await assert.rejects(host.handle(frame(main),'capture-status',{...completion,id:'spawn-6',candidateId:'6',captureRequest:cancelled.captureRequest}),/dismissed/,'Dismiss cancels the flow and rejects late location evidence');
host.dispose();assert(popup.destroyed);assert.equal(handlers.has(SPAWN_CHANNEL),false);assert.equal(handlers.has('eye-of-zomm:discovery'),false);
console.log('Native spawn prompt host: non-activating bottom-right surface, exact-frame restricted IPC, denied resources/permissions, newest-only targeting, explicit main focus and reused hover-paused timeout passed.');
