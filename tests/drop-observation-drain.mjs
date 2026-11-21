import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{SQLiteDropObservationStorage}=require('../desktop/drop-observation-sqlite.cjs'),{DropObservationHost,CHANNEL}=require('../desktop/drop-observation-host.cjs'),{createObservationStartup}=require('../desktop/drop-observation-startup.cjs');
const directory=await mkdtemp(join(tmpdir(),'eoz-observation-drain-')),owner={id:70,name:'Synthetic Observer'};
let now=Date.UTC(2026,10,21,12),serial=0,authenticated=true,mode='accept',feature=true,failureCode=null;
const event=index=>({id:`drain_event_${String(index).padStart(8,'0')}`,kind:'loot',observedAt:new Date(now-100000+index).toISOString(),server:'Synthetic',zone:'Synthetic Vale',npc:'Synthetic Guardian',item:'Synthetic Token',quantity:1,instance:'unknown',sourceKind:'explicit-corpse'});
const receipt=batch=>({schemaVersion:1,batchId:batch.batchId,account:owner,accepted:batch.events.map(row=>row.id),duplicates:[],conflicts:[],rejected:[],receivedAt:new Date(now).toISOString()});
let host;
try{
    const seed=new SQLiteDropObservationStorage({directory,now:()=>now,id:()=>`seed_batch_${++serial}`});await seed.initialize();
    for(let start=0;start<10051;start+=100)await seed.append(Array.from({length:Math.min(100,10051-start)},(_,index)=>event(start+index)),owner);
    assert.equal(seed.status().pending,10051,'Durable outbox accepts more than the former lifetime count cap');
    const frozen=await seed.prepareBatch(owner,'old-client');await seed.recordAttempt({success:true,delayMs:3600000});await seed.close();
    const startup=createObservationStartup(),handlers=new Map(),main={isDestroyed:()=>false,webContents:{mainFrame:{url:'http://127.0.0.1:1234/'}}},submitted=[],seen=new Set();
    const client={status:async()=>({authenticated,user:authenticated?owner:null}),observationStatus:async()=>({schemaVersion:1,enabled:true,available:true,account:owner,limits:{events:100,bytes:262144,hourlyBatches:120,optionalEventFields:['characterName']}}),submitObservations:async batch=>{
        assert(batch.events.length<=100);assert(Buffer.byteLength(JSON.stringify(batch))<=262144);submitted.push(structuredClone(batch));
        if(mode==='offline')throw Error('Synthetic network timeout');
        if(failureCode)throw Object.assign(Error('Synthetic wiki refusal'),{code:failureCode});
        for(const row of batch.events){assert(!seen.has(row.id),'Confirmed rows are never submitted twice');seen.add(row.id);}return receipt(batch);
    }};
    host=new DropObservationHost({electron:{ipcMain:{handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)}},origin:'http://127.0.0.1:1234',getMainWindow:()=>main,stateDir:directory,client,version:'1.0.13',now:()=>now,autoStart:false,isFeatureEnabled:()=>feature,startupAccountReady:startup.ready});
    await host.ready;const invoke=handlers.get(CHANNEL),sender={sender:main.webContents,senderFrame:main.webContents.mainFrame};
    let saved=false;const latest=event(90000),saving=invoke(sender,'collect',{events:[latest]}).then(()=>{saved=true;});await Promise.resolve();assert.equal(saved,false,'Initial new collection waits for account restoration without blocking the renderer');
    let firstPaint=true;await startup.start(async()=>{assert(firstPaint);await host.accountChanged({authenticated:true,user:owner});});await saving;
    let cycles=0;
    while(host.status().pending){
        const before=submitted.length;now=Math.max(now,host.status().nextAttemptAt);await host.tick();assert(submitted.length-before<=10,'Each background cycle yields after at most ten bounded requests');
        assert(++cycles<30,'Whole backlog drains through continuations without an hourly entry cutoff');
        if(host.status().pending)assert(host.status().nextAttemptAt-now<=2500,'Eligible remaining records continue promptly');
    }
    assert.equal(seen.size,10052);assert.equal(submitted.length,101);assert.deepEqual(submitted[0],frozen,'An existing frozen batch is retried first with its exact old version and IDs');assert.equal(submitted[1].events[0].id,latest.id,'Unprepared pending records follow newest-first ordering');
    const newOrder=submitted.slice(1).flatMap(batch=>batch.events.map(row=>row.observedAt));assert.deepEqual(newOrder,[...newOrder].sort().reverse());

    const offline=event(90001);await invoke(sender,'collect',{events:[offline]});now=host.status().nextAttemptAt;mode='offline';await host.tick();assert.equal(host.status().pending,1);const unknown=submitted.at(-1),attempts=submitted.length;await host.tick();assert.equal(submitted.length,attempts,'Network failure backs off instead of looping');mode='accept';now=host.status().nextAttemptAt;await host.tick();assert.deepEqual(submitted.at(-1),unknown,'Uncertain writes retry the same immutable batch');assert.equal(host.status().pending,0);

    await invoke(sender,'collect',{events:[event(90002)]});await invoke(sender,'configure',{enabled:false});const stopped=submitted.length;now+=3600000;await host.tick();assert.equal(submitted.length,stopped);assert.equal(host.status().pending,1,'Opt-out preserves existing pending records at zero uploads');
    await invoke(sender,'configure',{enabled:true});feature=false;await host.tick();assert.equal(submitted.length,stopped,'Whole-feature disable also prevents sending');feature=true;await host.tick();assert.equal(host.status().pending,0);

    authenticated=false;await host.accountChanged({authenticated:false});await invoke(sender,'collect',{events:[event(90003)]});now=host.status().nextAttemptAt;const beforeLogin=submitted.length;await host.tick();assert.equal(submitted.length,beforeLogin);assert.equal(host.status().pending,1,'Signed-out collection remains private and pending');authenticated=true;await host.accountChanged({authenticated:true,user:owner});await host.tick();assert.equal(host.status().pending,0,'Signing into EoZ resumes immediately without an hourly wait');
    for(const [code,expected] of [['eoz-email',/Confirm the email address/],['eoz-blocked',/account is not allowed/],['permission',/account is not allowed/],['login',/Log in to wiki in Eye of Zomm/],['assertuserfailed',/Log in to wiki in Eye of Zomm/],['eoz-rate-limit',/allowance.*continue automatically/],['eoz-capacity',/wiki operator must resolve capacity/],['eoz-disabled',/storage is unavailable/]]){
        await invoke(sender,'collect',{events:[event(91000+serial++)]});now=host.status().nextAttemptAt;failureCode=code;await host.tick();assert.equal(host.status().pending,1);assert.match(host.status().error,expected,`${code} explains the actual next action without losing pending data`);
        if(['login','assertuserfailed'].includes(code))assert.equal(host.status().authenticated,false,'Expired assertions restore the explicit login action');
        if(['eoz-blocked','permission'].includes(code))assert.equal(host.status().authenticated,true,'A restricted account is not presented as a login failure');
        failureCode=null;now=host.status().nextAttemptAt;if(!host.status().authenticated)await host.accountChanged({authenticated:true,user:owner});await host.tick();assert.equal(host.status().pending,0);
    }
    const anotherOwner={id:71,name:'Other Synthetic Observer'};await host.storage.append([event(92000)],anotherOwner);now+=3600000;await host.storage.requestSoon(0,{owner});const wrongAccountCalls=submitted.length;await host.tick();assert.equal(submitted.length,wrongAccountCalls);assert.equal(host.status().pending,1);assert.match(host.status().error,/original account/,'Pending records bound to a different account explain the required sign-in without rebinding');assert.equal(await host.storage.pendingForAccount(anotherOwner),1);
    await host.close();host=null;
    console.log(`Observation drain: 10,052 durable records in 101 serial bounded batches/${cycles} yielded cycles; frozen retry/newest-first ordering, startup account gate, offline retry, opt-out, feature stop and immediate login passed.`);
}finally{
    await host?.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert(basename(directory).startsWith('eoz-observation-drain-'));await rm(directory,{recursive:true,force:true});
}
