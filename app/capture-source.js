// This isolated local window has no log, wiki authentication or main-app IPC.
let stream = null, stopped = false, timer = null;
const api = window.eyeOfZommCaptureSource, video = document.getElementById('source');
function stop() { stopped = true; clearTimeout(timer); stream?.getTracks().forEach(track=>track.stop()); stream = null; }
async function sample() {
    if (stopped || !stream) return;
    try {
        if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
            const scale = Math.min(1,4096/video.videoWidth,2160/video.videoHeight);
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1,Math.round(video.videoWidth*scale)); canvas.height = Math.max(1,Math.round(video.videoHeight*scale));
            canvas.getContext('2d',{alpha:false}).drawImage(video,0,0,canvas.width,canvas.height);
            const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
            if (blob && blob.size<=32*1024*1024 && !stopped) await api.frame({bytes:new Uint8Array(await blob.arrayBuffer()),
                width:canvas.width,height:canvas.height,capturedAt:Date.now(),sourceWidth:video.videoWidth,sourceHeight:video.videoHeight});
            canvas.width = canvas.height = 1;
        }
    } catch { await api.signal('error','The selected source could not be read. Choose it again.').catch(()=>{}); stop(); return; }
    timer = setTimeout(sample,2000);
}
window.startScreenReadCapture = async () => {
    const state = await api.state();
    if (!state.allowed || stopped) return false;
    try {
        stream = await navigator.mediaDevices.getDisplayMedia({audio:false,video:{frameRate:1}});
        if (stopped) { stream.getTracks().forEach(track=>track.stop()); return false; }
        stream.getVideoTracks()[0]?.addEventListener('ended',()=>{stop();void api.signal('ended');},{once:true});
        video.srcObject = stream; await video.play();
        await api.signal('started'); void sample(); return true;
    } catch (error) { await api.signal('error',`Screen capture could not start (${String(error?.name||'capture error').slice(0,80)}: ${String(error?.message||'permission denied').slice(0,200)}). Choose a source and try again.`).catch(()=>{}); stop(); return false; }
};
window.addEventListener('pagehide',stop);
