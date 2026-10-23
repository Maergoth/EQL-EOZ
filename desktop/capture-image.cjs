'use strict';
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
function captureOcrScale({width,height}){
    // Enlarging tiny examine text helps without multiplying a tall/large
    // screenshot past the same decode limits used at the IPC boundary.
    let scale=width<1000?3:2;
    while(scale>1 && (width*height*scale*scale>16*1024*1024 || Math.max(width,height)*scale>8192))scale--;
    return scale;
}
function normalizeCaptureRegion(region,referenceSize){
    if(region===null||region===undefined)return null;
    if(!referenceSize||!Number.isInteger(referenceSize.width)||!Number.isInteger(referenceSize.height)||referenceSize.width<1||referenceSize.height<1||referenceSize.width>8192||referenceSize.height>8192||referenceSize.width*referenceSize.height>16*1024*1024)throw new Error('Choose a capture preview before calibrating a region.');
    const {x,y,width,height}=region;
    if(![x,y,width,height].every(value=>typeof value==='number'&&Number.isFinite(value))||x<0||y<0||width<=0||height<=0||x+width>1||y+height>1||width*referenceSize.width<16||height*referenceSize.height<16)throw new Error('Select a capture region at least 16 pixels wide and high within the preview.');
    return {region:{x,y,width,height},referenceSize:{width:referenceSize.width,height:referenceSize.height}};
}
function prepareCaptureImage({image,region=null,referenceSize=null}){
    const sourceSize=image.getSize();
    if(image.isEmpty()||sourceSize.width<1||sourceSize.height<1||sourceSize.width>8192||sourceSize.height>8192||sourceSize.width*sourceSize.height>16*1024*1024)throw new Error('Choose a capture image smaller than 16 megapixels.');
    const selection=normalizeCaptureRegion(region,referenceSize);let warning;
    let pixels={x:0,y:0,width:sourceSize.width,height:sourceSize.height};
    if(selection){
        if(selection.referenceSize.width!==sourceSize.width||selection.referenceSize.height!==sourceSize.height)warning='The capture size changed. Region calibration was reset to the full frame.';
        else{
            const x=Math.floor(selection.region.x*sourceSize.width),y=Math.floor(selection.region.y*sourceSize.height);
            const right=Math.min(sourceSize.width,Math.ceil((selection.region.x+selection.region.width)*sourceSize.width)),bottom=Math.min(sourceSize.height,Math.ceil((selection.region.y+selection.region.height)*sourceSize.height));
            pixels={x,y,width:right-x,height:bottom-y};
        }
    }
    const scale=captureOcrScale(pixels),cropped=pixels.x===0&&pixels.y===0&&pixels.width===sourceSize.width&&pixels.height===sourceSize.height?image:image.crop(pixels);
    const prepared=scale===1?cropped:cropped.resize({width:pixels.width*scale,height:pixels.height*scale,quality:'best'});
    return {png:prepared.toPNG(),input:{sourceSize,region:pixels,scale},...(warning?{warning}:{})};
}
function validateCapturePng(bytes,{width,height,maxPixels=16*1024*1024,maxBytes=32*1024*1024}={}){
    const png=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes||[]);
    if(png.length<33||png.length>maxBytes||!png.subarray(0,8).equals(PNG_SIGNATURE)||png.readUInt32BE(8)!==13||png.toString('ascii',12,16)!=='IHDR')throw new Error('Choose a valid PNG screenshot smaller than 32 MB.');
    const actualWidth=png.readUInt32BE(16),actualHeight=png.readUInt32BE(20);
    if(!actualWidth||!actualHeight||actualWidth>8192||actualHeight>8192||actualWidth*actualHeight>maxPixels)throw new Error('Choose a PNG screenshot smaller than 16 megapixels.');
    if((width!==undefined&&width!==actualWidth)||(height!==undefined&&height!==actualHeight))throw new Error('The capture dimensions do not match the PNG header.');
    return {width:actualWidth,height:actualHeight};
}
module.exports={validateCapturePng,captureOcrScale,normalizeCaptureRegion,prepareCaptureImage};
