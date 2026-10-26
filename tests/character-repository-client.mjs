import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createCharacterRepositoryClient} from '../app/character-repository-client.js';
import {createCharacterModel,CHARACTER_STORAGE_KEY,characterEquipmentEligibility} from '../app/character-model.js';

const copy=value=>structuredClone(value),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const templateModel=createCharacterModel({storage:null,now:()=>100});
const template=templateModel.intake({item:{name:'Synthetic sword',wikiTitle:'Synthetic sword',catalogIdentity:{name:'Synthetic sword',wikiTitle:'Synthetic sword'},slots:['PRIMARY'],tier:0,stats:{HP:1}}}).candidate;
const initial=templateModel.snapshot();initial.candidates=[];initial.equipment={};initial.metadata={...initial.metadata,name:'Synthetic',server:'Test'};
initial.observationRefs=[{sessionId:'old',observationId:'unloaded',candidateId:'row-9999',sequence:1}];
const card=index=>({...copy(template),id:`row-${index}`,name:`Synthetic sword ${index}`,wikiTitle:`Synthetic sword ${index}`,catalogIdentity:{name:`Synthetic sword ${index}`,wikiTitle:`Synthetic sword ${index}`,match:'exact'},notes:`Physical copy ${index}`});
export function fixture({count=10020,nativeFlow=null}={}){
    const rows=new Map(Array.from({length:count},(_,index)=>[`row-${index}`,card(index)]));
    let core=copy(initial),flow=copy(nativeFlow),revision=1,generation=1,callback=()=>{},hold=null,rejectNext=false,readHold=null;
    core.equipment={primary:'row-0'};core.pendingEquipment={any1:'row-1'};
    // Pending recovery is a known physical row whose catalog identity is absent.
    rows.get('row-1').catalogIdentity=null;rows.get('row-1').wikiMatch='unmatched';
    const calls=[];
    const snapshot=()=>({ok:true,profileId:'one',revision,generation,core:copy(core),flow:copy(flow),counts:{total:rows.size,candidates:rows.size,equipped:1,loose:rows.size-1,keyring:0,rejected:0}});
    const api={
        bootstrap:async()=>({ok:true,activeProfileId:'one',profiles:[{id:'one',name:'Synthetic',server:'Test'}]}),
        getCore:async()=>snapshot(),flush:async()=>({ok:true}),onProgress:fn=>(callback=fn,()=>{}),
        list:async request=>{calls.push(['list',copy(request)]);if(readHold)await readHold;
            const all=request.scope==='equipped'?[rows.get('row-0'),rows.get('row-1')]:[...rows.values()].filter(row=>row.id!==core.equipment.primary);
            const offset=Number(request.cursor||0),items=all.slice(offset,offset+request.limit).map(copy);
            return {...snapshot(),items,kinds:Object.fromEntries(items.map(item=>[item.id,'card'])),nextCursor:offset+items.length<all.length?String(offset+items.length):null};},
        get:async({id})=>({...snapshot(),item:copy(rows.get(id)),kind:'card'}),
        transaction:async request=>{calls.push(['transaction',copy(request)]);if(hold)await hold;
            if(rejectNext){rejectNext=false;return {ok:false,error:'Synthetic disk failure'};}
            assert.equal(request.expectedRevision,revision);if(request.clearInventory)rows.clear();
            for(const item of request.upserts||[])rows.set(item.id,copy(item));
            for(const {id,patch}of request.updates||[])rows.set(id,{...rows.get(id),...copy(patch)});
            for(const {id,sourceId,patch}of request.duplicates||[])rows.set(id,{...copy(rows.get(sourceId)),...copy(patch),id});
            for(const id of request.removes||[])rows.delete(id);
            core=copy(request.core);if(Object.hasOwn(request,'flow'))flow=copy(request.flow);revision++;generation++;return snapshot();},
        selectProfile:async({profileId})=>({...snapshot(),profileId}),
        importFiles:async request=>{calls.push(['importFiles',copy(request)]);queueMicrotask(()=>callback({...snapshot(),jobId:'import-one',state:'complete'}));return {ok:true,jobId:'import-one'};},cancelImport:async()=>({ok:true})
    };
    return {api,calls,rows,emit:event=>callback(event),get core(){return core;},get flow(){return flow;},block(){let release;hold=new Promise(resolve=>{release=resolve;});return()=>{hold=null;release();};},reject(){rejectNext=true;},blockRead(){let release;readHold=new Promise(resolve=>{release=resolve;});return()=>{readHold=null;release();};}};
}

{
    const f=fixture(),client=createCharacterRepositoryClient({api:f.api});await client.start();
    assert.equal(client.counts.candidates,10020);assert.equal(client.model().snapshot().candidates.length,2);
    assert.equal(client.model().snapshot().pendingEquipment.any1,'row-1');
    assert.equal(client.model().snapshot().observationRefs[0].candidateId,'row-9999','unloaded reference is not a deletion');
    const first=await client.queryPage({limit:50});assert.equal(first.items.length,50);assert(client.model().snapshot().candidates.length<=52);
    await client.selectItem('row-9000');await client.queryPage({cursor:first.nextCursor,limit:50});
    assert(client.model().snapshot().candidates.some(item=>item.id==='row-9000'));assert(client.model().snapshot().candidates.length<=53);
    const result=client.model().updateCandidate('row-9000',{notes:'Deliberate private edit'});assert.equal(result.saved,false);assert.equal(result.pending,true);
    await client.flush();assert.equal(f.rows.get('row-9000').notes,'Deliberate private edit');assert.equal(f.rows.size,10020);
    const tx=f.calls.filter(call=>call[0]==='transaction').at(-1)[1];assert.equal(tx.updates.length,1);assert.equal(tx.upserts.length,0);assert(!('candidates'in tx.core));
    assert(!('candidateIds'in(tx.core.inventoryExport||{})));client.dispose();
}
{
    const f=fixture({count:10,nativeFlow:{schemaVersion:1,flowVersion:2,step:'details',active:false,legacy:{unchangedPrivateHistory:['original']},privateRecovery:{backup:'flow-backup',verified:true}}});
    const proofFile={name:'Synthetic-Inventory.txt',bytes:23,modifiedAt:1,sha256:'a'.repeat(64),backupName:'private-backup-token',backupVerified:true,privateRecovery:{sha256:'b'.repeat(64)}};
    f.core.inventoryExport={schemaVersion:1,importedAt:1,file:copy(proofFile),rowCount:23,equipmentSlotCount:23,emptyEquipmentCount:0,inventoryCount:0,privateManifest:{verified:true}};
    f.core.statSnapshots.privateProof={untouched:true};f.core.statSnapshots.base={stats:{HP:100},confirmed:true,at:2,privateProof:{source:'original-base'},unknownLegacyField:['retained']};f.core.statSnapshots.equipped={stats:{HP:200},confirmed:true,at:3,privateProof:{source:'original-equipped'}};f.core.statSnapshots.current={stats:{HP:300},confirmed:true,at:4,privateProof:{source:'old-current'}};f.core.metadata.privateIdentity={createdBy:'legacy'};
    const originalBase=copy(f.core.statSnapshots.base),originalEquipped=copy(f.core.statSnapshots.equipped);
    const originalExport=copy(f.core.inventoryExport),originalFlow=copy(f.flow),client=createCharacterRepositoryClient({api:f.api});await client.start();await client.queryPage();
    client.model().setTierPreview('row-2',{tier:3});await client.flush();
    assert.deepEqual(f.core.inventoryExport,originalExport,'Unrelated tier edit retains every native file/backup field');assert.deepEqual(f.flow,originalFlow,'An item edit does not normalize or create workflow data');
    client.walkthrough().begin();client.walkthrough().source('synthetic-reader');await client.flush();
    assert.deepEqual(f.core.inventoryExport,originalExport);assert.deepEqual(f.core.statSnapshots.privateProof,{untouched:true});assert.deepEqual(f.flow.privateRecovery,originalFlow.privateRecovery);assert.deepEqual(f.flow.legacy,originalFlow.legacy);assert.equal(f.flow.sourceId,'synthetic-reader');
    client.model().setMetadata({race:'Updated race'});await client.flush();assert.deepEqual(f.core.metadata.privateIdentity,{createdBy:'legacy'});assert.equal(f.core.metadata.race,'Updated race');
    client.model().setStatSnapshot('current',{stats:{HP:4321},confirmed:true,at:5});await client.flush();
    assert.deepEqual(f.core.statSnapshots.base,originalBase);assert.deepEqual(f.core.statSnapshots.equipped,originalEquipped);assert.deepEqual(f.core.statSnapshots.privateProof,{untouched:true});assert.equal(f.core.statSnapshots.current.stats.HP,4321);assert(!Object.hasOwn(f.core.statSnapshots.current,'privateProof'),'A deliberately replaced current reading does not retain stale provenance');
    const restarted=createCharacterRepositoryClient({api:f.api});await restarted.start();restarted.walkthrough().source('second-reader');await restarted.flush();assert.deepEqual(f.core.inventoryExport,originalExport);assert.deepEqual(f.flow.privateRecovery,originalFlow.privateRecovery);restarted.dispose();client.dispose();
}
{
    const f=fixture({count:10}),warnings=[],client=createCharacterRepositoryClient({api:f.api,onWarning:value=>warnings.push(value)});await client.start();await client.queryPage();
    const release=f.block();client.model().updateCandidate('row-2',{notes:'ACK A'});await tick();
    client.model().updateCandidate('row-2',{notes:'Pending B'});
    assert.equal(client.model().snapshot().candidates.find(item=>item.id==='row-2').notes,'Pending B');
    release();await client.flush();assert.equal(f.rows.get('row-2').notes,'Pending B');assert.equal(f.calls.filter(call=>call[0]==='transaction').length,2);
    client.model().updateCandidate('row-2',{notes:'ACK C'});await client.flush();
    f.reject();client.model().updateCandidate('row-2',{notes:'Failed D'});await assert.rejects(client.flush(),/Synthetic disk failure/);
    assert.equal(client.model().snapshot().candidates.find(item=>item.id==='row-2').notes,'ACK C');assert.equal(f.rows.get('row-2').notes,'ACK C');assert.equal(warnings.length,1);
    await client.drainForClose();assert.equal(f.rows.get('row-2').notes,'ACK C');assert.equal(client.model().setMetadata({race:'Must not stage while closing'}).ok,false);client.resumeAfterCloseDrain();
    await client.retry();assert.equal(client.status.error,'');client.dispose();
}
{
    const f=fixture({count:10});f.api.bootstrap=async()=>({ok:false,error:'Malformed legacy source preserved'});
    const client=createCharacterRepositoryClient({api:f.api});await assert.rejects(client.start(),/Malformed legacy/);await assert.rejects(client.flush(),/Malformed legacy/);await client.drainForClose();assert.equal(f.rows.size,10);assert(!f.calls.some(call=>call[0]==='transaction'));client.dispose();
}
{
    const f=fixture({count:10020}),client=createCharacterRepositoryClient({api:f.api});await client.start();await client.queryPage();
    client.model().clearInventory();await client.flush();assert.equal(f.rows.size,0,'clear is native whole-profile, not visible page');
    assert.equal(f.calls.find(call=>call[0]==='transaction')[1].clearInventory,true);client.dispose();
}
{
    const f=fixture({count:100}),client=createCharacterRepositoryClient({api:f.api});await client.start();
    const release=f.blockRead(),abort=new AbortController(),pending=client.queryPage({signal:abort.signal});await tick();abort.abort();release();
    await assert.rejects(pending,/no longer current/);assert.equal(client.page,null);client.dispose();
}
for(const method of ['page','selected']){
    const f=fixture({count:100}),client=createCharacterRepositoryClient({api:f.api});await client.start();await client.queryPage();
    let release;const blocked=new Promise(resolve=>{release=resolve;});
    if(method==='selected'){const original=f.api.get;f.api.get=async request=>{await blocked;return original(request);};}
    else{const original=f.api.list;f.api.list=async request=>{await blocked;return original(request);};}
    const read=method==='page'?client.queryPage({cursor:'50'}):client.selectItem('row-80');await tick();
    const releaseWrite=f.block();client.model().updateCandidate('row-2',{notes:'Keep unacknowledged edit'});await tick();release();
    if(method==='page')await assert.rejects(read,/no longer current/);else assert.equal(await read,false);
    assert.equal(client.model().snapshot().candidates.find(item=>item.id==='row-2').notes,'Keep unacknowledged edit');
    releaseWrite();await client.flush();assert.equal(f.rows.get('row-2').notes,'Keep unacknowledged edit');client.dispose();
}
{
    const f=fixture({count:100}),client=createCharacterRepositoryClient({api:f.api});await client.start();
    await client.importFiles({metadata:{name:'Synthetic',server:'Test'}});assert.equal(client.model().snapshot().equipment.primary,'row-0','early terminal event is retained');client.dispose();
    const request=f.calls.find(call=>call[0]==='importFiles')[1];assert.equal(request.chooseInventory,false);assert.equal(request.chooseAchievements,false);
}
{
    const f=fixture({count:100});let release;f.api.importFiles=()=>new Promise(resolve=>{release=()=>resolve({ok:true,jobId:'cancel-before-response'});});
    f.api.cancelImport=async()=>{queueMicrotask(()=>f.emit({jobId:'cancel-before-response',state:'cancelled',error:'Synthetic import canceled'}));return {ok:true};};
    const client=createCharacterRepositoryClient({api:f.api});await client.start();const importing=assert.rejects(client.importFiles({}),/canceled/);await tick();
    const canceling=client.cancelImport();release();await canceling;await importing;assert.equal(client.status.loading,false);assert.equal(f.rows.size,100);client.dispose();
}
{
    const f=fixture({count:10}),raw=f.rows.get('row-2');raw.privateExtension='Preserved private legacy extension '.repeat(50000);
    const text=JSON.stringify(raw),buffer=new TextEncoder().encode(text),originalList=f.api.list;let chunkReads=0;
    f.api.list=async request=>{const result=await originalList(request);result.items=result.items.map(item=>item.id==='row-2'?{id:item.id,name:item.name,repositoryLarge:true}:item);return result;};
    f.api.get=async({id})=>({...await f.api.getCore(),large:true,id,item:null,kind:'card',totalBytes:buffer.length});
    f.api.getChunk=async({offset,length,revision,generation})=>{chunkReads++;const bytes=buffer.slice(offset,offset+length);return {ok:true,revision,generation,totalBytes:buffer.length,bytes,nextOffset:offset+bytes.length};};
    const client=createCharacterRepositoryClient({api:f.api,id:()=> 'duplicated-large'});await client.start();await client.queryPage();
    assert(!client.model().snapshot().candidates.some(item=>item.id==='row-2'),'large summary never normalizes to a fake full card');
    await client.selectItem('row-2');assert(chunkReads>=3);client.model().updateCandidate('row-2',{notes:'Edited known field'});await client.flush();
    assert.equal(f.rows.get('row-2').privateExtension,raw.privateExtension);assert.equal(f.rows.get('row-2').notes,'Edited known field');
    const patch=f.calls.filter(call=>call[0]==='transaction').at(-1)[1].updates[0].patch;assert(!('privateExtension'in patch));assert.deepEqual(Object.keys(patch).sort(),['notes','updatedAt']);
    const duplicate=client.model().duplicateCandidate('row-2');assert(duplicate.ok);await client.flush();
    assert.equal(f.rows.get(duplicate.candidate.id).privateExtension,raw.privateExtension);assert.equal(f.rows.get(duplicate.candidate.id).inventoryOrigin,null);client.dispose();
}
{
    const f=fixture({count:10});let sequence=0;f.rows.get('row-2').privateExtension='Retain across nested copy';
    const client=createCharacterRepositoryClient({api:f.api,id:()=>`new-${++sequence}`});await client.start();await client.queryPage();
    const first=client.model().duplicateCandidate('row-2'),second=client.model().duplicateCandidate(first.candidate.id);
    const added=client.model().intake({item:{name:'Brand new manual item',tier:0}}),third=client.model().duplicateCandidate(added.candidate.id);
    await client.flush();assert.equal(f.rows.get(second.candidate.id).privateExtension,'Retain across nested copy');assert(f.rows.has(third.candidate.id));client.dispose();
}
{
    const f=fixture({count:10});let sequence=0;const raw=f.rows.get('row-2');raw.itemRole='';raw.inventoryOrigin={key:'legacy-loose-exaltation',group:'inventory',location:'General1-Slot1',name:raw.name+' (Exaltation) +0',baseName:raw.name+' (Exaltation)',itemId:20002,tier:0,count:1,slot:null,importedAt:1};
    const client=createCharacterRepositoryClient({api:f.api,id:()=>`protected-copy-${++sequence}`});await client.start();await client.queryPage();
    assert.equal(client.model().snapshot().candidates.find(item=>item.id==='row-2').itemRole,'exaltation');
    const copied=client.model().duplicateCandidate('row-2');await client.flush();assert.equal(f.rows.get(copied.candidate.id).itemRole,'exaltation');assert.equal(f.rows.get(copied.candidate.id).inventoryOrigin,null);
    const restarted=createCharacterRepositoryClient({api:f.api,id:()=>`ordinary-copy-${++sequence}`});await restarted.start();await restarted.selectItem(copied.candidate.id);
    const durable=restarted.model().snapshot().candidates.find(item=>item.id===copied.candidate.id);assert.equal(durable.itemRole,'exaltation');assert.equal(characterEquipmentEligibility(durable).canEquip,false);
    await restarted.queryPage();const ordinary=restarted.model().duplicateCandidate('row-3');await restarted.flush();assert.equal(characterEquipmentEligibility(f.rows.get(ordinary.candidate.id)).canEquip,true);restarted.dispose();client.dispose();
}
{
    const f=fixture({count:10}),list=Array.from({length:61},(_,index)=>({id:`profile-${index}`,name:`Synthetic ${index}`,server:'Test'}));let batches=0,cores=0;
    f.api.listProfiles=async({cursor,limit})=>{batches++;const offset=Number(cursor||0);return {ok:true,profiles:list.slice(offset,offset+limit),nextCursor:offset+limit<list.length?String(offset+limit):null};};
    const original=f.api.getCore;f.api.getCore=async request=>{cores++;return original(request);};
    const client=createCharacterRepositoryClient({api:f.api});await client.start();assert.equal(client.profiles.list().length,61);assert.equal(batches,2);assert.equal(cores,1,'metadata paging never loads other character cores');client.dispose();
}
{
    const f=fixture({count:10}),original=f.api.list;f.api.list=async request=>({...await original(request),revision:2});
    const client=createCharacterRepositoryClient({api:f.api});await assert.rejects(client.start(),/equipped inventory changed/);assert.equal(client.ready,false);client.dispose();
}
{
    const f=fixture({count:10}),legacy=new Map([[CHARACTER_STORAGE_KEY,JSON.stringify({...initial,metadata:{...initial.metadata,race:'合成'.repeat(40000)}})]]),before=legacy.get(CHARACTER_STORAGE_KEY);let chunks=[],seeded=false;
    f.api.bootstrap=async()=>({ok:true,legacySeedAllowed:!seeded,activeProfileId:'one',profiles:[]});
    f.api.beginLegacySeed=async()=>({ok:true,token:'synthetic-seed'});
    f.api.appendLegacySeed=async({token,text})=>{assert.equal(token,'synthetic-seed');assert(Buffer.byteLength(text)<=65536);chunks.push(text);return {ok:true};};
    f.api.commitLegacySeed=async({sha256})=>{const text=chunks.join('');assert.equal(createHash('sha256').update(text).digest('hex'),sha256);assert.equal(JSON.parse(text).values[CHARACTER_STORAGE_KEY],before);seeded=true;return f.api.bootstrap();};
    const client=createCharacterRepositoryClient({api:f.api,legacyStorage:{getItem:key=>legacy.get(key)||null}});await client.start();assert(chunks.length>1);assert(seeded);assert.equal(legacy.get(CHARACTER_STORAGE_KEY),before);client.dispose();
    delete f.api.beginLegacySeed;seeded=false;
    const blocked=createCharacterRepositoryClient({api:f.api,legacyStorage:{getItem:key=>legacy.get(key)||null}});await assert.rejects(blocked.start(),/Browser Character data is preserved/);assert.equal(blocked.ready,false);blocked.dispose();
}
{
    // A repository projection can hold a large legitimate core plus rich rows
    // without stripping evidence/icons. Legacy envelope behavior stays separate.
    const icon='data:image/png;base64,'+'A'.repeat(20000),augments=Array.from({length:8},(_,index)=>({index,name:'Synthetic socket',icon})),snapshot={...copy(initial),candidates:Array.from({length:70},(_,index)=>({...card(index),icon,notes:'N'.repeat(4000),augments,augmentSlots:8,augmentBaseline:{mode:'included',emptyKnown:true,augments}}))};
    snapshot.achievements=null;snapshot.removedInstances=[];
    const values=new Map([[CHARACTER_STORAGE_KEY,JSON.stringify(snapshot)]]),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
    const model=createCharacterModel({storage,workingSet:true,id:()=> 'new-physical'});model.setMetadata({race:'Synthetic'});
    assert(JSON.stringify(model.snapshot()).length>8*1024*1024);assert.equal(model.snapshot().candidates[0].icon,icon);assert.equal(model.snapshot().candidates[0].augments[0].icon,icon);
}
console.log('Character repository client: 10k rows bounded projection, physical IDs, pending recovery, unloaded refs, serial ACK/CAS, rollback, flush, clear-all, stale page and early import completion passed.');
