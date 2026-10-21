import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {File} from 'node:buffer';
import vm from 'node:vm';
const require=createRequire(import.meta.url),{allowMapRequest,safeMapFile}=require('../desktop/overlay-map-policy.cjs');
const origin='http://127.0.0.1:53147';
const request=(path,method='GET',resourceType='xhr')=>allowMapRequest({url:origin+path,method,resourceType},origin);
assert(request('/overlay-map.html?panel=map','GET','mainFrame'));
assert(request('/zoneviewer/viewer.html?overlay=1','GET','subFrame'));
for(const path of ['/map-overlay-3d.js','/zoneviewer/overlay-mode.js','/zoneviewer/zone-parser.worker.js','/zoneviewer/ext.eqlZoneViewer.css'])assert(request(path));
assert(request('/api/eq-files'));
for(const path of ['mistmoore.s3d','resources/synthetic.eqg','Maps/mistmoore.txt','Maps/Brewall/mistmoore_1.txt','mp3index.txt','MP3INDEX.TXT','mistmoore_assets.txt','synthetic-zone_2_assets.txt'])assert(request('/api/eq-file?path='+encodeURIComponent(path)+'&surface=overlay-map'),path);
for(const path of ['Logs/eqlog_Fixture_Test.txt','Logs/mistmoore_assets.txt','Maps/../Logs/eqlog_Fixture_Test.txt','Maps/.. /Logs./eqlog_Fixture_Test.txt','Maps/../Logs./fixture.txt','Maps/a:stream.txt','Maps/a\x00.txt','Maps//a.txt','C:/Maps/a.txt','/Maps/a.txt','settings.txt','mistmoore_private.txt','mistmoore_chr.txt','resources/mistmoore_assets.txt','mp3index.txt/private.txt','mp3index.txt.','mistmoore_assets.txt ','Maps/file.txt.','Maps/file.txt ']){
    assert.equal(safeMapFile(path),false,path);
    assert.equal(request('/api/eq-file?path='+encodeURIComponent(path)+'&surface=overlay-map'),false,path);
}
for(const path of ['/api/log','/api/info','/api/select-eq-root','/api/update-pack','/api/window/always-on-top','/data/eye-of-zomm-pack.json','/'])assert.equal(request(path),false,path);
assert.equal(request('/api/eq-files','POST'),false);
assert.equal(request('/api/eq-file?path=Maps/x.txt'),false,'A Map request cannot omit canonical path restrictions');
assert.equal(request('/api/eq-file?path=Maps/x.txt&surface=other'),false);
assert.equal(request('/api/eq-file?path=Maps/x.txt&other=1'),false);
assert.equal(request('/api/eq-file?path=Maps/x.txt&surface=overlay-map&other=1'),false);
assert.equal(request('/zoneviewer/viewer.html','GET','subFrame'),false);
assert.equal(request('/overlay.html?panel=parse','GET','mainFrame'),false);
assert.equal(allowMapRequest({url:'https://example.invalid/zoneviewer/file.js',method:'GET',resourceType:'script'},origin),false);
assert(allowMapRequest({url:'blob:'+origin+'/synthetic-texture',method:'GET',resourceType:'image'},origin));
assert.equal(allowMapRequest({url:'blob:https://example.invalid/image',resourceType:'image'},origin),false);

// Exercise the shipped wrapper and actual bundled source method together.
// The former policy fails here while hydrating S3D's mp3index, before a Worker
// could receive an archive; EQG additionally reads its dependency list eagerly.
const wrapper=readFileSync(new URL('../app/zoneviewer/viewer.html',import.meta.url),'utf8');
const viewer=readFileSync(new URL('../app/zoneviewer/ZoneViewerApp.js',import.meta.url),'utf8');
const wrapperStart=wrapper.indexOf('class LocalFileHandle {'),wrapperEnd=wrapper.indexOf('const HANDLE_DB',wrapperStart);
const methodStart=viewer.indexOf('async filesForZone(e){'),methodEnd=viewer.indexOf('mapFamilyForZone(e){',methodStart);
assert(wrapperStart>=0&&wrapperEnd>wrapperStart&&methodStart>=0&&methodEnd>methodStart,'Production source boundaries must remain explicit');
const content=new Map([
    ['mistmoore.s3d','synthetic archive bytes'],['mistmoore.eqg','synthetic EQG bytes'],['eozsynthetic.eqg','synthetic dependency bytes'],
    ['mp3index.txt','1,synthetic-silence.mp3\r\n'],['mistmoore_assets.txt','eozsynthetic.eqg\r\n'],
    ['mistmoore_private.txt','Synthetic private root text'],['mistmoore_chr.txt','Synthetic unused character list'],['Maps/mistmoore.txt','L 1,2,3,4,5,6,7,8,9']
]);
const manifest={rootName:'Synthetic selected root',files:[...content].map(([path,body])=>({path,size:body.length,lastModified:1})),truncated:false};
let denyReads=false;
const context=vm.createContext({File,overlayMode:true,Ln:name=>String(name).toLowerCase(),cf:value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),
    localApi:async url=>{
        if(url==='/api/eq-files')return {json:async()=>manifest};
        assert(request(url),'Every source-file fetch must pass the real native policy: '+url);
        if(denyReads)throw Error('Failed to fetch');
        const body=content.get(new URL(url,origin).searchParams.get('path'));assert.notEqual(body,undefined);
        return {arrayBuffer:async()=>new TextEncoder().encode(body).buffer};
    }});
vm.runInContext(wrapper.slice(wrapperStart,wrapperEnd)+'\nglobalThis.directory=configuredDirectoryHandle;globalThis.source=({'+viewer.slice(methodStart,methodEnd)+'});',context);
const handle=await context.directory(),files=new Map();
async function collect(directory){for await(const [,entry]of directory.entries()){if(entry.kind==='directory')await collect(entry);else files.set(entry.name.toLowerCase(),await entry.getFile());}}
await collect(handle);context.source.files=files;
assert.equal(files.has('mistmoore_private.txt'),false);assert.equal(files.has('mistmoore_chr.txt'),false);
const s3d=await context.source.filesForZone({id:'mistmoore',format:'S3D'}),eqg=await context.source.filesForZone({id:'mistmoore',format:'EQG'});
assert.deepEqual(Array.from(s3d,file=>file.name).sort(),['mistmoore.s3d','mp3index.txt']);
assert.deepEqual(Array.from(eqg,file=>file.name).sort(),['eozsynthetic.eqg','mistmoore.eqg','mistmoore_assets.txt','mp3index.txt']);
assert(s3d.concat(eqg).every(file=>file instanceof File),'Actual hydration yields cloneable native File objects');
assert.equal(await s3d.find(file=>file.name==='mp3index.txt').text(),content.get('mp3index.txt'));
assert.equal(await eqg.find(file=>file.name==='mistmoore_assets.txt').text(),content.get('mistmoore_assets.txt'));
denyReads=true;
await assert.rejects(()=>files.get('mistmoore.s3d').arrayBuffer(),error=>error.message==='Unable to read local game asset "mistmoore.s3d". Check the selected EverQuest folder.');
context.overlayMode=false;
const mainHandle=await context.directory();
assert(mainHandle.children.has('mistmoore_private.txt'),'Main viewer indexing retains its existing behavior');
console.log('Native Map policy: real S3D/EQG wrapper/source support-file hydration, exact document/frame, read-only selected assets, Win32 path hardening and denied logs/settings/mutations passed.');
