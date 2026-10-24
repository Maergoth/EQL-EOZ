import assert from 'node:assert/strict';
import {createWikiResolver,itemExportBaseIdentity} from '../app/wiki-identity.js';
import {resolveInventoryCatalog} from '../app/character-catalog.js';
import {parseInventoryExport} from '../app/inventory-export.js';
import {createCharacterModel} from '../app/character-model.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {CONTRIBUTION_QUEUE_KEY} from '../app/contribution-evidence.js';

// Synthetic catalog/export only. Flat membership contains display spellings
// and redirect labels, not a second independently identified canonical page.
const pack={meta:{wikiEntitiesComplete:true,version:'identity-099'},wikiEntities:{items:['Known Blade','Known Rune','Backpack','Known Token'],npcs:['A Known Guardian','a known guardian'],titles:['Known Blade','Known Rune','Backpack','Known Token','A known guardian','Forest Glade']},
    items:[{name:'Known Blade',wikiTitle:'Known Blade',slots:['PRIMARY'],stats:{DMG:10},dropSources:[{name:'A Known Guardian',zone:'Forest Glade',instanceType:'normal'}]},{name:'Known Rune',wikiTitle:'Known Rune',slots:['HANDS'],stats:{HP:20}},{name:'Backpack',wikiTitle:'Backpack',slots:[],stats:{WT:3}},{name:'Known Token',wikiTitle:'Known Token',slots:[],stats:{}}],
    npcs:[{name:'A Known Guardian',zone:'Forest Glade'},{name:'a known guardian',zone:'Forest Glade'}],zones:[{name:'Forest Glade'}]};
const identity=createWikiResolver(pack);
for(const name of ['A Known Guardian','A known guardian','a KNOWN GUARDIAN']){const found=identity.resolve('npc',name);assert.equal(found.membership,'present');assert.equal(found.canonicalTitle,'A known guardian');assert.equal(found.candidates.length,1);}
assert.equal(identity.has('item','Known Rune (Exaltation)'),true);
assert.equal(identity.has('item','Known Rune+4 (Exaltation)'),true);
assert.equal(identity.has('item','Backpack*'),true);
assert.equal(itemExportBaseIdentity('Backpack*'),'Backpack');
assert.equal(identity.resolve('item','Unknown Rune (Exaltation)').name,'Unknown Rune (Exaltation)');
assert.equal(identity.resolve('item','Unknown Bag*').name,'Unknown Bag*');
assert.equal(resolveInventoryCatalog(pack,'Known Rune (Exaltation)',{socket:true}).item.wikiTitle,'Known Rune');
assert.equal(resolveInventoryCatalog(pack,'Known Rune (Exaltation)',{socket:true}).exaltationAlias,true);
assert.deepEqual(resolveInventoryCatalog(pack,'Known Rune (Exaltation)'),{},'A worn item cannot use the socket-only identity alias');
assert.equal(resolveInventoryCatalog(pack,'Backpack*').exportNameAlias,true);
assert.equal(resolveInventoryCatalog(pack,'Backpack*').item.wikiTitle,'Backpack');
const distinct={...pack,items:[...pack.items,{name:'Known Rune (Exaltation)',wikiTitle:'Known Rune (Exaltation)',slots:[],stats:{HP:1}}]};
assert.equal(resolveInventoryCatalog(distinct,'Known Rune (Exaltation)',{socket:true}).item.wikiTitle,'Known Rune (Exaltation)');
assert.equal(resolveInventoryCatalog(distinct,'Known Rune (Exaltation)',{socket:true}).exaltationAlias,undefined);
const collision={...pack,items:[{name:'A Relic',wikiTitle:'A Relic'},{name:'A relic',wikiTitle:'A relic'}]};
assert.equal(createWikiResolver(collision).resolve('item','A RELIC').membership,'ambiguous');
assert.deepEqual(resolveInventoryCatalog(collision,'A RELIC'),{},'An actual canonical collision never chooses by array order');

const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Any Slot','Ammo'];
const row=(location,name='Empty',id=0,count=0,slots=0)=>[location,name,id,count,slots].join('\t');
const lines=labels.flatMap((label,index)=>index===13?[row(label,'Known Blade +4',1,1,11),row('Primary-Slot7','Known Rune (Exaltation)',2,1,11)]:[row(label)]);
const parsed=parseInventoryExport(['Location\tName\tID\tCount\tSlots',...lines,row('General 1','Backpack*',3,1,8),row('General 1-Slot1','Known Token',4,1,11)].join('\n'));
const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},model=createCharacterModel({storage});
const imported=model.applyInventoryExport(parsed,{resolveItem:entry=>resolveInventoryCatalog(pack,entry.baseName,{socket:entry.group==='augment'})});
assert.equal(imported.ok,true);assert.equal(imported.unknownCount,0);assert.equal(imported.importedCount,3);
const snapshot=model.snapshot(),blade=snapshot.candidates.find(item=>item.id===snapshot.equipment.primary);
assert.equal(blade.name,'Known Blade');assert.equal(blade.tier,4);assert.equal(blade.augments[0].name,'Known Rune');assert.equal(blade.augments[0].sourceSlot,7);
assert(snapshot.candidates.some(item=>item.name==='Backpack'));assert(snapshot.candidates.some(item=>item.name==='Known Token'),'Recognizing the bag preserves its contents');
assert.equal(snapshot.inventoryExport.rejectedItems.length,0);assert.deepEqual(createCharacterModel({storage}).snapshot(),snapshot,'Canonical bag/socket imports persist');
const forged=createCharacterModel({storage:{getItem:()=>null,setItem(){}}});
const bad=forged.applyInventoryExport(parsed,{resolveItem:entry=>entry.baseName==='Backpack*'?{item:{name:'Unrelated Bag',wikiTitle:'Unrelated Bag'},exportNameAlias:true}:resolveInventoryCatalog(pack,entry.baseName,{socket:entry.group==='augment'})});
assert.equal(bad.ok,true);assert(bad.inventoryExport.rejectedItems.some(item=>item.baseName==='Backpack*'),'An alias flag cannot force an unrelated catalog identity into the import');

const base={fields:{},sources:[],relations:[],evidence:[],status:'needs-review'},legacy=[
    {...base,id:'socket-false-positive',kind:'item',name:'Known Rune (Exaltation)',title:'Known Rune (Exaltation)'},
    {...base,id:'bag-false-positive',kind:'item',name:'Backpack*',title:'Backpack*'},
    {...base,id:'case-false-positive',kind:'npc',name:'A Known Guardian',title:'A Known Guardian',zone:'Forest Glade'},
    {...base,id:'edited-socket',kind:'item',name:'Known Rune (Exaltation)',title:'Known Rune (Exaltation)',fields:{notes:{value:'Keep authored work',edited:true}}},
    {...base,id:'partial-socket',kind:'item',name:'Known Rune (Exaltation)',title:'Known Rune (Exaltation)',status:'partial',planId:'saved-review'},
    {...base,id:'real-source',kind:'item',name:'Known Blade',title:'Known Blade',zone:'Forest Glade',relations:[{type:'drop-source',name:'A new guardian',zone:'Forest Glade',instance:'normal',evidence:'explicit-corpse'}]}
];
const queueMemory=new Map([[CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,candidates:legacy})]]),queueStorage={getItem:key=>queueMemory.get(key)||null,setItem:(key,value)=>queueMemory.set(key,value)};
const queue=createContributionQueue({storage:queueStorage,getPack:()=>pack,now:()=>Date.UTC(2026,9,24,16)});
assert.deepEqual(queue.archived().map(item=>item.id),['socket-false-positive','bag-false-positive','case-false-positive']);
assert.deepEqual(queue.snapshot().map(item=>item.id),['edited-socket','partial-socket','real-source']);
assert.equal(queue.snapshot().find(item=>item.id==='real-source').intent,'update');
assert.equal(queue.snapshot().find(item=>item.id==='edited-socket').fields.notes.value,'Keep authored work');
const saved=queueMemory.get(CONTRIBUTION_QUEUE_KEY);createContributionQueue({storage:queueStorage,getPack:()=>pack,now:()=>Date.UTC(2026,9,24,16)});assert.equal(queueMemory.get(CONTRIBUTION_QUEUE_KEY),saved,'The safe cleanup is byte-idempotent');
const fresh=createContributionQueue({storage:{getItem:()=>null,setItem(){}},getPack:()=>pack});
assert.equal(fresh.add({kind:'item',name:'Known Rune (Exaltation)'}),null);assert.equal(fresh.add({kind:'item',name:'Backpack*'}),null);assert.equal(fresh.add({kind:'npc',name:'A KNOWN GUARDIAN'}),null);
assert.equal(fresh.add({kind:'item',name:'Known Blade',zone:'Forest Glade',relations:[{type:'drop-source',name:'a known guardian',zone:'FOREST GLADE',instance:'normal',evidence:'explicit-corpse'}]}),null,'Case variants in a real existing relationship do not create gaps');
console.log('0.9.9 identity/import: case-insensitive membership with canonical collision refusal, direct-first Exaltation/container aliases, guarded bag/socket import, preserved contents and non-destructive idempotent queue cleanup passed.');
