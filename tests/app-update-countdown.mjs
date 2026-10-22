import assert from 'node:assert/strict';
import {mountAppUpdates} from '../app/app-update-ui.js';

class Element extends EventTarget {
    hidden=false;disabled=false;checked=false;textContent='';
    removeAttribute(name){delete this[name];}
    click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
}
const ids=['app-update-status','app-update-detail','app-update-progress','app-update-progress-label','check-app-update','download-app-update','install-app-update','cancel-app-update','later-app-update','app-update-startup-download','app-update-notes','app-update-badge'];
const state=(status,extra={})=>({supported:true,status,currentVersion:'0.8.8',availableVersion:'0.8.9',installMode:'silent-windows',automaticDownload:false,...extra});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};};
function fixture(bridge) {
    const elements=Object.fromEntries(ids.map(id=>[id,new Element()])),document=Object.assign(new EventTarget(),{hidden:false,getElementById:id=>elements[id]});
    let at=10000,sequence=0;const timers=new Map();
    const controller=mountAppUpdates({document,bridge,now:()=>at,setTimeout:(callback,delay)=>{const id=++sequence;timers.set(id,{callback,at:at+delay});return id;},clearTimeout:id=>timers.delete(id)});
    return{elements,controller,document,timers,async advance(ms){const end=at+ms;let count=0;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;if(++count>500)throw Error('Timer loop');at=next[1].at;timers.delete(next[0]);await next[1].callback();await flush();}at=end;await flush();}};
}

let current=state('available'),installs=0;
const later=fixture({getStatus:async()=>current,download:async()=>current=state('ready'),install:async()=>{installs++;return current=state('installing');}});
await flush();later.elements['later-app-update'].click();assert.equal(later.elements['later-app-update'].hidden,true);
later.elements['download-app-update'].click();await flush();
assert.match(later.elements['app-update-status'].textContent,/Restarting in 5/);
assert.equal(later.elements['later-app-update'].hidden,false,'A fresh requested download must expose Cancel restart even after an earlier Later decision.');
later.elements['later-app-update'].click();await later.advance(10000);assert.equal(installs,0);later.controller.dispose();

current=state('available');installs=0;const pendingDownload=deferred();
const busy=fixture({getStatus:async()=>current,download:()=>{current=state('downloading');return pendingDownload.promise;},install:async()=>{installs++;return current=state('installing');}});
await flush();busy.elements['download-app-update'].click();await flush();current=state('ready');await busy.controller.refresh();
await busy.advance(6000);assert.equal(installs,0,'A ready poll cannot invoke install while its original download IPC remains pending.');
pendingDownload.resolve(current);await flush();await busy.advance(200);assert.equal(installs,1,'Pending IPC completion does not lose the elapsed countdown.');
await busy.advance(5000);assert.equal(installs,1);busy.controller.dispose();

current=state('available');installs=0;const pendingPreference=deferred();
const preference=fixture({getStatus:async()=>current,download:async()=>current=state('ready'),setStartupDownload:()=>pendingPreference.promise,install:async()=>{installs++;return current=state('installing');}});
await flush();preference.elements['download-app-update'].click();await flush();
preference.elements['app-update-startup-download'].checked=true;preference.elements['app-update-startup-download'].dispatchEvent(new Event('change'));await flush();
await preference.advance(6000);assert.equal(installs,0,'Another pending updater IPC also defers the deadline action.');
preference.elements['later-app-update'].click();pendingPreference.resolve(state('ready',{automaticDownload:true}));await flush();await preference.advance(10000);
assert.equal(installs,0,'Cancel restart survives a pending preference response.');preference.controller.dispose();

current=state('ready',{automaticDownload:true});installs=0;
const restored=fixture({getStatus:async()=>current,install:async()=>{installs++;return state('installing');}});
await flush();await restored.advance(20000);assert.equal(installs,0,'A staged package restored on startup never gains new restart authorization.');restored.controller.dispose();

current=state('available');installs=0;
const error=fixture({getStatus:async()=>current,download:async()=>current=state('ready'),install:async()=>{installs++;return state('installing');}});
await flush();error.elements['download-app-update'].click();await flush();current=state('ready',{error:'Synthetic verification failure'});await error.controller.refresh();await error.advance(10000);
assert.equal(installs,0,'A verification or handoff error cancels restart.');
current=state('ready');await error.controller.refresh();await error.advance(10000);assert.equal(installs,0,'A cleared error does not restore canceled countdown authorization.');error.controller.dispose();

current=state('available');installs=0;
const disposed=fixture({getStatus:async()=>current,download:async()=>current=state('ready'),install:async()=>{installs++;return state('installing');}});
await flush();disposed.elements['download-app-update'].click();await flush();disposed.controller.dispose();await disposed.advance(10000);assert.equal(installs,0);assert.equal(disposed.timers.size,0);

current=state('available',{installMode:'manual-linux'});installs=0;
const linux=fixture({getStatus:async()=>current,download:async()=>current=state('ready',{installMode:'manual-linux',automaticDownload:true}),install:async()=>{installs++;return current;}});
await flush();linux.elements['download-app-update'].click();await flush();await linux.advance(20000);assert.equal(installs,0);assert.equal(linux.elements['install-app-update'].textContent,'Open download folder');linux.controller.dispose();
console.log('Updater countdown: Later return, native IPC deferral, cancellation races, restored packages, errors, disposal and Linux handoff passed.');
