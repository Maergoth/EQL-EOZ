import assert from 'node:assert/strict';
import { searchCharacterCatalog, resolveCharacterCatalog, characterCatalogCard, characterCatalogPreview, CHARACTER_CATALOG_LIMITS } from '../app/character-catalog.js';
import { createCharacterModel, characterItemStats, characterShareSummary } from '../app/character-model.js';

const ring={name:'Synthetic Émber Ring',wikiTitle:'Ring of the Ember Guardian',iconId:'Exact_Icon_007',slots:['Fingers'],requiredLevel:21,stats:{HP:100,STR:2,DEX:-2,DMG:13,DELAY:20,WT:2.3,ATK:50,SV_CORRUPTION:9}};
const weapon={name:'Synthetic Quartz Blade',wikiTitle:'Test:Quartz Blade',slots:['Primary'],stats:{HP:20,DMG:11}};
const pack={meta:{wikiEntitiesComplete:true,version:'synthetic-catalog'},items:[weapon,ring],icons:{}};
const before=JSON.stringify(pack);
for(const query of ['EMBER ring','guardian ember','ring, ÉMBER','ring_of_the_ember']){
    const result=searchCharacterCatalog(pack,query);assert.deepEqual(result.items,[ring],query);assert.equal(result.incomplete,false);
}
assert.deepEqual(searchCharacterCatalog(pack,'test quartz').items,[weapon],'wiki titles participate independently of display names');
assert.equal(searchCharacterCatalog(pack,'unrelated').status,'no-match');
assert.equal(searchCharacterCatalog(pack,' ').status,'prompt');
assert.equal(searchCharacterCatalog({items:[]},'ring').status,'empty');
assert.equal(searchCharacterCatalog({items:[ring],meta:{sample:true,wikiEntitiesComplete:true}},'ring').incomplete,true);
assert.equal(searchCharacterCatalog({items:[ring]},'absent').incomplete,true,'partial catalog misses are not claims of absence');
assert.equal(searchCharacterCatalog(null,'ring').incomplete,true);
const many={...pack,items:Array.from({length:90},(_,i)=>({name:`Synthetic Ring ${String(i).padStart(3,'0')}`}))};
const bounded=searchCharacterCatalog(many,'ring');assert.equal(bounded.total,90);assert.equal(bounded.items.length,CHARACTER_CATALOG_LIMITS.results);assert.equal(searchCharacterCatalog(many,'ring',{limit:999}).items.length,CHARACTER_CATALOG_LIMITS.maximumResults);
assert.equal(JSON.stringify(pack),before,'search never edits shared pack records');

const thorn={name:'Thornstinger',wikiTitle:'Thornstinger'},talisman={name:'Talisman of Kejaar Kerrath',wikiTitle:'Talisman of Kejaar Kerrath'},trail={name:'Synthetic Trail Boots',wikiTitle:'Synthetic Trail Boots'};
const matchPack={meta:{wikiEntitiesComplete:true},items:[thorn,talisman,trail,ring]};
for(const name of ['Thornstinger +5','THORNSTINGER +5 +5','thornstinger']){const result=resolveCharacterCatalog(matchPack,name);assert.equal(result.status,'exact');assert.equal(result.item,thorn);assert.equal(result.candidates[0].distance,0);}
for(const [name,expected,reason]of [['Thomstinger +5',thorn,'ocr-glyph'],['Talisman of Kejaar Kemrath +5',talisman,'one-edit'],['Synthetic Tral Boots +2',trail,'one-edit'],['Synthetic Trail Bootss',trail,'one-edit']]){
    const result=resolveCharacterCatalog(matchPack,name);assert.equal(result.status,'fuzzy',name);assert.equal(result.item,expected);assert.equal(result.autoResolved,true);assert.equal(result.candidates[0].reason,reason);assert.equal(result.candidates[0].distance,1);
}
assert.equal(resolveCharacterCatalog(matchPack,'Talisman').status,'unmatched','A fragment does not resolve a full catalog identity');
assert.equal(resolveCharacterCatalog(matchPack,'Thamstonger').status,'unmatched','Two edits are outside the automatic match bound');
assert.equal(resolveCharacterCatalog({items:[{name:'Ring'}]},'Rlng').status,'unmatched','Short OCR names require exact identity');
const tied=resolveCharacterCatalog({items:[{name:'Synthetic Trail Boots'},{name:'Synthetic Trill Boots'}]},'Synthetic Trall Boots');
assert.equal(tied.status,'ambiguous');assert.equal(tied.item,null);assert.equal(tied.autoResolved,false);assert.equal(tied.total,2);
assert.equal(resolveCharacterCatalog({items:[{name:'Synthetic Trall Boots'},...tied.candidates.map(candidate=>candidate.item)]},'Synthetic Trall Boots').status,'exact','An exact identity wins over all fuzzy proposals');
const sameName=resolveCharacterCatalog({items:[{name:'Synthetic Shared Ring',wikiTitle:'Page:First Ring'},{name:'Synthetic Shared Ring',wikiTitle:'Page:Second Ring'}]},'Synthetic Shared Ring');
assert.equal(sameName.status,'ambiguous','Two distinct catalog pages with the same display name require a choice');
const duplicateTitle=resolveCharacterCatalog({items:[thorn,{...thorn}]},'Thornstinger');assert.equal(duplicateTitle.total,1,'Repeated copies of one catalog page do not create false ambiguity');
assert.equal(resolveCharacterCatalog({items:[]},'Thornstinger').incomplete,true);assert.equal(resolveCharacterCatalog(null,'Thornstinger').status,'unmatched');
const limited=resolveCharacterCatalog({items:Array.from({length:20},(_,index)=>({name:'Synthetic Shared Ring',wikiTitle:`Page:${index}`}))},'Synthetic Shared Ring',{limit:100});assert.equal(limited.candidates.length,CHARACTER_CATALOG_LIMITS.matches);assert.equal(limited.total,20);assert.equal(limited.item,null,'Truncated suggestions cannot hide an ambiguity');
assert.equal(resolveCharacterCatalog(pack,'Ring of the Ember Guardian').item,ring,'Wiki-title aliases remain exact identities');
const replaced={meta:{version:1},items:[{name:'Synthetic Cached Ring'}]};assert.equal(resolveCharacterCatalog(replaced,'Synthetic Cached Ring').status,'exact');replaced.items[0]={name:'Synthetic Changed Ring'};replaced.meta.version=2;assert.equal(resolveCharacterCatalog(replaced,'Synthetic Changed Ring').status,'exact','An explicit catalog version replacement rebuilds the bounded name index');

const preview=characterCatalogPreview(ring,{tier:3,fraction:2}),rows=Object.fromEntries(preview.rows.map(row=>[row.key,row]));
assert.equal(rows.HP.value,133);assert.equal(rows.STR.value,5);assert.equal(rows.DEX.value,0);assert.equal(rows.DMG.value,17);assert.equal(rows.WT.value,1.7);
for(const key of ['HP','STR','DEX','DMG','WT'])assert.equal(rows[key].modified,true,key);
for(const key of ['ATK','DELAY']){assert.equal(rows[key].value,ring.stats[key]);assert.equal(rows[key].modified,false,key);}
assert.equal(rows.SV_CORRUPTION.base,9);assert.equal(rows.SV_CORRUPTION.value,null);assert.equal(rows.SV_CORRUPTION.unsupported,true);assert.equal(rows.SV_CORRUPTION.modified,false);
assert.equal(characterCatalogPreview(ring,{tier:0}).rows.find(row=>row.key==='SV_CORRUPTION').value,9,'known base Void resist remains usable at tier zero');
assert.throws(()=>characterCatalogCard(ring,{tier:3,fraction:8}),/Choose tier/);assert.throws(()=>characterCatalogCard(ring,{tier:11}),/Choose tier/);assert.throws(()=>characterCatalogCard(ring,{tier:3,fraction:.5}),/Choose tier/);
assert.throws(()=>characterCatalogCard(ring,{tier:3,fraction:null}),/Choose tier/);assert.throws(()=>characterCatalogCard(ring,{tier:3,fraction:''}),/Choose tier/);
assert.throws(()=>characterCatalogCard(ring,{tier:10,fraction:1}),/maximum/);assert.throws(()=>characterCatalogCard(ring,{tier:10,fraction:1023}),/maximum/);assert.equal(characterCatalogCard(ring,{tier:10,fraction:0}).fraction,0);assert.equal(characterCatalogCard(ring,{tier:9,fraction:511}).fraction,511);
assert.throws(()=>characterCatalogCard(null),/Choose a cached item/);
const card=characterCatalogCard(ring,{tier:3,fraction:2,icon:'https://example.invalid/private.png'});
assert.deepEqual(card.baseStats,ring.stats);assert.deepEqual(card.observedStats,{});assert.equal(card.observedStatsComplete,false);assert.equal(card.wikiTitle,ring.wikiTitle);assert.equal(card.wikiMatch,'confirmed');assert.equal(card.iconId,'Exact_Icon_007');assert.equal(card.icon,'');assert.equal(card.level,21);assert.deepEqual(card.slots,['FINGER']);assert.equal(card.augmentStatus,'unknown');assert.deepEqual(card.augments,[]);
assert.equal(characterCatalogCard({...ring,augmentStatus:'none'}).augmentStatus,'none','only explicit catalog state establishes no augments');
assert.equal(characterCatalogCard({name:'Empty metadata',stats:{}}).baseStatsComplete,false);
assert.equal(characterCatalogCard({...ring,statsComplete:false}).baseStatsComplete,false);

const store=new Map(),storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},model=createCharacterModel({storage});
const first=model.intake({item:card}),second=model.intake({item:card});assert.equal(first.ok,true);assert.equal(second.ok,true);assert.notEqual(first.candidate.id,second.candidate.id,'every Add creates a distinct physical copy');
assert.equal(first.deduplicated,false);assert.equal(second.deduplicated,false);assert.equal(first.candidate.fraction,2);assert.deepEqual(first.candidate.observedStats,{});assert.deepEqual(first.candidate.baseStats,ring.stats);
assert.equal(characterItemStats(first.candidate).stats.HP,133,'catalog stats scale exactly once');assert.equal(characterItemStats(first.candidate).stats.SV_CORRUPTION,null);
for(const [candidate,slot]of [[first.candidate,'finger1'],[second.candidate,'finger2']]){model.updateCandidate(candidate.id,{augmentStatus:'none'});assert.equal(model.assign(candidate.id,slot).ok,true);}
model.setStatSnapshot('base',{stats:{HP_MAXIMUM:450},confirmed:true});model.setStatSnapshot('equipped',{stats:{HP_MAXIMUM:812},confirmed:true});
const restored=createCharacterModel({storage}),total=restored.totals();assert.equal(total.derived.HP.value,266);assert.equal(total.derived.HP.complete,true);assert.equal(total.derived.SV_CORRUPTION.complete,false);assert.deepEqual(restored.snapshot().candidates[0].unscaledStatKeys,['SV_CORRUPTION']);assert.equal(total.base.stats.HP_MAXIMUM,450);assert.equal(total.equipped.stats.HP_MAXIMUM,812);
const summary=characterShareSummary(restored.snapshot());assert.equal(summary.equipment.find(slot=>slot.slot==='finger1').item.stats.SV_CORRUPTION,null);assert.equal(summary.equipment.find(slot=>slot.slot==='finger1').item.baseStats.SV_CORRUPTION,9);
const observed={...first.candidate,observedStats:{SV_CORRUPTION:19,HP:150},observedStatsComplete:true,augmentStatus:'included'};assert.equal(characterItemStats(observed).stats.SV_CORRUPTION,19,'actual observed stats override unsupported catalog adjustment without scaling');
assert.equal(JSON.stringify(pack),before,'preview and Add never edit the catalog');
console.log('Character catalog: flexible local search, bounded/incomplete results, independent tier/progress preview, modified stats, exact identity and distinct cards passed.');
console.log('Catalog provenance: base values retained; no fabricated examine stats/augment state; unsupported Void adjustment stays unknown through persistence, sums and sharing.');
