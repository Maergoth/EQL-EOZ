'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {prepareCaptureImage}=require('./capture-image.cjs');
const parser=import(pathToFileURL(path.join(__dirname,'..','app','screen-read-parser.js')).href);

async function recognizeCaptureImage({ocr,image,region=null,referenceSize=null,isCurrent=()=>true,nativeImage}={}){
    const prepared=prepareCaptureImage({image,region,referenceSize}),input={...prepared.input,ocrPasses:[]};
    const cancelled=()=>({result:{text:'',confidence:0,words:[]},input,warning:prepared.warning,cancelled:true});
    if(!isCurrent())return cancelled();
    const result=await ocr.recognize(prepared.png);
    if(!isCurrent())return cancelled();
    input.ocrPasses.push({role:'scene',region:input.region,scale:input.scale,layout:'sparse',preprocessing:'color',confidence:result.confidence});
    if(!Array.isArray(result.words)||!result.words.length||!nativeImage?.createFromBitmap)return {result,input,warning:prepared.warning};
    const {screenReadRefinementRegions}=await parser;
    if(!isCurrent())return cancelled();
    const refinements=[];
    for(const proposed of screenReadRefinementRegions(result).slice(0,2)){
        if(!isCurrent())return cancelled();
        const selected=input.region;
        const crops=(proposed.tiles||[proposed]).slice(0,4).map(tile=>{
            const x=Math.max(selected.x,Math.floor(selected.x+tile.x/input.scale)),y=Math.max(selected.y,Math.floor(selected.y+tile.y/input.scale));
            const right=Math.min(selected.x+selected.width,Math.ceil(selected.x+(tile.x+tile.width)/input.scale)),bottom=Math.min(selected.y+selected.height,Math.ceil(selected.y+(tile.y+tile.height)/input.scale));
            return {x,y,width:right-x,height:bottom-y};
        }).filter(crop=>Object.values(crop).every(Number.isFinite)&&crop.width>=4&&crop.height>=4&&crop.width*crop.height<=1024*1024);
        if(!crops.length)continue;
        const budget=(proposed.role==='item-name'?1:4)*1024*1024,gap=16;
        let scale=proposed.scale||6,width,height;
        do{width=Math.max(...crops.map(crop=>crop.width))*scale;height=crops.reduce((sum,crop)=>sum+crop.height*scale,0)+gap*(crops.length-1);
            if(width*height<=budget&&Math.max(width,height)<=4096)break;
        }while(--scale>=1);
        if(scale<1)continue;
        const bitmap=Buffer.alloc(width*height*4,255),tiles=[];let top=0,greenPixels=0;
        for(const crop of crops){
            const tileWidth=crop.width*scale,tileHeight=crop.height*scale;let source=image.crop(crop);
            if(proposed.preprocessing==='source-threshold'){
                const sourcePixels=source.toBitmap({scaleFactor:1});for(let index=0;index<sourcePixels.length;index+=4){const value=Math.max(sourcePixels[index],sourcePixels[index+1],sourcePixels[index+2])>45?0:255;
                    sourcePixels[index]=sourcePixels[index+1]=sourcePixels[index+2]=value;sourcePixels[index+3]=255;}
                source=nativeImage.createFromBitmap(sourcePixels,{width:crop.width,height:crop.height,scaleFactor:1});
            }
            const pixels=source.resize({width:tileWidth,height:tileHeight,quality:'best'}).toBitmap({scaleFactor:1});
            for(let row=0;row<tileHeight;row++)pixels.copy(bitmap,(top+row)*width*4,row*tileWidth*4,(row+1)*tileWidth*4);
            tiles.push({region:crop,x:0,y:top,width:tileWidth,height:tileHeight});top+=tileHeight+gap;
        }
        for(let index=0;index<bitmap.length;index+=4)if(bitmap[index+1]-Math.max(bitmap[index],bitmap[index+2])>35)greenPixels++;
        // Green item-name text is optional. Plain white names retain the
        // unmodified color crop rather than becoming an empty mask.
        const preprocessing=proposed.preprocessing==='green'&&greenPixels<20?'color':proposed.preprocessing;
        if(preprocessing!=='color'&&preprocessing!=='source-threshold'){
            for(let index=0;index<bitmap.length;index+=4){const value=preprocessing==='green'?(bitmap[index+1]-Math.max(bitmap[index],bitmap[index+2])>35?0:255):255-Math.max(bitmap[index],bitmap[index+1],bitmap[index+2]);bitmap[index]=bitmap[index+1]=bitmap[index+2]=value;bitmap[index+3]=255;}
        }
        const part=nativeImage.createFromBitmap(bitmap,{width,height,scaleFactor:1});
        if(!isCurrent())return cancelled();
        const read=await ocr.recognize(part.toPNG(),{layout:proposed.layout});
        if(!isCurrent())return cancelled();
        const words=(read.words||[]).slice(0,2000).flatMap(word=>{if(!word?.bbox)return [];const box=word.bbox,tile=tiles.find(tile=>box.x0>=tile.x&&box.x1<=tile.x+tile.width&&box.y0>=tile.y&&box.y1<=tile.y+tile.height);if(!tile)return [];return [{...word,bbox:{
            x0:(tile.region.x-selected.x+(box.x0-tile.x)/scale)*input.scale,y0:(tile.region.y-selected.y+(box.y0-tile.y)/scale)*input.scale,
            x1:(tile.region.x-selected.x+(box.x1-tile.x)/scale)*input.scale,y1:(tile.region.y-selected.y+(box.y1-tile.y)/scale)*input.scale}}];});
        const pass={role:proposed.role,...(tiles.length===1?{region:crops[0]}:{tiles:crops}),scale,preprocessing,layout:proposed.layout,confidence:read.confidence};
        refinements.push({...pass,text:read.text,words});input.ocrPasses.push(pass);
    }
    return {result:{...result,refinements},input,warning:prepared.warning};
}
module.exports={recognizeCaptureImage};
