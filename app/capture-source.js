// This isolated local window has no log, wiki authentication or main-app IPC.
// Cheap change sampling continues independently of the serial main-process OCR.
let stream=null,stopped=false,timer=null,busy=false,lastEncodedAt=-Infinity,lastFingerprint=null,lastIdentity='';
const api=window.eyeOfZommCaptureSource,video=document.getElementById('source');
const comparison=document.createElement('canvas');comparison.width=256;comparison.height=144;
function stop(){stopped=true;clearTimeout(timer);stream?.getTracks().forEach(track=>track.stop());stream=null;lastFingerprint=null;comparison.width=comparison.height=1;}
function fingerprint(region){
    const context=comparison.getContext('2d',{alpha:false,willReadFrequently:true}),crop=region||{x:0,y:0,width:1,height:1};
    context.drawImage(video,crop.x*video.videoWidth,crop.y*video.videoHeight,crop.width*video.videoWidth,crop.height*video.videoHeight,0,0,comparison.width,comparison.height);
    return context.getImageData(0,0,comparison.width,comparison.height).data;
}
function samePixels(left,right){if(!left||left.length!==right.length)return false;for(let i=0;i<left.length;i++)if(left[i]!==right[i])return false;return true;}
async function sample(){
    if(stopped||!stream)return;
    // Only one encode/IPC may run; slow transport cannot create overlapping
    // screenshots. The next cheap sampling tick is independent of OCR work.
    timer=setTimeout(sample,125);if(busy)return;busy=true;const selectedStream=stream;let canvas;
    try{
        if(video.readyState<2||!video.videoWidth||!video.videoHeight)return;
        const state=await api.state(),capture=state.capture;if(stopped||stream!==selectedStream||!capture)return;
        const at=Date.now(),identity=JSON.stringify([capture.generation,capture.owner,capture.sessionId,capture.sourceId,video.videoWidth,video.videoHeight,capture.region]),pixels=fingerprint(capture.region);
        if(at-lastEncodedAt<250||(identity===lastIdentity&&samePixels(pixels,lastFingerprint)&&at-lastEncodedAt<750))return;
        const scale=Math.min(1,4096/video.videoWidth,2160/video.videoHeight);
        canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
        const capturedAt=Date.now();canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);
        lastEncodedAt=capturedAt;lastFingerprint=pixels;lastIdentity=identity;
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(blob&&blob.size<=32*1024*1024&&!stopped){
            const bytes=new Uint8Array(await blob.arrayBuffer());
            if(!stopped&&stream===selectedStream)await api.frame({bytes,width:canvas.width,height:canvas.height,capturedAt,
                sourceWidth:video.videoWidth,sourceHeight:video.videoHeight,captureGeneration:capture.generation,
                owner:capture.owner,sessionId:capture.sessionId,sourceId:capture.sourceId});
        }
    }catch{if(!stopped&&stream===selectedStream)await api.signal('frame-error').catch(()=>{});}
    finally{if(canvas)canvas.width=canvas.height=1;busy=false;}
}
window.startScreenReadCapture=async()=>{
    const state=await api.state();if(!state.allowed||stopped||stream)return false;
    try{
        stream=await navigator.mediaDevices.getDisplayMedia({audio:false,video:{frameRate:{ideal:8,max:8}}});
        if(stopped){stream.getTracks().forEach(track=>track.stop());return false;}
        const selectedStream=stream;
        stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(stopped||stream!==selectedStream)return;stop();void api.signal('ended').catch(()=>{});},{once:true});
        video.srcObject=stream;await video.play();await api.signal('started');void sample();return true;
    }catch(error){await api.signal('error',`Screen capture could not start (${String(error?.name||'capture error').slice(0,80)}: ${String(error?.message||'permission denied').slice(0,200)}). Choose a source and try again.`).catch(()=>{});stop();return false;}
};
window.addEventListener('pagehide',stop);
