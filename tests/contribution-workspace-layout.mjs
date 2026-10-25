import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {createContributionQueue} from '../app/contribution-queue.js';
const dom=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
const previous={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window};Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},document=dom.window.document;
const pack={meta:{sample:false,wikiEntitiesComplete:true},items:[],npcs:[],zones:[],wikiEntities:{items:[],npcs:[],zones:[]}},queue=createContributionQueue({storage,getPack:()=>pack});queue.add({kind:'item',name:'Synthetic Layout Blade',fields:{tier:0,hp:12}});
const account={id:7,name:'Synthetic contributor'};let statusListener,sourceListener,historyCalls=0;
const wiki={status:async()=>({authenticated:true,user:account,canEdit:true}),blueprints:async()=>({eras:['Classic Era']}),onStatus:fn=>{statusListener=fn;return()=>{};},onAutomaticSourceResult:fn=>{sourceListener=fn;return()=>{};},contributionHistory:async()=>{historyCalls++;return{account,entries:[],hasMore:false};}};
const view=mountCaptureWorkspace({document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,share:null,inventory:null,getPack:()=>pack});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
try{
 view.refresh();await tick();const root=document.getElementById('contribution-workspace'),section=root.querySelector('[data-contribution-section]');
 assert.equal(root.children.length,1);assert.equal(section.querySelector('.contribution-heading h2').textContent,'Contribute');
 for(const selector of ['.contribution-heading','.contribution-tabs','#contribution-discoveries-panel','#contribution-history-panel'])assert.equal(section.querySelector(selector).parentElement,section,'The header, tabs and panels share one section');
 assert.equal(root.querySelectorAll('.contribution-tabs').length,1);assert.equal(root.querySelectorAll('.contribution-automatic-results').length,0);
 const title=root.querySelector('[name="title"]');title.value='Synthetic Edited Layout Blade';title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 for(let index=0;index<3;index++)sourceListener({status:'submitted',itemTitle:'Synthetic item '+index,npcTitle:'Synthetic guardian',zoneTitle:'Synthetic zone'});
 const latest=root.querySelector('.contribution-latest-result');assert(latest.textContent.includes('Synthetic item 2'));assert(!latest.textContent.includes('Synthetic item 0'));assert.equal(latest.querySelectorAll('p').length,1,'Only a compact latest result is repeated outside History');
 sourceListener({status:'needs-attention',itemTitle:'Synthetic item 3',npcTitle:'Synthetic guardian',zoneTitle:'Synthetic zone',reason:'Synthetic revision changed. Review before retrying.'});assert(latest.classList.contains('capture-warning'));assert(latest.textContent.includes('Synthetic revision changed. Review before retrying.'));
 latest.querySelector('[data-open-contribution-history]').click();await tick();assert.equal(historyCalls,1);assert(root.querySelector('#contribution-discoveries-panel').hidden);assert(!root.querySelector('#contribution-history-panel').hidden);assert.equal(document.activeElement.id,'contribution-history-tab');
 const historyTab=root.querySelector('#contribution-history-tab');historyTab.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await tick();assert(!root.querySelector('#contribution-discoveries-panel').hidden);assert(root.querySelector('#contribution-history-panel').hidden);assert.equal(root.querySelector('[name="title"]').value,'Synthetic Edited Layout Blade','Moving through History preserves the editable draft');assert.equal(document.activeElement.id,'contribution-discoveries-tab');
 historyTab.click();await tick();statusListener({authenticated:false});assert.match(root.querySelector('#contribution-history-panel').textContent,/Log in to the wiki/);assert.equal(root.querySelectorAll('[data-history-entry]').length,0,'Layout keeps immediate account clearing');
 console.log('Contribute section: embedded tabs/account, compact latest result, visible failures, history navigation, draft preservation, keyboard tabs and logout clearing passed.');
}finally{view.dispose();Object.assign(globalThis,previous);dom.window.close();}
