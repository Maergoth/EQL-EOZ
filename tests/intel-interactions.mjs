import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {mountOverlay} from '../app/overlay.js';
const dom=new JSDOM(await readFile(new URL('../app/overlay.html',import.meta.url),'utf8'),{url:'http://127.0.0.1/overlay.html?panel=intel',pretendToBeVisual:true}),{document}=dom.window;
let clock=0,nextTimer=0,geometry=0;const timers=new Map();
const setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,at:clock+delay});return id;},clearTimeout=id=>timers.delete(id);
const advance=delay=>{clock+=delay;for(const[id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.callback();}};
const oldRect=dom.window.Element.prototype.getBoundingClientRect;
dom.window.Element.prototype.getBoundingClientRect=function(){geometry++;return oldRect.call(this);};
const state={sessionAvailable:true,preferences:{visible:true,locked:false,fontScale:1},snapshot:{session:{zone:'Synthetic Keep',intel:{zone:'Synthetic Keep',packVersion:'fixture',itemTier:0,npcs:Array.from({length:180},(_,index)=>({id:'npc-'+index,name:'Synthetic Keeper '+String(index).padStart(3,'0'),distance:index,dropCount:1,drops:[{name:'Synthetic Drop '+index,stats:{HP:4},baseStats:{HP:4}}]}))}}}};
const view=mountOverlay({document,panel:'intel',bridge:{getState:async()=>state,onState:()=>()=>{},action:async()=>{}},setInterval:()=>1,clearInterval:()=>{},setTimeout,clearTimeout});
await new Promise(resolve=>setImmediate(resolve));
const list=document.querySelector('#intel-body'),first=list.querySelector('.npc-row'),target=first.querySelector('.item-name'),tooltip=document.querySelector('#intel-item-tooltip');
const pointer=(type,node,relatedTarget=null)=>node.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,clientX:10,clientY:20,relatedTarget}));
try{
 list.scrollTop=420;geometry=0;
 for(let update=0;update<20;update++){const next=structuredClone(state);next.snapshot.session.parse={damage:update};view.render(next);}
 assert.equal(geometry,0,'Unrelated session heartbeats perform no Intel row geometry reads');assert.equal(list.querySelector('.npc-row'),first);assert.equal(list.scrollTop,420);
 const moved=structuredClone(state);moved.snapshot.session.intel.npcs.forEach(npc=>npc.distance+=10);view.render(moved);
 assert.equal(geometry,0,'Distance-only snapshots update labels without row geometry or replacement');assert.equal(first,list.querySelector('.npc-row'));assert.match(first.querySelector('[data-intel-distance-index]').textContent,/10u/);assert.equal(list.scrollTop,420);
 pointer('pointerover',target);advance(349);assert(tooltip.hidden);pointer('pointermove',target);advance(1);assert(!tooltip.hidden,'An intentional held mouseover opens after 350ms');
 list.dispatchEvent(new dom.window.Event('scroll'));assert(tooltip.hidden);pointer('pointerover',target);advance(200);pointer('pointerout',target);advance(400);assert(tooltip.hidden,'Leaving before the delay cancels the tooltip');
 target.focus();assert(!tooltip.hidden,'Keyboard focus remains immediate');target.blur();list.dispatchEvent(new dom.window.Event('scroll'));
 pointer('pointerover',target);advance(200);const replaced=structuredClone(moved);replaced.snapshot.session.intel.packVersion='new-pack';view.render(replaced);advance(400);assert(tooltip.hidden,'A source or dataset change cancels the old pending hover');
 const latest=list.querySelector('.item-name');pointer('pointerover',latest);advance(200);view.dispose();advance(400);assert(tooltip.hidden);
 console.log('Intel interactions: 180 rows survive 20 heartbeat updates and movement with no geometry reads, scroll preserved; delayed mouse, immediate keyboard, leave/scroll/source/disposal cancellation passed.');
}finally{view.dispose();dom.window.close();}
