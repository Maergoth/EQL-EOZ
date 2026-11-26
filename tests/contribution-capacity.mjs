import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createContributionQueue} from '../app/contribution-queue.js';
import {
    CONTRIBUTION_QUEUE_KEY,
    CONTRIBUTION_QUEUE_BYTES,
    CONTRIBUTION_AUTOMATIC_QUEUE_BYTES,
    CONTRIBUTION_AUTOMATIC_DRAFTS
} from '../app/contribution-evidence.js';

// Exercise the private queue with synthetic records only. No native profile,
// game log, screenshot, account or wiki API is accessed by this regression.
const pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:[],titles:[]},items:[],npcs:[],zones:[]};
const at=Date.UTC(2026,10,26,17);
const bytes=value=>Buffer.byteLength(value,'utf8');
const thumbnail='data:image/png;base64,'+'A'.repeat(199000);
const attachment=index=>({attachmentId:`synthetic-attachment-${index}`,thumbnail,width:32,height:32,bytes:64,caption:'Synthetic fixture',license:'Synthetic fixture'});
const candidate=(index,patch={})=>({
    id:`saved-${index}`,kind:'item',name:`Synthetic capacity relic ${index}`,title:`Synthetic capacity relic ${index}`,
    key:`item|synthetic capacity relic ${index}|`,aliasKeys:[],zone:'',instance:'unknown',era:'',playerText:'',
    fields:{},sources:[],relations:[],evidence:[],status:'needs-review',membership:'missing',
    canonicalTitle:null,revisionId:null,reasons:['missing-page'],intent:'create',...patch
});
const logEvidence=(index,text=`Observed synthetic item link ${index}`)=>({id:`synthetic-log-${index}`,kind:'game-log',capturedAt:new Date(at-100000+index).toISOString(),input:{event:'item-link'},evidence:{text,logLine:text}});
const automaticCandidate=(index,patch={})=>candidate(index,{evidence:[{id:`synthetic-log-${index}`,kind:'game-log',event:'item-link',at:new Date(at-100000+index).toISOString(),text:`Observed synthetic capacity relic ${index}`,logLine:`Synthetic linked item ${index}`}],...patch});
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fixture(candidates=[],catalog=pack,archive=[],options={}){
    const values=new Map();
    if(candidates.length||archive.length)values.set(CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,sequence:candidates.length,cursor:0,candidates,archive}));
    const warnings=[];
    const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
    const mount=()=>createContributionQueue({storage,getPack:()=>catalog,now:()=>at,onWarning:value=>warnings.push(value),autoReconcile:false,...options});
    return {values,warnings,storage,mount};
}
assert.equal(CONTRIBUTION_QUEUE_BYTES,10000000);
assert.equal(CONTRIBUTION_AUTOMATIC_QUEUE_BYTES,8000000);
assert.equal(CONTRIBUTION_AUTOMATIC_DRAFTS,900);

{
    const f=fixture();let queue=f.mount();
    for(let index=0;index<10;index++){
        const draft=queue.add({kind:'item',name:`Synthetic illustrated relic ${index}`},true);
        queue.update(draft.id,{attachment:attachment(index)});
    }
    const saved=f.values.get(CONTRIBUTION_QUEUE_KEY);
    assert(bytes(saved)>1800000,'Ten allowed thumbnails reproduce the previous byte-limit failure');
    assert(bytes(saved)<CONTRIBUTION_QUEUE_BYTES);
    assert.deepEqual(f.warnings,[],'The enlarged budget saves ordinary illustrated drafts without a warning');
    const before=queue.snapshot();queue=f.mount();
    assert.deepEqual(queue.snapshot(),before,'All attachments and authored drafts survive queue restart');
    assert.equal(queue.storageStatus().bytes,bytes(f.values.get(CONTRIBUTION_QUEUE_KEY)));
    assert.equal(queue.storageStatus().limitBytes,CONTRIBUTION_QUEUE_BYTES);
    assert.equal(queue.storageStatus().automaticLimitBytes,CONTRIBUTION_AUTOMATIC_QUEUE_BYTES);
}

{
    const protectedRows=[
        candidate(0,{manual:true,playerText:'Keep my authored notes'}),
        candidate(1,{fields:{hp:{value:42,confirmed:false,edited:true}}}),
        candidate(2,{status:'partial',planId:'unfinished-reviewed-plan'}),
        candidate(3,{attachment:attachment('protected')})
    ];
    const f=fixture([...protectedRows,...Array.from({length:CONTRIBUTION_AUTOMATIC_DRAFTS-protectedRows.length},(_,index)=>candidate(index+protectedRows.length))]);
    let queue=f.mount();const before=queue.snapshot(),saved=f.values.get(CONTRIBUTION_QUEUE_KEY);f.warnings.length=0;
    for(let index=0;index<3;index++)assert.equal(queue.add({kind:'item',name:`Deferred automatic relic ${index}`}),null);
    assert.deepEqual(queue.snapshot(),before,'Count admission preserves existing manual, edited, partial and illustrated work');
    assert.equal(f.values.get(CONTRIBUTION_QUEUE_KEY),saved,'Rejected automatic identities are never committed to the saved queue');
    assert.equal(queue.suppression('item','Deferred automatic relic 0').suppressed,false,'Deferred observations must remain eligible after capacity recovers');
    assert.equal(f.warnings.length,1,'Repeated count admission failures produce one pause notice');
    assert.equal(queue.storageStatus().paused,true);assert.equal(queue.storageStatus().reason,'drafts');
    assert.equal(queue.storageStatus().automaticDraftLimit,CONTRIBUTION_AUTOMATIC_DRAFTS);
    const manual=queue.add({kind:'item',name:'Explicit reserved manual relic'},true);
    assert(manual,'The automatic draft ceiling reserves room for intentional entries');
    queue.update(protectedRows[0].id,{playerText:'Keep these updated notes too'});
    queue=f.mount();
    assert.equal(queue.snapshot().find(row=>row.id===protectedRows[0].id).playerText,'Keep these updated notes too');
    queue.remove(before[4].id);queue.remove(before[5].id);
    assert(queue.add({kind:'item',name:'Automatic relic after room was freed'}),'Automatic admission resumes when there is room');
    assert.equal(queue.snapshot().length,CONTRIBUTION_AUTOMATIC_DRAFTS);
}

{
    // Existing profiles above the new automatic ceiling are preserved intact.
    const existingCount=CONTRIBUTION_AUTOMATIC_DRAFTS+10;
    const f=fixture(Array.from({length:existingCount},(_,index)=>candidate(index)));
    const queue=f.mount();assert.equal(queue.snapshot().length,existingCount);
    const result=queue.consumeLog({type:'kill',victim:'A deferred synthetic guardian'},{live:true,at,cursor:1,zone:'Synthetic Vale',logId:'synthetic-capacity-log'});
    assert.equal(result.candidate,null);assert.equal(result.prompt,null,'A rejected discovery cannot arm a misleading spawn-location request');
    assert.equal(queue.spawnStatus(),null);
    assert.equal(queue.suppression('npc','A deferred synthetic guardian',{zone:'Synthetic Vale'}).suppressed,false);
    assert.equal(queue.snapshot().length,existingCount);
}

{
    const protectedRows=[
        automaticCandidate(0,{manual:true}),
        automaticCandidate(1,{fields:{hp:{value:77,edited:true}}}),
        automaticCandidate(2,{status:'partial',planId:'unfinished-reviewed-plan'}),
        automaticCandidate(3,{attachment:attachment('rollover-protected')}),
        automaticCandidate(4,{matchesReviewed:true}),
        automaticCandidate(5,{spawnRequest:{status:'requested',evidenceId:'pending-location-request'}}),
        automaticCandidate(6,{evidence:[...automaticCandidate(6).evidence,{id:'synthetic-image-origin',kind:'ocr',text:'A reviewed image remains separate evidence'}]}),
        automaticCandidate(7)
    ];
    const original=[...protectedRows,...Array.from({length:CONTRIBUTION_AUTOMATIC_DRAFTS-protectedRows.length},(_,index)=>automaticCandidate(index+protectedRows.length))];
    const f=fixture(original,pack,[],{isDraftInUse:id=>id==='saved-7'}),queue=f.mount(),before=queue.snapshot();
    const incoming=queue.add({kind:'item',name:'A newest synthetic rollover relic',evidence:logEvidence(1000)});assert(incoming,'A full automatic queue admits a newer real log discovery');
    const after=queue.snapshot(),removed=before[protectedRows.length];
    assert.equal(after.length,CONTRIBUTION_AUTOMATIC_DRAFTS);
    assert(!after.some(row=>row.id===removed.id),'The oldest untouched log-origin suggestion rolls off first');
    for(const old of protectedRows)assert.equal(digest(after.find(row=>row.id===old.id)),digest(before.find(row=>row.id===old.id)),`Older protected record ${old.id} survives rollover intact`);
    assert.equal(digest(after.filter(row=>row.id!==incoming.id)),digest(before.filter(row=>row.id!==removed.id)),'Only the selected oldest disposable record changes');
    assert.equal(queue.archived().length,0,'Count rollover releases storage rather than moving obsolete data into the same archive budget');
    assert.equal(queue.suppression('item',removed.name).suppressed,false,'A rolled-off discovery is not permanently ignored or falsely queued');
    assert.equal(queue.storageStatus().evictedDiscoveries,1);
    assert.equal(queue.storageStatus().paused,false);assert.equal(queue.storageStatus().unsaved,false);assert.deepEqual(f.warnings,[],'Successful automatic rollover produces no hard-error or pause warning');
    const saved=f.mount().snapshot();assert.equal(digest(saved),digest(after),'The new discovery and exact rollover survive restart');
    assert(queue.add({kind:'item',name:'A second newest synthetic rollover relic',evidence:logEvidence(1003)}));
    assert.equal(queue.storageStatus().evictedDiscoveries,2,'The session counter adds only successfully committed rollover removals');
}

{
    const original=Array.from({length:225},(_,index)=>automaticCandidate(index,{evidence:Array.from({length:6},(_,proof)=>({id:`large-log-${index}-${proof}`,kind:'game-log',event:'item-link',at:new Date(at-100000+index).toISOString(),text:'x'.repeat(6000),logLine:`Synthetic item link ${index}`}))}));
    const f=fixture(original),queue=f.mount(),before=queue.snapshot();assert(queue.storageStatus().bytes>CONTRIBUTION_AUTOMATIC_QUEUE_BYTES);
    const incoming=queue.add({kind:'item',name:'A newest byte-budget rollover relic',evidence:logEvidence(1001)});assert(incoming,'Byte pressure admits new facts by removing oldest untouched automatic suggestions');
    const after=queue.snapshot(),retained=after.filter(row=>row.id!==incoming.id),evicted=before.length-retained.length;
    assert(evicted>0);assert.equal(digest(retained),digest(before.slice(evicted)),'Byte rollover removes only the oldest insertion-order prefix');
    assert(queue.storageStatus().bytes<=CONTRIBUTION_AUTOMATIC_QUEUE_BYTES,'Rollover restores the automatic byte budget and preserves the manual reserve');
    assert.equal(queue.storageStatus().evictedDiscoveries,evicted);
    assert.equal(queue.archived().length,0);assert.deepEqual(f.warnings,[]);
}

{
    const original=Array.from({length:CONTRIBUTION_AUTOMATIC_DRAFTS},(_,index)=>automaticCandidate(index));
    const f=fixture(original),queue=f.mount(),before=queue.snapshot(),saved=f.values.get(CONTRIBUTION_QUEUE_KEY);f.warnings.length=0;
    const store=f.storage.setItem;let failure=true;
    f.storage.setItem=(key,value)=>{if(failure)throw Error('Synthetic rollover write failure');store(key,value);};
    const input={kind:'item',name:'A transactionally admitted rollover relic',evidence:logEvidence(1002)};
    assert.equal(queue.add(input),null,'An incoming discovery cannot evict saved evidence before its replacement writes successfully');
    assert.equal(digest(queue.snapshot()),digest(before),'Failed replacement persistence preserves every old candidate');
    assert.equal(f.values.get(CONTRIBUTION_QUEUE_KEY),saved,'Failed rollover keeps the exact old durable queue');
    assert.equal(queue.storageStatus().evictedDiscoveries,0,'Failed speculative eviction does not increment the successful session counter');
    assert.equal(queue.suppression('item',input.name).suppressed,false);
    assert.equal(queue.suppression('item',before[0].name).candidateId,before[0].id);
    failure=false;
    const admitted=queue.add(input);assert(admitted);assert.equal(admitted.id,`contribution-${CONTRIBUTION_AUTOMATIC_DRAFTS+1}`,'Failed rollover leaves sequence unchanged');
    assert.equal(queue.storageStatus().evictedDiscoveries,1);
    assert.equal(queue.suppression('item',before[0].name).suppressed,false);
    assert.equal(queue.snapshot().some(row=>row.id===before[0].id),false);
}

{
    const covered=candidate(0,{name:'Already Covered Relic',title:'Already Covered Relic',key:'item|already covered relic|'});
    const catalog={...pack,items:[{name:covered.name}],wikiEntities:{items:[covered.name],npcs:[],titles:[covered.name]}};
    for(const completed of [false,true]){
        const retired=completed?candidate(0,{status:'submitted',planId:'completed-reviewed-plan',playerText:'Retain my completed work'}):covered;
        const f=fixture([retired,...Array.from({length:CONTRIBUTION_AUTOMATIC_DRAFTS-1},(_,index)=>candidate(index+1))],catalog);
        const queue=f.mount(),before=queue.snapshot()[0];
        assert.equal(queue.archived().length,0,'This fixture leaves capacity processing to automatic admission');
        const admitted=queue.add({kind:'item',name:`New discovery after ${completed?'completed':'covered'} work retired`});
        assert(admitted,'Automatic admission processes safe completed/covered work before asking the user to clear space');
        assert.equal(queue.snapshot().length,CONTRIBUTION_AUTOMATIC_DRAFTS);
        const archived=queue.archived().find(row=>row.id===before.id);assert(archived);
        const {archive,...preserved}=archived;assert.deepEqual(preserved,before,'Capacity processing archives the full original record without deleting its evidence or authored text');
        assert.deepEqual(f.warnings,[],'Successful automatic retirement needs no capacity warning');
    }
}

{
    // Forty-one schema-valid large thumbnails fill the automatic budget while
    // leaving the reserved space available to the contributor's own changes.
    const f=fixture(Array.from({length:41},(_,index)=>candidate(index,{manual:true,attachment:attachment(index)})));
    let queue=f.mount();const before=queue.snapshot();f.warnings.length=0;
    assert(queue.storageStatus().bytes>CONTRIBUTION_AUTOMATIC_QUEUE_BYTES);
    assert(queue.storageStatus().bytes<CONTRIBUTION_QUEUE_BYTES);
    for(let index=0;index<3;index++)assert.equal(queue.add({kind:'item',name:'Synthetic capacity relic 0',fields:{hp:900+index}}),null);
    assert.deepEqual(queue.snapshot(),before,'Automatic enrichment cannot consume the manual reserve or mutate rejected fields');
    assert.equal(f.warnings.length,1,'Repeated automatic byte admission failures do not create a notification storm');
    assert.equal(queue.storageStatus().reason,'bytes');
    const manual=queue.add({kind:'item',name:'Manual addition in reserved storage'},true);assert(manual);
    queue.update(before[0].id,{playerText:'An intentional edit still saves with automatic capture paused.'});
    assert.equal(queue.consume({id:'reserved-ocr',kind:'ocr',owner:'contribution',subject:{kind:'item',name:before[1].name},input:{},fields:[{key:'hp',value:123}],evidence:{text:'Synthetic observed HP 123'}}).id,before[1].id,'Explicit image enrichment can use reserved space');
    const edited=queue.snapshot();queue=f.mount();
    assert.deepEqual(queue.snapshot(),edited,'Reserved-space changes and screenshots remain durable');
    assert.equal(queue.snapshot().find(row=>row.id===before[0].id).playerText,'An intentional edit still saves with automatic capture paused.');
    assert.equal(queue.snapshot().find(row=>row.id===before[1].id).fields.hp.value,123);
    for(const row of before.slice(0,3))queue.remove(row.id);
    assert(queue.add({kind:'item',name:'Automatic relic after bytes were freed'}),'Automatic byte admission resumes after explicit cleanup');
}

{
    const sources=Array.from({length:105},(_,index)=>({npc:`A saved synthetic guardian ${index}`,zone:'Synthetic Vale',instance:'normal',sourceEvidence:'explicit-corpse',confirmed:index===0}));
    const f=fixture([candidate(0,{sources})]),queue=f.mount();const before=queue.snapshot()[0];f.warnings.length=0;
    const relation={type:'drop-source',name:'A newly observed synthetic guardian',zone:'Synthetic Vale',instance:'normal',evidence:'explicit-corpse'};
    for(let index=0;index<3;index++)assert.equal(queue.add({kind:'item',name:before.name,relations:[relation]}),null);
    assert.deepEqual(queue.snapshot()[0],before,'The new automatic source bound preserves all historical sources and other draft data');
    assert.equal(queue.snapshot()[0].sources.length,105,'Loading a legacy source list never truncates it to the new bound');
    assert.equal(f.warnings.length,1,'Repeated distinct-source overflow produces one pause notice');
    const known={...relation,name:sources[0].npc};
    assert(queue.add({kind:'item',name:before.name,relations:[known]}),'Repeated known sources still accept bounded supporting evidence');
    assert.equal(queue.snapshot()[0].sources.length,105);
}

{
    const relations=Array.from({length:100},(_,index)=>({type:'zone-population',name:`A synthetic relation guardian ${index}`,zone:'Synthetic Vale',instance:'normal',evidence:'kill',confirmed:false,edited:index===0}));
    const extra={type:'zone-population',name:'A newly observed relation guardian',zone:'Synthetic Vale',instance:'normal',evidence:'kill'};
    const f=fixture([candidate(0,{relations})]),queue=f.mount();
    assert(queue.add({kind:'item',name:'Synthetic capacity relic 0',relations:[extra]}));
    assert(queue.snapshot()[0].relations.some(row=>row.name===relations[0].name&&row.edited===true),'Automatic relation turnover never evicts an edited unconfirmed relation');
    assert.equal(queue.snapshot()[0].relations.length,100);
    const protectedRelations=relations.map(row=>({...row,edited:true}));
    queue.update('saved-0',{relations:protectedRelations});
    queue.add({kind:'item',name:'Synthetic capacity relic 0',relations:[extra]});
    assert.equal(digest(queue.snapshot()[0].relations),digest(protectedRelations),'A full protected relation list remains intact when another relation is observed');
}

{
    const f=fixture();let failure=new Error('Synthetic unavailable storage');
    f.storage.setItem=(key,value)=>{if(failure)throw failure;f.values.set(key,value);};
    const queue=f.mount(),draft=queue.add({kind:'item',name:'A local unsaved synthetic relic'},true);
    queue.update(draft.id,{playerText:'First unsaved edit'});queue.update(draft.id,{playerText:'Second unsaved edit'});
    assert.equal(f.warnings.length,1,'A failing storage backend produces one warning until recovery');
    assert.match(f.warnings[0],/storage|could not be saved|unavailable/i);
    assert.doesNotMatch(f.warnings[0],/queue is full|10\s?MB/i,'An I/O exception is not described as the queue byte limit');
    failure=null;queue.update(draft.id,{playerText:'Saved after recovery'});
    const durable=f.values.get(CONTRIBUTION_QUEUE_KEY);assert(durable);
    failure=Object.assign(new Error('Synthetic browser quota'),{name:'QuotaExceededError'});
    queue.update(draft.id,{playerText:'New unsaved quota edit'});queue.update(draft.id,{playerText:'Still unsaved'});
    assert.equal(f.warnings.length,2,'Successful saving resets warning suppression for a later failure');
    assert.match(f.warnings[1],/quota|browser.*full|browser.*space/i,'Browser quota has a specific recoverable explanation');
    assert.equal(f.values.get(CONTRIBUTION_QUEUE_KEY),durable,'Failed writes preserve the last saved bytes');
    assert.equal(queue.snapshot().find(row=>row.id===draft.id).playerText,'Still unsaved','A storage failure keeps authored edits available in memory');
}

{
    const f=fixture([candidate(0)]),queue=f.mount(),before=queue.snapshot(),saved=f.values.get(CONTRIBUTION_QUEUE_KEY);f.warnings.length=0;
    const store=f.storage.setItem;let failure=true;
    f.storage.setItem=(key,value)=>{if(failure)throw Object.assign(new Error('Synthetic automatic quota failure'),{name:'QuotaExceededError'});store(key,value);};
    assert.equal(queue.add({kind:'item',name:'A synthetic automatically deferred relic'}),null,'A failed automatic write never admits an unsaved discovery');
    assert.equal(queue.add({kind:'item',name:before[0].name,fields:{hp:999}}),null,'A failed automatic enrichment leaves the saved draft unchanged');
    assert.equal(digest(queue.snapshot()),digest(before),'Automatic I/O failures roll back candidate changes');
    assert.equal(f.values.get(CONTRIBUTION_QUEUE_KEY),saved,'Automatic I/O failures keep the exact previous durable queue');
    assert.equal(queue.suppression('item','A synthetic automatically deferred relic').suppressed,false,'A failed automatic write must not leave a queued registry entry');
    assert.equal(f.warnings.length,1,'Automatic storage failures are deduplicated across new and existing drafts');
    assert.match(f.warnings[0],/storage|quota/i);
    failure=false;
    const admitted=queue.add({kind:'item',name:'A synthetic automatically deferred relic'});
    assert(admitted);assert.equal(admitted.id,'contribution-2','A failed automatic write does not consume the saved sequence');
    assert.equal(f.mount().snapshot().find(row=>row.id===admitted.id).name,admitted.name,'Deferred work can save normally after storage recovers');
}

for(const failureKind of ['quota','storage']){
    const f=fixture([candidate(0)]),queue=f.mount(),before=queue.snapshot(),saved=f.values.get(CONTRIBUTION_QUEUE_KEY);f.warnings.length=0;
    const store=f.storage.setItem;let failing=true;
    f.storage.setItem=(key,value)=>{
        if(failing)throw Object.assign(new Error('Synthetic automatic backend failure'),failureKind==='quota'?{name:'QuotaExceededError'}:{});
        store(key,value);
    };
    for(let index=0;index<3;index++){
        assert.equal(queue.consume({id:`failed-${failureKind}-item-${index}`,sequence:index+1,kind:'game-log',owner:'contribution',subject:{kind:'item',name:`Deferred synthetic linked relic ${index}`},input:{event:'item-link'},fields:[]}),null);
        const result=queue.consumeLog({type:'kill',victim:`A deferred synthetic backend guardian ${index}`},{live:true,at,cursor:10+index,zone:'Synthetic Vale',logId:`synthetic-${failureKind}-backend-log`});
        assert.equal(result.candidate,null);assert.equal(result.prompt,null);
    }
    const location=queue.consumeLog({type:'location',location:{x:1,y:2,z:3}},{live:true,at,cursor:100,zone:'Synthetic Vale',logId:`synthetic-${failureKind}-backend-log`});
    assert.equal(location.locationCaptured,null);
    assert.equal(digest(queue.snapshot()),digest(before),`Failed ${failureKind} discovery consumption preserves all accepted drafts`);
    assert.equal(f.values.get(CONTRIBUTION_QUEUE_KEY),saved,`Failed ${failureKind} metadata saves retain exact durable state`);
    assert.equal(f.warnings.length,1,`Mixed item, kill, zone and idle location saves share one automatic ${failureKind} warning`);
    const status=queue.storageStatus();assert.equal(status.paused,true);assert.equal(status.reason,failureKind);
    assert.equal(status.unsaved,false,'Rejected automatic observations are distinguished from unsaved authored changes');
    failing=false;
    assert.equal(queue.process().persisted,true,'Processing retries backend storage even when accepted drafts did not change');
    assert.equal(queue.storageStatus().paused,false);assert.equal(queue.storageStatus().unsaved,false);
    assert(queue.consume({id:`recovered-${failureKind}-item`,sequence:1000,kind:'game-log',owner:'contribution',subject:{kind:'item',name:`Recovered synthetic ${failureKind} relic`},input:{event:'item-link'},fields:[]}),`Automatic ${failureKind} consumption resumes when storage recovers`);
}

{
    const f=fixture(Array.from({length:50},(_,index)=>candidate(index,{manual:true,attachment:attachment(index)})));
    const queue=f.mount(),saved=f.values.get(CONTRIBUTION_QUEUE_KEY);assert(bytes(saved)<CONTRIBUTION_QUEUE_BYTES);f.warnings.length=0;
    const fields=Object.fromEntries(Array.from({length:80},(_,index)=>[`boundedField${index}`,{value:'x'.repeat(16000),edited:true,confirmed:false}]));
    queue.update('saved-0',{fields});queue.update('saved-0',{fields});
    assert.equal(f.values.get(CONTRIBUTION_QUEUE_KEY),saved,'The final hard bound still prevents oversized disk entries');
    assert.equal(f.warnings.length,1);assert.match(f.warnings[0],/10\s?MB|10,000,000/i,'A hard byte failure names the actual limit');
    assert.equal(queue.snapshot()[0].fields.boundedField0.value.length,16000,'Manual overflow remains recoverable in memory');
}

{
    const day=86400000;
    const history=(index,patch={})=>candidate(index,{archive:{version:1,reason:'known-complete',at:new Date(at-day+index*1000).toISOString()},...patch});
    const old={version:1,reason:'known-complete',at:new Date(at-45*day).toISOString()};
    const protectedHistory=[
        history(2000,{manual:true,archive:old}),
        history(2001,{playerText:'Retain my authored history',archive:old}),
        history(2002,{fields:{hp:{value:77,edited:true,confirmed:false}},archive:old}),
        history(2003,{matchesReviewed:true,archive:old}),
        history(2004,{reviewed:true,archive:old}),
        history(2005,{status:'submitted',planId:'completed-plan',archive:old}),
        history(2006,{status:'partial',planId:'unfinished-plan',archive:old}),
        history(2007,{attachment:attachment('old-history'),archive:old}),
        history(2008,{spawnRequest:{status:'captured',evidenceId:'captured-location'},archive:old}),
        history(2009,{sources:[{npc:'A confirmed guardian',zone:'Synthetic Vale',confirmed:true}],archive:old}),
        history(2010,{sources:[{npc:'An edited guardian',zone:'Synthetic Vale',edited:true}],archive:old}),
        history(2011,{relations:[{type:'spawn-location',name:'A located guardian',zone:'Synthetic Vale',location:{x:1,y:2,z:3}}],archive:old}),
        history(2012,{relations:[{type:'drop-source',name:'An edited historical guardian',zone:'Synthetic Vale',edited:true}],archive:old})
    ];
    const disposable=Array.from({length:220},(_,index)=>history(3000+index));
    const expired=history(4000,{archive:old});
    const active=[candidate(0),candidate(1,{fields:{notes:{value:'Retain my unresolved edit',edited:true}}}),candidate(2,{status:'partial',planId:'active-unfinished-plan'})];
    const f=fixture(active,pack,[expired,...protectedHistory,...disposable.slice().reverse()]);
    let queue=f.mount();const before=queue.snapshot(),result=queue.process();assert.equal(result.persisted,true);
    assert.equal(digest(queue.snapshot()),digest(before),'Processing never purges active unresolved, edited or partial work');
    const archived=queue.archived(),protectedIds=new Set(protectedHistory.map(row=>row.id));
    for(const original of protectedHistory){
        const retained=archived.find(row=>row.id===original.id);assert(retained,`Protected history ${original.id} survives retention`);
        assert.equal(digest(retained),digest(original),`Protected history ${original.id} stays complete, including original evidence and age`);
    }
    const automatic=archived.filter(row=>!protectedIds.has(row.id));
    assert.equal(automatic.length,200,'Only the newest 200 disposable automatic records are retained');
    assert.deepEqual(automatic.map(row=>row.id).sort(),disposable.slice(-200).map(row=>row.id).sort(),'History timestamps select newest records even when saved array order differs');
    assert(!archived.some(row=>row.id===expired.id),'Expired automatic history is removed');
    assert.equal(result.retiredHistory,21);
    const saved=queue.archived();queue=f.mount();assert.equal(digest(queue.archived()),digest(saved),'History retention and protected records survive restart');
}

{
    const evidence=Array.from({length:6},(_,index)=>({id:`synthetic-proof-${index}`,kind:'game-log',text:'x'.repeat(6000)}));
    const history=Array.from({length:120},(_,index)=>candidate(5000+index,{evidence,archive:{version:1,reason:'known-complete',at:new Date(at-120000+index*1000).toISOString()}}));
    const f=fixture([],pack,history),queue=f.mount(),result=queue.process();assert.equal(result.persisted,true);
    const kept=queue.archived(),retainedBytes=bytes(JSON.stringify(kept));
    assert(kept.length>0&&kept.length<200&&kept.length<history.length,'The byte budget applies before the record count budget');
    assert(retainedBytes<=2000000,`Disposable history is bounded to 2 MB (observed ${retainedBytes})`);
    assert.deepEqual(kept.map(row=>row.id),history.slice(-kept.length).map(row=>row.id),'Byte retention favors newest automatic history');
    assert.equal(result.retiredHistory,history.length-kept.length);
}

{
    const cutoff=at-30*86400000;
    const history=[
        candidate(6000,{archive:{version:1,reason:'known-complete',at:new Date(cutoff-1).toISOString()}}),
        candidate(6001,{archive:{version:1,reason:'known-complete',at:new Date(cutoff).toISOString()}}),
        candidate(6002,{archive:{version:1,reason:'known-complete',at:new Date(at).toISOString()}})
    ];
    const f=fixture([],pack,history),queue=f.mount(),result=queue.process();
    assert.equal(result.persisted,true);assert.equal(result.retiredHistory,1);
    assert.deepEqual(queue.archived().map(row=>row.id),['saved-6001','saved-6002'],'Only automatic history older than 30 days expires at the boundary');
}

{
    const completed=candidate(7000,{status:'submitted',manual:true,playerText:'Published authored text',archive:{reason:'submitted',at:new Date(at).toISOString()}});
    const partial=candidate(7001,{status:'partial',planId:'unfinished-review',archive:{reason:'old',at:new Date(at).toISOString()}});
    const f=fixture([candidate(7002,{manual:true})],pack,[completed,partial]),queue=f.mount(),before=digest({active:queue.snapshot(),archive:queue.archived()}),saved=f.values.get(CONTRIBUTION_QUEUE_KEY);
    assert.equal(queue.storageStatus().completedHistory,1);
    const write=f.storage.setItem;f.storage.setItem=()=>{throw Error('Synthetic storage unavailable');};
    assert.deepEqual(queue.clearCompletedHistory(),{persisted:false,removed:0});
    assert.equal(digest({active:queue.snapshot(),archive:queue.archived()}),before,'A failed explicit history clear rolls back all local records');
    assert.equal(f.values.get(CONTRIBUTION_QUEUE_KEY),saved);
    f.storage.setItem=write;assert.deepEqual(queue.clearCompletedHistory(),{persisted:true,removed:1});
    assert.deepEqual(queue.archived(),[partial],'Explicit history clearing removes completed copies only');assert.equal(queue.snapshot()[0].id,'saved-7002');
    assert.equal(f.mount().storageStatus().completedHistory,0,'Confirmed removal survives restart');
}

console.log('Contribution capacity: durable screenshots, reserved manual/OCR space, automatic byte/count/source admission, safe processing, bounded automatic history, protected records and specific deduplicated save failures passed.');
