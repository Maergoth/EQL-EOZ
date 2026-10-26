'use strict';
// Explicitly selected images only. Inspect dimensions before allocating pixels;
// decode/re-encode so original file metadata never enters a public upload.
const MAX_SOURCE_BYTES=48*1024*1024,MAX_PNG_BYTES=12*1024*1024,MAX_PIXELS=15000000,MAX_SIDE=8192;
const PNG=Buffer.from('89504e470d0a1a0a','hex');
function dimensions(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_PIXELS)throw Error('Choose an image no larger than 8,192 pixels per side and 15 megapixels.');return {width,height};}
function jpegSize(bytes){
    let at=2;
    while(at<bytes.length){if(bytes[at++]!==255)throw Error('Invalid JPEG image.');while(bytes[at]===255)at++;const marker=bytes[at++];if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;
        if(at+2>bytes.length)break;const length=bytes.readUInt16BE(at);if(length<2||at+length>bytes.length)break;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){if(length<8)break;return dimensions(bytes.readUInt16BE(at+5),bytes.readUInt16BE(at+3));}at+=length;
    }throw Error('The JPEG has no supported image dimensions.');
}
function bitmap(bytes,nativeImage){
    if(bytes.length<54)throw Error('Invalid BMP image.');const header=bytes.readUInt32LE(14),offset=bytes.readUInt32LE(10),declared=bytes.readUInt32LE(2);
    if(![40,108,124].includes(header)||14+header>bytes.length||offset<14+header||offset>bytes.length)throw Error('Unsupported BMP header. Use an uncompressed 24- or 32-bit BMP, PNG or JPEG.');
    const width=bytes.readInt32LE(18),signedHeight=bytes.readInt32LE(22),height=Math.abs(signedHeight),bits=bytes.readUInt16LE(28);dimensions(width,height);
    if(bytes.readUInt16LE(26)!==1||![24,32].includes(bits)||bytes.readUInt32LE(30)!==0)throw Error('Use an uncompressed 24- or 32-bit BMP, PNG or JPEG.');
    const stride=Math.ceil(width*bits/32)*4,end=offset+stride*height;
    if(end>bytes.length||declared!==0&&(declared<end||declared>bytes.length))throw Error('The BMP pixel data is incomplete.');
    const pixels=Buffer.alloc(width*height*4);
    for(let y=0;y<height;y++){const row=offset+(signedHeight>0?height-1-y:y)*stride;for(let x=0;x<width;x++){const from=row+x*(bits/8),to=(y*width+x)*4;pixels[to]=bytes[from];pixels[to+1]=bytes[from+1];pixels[to+2]=bytes[from+2];pixels[to+3]=255;}}
    // BI_RGB has no defined alpha mask; ordinary game screenshots are opaque.
    return {image:nativeImage.createFromBitmap(pixels,{width,height,scaleFactor:1}),width,height};
}
function decodeCharacterScreenshot(value,nativeImage){
    if(!Buffer.isBuffer(value)||value.length<8||value.length>MAX_SOURCE_BYTES)throw Error('Choose a PNG, JPEG or BMP smaller than 48 MiB.');
    let image,size;
    if(value.subarray(0,8).equals(PNG)){if(value.length<33||value.readUInt32BE(8)!==13||value.toString('ascii',12,16)!=='IHDR')throw Error('Invalid PNG image.');size=dimensions(value.readUInt32BE(16),value.readUInt32BE(20));}
    else if(value[0]===255&&value[1]===216)size=jpegSize(value);
    else if(value.toString('ascii',0,2)==='BM'){const decoded=bitmap(value,nativeImage);image=decoded.image;size=decoded;}
    else throw Error('Choose a PNG, JPEG or uncompressed 24- or 32-bit BMP image.');
    image=image||nativeImage.createFromBuffer(value);if(!image||image.isEmpty())throw Error('The selected image could not be decoded.');const actual=image.getSize();
    if(actual.width!==size.width||actual.height!==size.height)throw Error('The decoded image dimensions do not match its header.');
    const png=image.toPNG();if(!Buffer.isBuffer(png)||png.length>MAX_PNG_BYTES||png.length<33||!png.subarray(0,8).equals(PNG))throw Error('The normalized screenshot exceeds 12 MiB. Select a smaller image.');
    return {png,image,width:size.width,height:size.height};
}
module.exports={decodeCharacterScreenshot,MAX_SOURCE_BYTES,MAX_PNG_BYTES};
