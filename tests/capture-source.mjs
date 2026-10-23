import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../app/capture-source.js',import.meta.url),'utf8');
async function fixture({readyState=2,frameFailure=false,drawFailure=false,delayedBytes=false,delayedFrame=false,automatic=false,visualPixels=null,advanceAfterDraw=0,bitmapFailure=false,transferFailure=false,delayedBitmap=false}={}){
    const signals=[],signalValues=[],frames=[],timers=[],events={},tracks=new Map(),requests=[],canvases=[],workers=[],bitmaps=[];let stops=0,release,releaseFrame,releaseBitmap,now=1000,encodes=0,captureAvailable=true,sourceDraws=0;
    const capture={generation:1,owner:'character',sessionId:'source-session',sourceId:'window:synthetic',region:automatic?null:{x:0,y:0,width:1,height:1}};
    const video={readyState,videoWidth:visualPixels?1600:100,videoHeight:visualPixels?1000:40,picture:1,panePicture:1,async play(){}},track={addEventListener:(name,fn)=>tracks.set(name,fn),stop(){stops++;tracks.get('ended')?.();}};
    const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
    class Clock extends Date{static now(){return now;}}
    class PngWorker{
        constructor(url){assert.equal(url,'./capture-png.worker.js');workers.push(this);}
        postMessage(value,transfer){
            if(transferFailure){transferFailure=false;throw Error('Synthetic transfer failure.');}
            assert.equal(transfer.length,1);assert.equal(transfer[0],value.bitmap);assert.equal(value.width,value.bitmap.width);assert.equal(value.height,value.bitmap.height);this.request=value;encodes++;
            const bytes=Uint8Array.from([value.bitmap.picture]).buffer;value.bitmap.close();
            const respond=()=>this.onmessage?.({data:{id:value.id,ok:true,width:value.width,height:value.height,bytes}});
            if(delayedBytes)release=respond;else void Promise.resolve().then(respond);
        }
        terminate(){this.terminated=true;}
    }
    const context=vm.createContext({Uint8Array,ArrayBuffer,Date:Clock,console,Worker:PngWorker,createImageBitmap:canvas=>{
        if(bitmapFailure){bitmapFailure=false;return Promise.reject(Error('Synthetic bitmap failure.'));}
        const bitmap={width:canvas.width,height:canvas.height,picture:canvas.__picture,close(){this.closed=true;}};bitmaps.push(bitmap);
        return delayedBitmap?new Promise(resolve=>{releaseBitmap=()=>resolve(bitmap);}):Promise.resolve(bitmap);
    },setTimeout:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.cancelled=true;},
        navigator:{mediaDevices:{getDisplayMedia:async options=>{requests.push(options);return stream;}}},document:{getElementById:()=>video,createElement:()=>{let picture;const canvas={width:0,height:0,getContext:()=>({drawImage(...args){if(drawFailure){drawFailure=false;throw Error('A transient blank frame.');}const image=args[0],fromVideo=image===video;canvas.__picture=fromVideo?video.picture:image.__picture;canvas.__panePicture=fromVideo?video.panePicture:image.__panePicture;picture=args.length===9&&args[3]<(fromVideo?video.videoWidth:image.width)?canvas.__panePicture:canvas.__picture;if(fromVideo&&++sourceDraws===advanceAfterDraw){video.picture=2;video.panePicture=2;}},getImageData:()=>({data:canvas.width>256&&visualPixels?visualPixels:new Uint8Array([picture,2,3,255])})}),toBlob:()=>{throw Error('Renderer PNG encoding must never be used.');}};canvases.push(canvas);return canvas;}},
        window:{eyeOfZommCaptureSource:{state:async()=>({allowed:true,capture:captureAvailable?{...capture}:null}),frame:async frame=>{if(frameFailure){frameFailure=false;throw Error('Transient IPC rejection.');}frames.push(frame);if(delayedFrame)await new Promise(resolve=>{releaseFrame=resolve;});return{accepted:true};},signal:async(action,value)=>{signals.push(action);signalValues.push({action,value});}},addEventListener:(name,fn)=>{events[name]=fn;}}});
    vm.runInContext(source,context);await context.window.startScreenReadCapture();
    const drain=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};await drain();
    return{frames,signals,signalValues,video,events,tracks,drain,requests,capture,workers,bitmaps,sourceDraws:()=>sourceDraws,workingFrames:()=>canvases.slice(2).filter(canvas=>canvas.width>1&&canvas.height>1).length,key:value=>{context.pixelTest=Uint8Array.from([value,2,3,255]);return vm.runInContext('pixelKey(pixelTest)',context);},available:value=>{captureAvailable=value;},queue:()=>vm.runInContext('({count:snapshots.length,bytes:pendingBytes,encoding})',context),detect:value=>{context.visualTest=value;return vm.runInContext('detectItemPanes(visualTest)',context);},encodes:()=>encodes,stops:()=>stops,advance:ms=>{now+=ms;},next:async(ms)=>{const index=timers.findIndex(timer=>!timer.cancelled&&timer.delay===125);assert.ok(index>=0,'sampling remains scheduled');const [timer]=timers.splice(index,1);now+=ms??timer.delay;void timer.fn();await drain();},timeout:async()=>{const timer=timers.find(timer=>!timer.cancelled&&timer.delay===15000);assert(timer);now+=timer.delay;timer.fn();await drain();},release:()=>release?.(),releaseFrame:()=>releaseFrame?.(),releaseBitmap:()=>releaseBitmap?.()};
}
for(const options of [{frameFailure:true},{drawFailure:true}]){
    const f=await fixture(options);assert.deepEqual(f.signals.filter(action=>action!=='sample-drop'),['started','frame-error']);assert.equal(f.stops(),0,'transient frame failures do not end the authorized stream');await f.next(750);assert.equal(f.frames.length,1,'later valid frames continue in the same stream');f.events.pagehide();assert.equal(f.stops(),1);assert.equal(f.signals.includes('ended'),false,'explicit disposal cannot masquerade as lost permission');
}
{
    const f=await fixture({readyState:0});assert.equal(f.frames.length,0);assert.equal(f.stops(),0);f.video.readyState=2;await f.next();assert.equal(f.frames.length,1,'a temporarily blank/minimized source keeps sampling');f.tracks.get('ended')();await f.drain();assert.equal(f.signals.at(-1),'ended');assert.equal(f.stops(),1,'real source loss releases the stream without restarting it');
}
{
    const f=await fixture({delayedBytes:true});f.events.pagehide();f.release();await f.drain();assert.equal(f.frames.length,0,'an encode finishing after cancellation cannot post pixels');assert.equal(f.signals.includes('ended'),false);
}
{
    const f=await fixture();assert.equal(f.requests[0].video.frameRate.ideal,8);assert.equal(f.requests[0].video.frameRate.max,8);
    for(let n=0;n<5;n++)await f.next();assert.equal(f.encodes(),1,'unchanged cheap comparisons do not repeatedly encode full PNGs');await f.next();assert.equal(f.encodes(),2,'an unchanged frame heartbeat permits fresh phase evidence');
    f.video.picture=2;await f.next();assert.equal(f.encodes(),2,'changed scenes still respect four PNGs per second');await f.next();assert.equal(f.encodes(),3);f.video.picture=3;await f.next();await f.next();assert.deepEqual(f.frames.slice(-2).map(frame=>frame.bytes[0]),[2,3],'brief distinct source changes are sampled separately');f.events.pagehide();
}
{
    const f=await fixture({delayedFrame:true});for(let n=0;n<8;n++)await f.next();assert.equal(f.encodes(),1,'one unresolved IPC admission cannot spawn an encoding storm');f.releaseFrame();await f.drain();f.video.picture=9;await f.next();assert.equal(f.frames.length,2,'sampling continues when admission recovers');f.events.pagehide();f.releaseFrame();
}
{
    const f=await fixture({delayedBytes:true});f.advance(2000);f.capture.generation++;f.release();await f.drain();assert.equal(f.frames.length,0,'a changed generation cancels an encode before IPC delivery');f.events.pagehide();
}
{
    const f=await fixture({delayedBytes:true});f.video.picture=2;await f.next(250);f.video.picture=3;await f.next(250);
    assert.equal(f.encodes(),1,'slow PNG encoding remains serial while sampling continues');assert.equal(f.queue().count,2,'two different short-lived frames are snapshotted before the encoder finishes');
    for(let n=0;n<3;n++){f.release();await f.drain();}
    assert.deepEqual(f.frames.map(frame=>frame.bytes[0]),[1,2,3]);assert.deepEqual(f.frames.map(frame=>frame.capturedAt),[1000,1250,1500],'queued pixels retain acquisition times rather than encode completion');assert.equal(f.queue().count,0);f.events.pagehide();
}
{
    const f=await fixture({delayedBytes:true});f.video.picture=2;await f.next(250);const phaseCutoff=1300;await f.next(750);assert.equal(f.queue().count,1,'an unchanged pending pane coalesces without allocating another snapshot');f.release();await f.drain();f.release();await f.drain();assert.equal(f.frames[1].capturedAt,1250);assert.ok(f.frames[1].capturedAt<phaseCutoff,'a post-cutoff heartbeat cannot replace an eligible pre-cutoff item timestamp');f.events.pagehide();
}
{
    const f=await fixture({delayedBytes:true});f.video.videoWidth=3840;f.video.videoHeight=2100;
    for(const value of [2,3,4,5]){f.video.picture=value;await f.next(250);}
    assert.equal(f.queue().count,2);assert.equal(f.queue().bytes,3840*2100*4*2);assert.ok(f.queue().bytes<=64*1024*1024);
    assert.ok(f.signalValues.some(signal=>signal.action==='sample-drop'&&signal.value.reason==='capacity'),'a displaced candidate is counted instead of silently discarded');
    f.events.pagehide();assert.equal(f.queue().bytes,0);f.release();await f.drain();assert.equal(f.frames.length,0,'Stop releases pending canvases and invalidates the active encode');
}
{
    const f=await fixture({delayedBytes:true});f.video.videoWidth=4000;f.video.videoHeight=2160;
    for(const value of [2,3,4]){f.video.picture=value;await f.next(250);}
    assert.equal(f.queue().count,1,'the decoded pixel-byte bound applies even before the two-frame count bound');assert.ok(f.queue().bytes<=64*1024*1024);f.events.pagehide();f.release();await f.drain();
}
for(const change of [capture=>capture.generation++,capture=>capture.owner='contribution',capture=>capture.sessionId='replacement',capture=>capture.sourceId='window:replacement',capture=>capture.region={x:0,y:0,width:.5,height:.5}]){
    const f=await fixture({delayedBytes:true});f.video.picture=2;await f.next(250);change(f.capture);f.video.picture=3;await f.next(250);assert.equal(f.queue().count,0,'source/session/owner/generation/crop changes release prior queued pixels and immediately start only the new generation');assert.equal(f.workers[0].terminated,true);f.release();await f.drain();assert.deepEqual(f.frames.map(frame=>frame.bytes[0]),[3]);f.events.pagehide();
}
for(const options of [{bitmapFailure:true},{transferFailure:true}]){
    const f=await fixture(options);assert.equal(f.frames.length,0);assert.equal(f.workers[0].terminated,true);assert(f.signalValues.some(signal=>signal.action==='sample-drop'&&signal.value.reason==='encode'));
    await f.next(750);assert.equal(f.frames.length,1,'a bitmap/transfer failure is visible and a later current frame starts a replacement worker');assert.equal(f.workers.length,2);assert.ok(f.bitmaps.every(bitmap=>bitmap.closed));f.events.pagehide();
}
{
    const f=await fixture({delayedBytes:true});assert.equal(f.workingFrames(),0,'the original full canvas is released immediately after bitmap transfer');assert.equal(f.encodes(),1);
    const worker=f.workers[0],request=worker.request;worker.onmessage({data:{id:request.id+1,ok:true,width:request.width,height:request.height,bytes:Uint8Array.from([99]).buffer}});await f.drain();assert.equal(f.frames.length,0,'an unrelated reply cannot complete the active job');
    f.release();await f.drain();await f.next(750);assert.equal(f.workers.length,1,'one healthy worker is reused for serial frames');f.release();await f.drain();f.events.pagehide();assert.equal(worker.terminated,true);
}
for(const action of ['onerror','onmessageerror','malformed','timeout']){
    const f=await fixture({delayedBytes:true}),old=f.workers[0],request=old.request;
    if(action==='timeout')await f.timeout();else if(action==='malformed'){old.onmessage({data:{id:request.id,ok:true,width:request.width+1,height:request.height,bytes:Uint8Array.from([99]).buffer}});await f.drain();}else{old[action]({preventDefault(){}});await f.drain();}
    assert.equal(old.terminated,true);assert.equal(f.frames.length,0);assert(f.signalValues.some(signal=>signal.action==='sample-drop'&&signal.value.reason==='encode'));
    f.video.picture=2;await f.next(750);const replacement=f.workers.at(-1);assert.notEqual(old,replacement);
    old.onmessage({data:{id:replacement.request.id,ok:true,width:replacement.request.width,height:replacement.request.height,bytes:Uint8Array.from([99]).buffer}});old.onerror({preventDefault(){}});await f.drain();assert.equal(replacement.terminated,undefined,'an old worker cannot settle or terminate its replacement');assert.equal(f.frames.length,0);
    f.release();await f.drain();assert.deepEqual(f.frames.map(frame=>frame.bytes[0]),[2]);f.events.pagehide();
}
{
    const f=await fixture({delayedBitmap:true});assert.equal(f.bitmaps.length,1);for(let n=0;n<8;n++){f.capture.generation++;f.video.picture++;await f.next(250);}
    assert.equal(f.bitmaps.length,1,'context churn cannot accumulate uncancellable bitmap acquisitions');assert.ok(f.queue().count<=2);assert.equal(f.encodes(),0);assert.equal(f.workers.length,1);
    f.releaseBitmap();await f.drain();assert.equal(f.bitmaps[0].closed,true,'a stale acquired bitmap is closed before the next creation starts');assert.equal(f.bitmaps.length,2);assert.equal(f.workers.length,2);
    f.releaseBitmap();await f.drain();assert.equal(f.frames.length,1);assert.equal(f.frames[0].captureGeneration,f.capture.generation);assert.equal(f.frames[0].bytes[0],f.video.picture,'the retained current-context image keeps its own immutable pixels');assert.equal(f.frames[0].capturedAt,3000,'resuming the current queue does not replace its acquisition time');f.events.pagehide();
}
{
    const f=await fixture({delayedBitmap:true});await f.timeout();assert(f.signalValues.some(signal=>signal.action==='sample-drop'&&signal.value.reason==='encode'),'a hung bitmap acquisition reports a bounded failure without starting another acquisition');await f.next(750);assert.equal(f.bitmaps.length,1);f.events.pagehide();assert.equal(f.stops(),1,'Stop remains nonblocking while an uncancellable bitmap acquisition settles');f.releaseBitmap();await f.drain();assert.equal(f.bitmaps[0].closed,true);assert.equal(f.frames.length,0);assert.equal(f.workingFrames(),0);
}
{
    const f=await fixture({delayedBytes:true});f.video.picture=2;await f.next(250);f.available(false);await f.next(250);assert.equal(f.queue().count,0);f.release();await f.drain();assert.equal(f.frames.length,0,'Pause or authorization loss cancels both pending and active snapshots');f.events.pagehide();
}
{
    const f=await fixture({delayedBytes:true});f.video.picture=2;await f.next(250);f.advance(15001);f.release();await f.drain();assert.equal(f.frames.length,0,'raw work older than15seconds cannot reach host admission');assert.equal(f.queue().count,0);assert.ok(f.signalValues.some(signal=>signal.action==='sample-drop'&&signal.value.reason==='age'),'slow work cannot retain stale source pixels indefinitely');f.events.pagehide();
}
{
    const f=await fixture();for(let n=0;n<8;n++){f.capture.generation++;await f.next();}assert.equal(f.encodes(),5,'frequent generation/geometry changes cannot bypass the four PNGs-per-second bound');f.events.pagehide();
}
function visualSurface({green=true,frame=true,metadata=true,shortTitle=false}={}){
    const width=1600,height=1000,data=new Uint8Array(width*height*4);
    const rect=(x,y,w,h,color)=>{for(let row=y;row<y+h;row++)for(let col=x;col<x+w;col++){const p=(row*width+col)*4;data[p]=color[0];data[p+1]=color[1];data[p+2]=color[2];data[p+3]=255;}};
    rect(0,0,width,height,[40,70,90]);if(frame)rect(850,180,560,500,[0,0,0]);rect(853,183,554,494,[16,16,16]);
    for(let i=0;i<8;i++)rect((shortTitle?948:940)+i*16,200,12,shortTitle?10:16,green?[15,220,25]:[220,220,220]);
    if(metadata)for(const y of shortTitle?[220,240,260]:[230,255,280])for(let i=0;i<7;i++)rect(940+i*15,y,9,12,[220,220,220]);
    return {data,width,height};
}
for(const advanceAfterDraw of [1,2]){
    const f=await fixture({automatic:true,visualPixels:visualSurface().data,advanceAfterDraw}),frame=f.frames[0];assert.equal(frame.selectionKind,'visual-item');assert.equal(frame.visualKey,f.key(frame.bytes[0]),'detector/fingerprint metadata and queued PNG must describe the same immutable source pixels');assert.equal(frame.bytes[0],1,'a video advance after freezing cannot change the image used for analysis or encoding');assert.equal(f.sourceDraws(),1,'each acquisition reads the live video exactly once');await f.next(250);await f.next(250);const changed=f.frames.find(next=>next.bytes[0]===2);assert(changed,'the next coherent video image remains eligible for capture');assert.notEqual(changed.visualKey,frame.visualKey,'a later B image cannot falsely coalesce under an active A fingerprint');f.events.pagehide();await f.drain();assert.equal(f.workingFrames(),0);
}
{
    const f=await fixture({automatic:true});for(let n=0;n<20;n++){await f.next(125);await f.drain();assert.equal(f.workingFrames(),0,'early unchanged/full-scene cadence returns release their one frozen working canvas');}assert.ok(f.sourceDraws()<=11,'freezing and full-frame copies remain capped at four per second');f.events.pagehide();
}
{
    const surface=visualSurface(),f=await fixture({automatic:true,visualPixels:surface.data});
    const panes=f.detect(surface);assert.equal(panes.length,1);const pane=panes[0];assert.ok(Math.abs(pane.x*1600-850)<8);assert.ok(Math.abs(pane.height*1000-500)<8);
    for(const invalid of [{green:false},{frame:false},{metadata:false}])assert.equal(f.detect(visualSurface(invalid)).length,0,'green scenery, white titles or missing metadata cannot claim automatic item selection');
    assert.equal(f.detect(visualSurface({shortTitle:true})).length,1,'sparse/short green glyph rows do not move the real frame outside the bounded search');
    const mixed=new Uint8Array(2100*600*4);for(let p=0;p<mixed.length;p+=4){mixed[p]=40;mixed[p+1]=70;mixed[p+2]=90;mixed[p+3]=255;}
    for(const left of [10,700,1390])for(let row=0;row<500;row++)mixed.set(surface.data.subarray(((180+row)*1600+850)*4,((180+row)*1600+1410)*4),((10+row)*2100+left)*4);
    assert.equal(f.detect({data:mixed,width:2100,height:600}).length,3,'two additional green-title dark panes cannot exclude a third genuine pane proposal');
    assert.equal(f.frames[0].selectionKind,'visual-item');assert.equal(f.frames[0].visualKey.length,16);assert.ok(f.frames[0].itemRegion.width<.5);
    for(let i=0;i<20;i++){f.video.picture++;await f.next();}
    assert.equal(f.frames.filter(frame=>frame.selectionKind==='visual-item').length,1,'animated scenery does not duplicate the stable tooltip');
    assert.equal(f.frames.filter(frame=>frame.sceneFallback||frame.selectionKind==='scene').length,1,'the first candidate PNG also supplies a periodic full-scene reference');
    for(const item of [2,3]){f.video.panePicture=item;await f.next(250);}
    assert.equal(f.frames.filter(frame=>frame.selectionKind==='visual-item').length,3,'brief different pane pixels are retained despite changing full-frame pixels');
    assert.equal(new Set(f.frames.filter(frame=>frame.selectionKind==='visual-item').map(frame=>frame.visualKey)).size,3);
    f.capture.region={x:0,y:0,width:1,height:1};await f.next(250);assert.equal(f.frames.at(-1).selectionKind,'configured');assert.equal(f.frames.at(-1).itemRegion,null,'manual region remains authoritative');f.events.pagehide();
}
{
    const f=await fixture({automatic:true,visualPixels:visualSurface().data});for(let i=0;i<80;i++){f.video.panePicture++;f.video.picture++;await f.next(250);}
    assert.ok(f.frames.filter(frame=>frame.sceneFallback||frame.selectionKind==='scene').length>=4,'continuously changing item panes cannot starve periodic full-scene evidence');assert.equal(f.frames.filter(frame=>frame.selectionKind==='scene').length,0,'the same full PNG supplies fallback without sacrificing a brief changed candidate');f.events.pagehide();
}
{
    const f=await fixture({automatic:true});for(let i=0;i<16;i++){f.video.picture++;await f.next();}
    assert.equal(f.frames.length,2,'without a detected green pane, full-scene fallback remains bounded and available');assert.ok(f.frames.every(frame=>frame.selectionKind==='scene'));f.events.pagehide();
}
console.log('Capture source: 8Hz cheap comparison/at most4Hz bounded snapshot acquisition, two pending/64MiB, unchanged heartbeat, distinct changes, one encode/IPC, immutable provenance, transient recovery and cancellation passed.');
