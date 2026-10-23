import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{normalizeCaptureRegion,prepareCaptureImage}=require('../desktop/capture-image.cjs'),{recognizeCaptureImage}=require('../desktop/capture-reader.cjs');
const operations=[];
class Image{
    constructor(width=500,height=400){this.width=width;this.height=height;}
    getSize(){return {width:this.width,height:this.height};}isEmpty(){return false;}
    crop(rect){operations.push({crop:rect});return new Image(rect.width,rect.height);}
    resize(size){operations.push({resize:size});return new Image(size.width,size.height);}
    toPNG(){return Buffer.from('synthetic-image-data');}toBitmap(){return Buffer.alloc(this.width*this.height*4);}
}
const nativeImage={createFromBitmap:(_bytes,size)=>new Image(size.width,size.height)},image=new Image();
assert.equal(normalizeCaptureRegion(null,null),null);
assert.throws(()=>normalizeCaptureRegion({x:0,y:0,width:1,height:1},null),/preview/);
for(const region of [{x:-.1,y:0,width:1,height:1},{x:0,y:0,width:NaN,height:1},{x:.5,y:0,width:1,height:1},{x:0,y:0,width:.01,height:1}])assert.throws(()=>normalizeCaptureRegion(region,image.getSize()));
const selected=normalizeCaptureRegion({x:.1,y:.2,width:.6,height:.5},image.getSize());
const prepared=prepareCaptureImage({image,...selected});assert.deepEqual(prepared.input.region,{x:50,y:80,width:300,height:200});
const resized=prepareCaptureImage({image:new Image(600,400),...selected});assert.deepEqual(resized.input.region,{x:0,y:0,width:600,height:400});assert.match(resized.warning,/size changed/);
let calls=0;const single=await recognizeCaptureImage({image,ocr:{async recognize(){calls++;return {text:'No examined pane',words:[],confidence:60};}},nativeImage});assert.equal(calls,1);assert.equal(single.input.ocrPasses.length,1);
const word=(text,x,y,w=90,h=30,confidence=85)=>({text,bbox:{x0:x,y0:y,x1:x+w,y1:y+h},confidence});
const scene={text:'Synthetic pane',confidence:60,words:[word('Description',100,30,100),word('Lore',500,30),word('Synthetic',100,90),word('Winding',200,90),word('Traill',300,90,90,30,40),word('AC',100,200,30),word('12',300,200,30),word('HP',100,235,30),word('45',300,235,30)]};
calls=0;operations.length=0;
const refined=await recognizeCaptureImage({image,...selected,nativeImage,ocr:{async recognize(){calls++;return calls===1?scene:{text:calls===2?'Synthetic Winding Trail':'AC 12\nHP 45',confidence:90,words:[word('Trail',40,20)]};}}});
assert.equal(calls,3);assert.equal(refined.result.refinements.length,2);assert.equal(refined.input.ocrPasses.length,3);
for(const pass of refined.result.refinements){assert(pass.region.x>=50&&pass.region.y>=80);assert(pass.region.x+pass.region.width<=350);assert(pass.region.y+pass.region.height<=280);assert(pass.region.width*pass.region.height*pass.scale**2<=1024*1024);}
let current=true;calls=0;
const stopped=await recognizeCaptureImage({image,nativeImage,isCurrent:()=>current,ocr:{async recognize(){calls++;if(calls===2)current=false;return scene;}}});
assert.equal(calls,2);assert.equal(stopped.cancelled,true);assert.deepEqual(stopped.result.words,[],'a stopped refinement cannot deliver an earlier scene proposal');
current=false;calls=0;assert.equal((await recognizeCaptureImage({image,isCurrent:()=>current,ocr:{async recognize(){calls++;}}})).cancelled,true);assert.equal(calls,0,'a stale job cannot initialize an OCR worker');
console.log('Capture reader: normalized region bounds/resize reset, single-pass negatives, bounded mapped refinements and cancellation passed.');
