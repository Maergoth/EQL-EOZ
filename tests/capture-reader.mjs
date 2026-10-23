import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {screenReadRefinementRegions} from '../app/screen-read-parser.js';
const require=createRequire(import.meta.url),{normalizeCaptureRegion,prepareCaptureImage}=require('../desktop/capture-image.cjs'),{recognizeCaptureImage}=require('../desktop/capture-reader.cjs');
const operations=[];
class Image{
    constructor(width=500,height=400){this.width=width;this.height=height;}
    getSize(){return {width:this.width,height:this.height};}isEmpty(){return false;}
    crop(rect){operations.push({crop:rect});return new Image(rect.width,rect.height);}
    resize(size){operations.push({resize:size});return new Image(size.width,size.height);}
    toPNG(){return Buffer.from('synthetic-image-data');}toBitmap(){return Buffer.alloc(this.width*this.height*4);}
}
const nativeImage={createFromBitmap:(_bytes,size)=>{operations.push({bitmap:{width:size.width,height:size.height}});return new Image(size.width,size.height);}},image=new Image();
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
const pane=(x,y,name)=>[word(name,x+100,y+20,250,20),word('Description',x+250,y+60,110,20),word(name,x+80,y+110,250,20),
    word('Class:',x+80,y+160,50,20),word('ALL',x+145,y+160,40,20),word('Race:',x+80,y+190,50,20),word('ALL',x+145,y+190,40,20),
    word('AC:',x+280,y+300,40,20),word('19',x+400,y+300,30,20),word('Strength:',x+20,y+380,100,20),word('17',x+180,y+380,30,20),word('Modified',x+50,y+450,90,20)];
const atlasScene={text:'Synthetic Modern independent panes',confidence:88,words:[...pane(0,0,'Synthetic River Shoes +2'),...pane(800,0,'Synthetic Quartz Maul +5'),...pane(0,700,'Synthetic Glass Ring +3')]};
const proposals=screenReadRefinementRegions(atlasScene);assert.equal(proposals[0].tiles.length,3);
calls=0;operations.length=0;let firstAtlasTileHeight;
const atlas=await recognizeCaptureImage({image:new Image(1500,1000),nativeImage,ocr:{async recognize(){calls++;if(calls===1)return atlasScene;
    const tile=proposals[0].tiles[0],top=Math.floor(tile.y/2),bottom=Math.ceil((tile.y+tile.height)/2);firstAtlasTileHeight=(bottom-top)*4;
    return {text:'Synthetic atlas rows',confidence:94,words:[word('17',10,10,20,15,96),word('23',10,firstAtlasTileHeight+16+10,20,15,96)]};
}}});
assert.equal(calls,2,'three item regions share one bounded OCR atlas pass');assert.equal(atlas.result.refinements[0].tiles.length,3);
assert(atlas.result.refinements[0].words[0].bbox.x0<500);assert(atlas.result.refinements[0].words[1].bbox.x0>800,'second atlas tile maps back to its own item, not the first pane');
for(const operation of operations.filter(value=>value.bitmap))assert(operation.bitmap.width*operation.bitmap.height<=4*1024*1024,'the stat atlas bitmap has a fixed pixel budget');
const componentScene={text:'Synthetic Modern component columns',confidence:90,words:[word('Inventory',100,20,100,20),word('Character',100,200,90,20),word('Vitals',200,200,60,20),word('Stats',600,200,50,20),
    word('AC',100,300,30,20),word('121/93',220,300,75,20),word('|257',310,300,50,20),word('Attack',100,330,70,20),word('3591840',220,330,130,20),word('Agility',600,330,75,20),word('143/511',720,330,100,20)]};
const componentProposal=screenReadRefinementRegions(componentScene).find(region=>region.role==='character-stats');assert.equal(componentProposal.tiles.length,3);
calls=0;
const componentRead=await recognizeCaptureImage({image:new Image(2500,1000),nativeImage,ocr:{async recognize(){calls++;if(calls===1)return componentScene;
    const base=componentProposal.tiles[0],offense=componentProposal.tiles[1],offset=Math.ceil(base.y+base.height)-Math.floor(base.y),second=Math.ceil(offense.y+offense.height)-Math.floor(offense.y),atlas=operations.filter(value=>value.bitmap).at(-1).bitmap;
    const scale=atlas.width/Math.max(...componentProposal.tiles.map(tile=>Math.ceil(tile.x+tile.width)-Math.floor(tile.x)));
    return {text:'359\n840',confidence:96,words:[word('359',10,offset*scale+16+10,40,30,96),word('840',10,(offset+second)*scale+32+10,40,30,96)]};
}}});
assert.equal(calls,2,'column crops share the existing character refinement, with no additional OCR calls');
assert.equal(componentRead.input.ocrPasses[1].componentPreprocessing,'local-otsu');
assert.deepEqual(componentRead.result.refinements[0].words.map(value=>value.component),['attackOffense','attackAccuracy'],'only independently cropped pixel columns carry component provenance');
assert(componentRead.result.refinements[0].words.every(value=>value.bbox.x1<400),'right-side attribute values cannot enter a numeric component crop');
console.log('Capture reader: normalized region bounds/resize reset, single-pass negatives, bounded mapped refinements and cancellation passed.');
