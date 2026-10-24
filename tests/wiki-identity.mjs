import assert from 'node:assert/strict';
import {createWikiResolver,normalizeWikiIdentity,itemBaseIdentity,wikiIdentityKey,wikiPageTitleKey,itemExaltationBaseIdentity,itemExportBaseIdentity} from '../app/wiki-identity.js';
import {isGeneratedPetName,classifyNpcEvidence} from '../app/generated-pets.js';
const pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Copperleaf Cloak'],npcs:["Keeper O'Wood"],titles:['Copperleaf Cloak',"Keeper O'Wood",'Plain Page']},items:[{name:'Copperleaf Cloak',wikiTitle:'Copperleaf Cloak',aliases:['Copperleaf Cape'],revisionId:12}],npcs:[{name:"Keeper O'Wood",wikiTitle:"Keeper O'Wood"}],zones:[{name:'Forest Glade',wikiTitle:'The Forest Glade'}]};
const resolver=createWikiResolver(pack);
for(const name of ['COPPERLEAF_CLOAK +5','Copperleaf Cloak+0','Copperleaf Cape +10'])assert.equal(resolver.resolve('item',name).canonicalTitle,'Copperleaf Cloak');
assert.equal(resolver.resolve('monster','Keeper O`Wood').canonicalTitle,"Keeper O'Wood");
assert.equal(resolver.resolve('npc','the Keeper O`Wood').membership,'missing');
assert.equal(resolver.resolve('zone','FOREST_GLADE').canonicalTitle,'The Forest Glade');
assert.equal(resolver.resolve('item','Plain Page').membership,'present');
assert.equal(resolver.resolve('item','Copperleaf Cloak +11').membership,'missing');
assert.equal(normalizeWikiIdentity('Ｆｏｏ_&amp;_B&#39;ar'),'foo & b\'ar');
assert.deepEqual(itemBaseIdentity('A Relic (Exaltation)+4'),{name:'A Relic (Exaltation)',tier:4});
assert.deepEqual(itemBaseIdentity('A Relic+4 (Exaltation)'),{name:'A Relic (Exaltation)',tier:4});
assert.notEqual(wikiIdentityKey('item','A Relic (Exaltation) +4'),wikiIdentityKey('item','A Relic +4'));
for(const altered of [{...pack,meta:{}},{...pack,meta:{wikiEntitiesComplete:true,sample:true}},{...pack,wikiEntities:{items:[],npcs:[]}}]){const partial=createWikiResolver(altered);assert.equal(partial.resolve('item','Missing Relic').membership,'unknown');assert.equal(partial.resolve('item','Copperleaf Cloak').membership,'present');}
const collision=createWikiResolver({...pack,items:[{name:'Shared alias',wikiTitle:'First Article'},{name:'Shared alias',wikiTitle:'Second Article'}]});assert.equal(collision.resolve('item','SHARED ALIAS +5').membership,'ambiguous');assert.equal(collision.has('item','Shared alias'),false);
assert.equal(createWikiResolver({...pack,npcs:[{name:'Foo',wikiTitle:'Foo'},{name:'foo',wikiTitle:'foo'}]}).resolve('npc','FOO').membership,'present','MediaWiki first-letter casing denotes the same title');
assert.equal(createWikiResolver({...pack,npcs:[{name:'A Keeper',wikiTitle:'A Keeper'},{name:'A keeper',wikiTitle:'A keeper'}]}).resolve('npc','A KEEPER').membership,'ambiguous','Distinct case-sensitive canonical pages still need a choice');
assert.equal(wikiPageTitleKey('a_Keeper'),'A Keeper');assert.notEqual(wikiPageTitleKey('A Keeper'),wikiPageTitleKey('A keeper'));
assert.notEqual(wikiPageTitleKey('Keeper O`Wood'),wikiPageTitleKey("Keeper O'Wood"),'Canonical article keys preserve distinct punctuation; only lookup aliases forgive glyphs');
const flatCase=createWikiResolver({meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:['A Loathing Lich','A LOATHING LICH'],titles:['A loathing lich']},npcs:[{name:'A Loathing Lich'},{name:'a loathing lich'}]});
for(const name of ['A loathing lich','A Loathing Lich','a LOATHING lich']){const found=flatCase.resolve('npc',name);assert.equal(found.membership,'present');assert.equal(found.canonicalTitle,'A loathing lich');assert.deepEqual(found.candidates,['A loathing lich']);}
const redirectCase=createWikiResolver({...pack,wikiEntities:{...pack.wikiEntities,titles:[...pack.wikiEntities.titles,'A keeper']},npcs:[{name:'A Keeper',wikiTitle:'A Keeper'}]});
assert.equal(redirectCase.resolve('npc','a keeper').canonicalTitle,'A Keeper','Flat redirects/membership variants cannot invent a competing canonical page');
assert.equal(itemExaltationBaseIdentity('A Relic+4 (Exaltation)'),'A Relic');assert.equal(itemExportBaseIdentity('Backpack*'),'Backpack');
const socket=createWikiResolver({...pack,items:[...pack.items,{name:'Base Blade',wikiTitle:'Base Blade'},{name:'Bag',wikiTitle:'Bag'}]});
for(const name of ['Base Blade (Exaltation)','Base Blade (Exaltation) +4','Base Blade+4 (Exaltation)']){const found=socket.resolve('item',name);assert.equal(found.membership,'present');assert.equal(found.canonicalTitle,'Base Blade');assert.equal(found.exaltationAlias,true);}
assert.equal(socket.resolve('item','Base Blade (Exaltation)',{itemAliases:false}).membership,'missing');
assert.equal(socket.resolve('item','Bag*').canonicalTitle,'Bag');assert.equal(socket.resolve('item','Bag*').exportNameAlias,true);
assert.equal(socket.resolve('item','Unknown Blade (Exaltation)').membership,'missing');assert.equal(socket.resolve('item','Unknown Blade (Exaltation)').name,'Unknown Blade (Exaltation)','Unknown decorated identities keep their evidence');
assert.equal(socket.resolve('item','Unknown*').name,'Unknown*');assert.equal(socket.resolve('item','Bag**').membership,'missing','Only one exact export decoration is an alias');
const distinctSocket=createWikiResolver({...pack,items:[{name:'Base Blade',wikiTitle:'Base Blade'},{name:'Base Blade (Exaltation)',wikiTitle:'Base Blade (Exaltation)'}]});
assert.equal(distinctSocket.resolve('item','Base Blade (Exaltation)').canonicalTitle,'Base Blade (Exaltation)','A real separate suffix article outranks the base alias');

for(const name of ['Gtik','Jabaner','Lasn','Vekab','Zobobtik'])assert(isGeneratedPetName(name),name);
for(const name of ['Laser','Gektik','Ger','Gn','Jabektik','a Gtik','Gtik Guardian','Jabannn','Bob','X','Gtik2'])assert.equal(isGeneratedPetName(name),false,name);
assert.equal(classifyNpcEvidence('Gtik',{membership:'missing'}).eligible,false);
assert.equal(classifyNpcEvidence('Gtik',{membership:'present'}).eligible,true,'An actual canonical NPC overrides the name heuristic');
assert.equal(classifyNpcEvidence('Gtik',{membership:'ambiguous'}).eligible,true,'Ambiguity needs review rather than pet-based deletion');
console.log('Typed wiki identity: canonical aliases/tier/Unicode, grammatical articles, partial presence, collision refusal and pinned generated-pet exclusions passed.');
