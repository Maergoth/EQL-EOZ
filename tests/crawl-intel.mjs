import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mountOverlay} from '../app/overlay.js';

const dom=new JSDOM(await readFile(new URL('../app/overlay.html',import.meta.url),'utf8'),{url:'http://127.0.0.1/overlay.html?panel=intel',pretendToBeVisual:true});
const {document,Event,MouseEvent}=dom.window,calls=[];
dom.window.Element.prototype.scrollIntoView=function(){};
let pending;
const source={id:'keeper',name:'Synthetic Keeper',raidInstance:false,waypoint:'1, 2',dropCount:5,drops:[{name:'Fixture Ring',stats:{HP:1}}]};
const state={sessionAvailable:true,preferences:{visible:true},snapshot:{session:{zone:'Synthetic Keep',crawl:{enabled:false},intel:{zone:'Synthetic Keep',npcs:[source]}}}};
const view=mountOverlay({document,panel:'intel',bridge:{getState:async()=>state,onState:()=>()=>{},action:async(action,payload)=>{calls.push({action,payload});if(action==='session:intel-drops')return new Promise(resolve=>pending=resolve);}},setInterval:()=>1,clearInterval:()=>{}});
await new Promise(resolve=>setImmediate(resolve));
try{
 const toggle=document.querySelector('#intel-crawl-mode');assert(!toggle.checked);
 toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));
 assert.deepEqual(calls.at(-1),{action:'session:crawl-mode',payload:{enabled:true}});
 view.render(state);assert(!toggle.checked,'Checkbox has no competing local owner; confirmed session state wins');
 const on=structuredClone(state);on.snapshot.session.crawl.enabled=true;view.render(on);assert(toggle.checked,'Map-owner toggle synchronizes Intel');
 document.querySelector('[data-intel-expand]').click();assert(pending,'Drops began loading before defeat');
 const dead=structuredClone(on);dead.snapshot.session.intel.npcs[0].defeated=true;dead.snapshot.session.intel.focusedNpcId='keeper';dead.snapshot.session.intel.focusSequence=2;view.render(dead);
 const row=document.querySelector('.npc-row');assert(row.classList.contains('is-defeated'));assert(row.querySelector('.npc-name').disabled);assert.match(row.textContent,/Defeated/);
 assert.equal(row.querySelectorAll('.item-card').length,0);assert.equal(row.querySelector('[data-intel-expand]'),null);assert(row.querySelector('.row-actions').hidden);
 row.querySelector('.npc-name').dispatchEvent(new MouseEvent('pointerover',{bubbles:true}));assert(!row.querySelector('.npc-summary').classList.contains('is-actions-open'));
 const before=calls.length;row.querySelector('[data-npc-action]').click();assert.equal(calls.length,before,'Hidden stale action cannot dispatch');
 pending({items:[{name:'Late Drop'}],total:5});await new Promise(resolve=>setImmediate(resolve));assert.equal(row.querySelectorAll('.item-card').length,0,'An in-flight response cannot reactivate defeated drops');
 const off=structuredClone(dead);off.snapshot.session.crawl.enabled=false;view.render(off);assert(!toggle.checked);assert(!document.querySelector('.npc-row').classList.contains('is-defeated'));assert(document.querySelector('.item-card'),'Unchecking restores the normal drop preview');
 console.log('Crawl Intel: shared snapshot checkbox, defeated accessibility/actions/collapsed loot, stale async replies, focus and disable restore passed.');
}finally{view.dispose();dom.window.close();}
