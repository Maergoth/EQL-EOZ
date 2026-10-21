import assert from 'node:assert/strict';
import {mountMapOverlay3D} from '../app/map-overlay-3d.js';
import {installOverlayMode} from '../app/zoneviewer/overlay-mode.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function fixture(apis){
    const frames=[],modes=[],focuses=[],locations=[],selections=[],applied=[],statuses=[];
    const makeApi=()=>({useConfiguredFolder:async()=>({ok:true}),loadZone:async name=>({ok:true,name}),
        setView:mode=>modes.push(mode),syncLocation:location=>locations.push(location),setRareMobs(){},setOverlaySelection(){},
        setOverlayRoute(){},setOverlaySlice(){},overlayZoom(){},resize(){},focusAtLocation:loc=>{focuses.push(loc);return {ok:true};}});
    const document={createElement(){const listeners=new Map();const frame={listeners,style:{},removed:false,
        contentWindow:{eqlEyeOfZommViewer:apis?.shift?.()||makeApi(),listeners:new Map(),addEventListener(type,handler){this.listeners.set(type,handler);}},
        setAttribute(){},addEventListener(type,handler){listeners.set(type,handler);},remove(){this.removed=true;}};frames.push(frame);return frame;}};
    const root={ownerDocument:document,appendChild(frame){queueMicrotask(()=>frame.listeners.get('load')?.());}};
    const session={zone:'Synthetic Zone',map:{zone:'Synthetic Zone',viewerZone:'synthetic',dataVersion:1,location:{x:10,y:20,z:30,at:1},
        npcs:[{id:'normal',name:'Synthetic Keeper',loc:[1,2],raidInstance:false},{id:'raid',name:'Synthetic Keeper',loc:[3,4,5],raidInstance:true}],route:{points:[]}}};
    const controller=mountMapOverlay3D({root,getSession:()=>session,onStatus:message=>statuses.push(message),onSelectNpc:npc=>selections.push(npc),onFocusApplied:focus=>applied.push(focus)});
    return {controller,frames,session,modes,focuses,locations,selections,applied,statuses,makeApi};
}
const f=fixture();
try{
    assert.equal(f.frames.length,0,'Ordinary Map never decodes an archive or opens a 3D iframe');
    await f.controller.setMode('top');assert.equal(f.frames.length,1);assert.equal(f.frames[0].src,'./zoneviewer/viewer.html?overlay=1');assert.deepEqual(f.modes,['top']);assert.equal(f.locations.length,1);
    await f.controller.setMode('first');assert.equal(f.frames.length,1);assert.equal(f.modes.at(-1),'first');
    assert.equal(f.locations.length,2,'Switching from Top to First while following re-centers the unchanged logged location');
    const playerSyncsBeforeFocus=f.locations.length;
    const focus={id:'raid',sequence:9,name:'Synthetic Keeper',zone:'Synthetic Zone',loc:[3,4,5],mode:'first'};
    f.controller.render({...f.session,map:{...f.session.map,focus}});await tick();
    assert.deepEqual(f.focuses,[[3,4,5]]);assert.deepEqual(f.applied,[focus]);assert.equal(f.locations.length,playerSyncsBeforeFocus,'NPC focus does not call the logged-player synchronization API');
    f.controller.render({...f.session,map:{...f.session.map,focus}});await tick();assert.equal(f.focuses.length,1,'One focus sequence is applied once');
    await f.controller.setMode('map');assert.equal(f.frames[0].removed,true,'Returning to Map releases the decoder/camera iframe');
}finally{f.controller.dispose();}

const oldLoad=deferred(),newLoad=deferred();let oldCalls=0,newCalls=0,newModes=[];
const oldApi={useConfiguredFolder:async()=>({ok:true}),loadZone:()=>{oldCalls++;return oldLoad.promise;}};
const nextApi={useConfiguredFolder:async()=>({ok:true}),loadZone:()=>{newCalls++;return newLoad.promise;},setView:mode=>newModes.push(mode),setRareMobs(){},setOverlaySelection(){},setOverlayRoute(){},syncLocation(){},resize(){}};
const racing=fixture([oldApi,nextApi]);
try{
    const old=racing.controller.setMode('first');await tick();assert.equal(oldCalls,1);
    const next={zone:'New Zone',map:{zone:'New Zone',viewerZone:'newzone',dataVersion:2,route:{points:[]},npcs:[]}};
    racing.controller.render(next);await tick();assert.equal(newCalls,1,'A never-resolving removed iframe cannot block the new zone');
    racing.controller.render({...next,map:{...next.map,selectedNpcId:'new'}});await tick();assert.equal(newCalls,1,'An old finalizer cannot clear the new task and start a duplicate decode');
    newLoad.resolve({ok:true});await tick();await old;assert.deepEqual(newModes,['first']);assert.equal(racing.frames[0].removed,true);
}finally{racing.controller.dispose();}

class Vector{
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vector(this.x,this.y,this.z);}set(x,y,z){Object.assign(this,{x,y,z});return this;}
    add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}copy(v){return this.set(v.x,v.y,v.z);}multiplyScalar(n){this.x*=n;this.y*=n;this.z*=n;return this;}
}
const plane=()=>({normal:new Vector(0,-1,0),constant:0,clone(){return {...this,normal:this.normal.clone(),clone:this.clone};}});
let playerSync=0,routeSearch=0,route=[],slice;
const camera={position:new Vector(),up:new Vector(),fov:60,lookAt(){},updateProjectionMatrix(){}};
const app={currentZoneRecord:{id:'synthetic'},currentBounds:{max:{y:100}},perspective:camera,mode:'top',lastSyncedLocation:{x:99,y:88,z:77},
    eqWorldToThree:(x,y,z)=>new Vector(-y,z,x),findGroundPointAt:(x,z,y)=>new Vector(x,y,z),setMode(mode){this.mode=mode;},
    fp:{eyeHeight:6,activate(){}},captureFirstPersonPose(){},requestRender(){},orbit:{target:new Vector(),update(){}},
    els:{clip:{step:1}},loadedMaterials:[{clippingPlanes:[]}],mapMaterials:[],renderer:{},updateClipping(){this.loadedMaterials[0].clippingPlanes=[plane()];},
    clearNavigationGuide(){route=[];},navigationGroup:{},addNavigationPath(points){route=points;},findNavigationPath(){routeSearch++;},resetView(){}};
const api={syncLocation(){playerSync++;}},root={classList:{add(){}},ownerDocument:{createElement:()=>({})},append(){}};
installOverlayMode({app,root,api,onSlice:value=>{slice=value;}});
const player=app.lastSyncedLocation;
assert.equal(api.focusAtLocation([20,30,10],{mode:'first'}).ok,true);
assert.deepEqual(camera.position,new Vector(-30,16,20));assert.equal(playerSync,0);assert.equal(app.lastSyncedLocation,player);
assert.equal(api.focusAtLocation([20,30],{mode:'first'}).heightEstimated,true,'Unknown Z remains explicitly estimated, never advertised as a wiki coordinate');
assert.equal(api.setOverlaySlice({center:40,tolerance:10}).ok,true);assert.deepEqual(slice,{center:40,tolerance:10});
assert.deepEqual(app.renderer.clippingPlanes.map(p=>[p.normal.y,p.constant]),[[-1,50],[1,-30]],'Both ceiling and floor clip zone and shared route materials');
api.setOverlayRoute([{x:1,y:2,z:3},{x:4,y:5,z:6}]);assert.equal(route.length,2);assert.equal(routeSearch,0,'The overlay renders an already validated shared route without running another search');
console.log('Native Map 3D: lazy real-viewer wiring, camera modes, camera-only exact NPC focus, stale/hidden decode cancellation, task ownership and global floor/route clipping contracts passed.');
