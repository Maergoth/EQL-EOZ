import assert from 'node:assert/strict';
import {mountMapOverlay3D} from '../app/map-overlay-3d.js';
import {installOverlayMode,installViewerTopPan} from '../app/zoneviewer/overlay-mode.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
function fixture(apis){
    const frames=[],modes=[],focuses=[],locations=[],locationOptions=[],clears=[],selections=[],applied=[],statuses=[];
    const makeApi=()=>({useConfiguredFolder:async()=>({ok:true}),loadZone:async name=>({ok:true,name}),
        setView:mode=>modes.push(mode),syncLocation:(location,options)=>{locations.push(location);locationOptions.push(options);},clearPlayerLocation:()=>clears.push(true),setRareMobs(){},setOverlaySelection(){},
        setOverlayRoute(){},setOverlaySlice(){},overlayZoom(){},resize(){},focusAtLocation:loc=>{focuses.push(loc);return {ok:true};}});
    const document={createElement(){const listeners=new Map();const frame={listeners,style:{},removed:false,
        contentWindow:{eqlEyeOfZommViewer:apis?.shift?.()||makeApi(),listeners:new Map(),addEventListener(type,handler){this.listeners.set(type,handler);}},
        setAttribute(){},addEventListener(type,handler){listeners.set(type,handler);},remove(){this.removed=true;}};frames.push(frame);return frame;}};
    const root={ownerDocument:document,appendChild(frame){queueMicrotask(()=>frame.listeners.get('load')?.());}};
    const session={zone:'Synthetic Zone',map:{zone:'Synthetic Zone',viewerZone:'synthetic',dataVersion:1,location:{x:10,y:20,z:30,at:1},
        npcs:[{id:'normal',name:'Synthetic Keeper',loc:[1,2],raidInstance:false},{id:'raid',name:'Synthetic Keeper',loc:[3,4,5],raidInstance:true}],route:{points:[]}}};
    const controller=mountMapOverlay3D({root,getSession:()=>session,onStatus:message=>statuses.push(message),onSelectNpc:npc=>selections.push(npc),onFocusApplied:focus=>applied.push(focus)});
    return {controller,frames,session,modes,focuses,locations,locationOptions,clears,selections,applied,statuses,makeApi};
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
    f.controller.setFollow(false);const latest={x:11,y:21,z:31,at:2};
    f.controller.render({...f.session,map:{...f.session.map,focus,location:latest}});await tick();
    assert.equal(f.locations.at(-1),latest,'The player marker receives new log samples while camera Follow is off');
    assert.equal(f.locationOptions.at(-1).moveCamera,false,'Updating a marker never pulls an inspection camera back to the player');
    f.controller.render({...f.session,map:{...f.session.map,location:null}});await tick();assert.equal(f.clears.length,1,'A source clear removes the old player marker even in the same zone');
    await f.controller.setMode('map');assert.equal(f.frames[0].removed,true,'Returning to Map releases the decoder/camera iframe');
}finally{f.controller.dispose();}
const unverified=fixture();
try{
    unverified.session.map.viewerZone='';await unverified.controller.setMode('top');
    assert.equal(unverified.frames.length,0,'An explicitly unverified short name cannot fall back to a different display-name archive');assert.match(unverified.statuses.at(-1),/no verified matching archive/);
}finally{unverified.controller.dispose();}
const retryApi={useConfiguredFolder:async()=>({ok:true}),loadZone:async()=>({ok:true}),setView(){},setRareMobs(){},setOverlayRoute(){},resize(){},syncLocation(){return ++this.attempts===1?{ok:false,reason:'load-zone-first'}:{ok:true};},attempts:0},retrying=fixture([retryApi]);
try{await retrying.controller.setMode('top');assert.equal(retryApi.attempts,1);retrying.controller.render(retrying.session);await tick();assert.equal(retryApi.attempts,2,'an initial rejected location sample must be retried even when coordinates did not change');}finally{retrying.controller.dispose();}

const createdControls=[],factory={orbit:{mouseButtons:{LEFT:0,RIGHT:2}},createOrbitControls(camera,mapOnly){const controls={camera,mapOnly,mouseButtons:{LEFT:mapOnly?2:0,RIGHT:2},noRotate:false};createdControls.push(controls);return controls;}};
const originalFactory=factory.createOrbitControls,pan=installViewerTopPan(factory);assert.deepEqual(factory.orbit.mouseButtons,{LEFT:2,RIGHT:0});
const topControls=factory.createOrbitControls({},false),flatControls=factory.createOrbitControls({},true);assert.equal(topControls.mouseButtons.LEFT,2,'Top 3D left drag uses the pinned MOUSE.PAN action');assert.equal(topControls.mouseButtons.RIGHT,0,'explicit right drag retains perspective rotation');assert.equal(topControls.noRotate,false);assert.deepEqual(flatControls.mouseButtons,{LEFT:2,RIGHT:2},'flat-map controls retain their established mapping');pan.dispose();assert.equal(factory.createOrbitControls,originalFactory);

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
const slicedFocus=api.focusAtLocation([20,30],{mode:'first',fallbackZ:120});
assert.equal(slicedFocus.heightEstimated,true);assert.equal(slicedFocus.cameraFloorZ,120);
assert.equal(camera.position.y,126,'Unknown-height inspection starts at the selected floor instead of searching from above Hate’s ceiling');
assert.equal(api.focusAtLocation([20,30,10],{mode:'first',fallbackZ:120}).cameraFloorZ,10,'A known wiki elevation remains authoritative over the presentation default');
assert.equal(api.setOverlaySlice({center:40,tolerance:10}).ok,true);assert.deepEqual(slice,{center:40,tolerance:10});
assert.deepEqual(app.renderer.clippingPlanes.map(p=>[p.normal.y,p.constant]),[[-1,50],[1,-30]],'Both ceiling and floor clip zone and shared route materials');
api.setOverlayRoute([{x:1,y:2,z:3},{x:4,y:5,z:6}]);assert.equal(route.length,2);assert.equal(routeSearch,0,'The overlay renders an already validated shared route without running another search');
console.log('Native Map 3D: lazy real-viewer wiring, camera modes, camera-only exact NPC focus, stale/hidden decode cancellation, task ownership and global floor/route clipping contracts passed.');
