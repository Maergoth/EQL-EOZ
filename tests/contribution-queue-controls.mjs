import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {contributionQueueControls} from '../app/contribution-queue-controls.js';
const dom=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
const previous={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window};Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
const document=dom.window.document,data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},pack={meta:{wikiEntitiesComplete:true},items:[],npcs:[],zones:[],wikiEntities:{items:[],npcs:[],zones:[],titles:[]}},queue=createContributionQueue({storage,getPack:()=>pack});
const first=queue.add({kind:'npc',name:'Synthetic Keeper'},true),second=queue.add({kind:'item',name:'Synthetic Gem'},true),third=queue.add({kind:'zone',name:'Synthetic Valley'},true);
let ledger={schemaVersion:1,entries:[]},subscribers=new Set(),ignored=[];
const wiki={status:async()=>({authenticated:false}),blueprints:async()=>({eras:['Classic Era']}),onStatus:()=>()=>{},contributionIgnores:async()=>structuredClone(ledger),onContributionIgnoresChanged:callback=>{subscribers.add(callback);return()=>subscribers.delete(callback);},ignoreContributionEntity:async target=>{ignored.push(target);ledger={schemaVersion:1,entries:[{id:'synthetic-ignore-id',...target,basis:'exact',canonicalTitle:null,createdAt:'2026-10-25T12:00:00.000Z'}]};for(const callback of subscribers)callback(ledger);return ledger;},restoreContributionEntity:async()=>{ledger={schemaVersion:1,entries:[]};for(const callback of subscribers)callback(ledger);return ledger;}};
const notices=[],mount=()=>mountCaptureWorkspace({document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,share:null,inventory:null,getPack:()=>pack,notify:message=>notices.push(message)}),tick=()=>new Promise(resolve=>setImmediate(resolve));let view;
try{
 view=mount();view.refresh();await tick();
 assert.equal(document.querySelectorAll('[data-dismiss-discovery]').length,3);assert.equal(document.querySelectorAll('[data-ignore-forever]').length,2,'Only NPCs/items offer permanent entity ignore');
 for(const row of document.querySelectorAll('.contribution-row-controls'))assert(row.firstElementChild.matches('[data-dismiss-discovery]'),'Regular × is left of permanent ∞× in visual and keyboard order');
 view.openContribution(first.id);document.querySelector(`[data-dismiss-discovery="${second.id}"]`).click();
 assert.equal(document.querySelector('[data-candidate-form] [name="name"]').value,first.name,'Dismissing another row does not select it');assert(!document.querySelector(`[data-candidate-id="${second.id}"]`));
 document.querySelector(`[data-ignore-forever="${first.id}"]`).click();await tick();await tick();
 assert.deepEqual(ignored,[{kind:'npc',name:first.name}]);assert(!document.querySelector(`[data-candidate-id="${first.id}"]`));
 assert.equal(view.suppression('npc',first.name).suppressed,true);assert.equal(view.suppression('item',first.name).suppressed,false);
 assert(JSON.parse(data.get('eql-eye-of-zomm-contributions-v1')).candidates.some(row=>row.id===first.id),'Ignoring retains saved draft for Restore');
 view.dispose();view=mount();view.refresh();await tick();assert(!document.querySelector(`[data-candidate-id="${first.id}"]`),'Device ignore hides it again after remount');
 document.querySelector('[data-contribution-tab="history"]').click();await tick();
 assert(document.querySelector('[data-ignore-restore]'),'Ignore list is accessible while signed out');document.querySelector('[data-ignore-restore]').click();await tick();await tick();
 assert(document.querySelector(`[data-candidate-id="${first.id}"]`),'Restore reveals retained draft');assert.notEqual(view.suppression('npc',first.name).reason,'permanent-ignore');
 const unsafe=contributionQueueControls({kind:'item',id:'bad"<>',name:'<img src=x onerror=alert(1)>'},{canIgnore:true});assert(!unsafe.includes('<img'));assert(unsafe.includes('&lt;img'));
 console.log('Discovery controls: dismiss without selecting, NPC/item forever ignore, restart, signed-out History restore, retained drafts and escaped labels passed.');
}finally{view?.dispose();dom.window.close();Object.assign(globalThis,previous);}
