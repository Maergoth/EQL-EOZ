import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const {CaptureHost,preferredCaptureSource}=createRequire(import.meta.url)('../desktop/capture-host.cjs');
const {captureOcrScale}=createRequire(import.meta.url)('../desktop/capture-image.cjs');
assert.equal(captureOcrScale({width:748,height:331}),3,'small game text is enlarged without a multi-pass backlog');
assert.equal(captureOcrScale({width:1280,height:720}),2);
assert.equal(captureOcrScale({width:1920,height:1080}),2);
assert.equal(captureOcrScale({width:2560,height:1369}),2,'normal game screenshots retain readable small text within the 16 MP limit');
assert.equal(captureOcrScale({width:3840,height:2160}),1,'4K sources remain within the OCR pixel budget');
assert.equal(captureOcrScale({width:900,height:8192}),1,'tall PNGs cannot exceed decode limits through enlargement');
assert.equal(captureOcrScale({width:1500,height:2500}),2);
assert.equal(captureOcrScale({width:1500,height:3000}),1);
const origin='http://127.0.0.1:53147';
const CHARACTER_TEXT='Character Stats\nInventory\nHP 330/398\nSTR 90';
assert.equal(preferredCaptureSource([{id:'screen:1',name:'EverQuest'},{id:'window:wiki',name:'EverQuest - Mozilla Firefox'}]),null,'a display or browser title is never an automatic game recommendation');
assert.equal(preferredCaptureSource([{id:'window:game',name:'EverQuest'},{id:'window:launcher',name:'EverQuest LaunchPad'}]),'window:game');
assert.equal(preferredCaptureSource([{id:'window:game',name:'EverQuest Legends'},{id:'window:other',name:'EverQuest (Synthetic)'}]),null,'multiple game windows require a choice');
function png(id='one',width=100,height=40){const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.writeUInt32BE(13,8);header.write('IHDR',12,'ascii');header.writeUInt32BE(width,16);header.writeUInt32BE(height,20);return Buffer.concat([header,Buffer.from(id)]);}
function fixture(){
    let now=1000,ocrPending=null;const observations=[],copies=[],handlers=new Map(),crops=[],submitted=[];
    const contents=new EventEmitter();contents.mainFrame={url:`${origin}/`};contents.sent=[];contents.send=(...args)=>contents.sent.push(args);
    const main={webContents:contents,isDestroyed:()=>false};
    const picture=(width=100,height=40)=>({isEmpty:()=>false,getSize:()=>({width,height}),
        resize:size=>picture(size.width,size.height),crop:region=>{crops.push({...region});return picture(region.width,region.height);},
        toPNG:()=>png('prepared',width,height),toDataURL:()=>`data:image/png;base64,${png('preview',width,height).toString('base64')}`});
    const image=picture();
    const sources=[{id:'window:game',name:'EverQuest Synthetic',thumbnail:image},{id:'screen:one',name:'Screen 1',thumbnail:image},{id:'window:eoz',name:'Eye of Zomm capture source',thumbnail:image}];
    const ocr={calls:0,stops:0,async recognize(bytes,options){this.calls++;submitted.push({width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),...options});return new Promise((resolve,reject)=>{ocrPending={resolve,reject};});},async stop(){this.stops++;if(ocrPending){ocrPending.reject(new Error('stopped'));ocrPending=null;}}};
    const journal={sequence:0,records:[],async initialize(){},async append(value){const record={...value,schema:1,sequence:++this.sequence,recordedAt:new Date(now).toISOString()};this.records.push(record);return record;},async read(){return {records:this.records};},async close(){},async clear(){this.records=[];}};
    const electron={app:{isPackaged:false,getPath:()=>'/unused'},ipcMain:{handle:(channel,callback)=>handlers.set(channel,callback),removeHandler:channel=>handlers.delete(channel)},
        desktopCapturer:{getSources:async()=>sources},nativeImage:{createFromBuffer:bytes=>bytes.length>=24&&bytes.toString('ascii',12,16)==='IHDR'?picture(bytes.readUInt32BE(16),bytes.readUInt32BE(20)):image},clipboard:{writeImage:image=>copies.push(image)}};
    const host=new CaptureHost({electron,origin,getMainWindow:()=>main,journal,ocr,now:()=>now,onObservation:value=>observations.push(value)});
    host.startSource=async()=>{host.phase='running';host.emitStatus();};
    return {host,main,event:{sender:contents,senderFrame:contents.mainFrame},journal,ocr,observations,copies,handlers,crops,submitted,
        tick(){now+=100;},advance(ms){now+=ms;},frame(id='one',width=100,height=40){return {bytes:png(id,width,height),width,height,capturedAt:now,captureGeneration:host.generation,owner:host.owner,sessionId:host.sessionId,sourceId:host.source?.id};},
        reject(error=Error('Transient synthetic OCR timeout.')){const pending=ocrPending;ocrPending=null;pending.reject(error);},
        resolve(text){text??=host.owner==='character'?CHARACTER_TEXT:'Item: Synthetic Blade\nAC 12\nHP 45';const pending=ocrPending;ocrPending=null;pending.resolve({text,confidence:85,words:[]});},
        async waitForRead(){for(let attempt=0;attempt<200;attempt++){if(ocrPending)return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('Synthetic read did not start.');}};
}
const f=fixture();
try{
    await assert.rejects(f.host.handle({sender:{},senderFrame:f.main.webContents.mainFrame},'status'),/main app/);
    await assert.rejects(f.host.handle({sender:{},senderFrame:f.main.webContents.mainFrame},'preview'),/main app/);
    await assert.rejects(f.host.handle({sender:{},senderFrame:f.main.webContents.mainFrame},'set-region',{}),/main app/);
    await assert.rejects(f.host.handle({sender:f.main.webContents,senderFrame:{url:`${origin}/`}},'start',{}),/main app/);
    assert.equal((await f.host.listSources()).length,2,'own windows cannot be selected');
    await assert.rejects(f.host.start({mode:'character',sourceId:'missing'}),/Choose/);
    await f.host.start({mode:'contribution',sourceId:'window:game',sessionId:'contribution-test'});
    assert.throws(()=>f.host.submitFrame({...f.frame(),bytes:png('forged',20000,20000)}),/megapixels/,'PNG dimensions are checked before native decode');
    assert.throws(()=>f.host.submitFrame({...f.frame(),bytes:png('mismatch',101,40)}),/match/);
    f.tick();f.host.submitFrame(f.frame('old'));await f.waitForRead();const old=f.host.processing;
    await f.host.start({mode:'character',sourceId:'window:game',sessionId:'character-test'});await old;
    assert.equal(f.observations.length,0,'cancelled contribution OCR cannot enter the character inventory');
    assert.equal(f.host.getStatus().contributionPaused,true);
    f.tick();f.host.submitFrame(f.frame('first'));await f.waitForRead();f.tick();f.host.submitFrame(f.frame('replace'));f.tick();f.host.submitFrame(f.frame('latest'));
    assert.equal(f.host.getStatus().queuedFrames,2,'brief distinct frames survive while the first OCR is busy');
    for(let index=0;index<3;index++){await f.waitForRead();f.resolve();await new Promise(resolve=>setImmediate(resolve));}await f.host.processing;
    assert.equal(f.ocr.calls,4,'one cancelled and all three distinct queued jobs were run');
    assert.equal(f.observations.length,1,'unchanged semantic character-stat readings deduplicate');assert.equal(f.observations[0].owner,'character');assert.equal(f.observations[0].subject.kind,'character');
    const same=f.observations[0];
    assert.equal(await f.host.saveObservation({...same,fields:same.fields.map(field=>({...field,confidence:field.confidence-10,raw:` ${field.raw}`}))}),null,'OCR confidence/whitespace jitter cannot create duplicate character-stat evidence');
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
    assert.equal(f.journal.records.at(-1).relations.find(relation=>relation.type==='drop-source').reviewRequired,true);assert.doesNotMatch(JSON.stringify(f.journal.records),/private|eqlog\.txt/);
    const actualLine='[Sat Oct 24 12:00:00 2026] You have slain Synthetic <Watcher>!';
    assert.equal((await f.host.ingestLogObservation({type:'kill',victim:'Synthetic <Watcher>'},{live:true,at:1000,zone:'Synthetic Zone',cursor:3,logId:'C:\\private\\eqlog.txt',logLine:actualLine+'\nSurrounding chat must not be stored.'})).accepted,true);
    const triggered=f.journal.records.at(-1);assert.equal(triggered.input.event,'kill');assert.equal(triggered.evidence.logLine,actualLine);assert.match(triggered.evidence.text,/Log kill:/);assert.doesNotMatch(JSON.stringify(triggered),/Surrounding chat|private|eqlog\.txt/);
    for(const event of [{type:'consider',target:{name:'Synthetic Other'}},{type:'cast-begin',spell:'Synthetic Spell'},{type:'kill',victim:'You'},{type:'kill',victim:'Synthetic Player',victimIsPlayer:true},{type:'kill',victim:'Synthetic Pet',isPet:true}])assert.equal((await f.host.ingestLogObservation(event,{live:true,at:1000,zone:'Synthetic Zone',cursor:4})).accepted,false);
    assert.equal((await f.host.ingestLogObservation({type:'kill',victim:'Synthetic Player'},{live:true,at:1000,playerNames:['SYNTHETIC PLAYER'],cursor:5})).accepted,false);
    assert.equal((await f.host.ingestLogObservation({type:'zone',zone:'Synthetic Other Zone'},{live:true,at:1000,cursor:6,logLine:'z'.repeat(5000)})).accepted,true);assert.equal(f.journal.records.at(-1).evidence.logLine.length,2048);
    assert.equal((await f.host.ingestLogObservation({type:'kill',victim:'Synthetic Rat'},{live:false,at:1000})).accepted,false);
    f.host.lastFrame={png:Buffer.from('synthetic'),at:1000,sourceId:'window:game'};
    await f.host.captureScreenshot();assert.equal(f.copies.length,1);assert.equal(f.host.owner,'contribution','screenshot retains capture ownership');
    await assert.rejects(f.host.captureScreenshot({sourceId:'missing'}),/available/);assert.equal(f.host.hold,false,'failed screenshot always releases hold');
    await assert.rejects(f.host.handleSource(f.event,'frame',f.frame()),/unavailable/);
}finally{await f.host.dispose();}
assert.equal(f.handlers.size,0,'shutdown unregisters both exact-frame IPC handlers');
{
    const guarded=fixture();
    try{
        await guarded.host.listSources();await guarded.host.start({mode:'contribution',sourceId:'window:game',sessionId:'popup-old'});
        await guarded.host.start({mode:'contribution',sourceId:'window:game',sessionId:'replacement-reader'});
        const unchanged=async(options)=>{
            const before=guarded.host.getStatus(),revision=guarded.host.revision,stops=guarded.ocr.stops,sent=guarded.main.webContents.sent.length,resume=guarded.host.contributionResume;
            assert.deepEqual(await guarded.host.stop(options),before);
            assert.equal(guarded.host.revision,revision);assert.equal(guarded.ocr.stops,stops);assert.equal(guarded.main.webContents.sent.length,sent);assert.equal(guarded.host.contributionResume,resume,'mismatched cleanup does not mutate a pending resume');
        };
        await unchanged({mode:'contribution',expectedSessionId:'popup-old',expectedSourceId:'window:game'});
        await unchanged({mode:'contribution',expectedSessionId:'replacement-reader',expectedSourceId:'screen:one'});
        const beforeInvalid=guarded.host.getStatus();
        for(const options of [{expectedSessionId:'replacement-reader'},{expectedSourceId:'window:game'},{expectedSessionId:'',expectedSourceId:'window:game'},{expectedSessionId:'x'.repeat(121),expectedSourceId:'window:game'},{expectedSessionId:'replacement-reader',expectedSourceId:''},{expectedSessionId:'replacement-reader',expectedSourceId:'x'.repeat(513)},{expectedSessionId:'replacement-reader',expectedSourceId:'window:\ngame'},{expectedSessionId:42,expectedSourceId:'window:game'}])await assert.rejects(guarded.host.stop({mode:'contribution',...options}),/expected capture session/);
        assert.deepEqual(guarded.host.getStatus(),beforeInvalid,'invalid paired proof cannot change the current reader');
        await guarded.host.handle(guarded.event,'stop',{mode:'contribution',expectedSessionId:'replacement-reader',expectedSourceId:'window:game'});
        assert.equal(guarded.host.owner,null,'matching active proof stops only the owned contribution reader');
        await guarded.host.start({mode:'contribution',sourceId:'window:game',sessionId:'popup-owned'});
        await guarded.host.start({mode:'character',sourceId:'window:game',sessionId:'character-owned'});
        await unchanged({mode:'contribution',expectedSessionId:'character-owned',expectedSourceId:'window:game'});
        const characterGeneration=guarded.host.generation;
        await guarded.host.stop({mode:'contribution',expectedSessionId:'popup-owned',expectedSourceId:'window:game'});
        assert.equal(guarded.host.contributionResume,null,'matching queued contribution proof clears its own resume');assert.equal(guarded.host.owner,'character');assert.equal(guarded.host.sessionId,'character-owned');assert.equal(guarded.host.generation,characterGeneration,'canceling an owned resume does not interrupt Character capture');
        await guarded.host.start({mode:'contribution',sourceId:'window:game',sessionId:'popup-old'});
        await guarded.host.start({mode:'contribution',sourceId:'screen:one',sessionId:'other-queued'});
        await unchanged({mode:'contribution',expectedSessionId:'popup-old',expectedSourceId:'window:game'});
        await unchanged({mode:'contribution',expectedSessionId:'other-queued',expectedSourceId:'window:game'});
        await guarded.host.stop({mode:'character'});
        assert.equal(guarded.host.owner,'contribution');assert.equal(guarded.host.sessionId,'other-queued');assert.equal(guarded.host.source.id,'screen:one','stale popup cleanup preserves an unrelated queued reader for normal Character completion');
    }finally{await guarded.host.dispose();}
}
{
    const reading=fixture();let destroyed=0;
    try{
        await reading.host.listSources();await reading.host.start({mode:'character',sourceId:'window:game',sessionId:'persistent-character'});
        const contents=new EventEmitter();contents.mainFrame={url:`${origin}/capture-source.html`};
        const window={webContents:contents,isDestroyed:()=>false,destroy(){destroyed++;}};
        reading.host.captureWindow=window;const sourceEvent={sender:contents,senderFrame:contents.mainFrame};
        reading.tick();reading.host.submitFrame(reading.frame('timeout'));await reading.waitForRead();reading.reject();await reading.host.processing;
        assert.equal(reading.host.phase,'running');assert.equal(reading.host.owner,'character');assert.equal(reading.host.sessionId,'persistent-character');assert.equal(destroyed,0);assert.match(reading.host.getStatus().readWarning,/retry/);
        assert.equal(reading.host.submitFrame(reading.frame('backoff')).retrying,true,'transient read failures use bounded retry backoff');
        reading.advance(2100);await readFrame(reading,'retry-success');assert.equal(reading.observations.at(-1).sessionId,'persistent-character');assert.equal(reading.host.readWarning,null);assert.equal(reading.host.readErrors,0);
        await reading.host.handleSource(sourceEvent,'frame-error');assert.equal(reading.host.phase,'running');assert.equal(reading.host.captureWindow,window);assert.match(reading.host.getStatus().readWarning,/frame was unavailable/);
        reading.tick();reading.host.submitFrame(reading.frame('retry-success'));await reading.host.processing;assert.equal(reading.host.getStatus().readWarning,null,'a valid duplicate frame also clears transient source warnings');
        assert.equal((await reading.host.handleSource(sourceEvent,'sample-drop',{reason:'capacity',count:2})).ok,true);assert.equal(reading.host.getStatus().captureDiagnostics.sourceDropped,2);assert.equal(reading.host.getStatus().overflowFrames,2);assert.match(reading.host.getStatus().queueWarning,/2 dropped/);
        for(const invalid of [{reason:'private text',count:1},{reason:'capacity',count:101},{reason:'age',count:1.2}])assert.equal((await reading.host.handleSource(sourceEvent,'sample-drop',invalid)).ok,false);assert.equal(reading.host.getStatus().captureDiagnostics.sourceDropped,2,'source diagnostic input cannot add arbitrary text or unbounded counts');
        await reading.host.handleSource(sourceEvent,'ended');assert.equal(reading.host.phase,'error');assert.equal(reading.host.getStatus().resumable,true);assert.equal(reading.host.owner,'character');assert.equal(destroyed,1);assert.equal(reading.host.captureWindow,null);
        assert.deepEqual(await reading.host.handleSource(sourceEvent,'configuration'),{allowed:false,capture:null});assert.equal((await reading.host.handleSource(sourceEvent,'frame',reading.frame('retired'))).accepted,false,'late IPC from a retired owned source stays inert');assert.equal((await reading.host.handleSource(sourceEvent,'started')).ok,false);assert.equal(reading.host.phase,'error','late startup cannot restart a retired source');
        const enumerate=reading.host.electron.desktopCapturer.getSources;reading.host.electron.desktopCapturer.getSources=async()=>[];
        await reading.host.resume();assert.equal(reading.host.phase,'error');assert.equal(reading.host.owner,'character');assert.match(reading.host.error,/no longer available/,'missing sources remain explicitly resumable without starting a replacement');
        reading.host.electron.desktopCapturer.getSources=enumerate;
        await reading.host.resume();assert.equal(reading.host.phase,'running');assert.equal(reading.host.sessionId,'persistent-character','explicit recovery preserves the walkthrough session');
        await reading.host.stop({mode:'character'});assert.equal(reading.host.owner,null);assert.equal(reading.host.getStatus().resumable,false);await assert.rejects(reading.host.resume(),/Choose/);
    }finally{await reading.host.dispose();}
}
{
    const reading=fixture();let release;
    try{
        await reading.host.listSources();await reading.host.start({mode:'character',sourceId:'window:game'});await reading.host.pause();
        reading.host.electron.desktopCapturer.getSources=()=>new Promise(resolve=>{release=resolve;});
        const resuming=reading.host.resume();await reading.host.stop();release([{id:'window:game',name:'EverQuest'}]);await resuming;
        assert.equal(reading.host.enabled,false);assert.equal(reading.host.owner,null);assert.equal(reading.host.phase,'disabled','source enumeration cannot restart after explicit Stop');
    }finally{await reading.host.dispose();}
}
{
    const recovered=fixture();let destroyed=0;
    try{
        await recovered.host.listSources();await recovered.host.start({mode:'character',sourceId:'window:game',sessionId:'baseline-recovery'});
        const contents=new EventEmitter();contents.mainFrame={url:`${origin}/capture-source.html`};
        const window={webContents:contents,isDestroyed:()=>false,destroy(){destroyed++;}};
        recovered.host.captureWindow=window;const sourceEvent={sender:contents,senderFrame:contents.mainFrame};
        await readFrame(recovered,'preview-before-held-acquisition');const count=recovered.observations.length;
        recovered.tick();recovered.host.submitFrame(recovered.frame('old-active'));await recovered.waitForRead();
        const changing=recovered.host.setRegion({sourceId:'window:game',sessionId:'baseline-recovery',referenceSize:{width:100,height:40},region:{x:0,y:0,width:.5,height:1}});
        assert.equal(recovered.host.getStatus().reconfiguring,true,'the OCR cancellation hold is exposed immediately');assert.equal(recovered.host.getStatus().reading,false);
        const heldConfiguration=recovered.host.handleSource(sourceEvent,'configuration');
        const advertised=await recovered.host.handleSource(sourceEvent,'configuration');assert.equal(advertised.intervalMs,1000);assert.equal(advertised.encodeIntervalMs,1000);assert.equal(advertised.heartbeatMs,1000);
        assert(recovered.main.webContents.sent.some(([channel,value])=>channel==='eye-of-zomm:capture-status'&&value.reconfiguring===true),'the main renderer receives the reconfiguring state before cancellation awaits');
        assert.equal((await changing).reconfiguring,false,'the IPC result cannot overwrite the final status event with the old hold state');assert.equal((await heldConfiguration).capture,null);assert.equal(recovered.host.getStatus().reconfiguring,false);assert.equal(recovered.observations.length,count,'pre-calibration OCR remains cancelled');
        const calibrationGeneration=recovered.host.generation;
        recovered.tick();const retiredFrame=recovered.frame('late-stalled-source');recovered.host.submitFrame(recovered.frame('active-at-source-stall'));await recovered.waitForRead();
        await recovered.host.handleSource(sourceEvent,'error','Screen capture stalled while preparing a frame. Resume capture or restart screen reading to continue.');
        assert.equal(destroyed,1,'an acquisition deadline retires the stalled source renderer');assert.equal(recovered.host.captureWindow,null);assert.equal(recovered.host.getStatus().resumable,true);assert.equal(recovered.host.phase,'error');assert.match(recovered.host.getStatus().error,/stalled.*Resume/);assert.equal(recovered.host.getStatus().queuedFrames,0);assert.equal(recovered.observations.length,count);
        await recovered.host.start({mode:'character',sourceId:'window:game',sessionId:'baseline-recovery',region:null,referenceSize:null});
        assert.equal(recovered.host.phase,'running');assert.equal(recovered.host.sessionId,'baseline-recovery');assert.equal(recovered.host.region,null);assert.ok(recovered.host.generation>calibrationGeneration);
        assert.equal(recovered.host.submitFrame(retiredFrame).stale,true,'the recovered session rejects pixels encoded by the retired generation');assert.equal((await recovered.host.handleSource(sourceEvent,'frame',retiredFrame)).accepted,false,'retired renderer IPC cannot reach the replacement');
        await readFrame(recovered,'fresh-full-frame-baseline');assert.equal(recovered.observations.length,count+1);assert.equal(recovered.observations.at(-1).sessionId,'baseline-recovery');assert.equal(recovered.observations.at(-1).input.captureGeneration,recovered.host.generation);assert.deepEqual(recovered.observations.at(-1).input.region,{x:0,y:0,width:100,height:40});
    }finally{await recovered.host.dispose();}
}
const imported=fixture(),temporary=await mkdtemp(join(tmpdir(),'eoz-capture-import-'));
try{
    const target=join(temporary,'synthetic.png');await writeFile(target,png());
    imported.host.electron.dialog={showOpenDialog:async()=>({filePaths:[target],canceled:false})};
    const pending=imported.host.importImage({mode:'character',sessionId:'offline-character'});
    await imported.waitForRead();imported.resolve(CHARACTER_TEXT);
    const result=await pending;
    assert.equal(result.records[0].owner,'character');assert.equal(result.records[0].sessionId,'offline-character');
    assert.equal(result.records[0].input.captureGeneration,imported.host.generation,'a manual result carries the exact import generation for phase-invocation review');assert.equal(result.records[0].input.sourceId,null,'an imported PNG never claims a live source');
    assert.equal(imported.host.enabled,false,'an offline Character screenshot never enables persistent capture');
    imported.tick();const repeated=imported.host.importImage({mode:'character',sessionId:'offline-character'});await imported.waitForRead();imported.resolve(CHARACTER_TEXT);const repeatedResult=await repeated;
    assert.equal(repeatedResult.records.length,1,'an explicit second review of the same PNG is not suppressed by live-screen TTL dedup');assert.equal(repeatedResult.records[0].input.frameId,result.records[0].input.frameId);
    assert.ok(repeatedResult.records[0].sequence>result.records[0].sequence);assert.ok(Date.parse(repeatedResult.records[0].capturedAt)>Date.parse(result.records[0].capturedAt));assert.ok(Date.parse(repeatedResult.records[0].capturedAt)-Date.parse(result.records[0].capturedAt)<3000);
    assert.ok(repeatedResult.records[0].input.captureGeneration>result.records[0].input.captureGeneration);assert.equal(repeatedResult.records[0].sessionId,'offline-character');assert.equal(repeatedResult.records[0].kind,'manual');assert.equal(imported.host.enabled,false);assert.equal(imported.host.owner,null,'explicit offline reviews never take over the persistent capture owner');
    await imported.host.listSources();await imported.host.start({mode:'contribution',sourceId:'window:game'});
    imported.tick();imported.host.submitFrame(imported.frame('discard-on-import'));
    const running=imported.host.processing;
    const review=imported.host.importImage({mode:'character',sessionId:'second-character'});
    for(let attempt=0;attempt<200&&!imported.host.hold;attempt++)await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(imported.host.hold,true);assert.equal(imported.host.submitFrame(imported.frame('held')).accepted,false);
    await running;await imported.waitForRead();imported.resolve(CHARACTER_TEXT);
    assert.equal((await review).records[0].owner,'character');assert.equal(imported.host.owner,'contribution');
    assert.equal(imported.host.phase,'running');assert.equal(imported.host.hold,false,'a manual review releases its exclusive worker hold');
    assert.equal(imported.observations.length,3,'only three explicit manual reviews emit; cancelled live OCR cannot leak into the manual character review');
    const itemOnly=imported.host.importImage({mode:'character',sessionId:'character-does-not-read-items'});await imported.waitForRead();imported.resolve('Item: Synthetic Unwanted Gear\nSlot: HEAD\nHP 999');assert.equal((await itemOnly).records.length,0,'Character screenshot review cannot create gear records from an item-only pane');assert.equal(imported.observations.length,3);
}finally{await imported.host.dispose();await rm(temporary,{recursive:true,force:true});}
async function readFrame(fixture,id,width=100,height=40){fixture.tick();assert.equal(fixture.host.submitFrame(fixture.frame(id,width,height)).accepted,true);await fixture.waitForRead();fixture.resolve();await fixture.host.processing;}
{
    const calibrated=fixture(),area={x:.1,y:.25,width:.6,height:.5},referenceSize={width:100,height:40};
    try{
        await calibrated.host.listSources();await calibrated.host.start({mode:'contribution',sourceId:'window:game',sessionId:'calibration-contribution'});
        assert.throws(()=>calibrated.host.preview(),/wait for a frame/);await readFrame(calibrated,'preview');
        const count=calibrated.journal.records.length,preview=await calibrated.host.handle(calibrated.event,'preview');
        assert.equal(preview.sourceId,'window:game');assert.equal(preview.sessionId,'calibration-contribution');assert.deepEqual(preview.sourceSize,referenceSize);assert.match(preview.dataUrl,/^data:image\/png;base64,/);assert.equal(calibrated.journal.records.length,count,'a preview never journals screen pixels');
        const request={sourceId:preview.sourceId,sessionId:preview.sessionId,referenceSize,region:area},generation=calibrated.host.generation;
        await assert.rejects(calibrated.host.setRegion({...request,sourceId:'screen:one'}),/Capture changed/);await assert.rejects(calibrated.host.setRegion({...request,sessionId:'stale-session'}),/Capture changed/);
        await assert.rejects(calibrated.host.setRegion({...request,referenceSize:{width:200,height:40}}),/Capture size changed/);
        await assert.rejects(calibrated.host.start({mode:'contribution',sourceId:'window:game',region:area}),/capture preview/);
        for(const region of [{...area,x:-.1},{...area,width:1},{...area,width:.01},{...area,height:NaN}])await assert.rejects(calibrated.host.setRegion({...request,region}),/Select a capture region/);
        assert.equal(calibrated.host.generation,generation,'invalid/stale calibration does not cancel the active session');
        await calibrated.host.setRegion(request);const reads=calibrated.ocr.calls;await readFrame(calibrated,'cropped');assert.equal(calibrated.ocr.calls,reads+1,'the no-box mock follows the single scene pass');
        assert.deepEqual(calibrated.submitted.at(-1),{width:180,height:60});assert.deepEqual(calibrated.crops.at(-1),{x:10,y:10,width:60,height:20});
        const cropped=calibrated.observations.at(-1);assert.deepEqual(cropped.input.sourceSize,referenceSize);assert.deepEqual(cropped.input.region,{x:10,y:10,width:60,height:20});assert.equal(cropped.input.scale,3);assert.equal(cropped.owner,'contribution');assert.equal(cropped.input.ocrPasses.length,1);
        await calibrated.host.setRegion({...request,region:null,referenceSize:null});assert.equal(calibrated.host.region,null);assert.equal(calibrated.host.referenceSize,null);await readFrame(calibrated,'full-after-reset');assert.deepEqual(calibrated.observations.at(-1).input.region,{x:0,y:0,width:100,height:40});
        await calibrated.host.setRegion(request);calibrated.tick();calibrated.host.submitFrame(calibrated.frame('pre-resize'));await calibrated.waitForRead();const beforeResize=calibrated.observations.length;
        calibrated.tick();calibrated.host.submitFrame(calibrated.frame('resized',200,40));assert.equal(calibrated.host.region,null);assert.equal(calibrated.host.referenceSize,null);assert.match(calibrated.host.calibrationWarning,/size changed/);
        calibrated.resolve();await new Promise(resolve=>setImmediate(resolve));await calibrated.waitForRead();calibrated.resolve();await calibrated.host.processing;
        assert.equal(calibrated.observations.length,beforeResize+1,'the cancelled pre-resize result never enters either queue');assert.deepEqual(calibrated.observations.at(-1).input.region,{x:0,y:0,width:200,height:40});assert.deepEqual(calibrated.observations.at(-1).input.sourceSize,{width:200,height:40});
        await assert.rejects(calibrated.host.setRegion(request),/Capture size changed/);
        await calibrated.host.start({mode:'contribution',sourceId:'window:game',sessionId:'replacement-calibration-session'});await readFrame(calibrated,'replacement-session',200,40);await assert.rejects(calibrated.host.setRegion(request),/Capture changed/,'a preview from the prior session is stale even on the same source');
        await calibrated.host.stop();assert.throws(()=>calibrated.host.preview(),/Start capture/);assert.doesNotMatch(JSON.stringify(calibrated.journal.records),/data:image|base64|"png"/);
    }finally{await calibrated.host.dispose();}
}
{
    const calibrated=fixture(),referenceSize={width:100,height:40},contributionArea={x:0,y:0,width:.5,height:1},characterArea={x:.4,y:0,width:.6,height:1};
    try{
        await calibrated.host.listSources();await calibrated.host.start({mode:'contribution',sourceId:'window:game',sessionId:'resume-contribution',region:contributionArea,referenceSize});await readFrame(calibrated,'contribution-region');
        await calibrated.host.start({mode:'character',sourceId:'window:game',sessionId:'region-character'});assert.equal(calibrated.host.region,null);await readFrame(calibrated,'character-preview');
        calibrated.tick();calibrated.host.submitFrame(calibrated.frame('before-calibration'));await calibrated.waitForRead();const count=calibrated.observations.length;
        const changing=calibrated.host.setRegion({sourceId:'window:game',sessionId:'region-character',region:characterArea,referenceSize});assert.equal(calibrated.host.submitFrame(calibrated.frame('during-calibration')).accepted,false);await changing;assert.equal(calibrated.observations.length,count,'calibration cancellation cannot leak the old OCR result');assert.equal(calibrated.host.phase,'running');await readFrame(calibrated,'character-region');assert.deepEqual(calibrated.observations.at(-1).input.region,{x:40,y:0,width:60,height:40});
        await calibrated.host.stop({mode:'character'});assert.equal(calibrated.host.owner,'contribution');assert.equal(calibrated.host.sessionId,'resume-contribution');assert.deepEqual(calibrated.host.region,contributionArea);assert.deepEqual(calibrated.host.referenceSize,referenceSize);await readFrame(calibrated,'restored-contribution');assert.deepEqual(calibrated.observations.at(-1).input.region,{x:0,y:0,width:50,height:40});
        calibrated.tick();calibrated.host.submitFrame(calibrated.frame('stop-during-calibration'));await calibrated.waitForRead();const beforeStop=calibrated.observations.length;
        const calibration=calibrated.host.setRegion({sourceId:'window:game',sessionId:'resume-contribution',region:null});const stopping=calibrated.host.stop();await Promise.all([calibration,stopping]);assert.equal(calibrated.host.phase,'disabled');assert.equal(calibrated.host.enabled,false);assert.equal(calibrated.host.hold,false);assert.equal(calibrated.observations.length,beforeStop);assert.deepEqual(calibrated.host.region,contributionArea,'a superseded calibration cannot change the stopped session region');
    }finally{await calibrated.host.dispose();}
}
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
{
    const queued=fixture(),captured=[];
    try{
        await queued.host.listSources();await queued.host.start({mode:'contribution',sourceId:'window:game',sessionId:'brief-tooltips'});
        for(const id of ['amber','beryl','coral']){queued.tick();const frame=queued.frame(id);captured.push(frame.capturedAt);assert.equal(queued.host.submitFrame(frame).accepted,true);if(id==='amber')await queued.waitForRead();}
        assert.equal(queued.host.getStatus().queuedFrames,2);assert.equal(queued.host.getStatus().reading,true);
        assert.equal(queued.host.submitFrame(queued.frame('beryl')).duplicate,true,'an already queued PNG does not consume another slot');
        assert.equal(queued.host.submitFrame(queued.frame('amber')).duplicate,true,'an active PNG does not consume another slot');
        for(const name of ['Amber','Beryl','Coral']){await queued.waitForRead();queued.resolve(`Item: Synthetic ${name}\nAC 12\nHP 45`);await new Promise(resolve=>setImmediate(resolve));}await queued.host.processing;
        assert.deepEqual(queued.observations.map(record=>record.subject.name),['Synthetic Amber','Synthetic Beryl','Synthetic Coral'],'brief A/B/C tooltips survive one slow serial reader in FIFO order');
        assert.deepEqual(queued.observations.map(record=>Date.parse(record.capturedAt)),captured,'queued items preserve pixel time rather than OCR completion time');
        for(const record of queued.observations){assert.equal(record.input.sourceId,'window:game');assert.equal(record.input.captureGeneration,queued.host.generation);assert.equal(record.sessionId,'brief-tooltips');}
        assert.equal(queued.host.getStatus().reading,false);assert.equal(queued.host.getStatus().queuedBytes,0);assert.equal(queued.host.getStatus().lastReadItemCount,1);
    }finally{await queued.host.dispose();}
}
{
    const bounded=fixture();let decoded=0;const decode=bounded.host.electron.nativeImage.createFromBuffer;
    bounded.host.electron.nativeImage.createFromBuffer=bytes=>{decoded++;return decode(bytes);};
    try{
        await bounded.host.listSources();await bounded.host.start({mode:'character',sourceId:'window:game'});bounded.tick();bounded.host.submitFrame(bounded.frame('active'));await bounded.waitForRead();
        for(let index=0;index<20;index++){bounded.tick();bounded.host.submitFrame(bounded.frame(`changed-${index}`));}
        let status=bounded.host.getStatus();assert.equal(status.queuedFrames,status.queueLimit);assert.ok(status.overflowFrames>=8);assert.match(status.readWarning,/could not keep every changing frame/);
        for(let index=0;index<8;index++){bounded.tick();const frame=bounded.frame(`large-${index}`);frame.bytes=Buffer.concat([frame.bytes,Buffer.alloc(8*1024*1024)]);bounded.host.submitFrame(frame);}
        status=bounded.host.getStatus();assert.ok(status.queuedBytes<=status.queueByteLimit,'compressed PNG memory remains bounded during moving backgrounds');assert.ok(status.queuedFrames<status.queueLimit);assert.equal(decoded,1,'queued PNGs are not natively decompressed before their OCR slot');
        await bounded.host.pause();assert.equal(bounded.host.getStatus().queuedFrames,0);assert.equal(bounded.host.getStatus().queuedBytes,0);assert.equal(bounded.observations.length,0,'Pause cancels active and queued work');
    }finally{await bounded.host.dispose();}
}
{
    const expiring=fixture();
    try{
        await expiring.host.listSources();await expiring.host.start({mode:'character',sourceId:'window:game'});expiring.tick();expiring.host.submitFrame(expiring.frame('active'));await expiring.waitForRead();expiring.tick();expiring.host.submitFrame(expiring.frame('expired-queued'));expiring.advance(16000);expiring.resolve();await expiring.host.processing;
        assert.equal(expiring.ocr.calls,1,'queued evidence older than the bounded age is not read later');assert.equal(expiring.host.getStatus().overflowFrames,1);
    }finally{await expiring.host.dispose();}
}
for(const change of ['stop','owner','crop','size']){
    const changed=fixture();
    try{
        await changed.host.listSources();await changed.host.start({mode:'contribution',sourceId:'window:game',sessionId:'old-window'});changed.tick();changed.host.submitFrame(changed.frame('active'));await changed.waitForRead();changed.tick();changed.host.submitFrame(changed.frame('queued-old'));const oldToken=changed.frame('encoded-before-change'),generation=changed.host.generation;
        if(change==='stop')await changed.host.stop();
        if(change==='owner')await changed.host.start({mode:'character',sourceId:'screen:one',sessionId:'new-window'});
        if(change==='crop')await changed.host.setRegion({sourceId:'window:game',sessionId:'old-window',region:{x:0,y:0,width:.5,height:1},referenceSize:{width:100,height:40}});
        if(change==='size'){changed.tick();const resized=changed.frame('new-size',200,40);changed.host.submitFrame(resized);assert.equal(changed.host.generationStartedAt,resized.capturedAt);changed.resolve();await new Promise(resolve=>setImmediate(resolve));await changed.waitForRead();changed.resolve('Item: Synthetic New Size\nAC 7');await changed.host.processing;}
        assert.ok(changed.host.generation>generation);assert.equal(changed.host.submitFrame(oldToken).accepted,false,`${change} rejects PNGs whose encode started in an older generation`);
        assert.equal(changed.observations.length,change==='size'?1:0,`${change} invalidates the old active and queued observations`);assert.equal(changed.host.getStatus().queuedBytes,0);
    }finally{await changed.host.dispose();}
}
{
    const resized=fixture(),pane={selectionKind:'visual-item',visualKey:'0123456789abcdef',itemRegion:{x:0,y:0,width:1,height:1}};
    try{
        await resized.host.listSources();await resized.host.start({mode:'contribution',sourceId:'window:game',sessionId:'resized-pane'});
        resized.tick();resized.host.submitFrame({...resized.frame('before-resize'),...pane});await resized.waitForRead();
        const oldGeneration=resized.host.generation;
        resized.tick();const fresh=resized.frame('after-resize',200,40),admission=resized.host.submitFrame({...fresh,...pane});
        assert.equal(resized.host.generation,oldGeneration+1);assert.equal(resized.host.activeFrameGeneration,oldGeneration,'the old OCR is still completing when the resized frame arrives');
        assert.equal(admission.accepted,true,'an invalidated active pane cannot suppress matching pixels from the new source size');
        assert.equal(resized.host.pending.length,1);assert.equal(resized.host.pending[0].capturedAt,fresh.capturedAt);
        assert.equal(resized.host.submitFrame({...resized.frame('same-current-pane',200,40),...pane}).duplicate,true,'the same pane still coalesces inside the current generation');
        resized.resolve('Item: Synthetic Stale Size\nHP 999');await new Promise(resolve=>setImmediate(resolve));await resized.waitForRead();
        assert.equal(resized.observations.length,0,'the invalidated pre-resize read remains rejected');
        resized.resolve('Item: Synthetic Resized Pane\nHP 7');await resized.host.processing;
        assert.equal(resized.observations.length,1);assert.equal(resized.observations[0].subject.name,'Synthetic Resized Pane');
        assert.equal(resized.observations[0].input.captureGeneration,resized.host.generation);assert.equal(Date.parse(resized.observations[0].capturedAt),fresh.capturedAt);
    }finally{await resized.host.dispose();}
}
{
    const fresh=fixture(),stats='Character Stats\nHP 330/398\nMana 296/296\nSTR 90\nSTA 105';
    try{
        await fresh.host.listSources();await fresh.host.start({mode:'character',sourceId:'window:game'});fresh.tick();fresh.host.submitFrame(fresh.frame('unchanged-empty-inventory'));await fresh.waitForRead();fresh.resolve(stats);await fresh.host.processing;
        const first=fresh.observations[0];assert.equal(first.subject.kind,'character');fresh.tick();const phaseCutoff=Date.parse(first.capturedAt)+100;
        assert.equal(fresh.host.submitFrame(fresh.frame('unchanged-empty-inventory')).duplicate,true,'immediate identical screen pixels stay coalesced');fresh.advance(3100);
        assert.equal(fresh.host.submitFrame(fresh.frame('unchanged-empty-inventory')).accepted,true);await fresh.waitForRead();fresh.resolve(stats);await fresh.host.processing;
        assert.equal(fresh.observations.length,2,'unchanged No Equipment stats can produce fresh baseline evidence after the phase cutoff');assert.ok(Date.parse(fresh.observations[1].capturedAt)>phaseCutoff);assert.equal(fresh.observations[1].fields.find(field=>field.key==='hpMaximum').value,398);
        const context={live:true,at:Date.parse(first.capturedAt),logId:'synthetic-log',cursor:1},event={type:'kill',victim:'Synthetic Rat'};
        assert.equal((await fresh.host.ingestLogObservation(event,context)).accepted,true);fresh.advance(3100);assert.equal((await fresh.host.ingestLogObservation(event,context)).accepted,false,'game-log cursor dedup remains permanent when screenshot dedup expires');
        assert.throws(()=>fresh.host.submitFrame({...fresh.frame('future'),capturedAt:fresh.frame().capturedAt+2000}),/Invalid capture frame/);
    }finally{await fresh.host.dispose();}
}
function visualFrame(f,id,key){return {...f.frame(id),selectionKind:'visual-item',visualKey:key.padStart(16,'0'),itemRegion:{x:.1,y:.1,width:.8,height:.8}};}
{
    const moving=fixture(),times=[];
    try{
        await moving.host.listSources();await moving.host.start({mode:'contribution',sourceId:'window:game',sessionId:'moving-world'});
        const initial=moving.host.submitFrame({...moving.frame('animated-active'),selectionKind:'scene'});
        assert.equal(initial.accepted,true);assert.equal(moving.ocr.calls,0,'frame admission returns before native preparation or OCR starts');await moving.waitForRead();
        for(const [index,name]of ['Amber','Beryl','Coral'].entries()){
            moving.tick();const value=visualFrame(moving,`world-${index}`,String(index+1));times.push(value.capturedAt);assert.equal(moving.host.submitFrame(value).accepted,true);
            assert.equal(moving.host.submitFrame({...value,bytes:png(`other-background-${index}`)}).duplicate,true,'the same visible pane coalesces despite changed world PNG bytes');
            for(let n=0;n<20;n++){moving.advance(200);moving.host.submitFrame({...moving.frame(`background-${index}-${n}`),selectionKind:'scene'});}
        }
        assert.equal(moving.host.getStatus().queuedFrames,4,'three brief item panes and one latest background survive a slow full-scene read');
        assert.deepEqual(moving.host.pending.map(frame=>frame.kind),['visual-item','visual-item','visual-item','scene']);
        assert.equal(moving.host.getStatus().overflowFrames,0,'intentional latest-scene replacement does not falsely report lost candidate items');assert.equal(moving.host.getStatus().captureDiagnostics.sceneReplacements,59);
        moving.resolve('');await new Promise(resolve=>setImmediate(resolve));
        for(const name of ['Amber','Beryl','Coral']){await moving.waitForRead();moving.resolve(`Item: Synthetic ${name}\nHP 45`);await new Promise(resolve=>setImmediate(resolve));}
        await moving.waitForRead();moving.resolve('Character Stats\nHP 330/398\nSTR 90');await moving.host.processing;
        assert.deepEqual(moving.observations.filter(record=>record.subject.kind==='item').map(record=>record.subject.name),['Synthetic Amber','Synthetic Beryl','Synthetic Coral']);
        assert.deepEqual(moving.observations.filter(record=>record.subject.kind==='item').map(record=>Date.parse(record.capturedAt)),times);
        const item=moving.observations[0];assert.equal(item.input.captureSelection,'visual-item');assert.deepEqual(item.input.sourceSize,{width:100,height:40});assert.deepEqual(item.input.region,{x:10,y:4,width:80,height:32});assert.equal(item.sessionId,'moving-world');assert.equal(item.input.sourceId,'window:game');
        assert.equal(moving.observations.at(-1).subject.kind,'character','periodic full-scene baseline evidence is not starved');
        assert.equal(moving.ocr.calls,5);assert.equal(moving.host.getStatus().captureDiagnostics.emptyReads,1);assert.doesNotMatch(JSON.stringify(moving.host.getStatus().captureDiagnostics),/Synthetic|Amber|Beryl|Coral|moving-world|window:game/,'aggregate diagnostics contain no OCR text, item identity or player/source identifiers');
    }finally{await moving.host.dispose();}
}
{
    const guard=fixture();
    try{
        await guard.host.listSources();await guard.host.start({mode:'contribution',sourceId:'window:game'});guard.host.submitFrame(visualFrame(guard,'active','1'));await guard.waitForRead();
        for(let n=0;n<12;n++){guard.tick();guard.host.submitFrame(visualFrame(guard,`item-${n}`,(n+2).toString(16)));}
        assert.equal(guard.host.submitFrame({...guard.frame('low-priority-world'),selectionKind:'scene'}).lowPriority,true,'a new world scene cannot evict a queued item');assert.equal(guard.host.getStatus().queuedFrames,12);
        guard.advance(16000);guard.host.prunePending();assert.equal(guard.host.getStatus().queuedFrames,12,'short item proposals survive a measured 11-second active scene plus serial work');
        guard.advance(45000);guard.host.prunePending();assert.equal(guard.host.getStatus().queuedFrames,0,'candidate retention remains bounded at60seconds');assert.equal(guard.host.getStatus().captureDiagnostics.rejections.age,12);
        assert.throws(()=>guard.host.submitFrame({...visualFrame(guard,'bad','1'),itemRegion:{x:.9,y:0,width:.5,height:1}}),/region/);assert.throws(()=>guard.host.submitFrame({...visualFrame(guard,'bad-key','1'),visualKey:'private text'}),/identity/);
        await guard.host.pause();assert.equal(guard.host.getStatus().queuedBytes,0);assert.equal(guard.observations.length,0);
    }finally{await guard.host.dispose();}
}
{
    const configured=fixture();
    try{
        await configured.host.listSources();await configured.host.start({mode:'character',sourceId:'window:game',region:{x:0,y:0,width:.5,height:1},referenceSize:{width:100,height:40}});
        configured.host.submitFrame({...configured.frame('world-one'),selectionKind:'configured',visualKey:'0000000000000001'});await configured.waitForRead();
        assert.equal(configured.host.submitFrame({...configured.frame('world-two'),selectionKind:'configured',visualKey:'0000000000000001'}).duplicate,true,'configured-region pixels coalesce even if the world outside changed');
        configured.resolve();await configured.host.processing;assert.deepEqual(configured.observations[0].input.region,{x:0,y:0,width:50,height:40});
    }finally{await configured.host.dispose();}
}
{
    const shared=fixture();
    try{
        await shared.host.listSources();await shared.host.start({mode:'contribution',sourceId:'window:game'});shared.host.submitFrame({...visualFrame(shared,'same-pane','1'),sceneFallback:true});await shared.waitForRead();
        assert.equal(shared.host.pending.filter(frame=>frame.kind==='scene').length,1);shared.advance(5100);
        const next={...visualFrame(shared,'new-world-same-pane','1'),sceneFallback:true};assert.equal(shared.host.submitFrame(next).sceneAccepted,true,'an active duplicate item still refreshes fallback without losing any new candidate');
        const scene=shared.host.pending.find(frame=>frame.kind==='scene');assert.equal(scene.capturedAt,next.capturedAt);assert.equal(scene.region,null);assert.equal(scene.png,shared.host.lastFrame.png,'fallback is a reference to the exact same immutable full PNG');assert.equal(shared.host.queuedBytes,scene.png.length,'replacement accounting remains exact');
        await shared.host.stop();assert.equal(shared.host.queuedBytes,0);assert.equal(shared.observations.length,0);
    }finally{await shared.host.dispose();}
}
{
    const canceled=fixture();try{await canceled.host.listSources();await canceled.host.start({mode:'contribution',sourceId:'window:game'});canceled.host.submitFrame(visualFrame(canceled,'deferred','1'));await canceled.host.stop();assert.equal(canceled.ocr.calls,0,'Stop before the deferred pump starts cannot revive OCR');assert.equal(canceled.host.queuedBytes,0);}finally{await canceled.host.dispose();}
}
{
    const fair=fixture();try{
        await fair.host.listSources();await fair.host.start({mode:'contribution',sourceId:'window:game'});fair.host.submitFrame({...visualFrame(fair,'first','1'),sceneFallback:true});await fair.waitForRead();for(let n=2;n<=4;n++){fair.tick();fair.host.submitFrame(visualFrame(fair,`next-${n}`,String(n)));}
        for(let n=1;n<=3;n++){assert.equal(fair.host.activeFrameHash,`pane:${String(n).padStart(16,'0')}`);fair.resolve(`Item: Synthetic Fair ${n}\nHP ${n}`);await new Promise(resolve=>setImmediate(resolve));await fair.waitForRead();}
        assert.match(fair.host.activeFrameHash,/^frame:/,'a full-scene job runs after three candidates even when more items remain');fair.resolve('Character Stats\nHP 330/398\nSTR 90');await new Promise(resolve=>setImmediate(resolve));await fair.waitForRead();assert.equal(fair.host.activeFrameHash,'pane:0000000000000004');fair.resolve('Item: Synthetic Fair Four\nHP 4');await fair.host.processing;
    }finally{await fair.host.dispose();}
}
console.log('Capture host: animated-world scene replacement, item-priority ROI/FIFO, bounded candidate retention, frame admission before preprocessing, private aggregate diagnostics and original lifecycle/provenance checks passed.');
{
    const pasted=fixture();let clipboardReads=0,dialogs=0;
    try{
        pasted.host.electron.dialog={showOpenDialog:async()=>{dialogs++;return{canceled:true};}};
        pasted.host.electron.clipboard.readImage=()=>{clipboardReads++;return{isEmpty:()=>true};};
        assert.equal(clipboardReads,0,'Creating the workspace never reads clipboard images');
        await assert.rejects(pasted.host.importImage({source:'arbitrary'}),/file or paste/);assert.equal(clipboardReads,0);
        await assert.rejects(pasted.host.importImage({source:'clipboard'}),/Copy an item screenshot/);assert.equal(pasted.ocr.calls,0);assert.equal(pasted.host.hold,false);
        pasted.host.electron.clipboard.readImage=()=>{clipboardReads++;return{isEmpty:()=>false,getSize:()=>({width:8192,height:8192}),toPNG:()=>{throw Error('Must reject dimensions before encoding');}};};
        await assert.rejects(pasted.host.importImage({source:'clipboard'}),/16 megapixels/);assert.equal(pasted.ocr.calls,0);
        pasted.host.electron.clipboard.readImage=()=>{clipboardReads++;return pasted.host.electron.nativeImage.createFromBuffer(png('clipboard-item'));};
        const pending=pasted.host.importImage({mode:'contribution',sessionId:'explicit-paste',source:'clipboard'});
        await pasted.waitForRead();pasted.resolve('Item: Synthetic Clipboard Helm +3\nSlot: HEAD\nAC 12\nHP 45\n5 empty slots');
        const result=await pending;assert(result.records.length>0);assert.equal(dialogs,0,'Explicit paste does not open the file picker');
        for(const record of result.records){assert.equal(record.kind,'manual');assert.equal(record.owner,'contribution');assert.equal(record.sessionId,'explicit-paste');assert.equal(record.input.sourceId,null);assert.equal(record.input.captureGeneration,1);}
        assert.equal(pasted.host.hold,false,'Capture is released after pasted-image OCR');
    }finally{await pasted.host.dispose();}
}
console.log('Capture clipboard import: explicit request only, image/dimension bounds, no file dialog, manual session and generation provenance passed.');
{
    const evidence=fixture(),area={x:.1,y:.1,width:.5,height:.6},size={width:800,height:600};
    try{
        await evidence.host.listSources();await evidence.host.start({mode:'contribution',sourceId:'window:game',sessionId:'item-evidence'});
        evidence.tick();evidence.host.submitFrame({...evidence.frame('exact-item-frame',800,600),selectionKind:'visual-item',itemRegion:area,visualKey:'0123456789abcdef'});await evidence.waitForRead();evidence.resolve();await evidence.host.processing;
        const record=evidence.observations[0],proof=record.input.captureEvidence;assert(proof,'Single item OCR with a selected ROI provides an image capability');assert.equal(proof.observationId,record.id);assert.equal(proof.frameId,record.input.frameId);
        const nativeReading=evidence.host.getItemEvidence(proof),originalName=nativeReading.observation.subject.name;nativeReading.observation.subject.name='Mutated copy';record.subject.name='Renderer-side mutation';assert.equal(evidence.host.getItemEvidence(proof).observation.subject.name,originalName,'Automatic contributions retain the exact native OCR object rather than mutable renderer evidence');
        await assert.rejects(evidence.host.handle({sender:{},senderFrame:evidence.main.webContents.mainFrame},'item-evidence',proof),/main app/);
        const image=await evidence.host.handle(evidence.event,'item-evidence',proof);assert.deepEqual({width:image.width,height:image.height},{width:400,height:360});assert.equal(image.iconDataUrl,undefined,'An unproven icon crop is omitted');assert.deepEqual(image.proof,proof);
        assert.equal(Buffer.from(image.dataUrl.split(',')[1],'base64').readUInt32BE(16),400);assert.doesNotMatch(JSON.stringify(evidence.journal.records),/data:image|base64|"png"/,'Only bounded capability metadata, never pixels, enters the journal');
        evidence.host.lastFrame={png:png('unrelated-latest',800,600),at:1100,sourceId:'window:game'};assert.equal(evidence.host.itemEvidence(proof).dataUrl,image.dataUrl,'A later preview cannot replace the observation-bound crop');
        for(const key of ['token','observationId','frameId','sessionId','generation','sourceId','capturedAt'])assert.throws(()=>evidence.host.itemEvidence({...proof,[key]:key==='generation'?proof.generation+1:'different'}),/no longer current/);
        evidence.advance(30001);assert.throws(()=>evidence.host.itemEvidence(proof),/no longer current/);assert.equal(evidence.host.itemEvidenceFrames.size,0);
        const context={frame:{owner:'contribution',sessionId:evidence.host.sessionId,generation:evidence.host.generation,sourceId:'window:game',capturedAt:31101,hash:'private-frame',kind:'visual-item',configuredRegion:false,region:area,size},image:evidence.host.electron.nativeImage.createFromBuffer(png('crop',800,600)),input:{region:{x:80,y:60,width:400,height:360},scale:3},result:{words:[]}};
        const observation={kind:'ocr',owner:'contribution',sessionId:evidence.host.sessionId,capturedAt:new Date(31101).toISOString(),parser:{name:'item-examine'},subject:{kind:'item',name:'Synthetic Evidence'},fields:[]};
        for(const [name,change] of [['scene',{frame:{...context.frame,kind:'scene'}}],['configured',{frame:{...context.frame,kind:'configured'}}],['calibrated-visual',{frame:{...context.frame,configuredRegion:true}}],['whole-scene',{input:{region:{x:0,y:0,width:800,height:600}}}]])assert.equal(evidence.host.prepareItemEvidence(observation,{...context,...change},name),null,'No '+name+' screenshot can be offered');
        assert.equal(evidence.host.prepareItemEvidence({...observation,kind:'manual'},context,'manual'),null);assert.equal(evidence.host.prepareItemEvidence({...observation,owner:'character'},context,'character'),null);
        let latest;for(let index=0;index<8;index++)latest=evidence.host.prepareItemEvidence(observation,context,'bounded-'+index);assert.equal(evidence.host.itemEvidenceFrames.size,6,'Ephemeral crops have a fixed count bound');
        await evidence.host.handle(evidence.event,'clear-history');assert.equal(evidence.host.itemEvidenceFrames.size,0,'Clearing history revokes every image capability');latest=evidence.host.prepareItemEvidence(observation,context,'after-clear');
        await evidence.host.start({mode:'character',sourceId:'window:game',sessionId:'character-owning-source'});assert.throws(()=>evidence.host.itemEvidence(latest),/no longer current/);assert.equal(evidence.host.itemEvidenceFrames.size,0,'Owner/session generation changes destroy old image capabilities');
    }finally{await evidence.host.dispose();}
}
console.log('Capture item evidence: exact ROI/frame proof, main-frame guard, no scene/manual/Character images, private metadata, expiry/capacity and owner/session invalidation passed.');
{
    const logging=fixture();try{
        const append=logging.journal.append.bind(logging.journal);logging.journal.append=async value=>{logging.host.advanceGeneration();return append(value);};
        const result=await logging.host.ingestLogObservation({type:'loot',item:'Synthetic Concurrent Ring',source:'Synthetic Rat',sourceEvidence:{kind:'explicit-corpse'}},{live:true,at:1000,zone:'Synthetic Zone',cursor:1});
        assert.equal(result.accepted,true);assert.equal(logging.observations.length,1,'A capture generation change during journal append cannot discard independent native game-log evidence');
    }finally{await logging.host.dispose();}
}
