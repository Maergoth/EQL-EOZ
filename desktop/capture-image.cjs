'use strict';
const PNG_SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
function captureOcrScale({width,height}){
    // Enlarging tiny examine text helps without multiplying a tall/large
    // screenshot past the same decode limits used at the IPC boundary.
    let scale=width<1000?3:width<1600?2:1;
    while(scale>1 && (width*height*scale*scale>16*1024*1024 || Math.max(width,height)*scale>8192))scale--;
    return scale;
}
function validateCapturePng(bytes,{width,height,maxPixels=16*1024*1024,maxBytes=32*1024*1024}={}){
    const png=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes||[]);
    if(png.length<33||png.length>maxBytes||!png.subarray(0,8).equals(PNG_SIGNATURE)||png.readUInt32BE(8)!==13||png.toString('ascii',12,16)!=='IHDR')throw new Error('Choose a valid PNG screenshot smaller than 32 MB.');
    const actualWidth=png.readUInt32BE(16),actualHeight=png.readUInt32BE(20);
    if(!actualWidth||!actualHeight||actualWidth>8192||actualHeight>8192||actualWidth*actualHeight>maxPixels)throw new Error('Choose a PNG screenshot smaller than 16 megapixels.');
    if((width!==undefined&&width!==actualWidth)||(height!==undefined&&height!==actualHeight))throw new Error('The capture dimensions do not match the PNG header.');
    return {width:actualWidth,height:actualHeight};
}
module.exports={validateCapturePng,captureOcrScale};
