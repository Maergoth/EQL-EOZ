import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {installViewerArchiveDiscovery,scanViewerArchives} from '../app/viewer-archive-discovery.js';
import {viewerZoneTarget,loggedZoneName} from '../app/zone-identity.js';
import {selectViewerZoneOption} from '../app/viewer-zone-selection.js';
import {installZoneLoadGuard} from '../app/zone-load-guard.js';
import {deflateSync} from 'node:zlib';
import {viewerArchiveNames,viewerLooseZoneHeader} from '../app/viewer-archive-header.js';
const zones=[{name:'Nektropos Castle',wikiTitle:'Nektropos Castle',aliases:['nektropos']},{name:'Nektropos Undercrofts',wikiTitle:'Nektropos Undercrofts',aliases:['nektrunder']}];
for(const zone of zones){const id=zone.aliases[0];assert.equal(viewerZoneTarget(zones,zone.name),id);assert.equal(viewerZoneTarget(zones,zone.name,id.toUpperCase()),id);assert.equal(viewerZoneTarget(zones,id),id);assert.equal(loggedZoneName(zones,zone.name,id),zone.name);assert.equal(viewerZoneTarget(zones,zone.name,'nektulos'),'');}
assert.equal(viewerZoneTarget([...zones,{name:'Conflicting Castle',aliases:['nektropos']}],zones[0].name),'','Conflicting public claims cannot choose an archive');
assert.equal(viewerZoneTarget([...zones,{name:'Conflicting Castle',aliases:['nektropos']}],'nektropos'),'','A short-name lookup cannot bypass a conflicting public claim');
assert.equal(viewerZoneTarget([...zones,{name:'Conflicting Castle',aliases:['nektropos']}],zones[0].name,'nektropos'),'','A /who lookup cannot bypass a conflicting public claim');
assert.equal(viewerZoneTarget([{name:'Ambiguous New Zone',aliases:['one','two']}],'Ambiguous New Zone'),'');
assert.equal(viewerZoneTarget([{name:'A',viewerName:'KnownA',aliases:['sharedid']},{name:'B',viewerName:'KnownB',aliases:['sharedid']}],'sharedid'),'','Known display fallbacks cannot select an ambiguous literal alias');
assert.equal(viewerZoneTarget([{name:'Plane of Sky',viewerName:'Plane of Sky',aliases:['sky','airplane']},{name:'Conflicting Sky',aliases:['airplane']}],'Plane of Sky','airplane'),'','A filename-equivalence group cannot bypass an exact alias collision');

const html=readFileSync(new URL('../app/zoneviewer/viewer.html',import.meta.url),'utf8'),from=html.indexOf('    async loadZone(zoneName) {'),to=html.indexOf('    syncLocation(',from);
let materialized=[],scanned=[];
function harness(scan=async candidates=>{scanned.push(candidates.map(row=>row.id));return candidates.filter(row=>row.id!=='non_zone_asset');},options={}){
    const candidates=['nektropos','nektrunder','non_zone_asset','unrequested_asset'].map(id=>({id,format:'EQG',file:{name:id+'.eqg',async eyeOfZommReadFile(){materialized.push(id);return{name:id+'.eqg',size:64};}}}));
    const select={value:'S3D:commons',disabled:false,options:[{value:'',textContent:'Choose zone'},{value:'S3D:commons',textContent:'Commonlands — commons (S3D)'}],dispatchEvent(){}};
    const app={config:{workerUrl:'./zone-parser.worker.js'},source:{archiveCandidates:()=>candidates},zones:[{id:'commons',format:'S3D'}],currentZoneRecord:null,els:{zoneSelect:select,statusText:{textContent:''}},populateZones(){select.options=[{value:'',textContent:'Choose zone'},...this.zones.map(zone=>({value:zone.format+':'+zone.id,textContent:zone.id+' — '+zone.id+' ('+zone.format+')'}))];},selectedZoneRecord(){return this.zones.find(zone=>zone.format+':'+zone.id===select.value);},async loadSelectedZone(){this.currentZoneRecord=this.selectedZoneRecord();},resetLoadedZone(){this.currentZoneRecord=null;},clearNavigationGuide(){},setStatus(){}};
    installViewerArchiveDiscovery(app,{scan,...options});
    const context=vm.createContext({app,selectViewerZoneOption,Event:class{},overlayMode:true,clearRareMobs(){},waitForZoneSelect:async()=>select,collisionGeometryPromise:null,loadedZoneIdentity:'',root:{},startCollisionGeometryExport(){}});
    context.zoneLoadGuard=installZoneLoadGuard(app);
    return{app,select,api:vm.runInContext('({'+html.slice(from,to)+'})',context)};
}
{
    const h=harness();
    for(const zone of zones){const target=viewerZoneTarget(zones,zone.name);assert.equal((await h.api.loadZone(target)).ok,true);assert.equal(h.app.currentZoneRecord.id,zone.aliases[0]);assert.equal(h.app.currentZoneRecord.format,'EQG');}
    assert.deepEqual(materialized,['nektropos','nektrunder']);assert.deepEqual(scanned,[['nektropos'],['nektrunder']]);
    await h.api.loadZone('nektropos');assert.equal(scanned.length,2,'An admitted same-folder archive is not rescanned');
    assert.equal((await h.api.loadZone('non_zone_asset')).reason,'zone-not-found');assert(!h.app.zones.some(zone=>zone.id==='non_zone_asset'));
    assert.equal((await h.api.loadZone('Unknown Castle Display')).reason,'zone-not-found');assert(!materialized.includes('unrequested_asset'),'No unrelated archive is read');
}
{
    let finish,started;const ready=new Promise(resolve=>started=resolve),h=harness(async candidates=>{started();await new Promise(resolve=>finish=resolve);return candidates;});
    const old=h.api.loadZone('nektropos');await ready;assert.equal((await h.api.loadZone('commons')).ok,true);finish();assert.equal((await old).reason,'superseded');assert.equal(h.app.currentZoneRecord.id,'commons','A late archive scan cannot replace a newer selected zone');
}
{
    let finish,started;const ready=new Promise(resolve=>started=resolve),h=harness(async candidates=>{started();await new Promise(resolve=>finish=resolve);return candidates;});
    const old=h.api.loadZone('nektrunder');await ready;h.app.source={archiveCandidates:()=>[]};finish();assert.equal((await old).reason,'superseded');assert(!h.app.zones.some(zone=>zone.id==='nektrunder'),'A different folder cannot inherit a late archive proof');
}
{
    let finish,started;const ready=new Promise(resolve=>started=resolve),h=harness(async candidates=>{if(candidates[0].id==='nektropos'){started();await new Promise(resolve=>finish=resolve);}return candidates;});
    h.app.source.directoryHandle={};const old=h.api.loadZone('nektropos');await ready;h.app.source.directoryHandle={};
    assert.equal((await h.api.loadZone('nektrunder')).ok,true,'A new folder does not wait on the previous folder scan');finish();assert.equal((await old).reason,'superseded');assert(!h.app.zones.some(zone=>zone.id==='nektropos'),'Folder changes on the same source retire old proof');
}
{
    const h=harness(undefined,{timeoutMs:5});h.app.source.archiveCandidates().find(row=>row.id==='nektropos').file.eyeOfZommReadFile=()=>new Promise(()=>{});
    assert.equal((await h.api.loadZone('nektropos')).reason,'load-failed');assert.equal((await h.api.loadZone('nektrunder')).ok,true,'A stalled lazy read cannot permanently block the next requested zone');
}
{
    const h=harness();for(let index=0;index<8;index++)assert.equal(await h.app.eyeOfZommDiscoverArchive('absent'+index),false);
    assert.equal((await h.api.loadZone('nektropos')).ok,true,'Settled requests cannot exhaust the active-work limit');
}
{
    const h=harness(),layoutFile={name:'nektropos.zon',async eyeOfZommReadFile(){return{name:this.name};}},archive={name:'nektropos.eqg'},dependency={name:'nektropos_asset.eqg'};
    h.app.source.files=new Map([['nektropos.zon',layoutFile],['nektrunder.zon',{name:'nektrunder.zon'}]]);h.app.source.filesForZone=async()=>[archive,dependency];
    await h.app.eyeOfZommDiscoverArchive('nektropos');const once=h.app.source.filesForZone;
    assert.deepEqual((await h.app.source.filesForZone({id:'nektropos',format:'EQG'})).map(file=>file.name),['nektropos.eqg','nektropos_asset.eqg','nektropos.zon']);
    await h.app.eyeOfZommDiscoverArchive('nektrunder');assert.equal(h.app.source.filesForZone,once,'A source wrapper is installed once');
    assert.deepEqual((await h.app.source.filesForZone({id:'commons',format:'S3D'})).map(file=>file.name),['nektropos.eqg','nektropos_asset.eqg'],'S3D dependencies are unchanged');
}
function pfsFile(names){
    const strings=names.map(name=>{const value=Buffer.from(name+'\0'),size=Buffer.alloc(4);size.writeUInt32LE(value.length);return Buffer.concat([size,value]);}),count=Buffer.alloc(4);count.writeUInt32LE(names.length);
    const expanded=Buffer.concat([count,...strings]),compressed=deflateSync(expanded),header=Buffer.alloc(12),block=Buffer.alloc(8),directory=Buffer.alloc(16);
    header.writeUInt32LE(12+8+compressed.length);header.write('PFS ',4);block.writeUInt32LE(compressed.length);block.writeUInt32LE(expanded.length,4);directory.writeUInt32LE(1);directory.writeUInt32LE(1633159881,4);directory.writeUInt32LE(12,8);directory.writeUInt32LE(expanded.length,12);
    const file=new Blob([header,block,compressed,directory]);file.name='nektropos.eqg';return file;
}
{
    await assert.rejects(scanViewerArchives([{id:'stuck',format:'EQG',file:{size:28,slice:()=>({arrayBuffer:()=>new Promise(()=>{})})}}],{timeoutMs:5}),/timed out/,'The entire identification deadline includes a stalled file read');
    let terminated=0,posted;
    class Worker{postMessage(message){posted=message;queueMicrotask(()=>this.onmessage({data:{id:1,type:'scan-complete',zones:[{id:'nektropos',format:'EQG'}]}}));}terminate(){terminated++;}}
    assert.deepEqual(await scanViewerArchives([{id:'nektropos',format:'EQG',file:pfsFile(['nektropos.zon'])}],{Worker,workerUrl:'worker'}),[{id:'nektropos',format:'EQG'}]);assert.equal(posted.action,'scan');assert.equal(terminated,1);
}
{
    const file=pfsFile(['ter_custom.ter']),strings=Buffer.from('ter_custom.ter\0'),bytes=Buffer.alloc(28+strings.length+4);bytes.write('EQGZ');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(strings.length,8);bytes.writeUInt32LE(1,12);strings.copy(bytes,28);const zoneFile=new Blob([bytes]);zoneFile.name='nektropos.zon';
    assert.deepEqual(await viewerArchiveNames(file),['ter_custom.ter']);assert(await viewerLooseZoneHeader(zoneFile,'nektropos'));
    assert.deepEqual(await scanViewerArchives([{id:'nektropos',format:'EQG',file,zoneFile}],{Worker:class{constructor(){throw Error('A loose zone uses its validated layoutFile');}}}),[{id:'nektropos',format:'EQG'}]);
    assert.equal(await viewerLooseZoneHeader(zoneFile,'nektrunder'),false);
    assert.equal(await viewerLooseZoneHeader(zoneFile,'nektropos',['other.ter']),false,'Loose-zone must reference terrain in its exact archive');
    const badLayout=Buffer.from(bytes);badLayout.writeUInt32LE(0xffffffff,16);const badZone=new Blob([badLayout]);badZone.name='nektropos.zon';assert.equal(await viewerLooseZoneHeader(badZone,'nektropos'),false,'Loose-zone declared counts are bounded before decoding');
    const malformed=Buffer.alloc(28);malformed.writeUInt32LE(12);malformed.write('PFS ',4);malformed.writeUInt32LE(1,12);malformed.writeUInt32LE(1633159881,16);malformed.writeUInt32LE(0xffffffff,24);
    await assert.rejects(viewerArchiveNames(new Blob([malformed])),/directory exceeds/,'Reject malicious expansion sizes before allocation or worker startup');
    const bomb=Buffer.from(await pfsFile(['a'.repeat(100)]).arrayBuffer());bomb.writeUInt32LE(1,16);
    await assert.rejects(viewerArchiveNames(new Blob([bomb])),/exceeds|match|limit/,'Actual inflated output is bounded by its declared block size');
    await assert.rejects(viewerArchiveNames(file,{deadline:0}),/timed out/,'The identification deadline includes the preflight');
    const tooManyBlocks=Buffer.alloc(12+513*9+16),directory=12+513*9;tooManyBlocks.writeUInt32LE(directory);tooManyBlocks.write('PFS ',4);tooManyBlocks.writeUInt32LE(1,directory);tooManyBlocks.writeUInt32LE(1633159881,directory+4);tooManyBlocks.writeUInt32LE(12,directory+8);tooManyBlocks.writeUInt32LE(513,directory+12);
    for(let index=0;index<513;index++){tooManyBlocks.writeUInt32LE(1,12+index*9);tooManyBlocks.writeUInt32LE(1,16+index*9);}
    let inflations=0;await assert.rejects(viewerArchiveNames(new Blob([tooManyBlocks]),{inflate:async()=>{inflations++;return new Uint8Array(1);}}),/too many compressed blocks/);assert.equal(inflations,512,'Bounded work refuses tiny-block CPU amplification');
}
console.log('New local zones: Castle/Undercrofts display+short names, targeted header proof, lazy-file materialization, no unrelated scans, non-zone refusal, cache and source/request race guards passed.');
