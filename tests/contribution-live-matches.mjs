import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createContributionMatchLookup,mountContributionLiveMatches} from '../app/contribution-live-matches.js';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {createContributionQueue} from '../app/contribution-queue.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let at=0,calls=0,resolve;
const lookup=createContributionMatchLookup({now:()=>at,lookup:()=>{calls++;return new Promise(done=>{resolve=done;});}});
const a=lookup.check({name:'Synthetic Blade',kind:'item'}),b=lookup.check({name:'Synthetic_Blade',kind:'item'});
await tick();assert.equal(calls,1,'Concurrent spelling-equivalent lookups coalesce');
resolve({matches:[{title:'Synthetic Blade',pageId:1}]});assert.deepEqual(await a,await b);
await lookup.check({name:'Synthetic Blade',kind:'item'});assert.equal(calls,1,'Rerendering/reselecting uses cached matching suggestions');
at=300001;const expired=lookup.check({name:'Synthetic Blade',kind:'item'});await tick();assert.equal(calls,2);resolve({matches:[]});await expired;
let failures=0;const failed=createContributionMatchLookup({now:()=>at,lookup:async()=>{failures++;throw Error('offline');}});
await assert.rejects(failed.check({name:'Synthetic Gem',kind:'item'}));await assert.rejects(failed.check({name:'Synthetic Gem',kind:'item'}));assert.equal(failures,1,'An unavailable wiki is backed off across editor refreshes');
at+=15001;await assert.rejects(failed.check({name:'Synthetic Gem',kind:'item'}));assert.equal(failures,2);
lookup.dispose();failed.dispose();

const dom=new JSDOM('<form><input name="title" value="Synthetic Blade"><input name="hp" value=""><div data-live-matches-status></div><div data-results></div></form>');
const form=dom.window.document.querySelector('form'),status=form.querySelector('[data-live-matches-status]'),pending=[],results=[];
let active=false;
const auto=createContributionMatchLookup({lookup:request=>new Promise((done,fail)=>pending.push({request,done,fail}))});
const view=mountContributionLiveMatches({form,candidate:{kind:'item',id:'item-1'},lookup:auto,isActive:()=>active,delayMs:5,onResult(result,request){results.push(request.name);form.querySelector('[data-results]').textContent=result.matches.map(row=>row.title).join(', ');}});
await tick();assert.equal(pending.length,0,'Hidden Contribute does not start live matching');
active=true;view.refresh();await tick();assert.equal(pending.length,1,'Entering Contribute checks the selected entry automatically');
const original=form;form.elements.hp.value='123';
form.elements.title.value='Synthetic New Blade';form.elements.title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
pending[0].done({matches:[{title:'Stale page'}]});await tick();assert.equal(results.length,0,'A previous destination cannot overwrite the edited destination');
await new Promise(done=>setTimeout(done,15));assert.equal(pending.length,2);
pending[1].done({matches:[{title:'Synthetic New Blade'}]});await tick();assert.deepEqual(results,['Synthetic New Blade']);
assert.equal(form,original);assert.equal(form.elements.hp.value,'123','Completion updates only suggestions, preserving typed stat fields');assert.match(status.textContent,/Live wiki checked/);
view.refresh();await tick();assert.equal(pending.length,2,'Regular app refresh does not poll the selected title');
form.elements.title.value='Synthetic Other Blade';form.elements.title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await new Promise(done=>setTimeout(done,15));assert.equal(pending.length,3);
active=false;pending[2].done({matches:[{title:'Synthetic Other Blade'}]});await tick();assert.equal(results.length,1,'Leaving Contribute suppresses late result updates');
active=true;view.refresh();await tick();assert.equal(pending.length,3,'Returning reuses the completed lookup');assert.equal(results.at(-1),'Synthetic Other Blade');
form.elements.title.value='Synthetic Failed Blade';form.elements.title.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await new Promise(done=>setTimeout(done,15));assert.equal(pending.length,4);
active=false;pending[3].fail(Error('offline'));await tick();active=true;view.refresh();await tick();
assert.match(status.textContent,/unavailable/,'A failure while hidden cannot leave the returning editor stuck Checking');assert.equal(pending.length,4,'Returning reuses failure backoff instead of immediately requesting again');
view.dispose();auto.dispose();dom.window.close();
console.log('Automatic contribution matching: active-only selection, coalescing/cache/backoff, title debounce, stale-result and hidden-view guards, preserved stat form and no polling passed.');

// The production workspace binds matching without a click and without replacing
// the editor when its asynchronous result arrives.
const workspace=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
const previous={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData};
Object.assign(globalThis,{document:workspace.window.document,window:workspace.window,FormData:workspace.window.FormData});
const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
createContributionQueue({storage}).add({kind:'item',name:'Synthetic Logged Blade'},true);
let liveCalls=0,finish;const wiki={status:async()=>({authenticated:false}),blueprints:async()=>({eras:['Classic Era']}),onStatus:()=>()=>{},matches:async()=>{liveCalls++;return new Promise(done=>finish=done);}};
const mounted=mountCaptureWorkspace({document:workspace.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,inventory:null,share:null,getPack:()=>({items:[],npcs:[],zones:[]})});
try{
    await tick();const actual=workspace.window.document.querySelector('[data-candidate-form]');assert(actual);assert.equal(liveCalls,1);
    assert.equal(actual.querySelector('[data-check-matches]'),null,'The manual Check live wiki step is removed');
    const notes=actual.querySelector('[name="playerText"]');notes.value='Keep this typed note';notes.focus();notes.dispatchEvent(new workspace.window.Event('input',{bubbles:true}));
    finish({matches:[{title:'Synthetic Logged Blade',pageId:123}]});await tick();
    assert.equal(workspace.window.document.querySelector('[data-candidate-form]'),actual);assert.equal(notes.value,'Keep this typed note');assert.equal(workspace.window.document.activeElement,notes);
    assert.match(actual.querySelector('[data-match-results]').textContent,/Synthetic Logged Blade/);mounted.refresh();await tick();assert.equal(liveCalls,1);
}finally{mounted.dispose();workspace.window.close();Object.assign(globalThis,previous);}
