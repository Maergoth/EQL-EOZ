const contextKey=session=>JSON.stringify([session?.map?.zone||session?.zone||'',session?.map?.viewerZone||'',session?.map?.dataVersion??0]);
const locationKey=location=>location?JSON.stringify([location.x,location.y,location.z,location.at]):'';

// The native Map owns a lazy, independently navigable viewer. Log parsing,
// selected-folder ownership and validated route calculation stay in main.
export function mountMapOverlay3D({root,getSession=()=>({}),onStatus=()=>{},onFollowChange=()=>{},onFocusApplied=()=>{},onSelectNpc,document=root?.ownerDocument||globalThis.document}={}){
    let session=getSession()||{},mode='map',frame=null,frameReady=null,loaded='',epoch=0,task=null,dirty=false,disposed=false,follow=true,cancelFrame=null;
    let appliedMode='',lastLocation='',lastFocus='',lastMarkers='',lastRoute='',lastSlice='',slice=null,focusNotice='';
    const report=message=>{if(!disposed)onStatus(message);};
    function release(){epoch++;task?.cancel();task=null;cancelFrame?.();cancelFrame=null;loaded='';appliedMode='';lastLocation='';lastFocus='';lastMarkers='';lastRoute='';lastSlice='';focusNotice='';frameReady=null;frame?.remove();frame=null;}
    function ensureFrame(){
        if(frame)return frameReady;
        frame=document.createElement('iframe');frame.title='Native Map 3D explorer';frame.className='native-map-3d-frame';
        frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-pointer-lock');
        frame.style.cssText='display:block;width:100%;height:100%;border:0;background:#08101b';
        const current=frame;
        frameReady=new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>reject(Error('The 3D viewer did not finish loading. Choose Map and retry.')),20000);
            cancelFrame=()=>{clearTimeout(timeout);reject(Error('The 3D view was released.'));};
            current.addEventListener('load',()=>{
                const api=current.contentWindow?.eqlEyeOfZommViewer;
                if(!api)return;
                clearTimeout(timeout);
                const manual=event=>{if(event.type==='keydown'&&!/^(?:Key[WASDQE]|Arrow\w+|Space)$/.test(event.code||''))return;focusNotice='';if(follow){follow=false;onFollowChange(false);}};
                for(const type of ['keydown','pointerdown','wheel'])current.contentWindow.addEventListener(type,manual,true);
                resolve(api);
            });
            current.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('The 3D viewer could not be opened.'));},{once:true});
        });
        frame.src='./zoneviewer/viewer.html?overlay=1';root.appendChild(frame);return frameReady;
    }
    async function synchronize(){
        if(disposed||mode==='map'||task)return;
        const zone=session.map?.zone||session.zone;
        if(!zone){report('Waiting for a logged zone.');return;}
        const currentTask={};const cancelled=new Promise((_,reject)=>{currentTask.cancel=()=>reject(Error('The 3D view was released.'));});cancelled.catch(()=>{});
        task=currentTask;dirty=false;const owner=epoch,key=contextKey(session);
        const wait=value=>Promise.race([value,cancelled]);
        const current=()=>!disposed&&mode!=='map'&&owner===epoch&&key===contextKey(session);
        try{
            if(loaded!==key)report('Loading local 3D zone…');
            const api=await wait(ensureFrame());if(!current())return;
            if(loaded!==key){
                const folder=await wait(api.useConfiguredFolder());if(!current())return;
                if(!folder?.ok)throw Error('Choose an EverQuest folder with zone archives in the main Settings.');
                const result=await wait(api.loadZone(session.map?.viewerZone||session.map?.zone||session.zone));if(!current())return;
                if(!result?.ok)throw Error(result?.message||'No matching local 3D archive was found for this zone.');
                loaded=key;
            }
            if(appliedMode!==mode){api.setView(mode);appliedMode=mode;}
            const map=session.map||{},markers=JSON.stringify(map.npcs||[]),route=JSON.stringify(map.route?.points||[]);
            if(markers!==lastMarkers){api.setRareMobs(map.npcs||[]);lastMarkers=markers;}
            api.setOverlaySelection?.(map.selectedNpcId||'');
            if(route!==lastRoute){api.setOverlayRoute?.(map.route?.points||[]);lastRoute=route;}
            if(slice&&JSON.stringify(slice)!==lastSlice){api.setOverlaySlice?.(slice);lastSlice=JSON.stringify(slice);}
            const focus=map.focus,focusKey=focus?JSON.stringify([focus.sequence,focus.id,focus.zone]):'';
            if(focusKey&&focusKey!==lastFocus&&focus.zone===(map.zone||session.zone)){
                const result=api.focusAtLocation?.(focus.loc,{mode:'first'});
                if(result?.ok){lastFocus=focusKey;follow=false;focusNotice=`${focus.name||'NPC'} · inspection camera${result.heightEstimated?' · height estimated':''}`;onFollowChange(false);onFocusApplied(focus,result);report(focusNotice);}
            }else{
                const nextLocation=locationKey(map.location);
                if(follow&&map.location&&nextLocation!==lastLocation){api.syncLocation(map.location,{mode,timestamp:map.location.at});lastLocation=nextLocation;}
                report(focusNotice||(mode==='first'?'First person · click the scene, then use movement keys to explore.':'Top 3D · drag to orbit, use +/− to zoom.'));
            }
            api.resize?.();
        }catch(error){if(current())report(error?.message||'Unable to open this 3D zone.');}
        finally{if(task===currentTask){task=null;if(dirty&&!disposed&&mode!=='map')void synchronize();}}
    }
    function request(){dirty=true;void synchronize();}
    function render(next){const previous=contextKey(session);session=next||getSession()||{};if(previous!==contextKey(session))release();request();}
    const receive=event=>{
        if(!frame||event.source!==frame.contentWindow||event.origin!==globalThis.location?.origin||event.data?.type!=='eoz-rare-mob-selected')return;
        const npc=(session.map?.npcs||[]).find(npc=>npc.id===event.data.id);
        if(npc){if(onSelectNpc)onSelectNpc(npc);else void globalThis.eyeOfZommOverlay?.action?.('session:select-npc',{id:npc.id,npc:npc.name,zone:session.map?.zone||session.zone,raidInstance:!!npc.raidInstance}).catch(()=>{});}
    };
    globalThis.addEventListener?.('message',receive);
    return {
        async setMode(next){if(!['map','top','first'].includes(next))throw Error('Unknown Map view.');if(mode!==next)focusNotice='';mode=next;if(next==='map'){release();report('');return;}await synchronize();},
        render,setFollow(value){const next=!!value;if(next===follow)return;follow=next;if(follow){focusNotice='';lastLocation='';request();}},
        zoomBy(factor){frame?.contentWindow?.eqlEyeOfZommViewer?.overlayZoom?.(factor);},
        setSlice(value){slice=value;const key=JSON.stringify(value),api=frame?.contentWindow?.eqlEyeOfZommViewer;if(loaded&&key!==lastSlice&&api){api.setOverlaySlice?.(value);lastSlice=key;}},
        reset(){lastLocation='';lastFocus='';focusNotice='';follow=true;onFollowChange(true);frame?.contentWindow?.eqlEyeOfZommViewer?.resetOverlayCamera?.();request();},
        dispose(){if(disposed)return;disposed=true;release();globalThis.removeEventListener?.('message',receive);}
    };
}
