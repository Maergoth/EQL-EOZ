// Sage may retain a material reference to an image it did not export. Let the
// viewer's existing raw-local-texture lookup resolve it, or keep its color.
// Geometry, valid images and material values are preserved.
export function withoutUnavailableGltfImages(buffer){
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20)return{buffer,removed:0};
    const view=new DataView(buffer),length=view.getUint32(12,true);
    if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength||view.getUint32(16,true)!==0x4e4f534a||length>16*1024*1024||20+length>buffer.byteLength)return{buffer,removed:0};
    let document;try{document=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)).replace(/\0+$/g,'').trim());}catch{return{buffer,removed:0};}
    const images=document.images||[],invalid=new Set(images.flatMap((image,index)=>!image.uri&&image.bufferView===undefined?[index]:[]));
    const textures=new Set((document.textures||[]).flatMap((texture,index)=>invalid.has(texture.source)?[index]:[]));let removed=0;
    function visit(value){if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){const child=value[key];if(/Texture$/.test(key)&&child&&textures.has(child.index)){delete value[key];removed++;}else visit(child);}}
    for(const material of document.materials||[])visit(material);
    if(!removed)return{buffer,removed:0};
    const json=new TextEncoder().encode(JSON.stringify(document)),padded=(json.length+3)&~3,result=new ArrayBuffer(20+padded+buffer.byteLength-20-length),bytes=new Uint8Array(result),header=new DataView(result);
    bytes.set(new Uint8Array(buffer,0,12));header.setUint32(8,result.byteLength,true);header.setUint32(12,padded,true);header.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+padded);bytes.set(json,20);bytes.set(new Uint8Array(buffer,20+length),20+padded);
    return{buffer:result,removed};
}
export function installViewerGltfImageGuard(app){
    const parse=app.parseGltf,display=app.displayParsedZone;
    app.parseGltf=function(buffer,...args){const checked=withoutUnavailableGltfImages(buffer);this.eyeOfZommMissingTextureReferences=(this.eyeOfZommMissingTextureReferences||0)+checked.removed;return parse.call(this,checked.buffer,...args);};
    app.displayParsedZone=function(...args){this.eyeOfZommMissingTextureReferences=0;return display.apply(this,args);};
}
