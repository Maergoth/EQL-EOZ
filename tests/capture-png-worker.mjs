import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../app/capture-png.worker.js',import.meta.url),'utf8');
function fixture(){
    const replies=[],surfaces=[];let behavior={},release;
    class Bitmap{constructor(width=100,height=40){this.width=width;this.height=height;}close(){this.closed=true;}}
    class Surface{
        constructor(width,height){if(behavior.constructorFailure)throw Error('Synthetic allocation failure.');this.width=width;this.height=height;surfaces.push(this);}
        getContext(){return{drawImage:bitmap=>{if(behavior.drawFailure)throw Error('Synthetic draw failure.');this.bitmap=bitmap;}};}
        async convertToBlob(options){assert.equal(options.type,'image/png');if(behavior.encodeFailure)throw Error('Synthetic encoder failure.');if(behavior.delayed)await new Promise(resolve=>release=resolve);const bytes=Uint8Array.from([137,80,78,71]).buffer;return{size:behavior.size??bytes.byteLength,arrayBuffer:async()=>bytes};}
    }
    const self={postMessage:(value,transfer)=>replies.push({value,transfer})};
    vm.runInNewContext(source,{self,ImageBitmap:Bitmap,OffscreenCanvas:Surface,ArrayBuffer,Number});
    return{replies,surfaces,bitmap:(w,h)=>new Bitmap(w,h),send:async(value)=>self.onmessage({data:value}),behavior:value=>{behavior=value;},release:()=>release?.()};
}
{
    const f=fixture(),bitmap=f.bitmap();await f.send({id:1,width:100,height:40,bitmap});const reply=f.replies[0];assert.equal(reply.value.ok,true);assert.equal(reply.value.id,1);assert.equal(reply.value.width,100);assert.equal(reply.value.height,40);assert.equal(reply.transfer.length,1);assert.equal(reply.transfer[0],reply.value.bytes);assert.deepEqual([...new Uint8Array(reply.value.bytes)],[137,80,78,71]);assert(bitmap.closed);assert.equal(f.surfaces[0].bitmap,bitmap);assert.equal(f.surfaces[0].width,1);assert.equal(f.surfaces[0].height,1);
}
for(const value of [{id:0},{id:1,width:0},{id:1,width:4097},{id:1,height:2161},{id:1,width:99},{id:1,width:1.5}]){
    const f=fixture(),bitmap=f.bitmap();await f.send({id:1,width:100,height:40,bitmap,...value});assert.equal(f.surfaces.length,0);assert(bitmap.closed);if(value.id!==0)assert.equal(f.replies[0].value.error,'invalid-image');else assert.equal(f.replies.length,0);
}
for(const behavior of [{constructorFailure:true},{drawFailure:true},{encodeFailure:true},{size:0},{size:32*1024*1024+1},{size:5}]){
    const f=fixture(),bitmap=f.bitmap();f.behavior(behavior);await f.send({id:1,width:100,height:40,bitmap});assert.equal(f.replies[0].value.ok,false);assert(bitmap.closed);assert(f.surfaces.every(surface=>surface.width===1&&surface.height===1));
    f.behavior({});await f.send({id:2,width:100,height:40,bitmap:f.bitmap()});assert.equal(f.replies[1].value.ok,true,'an encoding/allocation failure cannot leave the serial worker permanently busy');
}
{
    const f=fixture();f.behavior({delayed:true});const first=f.bitmap(),pending=f.send({id:1,width:100,height:40,bitmap:first});await Promise.resolve();assert(first.closed,'the incoming bitmap is released before asynchronous PNG encoding');const second=f.bitmap();await f.send({id:2,width:100,height:40,bitmap:second});assert(second.closed);assert.equal(f.replies[0].value.error,'encoder-busy');assert.equal(f.surfaces.length,1,'a concurrent message cannot allocate a second surface');f.release();await pending;assert.equal(f.replies[1].value.id,1);assert.equal(f.replies[1].value.ok,true);
}
console.log('PNG worker: exact bitmap transfer, serial encoding, image/output bounds, early bitmap close, surface cleanup and failure recovery passed.');
