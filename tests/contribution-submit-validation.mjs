import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{WikiClient}=require('../desktop/wiki-client.cjs');
const user={id:7,name:'Synthetic Editor'},hash=value=>createHash('sha256').update(value).digest('hex');
const item='Synthetic Shared Powder',newMob='Synthetic New Guardian';
const npcText=(name,kind='unique')=>'{{Namedmobpage|name='+name+'|known_loot='+(kind==='unique'?'{{:'+item+'}}':'?')+'|common_loot='+(kind==='common'?'{{:'+item+'}}':'?')+'}}';
function catalog(count=6){
    const names=Array.from({length:count},(_,i)=>'Global Synthetic Guardian '+i),countRecord={lootSourceCount:count,lootSourceCountComplete:true,lootSourceNpcs:names};
    return {meta:{schemaVersion:3,version:'synthetic-v1',sample:false,wikiEntitiesComplete:true,lootSourceCountsVersion:1},wikiEntities:{items:[item],npcs:[...names,newMob],titles:[item,...names,newMob]},items:[],npcs:[...names,newMob].map(name=>({name,wikiTitle:name})),lootSourceCounts:{[item]:countRecord}};
}
function page(title,beforeText,afterText,{status='pending',currentText=beforeText,revision=beforeText?1:null}={}){
    return {id:title,title,role:'primary',operation:beforeText?'replace-reviewed':'create',beforeText,afterText,beforeHash:hash(beforeText),afterHash:hash(afterText),baseRevision:revision,baseTimestamp:'2026-10-25T12:00:00Z',startTimestamp:'2026-10-25T12:00:00Z',status,currentText};
}
function fixture(pages,{pack=catalog(),automaticItem=false}={}){
    const writes=[],reads=[],states=new Map(pages.map(value=>[value.title,{title:value.title,content:value.currentText,missing:!value.currentText,revision:value.currentText?value.currentText===value.afterText?10:value.baseRevision:null,pageId:1,startTimestamp:value.startTimestamp}]));
    const client=new WikiClient({getItemCatalog:async()=>pack,fetchImpl:async()=>{throw Error('No live classification requests permitted');}});
    client.status=async()=>({authenticated:true,user,canEdit:true,canCreate:true,canUpload:true});client.blueprints=async()=>({revision:1});
    client.page=async title=>{reads.push(title);return {...states.get(title)};};
    client.request=async params=>{
        if(params.meta==='tokens')return{query:{tokens:{csrftoken:'synthetic-token'}}};
        assert.equal(params.action,'edit','Only existing explicit write/token operations can reach the native transport');writes.push(params);states.set(params.title,{...states.get(params.title),missing:false,content:params.text,revision:20});return{edit:{result:'Success',newrevid:20,pageid:1}};
    };
    const plan={id:'legacy-plan',wikiOrigin:client.origin,expectedUser:user,blueprintRevision:1,createdAt:'2026-10-25T12:00:00Z',pages:pages.map(({currentText,...value})=>value),blockers:[],warnings:[],matchesReviewed:true,...(automaticItem?{automaticItem:{title:pages[0].title}}:{})};
    plan.reviewDigest=client.digest(plan);client.plans.set(plan.id,plan);
    return {client,plan,writes,reads,states,submit:options=>client.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest},options)};
}
let f=fixture([page(newMob,'',npcText(newMob))]);
await assert.rejects(f.submit(),/requires Common Loot.*fresh Preview/);assert.equal(f.writes.length,0,'A persisted legacy Unique plan without classification proof cannot write a globally Common item');
assert.equal(f.plan.pages[0].status,'pending');
f=fixture([page(newMob,'',npcText(newMob))],{pack:{}});await assert.rejects(f.submit(),/complete global source count.*fresh Preview/);assert.equal(f.writes.length,0,'Missing cached count data cannot authorize an old Unique default');
f=fixture([page(newMob,'',npcText(newMob))],{pack:catalog(4)});assert.equal((await f.submit()).status,'submitted');assert.equal(f.writes.length,1,'A safe legacy plan can resume from a complete native cached count without live counting');
const existingCommon=npcText(newMob,'common');f=fixture([page(newMob,existingCommon,npcText(newMob))],{pack:catalog(1)});await assert.rejects(f.submit(),/existing authored loot classification/);assert.equal(f.writes.length,0);

for(const value of [
    page('Synthetic Guardian pet','',npcText('Synthetic Guardian pet')),
    page('Ordinary Alias','',npcText('Synthetic Guardian pet')),
    page(item,'{{Itempage|itemname='+item+'|dropsfrom=?}}','{{Itempage|itemname='+item+'|dropsfrom=\n[[Synthetic Vale]]\n* [[Synthetic Guardian pet]]\n}}'),
    page('Synthetic Vale','{| class="zoneTopTable"\n! Notable NPCs\n| ?\n|}','{| class="zoneTopTable"\n! Notable NPCs\n| [[Synthetic Guardian pet]]\n|}')
]){f=fixture([value]);await assert.rejects(f.submit(),/pet.*fresh Preview|fresh Preview.*pet/);assert.equal(f.writes.length,0,'Legacy pet target/source/population writes are rejected before mutation');}
const petAliasPack=catalog();petAliasPack.npcs.push({name:'Synthetic Guardian pet',wikiTitle:'Synthetic Guardian pet',aliases:['Friendly Guardian']});f=fixture([page('Friendly Guardian','',npcText('Friendly Guardian'))],{pack:petAliasPack});await assert.rejects(f.submit(),/pet/);assert.equal(f.writes.length,0,'Cached aliases cannot hide a pet target');

const applied=page('Already Applied Item','old source','confirmed applied source',{status:'applied',currentText:'confirmed applied source'});
f=fixture([applied,page(newMob,'',npcText(newMob))]);await assert.rejects(f.submit(),/requires Common Loot/);assert.equal(f.plan.pages[0].status,'applied');assert.equal(f.writes.length,0,'A rejected unsafe remainder leaves applied pages and partial retry receipts intact');assert(!f.reads.includes(applied.title));
const oldPet=page('Synthetic Guardian pet','',npcText('Synthetic Guardian pet'),{status:'applied',currentText:npcText('Synthetic Guardian pet')});
f=fixture([oldPet,page('Unrelated Pending Item','old text','new text')]);assert.equal((await f.submit()).status,'submitted');assert.deepEqual(f.writes.map(value=>value.title),['Unrelated Pending Item'],'Already-applied pages are preserved and never re-edited by retry validation');
f=fixture([oldPet,page(newMob,'',npcText(newMob))],{pack:catalog(4)});assert.equal((await f.submit()).status,'submitted');assert.deepEqual(f.writes.map(value=>value.title),[newMob],'An already-applied pet entry is excluded from monster counts without invalidating a safe remaining retry');
const lost=npcText(newMob);f=fixture([page(newMob,'',lost,{status:'unknown',currentText:lost}),page('Unrelated Pending Item','old text','new text')]);assert.equal((await f.submit()).status,'submitted');assert.equal(f.plan.pages[0].result.reconciled,true);assert.deepEqual(f.writes.map(value=>value.title),['Unrelated Pending Item'],'An already-applied unknown response reconciles before validating remaining writes');
f=fixture([page('Captured Item','', '{{Itempage|itemname=Captured Item}}',{currentText:'{{Itempage|itemname=Captured Item}}'})],{automaticItem:true});await assert.rejects(f.submit({beforeWrite:async()=>{}}),/now exists/);assert.equal(f.plan.pages[0].status,'pending');assert.equal(f.writes.length,0,'A fresh automatic item attempt cannot claim an identical page created by another editor');
console.log('Submission retry validation: legacy Unique/pet plans, cached-only classification, authored sections, aliases, applied-page preservation, uncertain-write reconciliation and fresh automatic duplicate refusal passed.');
