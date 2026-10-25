import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {lootSetCoverage} from '../app/loot-set-coverage.js';
import {contributionNpcLootSetCoverage,contributionZoneLootSetCoverage,patchContributionRelationship,patchContributionPrimary} from '../app/contribution-model.js';
const require=createRequire(import.meta.url),{WikiClient}=require('../desktop/wiki-client.cjs');
const item='Synthetic Set Bracer',set='Synthetic Armor Set',npc='Synthetic Set Keeper',zone='Synthetic Keep';
const pack={meta:{sample:false,wikiEntitiesComplete:true,lootSetsVersion:1,lootSourceCountsVersion:1},wikiEntities:{items:[item],npcs:[npc],titles:[item,set,npc,zone]},items:[{name:item,wikiTitle:item,aliases:['Synthetic Bracer Alias']}],npcs:[{name:npc,wikiTitle:npc,zone}],zones:[{name:zone}],lootSets:{[set]:{items:[item,'Synthetic Set Boots'],complete:true}},lootSourceCounts:{[item]:{lootSourceCount:1,lootSourceCountComplete:true,lootSourceNpcs:[npc]}}};
const card=loot=>'{{Namedmobpage|name='+npc+'|zone=[['+zone+']]|known_loot='+loot+'|common_loot=?}}';
const source=card('<ul><li>[['+set+']] (rare)</li></ul>');
assert.equal(lootSetCoverage(pack,'Synthetic Bracer Alias',[set])?.setTitle,set,'Canonical member aliases use explicit membership');
assert.equal(contributionNpcLootSetCoverage(source,item,'normal',{pack})?.kind,'unique');
const patch=patchContributionRelationship(source,{role:'npc-loot',itemTitle:item,npcTitle:npc,zoneTitle:zone,instance:'normal',lootKind:'common'},{pack});
assert.equal(patch.text,source,'An authored set is preserved byte-for-byte even when its member global classification differs');assert.equal(patch.changed,false);assert.match(patch.warnings[0],/covered by.*set/);
for(const loot of ['* [['+set+']]', '<ul><li>{{:'+set+'}}</li></ul>', '[['+set+']]'])assert(contributionNpcLootSetCoverage(card(loot),item,'normal',{pack}));
for(const loot of ['<!-- * [['+set+']] -->','<nowiki>* [['+set+']]</nowiki>','Notes mention [['+set+']]','<ref>* [['+set+']]</ref>','* Other loot with [['+set+']] nearby'])assert.equal(contributionNpcLootSetCoverage(card(loot),item,'normal',{pack}),null,'Only authored loot entries establish coverage');
for(const bad of [{...pack,meta:{...pack.meta,lootSetsVersion:undefined}},{...pack,meta:{...pack.meta,sample:true}},{...pack,lootSets:{[set]:{items:[item],complete:false}}},{...pack,lootSets:{[set]:{items:['Different Bracer'],complete:true}}}])assert.equal(lootSetCoverage(bad,item,[set]),null);
assert.equal(lootSetCoverage(pack,'Synthetic Set Helmet',[set]),null,'A shared prefix never infers membership');
const dual=card('?')+'\n== Raid Instance ==\n'+source;
assert.equal(contributionNpcLootSetCoverage(dual,item,'normal',{pack}),null);assert(contributionNpcLootSetCoverage(dual,item,'raid',{pack}),'Coverage belongs to the selected instance');
const internal=card('?\n=== Raid Instance ===\n* [['+set+']]');assert.equal(contributionNpcLootSetCoverage(internal,item,'normal',{pack}),null);assert(contributionNpcLootSetCoverage(internal,item,'raid',{pack}),'Internal loot-field headings also preserve instance boundaries');
const aliasPack=structuredClone(pack);aliasPack.wikiEntities.titles=aliasPack.wikiEntities.titles.map(title=>title===set?{name:set,aliases:['Synthetic Set Alias']}:title);aliasPack.items.push({name:set,wikiTitle:set,aliases:['Synthetic Set Alias']});assert(lootSetCoverage(aliasPack,'Synthetic Bracer Alias',['Synthetic Set Alias']));
const malformedPack={...pack,lootSets:{[set]:{complete:true,items:[item,'Template:Fake Member']}}};assert.equal(lootSetCoverage(malformedPack,item,[set]),null,'Malformed membership cannot authorize a partial set claim');
const zoneTable=loot=>'{| class="zoneTopTable"\n! Unique Items\n| '+loot+'\n|}\n';
const listedZone=zoneTable('[['+set+']]'),dualZone=zoneTable('?')+'\n== Raid Instance ==\n'+listedZone;
assert(contributionZoneLootSetCoverage(listedZone,item,'normal',{pack}));assert.equal(contributionZoneLootSetCoverage(dualZone,item,'normal',{pack}),null);assert(contributionZoneLootSetCoverage(dualZone,item,'raid',{pack}));
assert.equal(contributionZoneLootSetCoverage(zoneTable('?')+'\nNotes mention [['+set+']].',item,'normal',{pack}),null,'Set mentions outside a parsed zone loot cell never suppress additions');
for(const hidden of ['Notes mention [['+set+']].','{{Example|note={{:'+set+'}}}}','{{Example|note=\n* [['+set+']]\n}}']){
 assert.equal(contributionZoneLootSetCoverage(zoneTable(hidden),item,'normal',{pack}),null,'Prose and nested template arguments do not count as authored set rows');
 assert.equal(contributionNpcLootSetCoverage(card(hidden),item,'normal',{pack}),null);
}
assert.equal(patchContributionRelationship(listedZone,{role:'zone-loot',itemTitle:item,instance:'normal'},{pack}).text,listedZone,'An aggregate zone set covers members in the same instance without a fabricated NPC association');
const candidate={kind:'npc',name:npc,title:npc,zone,instance:'normal',intent:'update',reasons:['missing-source'],fields:{knownLoot:{value:[item],confirmed:true}}};
assert.equal(patchContributionPrimary(source,candidate,{pack}).text,source,'Primary NPC updates share the same set coverage rule');

// Native preparation must take the catalog from its own trusted callback. A
// reciprocal item source can still be filled without appending the set member
// to the monster; manually edited wikicode cannot bypass this boundary.
const texts=new Map([[item,'<onlyinclude>{{Itempage|itemname='+item+'|statsblock=AC: 2|dropsfrom=?}}</onlyinclude>'],[npc,source],[zone,'{| class="zoneTopTable"\n! Notable NPCs\n| [['+npc+']]\n|-\n! Unique Items\n| ?\n|}']]);
const client=new WikiClient({getItemCatalog:async()=>pack,fetchImpl:async()=>{throw Error('No network permitted');}});
client.status=async()=>({authenticated:true,user:{id:1,name:'Synthetic Editor'},canEdit:true,canCreate:true});
client.blueprints=async()=>({revision:1,entries:{item:{text:'<onlyinclude>{{Itempage|itemname=|statsblock=|dropsfrom=}}</onlyinclude>'},npc:{text:'{{Namedmobpage|name=|known_loot=|common_loot=}}'}}});
client.findMatches=async({name})=>({matches:[{exact:true,pageId:1,title:name}],redirects:[]});
client.page=async title=>({title,content:texts.get(title)||'',missing:!texts.has(title),revision:1,pageId:[item,npc,zone].indexOf(title)+1,startTimestamp:'2026-10-25T12:00:00Z'});
client.contributionPage=async title=>client.page(title);
client.recoverNpcLoot=async()=>({items:[],complete:true,checkedSources:0,warnings:[],blockers:[]});
client.request=async params=>{assert.equal(params.prop,'info');assert.match(params.titles,/^Template:/);return{query:{pages:[{ns:10,title:params.titles}]}};};
const plan=await client.preparePlan({candidate:{kind:'item',name:item,title:item,intent:'update',reasons:['missing-source'],instance:'normal',fields:{},sources:[{npc,zone,instance:'normal',confirmed:true}]},matchesReviewed:true});
assert.deepEqual(plan.blockers,[]);assert(plan.pages.some(page=>page.title===item&&page.afterText.includes('* [['+npc+']]')),'The missing individual item-page source is still filled');assert(!plan.pages.some(page=>page.title===npc),'The live authored set already covers its member on this monster');
assert(plan.warnings.some(warning=>/already covered by the listed/.test(warning)));
texts.set(zone,listedZone.replace('! Unique Items','! Notable NPCs\n| [['+npc+']]\n|-\n! Unique Items'));pack.lootSourceCounts={};
const sourceOnly=await client.preparePlan({candidate:{kind:'item',name:item,title:item,intent:'update',reasons:['missing-source'],instance:'normal',fields:{},sources:[{npc,zone,instance:'normal',confirmed:true}]},matchesReviewed:true});
assert.deepEqual(sourceOnly.blockers,[],'Covered NPC/zone set entries do not need a new member loot classification');assert.deepEqual(sourceOnly.pages.map(page=>page.title),[item],'Only the missing item-page source is added when both authored sets cover it');
const edited=await client.preparePlan({candidate,matchesReviewed:true,editedText:source.replace('|common_loot=?','<ul><li>{{:'+item+'}}</li></ul>|common_loot=?')});
assert(edited.blockers.some(blocker=>/already covered by the listed/.test(blocker)),'Native manual preparation rejects redundant members');
texts.set(npc,internal);
const raidEdited=await client.preparePlan({candidate:{...candidate,instance:'raid'},matchesReviewed:true,editedText:internal.replace('[['+set+']]','[['+set+']]\n* {{:'+item+'}}')});
assert(raidEdited.blockers.some(blocker=>/already covered by the listed/.test(blocker)),'Native manually edited internal raid entries use the actual entry scope');
console.log('Loot sets: explicit complete membership, aliases, scoped authored entries, protected/prose exclusion, preserved sets and native reciprocal/manual boundaries passed.');
