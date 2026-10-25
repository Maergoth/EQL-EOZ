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
assert.equal(preview.card.fraction,0,'Character catalog ignores obsolete progress options');assert.equal(rows.HP.value,130);assert.equal(rows.STR.value,5);assert.equal(rows.DEX.value,0);assert.equal(rows.DMG.value,16);assert.equal(rows.WT.value,1.7);
for(const key of ['HP','STR','DEX','DMG','WT'])assert.equal(rows[key].modified,true,key);
for(const key of ['ATK','DELAY']){assert.equal(rows[key].value,ring.stats[key]);assert.equal(rows[key].modified,false,key);}
assert.equal(rows.SV_CORRUPTION.base,9);assert.equal(rows.SV_CORRUPTION.value,9);assert.equal(rows.SV_CORRUPTION.unsupported,false);assert.equal(rows.SV_CORRUPTION.modified,false,'Explicit base Void remains authoritative under shared wiki rules');
assert.equal(characterCatalogPreview(ring,{tier:0}).rows.find(row=>row.key==='SV_CORRUPTION').value,9,'known base Void resist remains usable at tier zero');
for(const tier of [-1,11,null,3.5])assert.throws(()=>characterCatalogCard(ring,{tier}),/Choose tier/);
for(const fraction of [8,.5,null,'',1023])assert.equal(characterCatalogCard(ring,{tier:3,fraction}).fraction,0,'Removed progress input is not collected or solicited');
assert.equal(characterCatalogCard(ring,{tier:10,fraction:1023}).fraction,0);assert.equal(characterCatalogCard(ring,{tier:9,fraction:511}).fraction,0);
assert.throws(()=>characterCatalogCard(null),/Choose a cached item/);
const card=characterCatalogCard(ring,{tier:3,fraction:2,icon:'https://example.invalid/private.png'});
assert.deepEqual(card.baseStats,ring.stats);assert.deepEqual(card.observedStats,{});assert.equal(card.observedStatsComplete,false);assert.equal(card.wikiTitle,ring.wikiTitle);assert.equal(card.wikiMatch,'confirmed');assert.equal(card.iconId,'Exact_Icon_007');assert.equal(card.icon,'');assert.equal(card.level,21);assert.deepEqual(card.slots,['FINGER']);assert.equal(card.augmentStatus,'unknown');assert.deepEqual(card.augments,[]);
assert.equal(characterCatalogCard({...ring,augmentStatus:'none'}).augmentStatus,'none','only explicit catalog state establishes no augments');
assert.equal(characterCatalogCard({name:'Empty metadata',stats:{}}).baseStatsComplete,false);
assert.equal(characterCatalogCard({...ring,statsComplete:false}).baseStatsComplete,false);

const store=new Map(),storage={getItem:key=>store.get(key),setItem:(key,value)=>store.set(key,value)},model=createCharacterModel({storage});
const first=model.intake({item:card}),second=model.intake({item:card});assert.equal(first.ok,true);assert.equal(second.ok,true);assert.notEqual(first.candidate.id,second.candidate.id,'every Add creates a distinct physical copy');
assert.equal(first.deduplicated,false);assert.equal(second.deduplicated,false);assert.equal(first.candidate.fraction,0);assert.deepEqual(first.candidate.observedStats,{});assert.deepEqual(first.candidate.baseStats,ring.stats);assert(!/progress/i.test(card.notes));
assert.equal(characterItemStats(first.candidate).stats.HP,130,'catalog stats scale exactly once at the selected whole tier');assert.equal(characterItemStats(first.candidate).stats.SV_CORRUPTION,9);
for(const [candidate,slot]of [[first.candidate,'finger1'],[second.candidate,'finger2']]){model.updateCandidate(candidate.id,{augmentStatus:'none'});assert.equal(model.assign(candidate.id,slot).ok,true);}
model.setStatSnapshot('base',{stats:{HP_MAXIMUM:450},confirmed:true});model.setStatSnapshot('equipped',{stats:{HP_MAXIMUM:812},confirmed:true});
assert.equal(model.totals().computed.HP_MAXIMUM,undefined,'Legacy snapshots and catalog gear do not create a current maximum-resource total');
model.setStatSnapshot('current',{stats:{HP_CURRENT:53,HP_MAXIMUM:997,SV_CORRUPTION:null},confirmed:true});
const restored=createCharacterModel({storage}),total=restored.totals();assert.deepEqual(total.derived,{});assert.equal(total.current.stats.HP_MAXIMUM,997);assert.equal(total.computed.HP_MAXIMUM.value,997);assert.equal(total.computed.SV_CORRUPTION.value,null);assert.deepEqual(restored.snapshot().candidates[0].unscaledStatKeys,[]);assert.equal(restored.snapshot().statSnapshots.base.stats.HP_MAXIMUM,450);assert.equal(restored.snapshot().statSnapshots.equipped.stats.HP_MAXIMUM,812);
const observedTotals=structuredClone(total.computed);
assert.equal(restored.setTierPreview(first.candidate.id,{tier:6}).ok,true);assert.equal(characterItemStats(restored.snapshot().candidates.find(candidate=>candidate.id===first.candidate.id)).stats.HP,160,'Per-item wiki tier preview remains available');
assert.equal(restored.setAugmentSlots(first.candidate.id,1).ok,true);assert.equal(restored.setAugment(first.candidate.id,0,characterCatalogCard(weapon,{tier:2})).ok,true);assert.equal(characterItemStats(restored.snapshot().candidates.find(candidate=>candidate.id===first.candidate.id)).stats.HP,184,'The item tooltip can preview its chosen augment independently');
assert.deepEqual(restored.totals().computed,observedTotals,'Tier and augment previews never rescale or add to observed character totals');
restored.removeAugment(first.candidate.id,0);restored.unassign('finger1');assert.deepEqual(restored.totals().computed,observedTotals,'Removing a modeled augment or equipped item never subtracts from observed totals');assert(restored.assign(first.candidate.id,'finger1').ok);
assert.deepEqual(createCharacterModel({storage}).totals().computed,observedTotals,'Observed totals retain their exact values through persistence and layout edits');
const summary=characterShareSummary(restored.snapshot());assert.equal(summary.equipment.find(slot=>slot.slot==='finger1').item.stats.SV_CORRUPTION,9);assert.equal(summary.equipment.find(slot=>slot.slot==='finger1').item.baseStats.SV_CORRUPTION,9);
const observed={...first.candidate,observedStats:{SV_CORRUPTION:19,HP:150},observedStatsComplete:true,augmentStatus:'included'};assert.equal(characterItemStats(observed).stats.SV_CORRUPTION,19,'actual observed stats override unsupported catalog adjustment without scaling');
assert.equal(JSON.stringify(pack),before,'preview and Add never edit the catalog');
console.log('Character catalog: flexible local search, bounded/incomplete results, whole-tier preview, modified stats, exact identity and distinct cards passed.');
console.log('Catalog provenance: per-item values stay separate; observed character totals survive tier, augment and equipment edits without arithmetic; explicit Void values stay authoritative.');

const {resolveInventoryCatalog}=await import('../app/character-catalog.js');
const presenceOnly={meta:{wikiEntitiesComplete:true},items:[],wikiEntities:{items:['Synthetic Known Crown'],titles:[{title:'Synthetic Known Rune (Exaltation)'}]}};
assert.equal(resolveInventoryCatalog(presenceOnly,'Synthetic Known Crown +4').item.wikiTitle,'Synthetic Known Crown');
assert.equal(resolveInventoryCatalog(presenceOnly,'Synthetic Known Rune (Exaltation)').item.wikiTitle,'Synthetic Known Rune (Exaltation)');
assert.deepEqual(resolveInventoryCatalog(presenceOnly,'Synthetic Krown'),{},'Presence lookup never autochooses fuzzy name');
assert.deepEqual(resolveInventoryCatalog(presenceOnly,'Unknown'),{});

const rogue={name:'Synthetic Rank Dagger',slots:['PRIMARY','SECONDARY'],classes:['ROG'],stats:{HP:100,STR:5,DEX:5,DMG:12},displayLines:['Skill: Piercing Atk Delay: 19']};
const rogueCard=characterCatalogCard(rogue,{tier:5}),roguePreview=characterCatalogPreview(rogue,{tier:5});
assert.equal(characterItemStats(rogueCard).stats.BACKSTAB_DMG,15);assert.equal(characterItemStats(rogueCard).stats.ACCURACY,12.5);assert.equal(characterItemStats(rogueCard).stats.SV_CORRUPTION,5);
for(const key of ['BACKSTAB_DMG','ACCURACY','SV_CORRUPTION'])assert.equal(roguePreview.rows.find(row=>row.key===key)?.value,characterItemStats(rogueCard).stats[key],`${key}: Character search and equipped previews share whole-card context`);
const captured={...rogueCard,observedStats:{DMG:18,BACKSTAB_DMG:15,ACCURACY:12.9,SV_CORRUPTION:5,HP:777},observedStatsComplete:true,augmentStatus:'included'};
const recorded={...captured.observedStats},totalsBefore=structuredClone(restored.totals().computed);
assert.equal(characterItemStats({...rogueCard,tier:8}).stats.HP,180,'Character previews use the fixed bundled formula at another tier');
assert.deepEqual(characterItemStats({...captured,tier:8}).stats,recorded,'Observed examine values remain immutable when selecting another tier');
assert.deepEqual(restored.totals().computed,totalsBefore,'Item formula previews never alter recorded character-sheet totals');
