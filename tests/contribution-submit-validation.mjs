import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {createItemBaseReview,applyItemBaseReview} from '../app/item-base-review.js';
const require=createRequire(import.meta.url),{WikiClient}=require('../desktop/wiki-client.cjs');
const user={id:7,name:'Synthetic Editor'},hash=value=>createHash('sha256').update(value).digest('hex');
const item='Synthetic Shared Powder',newMob='Synthetic New Guardian';
const npcText=(name,kind='unique')=>'{{Namedmobpage|name='+name+'|known_loot='+(kind==='unique'?'{{:'+item+'}}':'?')+'|common_loot='+(kind==='common'?'{{:'+item+'}}':'?')+'}}';
const zoneText=(kind='unique')=>'{| class="zoneTopTable"\n! '+(kind==='common'?'Common Loot':'Unique Items')+'\n| {{:'+item+'}}\n|}\nExisting zone prose.';
function catalog(count=6){
    const names=Array.from({length:count},(_,i)=>'Global Synthetic Guardian '+i),countRecord={lootSourceCount:count,lootSourceCountComplete:true,lootSourceNpcs:names};
    return {meta:{schemaVersion:3,version:'synthetic-v1',sample:false,wikiEntitiesComplete:true,lootSourceCountsVersion:2},wikiEntities:{items:[item],npcs:[...names,newMob],titles:[item,...names,newMob]},items:[{name:item,wikiTitle:item,stats:{HP:5}}],npcs:[...names,newMob].map(name=>({name,wikiTitle:name})),lootSourceCounts:{[item]:countRecord}};
}
function page(title,beforeText,afterText,{status='pending',currentText=beforeText,revision=beforeText?1:null}={}){
    return {id:title,title,role:'primary',operation:beforeText?'replace-reviewed':'create',beforeText,afterText,beforeHash:hash(beforeText),afterHash:hash(afterText),baseRevision:revision,baseTimestamp:'2026-10-25T12:00:00Z',startTimestamp:'2026-10-25T12:00:00Z',status,currentText};
}
function fixture(pages,{pack=catalog(),automaticItem=false,itemBaseReview=null,notableChoices=null}={}){
    const writes=[],reads=[],states=new Map(pages.map(value=>[value.title,{title:value.title,content:value.currentText,missing:!value.currentText,revision:value.currentText?value.currentText===value.afterText?10:value.baseRevision:null,pageId:1,startTimestamp:value.startTimestamp}]));
    const client=new WikiClient({getItemCatalog:async()=>pack,fetchImpl:async()=>{throw Error('No live classification requests permitted');}});
    client.status=async()=>({authenticated:true,user,canEdit:true,canCreate:true,canUpload:true});client.blueprints=async()=>({revision:1});
    client.page=async title=>{reads.push(title);return {...states.get(title)};};
    client.request=async params=>{
        if(params.meta==='tokens')return{query:{tokens:{csrftoken:'synthetic-token'}}};
        assert.equal(params.action,'edit','Only existing explicit write/token operations can reach the native transport');writes.push(params);states.set(params.title,{...states.get(params.title),missing:false,content:params.text,revision:20});return{edit:{result:'Success',newrevid:20,pageid:1}};
    };
    const plan={id:'legacy-plan',wikiOrigin:client.origin,expectedUser:user,blueprintRevision:1,createdAt:'2026-10-25T12:00:00Z',pages:pages.map(({currentText,...value})=>value),blockers:[],warnings:[],matchesReviewed:true,...(automaticItem?{automaticItem:{title:pages[0].title}}:{}),...(itemBaseReview?{itemBaseReview}:{}),...(notableChoices?{notableChoices}:{})};
    plan.reviewDigest=client.digest(plan);client.plans.set(plan.id,plan);
    return {client,plan,writes,reads,states,submit:options=>client.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest},options)};
}
let f=fixture([page(newMob,'',npcText(newMob))]);
await assert.rejects(f.submit(),/requires Common Loot.*fresh Preview/);assert.equal(f.writes.length,0,'A persisted legacy Unique plan without classification proof cannot write a globally Common item');
assert.equal(f.plan.pages[0].status,'pending');
f=fixture([page(newMob,'',npcText(newMob))],{pack:{}});await assert.rejects(f.submit(),/cannot prove fewer than six monsters.*fresh Preview/);assert.equal(f.writes.length,0,'Missing cached count data cannot authorize an old Unique default');
f=fixture([page(newMob,'',npcText(newMob))],{pack:catalog(4)});assert.equal((await f.submit()).status,'submitted');assert.equal(f.writes.length,1,'A safe legacy plan can resume from a complete native cached count without live counting');
const setPack=catalog(4);setPack.meta.lootSetsVersion=1;setPack.lootSets={'Synthetic Armor Set':{items:[item],complete:true}};
const setBefore='{{Namedmobpage|name='+newMob+'|known_loot=* [[Synthetic Armor Set]]|common_loot=?}}',setAfter=setBefore.replace('|common_loot=','\n* {{:'+item+'}}\n|common_loot=');
f=fixture([page(newMob,setBefore,setAfter)],{pack:setPack});await assert.rejects(f.submit(),/already covered by the listed.*fresh Preview/);assert.equal(f.writes.length,0,'Saved plans cannot add an individual item already covered by an authored set');
const zoneSetBefore='{| class="zoneTopTable"\n! Unique Items\n| [[Synthetic Armor Set]]\n|}',zoneSetAfter=zoneSetBefore.replace('[[Synthetic Armor Set]]','[[Synthetic Armor Set]]<br>\n{{:'+item+'}}');
f=fixture([page('Synthetic Vale',zoneSetBefore,zoneSetAfter)],{pack:setPack});await assert.rejects(f.submit(),/already covered by the listed.*fresh Preview/);assert.equal(f.writes.length,0,'Legacy zone plans cannot append a redundant member to a covered instance cell');
const internalSetBefore='{{Namedmobpage|name='+newMob+'|known_loot=?\n=== Raid Instance ===\n* [[Synthetic Armor Set]]\n|common_loot=?}}',internalSetAfter=internalSetBefore.replace('[[Synthetic Armor Set]]','[[Synthetic Armor Set]]\n* {{:'+item+'}}');
f=fixture([page(newMob,internalSetBefore,internalSetAfter)],{pack:setPack});await assert.rejects(f.submit(),/already covered by the listed.*fresh Preview/);assert.equal(f.writes.length,0,'Internal raid loot headings retain their scope during legacy retry validation');
const internalNormalBefore='{{Namedmobpage|name='+newMob+'|known_loot=* [[Synthetic Armor Set]]\n=== Raid Instance ===\n?\n|common_loot=?}}',internalRaidAfter=internalNormalBefore.replace('=== Raid Instance ===\n?','=== Raid Instance ===\n* {{:'+item+'}}');
f=fixture([page(newMob,internalNormalBefore,internalRaidAfter)],{pack:setPack});assert.equal((await f.submit()).status,'submitted','A normal-only set does not block a distinct raid member addition in the same loot field');
const dualBefore='{{Namedmobpage|name='+newMob+'|known_loot=?|common_loot=?}}\n== Raid Instance ==\n'+setBefore,dualAfter=dualBefore.replace('known_loot=?','known_loot={{:'+item+'}}');
f=fixture([page(newMob,dualBefore,dualAfter)],{pack:setPack});assert.equal((await f.submit()).status,'submitted','A raid set does not hide a legitimate normal-instance addition');
const existingCommon=npcText(newMob,'common');f=fixture([page(newMob,existingCommon,npcText(newMob))],{pack:catalog(1)});await assert.rejects(f.submit(),/existing authored loot classification/);assert.equal(f.writes.length,0);
f=fixture([page('Synthetic Vale',zoneText().replace('{{:'+item+'}}','?'),zoneText())]);await assert.rejects(f.submit(),/requires Common Loot.*fresh Preview/);assert.equal(f.writes.length,0,'A legacy zone Unique Items row cannot bypass the global count');
f=fixture([page('Synthetic Vale',zoneText().replace('{{:'+item+'}}','?'),zoneText())],{pack:{}});await assert.rejects(f.submit(),/cannot prove fewer than six monsters.*fresh Preview/);assert.equal(f.writes.length,0);
f=fixture([page('Synthetic Vale',zoneText().replace('{{:'+item+'}}','?'),zoneText())],{pack:catalog(5)});assert.equal((await f.submit()).status,'submitted','Zone loot rows never count the zone title as a sixth monster');
f=fixture([page('Synthetic Vale',zoneText('common'),zoneText('common')+'\nReviewed prose.')],{pack:catalog(1)});assert.equal((await f.submit()).status,'submitted','Existing authored zone classification survives incidental edits');
f=fixture([page('Synthetic Vale',zoneText('common'),zoneText())],{pack:catalog(1)});await assert.rejects(f.submit(),/existing authored loot classification/);assert.equal(f.writes.length,0,'Saved zone plans cannot move prior authored classifications');
f=fixture([page('Synthetic Vale','{| class="zoneTopTable"\n! Name in /who\n| synthetic\n|}',zoneText())],{pack:catalog(4)});await assert.rejects(f.submit(),/pre-existing summary row.*fresh Preview/);assert.equal(f.writes.length,0,'Legacy automatic plans cannot invent a new zone Unique row');
const statlessCatalog=catalog(4);statlessCatalog.items=[{name:item,wikiTitle:item,stats:{WT:0.1}}];f=fixture([page('Synthetic Vale',zoneText().replace('{{:'+item+'}}','?'),zoneText())],{pack:statlessCatalog});await assert.rejects(f.submit(),/no verified item statistics.*fresh Preview/);assert.equal(f.writes.length,0,'A saved zone Unique entry cannot classify weight-only material as gear');
const populationBefore='{| class="zoneTopTable"\n! \'\'\'Notable NPCs:\'\'\'\n| ?\n|}',populationAfter=populationBefore.replace('| ?','| [['+newMob+']]');
f=fixture([page('Synthetic Vale',populationBefore,populationAfter)]);await assert.rejects(f.submit(),/no saved Notable choice.*fresh Preview/);assert.equal(f.writes.length,0,'Legacy automatic normal-population plans cannot bypass the explicit Notable question');
f=fixture([page('Synthetic Vale',populationBefore,populationAfter)],{notableChoices:[{npcTitle:newMob,zoneTitle:'Synthetic Vale',value:true}]});assert.equal((await f.submit()).status,'submitted','The saved reviewed true choice survives a normal retry');

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
const recoveryNote='These stats are reverse calculated from a tier 4 item. Please confirm with a tier 0 item and remove this message',recoveredText='{{Itempage|itemname=Synthetic Recovery Item|statsblock=HP: 30|notes='+recoveryNote+'}}';
const observed={kind:'item',name:'Synthetic Recovery Item +4',fields:{tier:{value:4},fraction:{value:0},hp:{value:42},statLines:{value:['HP: 42']}}},review=createItemBaseReview(observed,{tier:4,fraction:0,modifiersExcluded:true,reviewed:true,choices:{HP:30}}),reviewed={...observed,...applyItemBaseReview(observed,review)};reviewed.fields.statLines.confirmed=true;
const currentRecovery={schemaVersion:1,candidate:reviewed},staleRecovery=structuredClone(currentRecovery),fingerprint=JSON.parse(staleRecovery.candidate.baseRecovery.sourceFingerprint);fingerprint[fingerprint.length-1]+='previous-rules';staleRecovery.candidate.baseRecovery.sourceFingerprint=JSON.stringify(fingerprint);
for(const itemBaseReview of [null,staleRecovery]){f=fixture([page('Synthetic Recovery Item','',recoveredText)],{itemBaseReview});await assert.rejects(f.submit(),error=>error.code==='needs-review'&&/current scaling rules.*fresh Preview/.test(error.message));assert.equal(f.writes.length,0,'Missing or stale rules identity blocks unapplied inferred base stats');}
f=fixture([page('Synthetic Recovery Item','',recoveredText)],{itemBaseReview:currentRecovery});assert.equal((await f.submit()).status,'submitted','Current reviewed base recovery remains publishable');
f=fixture([page('Synthetic Recovery Item','',recoveredText,{status:'applied',currentText:recoveredText}),page('Unrelated Pending Item','old text','new text')],{itemBaseReview:staleRecovery});assert.equal((await f.submit()).status,'submitted');assert.deepEqual(f.writes.map(value=>value.title),['Unrelated Pending Item'],'Old inferred writes already applied are never invalidated or replayed');
f=fixture([page('Synthetic Recovery Item','',recoveredText,{status:'unknown',currentText:recoveredText})],{itemBaseReview:staleRecovery});assert.equal((await f.submit()).status,'submitted');assert.equal(f.plan.pages[0].result.reconciled,true);assert.equal(f.writes.length,0,'Exact unknown writes reconcile before applying current recovery rules');
f=fixture([page('Synthetic Recovery Item',recoveredText,recoveredText.replace('|notes=','|dropsfrom=[[Synthetic Vale]]\n* [[Synthetic New Guardian]]\n|notes='))],{itemBaseReview:staleRecovery});assert.equal((await f.submit()).status,'submitted','Pure loot-source additions do not re-publish base stats and remain allowed');
f=fixture([page('Synthetic Recovery Item',recoveredText,'{{Itempage|itemname=Synthetic Recovery Item|statsblock=HP: 31|notes=Verified with a tier zero capture.}}')]);assert.equal((await f.submit()).status,'submitted','Verified tier-zero replacements without inferred stats are unaffected');
console.log('Submission retry validation: legacy Unique/pet plans, cached-only classification, authored sections, aliases, applied-page preservation, uncertain-write reconciliation and fresh automatic duplicate refusal passed.');
for(const namespace of [0,10,undefined]){
    const title='Staff of Elemental Mastery: Water',before='{{Itempage|itemname='+title+'|statsblock=DMG: 15|notes=Original}}',after=before.replace('Original','Reviewed');
    f=fixture([page(title,before,after)]);f.states.get(title).namespace=namespace;
    if(namespace===0)assert.equal((await f.submit()).status,'submitted');else{await assert.rejects(f.submit(),/verified mainspace/);assert.equal(f.writes.length,0);}
}
f=fixture([page('Synthetic Unchanged Name','Original','Reviewed')]);f.states.get('Synthetic Unchanged Name').namespace=100;await assert.rejects(f.submit(),/verified mainspace/);assert.equal(f.writes.length,0,'Explicit API namespace changes stop even a non-colon saved destination');
