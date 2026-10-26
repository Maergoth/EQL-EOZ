import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {fixture} from './character-repository-client.mjs';
const dom=new JSDOM('<section class="view"><div id="contribution-workspace"></div></section><section class="view is-active"><div id="character-workspace"></div></section><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
const prior={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window};
Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
const f=fixture(),values=new Map(),warnings=[],writes=[],storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{writes.push(key);values.set(key,value);},removeItem:key=>values.delete(key)};
const document=dom.window.document;
const until=async(predicate,label)=>{for(let index=0;index<200;index++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Timed out: '+label);};
const view=mountCaptureWorkspace({document,storage,characterStorage:storage,characterRepository:f.api,capture:null,wiki:null,inventory:null,achievements:null,getPack:()=>({items:[],npcs:[],zones:[],meta:{sample:false,wikiEntitiesComplete:true}}),notify:message=>warnings.push(message)});
try{
    await until(()=>document.querySelectorAll('[data-character-inventory] [data-edit-card]').length>0,'initial repository page');
    assert(document.querySelector('[data-character-inventory-count]').textContent.includes('10,020 saved'));
    assert(document.querySelectorAll('[data-character-inventory] [data-edit-card]').length<=50);
    assert.equal(document.querySelectorAll('[data-character-slots] [data-edit-card]').length,1);
    const list=f.calls.filter(call=>call[0]==='list');assert(list.every(call=>call[1].limit<=50));
    document.querySelector('[data-inventory-page=next]').click();await until(()=>document.querySelector('[data-character-inventory] [data-edit-card]')?.dataset.editCard==='row-51','next page');
    const item=document.querySelector('[data-character-inventory] [data-edit-card]');item.click();
    const form=document.querySelector('.character-card-editor');assert(form);form.elements.rawStatBlock.value='HP: 123';
    const release=f.block();form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>f.calls.some(call=>call[0]==='transaction'),'native transaction requested');
    assert.match(document.querySelector('[data-character-repository-status]').textContent,/Saving/);
    assert.equal(f.rows.get(item.dataset.editCard).rawStatBlock,'','no early durable save');
    release();await view.flushCharacter();assert.equal(f.rows.get(item.dataset.editCard).rawStatBlock,'HP: 123');
    await until(()=>/saved on this computer/.test(document.querySelector('[data-character-repository-status]').textContent),'native ACK shown');
    assert(!writes.some(key=>/character-(?:v1|profiles-v1|walkthrough-v1)$/.test(key)),'native path never mirrors full inventory or roster to browser storage');
    assert.equal(f.rows.size,10020);assert.equal(warnings.length,0);
    // Native parser errors must reach the inline import status as well as the
    // existing warning path, without changing the saved inventory.
    const savedRows=structuredClone([...f.rows]);
    const importError='Synthetic incomplete worn equipment export.';
    f.api.importFiles=async()=>{throw Error(importError);};
    document.querySelector('[data-character-reimport]').click();
    await until(()=>document.querySelector('[data-inventory-read]')&&!/Saving/.test(document.querySelector('[data-character-repository-status]').textContent),'inventory import step ACK');
    await view.flushCharacter();await new Promise(resolve=>setTimeout(resolve,0));
    document.querySelector('[data-inventory-read]').click();
    await until(()=>document.querySelector('[data-inventory-import-status]')?.textContent===importError,'native failure is visible inline');
    assert(warnings.includes(importError),'the existing warning receives the same error');
    assert.deepEqual([...f.rows],savedRows,'failed native import changes no saved rows');
    // A late failure from a canceled walkthrough may still be warned, but must
    // never replace the current workflow's inline status.
    let rejectImport;
    f.api.importFiles=()=>new Promise((resolve,reject)=>{rejectImport=reject;});
    document.querySelector('[data-inventory-read]').click();
    await until(()=>typeof rejectImport==='function','second native import started');
    document.querySelector('[data-character-stop]').click();
    rejectImport(Error('Retired synthetic import failure.'));
    await until(()=>document.querySelector('[data-walkthrough-status]').textContent.includes('Walkthrough canceled'),'cancelled walkthrough finishes');
    assert(!document.querySelector('[data-inventory-import-status]'),'retired inline status is not recreated after cancellation');
    assert(!document.querySelector('[data-walkthrough-status]').textContent.includes('Retired synthetic'));
    assert.deepEqual([...f.rows],savedRows,'late failed import changes no saved rows');
}finally{view.dispose();Object.assign(globalThis,prior);dom.window.close();}
console.log('Mounted Character repository workspace: 10k native rows, bounded grid, equipment, page navigation, real editor, save ACK and no full browser mirror passed.');
