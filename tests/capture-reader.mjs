import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {screenReadRefinementRegions,parseScreenRead} from '../app/screen-read-parser.js';
import {modernAdaptiveWords,adaptiveWord} from './fixtures/screen-read/modern-adaptive-words.mjs';
const require=createRequire(import.meta.url),{normalizeCaptureRegion,prepareCaptureImage}=require('../desktop/capture-image.cjs'),{recognizeCaptureImage}=require('../desktop/capture-reader.cjs');
const operations=[];let borderInk=false,lastBitmapBytes;
class Image{
    constructor(width=500,height=400,tone=0){this.width=width;this.height=height;this.tone=tone;}
    getSize(){return {width:this.width,height:this.height};}isEmpty(){return false;}
    crop(rect){operations.push({crop:rect});return new Image(rect.width,rect.height,this.tone);}
    resize(size){operations.push({resize:size});return new Image(size.width,size.height,this.tone);}
    toPNG(){return Buffer.from('synthetic-image-data');}toBitmap(){const bytes=Buffer.alloc(this.width*this.height*4,this.tone);if(borderInk)bytes.fill(255,0,4);return bytes;}
}
const nativeImage={createFromBitmap:(bytes,size)=>{lastBitmapBytes=bytes;operations.push({bitmap:{width:size.width,height:size.height,corners:[...bytes.subarray(0,4),...bytes.subarray(-4)]}});return new Image(size.width,size.height,bytes[0]);}},image=new Image();
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
const hoverBesideInventory={text:'Synthetic 3840 by 2088 scene with an absent tooltip title',confidence:88,words:[...componentScene.words,
    word('Lore Equipped, No Trade',2300,475,300,20),word('Class:',2300,500,55,20),word('ROG',2365,500,40,20),word('Race:',2300,525,55,20),word('ALL',2365,525,40,20),word('Primary',2300,550,80,20),
    word('Size:',2220,600,50,20),word('SMALL',2330,600,70,20),word('HP:',2450,600,40,20),word('73',2550,600,30,20),word('Weight',2220,625,70,20),word('14',2350,625,30,20),word('Strength:',2220,675,100,20),word('21',2350,675,30,20),word('Hold RMB or ALT+LMB to inspect or upgrade item',2220,860,520,20)]};
assert.equal(parseScreenRead(hoverBesideInventory).filter(record=>record.subject.kind==='item').length,0);
calls=0;operations.length=0;
const fullFrameMixed=await recognizeCaptureImage({image:new Image(3840,2088),nativeImage,ocr:{async recognize(_png,settings){
    calls++;if(calls===1)return hoverBesideInventory;
    const crop=operations.filter(value=>value.crop).at(-1).crop,bitmap=operations.filter(value=>value.bitmap).at(-1).bitmap,scale=bitmap.width/crop.width;
    const mapped=(text,x,y,w,h=20)=>word(text,(x-crop.x)*scale,(y-crop.y)*scale,w*scale,h*scale,96);
    if(calls===2){assert.equal(settings.layout,'line');return {text:'Synthetic Recovered Needle +3',confidence:96,words:[mapped('Synthetic',2300,450,100),mapped('Recovered',2410,450,100),mapped('Needle',2520,450,65),mapped('+3',2595,450,25)]};}
    assert.equal(settings.layout,'block');return {text:'HP: 75',confidence:96,words:[mapped('HP:',2450,600,40),mapped('75',2550,600,30)]};
}}});
assert.equal(calls,3,'A full-size mixed frame preserves the existing scene plus two refinements budget');assert.deepEqual(fullFrameMixed.input.sourceSize,{width:3840,height:2088});assert.equal(fullFrameMixed.input.scale,1);
assert.deepEqual(fullFrameMixed.input.ocrPasses.map(pass=>pass.role),['scene','item-name','item-stats'],'Inventory cannot consume the tooltip identity pass');
const mixedItem=parseScreenRead({...fullFrameMixed.result,input:fullFrameMixed.input}).find(record=>record.subject.kind==='item');assert(mixedItem);assert.equal(mixedItem.subject.name,'Synthetic Recovered Needle +3');
assert.equal(mixedItem.fields.some(field=>field.key==='hp'),false,'Preserving identity does not choose between conflicting numeric readings');assert.match(mixedItem.evidence.text,/HP: 73/);assert.match(mixedItem.evidence.text,/HP: 75/);assert.match(mixedItem.evidence.text,/Conflicting OCR values left unknown: hp/);assert.doesNotMatch(mixedItem.evidence.text,/3591840|143\/511/,'Inventory evidence stays separate from the recovered item');
calls=0;operations.length=0;
const characterRead=await recognizeCaptureImage({image:new Image(3840,2088),nativeImage,characterOnly:true,ocr:{async recognize(){calls++;return calls===1?hoverBesideInventory:{text:'No new readable character values',words:[],confidence:88};}}});
assert.equal(calls,2,'Character capture spends only the scene pass and character refinement');assert.equal(characterRead.result.characterOnly,true);assert.deepEqual(characterRead.input.ocrPasses.map(pass=>pass.role),['scene','character-stats']);
assert(parseScreenRead({...characterRead.result,input:characterRead.input}).every(record=>record.subject.kind==='character'),'Purpose survives the reader so Character frames cannot emit item observations');
for(const operation of operations.filter(value=>value.bitmap))assert(operation.bitmap.width*operation.bitmap.height<=4*1024*1024,'Character-only refinement keeps the existing pixel budget');
calls=0;
const characterItemOnly=await recognizeCaptureImage({image,nativeImage,characterOnly:true,ocr:{async recognize(){calls++;return scene;}}});
assert.equal(calls,1,'An item-only Character frame is not refined');assert.deepEqual(parseScreenRead(characterItemOnly.result),[]);
calls=0;
const wordlessCharacter=await recognizeCaptureImage({image,nativeImage,characterOnly:true,ocr:{async recognize(){calls++;return {text:'Character Stats\nHP 10/100\nMana 20/200',confidence:90,words:[]};}}});
assert.equal(calls,1);assert.equal(wordlessCharacter.result.characterOnly,true);assert.equal(parseScreenRead(wordlessCharacter.result)[0].subject.kind,'character','Early reader return retains the character-only purpose');
const columnWord=(text,x,y,width=60)=>word(text,x,y,width,12,97),columnScene={text:'Synthetic Modern native numeric widgets',confidence:94,words:[columnWord('Inventory',200,20),columnWord('Character',100,60,58),columnWord('Vitals',165,60,36),columnWord('Stats',281,60,35),
    columnWord('Strength',281,90,65),columnWord('123/789',365,90,56),columnWord('Stamina',281,110,65),columnWord('124/789',365,110,56),
    columnWord('SV.',281,130,20),columnWord('Magic',306,130,50),columnWord('131/987',392,130,57),columnWord('SV.',281,150,20),columnWord('Fire',306,150,50),columnWord('132/987',392,150,57),
    columnWord('AC',100,110,20),columnWord('113/79',167,110,48),columnWord('|211',223,110,32),columnWord('Attack',100,130,42),columnWord('317/419',192,130,66)]};
const columnPlans=screenReadRefinementRegions({...columnScene,characterOnly:true});assert.deepEqual(columnPlans.map(pass=>pass.tiles.length),[4,3]);
calls=0;operations.length=0;const expectedMapped=[];
const numericColumns=await recognizeCaptureImage({image,nativeImage,characterOnly:true,ocr:{async recognize(_png,settings){
    if(++calls===1)return columnScene;
    assert.equal(settings.layout,'sparse');const proposal=columnPlans[calls-2],crops=proposal.tiles.map(tile=>({x:Math.floor(tile.x/3),y:Math.floor(tile.y/3),width:Math.ceil((tile.x+tile.width)/3)-Math.floor(tile.x/3),height:Math.ceil((tile.y+tile.height)/3)-Math.floor(tile.y/3),maxScale:tile.scale||proposal.scale})),bitmap=operations.filter(value=>value.bitmap).at(-1).bitmap;
    let scale=proposal.scale,padding;while(scale>=1){padding=Math.max(8,scale*2);if(Math.max(...crops.map(crop=>crop.width*Math.min(scale,crop.maxScale)))+padding*2===bitmap.width)break;scale--;}
    assert(scale>=1);assert.deepEqual(bitmap.corners,Array(8).fill(255),'Unused atlas corners remain white after inversion');let top=0;
    expectedMapped.push(crops.map(crop=>{const tileScale=Math.min(scale,crop.maxScale);return {x0:(crop.x+5/tileScale)*3,y0:(crop.y+2/tileScale)*3,x1:(crop.x+20/tileScale)*3,y1:(crop.y+12/tileScale)*3};}));
    return {text:'Independent numeric cell reads',confidence:97,words:crops.map(crop=>{const tileScale=Math.min(scale,crop.maxScale),value=word('17',padding+5,top+padding+2,15,10,97);top+=crop.height*tileScale+padding*2+16;return value;})};
}}});
assert.equal(calls,3,'Character uses the existing maximum two refinements for seven independent physical crops');
assert.deepEqual(numericColumns.input.ocrPasses.map(pass=>pass.role),['scene','character-stats','character-stats']);
for(const [index,pass]of numericColumns.result.refinements.entries()){
    assert.deepEqual(pass.words.map(value=>value.column),columnPlans[index].tiles.map(tile=>tile.column));
    assert.deepEqual(pass.words.map(value=>value.bbox),expectedMapped[index],'Each executed crop maps through its own actual scale');
    assert.equal(pass.columnPreprocessing,'local-otsu');assert(pass.tiles.every(tile=>tile.preprocessing==='local-otsu'));
}
assert.deepEqual(numericColumns.result.refinements.map(pass=>pass.tiles.map(tile=>tile.scale)),[[6,6,3,3],[3,3,3]]);
for(const operation of operations.filter(value=>value.bitmap))assert(operation.bitmap.width*operation.bitmap.height<=4*1024*1024&&Math.max(operation.bitmap.width,operation.bitmap.height)<=4096);
borderInk=true;calls=0;
const clippedColumns=await recognizeCaptureImage({image,nativeImage,characterOnly:true,ocr:{async recognize(){return ++calls===1?columnScene:{text:'No numeric proposal',confidence:97,words:[]};}}});borderInk=false;
assert(clippedColumns.result.refinements.flatMap(pass=>pass.tiles).filter(tile=>tile.column!=='modern-attributes'&&tile.column!=='modern-resists').every(tile=>tile.edgeClipped===true),'Every numeric widget rejects original source-edge ink before resize');
class PixelImage extends Image{
    constructor(width,height,pixelAt,x=0,y=0){super(width,height);this.pixelAt=pixelAt;this.x=x;this.y=y;}
    crop(rect){return new PixelImage(rect.width,rect.height,this.pixelAt,this.x+rect.x,this.y+rect.y);}
    toBitmap(){const bytes=Buffer.alloc(this.width*this.height*4);for(let y=0;y<this.height;y++)for(let x=0;x<this.width;x++){const index=(y*this.width+x)*4;bytes[index]=bytes[index+1]=bytes[index+2]=this.pixelAt(this.x+x,this.y+y)?255:0;bytes[index+3]=255;}return bytes;}
}
const ownAndNeighbor=(x,y)=>[114,134].some(top=>y>=top&&y<top+3&&(x>=230&&x<234||x>=281&&x<283));
async function guarded(extra=()=>false){let count=0;return recognizeCaptureImage({image:new PixelImage(5000,3000,(x,y)=>ownAndNeighbor(x,y)||extra(x,y)),nativeImage,characterOnly:true,ocr:{async recognize(){return ++count===1?columnScene:{text:'No numeric proposal',confidence:97,words:[]};}}});}
const validGuard=await guarded(),guardTiles=validGuard.result.refinements.flatMap(pass=>pass.tiles).filter(tile=>tile.sourceGuard);assert.equal(guardTiles.length,2);
assert(guardTiles.every(tile=>tile.guardVerified===true&&tile.edgeClipped===false),'Full native extent contains only the observed neighboring label beyond a genuine wide blank run');
for(const [reason,extra]of [['whole last digit outside the proposed crop and outside the neighbor box',(x,y)=>x>=279&&x<281&&y>=114&&y<117],['ink touching the required blank run',(x,y)=>x===276&&y>=114&&y<117],['a competing excluded glyph outside the same-row label',(x,y)=>x===282&&y>=106&&y<109]]){
    const result=await guarded(extra),tile=result.result.refinements.flatMap(pass=>pass.tiles).find(tile=>tile.column==='modern-acEvasion');assert.equal(tile.guardVerified,false,reason);assert.equal(tile.edgeClipped,true,reason);
}
const enlargedColumns={...columnScene,words:columnScene.words.map(value=>({...value,bbox:Object.fromEntries(Object.entries(value.bbox).map(([key,number])=>[key,number*10]))}))};
calls=0;operations.length=0;
const clampedColumns=await recognizeCaptureImage({image:new Image(5000,3000),nativeImage,characterOnly:true,ocr:{async recognize(){return ++calls===1?enlargedColumns:{text:'No numeric proposal',confidence:97,words:[]};}}});
assert.equal(calls,3);assert(clampedColumns.result.refinements[0].scale<6);
for(const pass of clampedColumns.result.refinements)assert(pass.tiles.length<=4&&pass.tiles.every(tile=>tile.scale<=pass.scale));
for(const operation of operations.filter(value=>value.bitmap))assert(operation.bitmap.width*operation.bitmap.height<=4*1024*1024&&Math.max(operation.bitmap.width,operation.bitmap.height)<=4096,'Actual scaled bitmaps retain existing pixel/dimension limits');
// The sparse scene can positively locate the native grid while losing one row
// caption. Only actually executed whole-context words may plan its last pass.
const adaptiveFixture=modernAdaptiveWords(),adaptivePlan=screenReadRefinementRegions({...adaptiveFixture.scene,characterOnly:true})[0],adaptiveTag='default-modern-resource-context-v1';
const resourceInk=(x,y)=>[76,92,108].some(top=>y>=top+3&&y<top+6&&[175,235].some(left=>x>=left&&x<left+4)),adaptiveInk=(x,y)=>resourceInk(x,y)||(y>=143&&y<146&&(x>=230&&x<234||x>=281&&x<283));
const actualCrops=proposal=>proposal.tiles.map(tile=>({...tile,x:Math.floor(tile.x),y:Math.floor(tile.y),width:Math.ceil(tile.x+tile.width)-Math.floor(tile.x),height:Math.ceil(tile.y+tile.height)-Math.floor(tile.y)}));
let adaptiveFollowup,adaptiveCount=0;operations.length=0;
const adaptiveRead=await recognizeCaptureImage({image:new PixelImage(5000,3000,adaptiveInk),nativeImage,characterOnly:true,ocr:{async recognize(_png,settings){
    if(++adaptiveCount===1)return adaptiveFixture.scene;
    const proposal=adaptiveCount===2?adaptivePlan:adaptiveFollowup,crops=actualCrops(proposal),bitmap=operations.filter(value=>value.bitmap).at(-1).bitmap;
    let scale=proposal.scale,padding;while(scale>=1){padding=Math.max(8,scale*2);if(Math.max(...crops.map(crop=>crop.width*Math.min(scale,crop.scale||scale)))+padding*2===bitmap.width)break;scale--;}
    assert(scale>=1);assert.equal(settings.layout,adaptiveCount===2?'block':'sparse');assert.deepEqual(bitmap.corners,Array(8).fill(255));
    let top=0;const words=[];
    for(const crop of crops){const tileScale=Math.min(scale,crop.scale||scale),map=entry=>({...entry,bbox:{x0:padding+(entry.bbox.x0-crop.x)*tileScale,y0:top+padding+(entry.bbox.y0-crop.y)*tileScale,x1:padding+(entry.bbox.x1-crop.x)*tileScale,y1:top+padding+(entry.bbox.y1-crop.y)*tileScale}});
        if(crop.context)words.push(...adaptiveFixture.context.map(map));
        else if(crop.sourceRows)for(const row of crop.sourceRows)words.push(map(adaptiveWord(String(adaptiveFixture.resources[row.key]),crop.x+18,row.y+4,18,10)));
        else if(crop.column==='modern-attributes')for(const row of adaptiveFixture.rows.filter(row=>!row.key.startsWith('resist')))words.push(map(row.words[0]),map(adaptiveWord(String(row.value),adaptiveFixture.right+84,row.y,18)));
        else if(crop.column==='modern-resists')for(const row of adaptiveFixture.rows.filter(row=>row.key.startsWith('resist')))words.push(map(adaptiveWord(String(row.value),adaptiveFixture.right+113,row.y,18)));
        else words.push(map(adaptiveWord(crop.column==='modern-attackOffense'?'318':'647',crop.column==='modern-attackOffense'?201:229,140,18)));
        top+=crop.height*tileScale+padding*2+16;
    }
    if(adaptiveCount===2){const {screenReadCharacterFollowup}=await import('../app/screen-read-parser.js');adaptiveFollowup=screenReadCharacterFollowup({...adaptiveFixture.scene,characterOnly:true,input:{scale:1,region:{x:0,y:0}},refinements:[{...adaptivePlan,tiles:actualCrops(adaptivePlan).map(tile=>({...tile,preprocessing:'antialias-inverted'})),words:adaptiveFixture.context.map(word=>({...word,context:adaptiveTag}))}]});assert(adaptiveFollowup);}
    return {text:'Synthetic actual-tile words',confidence:97,words};
}}});
assert.equal(adaptiveCount,3);assert.deepEqual(adaptiveRead.result.refinements.map(pass=>pass.tiles.length),[3,4]);
assert.equal(adaptiveRead.result.refinements[0].nativeContext,adaptiveTag);assert.equal(adaptiveRead.result.refinements[1].nativeFollowup,adaptiveTag);
assert.deepEqual(adaptiveRead.result.refinements[0].tiles.map(tile=>tile.preprocessing),['antialias-inverted','antialias-inverted','antialias-inverted']);
assert.deepEqual(adaptiveRead.result.refinements[0].tiles.map(tile=>tile.scale),[3,6,6]);assert.deepEqual(adaptiveRead.result.refinements[1].tiles.map(tile=>tile.scale),[6,6,3,3]);
assert(adaptiveRead.result.refinements.every(pass=>pass.columnPreprocessing==='antialias-inverted'&&pass.guardPreprocessing==='local-otsu'));
assert(adaptiveRead.result.refinements.flatMap(pass=>pass.tiles).filter(tile=>tile.sourceRows||tile.column?.startsWith('modern-attack')).every(tile=>tile.guardPreprocessing==='local-otsu'));
assert(adaptiveRead.result.refinements[0].words.filter(word=>word.context).every(word=>!word.column&&!word.component),'Context retains ordinary mapped evidence instead of becoming an authoritative numeric column');
assert(adaptiveRead.result.refinements[0].tiles.filter(tile=>tile.column).every(tile=>tile.rowProofs.length===3&&tile.rowProofs.every(row=>row.complete&&row.inkPresent&&!row.edgeClipped)));
const adaptiveFields=Object.fromEntries(parseScreenRead({...adaptiveRead.result,input:adaptiveRead.input}).find(record=>record.subject.kind==='character').fields.map(field=>[field.key,field.value]));
for(const [key,value]of Object.entries({...adaptiveFixture.resources,attackOffense:318,attackAccuracy:647,velocity:0,enduranceRegen:29,damageShieldMitigation:0}))assert.equal(adaptiveFields[key],value,key);
for(const row of adaptiveFixture.rows)assert.equal(adaptiveFields[row.key],row.value,row.key);
for(const operation of operations.filter(value=>value.bitmap))assert(operation.bitmap.width*operation.bitmap.height<=4*1024*1024&&Math.max(operation.bitmap.width,operation.bitmap.height)<=4096,'Dynamic scheduling preserves each existing bitmap budget');
let shadeCalls=0;
const antialiasProbe=await recognizeCaptureImage({image:new Image(5000,3000,64),nativeImage,characterOnly:true,ocr:{async recognize(){
    if(++shadeCalls===1)return adaptiveFixture.scene;
    const crops=actualCrops(adaptivePlan),padding=12,width=Math.max(...crops.map(crop=>crop.width*Math.min(adaptivePlan.scale,crop.scale||adaptivePlan.scale)))+padding*2,resourceTop=crops[0].height*3+padding*2+16;
    assert.equal(lastBitmapBytes[((resourceTop+padding+10)*width+padding+10)*4],191,'Actual resource OCR pixels retain the inverted antialias shade64, rather than the threshold-copy white255');
    return {text:'No recognized context',words:[],confidence:97};
}}});
assert.equal(shadeCalls,2);assert(antialiasProbe.result.refinements[0].tiles.filter(tile=>tile.column).every(tile=>tile.rowProofs.every(row=>!row.inkPresent)),'The separate Otsu proof copy still reports no foreground in an all-shade source');
let oldShadeCalls=0;
await recognizeCaptureImage({image:new Image(5000,3000,64),nativeImage,characterOnly:true,ocr:{async recognize(){if(++oldShadeCalls===1)return columnScene;assert(lastBitmapBytes.every(value=>value===255),'The original seven-cell path still submits its original Otsu pixels');return {text:'No old-path words',words:[],confidence:97};}}});
assert.equal(oldShadeCalls,3);
const enlargedAdaptive={...adaptiveFixture.scene,words:adaptiveFixture.scene.words.map(word=>({...word,bbox:Object.fromEntries(Object.entries(word.bbox).map(([key,value])=>[key,value*2]))}))};let clampAdaptiveCalls=0;operations.length=0;
const adaptiveClamped=await recognizeCaptureImage({image:new Image(5000,3000),nativeImage,characterOnly:true,ocr:{async recognize(){return ++clampAdaptiveCalls===1?enlargedAdaptive:{text:'No context words',words:[],confidence:97};}}});
assert.equal(clampAdaptiveCalls,2);assert(adaptiveClamped.result.refinements[0].scale<6);assert(adaptiveClamped.result.refinements[0].tiles.every(tile=>tile.scale<=adaptiveClamped.result.refinements[0].scale&&tile.scale<=(tile.context?3:6)),'Actual mixed ceilings are retained after global budget clamping');
for(const operation of operations.filter(value=>value.bitmap))assert(operation.bitmap.width*operation.bitmap.height<=4*1024*1024&&Math.max(operation.bitmap.width,operation.bitmap.height)<=4096,'Adaptive mixed-scale clamping includes all tile padding and gutters');
let cancellationCalls=0,adaptiveCurrent=true;
const adaptiveCancelled=await recognizeCaptureImage({image:new PixelImage(5000,3000,adaptiveInk),nativeImage,characterOnly:true,isCurrent:()=>adaptiveCurrent,ocr:{async recognize(){if(++cancellationCalls===1)return adaptiveFixture.scene;adaptiveCurrent=false;return {confidence:97,text:'Cancelled context',words:[]};}}});
assert.equal(cancellationCalls,2);assert.equal(adaptiveCancelled.cancelled,true,'Withdrawal after context cannot schedule or publish the followup');
console.log('Capture reader: region bounds, cancellation, mixed-client budget, exact mixed-scale mapping and full-native-widget source-guard adversaries passed.');
