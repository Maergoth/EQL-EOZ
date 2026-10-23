// This isolated local window has no log, wiki authentication or main-app IPC.
// Cheap change sampling continues independently of the serial main-process OCR.
let stream=null,stopped=false,timer=null,busy=false,encoding=false,contextRevision=0,lastSampledAt=-Infinity,lastFingerprint=null,lastIdentity='',lastContext='',lastSceneAt=-Infinity;
const snapshots=[],MAX_PENDING_SNAPSHOTS=2,MAX_PENDING_BYTES=64*1024*1024,MAX_RAW_AGE_MS=15000;
let pendingBytes=0;
const paneMemory=new Map();
const api=window.eyeOfZommCaptureSource,video=document.getElementById('source');
const comparison=document.createElement('canvas');comparison.width=256;comparison.height=144;
const visual=document.createElement('canvas');
function releaseSnapshot(snapshot){snapshot.canvas.width=snapshot.canvas.height=1;}
function discardSnapshot(index){const [snapshot]=snapshots.splice(index,1);pendingBytes-=snapshot.rawBytes;releaseSnapshot(snapshot);return snapshot;}
function clearSnapshots(){while(snapshots.length)discardSnapshot(0);}
function stop(){stopped=true;contextRevision++;clearTimeout(timer);clearSnapshots();stream?.getTracks().forEach(track=>track.stop());stream=null;lastFingerprint=null;paneMemory.clear();comparison.width=comparison.height=visual.width=visual.height=1;}
function captureIdentity(capture,width,height){return JSON.stringify([capture.generation,capture.owner,capture.sessionId,capture.sourceId,width,height,capture.region]);}
function sourceDrop(reason){void api.signal('sample-drop',{reason,count:1}).catch(()=>{});}
function pruneSnapshots(){for(let n=snapshots.length-1;n>=0;n--)if(Date.now()-snapshots[n].frame.capturedAt>MAX_RAW_AGE_MS){const old=discardSnapshot(n);if(old.frame.selectionKind!=='scene')sourceDrop('age');}}
function setContext(identity){if(identity===lastContext)return;contextRevision++;clearSnapshots();paneMemory.clear();lastFingerprint=null;lastIdentity='';lastSceneAt=-Infinity;lastContext=identity;}
async function encodeSnapshots(){
    if(encoding||stopped)return;encoding=true;
    try{while(!stopped&&snapshots.length){
        pruneSnapshots();if(!snapshots.length)break;
        const index=snapshots.findIndex(snapshot=>snapshot.frame.selectionKind!=='scene'),snapshot=snapshots.splice(index<0?0:index,1)[0];pendingBytes-=snapshot.rawBytes;
        try{
            const encodeStartedAt=Date.now();
            const blob=await new Promise(resolve=>snapshot.canvas.toBlob(resolve,'image/png'));
            if(stopped||snapshot.stream!==stream||snapshot.revision!==contextRevision)continue;
            if(!blob||blob.size>32*1024*1024){sourceDrop('encode');continue;}
            const bytes=new Uint8Array(await blob.arrayBuffer());
            const encodeMs=Date.now()-encodeStartedAt;
            if(stopped||snapshot.stream!==stream||snapshot.revision!==contextRevision)continue;
            // Permission, owner and ROI may change while PNG encoding awaits.
            const state=await api.state(),capture=state.capture;
            if(stopped||snapshot.stream!==stream||snapshot.revision!==contextRevision)continue;
            if(!capture||captureIdentity(capture,video.videoWidth,video.videoHeight)!==snapshot.identity){setContext(capture?captureIdentity(capture,video.videoWidth,video.videoHeight):'');continue;}
            if(Date.now()-snapshot.frame.capturedAt>MAX_RAW_AGE_MS){if(snapshot.frame.selectionKind!=='scene')sourceDrop('age');continue;}
            await api.frame({...snapshot.frame,bytes,sourceTiming:{...snapshot.frame.sourceTiming,sourceQueueMs:encodeStartedAt-snapshot.frame.capturedAt,encodeMs}});
        }catch{if(!stopped&&snapshot.stream===stream&&snapshot.revision===contextRevision){sourceDrop('encode');void api.signal('frame-error').catch(()=>{});}}
        finally{releaseSnapshot(snapshot);}
    }}finally{encoding=false;}
}
function fingerprint(region){
    const context=comparison.getContext('2d',{alpha:false,willReadFrequently:true}),crop=region||{x:0,y:0,width:1,height:1};
    context.drawImage(video,crop.x*video.videoWidth,crop.y*video.videoHeight,crop.width*video.videoWidth,crop.height*video.videoHeight,0,0,comparison.width,comparison.height);
    return context.getImageData(0,0,comparison.width,comparison.height).data;
}
function samePixels(left,right){if(!left||left.length!==right.length)return false;for(let i=0;i<left.length;i++)if(left[i]!==right[i])return false;return true;}
// A visual proposal only: the ordinary OCR/parser still establishes every item
// name and field. Default Modern hover panes have a green title, neutral dark
// frame and several white metadata rows. World/chat green alone cannot qualify.
function detectItemPanes({data,width,height}){
    if(!data||data.length!==width*height*4||width<32||height<32)return [];
    const bands=[];let active=[];
    const add=(x,right,y,count)=>{
        if(right-x<18||right-x>450||count<5)return;
        let band=active.find(b=>y-b.last<=2&&Math.min(right,b.right)-Math.max(x,b.x)>Math.min(right-x,b.right-b.x)*.3);
        if(!band){if(bands.length>=2048)return;band={x,right,y,last:y,count:0};bands.push(band);active.push(band);}
        band.x=Math.min(band.x,x);band.right=Math.max(band.right,right);band.last=y;band.count+=count;
    };
    for(let y=0;y<height;y++){
        active=active.filter(b=>y-b.last<=2);let left=-1,last=-1,count=0;
        for(let x=0;x<width;x++){
            const p=(y*width+x)*4,green=data[p+1]>75&&data[p+1]-data[p]>40&&data[p+1]-data[p+2]>30;
            if(green){if(left<0)left=x;last=x;count++;}
            if(left>=0&&(x-last>8||x===width-1)){add(left,last+1,y,count);left=-1;count=0;}
        }
    }
    const black=(x,y)=>{const p=(y*width+x)*4;return Math.max(data[p],data[p+1],data[p+2])<14;};
    const column=(x,y,h)=>{let n=0,total=0;for(let at=Math.ceil(y+2*h);at<Math.min(height,y+18*h);at+=Math.max(1,h)){total++;if(black(x,at))n++;}return total>=10?n/total:0;};
    const row=(y,left,right)=>{let n=0,total=0;for(let x=left+2;x<right-2;x+=Math.max(1,Math.floor((right-left)/80))){total++;if(black(x,y))n++;}return total?n/total:0;};
    const candidates=[];
    for(const band of bands.filter(b=>b.last-b.y>=3&&b.last-b.y<=28&&b.count>=35).sort((a,b)=>b.count-a.count).slice(0,128)){
        const h=band.last-band.y+1,y=band.y;
        const edge=(from,to,target)=>{const options=[];for(let x=Math.max(1,Math.floor(from));x<=Math.min(width-2,Math.ceil(to));x++){const score=column(x,y,h);if(score>=.8)options.push({x,score,distance:Math.abs(x-target)});}return options.sort((a,b)=>b.score-a.score||a.distance-b.distance).filter((v,i,a)=>!i||a.slice(0,i).every(other=>Math.abs(v.x-other.x)>2)).slice(0,4);};
        const lefts=edge(band.x-12*h,band.x-2*h,band.x-5*h),rights=edge(Math.max(band.right+h,band.x+16*h),band.x+55*h,band.x+28*h);
        let found;
        for(const left of lefts)for(const right of rights){
            if(found||right.x-left.x<20*h||right.x-left.x>66*h)continue;
            let top=-1,bottom=-1;
            for(let at=y-1;at>=Math.max(0,y-4*h);at--)if(row(at,left.x,right.x)>=.9){top=at;break;}
            if(top<0)continue;
            for(let at=Math.ceil(y+12*h);at<Math.min(height,y+72*h);at++)if(row(at,left.x,right.x)>=.9){bottom=at;break;}
            if(bottom<0)continue;
            let whiteRows=0,inWhite=false;
            for(let at=y+h;at<Math.min(bottom,y+8*h);at++){
                let count=0;for(let x=band.x;x<Math.min(right.x-3,band.x+24*h);x++){const p=(at*width+x)*4,lo=Math.min(data[p],data[p+1],data[p+2]),hi=Math.max(data[p],data[p+1],data[p+2]);if(lo>100&&hi-lo<45)count++;}
                const white=count>=5;if(white&&!inWhite)whiteRows++;inWhite=white;
            }
            if(whiteRows<3)continue;
            let dark=0,total=0;for(let at=top+3;at<bottom-2;at+=Math.max(1,Math.floor((bottom-top)/20)))for(let x=left.x+3;x<right.x-2;x+=Math.max(1,Math.floor((right.x-left.x)/20))){const p=(at*width+x)*4;total++;if(Math.max(data[p],data[p+1],data[p+2])<60)dark++;}
            if(dark/total<.75)continue;
            found={x:Math.max(0,left.x-2)/width,y:Math.max(0,top-2)/height,width:(Math.min(width,right.x+3)-Math.max(0,left.x-2))/width,height:(Math.min(height,bottom+3)-Math.max(0,top-2))/height};
        }
        if(found&&!candidates.some(c=>Math.abs(c.x-found.x)<.02&&Math.abs(c.y-found.y)<.02))candidates.push(found);
        if(candidates.length===4)break;
    }
    return candidates;
}
function visualPanes(){
    const scale=Math.min(1,1920/video.videoWidth,1200/video.videoHeight),width=Math.max(1,Math.round(video.videoWidth*scale)),height=Math.max(1,Math.round(video.videoHeight*scale));
    if(visual.width!==width||visual.height!==height){visual.width=width;visual.height=height;}
    // Area sampling keeps one-pixel pane borders visible at half resolution;
    // nearest-neighbour sampling can skip an entire horizontal border.
    const context=visual.getContext('2d',{alpha:false,willReadFrequently:true});context.imageSmoothingEnabled=true;context.drawImage(video,0,0,width,height);
    return detectItemPanes({data:context.getImageData(0,0,width,height).data,width,height});
}
function pixelKey(pixels){let a=2166136261,b=2246822519;for(let i=0;i<pixels.length;i+=4){const value=pixels[i]|pixels[i+1]<<8|pixels[i+2]<<16;a=Math.imul(a^value,16777619);b=Math.imul(b^value,3266489917);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');}
async function sample(){
    if(stopped||!stream)return;
    // Sampling can retain two bounded raw snapshots while the single PNG/IPC
    // encoder is busy. A slow full-resolution encode cannot hide the next item.
    timer=setTimeout(sample,125);if(busy)return;busy=true;const selectedStream=stream;let canvas;
    try{
        if(video.readyState<2||!video.videoWidth||!video.videoHeight)return;
        const stateAt=Date.now(),state=await api.state(),capture=state.capture;if(stopped||stream!==selectedStream)return;
        if(!capture){setContext('');return;}
        const at=Date.now(),identity=captureIdentity(capture,video.videoWidth,video.videoHeight);setContext(identity);pruneSnapshots();
        if(at-lastSampledAt<250)return;
        let pixels,itemRegion=null,visualKey=null,memoryKey=null,sceneFallback=false,selectionKind=capture.region?'configured':'scene';
        if(capture.region){pixels=fingerprint(capture.region);if(identity===lastIdentity&&samePixels(pixels,lastFingerprint)&&at-lastSampledAt<750)return;visualKey=pixelKey(pixels);}
        else{
            const candidates=visualPanes();
            const choices=[];for(const region of candidates){
                const key=[region.x,region.y,region.width,region.height].map(v=>Math.round(v*1000)).join(':'),next=fingerprint(region),previous=paneMemory.get(key);
                if(!previous||!samePixels(next,previous.pixels)||at-previous.at>=5000)choices.push({region,pixels:next,key,at:previous?.at??-Infinity});
            }
            const choice=choices.sort((a,b)=>a.at-b.at)[0];if(choice){itemRegion=choice.region;pixels=choice.pixels;memoryKey=choice.key;visualKey=pixelKey(pixels);selectionKind='visual-item';sceneFallback=at-lastSceneAt>=5000;}
            // A periodic, latest-only scene still covers white names, examine
            // panes and Inventory/zone evidence. Scenery cannot fill the FIFO.
            if(!itemRegion&&at-lastSceneAt<(candidates.length?5000:1500))return;
        }
        const scale=Math.min(1,4096/video.videoWidth,2160/video.videoHeight);
        const width=Math.max(1,Math.round(video.videoWidth*scale)),height=Math.max(1,Math.round(video.videoHeight*scale)),rawBytes=width*height*4;
        const duplicate=snapshots.findIndex(snapshot=>selectionKind==='scene'?snapshot.frame.selectionKind==='scene':snapshot.frame.selectionKind===selectionKind&&snapshot.frame.visualKey===visualKey);
        // Retain the first item's acquisition time: a later identical heartbeat
        // must not move equipment evidence across a walkthrough phase boundary.
        if(duplicate>=0&&selectionKind!=='scene'){snapshots[duplicate].frame.sceneFallback||=sceneFallback;if(sceneFallback)lastSceneAt=at;return;}
        if(duplicate>=0)discardSnapshot(duplicate);
        if(rawBytes>MAX_PENDING_BYTES){sourceDrop('capacity');return;}
        while(snapshots.length>=MAX_PENDING_SNAPSHOTS||pendingBytes+rawBytes>MAX_PENDING_BYTES){
            const scene=snapshots.findIndex(snapshot=>snapshot.frame.selectionKind==='scene');
            if(scene<0&&selectionKind==='scene')return;
            const old=discardSnapshot(scene<0?0:scene);if(old.frame.selectionKind!=='scene')sourceDrop('capacity');
        }
        canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const capturedAt=Date.now();canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);
        lastSampledAt=capturedAt;lastFingerprint=pixels;lastIdentity=identity;
        if(memoryKey){paneMemory.set(memoryKey,{pixels,at:capturedAt});if(paneMemory.size>8)paneMemory.delete(paneMemory.keys().next().value);}if(selectionKind==='scene'||sceneFallback)lastSceneAt=capturedAt;
        snapshots.push({canvas,rawBytes,stream:selectedStream,revision:contextRevision,identity,frame:{width,height,capturedAt,
            sourceWidth:video.videoWidth,sourceHeight:video.videoHeight,captureGeneration:capture.generation,
            owner:capture.owner,sessionId:capture.sessionId,sourceId:capture.sourceId,selectionKind,itemRegion,visualKey,sceneFallback,
            sourceTiming:{configurationMs:at-stateAt}}});pendingBytes+=rawBytes;canvas=null;void encodeSnapshots();
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
