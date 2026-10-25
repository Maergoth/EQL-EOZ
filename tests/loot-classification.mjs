import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {classifyCachedLoot} from '../app/loot-classification.js';
import {buildContributionDraft,extractContributionBlueprints,patchContributionPrimary,patchContributionRelationship,contributionZoneLootEntries} from '../app/contribution-model.js';
import {contributionLootMarkup} from '../app/contribution-editor.js';
import {assertGlobalLootCountContract} from '../scripts/global-loot-count-contract.mjs';
const require=createRequire(import.meta.url),{WikiClient}=require('../desktop/wiki-client.cjs');
const npcNames=Array.from({length:6},(_,index)=>'Synthetic Guardian '+index);
function pack(count,{complete=true,modern=true}={}){
    const names=npcNames.slice(0,count),item={name:'Synthetic Shared Powder',wikiTitle:'Synthetic Shared Powder',dropSources:names.flatMap(name=>[{name,zone:'First Vale',instance:'normal'},{name,zone:'Second Vale',instance:'raid'}])};
    if(modern)Object.assign(item,{lootSourceCount:names.length,lootSourceCountComplete:complete,lootSourceNpcs:names});
    return {meta:{version:'synthetic-count-v1',generatedAt:'2026-10-25T12:00:00Z',sample:false,wikiEntitiesComplete:true,...(modern?{lootSourceCountsVersion:1}:{})},wikiEntities:{items:[item.name,'Powder Alias'],npcs:[...npcNames,'Guardian Alias'],titles:[item.name,'Powder Alias',...npcNames,'Guardian Alias']},items:[{...item,aliases:['Powder Alias']}],npcs:npcNames.map((name,index)=>({name,wikiTitle:name,aliases:index===0?['Guardian Alias']:[]}))};
}
let proof=classifyCachedLoot(pack(5),'Synthetic Shared Powder');
assert.deepEqual(contributionZoneLootEntries('<nowiki>{| class="zoneTopTable"\n! Unique Items\n| {{:Ignored Example}}\n|}</nowiki>\n{| class="zoneTopTable"\n! Unique Items\n| {{:Synthetic Unique}}\n|-\n! Common Loot\n| [[Synthetic Common]]\n|}\n== Raid Instance ==\n{| class="zoneTopTable"\n! Common Loot\n| {{:Synthetic Raid Common}}\n|}'),[{itemTitle:'Synthetic Unique',kind:'unique',card:'zone:0',sourceKind:'zone'},{itemTitle:'Synthetic Common',kind:'common',card:'zone:0',sourceKind:'zone'},{itemTitle:'Synthetic Raid Common',kind:'common',card:'zone:1',sourceKind:'zone'}],'Only active zone summary loot cells classify items, including separate raid tables');
assert.equal(proof.kind,'unique');assert.equal(proof.count,5);assert.equal(proof.complete,true);
proof=classifyCachedLoot(pack(5),'Powder Alias',['Synthetic Guardian 5']);
assert.equal(proof.kind,'common');assert.equal(proof.count,6,'The new sixth source counts before choosing the destination section');
proof=classifyCachedLoot(pack(5),'Synthetic Shared Powder',['Guardian Alias','Synthetic_Guardian_0']);
assert.equal(proof.kind,'unique');assert.equal(proof.count,5,'Aliases, zones and normal/raid variants do not inflate distinct monster count');
proof=classifyCachedLoot(pack(6),'Synthetic Shared Powder');assert.equal(proof.kind,'common');
proof=classifyCachedLoot(pack(5,{complete:false}),'Synthetic Shared Powder');assert.equal(proof.kind,null);assert.match(proof.reason,/Sync with Wiki/);
proof=classifyCachedLoot(pack(6,{complete:false}),'Synthetic Shared Powder');assert.equal(proof.kind,'common','Six verified canonical sources establish a Common lower bound');
proof=classifyCachedLoot(pack(5,{modern:false}),'Synthetic Shared Powder');assert.equal(proof.kind,null);assert.equal(proof.count,5,'An older dataset proves positive sources but cannot establish complete absence');
proof=classifyCachedLoot(pack(6,{modern:false}),'Synthetic Shared Powder');assert.equal(proof.kind,'common');assert.equal(proof.count,6,'Older rich canonical NPC records still support a Common lower bound');
const inconsistent=pack(5);inconsistent.items[0].lootSourceCount=4;assert.equal(classifyCachedLoot(inconsistent,'Synthetic Shared Powder').kind,null);
const repeated=pack(5);repeated.items[0].lootSourceNpcs.push('Guardian Alias');repeated.items[0].lootSourceCount=6;assert.equal(classifyCachedLoot(repeated,'Synthetic Shared Powder').kind,null,'Duplicate aliases cannot turn five monsters into six');
const sample=pack(6);sample.meta.sample=true;assert.equal(classifyCachedLoot(sample,'Synthetic Shared Powder').kind,null,'Sample records are not wiki source evidence');
assert.equal(classifyCachedLoot({},'Synthetic Shared Powder').kind,null);
assert.equal(classifyCachedLoot(pack(5),'Missing Item').kind,null,'A missing item has no proven complete global count');
const statless=pack(6);statless.items=[];statless.lootSourceCounts={'Synthetic Shared Powder':{lootSourceCount:6,lootSourceCountComplete:true,lootSourceNpcs:npcNames}};assert.equal(classifyCachedLoot(statless,'Synthetic Shared Powder').kind,'common','Statless items retain global counts without a browse-item record');
statless.lootSourceCounts['Missing Item']={lootSourceCount:2,lootSourceCountComplete:true,lootSourceNpcs:npcNames.slice(0,2)};assert.equal(classifyCachedLoot(statless,'Missing Item').kind,'unique','An explicit global index entry can cover an item known only from authored NPC loot');
const gated=pack(5);gated.lootSourceCounts={'Synthetic Shared Powder':{lootSourceCount:5,lootSourceCountComplete:true,lootSourceNpcs:npcNames.slice(0,5)},'Statless Shared Material':{lootSourceCount:6,lootSourceCountComplete:false,lootSourceNpcs:npcNames}};assert.deepEqual(assertGlobalLootCountContract(gated),{items:2,richItems:1,complete:1,incomplete:1,commonLowerBounds:1});
for(const mutate of [
    value=>delete value.meta.lootSourceCountsVersion,
    value=>{value.lootSourceCounts={};},
    value=>{value.lootSourceCounts['Synthetic Shared Powder'].lootSourceCount=4;},
    value=>{value.lootSourceCounts['Synthetic Shared Powder'].lootSourceCountComplete='true';},
    value=>{value.lootSourceCounts['Synthetic Shared Powder'].lootSourceNpcs[4]=npcNames[0];},
    value=>{value.items[0].lootSourceCountComplete=false;},
    value=>{delete value.items[0].lootSourceNpcs;},
    value=>{value.lootSourceCounts['File:Not a public item']=value.lootSourceCounts['Statless Shared Material'];}
]){const invalid=structuredClone(gated);mutate(invalid);assert.throws(()=>assertGlobalLootCountContract(invalid),/global loot|Global loot|Production bootstrap|rich item/,'The release catalog gate rejects stale or inconsistent producer metadata');}
const pet=pack(5);pet.items[0].lootSourceNpcs.push('Synthetic Guardian pet');pet.items[0].lootSourceCount=6;proof=classifyCachedLoot(pet,'Synthetic Shared Powder');assert.equal(proof.kind,null);assert.equal(proof.count,5,'Pets cannot increase the source count');
for(const label of ['Ground Spawn','Ground Spawns',' ground__SPAWNS ']){
    const ground=pack(5);ground.items[0].lootSourceNpcs.push(label);ground.items[0].lootSourceCount=6;
    proof=classifyCachedLoot(ground,'Synthetic Shared Powder');
    assert.equal(proof.count,5);assert.equal(proof.kind,null,'Ground-spawn labels cannot turn five real monsters into Common loot');assert.equal(proof.complete,false,'A legacy count containing a ground-spawn label cannot prove Unique either');
}
const groundAlias=pack(5);groundAlias.npcs.push({name:'Ground Spawns',wikiTitle:'Ground Spawns',aliases:['Synthetic Ground Alias']});groundAlias.items[0].lootSourceNpcs.push('Synthetic Ground Alias');groundAlias.items[0].lootSourceCount=6;
proof=classifyCachedLoot(groundAlias,'Synthetic Shared Powder');assert.equal(proof.count,5);assert.equal(proof.kind,null);assert.equal(proof.complete,false,'Aliases resolving to ground-spawn labels are excluded');
proof=classifyCachedLoot(pack(5),'Synthetic Shared Powder',['Ground Spawn']);assert.equal(proof.count,5);assert.equal(proof.kind,null,'A proposed ground-spawn label cannot become a sixth monster');
const keeper=pack(5);keeper.items[0].lootSourceNpcs.push('Ground Spawn Keeper');keeper.items[0].lootSourceCount=6;
proof=classifyCachedLoot(keeper,'Synthetic Shared Powder');assert.equal(proof.count,6);assert.equal(proof.kind,'common');assert.equal(proof.complete,true,'Other monster names remain literal');
proof=classifyCachedLoot(pack(5),'Synthetic Shared Powder');assert.equal(proof.kind,'unique');assert.equal(proof.complete,true,'Modern clean five-monster metadata retains complete Unique proof');

let networkCalls=0;
const client=new WikiClient({getItemCatalog:async()=>pack(5),fetchImpl:async()=>{networkCalls++;throw Error('No classification network access permitted');}});
proof=await client.classifyGlobalLoot({title:'Synthetic Shared Powder',pageId:9,revision:30},[{title:'Synthetic Guardian 5',pageId:6}]);
assert.equal(proof.kind,'common');assert.equal(proof.count,6);assert.equal(proof.source,'cached-wiki-dataset');assert.equal(networkCalls,0,'Native classification makes no live wiki request');
const noCatalog=new WikiClient({fetchImpl:async()=>{networkCalls++;throw Error('No network permitted');}});assert.equal((await noCatalog.classifyGlobalLoot({title:'Synthetic Shared Powder',pageId:9,revision:30})).kind,null);assert.equal(networkCalls,0);

const blueprints=extractContributionBlueprints('=== NPC Page Blueprint ===\n<pre>{{Namedmobpage|name=}}</pre>');
const unclassified={kind:'npc',name:'Synthetic Guardian 5',zone:'First Vale',instance:'normal',fields:{location:{value:'1, 2, 3',confirmed:true},knownLoot:{value:['Synthetic Shared Powder'],confirmed:true}}};
const draft=buildContributionDraft(unclassified,blueprints);assert(draft.blockers.some(message=>/classification/.test(message)));assert.doesNotMatch(draft.text,/\{\{:Synthetic Shared Powder\}\}/,'A pure draft cannot silently default unknown loot to Unique');
assert.throws(()=>patchContributionRelationship('{{Namedmobpage|known_loot=?|common_loot=?}}',{role:'npc-loot',itemTitle:'Synthetic Shared Powder',instance:'normal'}),/classification/);
const authored='{{Namedmobpage|known_loot=?|common_loot=<ul><li>{{:Synthetic Shared Powder}} (Authored common)</li></ul>|description=Keep prose.}}';
assert.equal(patchContributionRelationship(authored,{role:'npc-loot',itemTitle:'Synthetic Shared Powder',instance:'normal',lootKind:'unique',preserveExisting:true}).text,authored,'An incidental update preserves authored classification byte for byte');
const markup=contributionLootMarkup(unclassified,{pack:pack(5)});assert.match(markup,/Common Loot · 6 distinct monsters/);assert.doesNotMatch(markup,/data-loot-kind=/,'Automatic global classification replaces misleading manual defaults');
assert.match(contributionLootMarkup(unclassified),/Classification needs complete cached wiki data/);

for(const candidate of [
    {kind:'npc',name:'Synthetic Guardian pet',fields:{}},
    {kind:'npc',name:'Ordinary Guardian',title:'Synthetic Guardian pet',fields:{}},
    {kind:'item',name:'Synthetic Shared Powder',sources:[{npc:'Synthetic Guardian pet',zone:'First Vale',confirmed:true}],fields:{}},
    {kind:'zone',name:'First Vale',fields:{knownNPCs:{value:['Synthetic Guardian pet'],confirmed:true}}},
    {kind:'zone',name:'First Vale',fields:{},relations:[{type:'drop-source',name:'Synthetic Guardian pet',item:'Synthetic Shared Powder'}]}
]){
    await assert.rejects(client.preparePlan({candidate,matchesReviewed:true}),/pets cannot be contributed/);
}
assert.equal(networkCalls,0,'Preserved or manually forced pet drafts are rejected before publication lookups');
assert.throws(()=>patchContributionPrimary('{{Namedmobpage|known_loot=?}}',{kind:'npc',name:'Synthetic Guardian pet',intent:'update',fields:{}}),/pets cannot be contributed/);
console.log('Loot classification: offline native-owned global counts, five/six boundary, pending sources, cross-zone/instance and alias dedup, exact ground-spawn exclusions, incomplete/sample guards, authored classification preservation, neutral drafts and pet publication guards passed.');
