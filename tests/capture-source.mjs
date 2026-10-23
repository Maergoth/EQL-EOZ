import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../app/capture-source.js',import.meta.url),'utf8');
async function fixture({readyState=2,frameFailure=false,drawFailure=false,delayedBytes=false}={}){
    const signals=[],frames=[],timers=[],events={},tracks=new Map();let stops=0,release;
    const video={readyState,videoWidth:100,videoHeight:40,async play(){}},track={addEventListener:(name,fn)=>tracks.set(name,fn),stop(){stops++;tracks.get('ended')?.();}};
    const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
    const blob={size:100,arrayBuffer:()=>delayedBytes?new Promise(resolve=>{release=resolve;}):Promise.resolve(new ArrayBuffer(100))};
    const context=vm.createContext({Uint8Array,Date,console,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
        navigator:{mediaDevices:{getDisplayMedia:async()=>stream}},document:{getElementById:()=>video,createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){if(drawFailure){drawFailure=false;throw Error('A transient blank frame.');}}}),toBlob:fn=>fn(blob)})},
        window:{eyeOfZommCaptureSource:{state:async()=>({allowed:true}),frame:async frame=>{if(frameFailure){frameFailure=false;throw Error('Transient IPC rejection.');}frames.push(frame);},signal:async action=>{signals.push(action);}},addEventListener:(name,fn)=>{events[name]=fn;}}});
    vm.runInContext(source,context);await context.window.startScreenReadCapture();
    const drain=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};await drain();
    return{frames,signals,video,events,tracks,drain,stops:()=>stops,next:async()=>{assert.ok(timers.length,'sampling remains scheduled');await timers.shift()();await drain();},release:()=>release?.(new ArrayBuffer(100))};
}
for(const options of [{frameFailure:true},{drawFailure:true}]){
    const f=await fixture(options);assert.deepEqual(f.signals,['started','frame-error']);assert.equal(f.stops(),0,'transient frame failures do not end the authorized stream');await f.next();assert.equal(f.frames.length,1,'later valid frames continue in the same stream');f.events.pagehide();assert.equal(f.stops(),1);assert.equal(f.signals.includes('ended'),false,'explicit disposal cannot masquerade as lost permission');
}
{
    const f=await fixture({readyState:0});assert.equal(f.frames.length,0);assert.equal(f.stops(),0);f.video.readyState=2;await f.next();assert.equal(f.frames.length,1,'a temporarily blank/minimized source keeps sampling');f.tracks.get('ended')();await f.drain();assert.equal(f.signals.at(-1),'ended');assert.equal(f.stops(),1,'real source loss releases the stream without restarting it');
}
{
    const f=await fixture({delayedBytes:true});f.events.pagehide();f.release();await f.drain();assert.equal(f.frames.length,0,'an encode finishing after cancellation cannot post pixels');assert.equal(f.signals.includes('ended'),false);
}
console.log('Capture source: transient canvas/IPC errors and blank frames recover; actual source loss and explicit cancellation release tracks without stale frames or restart.');
