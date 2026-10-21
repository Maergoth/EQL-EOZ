import assert from 'node:assert/strict';
import { createDiscoveryNoticeQueue, discoveryNoticeMarkup, mountWikiDiscoveryNotices } from '../app/wiki-discovery-ui.js';

let clock = 1000;
const flush = () => new Promise(resolve => setImmediate(resolve));
const pending = Array.from({length:6},(_,index) => ({id:`notice-${index}`,name:`Synthetic missing ${index}`,kind:'monster'}));
const queue = createDiscoveryNoticeQueue({now:() => clock});
queue.reconcile(pending);
assert.equal(queue.visible().length,4); assert.equal(queue.queued(),2);
clock += 6000; queue.tick(); queue.reconcile(pending);
assert.equal(queue.get('notice-0').remainingMs,9000,'Snapshot heartbeat does not restart an existing deadline');
assert.equal(queue.get('notice-4').startedAt,null,'Queued unseen cards do not spend their fifteen seconds');
queue.hold('notice-0','hover',true); queue.hold('notice-0','focus',true);
clock += 10000; const expired = queue.tick();
assert.deepEqual(expired,['notice-1','notice-2','notice-3']);
assert.equal(queue.get('notice-0').remainingMs,9000,'Hover and keyboard focus pause remaining time');
assert.equal(queue.get('notice-4').remainingMs,15000,'Promotion from the queue starts a full visible deadline');
queue.hold('notice-0','hover',false); clock += 1000; queue.tick(); assert.equal(queue.get('notice-0').remainingMs,9000,'Focus continues holding after hover leaves');
queue.hold('notice-0','focus',false); clock += 8999; queue.tick(); assert.equal(queue.get('notice-0').remainingMs,1);
queue.reset('notice-0'); assert.equal(queue.get('notice-0').remainingMs,15000,'Screenshot success can start a fresh Paste interval');
queue.remove('notice-0'); queue.reconcile(pending); assert.equal(queue.get('notice-0'),undefined,'A stale owner snapshot cannot resurrect a locally dismissed card');
queue.reconcile([]); queue.reconcile([pending[0]]); assert.ok(queue.get('notice-0'),'Suppression is limited to the still-pending owner entry');
const hostile = {...queue.get('notice-0'),prompt:{name:'<img onerror=boom>'},choices:[{id:'" onmouseover="boom',name:'<script>bad</script>'}],message:'<script>unsafe</script>'};
assert.doesNotMatch(discoveryNoticeMarkup(hostile),/<img|<script| onmouseover="boom/);
assert.match(discoveryNoticeMarkup(hostile),/data-discovery-command="capture"/);
assert.match(discoveryNoticeMarkup(hostile),/This monster isn't on the wiki!/);
assert.match(discoveryNoticeMarkup({...hostile,prompt:{name:'Synthetic Ring',kind:'item'}}),/This item isn't on the wiki!/);

// A small event-surface fixture exercises the shared factory without embedding
// another application page or relying on an owner/parser test double.
function fixture(action) {
    const listeners = new Map(), styles = new Map();
    const document = {visibilityState:'visible',activeElement:null,getElementById:id => styles.get(id),createElement:() => ({}),head:{append(node) {styles.set(node.id,node);}}};
    const root = {ownerDocument:document,innerHTML:'',classList:{add() {}},querySelectorAll:() => [],getClientRects:() => document.visibilityState === 'hidden' ? [] : [{}],addEventListener:(name,callback) => listeners.set(name,callback),removeEventListener:name => listeners.delete(name)};
    let tick, closed = false, shutters = 0;
    const ui = mountWikiDiscoveryNotices({root,action,now:() => clock,setInterval:fn => {tick = fn; return 1;},clearInterval:() => {closed = true;},playShutter:() => {shutters++;}});
    const event = (name,command = 'capture',sourceId) => {
        const card = {dataset:{discoveryId:'notice-0'},contains:() => false};
        const button = {disabled:false,dataset:{discoveryCommand:command,sourceId},closest:selector => selector === '[data-discovery-id]' ? card : button};
        listeners.get(name)?.({target:button,relatedTarget:null,type:name});
    };
    return {ui,root,document,event,tick:() => tick(),shutters:() => shutters,closed:() => closed};
}
let calls = [], resolveCapture;
const view = fixture(async (name,payload) => {calls.push({name,payload}); if (name === 'capture') return new Promise(resolve => {resolveCapture = resolve;}); return {ok:true};});
view.ui.render([pending[0]]); clock += 5000; view.tick();
view.document.visibilityState = 'hidden'; view.tick(); clock += 30000; view.tick();
assert.equal(calls.length,0,'Hidden main page or native window does not silently expire an unseen suggestion');
view.document.visibilityState = 'visible'; view.tick();
view.event('mouseover'); clock += 20000; view.tick(); assert.equal(calls.length,0);
view.event('mouseout'); view.event('click'); assert.match(view.root.innerHTML,/Capturing…/);
clock += 50000; view.tick(); assert.equal(calls.length,1,'In-flight capture holds the countdown');
resolveCapture({choices:[{id:'screen:0:0',name:'Synthetic display'}]}); await flush();
assert.match(view.root.innerHTML,/Synthetic display/);
clock += 40000; view.tick(); assert.equal(calls.length,1,'Expanded source choices remain until the user decides');
view.event('click','capture','screen:0:0'); resolveCapture({captured:true}); await flush();
assert.deepEqual(calls[1],{name:'capture',payload:{id:'notice-0',sourceId:'screen:0:0'}});
assert.match(view.root.innerHTML,/Paste your clipboard into discord!/); assert.equal(view.shutters(),1);
clock += 14999; view.tick(); assert.equal(calls.length,2);
clock += 1; view.tick(); await Promise.resolve(); assert.equal(calls[2].name,'dismiss'); assert.equal(view.root.innerHTML,'');
view.ui.dispose(); assert.equal(view.closed(),true);

let attempts = 0;
const retry = fixture(async () => {attempts++; if (attempts === 1) return {choices:[{id:'window:1:0',name:'Old window'}]}; if (attempts === 2) throw new Error('Choose a currently available window or display.'); return {choices:[{id:'window:2:0',name:'New window'}]};});
retry.ui.render([pending[0]]); retry.event('click'); await flush();
retry.event('click','capture','window:1:0'); await flush();
assert.doesNotMatch(retry.root.innerHTML,/Old window/,'Stale source error clears old choices');
assert.match(retry.root.innerHTML,/currently available/);
retry.event('click'); await flush(); assert.match(retry.root.innerHTML,/New window/,'Screenshot can re-enumerate after a source disappears');
retry.ui.dispose();
console.log('Inline wiki notices: shared queue, visible 15-second deadlines, hover/focus/capture holds, safe choices, clipboard success and stale-source recovery passed.');
