import assert from 'node:assert/strict';
import {createContributionQueue} from '../app/contribution-queue.js';
const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
let pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Existing Gem','Existing Boots'],npcs:['Goblin Alchemist'],titles:['Existing Gem','Existing Boots','Goblin Alchemist','Synthetic Vale']},items:[{name:'Existing Gem'}],npcs:[{name:'Goblin Alchemist'}],zones:[{name:'Synthetic Vale'}]};
const queue=()=>createContributionQueue({storage,getPack:()=>pack});let q=queue();
assert.equal(q.add({kind:'item',name:'Existing Gem'}),null);assert.equal(q.add({kind:'item',name:'Existing Boots +10'}),null);
const prefixed=q.add({kind:'npc',name:'a goblin alchemist',zone:'Synthetic Vale'});assert.ok(prefixed);assert.equal(prefixed.membership,'missing');
q.remove(prefixed.id);q=queue();assert.equal(q.add({kind:'npc',name:'a goblin alchemist',zone:'Synthetic Vale'}),null);assert.equal(q.consume({sequence:1,owner:'contribution',subject:{kind:'monster',name:'a goblin alchemist'},input:{zone:'Synthetic Vale'},fields:[]}),null);
assert.ok(q.add({kind:'npc',name:'a goblin alchemist',zone:'Synthetic Vale'},true));
const observation=(name,source,evidence='explicit-corpse',sequence=2)=>({id:`event-${sequence}`,sequence,owner:'contribution',kind:'game-log',subject:{kind:'item',name},input:{zone:'Synthetic Vale'},fields:[{key:'name',value:name,confidence:100}],relations:[{type:'drop-source',name:source,zone:'Synthetic Vale',evidence}],capturedAt:'2026-10-22T00:00:00Z'});
const returned=q.consume(observation('New Gem','a missing guardian'));assert.equal(returned.kind,'item');let candidates=q.snapshot(),npc=candidates.find(c=>c.name==='a missing guardian'),item=candidates.find(c=>c.name==='New Gem');assert.deepEqual(npc.fields.knownLoot,{value:['New Gem'],confirmed:false});assert.equal(npc.zone,'Synthetic Vale');assert.equal(item.sources[0].confirmed,false);assert.equal(item.sources[0].sourceEvidence,'explicit-corpse');
q.consume(observation('Another New Gem','a missing guardian','explicit-corpse',3));npc=q.snapshot().find(c=>c.id===npc.id);assert.deepEqual(npc.fields.knownLoot.value,['New Gem','Another New Gem']);assert.equal(npc.fields.knownLoot.confirmed,false);
const existingItem=q.consume(observation('Existing Gem','another missing guardian','explicit-corpse',4));assert.equal(existingItem.kind,'npc');assert.deepEqual(existingItem.fields.knownLoot.value,['Existing Gem']);
q.consume(observation('Speculative Gem','a speculative guardian','recent-kill',5));assert.equal(q.snapshot().some(c=>c.name==='a speculative guardian'),false);assert.equal(q.snapshot().find(c=>c.name==='Speculative Gem').sources[0].confirmed,false);
const before=q.snapshot().length;q.consume({sequence:6,owner:'character',subject:{kind:'item',name:'Character-only Gem'},input:{},fields:[]});assert.equal(q.snapshot().length,before);
const editing=q.snapshot().find(c=>c.name==='New Gem');q.update(editing.id,{fields:{statLines:{value:['AC: 5'],confirmed:true}}});q.add({kind:'item',name:'New Gem',zone:'Synthetic Vale',fields:{statLines:['AC: 999']}});assert.equal(q.snapshot().find(c=>c.id===editing.id).fields.statLines.value[0],'AC: 5');
q.update(editing.id,{fields:{statLines:{value:['AC: 7'],confirmed:false,edited:true}}});q=queue();q.add({kind:'item',name:'New Gem',zone:'Synthetic Vale',fields:{statLines:['AC: 999']}});assert.deepEqual(q.snapshot().find(c=>c.id===editing.id).fields.statLines,{value:['AC: 7'],confirmed:false,edited:true});
const editedNpc=q.snapshot().find(c=>c.name==='a missing guardian');q.update(editedNpc.id,{fields:{knownLoot:{value:['Player-corrected Gem'],confirmed:false,edited:true}}});q.consume(observation('Later Observed Gem','a missing guardian','explicit-corpse',7));const preservedNpc=q.snapshot().find(c=>c.id===editedNpc.id);assert.deepEqual(preservedNpc.fields.knownLoot,{value:['Player-corrected Gem'],confirmed:false,edited:true});assert.ok(preservedNpc.evidence.some(evidence=>evidence.text.includes('Later Observed Gem')));
const manual=q.add({kind:'npc',name:'a manual guardian'},true);q.update(manual.id,{zone:'Synthetic Vale',fields:{level:{value:'55',confirmed:false,edited:true}},planId:'saved-plan-id'});q.consume({sequence:8,owner:'contribution',subject:{kind:'monster',name:'a manual guardian'},input:{zone:'Synthetic Vale'},fields:[{key:'level',value:51}]});assert.equal(q.snapshot().filter(candidate=>candidate.name==='a manual guardian').length,1);assert.equal(q.snapshot().find(candidate=>candidate.id===manual.id).fields.level.value,'55');assert.equal(queue().snapshot().find(candidate=>candidate.id===manual.id).planId,'saved-plan-id');
pack={meta:{wikiEntitiesComplete:false},items:[],npcs:[],zones:[]};assert.equal(q.add({kind:'item',name:'Unknown Catalog Gem'}).membership,'unknown');
const restored=queue().snapshot();assert.ok(restored.some(c=>c.name==='New Gem'));assert.equal(restored.some(c=>c.name==='Character-only Gem'),false);
console.log('Contribution queue: exact prefix identity, upgraded-item presence, durable Ignore/replay, explicit missing-NPC source proposals, unconfirmed relationships and saved reviewed fields passed.');

const hintValues=new Map(),hintStorage={getItem:key=>hintValues.get(key),setItem:(key,value)=>hintValues.set(key,value)},hintPack={meta:{wikiEntitiesComplete:true},items:[],npcs:[],zones:[]};
let hints=createContributionQueue({storage:hintStorage,getPack:()=>hintPack});
const hinted=hints.add({kind:'item',name:'Deferred Synthetic Gem'},true);
const sources=[{npc:'A Later Guardian',zone:'Synthetic Vale',instance:'normal',confirmed:true}];
hints.update(hinted.id,{title:'Canonical Synthetic Gem',sources,status:'submitted'});
const mobHint={kind:'npc',name:'a later guardian',title:'A_later_guardian',zone:'Synthetic Vale',instance:'normal'};
assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem']);
hints=createContributionQueue({storage:hintStorage,getPack:()=>hintPack});assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem'],'Published item lookup hints survive restart without confirming mob loot');
for(const patch of [{zone:'Other Vale'},{instance:'raid'},{instance:'unknown'},{name:'Other Guardian',title:'Other Guardian'},{kind:'item'}])assert.deepEqual(hints.sourceItemHints({...mobHint,...patch}),[]);
hints.update(hinted.id,{sources:[{...sources[0],confirmed:false,edited:true,sourceEvidence:'explicit-corpse'}]});assert.deepEqual(hints.sourceItemHints(mobHint),[],'An excluded source is not offered as a lookup hint');
hints.update(hinted.id,{sources:[{...sources[0],confirmed:false,sourceEvidence:'recent-kill'}]});assert.deepEqual(hints.sourceItemHints(mobHint),[],'Inferred recent kills are not source hints');
hints.update(hinted.id,{sources:[{...sources[0],confirmed:false,sourceEvidence:'explicit-corpse'}]});assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem']);
const rawHints=JSON.parse([...hintValues.values()][0]);rawHints.archive=[rawHints.candidates[0]];rawHints.candidates=[];hintStorage.setItem('eql-eye-of-zomm-contributions-v1',JSON.stringify(rawHints));
hints=createContributionQueue({storage:hintStorage,getPack:()=>hintPack});assert.deepEqual(hints.sourceItemHints(mobHint),['Canonical Synthetic Gem'],'Archived evidence can supply a lookup hint without re-creating a draft');

{
    const saved=new Map(),local={getItem:key=>saved.get(key),setItem:(key,value)=>saved.set(key,value)},catalog={meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:[],zones:[],titles:[]},items:[],npcs:[],zones:[]};
    let now=Date.now(),queue=createContributionQueue({storage:local,getPack:()=>catalog,now:()=>now});
    const killed=queue.consumeLog({type:'kill',victim:'A synthetic notable guardian'},{live:true,at:now,cursor:1,zone:'Synthetic Vale',logId:'notable-log'}),candidate=killed.candidate;
    assert(killed.prompt?.spawnEvidenceId);assert.equal(candidate.fields.notable,undefined);
    const request={id:'spawn-'+candidate.id,candidateId:candidate.id,name:candidate.name,zone:candidate.zone,spawnEvidenceId:killed.prompt.spawnEvidenceId,previousNotable:null,notable:true};
    for(const patch of [{candidateId:'other'},{id:'spawn-other'},{name:'Other guardian'},{zone:'Other vale'},{spawnEvidenceId:'old'},{notable:'true'}])assert.equal(queue.setNpcNotable({...request,...patch}).ok,false);
    assert.equal(queue.setNpcNotable(request).ok,true);assert.equal(queue.spawnStatus().candidateId,candidate.id,'Choosing notable does not disarm /loc');
    queue=createContributionQueue({storage:local,getPack:()=>catalog,now:()=>now});let restored=queue.snapshot().find(value=>value.id===candidate.id);assert.deepEqual(restored.fields.notable,{value:true,confirmed:true,edited:true,source:'player'},'Explicit Yes survives queue reload');
    assert.equal(queue.setNpcNotable({...request,notable:false}).ok,false,'An old popup state cannot overwrite a newer confirmed choice');
    assert.equal(queue.setNpcNotable({...request,previousNotable:true,notable:false}).ok,true);restored=queue.snapshot().find(value=>value.id===candidate.id);assert.equal(restored.fields.notable.value,false,'No is an explicit saved classification');
    queue.update(candidate.id,{playerText:'Keep my edited notes',fields:{...restored.fields,HP:{value:900,confirmed:true,edited:true}}});assert.equal(queue.setNpcNotable({...request,previousNotable:false,notable:true}).ok,true);restored=queue.snapshot().find(value=>value.id===candidate.id);assert.equal(restored.playerText,'Keep my edited notes');assert.equal(restored.fields.HP.value,900,'The popup preserves other edited fields');
    for(const patch of [{planId:'saved-plan'},{planId:null,status:'partial'},{planId:null,status:'submitted'}]){queue.update(candidate.id,patch);assert.equal(queue.setNpcNotable({...request,previousNotable:true,notable:false}).ok,false,'Saved review and published work cannot be overwritten by a popup');}
    const before=queue.snapshot().find(value=>value.id===candidate.id);assert.equal(before.fields.notable.value,true);
    console.log('Notable choice: explicit Yes/No, unanswered state, exact candidate/evidence guards, durable queue and preserved edited/reviewed work passed.');
}

{
    const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)},getPack=()=>({meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:[],titles:[]},items:[],npcs:[],zones:[]});
    let queue=createContributionQueue({storage,getPack});
    const image=(name,kind='ocr',index=1)=>({id:'image-'+index,kind,owner:'contribution',subject:{kind:'item',name},input:{zone:'Screenshot Invented Zone'},fields:[{key:'hp',value:index},{key:'knownNPCs',value:['Screenshot Invented Mob']}],relations:[{type:'drop-source',name:'Screenshot Invented Mob',zone:'Screenshot Invented Zone',evidence:'explicit-corpse'}]});
    for(const kind of ['ocr','manual','screen-read'])assert.equal(queue.consume(image('Screenshot Only Blade',kind)),null,'Image input must not create a new item, including journal replay');
    assert.equal(queue.snapshot().length,0);
    const item=queue.consume({id:'origin-log',kind:'game-log',owner:'contribution',subject:{kind:'item',name:'Logged Great Blade'},input:{event:'item-link'},fields:[],evidence:{text:'Chat linked Logged Great Blade',logLine:'Synthetic chat link'}});
    for(let index=1;index<=12;index++)assert.equal(queue.consume(image('Logged Great Blade',index%2?'ocr':'manual',index)).id,item.id);
    const updated=queue.snapshot().find(row=>row.id===item.id);assert.equal(updated.fields.hp.value,12);assert.equal(updated.fields.knownNPCs,undefined);assert.deepEqual(updated.sources,[]);assert.deepEqual(updated.relations,[]);assert.equal(updated.evidence.length,6);assert(updated.evidence.some(entry=>entry.kind==='game-log'&&entry.id==='origin-log'));
    assert.equal(queue.snapshot().length,1,'Image-provided zone and corpse references cannot create any related identity');
    queue=createContributionQueue({storage,getPack});assert(queue.snapshot()[0].evidence.some(entry=>entry.kind==='game-log'&&entry.id==='origin-log'),'Original chat/log origin survives image churn and restart');
    assert.equal(queue.consume({...image('Screenshot Mob'),subject:{kind:'monster',name:'Screenshot Mob'}}),null);
    console.log('Image enrichment queue: existing identities only, no derived relationships, bounded durable log origin and restart passed.');
}

{
    const key='eql-eye-of-zomm-contributions-v1',now=Date.UTC(2026,9,25,18);
    const catalog={meta:{wikiEntitiesComplete:true},items:[{name:'Brown Chitin Protector'},{name:'Rubicite Breastplate'}],wikiEntities:{items:['Brown Chitin Protector','Rubicite Breastplate'],npcs:[],titles:[]},npcs:[],zones:[]};
    const legacy=(id,name,patch={})=>({id,kind:'item',name,title:name,zone:'',status:'needs-review',fields:{name:{value:name,confirmed:false},tier:{value:3,confirmed:false}},sources:[],relations:[],evidence:[{id:'log-'+id,kind:'game-log',event:'item-link',text:`Marketvoice tells General:1, '[${name} +3]'`,logLine:`[Sun Oct 25 18:00:00 2026] Marketvoice tells General:1, '[${name} +3]'`}],...patch});
    const free=legacy('old-free','Free Brown Chitin Protector'),sales=legacy('old-sale','WTS FULL SET OF Rubicite Breastplate');
    const preserved=[
        legacy('manual',free.name,{manual:true}),
        legacy('notes',free.name,{playerText:'Keep my work'}),
        legacy('edited',free.name,{fields:{name:{value:free.name,edited:true}}}),
        legacy('confirmed',free.name,{fields:{tier:{value:3,confirmed:true}}}),
        legacy('stats',free.name,{fields:{INT:{value:9,confirmed:false}}}),
        legacy('ocr',free.name,{evidence:[...free.evidence,{kind:'ocr',text:'Observed examine'}]}),
        legacy('attachment',free.name,{attachment:{id:'kept-image'}}),
        legacy('plan',free.name,{planId:'saved-review'}),
        legacy('partial',free.name,{status:'partial'}),
        legacy('submitted',free.name,{status:'submitted',submittedAt:'2026-10-25T17:00:00Z'}),
        legacy('renamed',free.name,{title:'My corrected title'}),
        legacy('loot',free.name,{evidence:[{kind:'game-log',event:'loot',logLine:free.evidence[0].logLine}]}),
        legacy('source',free.name,{sources:[{npc:'A real source',zone:'Synthetic Vale',sourceEvidence:'explicit-corpse'}]}),
        legacy('native',free.name,{evidence:[{kind:'game-log',event:'item-link',text:`Marketvoice tells General:1, ' ${'00007b'+'0'.repeat(50)}${free.name} +3 '`}]}),
        legacy('escaped',free.name,{evidence:[{kind:'game-log',event:'item-link',text:`Marketvoice tells General:1, '\\aITEM 123 0:${free.name} +3\\/a'`}]}),
        legacy('unknown','Free Uncatalogued Protector'),
        legacy('no-evidence',free.name,{evidence:[]}),
        legacy('ambiguous','Brown Chitin Protector and Rubicite Breastplate'),
        legacy('multi-evidence',free.name,{evidence:[...free.evidence,{kind:'game-log',event:'item-link',text:"Marketvoice says, '[Unknown Relic +3]'"}]})
    ];
    const disk=new Map([[key,JSON.stringify({schemaVersion:1,candidates:[free,sales,...preserved]})]]);let fail=false;
    const local={getItem:key=>disk.get(key),setItem:(key,value)=>{if(fail)throw Error('Synthetic save failure');disk.set(key,value);}};
    const options={storage:local,getPack:()=>catalog,now:()=>now,autoReconcile:false};let q=createContributionQueue(options);
    const original=JSON.stringify(q.snapshot()),saved=disk.get(key),dry=q.reconcile();
    for(const id of ['old-free','old-sale']){const row=dry.rows.find(row=>row.id===id);assert.equal(row.action,'archive');assert.equal(row.classification,'chat-caption-covered');}
    for(const candidate of preserved)assert.equal(dry.rows.find(row=>row.id===candidate.id).action,'keep',candidate.id+' must be retained');
    assert.equal(disk.get(key),saved,'Dry runs do not change the saved queue');
    fail=true;assert.equal(q.reconcile({apply:true}).applied,false);assert.equal(JSON.stringify(q.snapshot()),original,'A failed archive save retains all active evidence');assert.equal(q.archived().length,0);fail=false;
    assert.equal(q.reconcile({apply:true}).applied,true);assert.equal(q.snapshot().length,preserved.length);assert.equal(q.archived().length,2);
    for(const old of [free,sales]){const archived=q.archived().find(row=>row.id===old.id);assert.deepEqual(archived.evidence,old.evidence);assert.equal(archived.name,old.name);assert.equal(archived.archive.reason,'chat-caption-covered','The original wrong draft is reversible and never rewritten into a wiki page');}
    const once=disk.get(key);q=createContributionQueue({...options,autoReconcile:true});assert.equal(q.reconcile({apply:true}).changed,false);assert.equal(disk.get(key),once,'Cleanup is durable and restart-idempotent');
    const fullArchive=Array.from({length:200},(_,index)=>({...legacy('archived-'+index,'Archived Unknown '+index),archive:{reason:'old'}}));
    const fullDisk=new Map([[key,JSON.stringify({schemaVersion:1,candidates:[free],archive:fullArchive})]]),full=createContributionQueue({...options,storage:{getItem:key=>fullDisk.get(key),setItem:(key,value)=>fullDisk.set(key,value)}});
    full.reconcile({apply:true});assert.equal(full.archived().length,200);assert.deepEqual(full.snapshot()[0].reasons,[],'A full archive still removes the false gap claim without dropping its record');
    const canonical={...catalog,items:[...catalog.items,{name:free.name}],wikiEntities:{...catalog.wikiEntities,items:[...catalog.wikiEntities.items,free.name]}};
    const genuine=createContributionQueue({...options,getPack:()=>canonical,storage:{getItem:()=>JSON.stringify({schemaVersion:1,candidates:[free]})}});
    assert.notEqual(genuine.reconcile().rows[0].classification,'chat-caption-covered','A full exact catalog title takes priority over its shorter suffix');
    console.log('Legacy chat cleanup: exact procedural matches, reversible untouched-only archive, protected/encoded/ambiguous evidence, save rollback, archive bounds and restart idempotence passed.');
}

{
    const key='eql-eye-of-zomm-contributions-v1',names=['Crimson Robe of Alendine','Efreeti War Axe','Wurmslayer','Brown Chitin Protector'];
    const catalog={meta:{wikiEntitiesComplete:true,sample:false},items:names.map(name=>({name})),wikiEntities:{items:names,npcs:[],titles:names}};
    const legacy=(id,name,patch={})=>({id,kind:'item',name,title:name,zone:'',status:'needs-review',fields:{name:{value:name,confirmed:false}},sources:[],relations:[],evidence:[{id:'log-'+id,kind:'game-log',event:'item-link',logLine:`[Sun Oct 25 18:00:00 2026] Marketvoice tells General:1, '${name}'`}],...patch});
    const caption='FREE Crimson Robe of Alendine Efreeti War Axe',multi=legacy('multi',caption),single=legacy('single','Trading Wurmslayer'),free=legacy('free','Free Brown Chitin Protector');
    const keep=[legacy('reordered','Free Chitin Brown Protector'),legacy('low-coverage','Free many many many many words before Wurmslayer'),legacy('no-cue','Crimson Robe of Alendine Efreeti War Axe'),
        legacy('edited',caption,{playerText:'Keep this reviewed text'}),legacy('ocr',caption,{evidence:[...multi.evidence,{kind:'ocr',text:'Examine evidence'}]}),
        legacy('native',caption,{evidence:[{kind:'game-log',event:'item-link',logLine:`Marketvoice tells General:1, '\x12${'0'.repeat(56)}${caption}\x12'`}]}),
        legacy('old-native',caption,{evidence:[{kind:'game-log',event:'item-link',text:`Marketvoice tells General:1, ' ${'0'.repeat(56)}${caption} '`}]}),
        legacy('escaped',caption,{evidence:[{kind:'game-log',event:'item-link',text:`Marketvoice tells General:1, '\\aITEM 123 0:${caption}\\/a'`}]}),
        legacy('manual',caption,{manual:true}),legacy('loot',caption,{evidence:[{kind:'game-log',event:'loot',logLine:multi.evidence[0].logLine}]}),
        legacy('different-evidence',caption,{evidence:[...multi.evidence,{kind:'game-log',event:'item-link',logLine:"Marketvoice says, 'Crimson Robe of Alendine'"}]})];
    const saved={schemaVersion:1,candidates:[multi,single,free,...keep]},disk=new Map([[key,JSON.stringify(saved)]]);let fails=false;
    const storage={getItem:key=>disk.get(key),setItem:(key,value)=>{if(fails)throw Error('Synthetic storage failure');disk.set(key,value);}};
    const options={storage,getPack:()=>catalog,autoReconcile:false};let queue=createContributionQueue(options);
    const original=JSON.stringify(queue.snapshot()),dry=queue.reconcile();
    for(const candidate of [multi,single,free]){const row=dry.rows.find(row=>row.id===candidate.id);assert.equal(row.action,'archive');assert.equal(row.classification,'chat-trade-caption-covered');}
    for(const candidate of keep)assert.equal(dry.rows.find(row=>row.id===candidate.id).action,'keep',candidate.id);
    fails=true;assert.equal(queue.reconcile({apply:true}).persisted,false);assert.equal(JSON.stringify(queue.snapshot()),original);assert.equal(queue.archived().length,0);fails=false;
    assert(queue.reconcile({apply:true}).persisted);assert.deepEqual(queue.snapshot().map(row=>row.id),keep.map(row=>row.id));
    for(const candidate of [multi,single,free]){const archived=queue.archived().find(row=>row.id===candidate.id);assert.equal(archived.name,candidate.name);assert.deepEqual(archived.evidence,candidate.evidence);assert.equal(archived.archive.reason,'chat-trade-caption-covered');}
    const once=disk.get(key);queue=createContributionQueue({...options,autoReconcile:true});assert.equal(queue.reconcile({apply:true}).changed,false);assert.equal(disk.get(key),once,'Trade cleanup is durable and idempotent');
    const fullArchive=Array.from({length:200},(_,index)=>({...legacy('archived-'+index,'Old Unknown '+index),archive:{reason:'old'}}));
    const fullDisk=new Map([[key,JSON.stringify({schemaVersion:1,candidates:[multi,single],archive:fullArchive})]]),full=createContributionQueue({...options,storage:{getItem:key=>fullDisk.get(key),setItem:(key,value)=>fullDisk.set(key,value)},autoReconcile:true});
    assert.equal(full.archived().length,200);for(const candidate of full.snapshot()){assert.deepEqual(candidate.reasons,[]);assert.equal(candidate.canonicalTitle,null,'Multi-item cleanup never invents one canonical item identity');}
    assert.equal(JSON.parse(fullDisk.get(key)).candidates.length,2,'Full archives preserve rather than discard raw evidence');
    const exactPack={...catalog,items:[...catalog.items,{name:single.name},{name:caption}]};
    const exact=createContributionQueue({getPack:()=>exactPack,storage:{getItem:()=>JSON.stringify({schemaVersion:1,candidates:[single,multi]})},autoReconcile:false});
    assert(exact.reconcile().rows.every(row=>row.classification!=='chat-trade-caption-covered'),'Genuine whole catalog titles are never classified as trade-caption mistakes');
    console.log('Legacy trade cleanup: unranked single/multiple known items, untouched-only reversible archive, protected/encoded provenance, no fabricated canonical title, atomic save failure and full-archive preservation passed.');
}
