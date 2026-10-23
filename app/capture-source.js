// This isolated local window has no log, wiki authentication or main-app IPC.
let stream = null, stopped = false, timer = null;
const api = window.eyeOfZommCaptureSource, video = document.getElementById('source');
function stop() { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track=>track.stop()); stream = null; }
async function sample() {
    if (stopped || !stream) return;
    const selectedStream=stream;
    try {
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            const scale = Math.min(1,4096/video.videoWidth,2160/video.videoHeight);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1,Math.round(video.videoWidth*scale)); canvas.height = Math.max(1,Math.round(video.videoHeight*scale));
            canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);
            const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
            if (blob && blob.size<=32*1024*1024 && !stopped) {
                const bytes=new Uint8Array(await blob.arrayBuffer());
                if(!stopped&&stream===selectedStream)await api.frame({bytes,
                    width:canvas.width,height:canvas.height,capturedAt:Date.now(),sourceWidth:video.videoWidth,sourceHeight:video.videoHeight});
            }
            canvas.width = canvas.height = 1;
        }
    } catch { if(!stopped&&stream===selectedStream)await api.signal('frame-error').catch(()=>{}); }
    if(!stopped&&stream===selectedStream)timer = setTimeout(sample,2000);
}
window.startScreenReadCapture = async () => {
    const state = await api.state();
    if (!state.allowed || stopped) return false;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({audio:false,video:{frameRate:1}});
        if (stopped) { stream.getTracks().forEach(track=>track.stop()); return false; }
        const selectedStream=stream;
        stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(stopped||stream!==selectedStream)return;stop();void api.signal('ended').catch(()=>{});},{once:true});
        video.srcObject = stream; await video.play();
        await api.signal('started'); void sample(); return true;
    } catch (error) { await api.signal('error',`Screen capture could not start (${String(error?.name||'capture error').slice(0,80)}: ${String(error?.message||'permission denied').slice(0,200)}). Choose a source and try again.`).catch(()=>{}); stop(); return false; }
};
window.addEventListener('pagehide',stop);
