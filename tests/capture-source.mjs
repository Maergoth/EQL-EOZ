import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../app/capture-source.js',import.meta.url),'utf8');
async function fixture({readyState=2,frameFailure=false,drawFailure=false,delayedBytes=false,delayedFrame=false}={}){
    const signals=[],frames=[],timers=[],events={},tracks=new Map(),requests=[];let stops=0,release,releaseFrame,now=1000,encodes=0;
    const capture={generation:1,owner:'character',sessionId:'source-session',sourceId:'window:synthetic',region:null};
    const video={readyState,videoWidth:100,videoHeight:40,picture:1,async play(){}},track={addEventListener:(name,fn)=>tracks.set(name,fn),stop(){stops++;tracks.get('ended')?.();}};
    const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
    class Clock extends Date{static now(){return now;}}
    const context=vm.createContext({Uint8Array,Date:Clock,console,setTimeout:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.cancelled=true;},
        navigator:{mediaDevices:{getDisplayMedia:async options=>{requests.push(options);return stream;}}},document:{getElementById:()=>video,createElement:()=>{let picture;return{width:0,height:0,getContext:()=>({drawImage(){if(drawFailure){drawFailure=false;throw Error('A transient blank frame.');}picture=video.picture;},getImageData:()=>({data:new Uint8Array([picture,2,3,255])})}),toBlob:fn=>{encodes++;const blob={size:100,arrayBuffer:()=>delayedBytes?new Promise(resolve=>{release=resolve;}):Promise.resolve(Uint8Array.from([picture]).buffer)};fn(blob);}};}},
        window:{eyeOfZommCaptureSource:{state:async()=>({allowed:true,capture:{...capture}}),frame:async frame=>{if(frameFailure){frameFailure=false;throw Error('Transient IPC rejection.');}frames.push(frame);if(delayedFrame)await new Promise(resolve=>{releaseFrame=resolve;});return{accepted:true};},signal:async action=>{signals.push(action);}},addEventListener:(name,fn)=>{events[name]=fn;}}});
    vm.runInContext(source,context);await context.window.startScreenReadCapture();
    const drain=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};await drain();
    return{frames,signals,video,events,tracks,drain,requests,capture,encodes:()=>encodes,stops:()=>stops,advance:ms=>{now+=ms;},next:async(ms)=>{assert.ok(timers.length,'sampling remains scheduled');const timer=timers.shift();now+=ms??timer.delay;if(!timer.cancelled)void timer.fn();await drain();},release:()=>release?.(new ArrayBuffer(100)),releaseFrame:()=>releaseFrame?.()};
}
for(const options of [{frameFailure:true},{drawFailure:true}]){
    const f=await fixture(options);assert.deepEqual(f.signals,['started','frame-error']);assert.equal(f.stops(),0,'transient frame failures do not end the authorized stream');await f.next(750);assert.equal(f.frames.length,1,'later valid frames continue in the same stream');f.events.pagehide();assert.equal(f.stops(),1);assert.equal(f.signals.includes('ended'),false,'explicit disposal cannot masquerade as lost permission');
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
    const f=await fixture({delayedBytes:true});f.advance(2000);f.capture.generation++;f.release();await f.drain();assert.equal(f.frames[0].capturedAt,1000,'evidence time is recorded before slow PNG encoding');assert.equal(f.frames[0].captureGeneration,1,'pixels retain the token acquired before drawing');f.events.pagehide();
}
{
    const f=await fixture();for(let n=0;n<8;n++){f.capture.generation++;await f.next();}assert.equal(f.encodes(),5,'frequent generation/geometry changes cannot bypass the four PNGs-per-second bound');f.events.pagehide();
}
console.log('Capture source: bounded8Hz comparison/4Hz PNG sampling, unchanged heartbeat, distinct changes, one encode/IPC, pre-encode provenance, transient recovery and cancellation passed.');
