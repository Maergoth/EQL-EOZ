import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createContributionIgnoreMatcher} from '../app/contribution-ignore-identity.js';
const require=createRequire(import.meta.url),{AutomaticLootSources}=require('../desktop/automatic-loot-sources.cjs'),{WikiClient}=require('../desktop/wiki-client.cjs');
const now=Date.parse('2026-10-25T12:00:00Z');let cursor=0;
function record({event='loot',item='Synthetic Relic',npc='Synthetic Watcher'}={}){
    const n=++cursor,at=new Date(now).toISOString();
    return{id:`synthetic-ignore-${n}`,kind:'game-log',owner:'contribution',parser:{name:'native-eq-log',version:2},capturedAt:at,input:{event,zone:'Synthetic Vale',instance:'normal',logId:'synthetic-log',cursor:n,live:true},subject:{kind:event==='kill'?'monster':'item',name:event==='kill'?npc:item},relations:event==='loot'?[{type:'drop-source',name:npc,item,zone:'Synthetic Vale',instance:'normal',evidence:'explicit-corpse',at}]:[],evidence:{logLine:'Synthetic private log'}};
}
const pack={items:[{name:'Synthetic Relic',wikiTitle:'Synthetic Relic',aliases:['Relic Alias']}],npcs:[{name:'Synthetic Watcher',wikiTitle:'Synthetic Watcher',aliases:['Watcher Alias']}],zones:[{name:'Synthetic Vale',wikiTitle:'Synthetic Vale'}]};
let catalogReads=0,accountReads=0,liveReads=0,deferred=[];
const client={getItemCatalog:async()=>{catalogReads++;return pack;},expectedUser:async()=>{accountReads++;throw Error('Synthetic account boundary');},findMatches:async()=>{liveReads++;throw Error('Unexpected live request');},page:async()=>{liveReads++;throw Error('Unexpected live request');}};
let entries=[{kind:'npc',name:'Watcher Alias',canonicalTitle:'Synthetic Watcher',basis:'canonical'}],matcher=createContributionIgnoreMatcher(entries,pack);
const engine=new AutomaticLootSources({client,now:()=>now,isIgnored:target=>matcher(target),onDeferred:value=>deferred.push(value)});
assert.deepEqual(await engine.observe(record({event:'kill',npc:'Watcher Alias'})),{accepted:false,ignored:true});assert.equal(engine.kills.size,0);assert.equal(catalogReads,0);assert.equal(accountReads,0);
let result=await engine.observe(record());assert.equal(result.accepted,false);assert.equal(accountReads,0);assert.equal(liveReads,0);assert.equal(deferred.length,0,'ignored NPC relations stay quiet before any authentication or HTTP');
entries=[{kind:'item',name:'Relic Alias',canonicalTitle:'Synthetic Relic',basis:'canonical'}];matcher=createContributionIgnoreMatcher(entries,pack);
result=await engine.observe(record({item:'Relic Alias'}));assert.equal(result.ignored,true);assert.equal(accountReads,0);assert.equal(liveReads,0,'ignored item stops the automatic source job before live wiki access');
result=await engine.observe(record({event:'kill'}));assert.equal(result.accepted,true,'an ignored item does not suppress independent NPC discovery evidence');
result=await engine.observe(record({item:'Other Relic'}));assert.equal(accountReads,1,'an unrelated item can still reach its independent review boundary');assert.equal(liveReads,0);assert.match(deferred.at(-1).reason,/Synthetic account boundary/);
matcher=()=>{throw Error('Synthetic unreadable ledger');};await engine.observe(record({item:'Other Relic'}));assert.equal(accountReads,1);assert.match(deferred.at(-1).reason,/Synthetic unreadable ledger/,'unreadable native ledger defers rather than treating it as empty');
engine.dispose();
// A saved automatic job may have applied its NPC author before a connection
// loss, while an optional zone summary remains pending. Ignoring that NPC must
// retain the truthful receipt and stop the remaining source job as well.
const itemPage={title:'Synthetic Relic',namespace:0,pageId:1,revision:1,content:'{{Itempage|itemname=Synthetic Relic|statsblock=HP: 5|dropsfrom=?}}'},npcPage={title:'Synthetic Watcher',namespace:0,pageId:2,revision:2,content:'{{Namedmobpage|name=Synthetic Watcher|zone=[[Synthetic Vale]]|known_loot=?|common_loot=?}}'},zonePage={title:'Synthetic Vale',namespace:0,pageId:3,revision:3,content:'{| class="zoneTopTable"\n! Unique Items\n| ?\n|}\n[[Category:Zones]]'};
const sourcePack={meta:{sample:false,wikiEntitiesComplete:true,lootSourceCountsVersion:2},wikiEntities:{items:[itemPage.title],npcs:[npcPage.title],titles:[itemPage.title,npcPage.title,zonePage.title]},items:[{name:itemPage.title,wikiTitle:itemPage.title,stats:{HP:5},lootSourceCount:0,lootSourceCountComplete:true,lootSourceNpcs:[]}],npcs:[{name:npcPage.title,wikiTitle:npcPage.title}],zones:[{name:zonePage.title,wikiTitle:zonePage.title}]};
const nativePages=new Map([itemPage,npcPage,zonePage].map(page=>[page.title,page])),nativeWrites=[];let ignoredNpc=false;
const native=new WikiClient({fetchImpl:async()=>{throw Error('No HTTP allowed');},getItemCatalog:async()=>sourcePack,isContributionIgnored:async target=>ignoredNpc&&target.kind==='npc'&&target.name===npcPage.title});
native.status=async()=>({authenticated:true,user:{id:7,name:'Synthetic Editor'},canEdit:true,canCreate:true});native.blueprints=async()=>({revision:1});native.page=async title=>({...nativePages.get(title),missing:false,redirect:false,startTimestamp:'2026-10-25T12:00:00Z'});
native.request=async(params)=>{if(params.meta==='tokens')return{query:{tokens:{csrftoken:'synthetic-token'}}};if(params.action==='edit'){nativeWrites.push(params);return{edit:{result:'Success',newrevid:10}};}throw Error('Unexpected native request');};
const pending=await native.prepareObservedLootRelation({relation:{item:itemPage.title,npc:npcPage.title,zone:zonePage.title,instance:'normal'},itemPage,npcPage,zonePage,account:{id:7,name:'Synthetic Editor'},observationId:'synthetic-ignore-partial',relationKey:'a'.repeat(64),evidence:'explicit-corpse',catalog:sourcePack});
assert.equal(pending.pages.length,2);const saved=native.plans.get(pending.id);saved.pages[0].status='unknown';nativePages.set(npcPage.title,{...npcPage,content:saved.pages[0].afterText,revision:4});ignoredNpc=true;
let stopped,error;try{stopped=await native.submitPlan({planId:pending.id,reviewDigest:pending.reviewDigest});}catch(failure){error=failure;}
assert(error?.code==='contribution-ignored'||stopped?.status==='partial','a newly ignored source NPC stops a saved automatic job');assert.equal(nativeWrites.length,0,'the pending zone summary cannot bypass a newly ignored source NPC');assert.equal(saved.pages[0].status,'applied','the exact prior NPC write remains reconciled');assert.equal(saved.pages[1].status,'pending');
console.log('Automatic source ignores: canonical NPC/item blocks occur before account/HTTP, independent entities survive, unreadable ledger defers.');
