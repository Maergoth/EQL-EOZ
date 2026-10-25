import {applyViewerSlice} from './overlay-mode.js';

const known=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
export const knownViewerLocation=location=>Boolean(location&&['x','y','z'].every(key=>known(location[key])));
const validPoint=point=>point&&['x','y','z'].every(key=>Number.isFinite(point[key]));
const disposeTree=object=>object?.traverse?.(child=>{child.geometry?.dispose?.();for(const material of Array.isArray(child.material)?child.material:[child.material])material?.dispose?.();});

function keepMarkerVisible(marker,app,{units,pixels,minScale}){
    marker.frustumCulled=false;
    marker.onBeforeRender=(_renderer,_scene,camera)=>{
        const height=Number(app.els?.viewport?.clientHeight||app.renderer?.domElement?.clientHeight),position=camera?.position;
        if(!(height>0)||!position)return;
        let perPixel;
        if(camera.isOrthographicCamera)perPixel=Math.abs(camera.top-camera.bottom)/(Math.max(.001,Number(camera.zoom)||1)*height);
        else{const distance=Math.hypot(position.x-marker.position.x,position.y-marker.position.y,position.z-marker.position.z);perPixel=2*distance*Math.tan((Number(camera.fov)||60)*Math.PI/360)/height;}
        if(!Number.isFinite(perPixel))return;
        marker.scale.setScalar(Math.max(minScale,perPixel*pixels/units));marker.updateMatrixWorld?.();
    };
}

// Use the pinned viewer's existing mesh/material factory in an isolated adapter.
// No route, navigation target, real label, log pose or decoder state is changed.
function createPlayerRing(app){
    if(!app.addNavigationBeam||!app.navigationGuideGroup?.constructor||!app.scene?.add)return null;
    const temporary=new app.navigationGuideGroup.constructor(),adapter={currentBounds:app.currentBounds,navigationGuideGroup:temporary,navigationTarget:{},els:{locationBeams:{checked:true},navigationLabel:{}}};
    let ring;
    try{
        app.addNavigationBeam.call(adapter,app.eqWorldToThree(0,0,0),'');
        const group=temporary.children?.[0];ring=group?.children?.find(child=>child.geometry?.type==='RingGeometry');
        if(!ring)return null;
        group.remove(ring);ring.name='eoz-player-ground-marker';ring.userData={...ring.userData,eqlCollision:false};
        ring.scale?.setScalar?.(2.5);ring.material.color?.set?.('#6cdff5');ring.material.opacity=.9;ring.material.depthWrite=false;ring.material.depthTest=true;
        ring.material.polygonOffset=true;ring.material.polygonOffsetFactor=-2;ring.material.polygonOffsetUnits=-2;ring.renderOrder=950;
        keepMarkerVisible(ring,app,{units:5.2,pixels:9,minScale:2.5});
        app.scene.add(ring);return ring;
    }finally{disposeTree(temporary);}
}

function createPlayerArrow(ring,app){
    const position=ring?.geometry?.attributes?.position;
    if(!position?.constructor||!ring.clone||!ring.geometry?.clone||!ring.material?.clone)return null;
    const geometry=ring.geometry.clone(),arrow=ring.clone();
    geometry.setIndex([0,1,2,0,2,3]);
    // A flat chevron points down local -Z; rotate it around world Y only.
    geometry.setAttribute('position',new position.constructor(new Float32Array([0,0,-14,-7,0,7,0,0,3,7,0,7]),3));
    geometry.deleteAttribute?.('uv');geometry.deleteAttribute?.('normal');geometry.computeVertexNormals();geometry.computeBoundingSphere();
    arrow.geometry=geometry;arrow.material=ring.material.clone();arrow.name='eoz-player-direction-arrow';arrow.userData={eqlCollision:false};
    arrow.rotation.set(0,0,0);arrow.scale.setScalar(1);arrow.renderOrder=951;arrow.visible=false;keepMarkerVisible(arrow,app,{units:14,pixels:12,minScale:1});app.scene.add(arrow);return arrow;
}

export function installViewerPlayerState({app,root,externalSlice=false}={}){
    let ring=null,arrow=null,world=null,ground=null,grounded=false,latestZ=null,autoZ=!externalSlice,tolerance=25,disposed=false;
    const document=root?.ownerDocument,button=document?.createElement?.('button');
    if(button){button.type='button';button.className='eqlzv-button eoz-auto-z';button.textContent='Auto Z';button.setAttribute('aria-label','Follow logged player elevation automatically');
        const slicer=app.els?.clip?.closest?.('.eqlzv-z-slicer');slicer?.parentNode?.insertBefore(button,slicer.nextSibling);}
    function paint(){if(button){button.setAttribute('aria-pressed',String(autoZ));button.classList.toggle('is-active',autoZ);button.title=autoZ?'Auto Z follows the latest known logged elevation. Moving the Z slider switches to manual.':'Manual Z slice. Enable Auto Z to follow the latest known logged elevation.';}}
    function applyAuto(){if(autoZ&&Number.isFinite(latestZ))return applyViewerSlice(app,{center:latestZ,tolerance});return {ok:false,reason:'no-known-player-z'};}
    function setAutoZ(enabled,options={}){autoZ=Boolean(enabled);if(Number.isFinite(options.tolerance)&&options.tolerance>=1&&options.tolerance<=250)tolerance=options.tolerance;paint();if(autoZ)applyAuto();return {ok:true,enabled:autoZ,hasKnownZ:Number.isFinite(latestZ)};}
    function manual(){if(disposed)return;autoZ=false;if(app.renderer)app.renderer.clippingPlanes=[];app.updateClipping?.();paint();}
    function observe(location,{heading=null}={}){
        if(disposed||!knownViewerLocation(location)||!app.currentZoneRecord){if(ring)ring.visible=false;if(arrow)arrow.visible=false;return {ok:false,reason:'no-location'};}
        world={x:Number(location.x),y:Number(location.y),z:Number(location.z)};latestZ=world.z;
        const point=app.eqWorldToThree(world.x,world.y,world.z),probe=app.findGroundPointAt?.(point.x,point.z,point.y),limit=Math.max(6,Number(app.fp?.maxStepUp)||6)+Math.max(0,Number(app.fp?.eyeHeight)||6);
        // A distant floor is not the logged floor. Retain logged elevation when
        // a nearby grounded point cannot be established, never invent Z=0.
        grounded=Boolean(validPoint(probe)&&Math.abs(probe.y-point.y)<=limit&&Math.hypot(probe.x-point.x,probe.z-point.z)<.1);ground=(grounded?probe:point).clone();
        if(!ring)ring=createPlayerRing(app);
        if(ring){ring.position.copy(ground);ring.position.y+=.24;ring.userData.groundBasis=grounded?'collision-ground':'logged-elevation';ring.visible=true;}
        if(ring&&!arrow)arrow=createPlayerArrow(ring,app);
        if(arrow){
            const hasHeading=Number.isFinite(heading?.x)&&Number.isFinite(heading?.y)&&Math.hypot(heading.x,heading.y)>.001;
            arrow.visible=hasHeading;
            if(hasHeading){const forward=app.eqWorldToThree(world.x+heading.x,world.y+heading.y,world.z),origin=point;arrow.rotation.y=Math.atan2(-(forward.x-origin.x),-(forward.z-origin.z));arrow.position.copy(ground);arrow.position.y+=.3;}
        }
        applyAuto();app.requestRender?.();return {ok:true,world:{...world},ground:ground.clone(),grounded};
    }
    function clear(){world=null;ground=null;latestZ=null;grounded=false;for(const marker of [ring,arrow])if(marker){marker.removeFromParent?.();disposeTree(marker);}ring=null;arrow=null;app.requestRender?.();}
    button?.addEventListener('click',()=>setAutoZ(!autoZ));app.els?.clip?.addEventListener?.('input',manual);paint();
    return {observe,clear,setAutoZ,manual,
        status:()=>({autoZ,hasKnownZ:Number.isFinite(latestZ),markerVisible:Boolean(ring?.visible),arrowVisible:Boolean(arrow?.visible),groundBasis:world?(grounded?'collision-ground':'logged-elevation'):'unknown'}),
        dispose(){if(disposed)return;disposed=true;clear();app.els?.clip?.removeEventListener?.('input',manual);button?.remove();}};
}
