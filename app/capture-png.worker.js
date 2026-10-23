// Local-only serial PNG encoding. No OCR, source selection or app IPC belongs
// in this worker. The transferred bitmap is the source's already frozen frame.
let encoding=false;
const MAX_PNG_BYTES=32*1024*1024;
self.onmessage=async event=>{
    const value=event.data,id=value?.id,bitmap=value?.bitmap;
    let surface,accepted=false;
    const reply=error=>{if(Number.isSafeInteger(id)&&id>0)self.postMessage({id,ok:false,error});};
    try{
        if(!Number.isSafeInteger(id)||id<1||!(bitmap instanceof ImageBitmap)||
            !Number.isInteger(value.width)||!Number.isInteger(value.height)||
            value.width<1||value.height<1||value.width>4096||value.height>2160||
            bitmap.width!==value.width||bitmap.height!==value.height){reply('invalid-image');return;}
        if(encoding){reply('encoder-busy');return;}
        encoding=true;accepted=true;
        surface=new OffscreenCanvas(value.width,value.height);
        surface.getContext('2d',{alpha:false}).drawImage(bitmap,0,0);
        bitmap.close();
        const blob=await surface.convertToBlob({type:'image/png'});
        if(!blob||blob.size<1||blob.size>MAX_PNG_BYTES){reply('png-size');return;}
        const bytes=await blob.arrayBuffer();
        if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==blob.size||bytes.byteLength>MAX_PNG_BYTES){reply('png-size');return;}
        self.postMessage({id,ok:true,width:value.width,height:value.height,bytes},[bytes]);
    }catch{reply('png-encode');}
    finally{
        bitmap?.close?.();
        if(surface)surface.width=surface.height=1;
        if(accepted)encoding=false;
    }
};
