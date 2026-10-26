import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {CHARACTER_PROFILES_KEY} from '../app/character-profiles.js';
import {buildCharacterWikiSheet} from '../app/character-wiki-sheet.js';
import {characterInspectMarkup} from '../app/character-inspect-view.js';
const {JSDOM}=createRequire(import.meta.url)('jsdom');

// Mounted production workspace, synthetic exports and memory-only profile APIs.
const dom=new JSDOM('<div id="contribution-workspace"></div><section class="view is-active"><div id="character-workspace"></div></section><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
const previous={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window};Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
const {document}=dom.window,data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},notices=[],reads=[];
const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Any Slot','Ammo'];
const inventoryText=tier=>['Location\tName\tID\tCount\tSlots',...labels.map((label,index)=>[label,index===2?`Synthetic Cap +${tier}`:'Empty',index===2?100:0,index===2?1:0,11].join('\t'))].join('\n');
const achievementText='Synthetic: <Routes>\nC\tFirst <Journey>\nC\t\tReach <the tower>.\nI\t\tOptional token route.\nSynthetic: Crafts\nI\tCollect tokens\nI\t\tGather tokens.\t3/10';
const file=kind=>({name:`Synthetic_Realm-${kind}.txt`,bytes:500,modifiedAt:Date.now(),sha256:'a'.repeat(64)});
let nextInventory=inventoryText(2),nextAchievements=achievementText,achievementCancelled=false,sourceLists=0,captureStarts=0,releaseSources;
const inventory={async read(request){reads.push({kind:'inventory',...request});return {ok:true,text:nextInventory,file:file('Inventory')};}},achievements={async read(request){reads.push({kind:'achievements',...request});return achievementCancelled?{ok:false,cancelled:true}:{ok:true,text:nextAchievements,file:file('Achievements')};}};
const capture={onStatus:()=>()=>{},onObservation:()=>()=>{},status:async()=>({phase:'disabled',readingEnabled:false,generation:0}),read:async()=>({records:[],lastSequence:0}),sources:async()=>{sourceLists++;if(sourceLists===1)return new Promise(resolve=>{releaseSources=resolve;});return[];},start:async()=>{captureStarts++;return{};},stop:async()=>({phase:'disabled'})};
const pack={meta:{version:'synthetic-achievement-workspace',sample:false,wikiEntitiesComplete:true},items:[{name:'Synthetic Cap',wikiTitle:'Synthetic Cap',slots:['HEAD'],stats:{HP:10}}],npcs:[],zones:[],wikiEntities:{items:['Synthetic Cap'],npcs:[],zones:[],titles:['Synthetic Cap']}};
const view=mountCaptureWorkspace({document,storage,characterStorage:storage,contributionStorage:storage,capture,wiki:null,share:null,inventory,achievements,getPack:()=>pack,notify:message=>notices.push(message)});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async(predicate,label)=>{for(let count=0;count<40;count++){if(predicate())return;await tick();}assert.fail('Timed out: '+label+'; notices='+notices.join('; '));};
const stage=()=>document.querySelector('[data-walkthrough-stage]'),model=()=>{const roster=JSON.parse(data.get(CHARACTER_PROFILES_KEY)),profile=roster.profiles.find(entry=>entry.id===roster.activeId);return JSON.parse(profile.model);};
const visible=node=>!node.closest('[hidden]');
const importButton=()=>stage().querySelector('[data-inventory-read]');
try{
    await tick();assert.equal(reads.length,0);assert(stage().querySelector('[data-character-metadata]'));
    const details=stage().querySelector('form');for(const [name,value]of Object.entries({name:'Synthetic',server:'Realm',race:'Human',classes:'WAR',level:50,aaCount:12}))details.elements[name].value=String(value);
    details.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>importButton(),'export instructions');
    assert.equal(stage().querySelector('pre').textContent,'/outputfile inventory\n/outputfile achievements');
    assert.equal([...document.querySelectorAll('#character-workspace button')].filter(button=>button.textContent.trim()==='Import files'&&visible(button)).length,1,'The combined export step has one visible Import files button');
    assert(!document.querySelector('[data-achievement-read]'),'There is no separate achievement import path');assert.equal(reads.length,0,'Neither identity entry nor rendering starts file reads');assert.equal(sourceLists,0);
    importButton().click();await until(()=>stage().querySelector('[data-walkthrough-stats]'),'paired import -> stats');await tick();
    assert.equal(document.querySelector('[data-character-select]').disabled,false,'Completed file imports release controls while native source enumeration is pending');
    releaseSources([]);await tick();
    assert.deepEqual(reads,[{kind:'inventory',name:'Synthetic',server:'Realm'},{kind:'achievements',name:'Synthetic',server:'Realm'}]);assert.equal(captureStarts,0,'File imports do not start OCR');
    const imported=model();assert(imported.equipment.head);assert.equal(imported.candidates.find(card=>card.id===imported.equipment.head).tier,2);assert.equal(imported.achievements.achievementCount,2);assert.equal(imported.achievements.completedCount,1);
    const local=document.querySelector('[data-character-achievements]');assert.equal(local.querySelectorAll('details').length,5);assert([...local.querySelectorAll('details')].every(detail=>!detail.open),'Achievement/category/objective views begin collapsed');assert(local.textContent.includes('Synthetic: <Routes>'));assert(local.textContent.includes('3 / 10'));assert.equal(local.querySelector('Routes,Journey,script,img'),null,'Names and objective text remain text');
    const stats=stage().querySelector('[data-walkthrough-stats]');stats.querySelector('textarea').value='HP: 2500\nStrength: 150';stats.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>/Review your character/.test(stage().textContent),'stats review');
    const review=new JSDOM(characterInspectMarkup(buildCharacterWikiSheet(model()))).window.document,inspect=review.querySelector('.character-inspect'),achievementView=inspect.querySelector('.character-achievements');assert(achievementView);assert.equal(achievementView.open,false);assert.equal(achievementView.querySelectorAll('.character-achievement-category').length,2);assert(inspect.querySelector('.character-totals-panel').compareDocumentPosition(achievementView)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING,'Inspect achievements follow recorded statistics');assert.equal(inspect.querySelector('Routes,Journey,script,img'),null);
    document.querySelector('[data-walkthrough-back]').click();await tick();document.querySelector('[data-walkthrough-back]').click();await until(()=>importButton(),'return to exports');
    const beforeMalformed=model();nextInventory=inventoryText(4);nextAchievements='Synthetic category\nX\tBad completion marker';importButton().click();await until(()=>/completion marker/.test(document.querySelector('[data-inventory-import-status]').textContent),'malformed second file');
    assert.deepEqual(model(),beforeMalformed,'A malformed achievement export preserves saved gear, achievements and recorded stats together');assert(importButton(),'Failed import stays in the same step with retry available');
    nextAchievements=achievementText.replace('I\tCollect tokens','C\tCollect tokens');importButton().click();await until(()=>stage().querySelector('[data-walkthrough-stats]'),'successful retry');assert.equal(model().achievements.completedCount,2);assert.equal(model().candidates.find(card=>card.id===model().equipment.head).tier,4);
    document.querySelector('[data-walkthrough-back]').click();await until(()=>importButton(),'cancel test exports');const beforeCancelled=model();achievementCancelled=true;importButton().click();await until(()=>/Import canceled/.test(document.querySelector('[data-inventory-import-status]').textContent),'second-file cancellation');assert.deepEqual(model(),beforeCancelled);assert(importButton());assert.equal(captureStarts,0);
    console.log('Mounted Character achievements: one explicit paired import, both command instructions, known gear + achievements, atomic malformed/cancelled retry and escaped nested local/inspect views passed.');
}finally{view.dispose();Object.assign(globalThis,previous);dom.window.close();}
