const knownZ=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));

// Adapt the existing decoder/camera rather than creating a second navigation
// engine. These methods change only this viewer's camera and presentation.
export function installOverlayMode({app,root,api,onSlice=()=>{}}){
    root.classList.add('eoz-native-3d');
    const style=root.ownerDocument.createElement('style');
    style.textContent='.eoz-native-3d .eqlzv-toolbar,.eoz-native-3d .eqlzv-status{display:none!important}.eoz-native-3d .eqlzv-app{border:0;border-radius:0}.eoz-native-3d .eqlzv-first-person-prompt{font-size:11px}';root.append(style);
    const baseFov=app.perspective?.fov||60;
    function focusAtLocation(location,{mode='first',fallbackZ}={}){
        if(!Array.isArray(location)||location.length<2||!location.slice(0,2).every(value=>Number.isFinite(Number(value)))||!app.currentZoneRecord)return {ok:false,reason:'no-location'};
        const hasZ=knownZ(location[2]),estimatedZ=knownZ(fallbackZ)?Number(fallbackZ):null;
        const point=app.eqWorldToThree(Number(location[0]),Number(location[1]),hasZ?Number(location[2]):estimatedZ??0);
        // Unknown-height inspection starts near the selected floor, so an
        // overhead ceiling cannot steal the initial ground ray. This remains
        // an estimated camera position and never assigns an NPC a wiki Z.
        const ground=app.findGroundPointAt(point.x,point.z,hasZ||estimatedZ!==null?point.y:app.currentBounds.max.y+100)||point;
        const forward=app.lastFirstPersonPose?.forward?.clone?.()||ground.clone().set(0,0,-1);
        if(app.mapFileVisible)app.setGameMapVisible(false);
        app.setMode(mode==='top'?'top':'first');
        if(mode==='top'){
            const target=app.orbit?.target;
            if(target){const delta=ground.clone().sub(target);app.perspective.position.add(delta);target.copy(ground);app.orbit.update?.();}
        }else{
            app.perspective.position.copy(ground).add({x:0,y:app.fp.eyeHeight||6,z:0});
            app.perspective.up.set(0,1,0);app.perspective.lookAt(app.perspective.position.clone().add(forward));
            app.fp.activate(app.perspective.position);app.captureFirstPersonPose?.();
        }
        app.requestRender?.();
        // Do not call syncLocation: NPC inspection cannot become a logged
        // player position, route start, heading sample or parser update.
        return {ok:true,heightEstimated:!hasZ,cameraFloorZ:ground.y};
    }
    function setSlice({center,tolerance=25}={}){
        if(!Number.isFinite(center)||!Number.isFinite(tolerance)||tolerance<1||tolerance>250)return {ok:false};
        onSlice({center,tolerance});
        const upper=center+tolerance,lower=center-tolerance;
        const clip=app.els?.clip;
        if(!clip)return {ok:false,reason:'slice-unavailable'};
        clip.min=String(lower-10);clip.max=String(upper+Math.max(10,Number(clip.step)||1)*2);clip.value=String(upper);app.updateClipping();
        const materials=[...(app.loadedMaterials||[]),...(app.mapMaterials||[])];
        const template=materials.find(material=>material.clippingPlanes?.length)?.clippingPlanes[0];
        if(!template?.clone)return {ok:false,reason:'slice-unavailable'};
        const ceiling=template.clone(),floor=template.clone();ceiling.normal.set(0,-1,0);ceiling.constant=upper;floor.normal.set(0,1,0);floor.constant=-lower;
        for(const material of materials){material.clippingPlanes=[];material.clipShadows=false;material.needsUpdate=true;}
        // Global planes also clip the shared golden route, whose materials do
        // not belong to the decoder's zone-material collection.
        app.renderer.clippingPlanes=[ceiling,floor];
        app.renderer.localClippingEnabled=true;app.requestRender?.();return {ok:true};
    }
    function setRoute(points=[]){
        if(!Array.isArray(points)||points.length>5000||points.some(point=>!['x','y','z'].every(key=>Number.isFinite(point?.[key]))))return {ok:false};
        app.clearNavigationGuide?.();
        if(points.length>=2){app.navigationGroup.visible=true;app.addNavigationPath(points.map(point=>app.eqWorldToThree(point.x,point.y,point.z)));}
        app.requestRender?.();return {ok:true};
    }
    function zoomBy(factor){
        if(!Number.isFinite(factor)||factor<=0)return {ok:false};
        const camera=app.perspective;
        if(app.mode==='first'){camera.fov=Math.max(30,Math.min(100,camera.fov/factor));camera.updateProjectionMatrix();}
        else if(app.orbit?.target){const target=app.orbit.target;camera.position.copy(target.clone().add(camera.position.clone().sub(target).multiplyScalar(1/factor)));app.orbit.update?.();}
        app.requestRender?.();return {ok:true};
    }
    Object.assign(api,{focusAtLocation,setOverlaySlice:setSlice,setOverlayRoute:setRoute,overlayZoom:zoomBy,
        resetOverlayCamera(){app.perspective.fov=baseFov;app.perspective.updateProjectionMatrix();app.resetView();return {ok:true};}});
    return {focusAtLocation,setSlice,setRoute,zoomBy};
}
