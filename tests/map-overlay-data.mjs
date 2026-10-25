import assert from 'node:assert/strict';
import {selectMapFamily,parseClientMap,createMapDataLoader} from '../app/map-overlay-data.js';
import {mapBounds,layoutMapLabels,knownMapZ,loggedMapSliceCenter,mapElevationBounds,mapSliceContainsZ,clipMapSegmentToSlice,mapNpcHitTargets,hitMapNpc,nextNativeMapMode,defaultMapSliceCenter,createMapHeadingTracker,mapPlayerArrow,drawMapPlayerMarker} from '../app/map-overlay.js';
const heading=createMapHeadingTracker(),origin={x:0,y:0,z:null},point={x:50,y:40};
assert.equal(heading.sample(origin,'zone-a:source1'),null,'One logged position cannot establish facing');
assert.deepEqual(heading.sample({x:5,y:0},'zone-a:source1'),{x:1,y:0});
assert.deepEqual(mapPlayerArrow(point,{x:1,y:0})[0],{x:39,y:40},'Positive world X points left in client-map space');
assert.deepEqual(mapPlayerArrow(point,{x:0,y:1})[0],{x:50,y:29},'Positive world Y points up in client-map space');
assert.deepEqual(mapPlayerArrow(point,{x:-1,y:0})[0],{x:61,y:40});
assert.deepEqual(mapPlayerArrow(point,{x:0,y:-1})[0],{x:50,y:51});
for(const location of [{x:5,y:0},{x:5.1,y:.1},{x:4.9,y:-.1}])assert.deepEqual(heading.sample(location,'zone-a:source1'),{x:1,y:0},'Stationary/jitter samples retain the last trajectory');
assert.deepEqual(heading.sample({x:5,y:5},'zone-a:source1'),{x:0,y:1},'A new step turns directly from the previous accepted location');
assert.equal(heading.sample({x:5,y:5},'zone-b:source1'),null,'Zone changes reset direction');
assert.equal(heading.sample({x:10,y:5},'zone-b:source2'),null,'Selected-log/data revision changes reset direction');
assert.equal(heading.sample({x:NaN,y:5},'zone-b:source2'),null);assert.equal(heading.sample({x:10,y:10},'zone-b:source2'),null,'A bad/missing reading never bridges to the next good sample');
assert.equal(heading.sample({x:2000,y:2000},'zone-b:source2'),null,'A zone-scale jump cannot invent a heading');
assert.deepEqual(heading.sample({x:2005,y:2000},'zone-b:source2'),{x:1,y:0});
assert.equal(mapPlayerArrow(point,null),null);assert.equal(mapPlayerArrow(point,{x:0,y:0}),null);
const markerCalls=[],markerContext=Object.fromEntries(['beginPath','moveTo','lineTo','closePath','arc','fill','stroke'].map(method=>[method,(...args)=>markerCalls.push([method,...args])]));
drawMapPlayerMarker(markerContext,point,{x:0,y:1});assert(markerCalls.some(([method,x,y])=>method==='moveTo'&&x===50&&y===29));assert(!markerCalls.some(([method])=>method==='arc'),'Known trajectory uses an arrow instead of another dot');markerCalls.length=0;drawMapPlayerMarker(markerContext,point,null);assert(markerCalls.some(([method])=>method==='arc'),'Unknown first direction remains a dot');
const zone={name:'Mistmoore Castle',aliases:['mistmoore']};
for(const name of ['Plane of Hate','plane_of_hate','hateplane'])assert.equal(defaultMapSliceCenter(name),120,'Exact Hate identities start on the requested playable slice');
assert.equal(defaultMapSliceCenter('Alternate display label','hateplane'),120);
for(const name of ['Mistmoore Castle','Plane of Fear','hateplaneb','Plane of Hate 2.0',''])assert.equal(defaultMapSliceCenter(name),null,'The ceiling workaround cannot affect a different zone');
const files=[{path:'Maps/Brewall/mistmoore.txt',size:12},{path:'Maps/mistmoore_1.txt',size:12},{path:'Maps/mistmoore.txt',size:12},{path:'Maps/mistmoore_2.txt',size:12},{path:'Maps/mistmooreb.txt',size:12}];
assert.deepEqual(selectMapFamily(files,zone).layers.map(file=>file.path),['Maps/mistmoore.txt','Maps/mistmoore_1.txt','Maps/mistmoore_2.txt']);
assert.equal(selectMapFamily(files,{name:'Unknown'}),null);
const roFiles=[{path:'Maps/nro.txt',size:12},{path:'Maps/Brewall/northro.txt',size:12}],roZone={name:'North Ro',viewerId:'nro',aliases:['nro','northro']};
assert.equal(selectMapFamily(roFiles,roZone,'northro').layers[0].path,'Maps/Brewall/northro.txt','A verified logged archive wins before the default map folder');
assert.equal(selectMapFamily(roFiles,roZone).layers[0].path,'Maps/nro.txt','Display-only ambiguous zones use their reviewed primary map identity');
assert.equal(selectMapFamily(roFiles,roZone,'unknownro'),null,'A missing requested archive never silently loads a different historical map');
const geometry='L -20, -10, 0, -40, -30, 4, 0, 0, 0\nP -20, -10, 0, 255, 0, 0, 2, Synthetic_Keeper\nL bad, 2,3,4,5,6,0,0,0\n';
const parsed=parseClientMap(geometry,2);
assert.deepEqual(parsed.lines,[[-20,-10,0,-40,-30,4,0,0,0,2]]);
assert.equal(parsed.labels[0].label,'Synthetic Keeper');
assert.deepEqual(mapBounds(parsed.lines),{minX:-40,minY:-30,maxX:-20,maxY:-10});
for(const z of [null,undefined,'','  ',false,true,NaN,Infinity]){assert.equal(knownMapZ(z),false);assert.equal(mapSliceContainsZ(z,100,25),true,'Unknown-Z mobs pierce every slice without being assigned floor zero');}
for(const z of [0,'0',-25,25])assert.equal(knownMapZ(z),true);
assert.equal(loggedMapSliceCenter(true,120,{z:128}),128,'Auto Z follows an explicit logged elevation');
assert.equal(loggedMapSliceCenter(false,120,{z:128}),120,'Manual slices survive new player elevations');
for(const z of [null,undefined,'',false,NaN,Infinity])assert.equal(loggedMapSliceCenter(true,120,{z}),120,'Unknown height preserves the last/manual slice instead of assigning zero');
assert.equal(loggedMapSliceCenter(true,120,{z:0}),0,'A real logged zero is a valid elevation');
assert.equal(mapSliceContainsZ(0,100,25),false,'Explicit Z zero is a known floor');
assert.equal(mapSliceContainsZ(75,100,25),true);assert.equal(mapSliceContainsZ(74,100,25),false);assert.equal(mapSliceContainsZ(130,100,35),true);
assert.deepEqual(mapElevationBounds([[0,0,-10,0,0,50]],[{loc:[1,2,null]},{loc:[1,2,125]}],{z:-40}),{min:-40,max:125});
assert.deepEqual(mapElevationBounds([],[{loc:[1,2,null]}]),{min:-1,max:1});
assert.deepEqual(clipMapSegmentToSlice({x:0,y:0,z:0},{x:100,y:0,z:100},0,25),[{x:0,y:0,z:0},{x:25,y:0,z:25}],'A ramp endpoint intersects the band even when its midpoint does not');
assert.deepEqual(clipMapSegmentToSlice({x:100,y:0,z:100},{x:0,y:0,z:0},50,10),[{x:60,y:0,z:60},{x:40,y:0,z:40}],'Descending segments clip in their existing direction');
assert.equal(clipMapSegmentToSlice({x:0,y:0,z:50},{x:1,y:1,z:50},0,25),null,'Out-of-slice route segments are omitted rather than joined across a gap');
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
assert.deepEqual(['map','top','first'].map(nextNativeMapMode),['top','first','map'],'View cycles through actual Map, Top 3D and First Person');
const hitMarkers=[{id:'normal-source',name:'Same Keeper',raidInstance:false,screen:{x:50,y:50}},{id:'raid-source',name:'Same Keeper',raidInstance:true,selected:true,screen:{x:150,y:50}}];
const hitLabels=[{...hitMarkers[0],x:15,y:70,width:100,height:13},{...hitMarkers[1],x:160,y:30,width:100,height:13}];
const hitTargets=mapNpcHitTargets(hitMarkers,hitLabels);
assert.equal(hitMapNpc({x:100,y:76},hitTargets).id,'normal-source','The entire visible name is clickable far beyond the marker radius');
assert.equal(hitMapNpc({x:250,y:35},hitTargets).id,'raid-source','Duplicate names keep exact raid source identity');
assert.equal(hitMapNpc({x:150,y:50},hitTargets).id,'raid-source','The marker uses the same target resolver as its text');
assert.equal(hitMapNpc({x:275,y:90},hitTargets),null,'Empty canvas remains draggable, with no invented target');
assert.equal(hitMapNpc({x:NaN,y:50},hitTargets),null);
assert.equal(hitMapNpc({x:50,y:50},mapNpcHitTargets(hitMarkers,[])).id,'normal-source','Decluttered names retain their marker and accessible destination');
assert.equal(hitMapNpc({x:58,y:50},mapNpcHitTargets([{...hitMarkers[0],selected:true},{...hitMarkers[1],screen:{x:58,y:50}}])).id,'raid-source','A nearby selected marker cannot steal a click on another marker’s center');
assert.deepEqual(hitMarkers.map(marker=>marker.id),['normal-source','raid-source'],'Hit resolution does not rewrite source identities');
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
assert.equal((await invalidating.load(zone.name)).status,'ready','Explicit cache invalidation discards an earlier in-flight scan');
assert.equal(invalidationScans,2);
console.log('Map overlay: layered aliases, malformed geometry, bounds, lazy cache, incomplete inventory, root races, interrupted layers and in-flight invalidation passed.');
