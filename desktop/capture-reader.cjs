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
        const x=Math.max(selected.x,Math.floor(selected.x+proposed.x/input.scale)),y=Math.max(selected.y,Math.floor(selected.y+proposed.y/input.scale));
        const right=Math.min(selected.x+selected.width,Math.ceil(selected.x+(proposed.x+proposed.width)/input.scale)),bottom=Math.min(selected.y+selected.height,Math.ceil(selected.y+(proposed.y+proposed.height)/input.scale));
        const crop={x,y,width:right-x,height:bottom-y};
        if(crop.width<4||crop.height<4||crop.width*crop.height>1024*1024)continue;
        let scale=proposed.scale||6;
        while(scale>1&&(crop.width*crop.height*scale*scale>1024*1024||Math.max(crop.width,crop.height)*scale>4096))scale--;
        let part=image.crop(crop).resize({width:crop.width*scale,height:crop.height*scale,quality:'best'});
        const bitmap=part.toBitmap({scaleFactor:1});let greenPixels=0;
        for(let index=0;index<bitmap.length;index+=4)if(bitmap[index+1]-Math.max(bitmap[index],bitmap[index+2])>35)greenPixels++;
        // Green item-name text is optional. Plain white names retain the
        // unmodified color crop rather than becoming an empty mask.
        const preprocessing=proposed.preprocessing==='green'&&greenPixels<20?'color':proposed.preprocessing;
        if(preprocessing!=='color'){
            for(let index=0;index<bitmap.length;index+=4){const value=preprocessing==='green'?(bitmap[index+1]-Math.max(bitmap[index],bitmap[index+2])>35?0:255):255-Math.max(bitmap[index],bitmap[index+1],bitmap[index+2]);bitmap[index]=bitmap[index+1]=bitmap[index+2]=value;bitmap[index+3]=255;}
            part=nativeImage.createFromBitmap(bitmap,{width:crop.width*scale,height:crop.height*scale,scaleFactor:1});
        }
        if(!isCurrent())return cancelled();
        const read=await ocr.recognize(part.toPNG(),{layout:proposed.layout});
        if(!isCurrent())return cancelled();
        const words=(read.words||[]).map(word=>({...word,bbox:{
            x0:(crop.x-selected.x+word.bbox.x0/scale)*input.scale,y0:(crop.y-selected.y+word.bbox.y0/scale)*input.scale,
            x1:(crop.x-selected.x+word.bbox.x1/scale)*input.scale,y1:(crop.y-selected.y+word.bbox.y1/scale)*input.scale}}));
        const pass={role:proposed.role,region:crop,scale,preprocessing,layout:proposed.layout,confidence:read.confidence};
        refinements.push({...pass,text:read.text,words});input.ocrPasses.push(pass);
    }
    return {result:{...result,refinements},input,warning:prepared.warning};
}
module.exports={recognizeCaptureImage};
