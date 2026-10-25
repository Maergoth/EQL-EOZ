import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountContributionHistory} from '../app/contribution-history.js';
import {ignoredEntitiesMarkup,mountIgnoredEntities} from '../app/ignored-entities-view.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const npc={id:'npc-1',kind:'npc',name:'A synthetic watcher',canonicalTitle:'Synthetic Watcher',basis:'canonical',createdAt:'2026-10-25T12:00:00Z'};
const item={id:'item-1',kind:'item',name:'Synthetic Relic',canonicalTitle:null,basis:'exact',createdAt:'2026-10-25T12:00:00Z'};
const snapshot=entries=>({schemaVersion:1,entries,maxEntries:2000});
const unsafe=ignoredEntitiesMarkup([{...npc,id:'" onclick="bad()',name:'<img src=x onerror=bad()>',canonicalTitle:null}]);
assert(!unsafe.includes('<img'));assert(unsafe.includes('&lt;img'));assert(!new JSDOM(unsafe).window.document.querySelector('[onclick]'));

const dom=new JSDOM('<section></section>'),host=dom.window.document.querySelector('section');
let changed,unsubscribed=false,lists=0,historyReads=0,restoreCalls=[],answer=snapshot([npc,item]),restoreFailure=false;
const view=mountContributionHistory({host,wiki:{
    contributionHistory:async()=>{historyReads++;return{account:null,entries:[],hasMore:false};},
    contributionIgnores:async()=>{lists++;return answer;},
    restoreContributionEntity:async input=>{restoreCalls.push(input);if(restoreFailure)throw Error('Synthetic storage failure');answer=snapshot(answer.entries.filter(entry=>entry.id!==input.id));return answer;},
    onContributionIgnoresChanged:callback=>{changed=callback;return()=>{unsubscribed=true;};}
}});
view.setAccount({authenticated:false});assert.equal(lists,0,'hidden history does not read device storage');
view.setActive(true);await tick();
assert.equal(lists,1);assert.equal(historyReads,1);assert.match(host.textContent,/Log in to the wiki/);assert.match(host.textContent,/On this device/);
assert.equal(host.querySelectorAll('[data-ignore-entry]').length,2,'device ignores remain manageable while signed out');
host.querySelector('[data-ignore-query]').value='watcher';host.querySelector('[data-ignore-query]').dispatchEvent(new dom.window.Event('input'));
assert.equal(host.querySelectorAll('[data-ignore-entry]').length,1);assert.equal(lists,1,'filtering never performs a native or wiki read');
host.querySelector('[data-ignore-query]').value='';host.querySelector('[data-ignore-query]').dispatchEvent(new dom.window.Event('input'));
host.querySelector('[data-ignore-kind]').value='item';host.querySelector('[data-ignore-kind]').dispatchEvent(new dom.window.Event('change'));
assert.equal(host.querySelector('[data-ignore-entry]').dataset.ignoreEntry,item.id);
host.querySelector('[data-ignore-kind]').value='all';host.querySelector('[data-ignore-kind]').dispatchEvent(new dom.window.Event('change'));
restoreFailure=true;host.querySelector(`[data-ignore-restore="${npc.id}"]`).click();await tick();
assert.match(host.textContent,/Synthetic storage failure/);assert.equal(host.querySelectorAll('[data-ignore-entry]').length,2,'failed Restore never removes a persisted entry optimistically');
restoreFailure=false;host.querySelector(`[data-ignore-restore="${npc.id}"]`).click();await tick();
assert.deepEqual(restoreCalls,[{id:npc.id},{id:npc.id}]);assert.equal(host.querySelectorAll('[data-ignore-entry]').length,1);assert.equal(historyReads,1,'Restore never changes account receipts');
view.setAccount({authenticated:true,user:{id:2,name:'Other contributor'}});await tick();
assert.equal(host.querySelectorAll('[data-ignore-entry]').length,1,'account changes cannot clear device ignores');
view.setActive(false);changed(snapshot([npc,item]));assert.equal(host.querySelectorAll('[data-ignore-entry]').length,2,'native change events update the device list without account state');
view.dispose();assert.equal(unsubscribed,true);changed(snapshot([]));assert.equal(host.querySelectorAll('[data-ignore-entry]').length,2,'disposed views ignore later native events');dom.window.close();

const raceDom=new JSDOM('<section></section>'),raceHost=raceDom.window.document.querySelector('section');let resolveOld,raceChanged,resolveRestore;
const race=mountIgnoredEntities({host:raceHost,wiki:{contributionIgnores:()=>new Promise(resolve=>{resolveOld=resolve;}),restoreContributionEntity:()=>new Promise(resolve=>{resolveRestore=resolve;}),onContributionIgnoresChanged:callback=>{raceChanged=callback;return()=>{};}}});
race.setActive(true);raceChanged(snapshot([npc,item]));resolveOld(snapshot([]));await tick();
assert.equal(raceHost.querySelectorAll('[data-ignore-entry]').length,2,'a stale list read cannot erase a newer native snapshot');
raceHost.querySelector(`[data-ignore-restore="${npc.id}"]`).click();assert.equal(raceHost.querySelector('[data-ignore-refresh]').disabled,true,'refresh cannot cancel an outstanding Restore');
raceChanged(snapshot([item]));resolveRestore(snapshot([]));await tick();assert.equal(raceHost.querySelectorAll('[data-ignore-entry]').length,1,'a stale mutation response cannot overwrite a newer ledger event');
raceChanged({...snapshot([item]),blocked:true,warning:'Synthetic blocked ledger'});assert.match(raceHost.textContent,/Synthetic blocked ledger/);assert.equal(raceHost.querySelector('[data-ignore-restore]').disabled,true,'unreadable ledger cannot be mutated');
race.dispose();raceDom.window.close();
console.log('Ignored entity manager: signed-out History, local filters, explicit Restore, errors, account independence, native event races and safe text pass.');
