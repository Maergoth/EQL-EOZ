import assert from 'node:assert/strict';
import {selectMapFamily,parseClientMap,createMapDataLoader} from '../app/map-overlay-data.js';
import {mapBounds,layoutMapLabels} from '../app/map-overlay.js';
const zone={name:'Mistmoore Castle',aliases:['mistmoore']};
const files=[{path:'Maps/Brewall/mistmoore.txt',size:12},{path:'Maps/mistmoore_1.txt',size:12},{path:'Maps/mistmoore.txt',size:12},{path:'Maps/mistmoore_2.txt',size:12},{path:'Maps/mistmooreb.txt',size:12}];
assert.deepEqual(selectMapFamily(files,zone).layers.map(file=>file.path),['Maps/mistmoore.txt','Maps/mistmoore_1.txt','Maps/mistmoore_2.txt']);
assert.equal(selectMapFamily(files,{name:'Unknown'}),null);
const geometry='L -20, -10, 0, -40, -30, 4, 0, 0, 0\nP -20, -10, 0, 255, 0, 0, 2, Synthetic_Keeper\nL bad, 2,3,4,5,6,0,0,0\n';
const parsed=parseClientMap(geometry,2);
assert.deepEqual(parsed.lines,[[-20,-10,0,-40,-30,4,0,0,0,2]]);
assert.equal(parsed.labels[0].label,'Synthetic Keeper');
assert.deepEqual(mapBounds(parsed.lines),{minX:-40,minY:-30,maxX:-20,maxY:-10});
const labelNpcs=[{id:'normal',name:'Synthetic Keeper',screen:{x:150,y:90}},{id:'raid',name:'Synthetic Keeper',raidInstance:true,selected:true,screen:{x:155,y:95}}];
const layout=layoutMapLabels({npcs:labelNpcs,labels:[{label:'  SYNTHETIC_Keeper ',screen:{x:149,y:90}},{label:'Safe point',screen:{x:60,y:155}}],width:330,height:210});
assert.equal(layout.labels.length,1,'Client map text matching an NPC is suppressed after underscore/case/space normalization');
assert.equal(layout.labels[0].text,'Safe point');
assert.equal(layout.npcs[0].id,'raid','Selected NPC gets its label placement before overlapping unselected names');
assert.equal(layout.npcs.length,2,'Nearby normal and raid names use separate available quadrants');
const allLabels=[...layout.labels,...layout.npcs];
for(let index=0;index<allLabels.length;index++){
    const a=allLabels[index];assert(a.x>=0&&a.y>=0&&a.x+a.width<=330&&a.y+a.height<=210,'Label fits canvas');
    for(const b of allLabels.slice(index+1))assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'Placed labels never overlap');
}
const packed=layoutMapLabels({npcs:[{id:'selected',name:'Selected',selected:true,screen:{x:75,y:50}},...Array.from({length:20},(_,index)=>({id:`crowd-${index}`,name:`Crowded ${index}`,screen:{x:75,y:50}}))],width:160,height:100});
assert.equal(packed.npcs[0].id,'selected');assert(packed.npcs.length<21,'Omit names when every quadrant is occupied');
assert.equal(labelNpcs.length,2);assert.deepEqual(labelNpcs.map(npc=>npc.screen),[{x:150,y:90},{x:155,y:95}],'Label layout never moves or discards source markers or variant identity');
let root='a',reads=0,manifests=0;
const loader=createMapDataLoader({getManifest:async()=>{manifests++;return{files};},readText:async()=>{reads++;return geometry;},resolveZone:()=>zone,getRootKey:()=>root});
assert.equal((await loader.load('Mistmoore Castle')).status,'ready');
await loader.load('Mistmoore Castle');assert.equal(reads,3);assert.equal(manifests,1);
root='b';await loader.load('Mistmoore Castle');assert.equal(reads,6);assert.equal(manifests,2);
loader.invalidate();await loader.load('Mistmoore Castle');assert.equal(manifests,3);
const missing=createMapDataLoader({getManifest:async()=>({files:[]}),readText:async()=>{throw Error('must not read');},resolveZone:()=>zone});
assert.equal((await missing.load(zone.name)).status,'missing');
for (const partialFiles of [[],files.slice(0,1)]) {
    const partial=createMapDataLoader({getManifest:async()=>({files:partialFiles,truncated:true}),
        readText:async()=>{throw Error('A partial family must not be displayed');},resolveZone:()=>zone});
    await assert.rejects(partial.load(zone.name),/local file inventory is incomplete/,'An incomplete inventory cannot establish missing or complete map layers');
}

// A scan started against a former folder cannot poison the replacement folder's
// manifest or continue reading its relative paths against the new folder.
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
let activeRoot='old';const scans=[],raceReads=[];
const racing=createMapDataLoader({getRootKey:()=>activeRoot,resolveZone:()=>zone,
    getManifest:()=>{const scan=deferred();scans.push(scan);return scan.promise;},
    readText:async path=>{raceReads.push([activeRoot,path]);return geometry;}});
const oldLoad=racing.load(zone.name);
const oldRejected=assert.rejects(oldLoad,/folder changed/);
activeRoot='new';const newLoad=racing.load(zone.name);
scans[1].resolve({files:[{path:'Maps/new/mistmoore.txt',size:12}]});
await newLoad;
scans[0].resolve({files:[{path:'Maps/old/mistmoore.txt',size:12}]});
await oldRejected;
await racing.load(zone.name);
assert.deepEqual(raceReads,[['new','Maps/new/mistmoore.txt']]);
assert.equal(scans.length,2,'A stale scan cannot replace the cached current manifest');

let layerRoot='old';const layerRead=deferred();const layerPaths=[];
const layerRace=createMapDataLoader({getRootKey:()=>layerRoot,resolveZone:()=>zone,getManifest:async()=>({files}),
    readText:path=>{layerPaths.push(path);return layerRead.promise;}});
const pendingLayers=layerRace.load(zone.name);
const layersRejected=assert.rejects(pendingLayers,/folder changed/);
await Promise.resolve();
layerRoot='new';layerRead.resolve(geometry);
await layersRejected;
assert.deepEqual(layerPaths,['Maps/mistmoore.txt'],'Do not read subsequent old-root layers after the root changes');

const invalidationScan=deferred();let invalidationScans=0;
const invalidating=createMapDataLoader({resolveZone:()=>zone,
    getManifest:()=>++invalidationScans===1?invalidationScan.promise:Promise.resolve({files}),readText:async()=>geometry});
const invalidatedLoad=invalidating.load(zone.name);
const invalidatedRejected=assert.rejects(invalidatedLoad,/folder changed/);
invalidating.invalidate();invalidationScan.resolve({files:[]});
await invalidatedRejected;
assert.equal((await invalidating.load(zone.name)).status,'ready','Explicit Reload discards an earlier in-flight scan');
assert.equal(invalidationScans,2);
console.log('Map overlay: layered aliases, malformed geometry, bounds, lazy cache, incomplete inventory, root races, interrupted layers and in-flight invalidation passed.');
