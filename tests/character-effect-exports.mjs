import assert from 'node:assert/strict';
import {createCharacterModel,CHARACTER_STORAGE_KEY} from '../app/character-model.js';
import {resolveInventoryCatalog,resolveCharacterCatalog} from '../app/character-catalog.js';
import {characterCatalogDetails,characterEffectDetails} from '../app/character-item-card.js';
import {characterItemboxExaltationMarkup} from '../app/character-itembox.js';
import {buildCharacterWikiSheet,normalizeCharacterWikiSheet,serializeCharacterWikiSheet} from '../app/character-wiki-sheet.js';
import {parseInventoryExport} from '../app/inventory-export.js';
const parent={name:'Synthetic Robe',wikiTitle:'Synthetic Robe',slots:['CHEST'],stats:{HP:100},displayLines:['Slot: CHEST','Class: WAR','Race: ALL']};
const effects=[{label:'Focus effect',value:'Synthetic Clarity (Worn)',linkTitle:'Synthetic Clarity'},{label:'Effect',value:'Synthetic Spark (Worn)',linkTitle:'Synthetic Spark'}];
const stone={name:'Synthetic Stone',wikiTitle:'Synthetic Stone',slots:['HEAD'],stats:{HP:7},details:[...effects,{label:'Flags',value:'LORE ITEM'},{label:'Class',value:'CLR'},{label:'Race',value:'ALL'},{label:'Notes',value:'Private unrelated notes'}]};
const pack={meta:{wikiEntitiesComplete:true},items:[parent,stone],wikiEntities:{items:[],npcs:[],titles:[]}};
const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)},model=createCharacterModel({storage});
model.setMetadata({name:'Synthetic Reader',server:'Example',level:50,classes:['WAR'],aaCount:4});
const card=model.intake({name:parent.name,slots:['CHEST'],tier:4,observedStats:{HP:333},observedStatsComplete:true,augmentStatus:'included',augmentSlots:3,augments:[
    {index:1,name:stone.name,wikiTitle:stone.wikiTitle,catalogIdentity:{name:stone.name,wikiTitle:stone.wikiTitle,match:'exact'},tier:8,sourceSlot:10,iconId:'321',stats:{HP:987654},statsComplete:true,baseStats:{HP:111},details:[{label:'Notes',value:'Retained local note'}]},
    {index:2,name:'Synthetic unresolved stone',wikiTitle:'Synthetic unresolved stone',catalogIdentity:{name:'Synthetic unresolved stone',wikiTitle:'Synthetic unresolved stone',match:'manual'},tier:2,stats:{STR:17},details:[{label:'Effect',value:'Retained unknown effect'}]}
]},{wikiItem:parent}).candidate;
assert(model.assign(card.id,'chest').ok);model.setStatSnapshot('current',{stats:{HP_MAXIMUM:4321},confirmed:true});
const old=model.snapshot(),restarted=createCharacterModel({storage});
const numeric=card=>({observedStats:card.observedStats,tier:card.tier,augmentSlots:card.augmentSlots,emptyAugmentSlots:card.emptyAugmentSlots,augmentStatus:card.augmentStatus,augmentBaseline:card.augmentBaseline,
    augments:card.augments.map(augment=>Object.fromEntries(Object.entries(augment).filter(([key])=>key!=='details')))});
const priorNumeric=numeric(old.candidates[0]),priorTotals=restarted.totals(),calls=[];
assert(restarted.reconcileCatalog((card,options={})=>{calls.push(options);const exact=resolveInventoryCatalog(pack,card.name,{socket:options.socket===true});return exact.item?{status:'exact',...exact}:resolveCharacterCatalog(pack,card.name);}).ok);
const refreshed=restarted.snapshot(),updated=refreshed.candidates.find(item=>item.id===card.id);
assert.deepEqual(numeric(updated),priorNumeric,'Refreshing saved socket effects never changes observed/base numeric data, tiers, capacities, source positions or parent data');assert.deepEqual(restarted.totals(),priorTotals);
assert.deepEqual(characterEffectDetails(updated.augments[0].details),effects);assert(updated.augments[0].details.some(detail=>detail.value==='Retained local note'));
assert.deepEqual(updated.augments[1].details,old.candidates[0].augments[1].details,'Unresolved socket metadata stays unchanged');assert(calls.some(options=>options.socket===true));
assert.deepEqual(createCharacterModel({storage}).snapshot(),refreshed,'Hydrated metadata persists across restart');
const sheet=buildCharacterWikiSheet(refreshed),before=JSON.stringify(sheet),source=serializeCharacterWikiSheet(sheet),socket=sheet.equipment[0].augments[0];
assert.equal(socket.stats.HP,987654);assert.equal(socket.tier,8);assert.equal(normalizeCharacterWikiSheet(sheet).equipment[0].augments[0].iconId,321,'The validated rich schema-1 DTO remains compatible');assert.equal(JSON.stringify(sheet),before);
assert.match(source,/\|chest_tier=4\n/);assert.match(source,/\|chest_stats=HP: 333\n/);assert.match(source,/\|chest_details=.*Class: WAR/);assert.match(source,/\|chest_augment_slots=3\n/);
assert.match(source,/\|chest_augment_2_item=Synthetic Stone\n/);assert.match(source,/Focus effect: \[\[Synthetic Clarity\|Synthetic Clarity \(Worn\)\]\]/);
assert.match(source,/Effect: \[\[Synthetic Spark\|Synthetic Spark \(Worn\)\]\]/);assert.doesNotMatch(source,/\|chest_augment_\d+_(?:stats|tier|icon)=|987654|Retained local note|Private unrelated notes/);
const socketFields=[...source.matchAll(/\|chest_augment_\d+_(\w+)=([^\n]*)/g)];assert(socketFields.every(match=>['item','details'].includes(match[1])));assert(socketFields.filter(match=>match[1]==='details').every(match=>!/Class:|Race:|Flags:|HP:|STR:/.test(match[2])));
const markup=characterItemboxExaltationMarkup({title:stone.name,tier:8,stats:{HP:987654},details:[...stone.details,{label:'Focus Exaltation',value:'Nested unrelated socket'}]});
assert.match(markup,/Focus effect: <a[^>]+Synthetic%20Clarity[^>]*>Synthetic Clarity<\/a> \(Worn\)/);assert.doesNotMatch(markup,/987654|\+8|LORE ITEM|Class:|Race:|Private unrelated|Nested unrelated|data-item-stat/);
const hostile=characterItemboxExaltationMarkup({title:stone.name,details:[{label:'Focus effect',value:'<script>bad</script> (Worn)',linkTitle:'Synthetic Clarity'}]});assert(!hostile.includes('<script>'));assert(hostile.includes('&lt;script&gt;'));
// Exact-looking but mismatched, fuzzy and ambiguous resolutions cannot alter a socket.
for(const resolution of [{status:'exact',item:{...stone,name:'Other stone',wikiTitle:'Other stone'}},{status:'fuzzy',item:stone},{status:'ambiguous',item:stone},{status:'unmatched'}]){
    const isolated=new Map([[CHARACTER_STORAGE_KEY,JSON.stringify(old)]]),local=createCharacterModel({storage:{getItem:key=>isolated.get(key),setItem:(key,value)=>isolated.set(key,value)}});
    assert(local.reconcileCatalog((card,{socket=false}={})=>socket?resolution:{status:'exact',item:parent}).ok);assert.deepEqual(local.snapshot().candidates[0].augments,old.candidates[0].augments);
}
const failed=createCharacterModel({storage}),unchanged=failed.snapshot();assert.equal(failed.reconcileCatalog((card,{socket=false}={})=>{if(socket)throw Error('Synthetic lookup failure');return {status:'exact',item:parent};}).ok,false);assert.deepEqual(failed.snapshot(),unchanged);
const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Any Slot','Ammo'];
const exported=['Location\tName\tID\tCount\tSlots',...labels.flatMap(label=>label==='Chest'?['Chest\tSynthetic Robe +4\t1\t1\t11','Chest-Slot10\tSynthetic Stone (Exaltation) +8\t2\t1\t11']:[label+'\tEmpty\t0\t0\t0'])].join('\n');
const fresh=createCharacterModel({storage:null});fresh.setMetadata(old.metadata);assert(fresh.applyInventoryExport(parseInventoryExport(exported),{resolveItem:entry=>resolveInventoryCatalog(pack,entry.baseName,{socket:entry.group==='augment'})}).ok);
const freshSource=serializeCharacterWikiSheet(buildCharacterWikiSheet(fresh.snapshot()));assert.match(freshSource,/Focus effect: \[\[Synthetic Clarity/);assert.doesNotMatch(freshSource,/\|chest_augment_1_(?:stats|tier|icon)=|Class: CLR|LORE ITEM/);
assert.equal(characterCatalogDetails({details:[{label:'Focus effect',value:'Synthetic Clarity (Worn)',linkTitle:'Synthetic Clarity'}]}).find(detail=>detail.label==='Focus effect').linkTitle,'Synthetic Clarity');
const canonicalAliases=[{label:'Effect',value:'Visible effect (Worn)',linkTitle:'Canonical Effect'},{label:'Focus effect',value:'Visible focus',linkTitle:'Canonical Focus'}];
assert.deepEqual(characterCatalogDetails({details:canonicalAliases,displayLines:['Effect: Visible effect (Worn)','Focus Effect: Visible focus'],focus_effect:'Visible focus'}),canonicalAliases,'Typed canonical targets win over identical display and legacy-focus fallbacks');
console.log('Exaltation effects: existing exact-catalog refresh, numeric/model/schema preservation, name/effect-only future wiki output, compact typed Focus/Worn links and fresh imports passed.');
