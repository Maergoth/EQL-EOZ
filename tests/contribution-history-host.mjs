import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {ensureEoZPageCategory} from '../app/eoz-page-category.js';
const require=createRequire(import.meta.url),{WikiClient}=require('../desktop/wiki-client.cjs'),{WikiHost,CHANNEL}=require('../desktop/wiki-host.cjs');
const {ContributionHistory,MAX_ENTRIES,MAX_BYTES,FILE_NAME}=require('../desktop/contribution-history.cjs');
const ORIGIN='https://eqlwiki.com',A={id:7,name:'Synthetic Editor'},B={id:8,name:'Other Synthetic Editor'};
const at='2026-10-25T12:00:00.000Z',hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'eoz-contribution-history-'));
function plan(id,{user=A,status='submitted',mode='manual',origin=ORIGIN,pages=null}={}){
    const afterText=ensureEoZPageCategory('PRIVATE_AFTER_WIKICODE').trimEnd();
    const value={id,wikiOrigin:origin,expectedUser:user,createdAt:at,blueprintRevision:1,blockers:[],matchesReviewed:true,status,
        pages:pages||[{title:`Synthetic ${id}`,role:'primary',operation:'replace-reviewed',baseRevision:1,beforeHash:hash('before'),afterHash:hash(afterText),beforeText:'PRIVATE_BEFORE_WIKICODE',afterText,status:'applied',result:{revision:2,message:'PRIVATE_SERVER_ERROR',token:'PRIVATE_TOKEN'}}],
        request:{rawLog:'PRIVATE_RAW_LOG',ocr:'PRIVATE_OCR',token:'PRIVATE_TOKEN'}};
    if(mode==='automatic')value.automaticSource={observation:'PRIVATE_RAW_LOG'};
    return value;
}
function fixture({stateDir=null,user=A}={}){
    const calls=[],state={user,outcomes:[]};
    const client=new WikiClient({stateDir,now:()=>Date.parse(at),fetchImpl:async(url,init={})=>{
        const p=init.method==='POST'?new URLSearchParams(init.body):new URL(url).searchParams;calls.push(Object.fromEntries(p));
        let response;
        if(p.get('meta')==='userinfo')response={query:{userinfo:state.user?{...state.user,rights:['edit','createpage','upload']}:{id:0,name:'127.0.0.1',anon:true,rights:[]}}};
        else if(p.get('meta')==='tokens')response={query:{tokens:{csrftoken:'PRIVATE_TOKEN'}}};
        else if(p.get('action')==='edit'){
            const outcome=state.outcomes.shift()||'success';
            if(outcome==='unknown')throw Error('PRIVATE_SERVER_ERROR');
            response=outcome==='failed'?{error:{code:'editconflict',info:'PRIVATE_SERVER_ERROR'}}:{edit:{result:'Success',newrevid:2,pageid:3}};
        }else throw Error('Unexpected synthetic request');
        return new Response(JSON.stringify(response),{headers:{'content-type':'application/json'}});
    }});
    client.blueprints=async()=>({revision:1});
    client.page=async title=>({title,missing:false,revision:1,content:'before',startTimestamp:at});
    return {client,calls,state};
}
async function submit(client,value,options){value.reviewDigest=client.digest(value);client.plans.set(value.id,value);return client.submitPlan({planId:value.id,reviewDigest:value.reviewDigest},options);}
try{
    const stateDir=path.join(directory,'retention'),f=fixture({stateDir});await f.client.load();
    assert.equal(f.calls.length,0,'Loading/backfilling receipts performs no wiki requests');
    // Exercise the same 30-plan pruning boundary as native plan preparation.
    for(let index=0;index<80;index++){
        const value=plan(`retained-${String(index).padStart(3,'0')}`,{mode:index%2?'manual':'automatic'});
        f.client.plans.set(value.id,value);if(f.client.plans.size>30)f.client.plans.delete(f.client.plans.keys().next().value);await f.client.persist();
    }
    assert.equal(JSON.parse(await fs.readFile(path.join(stateDir,'wiki-contribution-plans.json'),'utf8')).plans.length,30);
    const first=await f.client.contributionHistory({limit:31});assert.equal(first.entries.length,31);assert.equal(first.hasMore,true);assert.deepEqual(first.account,A);
    assert.equal(f.calls.length,1,'Opening history checks native authentication once, without page/server fan-out');
    const next=await f.client.contributionHistory({limit:31,before:first.nextCursor});
    const last=await f.client.contributionHistory({limit:31,before:next.nextCursor});
    assert.equal(new Set([...first.entries,...next.entries,...last.entries].map(entry=>entry.id)).size,80);
    assert.equal(last.hasMore,false);assert.equal(last.nextCursor,null);
    assert(first.entries.some(entry=>entry.mode==='automatic'));assert(first.entries.some(entry=>entry.mode==='manual'));
    const entry=first.entries[0],page=entry.pages[0];
    assert.equal(entry.status,'submitted');assert.equal(page.operation,'update','Native replace-reviewed operations become stable update receipts');assert.equal(entry.createdAt,at);assert.equal(entry.updatedAt,at,'Legacy metadata keeps its original timestamp');
    for(const url of [page.url,page.revisionUrl,page.diffUrl])assert.equal(new URL(url).origin,ORIGIN);
    assert.equal(new URL(page.revisionUrl).searchParams.get('oldid'),'2');assert.equal(new URL(page.diffUrl).searchParams.get('oldid'),'1');
    const historyText=await fs.readFile(path.join(stateDir,FILE_NAME),'utf8');
    assert.doesNotMatch(historyText,/PRIVATE_|beforeText|afterText|beforeHash|afterHash|rawLog|"ocr"|"token"|"request"|"message"/,'Only native receipt metadata enters the new history file');
    const restarted=fixture({stateDir});await restarted.client.load();assert.equal((await restarted.client.contributionHistory({limit:100})).entries.length,80,'Pruned plans remain in history after restart');
    assert.equal(await fs.readFile(path.join(stateDir,FILE_NAME),'utf8'),historyText,'Backfill is idempotent and preserves receipt ordering');

    await f.client.history.recordPlans([plan('other-account',{user:B}),plan('other-origin',{origin:'http://127.0.0.1:1234'})]);
    f.state.user=B;const other=await f.client.contributionHistory();assert.deepEqual(other.entries.map(value=>value.id),['other-account']);
    await assert.rejects(f.client.contributionHistory({before:first.nextCursor}),/cursor/,'Cursors are bound to the fresh account and origin');
    f.state.user=null;const loggedOut=await f.client.contributionHistory();assert.deepEqual(loggedOut.entries,[]);assert.equal(loggedOut.account,null);assert.equal(loggedOut.hasMore,false);
    f.state.user=A;assert.equal((await f.client.contributionHistory({limit:100})).entries.length,80,'Logging out never deletes saved receipts');
    const callsBefore=f.calls.length;
    for(const value of [{limit:0},{limit:101},{before:42},{entries:[{status:'submitted'}]},null,[]])await assert.rejects(f.client.contributionHistory(value),/range/);
    assert.equal(f.calls.length,callsBefore,'Invalid renderer arguments do not trigger authentication requests');

    const attempts=fixture({stateDir:path.join(directory,'attempts')});await attempts.client.load();
    const preview=plan('preview-only',{status:'prepared'});preview.pages[0].status='pending';delete preview.pages[0].result;attempts.client.plans.set(preview.id,preview);await attempts.client.persist();
    assert.equal((await attempts.client.contributionHistory()).entries.length,0,'Preview-only drafts do not claim a submission');
    const stale=plan('stale-untagged-preview',{status:'prepared'});stale.pages[0].status='pending';delete stale.pages[0].result;stale.pages[0].afterText='PRIVATE_OLD_UNTAGGED';stale.pages[0].afterHash=hash(stale.pages[0].afterText);
    const beforeStale=attempts.calls.length;await assert.rejects(submit(attempts.client,stale),error=>error.code==='category-review');assert.equal(attempts.calls.length,beforeStale,'A stale untagged draft fails before authentication or write');const staleReceipt=(await attempts.client.contributionHistory()).entries.find(value=>value.id===stale.id);assert.equal(staleReceipt.code,'category-review');assert.equal(staleReceipt.status,'needs-attention');assert.equal(staleReceipt.pages[0].status,'pending');assert.equal(staleReceipt.pages[0].revision,undefined,'The policy refusal never claims an applied page');
    const successful=plan('manual-attempt',{status:'prepared'});successful.pages[0].status='pending';delete successful.pages[0].result;
    assert.equal((await submit(attempts.client,successful)).status,'submitted');
    let receipt=(await attempts.client.contributionHistory()).entries.find(value=>value.id===successful.id);assert.equal(receipt.status,'submitted');assert.equal(receipt.pages[0].revision,2);
    const partial=plan('partial-attempt',{status:'prepared',mode:'automatic'});partial.pages=Array.from({length:2},(_,index)=>({...successful.pages[0],title:`Synthetic Partial ${index}`,status:'pending',result:undefined}));attempts.state.outcomes=['success','failed'];
    delete partial.automaticSource;partial.automaticItem={candidateId:'synthetic-captured-history',title:partial.pages[0].title,evidenceId:'PRIVATE_OCR',frameId:'synthetic-frame'};
    // General automatic history can include an item and its effect page. Loot
    // source plans use their own stricter one-author fixture separately.
    assert.equal((await submit(attempts.client,partial)).status,'partial');receipt=(await attempts.client.contributionHistory()).entries.find(value=>value.id===partial.id);
    assert.equal(receipt.status,'partly-submitted');assert.equal(receipt.mode,'automatic');assert.deepEqual(receipt.pages.map(value=>value.status),['applied','failed']);assert.equal(receipt.pages[1].revisionUrl,undefined);
    const uncertain=plan('uncertain-attempt',{status:'prepared'});uncertain.pages[0].status='pending';delete uncertain.pages[0].result;attempts.state.outcomes=['unknown'];
    assert.equal((await submit(attempts.client,uncertain)).status,'needs-attention');receipt=(await attempts.client.contributionHistory()).entries.find(value=>value.id===uncertain.id);
    assert.equal(receipt.status,'needs-attention');assert.equal(receipt.pages[0].status,'unknown');assert.equal(receipt.pages[0].revisionUrl,undefined);
    const authFailure=plan('account-failed-attempt',{status:'prepared'});authFailure.pages[0].status='pending';delete authFailure.pages[0].result;attempts.state.user=B;
    await assert.rejects(submit(attempts.client,authFailure),/account changed/);attempts.state.user=A;receipt=(await attempts.client.contributionHistory()).entries.find(value=>value.id===authFailure.id);
    assert.equal(receipt.status,'needs-attention');assert.equal(receipt.code,'account-changed','Pre-write failures are captured without arbitrary error text');
    const pending=plan('pending-attempt',{status:'prepared'});pending.pages[0].status='pending';delete pending.pages[0].result;pending.historyAttempt={at,status:'pending'};await attempts.client.history.recordPlans([pending]);
    assert.equal((await attempts.client.contributionHistory()).entries.find(value=>value.id===pending.id).status,'pending');
    const captured=plan('captured-item-attempt',{status:'prepared'});captured.automaticItem={evidenceId:'PRIVATE_OCR'};
    captured.attachment={filename:'Synthetic item screenshot.png',status:'applied',caption:'PRIVATE_CAPTION',token:'PRIVATE_TOKEN'};
    await attempts.client.history.recordPlans([captured]);receipt=(await attempts.client.contributionHistory()).entries.find(value=>value.id===captured.id);
    assert.equal(receipt.mode,'automatic');assert.equal(receipt.status,'submitted','Confirmed native page results win even if a crash prevented the final plan status update');
    assert.equal(receipt.pages.at(-1).operation,'upload');assert.equal(receipt.pages.at(-1).url,'https://eqlwiki.com/File%3ASynthetic_item_screenshot.png');
    assert.doesNotMatch(await fs.readFile(path.join(attempts.client.stateDir,FILE_NAME),'utf8'),/PRIVATE_|caption|evidenceId/,'Captured-item receipts also exclude screenshot/evidence payloads');

    const bounded=new ContributionHistory({stateDir:path.join(directory,'bounded'),now:()=>Date.parse(at)});
    await bounded.recordPlans(Array.from({length:MAX_ENTRIES+20},(_,index)=>plan(`bounded-${String(index).padStart(4,'0')}`)));
    assert.equal(bounded.entries.size,MAX_ENTRIES,'The count limit prunes oldest receipts');
    const heavy=Array.from({length:MAX_ENTRIES},(_,index)=>plan(`heavy-${String(index).padStart(4,'0')}`,{pages:Array.from({length:12},(_,page)=>({title:`Synthetic ${index} ${page} `+'界'.repeat(280),operation:'update',status:'applied',baseRevision:1,result:{revision:2}}))}));
    await bounded.recordPlans(heavy);assert((await fs.stat(bounded.file)).size<=MAX_BYTES,'Receipt cap is UTF-8 bytes');assert(bounded.entries.size<MAX_ENTRIES);
    assert.equal((await fs.readdir(path.dirname(bounded.file))).some(name=>name.endsWith('.tmp')),false,'Atomic saves leave no temporary files');

    for(const [name,content]of [['corrupt','{"PRIVATE_OCR":'],['invalid-fields',JSON.stringify({schemaVersion:1,entries:[{...entry,rawLog:'PRIVATE_RAW_LOG'}]})],['oversized','x'.repeat(MAX_BYTES+1)]]){
        const root=path.join(directory,name);await fs.mkdir(root);const file=path.join(root,FILE_NAME);await fs.writeFile(file,content);const store=new ContributionHistory({stateDir:root});
        await store.recordPlans([plan('safe-backfill')]);const result=await store.list({user:A,wikiOrigin:ORIGIN});assert.match(result.warning,/could not be read/);assert.equal(await fs.readFile(file,'utf8'),content,'Unreadable history is preserved instead of overwritten');
    }
    const failureRoot=path.join(directory,'write-failure');await fs.mkdir(failureRoot);const failure=fixture({stateDir:failureRoot});await failure.client.load();const blockedPath=path.join(failureRoot,FILE_NAME);await fs.mkdir(blockedPath);
    const stillSuccessful=plan('successful-with-history-failure',{status:'prepared'});stillSuccessful.pages[0].status='pending';delete stillSuccessful.pages[0].result;
    assert.equal((await submit(failure.client,stillSuccessful)).status,'submitted','Receipt failure must not turn a confirmed edit into failure');
    assert.match((await failure.client.contributionHistory()).warning,/could not be saved/);
    assert.equal(path.dirname(blockedPath),failureRoot);await fs.rm(blockedPath,{recursive:true});await failure.client.persist();assert.equal((await failure.client.contributionHistory()).warning,undefined,'A later identical save retries receipt persistence');
    assert.equal((await new ContributionHistory({stateDir:failureRoot}).list({user:A,wikiOrigin:ORIGIN})).entries[0].status,'submitted');

    const handlers=new Map(),main={isDestroyed:()=>false,webContents:{mainFrame:{url:'http://127.0.0.1:1234/'}}};
    const session={setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},on(){},removeListener(){}};
    const host=new WikiHost({electron:{session:{fromPartition:()=>session},ipcMain:{handle:(name,fn)=>handlers.set(name,fn),removeHandler:name=>handlers.delete(name)}},origin:'http://127.0.0.1:1234',getMainWindow:()=>main,client:f.client});
    const invoke=handlers.get(CHANNEL),event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
    assert.equal((await invoke(event,'contribution-history',{limit:10})).entries.length,10);
    for(const patch of [{sender:{}},{senderFrame:{url:main.webContents.mainFrame.url}},{senderFrame:{url:'http://127.0.0.1:1234/overlay.html'}}])await assert.rejects(invoke({...event,...patch},'contribution-history'),/main app/);
    await assert.rejects(invoke(event,'write-contribution-history',{entries:[]}),/Unknown wiki action/);host.dispose();assert.equal(handlers.has(CHANNEL),false);
    const exposed={},invocations=[];
    vm.runInNewContext(await fs.readFile(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:name=>{
        assert.equal(name,'electron');return {contextBridge:{exposeInMainWorld:(key,value)=>exposed[key]=value},
            ipcRenderer:{invoke:(...args)=>{invocations.push(args);},on(){},removeListener(){}}};
    }});
    exposed.eyeOfZommWiki.contributionHistory({limit:10});assert.deepEqual(invocations.at(-1),[CHANNEL,'contribution-history',{limit:10}]);assert.equal(exposed.eyeOfZommWiki.writeContributionHistory,undefined);
    console.log('Contribution history: native manual/automatic receipts, partial/unknown/pre-write failures, one fresh auth read, account/origin isolation, bounded restart retention, metadata-only URLs, corruption preservation, non-fatal atomic storage, and main-frame read-only IPC passed.');
}finally{
    assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('eoz-contribution-history-'));await fs.rm(directory,{recursive:true,force:true});
}
