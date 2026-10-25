// Discover only an explicitly requested local archive. The pinned viewer's
// initial registry omits newer/custom zones; never scan every game asset.
import {viewerArchiveNames,viewerLooseZoneHeader} from './viewer-archive-header.js';
function archiveRequest(value){
    const match=String(value||'').trim().match(/^(?:(S3D|EQG):)?([a-z0-9][a-z0-9_]{0,63})$/i);
    return match?{id:match[2].toLowerCase(),format:match[1]?.toUpperCase()||''}:null;
}
export function scanViewerArchives(candidates,{workerUrl,Worker=globalThis.Worker,timeoutMs=15000}={}){
    return new Promise((resolve,reject)=>{
        let worker,settled=false;const looseZones=[],scannable=[],deadline=Date.now()+timeoutMs;
        const finish=(error,zones=[])=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();error?reject(error):resolve([...looseZones,...zones]);};
        const timer=setTimeout(()=>finish(Error('Local archive identification timed out. Retry this zone.')),timeoutMs);
        void(async()=>{
            for(const candidate of candidates){
                const names=await viewerArchiveNames(candidate.file,{deadline});if(settled)return;
                if(candidate.format==='EQG'&&candidate.zoneFile&&await viewerLooseZoneHeader(candidate.zoneFile,candidate.id,names))looseZones.push({id:candidate.id,format:candidate.format});
                else scannable.push(candidate);
            }
            if(settled)return;if(!scannable.length){finish(null);return;}
            worker=new Worker(workerUrl);
            worker.onmessage=event=>{const data=event.data||{};if(data.id!==1)return;if(data.type==='scan-complete')finish(null,Array.isArray(data.zones)?data.zones:[]);else if(data.type==='error')finish(Error(data.message||'Local archive identification failed.'));};
            worker.onerror=event=>finish(Error(event.message||'Local archive identification failed.'));
            worker.postMessage({id:1,action:'scan',candidates:scannable.map(({id,format,file})=>({id,format,file}))});
        })().catch(error=>finish(error));
    });
}
export function installViewerArchiveDiscovery(app,{scan=scanViewerArchives,timeoutMs=15000}={}){
    let source=null,selection=null,epoch=0,pending=new Map(),chain=Promise.resolve();const wrapped=new WeakSet();
    const materialize=async file=>typeof file?.eyeOfZommReadFile==='function'?file.eyeOfZommReadFile():file;
    function prepareSource(current){
        if(wrapped.has(current)||typeof current.filesForZone!=='function')return;
        const original=current.filesForZone;
        current.filesForZone=async function(record){
            const files=await original.call(this,record),layoutFile=record.format==='EQG'&&this.files?.get(record.id+'.zon');
            if(!layoutFile||files.some(file=>String(file.name).toLowerCase()===record.id+'.zon'))return files;
            return [...files,await materialize(layoutFile)];
        };
        wrapped.add(current);
    }
    async function discover(value){
        const request=archiveRequest(value),current=app.source;
        if(!request||!current?.archiveCandidates)return false;
        const folder=current.directoryHandle;
        if(source!==current||selection!==folder){source=current;selection=folder;epoch++;pending=new Map();chain=Promise.resolve();}prepareSource(current);
        const workEpoch=epoch;
        const key=request.format+':'+request.id;
        if(!pending.has(key)){
            if(pending.size>=8)return false;
            const task=chain.then(()=>new Promise((resolve,reject)=>{
                let active=true;const valid=()=>active&&epoch===workEpoch&&app.source===current&&current.directoryHandle===folder;
                const finish=(error,value)=>{if(!active)return;active=false;clearTimeout(timer);error?reject(error):resolve(value);};
                const timer=setTimeout(()=>finish(Error('Local archive identification timed out. Retry this zone.')),timeoutMs);
                void(async()=>{
                if(!valid())return false;
                const candidates=current.archiveCandidates().filter(candidate=>candidate.id===request.id&&['S3D','EQG'].includes(candidate.format)&&(!request.format||candidate.format===request.format));
                if(!candidates.length||candidates.length>2)return false;
                // Native bridge entries are lazy, function-bearing handles.
                // Materialize only these requested files before worker cloning.
                const files=await Promise.all(candidates.map(async candidate=>({...candidate,file:await materialize(candidate.file),zoneFile:candidate.format==='EQG'?await materialize(current.files?.get(candidate.id+'.zon')):undefined})));
                if(!valid())return false;
                const zones=await scan(files,{workerUrl:app.config.workerUrl});
                if(!valid())return false;
                const verified=zones.flatMap(zone=>{const candidate=candidates.find(row=>row.id===zone.id&&row.format===zone.format);return candidate?[candidate]:[];});
                if(!verified.length)return false;
                const existing=new Set((app.zones||[]).map(zone=>zone.format+':'+zone.id));
                app.zones=[...(app.zones||[]),...verified.filter(zone=>!existing.has(zone.format+':'+zone.id))];
                app.populateZones();
                if(app.els?.zoneSelect)app.els.zoneSelect.disabled=false;
                return true;
                })().then(value=>finish(null,value),error=>finish(error));
            }));
            chain=task.catch(()=>{});
            pending.set(key,task);
            task.then(()=>{if(pending.get(key)===task)pending.delete(key);},()=>{if(pending.get(key)===task)pending.delete(key);});
        }
        return pending.get(key);
    }
    app.eyeOfZommDiscoverArchive=discover;
    app.eyeOfZommPrepareArchiveSource=()=>{if(app.source)prepareSource(app.source);};
    app.eyeOfZommPrepareArchiveSource();
    return {discover};
}
