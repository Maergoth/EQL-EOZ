import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {skipAutomaticSourceBackfill,skipBroadAutomaticSourceBackfill} from '../app/automatic-source-policy.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {createWikiResolver} from '../app/wiki-identity.js';
import {contributionReasons} from '../app/contribution-reasons.js';
import {liveContributionCoverage} from '../app/contribution-coverage.js';
const require=createRequire(import.meta.url),{AutomaticLootSources}=require('../desktop/automatic-loot-sources.cjs');
const now=Date.parse('2026-10-25T12:00:00Z'),item='Synthetic common material',mob='Synthetic known guardian',zone='Synthetic Vale';
function fixture(count=6){
    const names=Array.from({length:count},(_,index)=>'Synthetic source '+index),record={name:item,wikiTitle:item,contributionCard:{schemaVersion:1,complete:true,questContext:false},stats:{WT:0.1},slots:[],classes:['ALL'],displayLines:['Quest','WT: 0.1 Size: SMALL','Class: ALL','Race: ALL'],dropSources:[{name:'Various synthetic zones',zone:''}],lootSourceNpcs:names,lootSourceCount:count,lootSourceCountComplete:false};
    return{meta:{sample:false,wikiEntitiesComplete:true,lootSourceCountsVersion:2,version:'synthetic-material-v1'},wikiEntities:{items:[item],npcs:[mob,...names],titles:[item,mob,zone,...names]},items:[record],npcs:[{name:mob,wikiTitle:mob,zone}],zones:[{name:zone}],lootSourceCounts:{[item]:{lootSourceNpcs:names,lootSourceCount:count,lootSourceCountComplete:false}}};
}
let pack=fixture();assert(skipAutomaticSourceBackfill(pack,item));assert(skipAutomaticSourceBackfill(pack,item.toUpperCase()),'Identity aliases use the typed resolver');assert(!skipAutomaticSourceBackfill(pack,item,{manual:true}));
const oldCounts=fixture();oldCounts.meta.lootSourceCountsVersion=1;assert(!skipAutomaticSourceBackfill(oldCounts,item),'Older redlink-inclusive counts cannot prove routine Common material');
assert(!skipAutomaticSourceBackfill(fixture(5),item),'Five existing sources cannot suppress a newly proposed sixth source');
for(const mutate of [
    p=>{p.meta.sample=true;},p=>{p.meta.wikiEntitiesComplete=false;},p=>{delete p.meta.lootSourceCountsVersion;},p=>{p.items=[];},p=>{delete p.items[0].stats;},p=>{p.items[0].stats={};},p=>{p.items[0].stats.WT='0.1';},p=>{p.items[0].stats.HP=1;},p=>{p.items[0].stats.STR=0;},p=>{p.items[0].slots=['PRIMARY'];},p=>{delete p.items[0].slots;},p=>{p.items[0].displayLines=[];},p=>{delete p.items[0].displayLines;},p=>{p.items[0].displayLines.push('Effect: Synthetic Vision (Any Slot)');},p=>{p.items[0].displayLines.push('Instrument modifier: 18');},p=>{p.items[0].displayLines.push('Unknown useful property');},p=>{p.items[0].displayLines[1]='WT: 0.2 Size: SMALL';},p=>{p.items[0].displayLines[1]='WT: 0.1 Size: SMALL HP: 20';},p=>{p.lootSourceCounts[item].lootSourceNpcs=['Only known source'];p.lootSourceCounts[item].lootSourceCount=1;}
]){const changed=fixture();mutate(changed);assert.equal(skipAutomaticSourceBackfill(changed,item),false,'Unproven, equippable, effect-bearing, uncommon or incomplete metadata remains reviewable');}
for(const [key,value]of [['effects',['Synthetic effect']],['proc','Synthetic proc'],['focusEffect','Synthetic focus'],['instrumentModifier',18]]){const changed=fixture();changed.items[0][key]=value;assert(!skipAutomaticSourceBackfill(changed,item),'Separate '+key+' metadata also prevents material suppression');}
assert(!skipAutomaticSourceBackfill(pack,'Unknown synthetic material'));
const resolver=createWikiResolver(pack),relations=[{type:'drop-source',name:mob,zone,instance:'normal',evidence:'explicit-corpse',item}];
for(const candidate of [
    {kind:'item',name:item,relations},
    {kind:'npc',name:mob,zone,instance:'normal',fields:{knownLoot:{value:[item]}}},
    {kind:'zone',name:zone,instance:'normal',relations}
]){assert(!contributionReasons(candidate,resolver,{pack}).reasons.includes('missing-source'));assert(contributionReasons({...candidate,manual:true},resolver,{pack}).reasons.includes('missing-source'),'Explicit manual contributions retain the source editor');}
const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)},queue=createContributionQueue({storage,getPack:()=>pack,now:()=>now});let cursor=0;
const loot=(source=mob,name=item)=>queue.consumeLog({type:'loot',item:name,source,sourceEvidence:{kind:'explicit-corpse'}},{live:true,at:now,cursor:++cursor,zone,instance:'normal',logId:'synthetic-material-log'});
assert.equal(loot().candidate,null);assert.equal(queue.snapshot().length,0,'Known common material cannot create item, monster or zone source-gap clutter');
loot('A missing synthetic guardian');assert(queue.snapshot().some(candidate=>candidate.kind==='npc'&&candidate.name==='A missing synthetic guardian'&&candidate.reasons.includes('missing-page')),'Unknown-monster discovery survives a common material drop');assert(!queue.snapshot().some(candidate=>candidate.reasons.includes('missing-source')));
loot(mob,'Unknown synthetic item');assert(queue.snapshot().some(candidate=>candidate.kind==='item'&&candidate.name==='Unknown synthetic item'&&candidate.reasons.includes('missing-page')),'Unknown item discovery is never suppressed');
const manual=queue.add({kind:'item',name:item,zone,instance:'normal',relations},true);assert(manual.manual);assert(manual.reasons.includes('missing-source'));
async function nativeCheck(catalog){
    let liveCalls=0;const deferred=[],results=[],client={getItemCatalog:async()=>catalog,expectedUser:async()=>{liveCalls++;throw Error('Synthetic live lookup boundary reached');}};
    const native=new AutomaticLootSources({client,now:()=>now,onDeferred:row=>deferred.push(row),onResult:row=>results.push(row)}),record={id:'synthetic-material-observation',kind:'game-log',owner:'contribution',parser:{name:'native-eq-log'},capturedAt:new Date(now).toISOString(),input:{live:true,event:'loot',logId:'synthetic-material-native',cursor:1,zone,instance:'normal'},subject:{kind:'item',name:item},relations};
    const outcome=await native.observe(record);native.dispose();return{outcome,liveCalls,deferred,results};
}
let native=await nativeCheck(pack);assert.equal(native.outcome.results[0].decision,'routine');assert.equal(native.liveCalls,0);assert.equal(native.deferred.length,0);assert.equal(native.results.length,0,'A routine skipped material creates no successful or attention receipt');
const gear=fixture();gear.items[0].slots=['PRIMARY'];native=await nativeCheck(gear);assert.equal(native.liveCalls,1);assert.equal(native.deferred.length,1,'Gear still reaches the existing guarded source workflow');
native=await nativeCheck(fixture(5));assert.equal(native.liveCalls,1,'Uncommon materials retain automatic source handling');
console.log('Automatic common-material source policy: explicit WT-only/no-slot metadata, trusted existing six-source lower bound, absent-data/gear/effect counterexamples, item/NPC/zone gap suppression, manual and unknown-entity preservation, and zero native live requests passed.');


for(const flags of ['No Trade, Quest','NO DROP, QUEST ITEM','LORE ITEM, QUEST']){const important=fixture();important.items[0].displayLines[0]=flags;assert(!skipAutomaticSourceBackfill(important,item),'Bound/lore quest objects remain important despite WT-only metadata');}
for(const [key,value]of [['questRoles',['turn-in']],['baneDamage',25],['specialDamage',{type:'Undead',amount:25}]]){const important=fixture();important.items[0][key]=value;assert(!skipAutomaticSourceBackfill(important,item),key);}
const basicWeapon=fixture();basicWeapon.items[0].stats={WT:0.1,DMG:5,BANE_DMG:25};basicWeapon.items[0].slots=['HANDS'];basicWeapon.items[0].displayLines.push('Bane DMG: Undead 25');assert(!skipAutomaticSourceBackfill(basicWeapon,item),'A special-damage item cannot become routine material');
console.log('Routine material importance: bound/lore quest objects, explicit quest roles, effects and special damage remain reviewable.');

function basicFixture(armor=false){
    const pack=fixture(),record=pack.items[0];record.stats=armor?{AC:2,WT:0.2}:{WT:2.5,DMG:3};record.slots=armor?['HEAD']:['PRIMARY','SECONDARY'];
    record.displayLines=armor?['QUEST ITEM','Slot: HEAD','AC: 2','WT: 0.2 Size: SMALL','Class: ALL','Race: ALL']:['Attunable, Quest, Placeable','Slot: PRIMARY SECONDARY','Skill: Piercing Atk Delay: 24','DMG: 3 BACKSTAB: 3','Dmg Bonus: 9','WT: 2.5 Size: SMALL','Class: ALL except CLR PAL DRU MNK SHM','Race: ALL'];
    pack.meta.wikiRelationshipCoverageVersion=1;pack.wikiRelationshipCoverage={[item]:{schemaVersion:1,kind:'item',wikiTitle:item,revisionId:51,state:'broad',scopes:[{field:'dropsfrom',instance:'normal',state:'broad'}],edges:[],collectionRefs:[]}};return pack;
}
const broad={state:'broad'};
for(const proof of [undefined,null,{},[],{schemaVersion:2,complete:true,questContext:false},{schemaVersion:1,complete:false,questContext:false},{schemaVersion:1,complete:'true',questContext:false},{schemaVersion:1,complete:true},{schemaVersion:1,complete:true,questContext:1}])for(const armor of [null,false,true]){
 const candidate=armor===null?fixture():basicFixture(armor);candidate.items[0].contributionCard=proof;assert(!skipAutomaticSourceBackfill(candidate,item));assert(!skipBroadAutomaticSourceBackfill(candidate,item,{coverage:broad}),'Missing, malformed, incomplete or old card proof cannot hide source review');
}
for(const candidate of [fixture(),basicFixture(),basicFixture(true)]){
 candidate.items[0].contributionCard.questContext=true;candidate.items[0].relatedquests='[[Ordinary turn-in]]';candidate.items[0].questLinks=['Ordinary turn-in'];candidate.items[0].quests=['Ordinary turn-in'];assert(candidate.items[0].slots.length?skipBroadAutomaticSourceBackfill(candidate,item,{coverage:broad}):skipAutomaticSourceBackfill(candidate,item),'Ordinary quest lists are context rather than a guessed important role');
 const roundtrip=JSON.parse(JSON.stringify(candidate));assert.deepEqual(createWikiResolver(roundtrip).resolve('item',item).records[0].contributionCard,{schemaVersion:1,complete:true,questContext:true},'Downloaded/native JSON and typed resolver retain the producer card proof');
}
for(const candidate of [fixture(),basicFixture()]){while(candidate.items[0].displayLines.length<17)candidate.items[0].displayLines.push('Class: ALL');assert(!skipAutomaticSourceBackfill(candidate,item));assert(!skipBroadAutomaticSourceBackfill(candidate,item,{coverage:broad}),'A cached seventeen-line record contradicts the complete sixteen-line card contract');}
for(const family of ['Various Zones\n* Common drop from low-level humanoids','Various Zones\n* Drops from low-level humanoids.']){
 const catalog=basicFixture(),relation={item,npc:mob,zone,instance:'normal'},page={title:item,missing:false,content:'{{Itempage|itemname='+item+'|statsblock='+catalog.items[0].displayLines.join('<br>')+'|dropsfrom='+family+'}}'},npcPage={title:mob,missing:false,content:'{{Namedmobpage|name='+mob+'|known_loot=?|common_loot=?}}'};
 const coverage=liveContributionCoverage(catalog,relation,{itemPage:page,npcPage});assert.equal(coverage.state,'broad');assert(skipBroadAutomaticSourceBackfill(catalog,item,{coverage,itemPage:page}),'Actual Rusty-style generic family wording can quietly suppress verified common basic gear');
 catalog.items[0].stats.HP=5;catalog.items[0].displayLines.push('HP: 5');const important={...page,content:page.content.replace('|dropsfrom=','<br>HP: 5|dropsfrom=')};assert(!skipBroadAutomaticSourceBackfill(catalog,item,{coverage,itemPage:important}),'Recognizing a broad family never hides important bonus-stat gear');
}
const incidentalNotes=basicFixture();incidentalNotes.items[0].notes='Part of an ordinary basic equipment set.';assert(skipBroadAutomaticSourceBackfill(incidentalNotes,item,{coverage:broad}),'Informational prose is not a guessed quest-role label');
for(const armor of [false,true]){const p=basicFixture(armor);assert(skipBroadAutomaticSourceBackfill(p,item,{coverage:broad}));assert(!skipAutomaticSourceBackfill(p,item),'Basic equipment does not become an unconditional material skip');for(const state of ['uncovered','unknown','unsupported','covered'])assert(!skipBroadAutomaticSourceBackfill(p,item,{coverage:{state}}),'The basic-card predicate applies only to authored broad intent');assert(!skipBroadAutomaticSourceBackfill(p,item,{coverage:broad,manual:true}));}
const liveBasic=basicFixture(),livePage={title:item,missing:false,content:'{{Itempage|itemname='+item+'|statsblock='+liveBasic.items[0].displayLines.join('<br>')+'|dropsfrom=Various sources}}'};
assert(skipBroadAutomaticSourceBackfill(liveBasic,item,{coverage:broad,itemPage:livePage}));
assert(skipBroadAutomaticSourceBackfill(liveBasic,item,{coverage:broad,itemPage:{...livePage,content:livePage.content.replace('|dropsfrom=','|notes=Various unrelated prose|dropsfrom=')}}));
for(const context of ['|relatedquests=[[Ordinary turn-in]]','|soldby={{ItemWhereTable|{{ItemWhereRow|[[Synthetic Vale]]|[[A merchant]]||1,2}}}}','|merchant_value=<p>1 gold</p>','|recipes=[[Ordinary recipe]]','|foraged=[[Synthetic Vale]]','|notes={{VeliousGray|ordinary note}} {{Era|Classic}} {{Loc|Synthetic Vale|1,2,3}}'])assert(skipBroadAutomaticSourceBackfill(liveBasic,item,{coverage:broad,itemPage:{...livePage,content:livePage.content.replace('|dropsfrom=',context+'|dropsfrom=')}}),'Known literal context, including bounded acquisition wrappers, is not an important modifier: '+context);
for(const content of [
 livePage.content.replace('|dropsfrom=','|notes={{Unknown hidden property}}|dropsfrom='),
 livePage.content.replace('|dropsfrom=','|soldby={{ItemWhereTable|{{Unknown hidden property}}}}|dropsfrom='),
 livePage.content.replace('|dropsfrom=','|foraged={{{dynamic}}}|dropsfrom='),
 livePage.content.replace('|dropsfrom=','|notes=<nowiki>Hidden property</nowiki>|dropsfrom='),
 livePage.content.replace('|dropsfrom=','|custom_modifier=Unknown useful property|dropsfrom='),
 livePage.content.replace('|dropsfrom=','|unnamed positional modifier|dropsfrom='),
 livePage.content.replace('|dropsfrom=','|STatsblock=WT: 2.5|dropsfrom='),
 livePage.content.replace('|dropsfrom=','|drops_from=?|dropsfrom='),
 livePage.content.replace('DMG: 3','DMG: {{Unknown value}}'),
 livePage.content.replace('DMG: 3','<b class="dynamic">DMG: 3</b>'),
 livePage.content.replace('|dropsfrom=','|icon={{Loc|Synthetic Vale}}|dropsfrom='),
 livePage.content.replace('DMG: 3','DMG: 3<broken'),
 livePage.content.replace('{{Itempage','{{ITEMPAGE'),
 livePage.content.replace('|dropsfrom=','|soldby={{ITEMWHERETABLE|literal}}|dropsfrom='),
 livePage.content.replace('|statsblock=','|STATSblock='),
 livePage.content.replace('|itemname=','|ITEMNAME='),
 livePage.content.replace('|dropsfrom=','|NOTES=Ignored useful property|dropsfrom='),
 '{{Unknown wrapper|'+livePage.content+'}}',
 livePage.content+livePage.content,
 livePage.content.replace('|dropsfrom=','<br>'+Array.from({length:17},()=> 'Class: ALL').join('<br>')+'|dropsfrom=')
])assert(!skipBroadAutomaticSourceBackfill(liveBasic,item,{coverage:broad,itemPage:{...livePage,content}}),'Fresh live structural/dynamic/truncation gaps never inherit a cached absence proof');
assert(skipBroadAutomaticSourceBackfill(liveBasic,item,{coverage:broad,itemPage:{...livePage,content:livePage.content.replace('{{Itempage','{{Template:itempage').replace('|dropsfrom=','|soldby={{Template:itemWhereTable|{{itemWhereRow|[[Synthetic Vale]]|[[A merchant]]}}}}|dropsfrom=')}}),'MediaWiki first-letter normalization and Template prefix preserve exact reviewed template identity');
for(const iconKey of ['lucy_img_ID','lucy_img_id','icon','icon_id'])assert(skipBroadAutomaticSourceBackfill(liveBasic,item,{coverage:broad,itemPage:{...livePage,content:livePage.content.replace('|dropsfrom=','|'+iconKey+'=42|dropsfrom=')}}),'Explicit reviewed icon metadata spellings remain recognized');
const liveMaterial=fixture(),materialPage={title:item,missing:false,content:'{{Itempage|itemname='+item+'|statsblock='+liveMaterial.items[0].displayLines.join('<br>')+'|relatedquests=[[Ordinary turn-in]]|foraged=[[Synthetic Vale]]|dropsfrom=Various sources}}'};
assert(skipAutomaticSourceBackfill(liveMaterial,item,{itemPage:materialPage}),'A complete common material may retain ordinary quest/acquisition context');
assert(!skipAutomaticSourceBackfill(liveMaterial,item,{itemPage:{...materialPage,content:materialPage.content.replace('|relatedquests=','|custom_modifier=Hidden useful property|relatedquests=')}}),'A freshly fetched material with unknown auxiliary metadata remains reviewable');
assert(!skipAutomaticSourceBackfill(liveMaterial,item,{itemPage:{...materialPage,content:materialPage.content.replace('Various sources','{{Unknown pool}}')}}),'Unknown source expansions fail the same literal-card proof for materials and basic gear');
for(const content of [livePage.content.replace('|dropsfrom=','<br>HP: 5|dropsfrom='),livePage.content.replace('|dropsfrom=','<br>Bane DMG: Undead 25|dropsfrom='),livePage.content.replace('|dropsfrom=','|click_effect=Synthetic Vision|dropsfrom='),livePage.content.replace('|dropsfrom=','|unknown_modifier=Synthetic useful property|dropsfrom='),livePage.content.replace('Attunable, Quest, Placeable','No Trade, Quest'),livePage.content.replace('DMG: 3','DMG: 4')])assert(!skipBroadAutomaticSourceBackfill(liveBasic,item,{coverage:broad,itemPage:{...livePage,content}}),'Newly fetched meaningful/changed metadata cannot be hidden by stale cached basic stats');
for(const mutate of [p=>{p.items[0].stats.HP=1;},p=>{p.items[0].stats.BANE_DMG=25;},p=>{p.items[0].stats.WT='2.5';},p=>{delete p.items[0].stats;},p=>{delete p.items[0].slots;},p=>{p.items[0].displayLines=[];},p=>{p.items[0].displayLines.push('Effect: Synthetic Vision');},p=>{p.items[0].displayLines.push('Bane DMG: Undead 25');},p=>{p.items[0].displayLines.push('Unknown special qualifier');},p=>{p.items[0].displayLines[0]='No Trade, Quest';},p=>{p.items[0].displayLines[0]='LORE ITEM';},p=>{p.items[0].effects=['Synthetic effect'];},p=>{p.items[0].questRoles=['turn-in'];},p=>{p.items[0].displayLines[3]='DMG: 4';},p=>{p.items[0].displayLines[1]='Slot: UNKNOWN';},p=>{p.lootSourceCounts[item].lootSourceNpcs=p.lootSourceCounts[item].lootSourceNpcs.slice(0,5);p.lootSourceCounts[item].lootSourceCount=5;}]){const p=basicFixture();mutate(p);assert(!skipBroadAutomaticSourceBackfill(p,item,{coverage:broad}),'Important, unverified or mismatching basic metadata remains reviewable');}
const basic=basicFixture();assert(!contributionReasons({kind:'item',name:item,relations},createWikiResolver(basic),{pack:basic}).reasons.includes('missing-source'),'UI uses the same affected-broad basic-card decision');
native=await nativeCheck(basic);assert.equal(native.liveCalls,0);assert.equal(native.outcome.results[0].decision,'routine');assert.equal(native.outcome.results[0].reason,'known-common-basic-broad-source');assert.equal(native.deferred.length,0);
const importantBasic=basicFixture();importantBasic.items[0].stats.HP=1;native=await nativeCheck(importantBasic);assert.equal(native.liveCalls,0);assert.equal(native.deferred.length,1,'Cached broad important gear retains one useful review without enumerating the family');
for(const missing of [undefined,{schemaVersion:1,complete:false,questContext:false}]){const incomplete=basicFixture();incomplete.items[0].contributionCard=missing;native=await nativeCheck(incomplete);assert.equal(native.deferred.length,1);assert.notEqual(native.outcome.results[0].decision,'routine','Native cached handling requires the same complete-card proof');}
console.log('Affected broad basic equipment: verified existing Common count, complete AC/weapon metadata including Attunable/Backstab/bonus, no unconditional gear skip, and important/effect/unknown/manual counterexamples passed.');
