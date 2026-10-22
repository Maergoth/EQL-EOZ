import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const {CaptureHost}=createRequire(import.meta.url)('../desktop/capture-host.cjs');
const {captureOcrScale}=createRequire(import.meta.url)('../desktop/capture-image.cjs');
assert.equal(captureOcrScale({width:748,height:331}),3,'small game text is enlarged without a multi-pass backlog');
assert.equal(captureOcrScale({width:1280,height:720}),2);
assert.equal(captureOcrScale({width:1920,height:1080}),1);
assert.equal(captureOcrScale({width:900,height:8192}),1,'tall PNGs cannot exceed decode limits through enlargement');
assert.equal(captureOcrScale({width:1500,height:2500}),2);
assert.equal(captureOcrScale({width:1500,height:3000}),1);
const origin='http://127.0.0.1:53147';
function png(id='one',width=100,height=40){const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.writeUInt32BE(13,8);header.write('IHDR',12,'ascii');header.writeUInt32BE(width,16);header.writeUInt32BE(height,20);return Buffer.concat([header,Buffer.from(id)]);}
function fixture(){
    let now=1000,ocrPending=null;const observations=[],copies=[],handlers=new Map();
    const contents=new EventEmitter();contents.mainFrame={url:`${origin}/`};contents.sent=[];contents.send=(...args)=>contents.sent.push(args);
    const main={webContents:contents,isDestroyed:()=>false};
    const image={isEmpty:()=>false,getSize:()=>({width:100,height:40}),resize:()=>image,toPNG:()=>Buffer.from('synthetic-png')};
    const sources=[{id:'window:game',name:'EverQuest Synthetic',thumbnail:image},{id:'screen:one',name:'Screen 1',thumbnail:image},{id:'window:eoz',name:'Eye of Zomm capture source',thumbnail:image}];
    const ocr={calls:0,stops:0,async recognize(){this.calls++;return new Promise((resolve,reject)=>{ocrPending={resolve,reject};});},async stop(){this.stops++;if(ocrPending){ocrPending.reject(new Error('stopped'));ocrPending=null;}}};
    const journal={sequence:0,records:[],async initialize(){},async append(value){const record={...value,schema:1,sequence:++this.sequence,recordedAt:new Date(now).toISOString()};this.records.push(record);return record;},async read(){return {records:this.records};},async close(){},async clear(){this.records=[];}};
    const electron={app:{isPackaged:false,getPath:()=>'/unused'},ipcMain:{handle:(channel,callback)=>handlers.set(channel,callback),removeHandler:channel=>handlers.delete(channel)},
        desktopCapturer:{getSources:async()=>sources},nativeImage:{createFromBuffer:()=>image},clipboard:{writeImage:image=>copies.push(image)}};
    const host=new CaptureHost({electron,origin,getMainWindow:()=>main,journal,ocr,now:()=>now,onObservation:value=>observations.push(value)});
    host.startSource=async()=>{host.phase='running';host.emitStatus();};
    return {host,main,event:{sender:contents,senderFrame:contents.mainFrame},journal,ocr,observations,copies,handlers,
        tick(){now+=100;},frame(id='one'){return {bytes:png(id),width:100,height:40,capturedAt:now};},
        resolve(){const pending=ocrPending;ocrPending=null;pending.resolve({text:'Item: Synthetic Blade\nAC 12\nHP 45',confidence:85,words:[]});},
        async waitForRead(){for(let attempt=0;attempt<200;attempt++){if(ocrPending)return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Synthetic read did not start.');}};
}
const f=fixture();
try{
    await assert.rejects(f.host.handle({sender:{},senderFrame:f.main.webContents.mainFrame},'status'),/main app/);
    await assert.rejects(f.host.handle({sender:f.main.webContents,senderFrame:{url:`${origin}/`}},'start',{}),/main app/);
    assert.equal((await f.host.listSources()).length,2,'own windows cannot be selected');
    await assert.rejects(f.host.start({mode:'character',sourceId:'missing'}),/Choose/);
    await f.host.start({mode:'contribution',sourceId:'window:game',sessionId:'contribution-test'});
    assert.throws(()=>f.host.submitFrame({...f.frame(),bytes:png('forged',20000,20000)}),/megapixels/,'PNG dimensions are checked before native decode');
    assert.throws(()=>f.host.submitFrame({...f.frame(),bytes:png('mismatch',101,40)}),/match/);
    f.tick();f.host.submitFrame(f.frame('old'));const old=f.host.processing;
    await f.host.start({mode:'character',sourceId:'window:game',sessionId:'character-test'});await old;
    assert.equal(f.observations.length,0,'cancelled contribution OCR cannot enter the character inventory');
    assert.equal(f.host.getStatus().contributionPaused,true);
    f.tick();f.host.submitFrame(f.frame('first'));f.tick();f.host.submitFrame(f.frame('replace'));f.tick();f.host.submitFrame(f.frame('latest'));
    assert.equal(f.host.getStatus().queuedFrames,1);assert.ok(f.host.skippedFrames>=1,'frame backlog is bounded');
    f.resolve();await new Promise(resolve=>setImmediate(resolve));f.resolve();await f.host.processing;
    assert.equal(f.ocr.calls,3,'one cancelled and two bounded jobs were run');
    assert.equal(f.observations.length,1,'unchanged semantic item readings deduplicate');assert.equal(f.observations[0].owner,'character');
    const same=f.observations[0];
    assert.equal(await f.host.saveObservation({...same,fields:same.fields.map(field=>({...field,confidence:field.confidence-10,raw:` ${field.raw}`}))}),null,'OCR confidence/whitespace jitter cannot create duplicate equipment cards');
    await f.host.stop({mode:'character'});assert.equal(f.host.owner,'contribution','explicit character Stop restores prior contribution');
    await f.host.start({mode:'character',sourceId:'window:game',sessionId:'character-second'});
    await f.host.stop({mode:'contribution'});await f.host.stop({mode:'character'});
    assert.equal(f.host.owner,null,'disabling contribution during character capture is respected');
    await f.host.start({mode:'contribution',sourceId:'window:game'});f.tick();f.host.submitFrame(f.frame('paused'));await f.host.pause();
    assert.equal(f.host.phase,'paused');assert.equal(f.host.getStatus().queuedFrames,0);await f.host.resume();assert.equal(f.host.phase,'running');
    const before=f.journal.records.length;
    await f.host.ingestLogObservation({type:'loot',item:'Synthetic Ring',quantity:1,source:'a synthetic rat',sourceEvidence:{kind:'recent-kill'}},{live:true,at:1000,zone:'Synthetic Zone',logId:'C:\\private\\eqlog.txt',cursor:1});
    await f.host.ingestLogObservation({type:'loot',item:'Synthetic Ring',quantity:1,source:'a synthetic rat',sourceEvidence:{kind:'recent-kill'}},{live:true,at:1000,zone:'Synthetic Zone',logId:'C:\\private\\eqlog.txt',cursor:2});
    assert.equal(f.journal.records.length,before+2,'legitimate repeated loot has distinct cursor provenance');
    assert.equal(f.journal.records.at(-1).relations[0].reviewRequired,true);assert.doesNotMatch(JSON.stringify(f.journal.records),/private|eqlog\.txt/);
    assert.equal((await f.host.ingestLogObservation({type:'kill',victim:'Synthetic Rat'},{live:false,at:1000})).accepted,false);
    f.host.lastFrame={png:Buffer.from('synthetic'),at:1000,sourceId:'window:game'};
    await f.host.captureScreenshot();assert.equal(f.copies.length,1);assert.equal(f.host.owner,'contribution','screenshot retains capture ownership');
    await assert.rejects(f.host.captureScreenshot({sourceId:'missing'}),/available/);assert.equal(f.host.hold,false,'failed screenshot always releases hold');
    await assert.rejects(f.host.handleSource(f.event,'frame',f.frame()),/unavailable/);
}finally{await f.host.dispose();}
assert.equal(f.handlers.size,0,'shutdown unregisters both exact-frame IPC handlers');
const imported=fixture(),temporary=await mkdtemp(join(tmpdir(),'eoz-capture-import-'));
try{
    const target=join(temporary,'synthetic.png');await writeFile(target,png());
    imported.host.electron.dialog={showOpenDialog:async()=>({filePaths:[target],canceled:false})};
    const pending=imported.host.importImage({mode:'character',sessionId:'offline-character'});
    await imported.waitForRead();imported.resolve();
    const result=await pending;
    assert.equal(result.records[0].owner,'character');assert.equal(result.records[0].sessionId,'offline-character');
    assert.equal(imported.host.enabled,false,'an offline Character screenshot never enables persistent capture');
    await imported.host.listSources();await imported.host.start({mode:'contribution',sourceId:'window:game'});
    imported.tick();imported.host.submitFrame(imported.frame('discard-on-import'));
    const running=imported.host.processing;
    const review=imported.host.importImage({mode:'character',sessionId:'second-character'});
    for(let attempt=0;attempt<200&&!imported.host.hold;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(imported.host.hold,true);assert.equal(imported.host.submitFrame(imported.frame('held')).accepted,false);
    await running;await imported.waitForRead();imported.resolve();
    assert.equal((await review).records[0].owner,'character');assert.equal(imported.host.owner,'contribution');
    assert.equal(imported.host.phase,'running');assert.equal(imported.host.hold,false,'a manual review releases its exclusive worker hold');
    assert.equal(imported.observations.length,2,'cancelled live OCR cannot leak into the manual character review');
}finally{await imported.host.dispose();await rm(temporary,{recursive:true,force:true});}
{
    const delayed=fixture();let release,started=0;
    delayed.host.journal.initialize=()=>new Promise(resolve=>{release=resolve;});
    delayed.host.startSource=async()=>{started++;};
    try{
        await delayed.host.listSources();const starting=delayed.host.start({mode:'character',sourceId:'window:game'});
        while(!release)await new Promise(resolve=>setImmediate(resolve));
        await delayed.host.stop();release();await starting;
        assert.equal(started,0,'Stop during journal initialization prevents a late capture source from being created');
        assert.equal(delayed.host.phase,'disabled');assert.equal(delayed.host.enabled,false);
    }finally{await delayed.host.dispose();}
}
{
    const delayed=fixture();let rejectOld;
    delayed.host.startSource=async()=>new Promise((resolve,reject)=>{rejectOld=reject;});
    try{
        await delayed.host.listSources();const starting=delayed.host.start({mode:'contribution',sourceId:'window:game'});
        while(!rejectOld)await new Promise(resolve=>setImmediate(resolve));
        delayed.host.startSource=async()=>{delayed.host.phase='running';};
        await delayed.host.start({mode:'character',sourceId:'window:game',sessionId:'replacement-character'});
        rejectOld(Error('The retired source load was cancelled.'));await starting;
        assert.equal(delayed.host.phase,'running','an old source startup rejection cannot overwrite the replacement state');
        assert.equal(delayed.host.sessionId,'replacement-character');assert.equal(delayed.host.error,null);
    }finally{await delayed.host.dispose();}
}
console.log('Capture host: exact IPC, character/contribution/screenshot arbitration, cancelled results, bounded latest-frame queue and log provenance passed.');
