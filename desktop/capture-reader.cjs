'use strict';
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {prepareCaptureImage}=require('./capture-image.cjs');
const parser=import(pathToFileURL(path.join(__dirname,'..','app','screen-read-parser.js')).href);
const modernWidgets=['acMitigation','acMitigationSoftcap','acEvasion','attackOffense','attackAccuracy'].map(key=>'modern-'+key);
const resourceColumns=['modern-resource-current','modern-resource-maximum'],nativeModernContext='default-modern-resource-context-v1';
function componentThreshold(pixels){
    const histogram=new Uint32Array(256);let sum=0,count=0;
    for(let index=0;index<pixels.length;index+=4){const value=Math.max(pixels[index],pixels[index+1],pixels[index+2]);histogram[value]++;sum+=value;count++;}
    let background=0,backgroundSum=0,best=-1,threshold=128;
    for(let value=0;value<255;value++){background+=histogram[value];backgroundSum+=value*histogram[value];const foreground=count-background;if(!background||!foreground)continue;const difference=backgroundSum/background-(sum-backgroundSum)/foreground,variance=background*foreground*difference*difference;if(variance>best){best=variance;threshold=value;}}
    // Default Modern has bright digits on a dark stat field. Preserve each
    // observed glyph before resize; the atlas's inversion below supplies the
    // OCR worker with black digits on white, without reconstructing digits.
    for(let index=0;index<pixels.length;index+=4){const value=Math.max(pixels[index],pixels[index+1],pixels[index+2])>threshold?255:0;pixels[index]=pixels[index+1]=pixels[index+2]=value;pixels[index+3]=255;}
    return pixels;
}
function verifySourceGuard(image,crop){
    const guard=crop.sourceGuard;if(!guard)return true;
    if(guard.clipped||!guard.neighbor||guard.minimumGap<1||guard.width*guard.height>1024*1024)return false;
    const pixels=componentThreshold(Buffer.from(image.crop({x:guard.x,y:guard.y,width:guard.width,height:guard.height}).toBitmap({scaleFactor:1}))),right=crop.x+crop.width;let ownInk=false;
    for(let y=0;y<guard.height;y++)for(let x=0;x<guard.width;x++){
        if(!pixels[(y*guard.width+x)*4])continue;const px=guard.x+x,py=guard.y+y;
        if(px>=right){if(px<guard.neighbor.x0||px>=guard.neighbor.x1||py<guard.neighbor.y0||py>=guard.neighbor.y1)return false;}
        else if(px>=right-guard.minimumGap)return false;
        else ownInk=true;
    }
    return ownInk;
}

async function recognizeCaptureImage({ocr,image,region=null,referenceSize=null,isCurrent=()=>true,nativeImage,characterOnly=false}={}){
    const prepared=prepareCaptureImage({image,region,referenceSize}),input={...prepared.input,ocrPasses:[]};
    const cancelled=()=>({result:{text:'',confidence:0,words:[]},input,warning:prepared.warning,cancelled:true});
    if(!isCurrent())return cancelled();
    const recognized=await ocr.recognize(prepared.png),result={...recognized,...(characterOnly===true?{characterOnly:true}:{})};
    if(!isCurrent())return cancelled();
    input.ocrPasses.push({role:'scene',region:input.region,scale:input.scale,layout:'sparse',preprocessing:'color',confidence:result.confidence});
    if(!Array.isArray(result.words)||!result.words.length||!nativeImage?.createFromBitmap)return {result,input,warning:prepared.warning};
    const {screenReadRefinementRegions,screenReadCharacterFollowup}=await parser;
    if(!isCurrent())return cancelled();
    const refinements=[],proposals=screenReadRefinementRegions({...result,characterOnly:characterOnly===true}).slice(0,2);
    for(let passIndex=0;passIndex<Math.min(2,proposals.length);passIndex++){
        const proposed=proposals[passIndex],adaptive=proposed.nativeContext===nativeModernContext||proposed.nativeFollowup===nativeModernContext;
        if(!isCurrent())return cancelled();
        const selected=input.region;
        const crops=(proposed.tiles||[proposed]).slice(0,4).map(tile=>{
            const x=Math.max(selected.x,Math.floor(selected.x+tile.x/input.scale)),y=Math.max(selected.y,Math.floor(selected.y+tile.y/input.scale));
            const right=Math.min(selected.x+selected.width,Math.ceil(selected.x+(tile.x+tile.width)/input.scale)),bottom=Math.min(selected.y+selected.height,Math.ceil(selected.y+(tile.y+tile.height)/input.scale));
            let sourceGuard;
            if(tile.sourceGuard){const guard=tile.sourceGuard,gx=Math.floor(selected.x+guard.x/input.scale),gy=Math.floor(selected.y+guard.y/input.scale),gr=Math.ceil(selected.x+(guard.x+guard.width)/input.scale),gb=Math.ceil(selected.y+(guard.y+guard.height)/input.scale);
                sourceGuard={x:Math.max(selected.x,gx),y:Math.max(selected.y,gy),width:Math.min(selected.x+selected.width,gr)-Math.max(selected.x,gx),height:Math.min(selected.y+selected.height,gb)-Math.max(selected.y,gy),clipped:gx<selected.x||gy<selected.y||gr>selected.x+selected.width||gb>selected.y+selected.height,minimumGap:guard.minimumGap/input.scale,neighbor:{x0:Math.floor(selected.x+guard.neighbor.x0/input.scale),y0:Math.floor(selected.y+guard.neighbor.y0/input.scale),x1:Math.ceil(selected.x+guard.neighbor.x1/input.scale),y1:Math.ceil(selected.y+guard.neighbor.y1/input.scale)}};
            }
            const sourceRows=resourceColumns.includes(tile.column)?(tile.sourceRows||[]).slice(0,3).map(row=>({key:row.key,x:Math.floor(selected.x+row.x/input.scale),y:Math.floor(selected.y+row.y/input.scale),width:Math.ceil(selected.x+(row.x+row.width)/input.scale)-Math.floor(selected.x+row.x/input.scale),height:Math.ceil(selected.y+(row.y+row.height)/input.scale)-Math.floor(selected.y+row.y/input.scale)})):null;
            return {x,y,width:right-x,height:bottom-y,...(['attackOffense','attackAccuracy','acEvasion'].includes(tile.component)?{component:tile.component}:{}),...(['modern-attributes','modern-resists',...modernWidgets,...resourceColumns].includes(tile.column)?{column:tile.column}:{}),...(tile.context===nativeModernContext?{context:nativeModernContext,scale:3}:{}),...(modernWidgets.includes(tile.column)?{scale:3}:{}),...(sourceGuard?{sourceGuard}:{}),...(sourceRows?{sourceRows}:{}),...(tile.sourceGuardUnproven?{sourceGuardUnproven:true}:{})};
        }).filter(crop=>['x','y','width','height'].every(key=>Number.isFinite(crop[key]))&&crop.width>=4&&crop.height>=4&&crop.width*crop.height<=1024*1024);
        if(!crops.length)continue;
        const budget=(proposed.role==='item-name'?1:4)*1024*1024,gap=16;
        const modernColumns=crops.some(crop=>crop.column);
        let scale=proposed.scale||6,width,height,padding=0;
        const scaleFor=crop=>Math.min(scale,crop.scale||scale);
        do{padding=modernColumns?Math.max(8,scale*2):0;width=Math.max(...crops.map(crop=>crop.width*scaleFor(crop)))+padding*2;height=crops.reduce((sum,crop)=>sum+crop.height*scaleFor(crop)+padding*2,0)+gap*(crops.length-1);
            if(width*height<=budget&&Math.max(width,height)<=4096)break;
        }while(--scale>=1);
        if(scale<1)continue;
        const bitmap=Buffer.alloc(width*height*4,255),tiles=[];let top=0,greenPixels=0;
        for(const crop of crops){
            const tileScale=scaleFor(crop),tileWidth=crop.width*tileScale,tileHeight=crop.height*tileScale;let source=image.crop({x:crop.x,y:crop.y,width:crop.width,height:crop.height});
            if(crop.component||crop.column){const sourcePixels=source.toBitmap({scaleFactor:1}),pixels=componentThreshold(adaptive?Buffer.from(sourcePixels):sourcePixels);
                if(modernWidgets.includes(crop.column)){
                    const ink=(x,y)=>pixels[(y*crop.width+x)*4]>0;
                    crop.edgeClipped=crop.sourceGuardUnproven===true||Array.from({length:crop.width},(_,x)=>ink(x,0)||ink(x,crop.height-1)).some(Boolean)||Array.from({length:crop.height},(_,y)=>ink(0,y)||ink(crop.width-1,y)).some(Boolean);
                    if(crop.sourceGuard){crop.guardVerified=verifySourceGuard(image,crop);if(!crop.guardVerified)crop.edgeClipped=true;}
                }
                if(crop.sourceRows)crop.rowProofs=crop.sourceRows.map(row=>{
                    const x0=row.x-crop.x,y0=row.y-crop.y,complete=x0>=0&&y0>=0&&x0+row.width<=crop.width&&y0+row.height<=crop.height;let inkPresent=false,edgeClipped=false;
                    if(complete)for(let y=0;y<row.height;y++)for(let x=0;x<row.width;x++)if(pixels[((y0+y)*crop.width+x0+x)*4]){inkPresent=true;if(x===0||y===0||x===row.width-1||y===row.height-1)edgeClipped=true;}
                    return {...row,complete,inkPresent,edgeClipped:!complete||edgeClipped};
                });
                if(crop.column)crop.preprocessing=adaptive?'antialias-inverted':'local-otsu';
                if(adaptive&&(crop.sourceRows||modernWidgets.includes(crop.column)))crop.guardPreprocessing='local-otsu';
                // Adaptive tiny glyphs retain their antialiased source pixels.
                // Otsu above proves source completeness on a separate copy; it
                // must never replace the pixels actually submitted to OCR.
                if(!adaptive)source=nativeImage.createFromBitmap(pixels,{width:crop.width,height:crop.height,scaleFactor:1});}
            else if(crop.context)crop.preprocessing='antialias-inverted';
            else if(proposed.preprocessing==='source-threshold'){
                const sourcePixels=source.toBitmap({scaleFactor:1});for(let index=0;index<sourcePixels.length;index+=4){const value=Math.max(sourcePixels[index],sourcePixels[index+1],sourcePixels[index+2])>45?0:255;
                    sourcePixels[index]=sourcePixels[index+1]=sourcePixels[index+2]=value;sourcePixels[index+3]=255;}
                source=nativeImage.createFromBitmap(sourcePixels,{width:crop.width,height:crop.height,scaleFactor:1});
            }
            const pixels=source.resize({width:tileWidth,height:tileHeight,quality:'best'}).toBitmap({scaleFactor:1});
            for(let row=0;row<tileHeight;row++)pixels.copy(bitmap,((top+padding+row)*width+padding)*4,row*tileWidth*4,(row+1)*tileWidth*4);
            if(crop.column||crop.context)crop.scale=tileScale;
            tiles.push({region:crop,component:crop.component,column:crop.column,scale:tileScale,x:padding,y:top+padding,width:tileWidth,height:tileHeight});top+=tileHeight+padding*2+gap;
        }
        for(let index=0;index<bitmap.length;index+=4)if(bitmap[index+1]-Math.max(bitmap[index],bitmap[index+2])>35)greenPixels++;
        // Green item-name text is optional. Plain white names retain the
        // unmodified color crop rather than becoming an empty mask.
        const preprocessing=proposed.preprocessing==='green'&&greenPixels<20?'color':proposed.preprocessing;
        if(preprocessing!=='color'&&preprocessing!=='source-threshold'){
            for(let index=0;index<bitmap.length;index+=4){const value=preprocessing==='green'?(bitmap[index+1]-Math.max(bitmap[index],bitmap[index+2])>35?0:255):255-Math.max(bitmap[index],bitmap[index+1],bitmap[index+2]);bitmap[index]=bitmap[index+1]=bitmap[index+2]=value;bitmap[index+3]=255;}
        }
        // Inversion must not turn untouched atlas space into black gutters.
        // Keep Modern tile margins white after the actual transform, including
        // right-hand padding beside narrower columns and complete numeric rows.
        if(modernColumns)for(let row=0;row<height;row++){
            const tile=tiles.find(tile=>row>=tile.y&&row<tile.y+tile.height),start=row*width*4;
            if(!tile)bitmap.fill(255,start,start+width*4);
            else{bitmap.fill(255,start,start+tile.x*4);bitmap.fill(255,start+(tile.x+tile.width)*4,start+width*4);}
        }
        const part=nativeImage.createFromBitmap(bitmap,{width,height,scaleFactor:1});
        if(!isCurrent())return cancelled();
        const read=await ocr.recognize(part.toPNG(),{layout:proposed.layout});
        if(!isCurrent())return cancelled();
        const words=(read.words||[]).slice(0,2000).flatMap(word=>{if(!word?.bbox)return [];const box=word.bbox,tile=tiles.find(tile=>box.x0>=tile.x&&box.x1<=tile.x+tile.width&&box.y0>=tile.y&&box.y1<=tile.y+tile.height);if(!tile)return [];return [{...word,...(tile.component?{component:tile.component}:{}),...(tile.column?{column:tile.column}:{}),...(tile.region.context?{context:tile.region.context}:{}),bbox:{
            x0:(tile.region.x-selected.x+(box.x0-tile.x)/tile.scale)*input.scale,y0:(tile.region.y-selected.y+(box.y0-tile.y)/tile.scale)*input.scale,
            x1:(tile.region.x-selected.x+(box.x1-tile.x)/tile.scale)*input.scale,y1:(tile.region.y-selected.y+(box.y1-tile.y)/tile.scale)*input.scale}}];});
        const pass={role:proposed.role,...(tiles.length===1?{region:crops[0]}:{tiles:crops}),...(proposed.nativeContext?{nativeContext:proposed.nativeContext}:{}),...(proposed.nativeFollowup?{nativeFollowup:proposed.nativeFollowup}:{}),...(crops.some(crop=>crop.component)?{componentPreprocessing:'local-otsu'}:{}),...(crops.some(crop=>crop.column)?{columnPreprocessing:adaptive?'antialias-inverted':'local-otsu'}:{}),...(adaptive?{guardPreprocessing:'local-otsu'}:{}),scale,preprocessing,layout:proposed.layout,confidence:read.confidence};
        refinements.push({...pass,text:read.text,words});input.ocrPasses.push(pass);
        if(characterOnly===true&&refinements.length===1&&proposals.length===1&&proposed.nativeContext===nativeModernContext){const followup=screenReadCharacterFollowup({...result,characterOnly:true,input,refinements});if(followup)proposals.push(followup);}
    }
    return {result:{...result,refinements},input,warning:prepared.warning};
}
module.exports={recognizeCaptureImage};
