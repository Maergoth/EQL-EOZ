import assert from 'node:assert/strict';
import {installViewerPlayerState,knownViewerLocation} from '../app/zoneviewer/player-state.js';

class Vector{
    constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}clone(){return new Vector(this.x,this.y,this.z);}copy(v){Object.assign(this,v);return this;}
    set(x,y,z){Object.assign(this,{x,y,z});return this;}
}
class Group{
    children=[];position=new Vector();userData={};visible=true;
    add(child){child.parent=this;this.children.push(child);}remove(child){this.children=this.children.filter(value=>value!==child);child.parent=null;}
    removeFromParent(){this.parent?.remove(this);}traverse(fn){fn(this);for(const child of this.children)child.traverse?child.traverse(fn):fn(child);}
}
const resource=()=>({disposed:0,dispose(){this.disposed++;}});
function fixture(externalSlice=false){
    const scene=new Group(),navigationGuideGroup=new Group(),target={untouched:true},camera={position:new Vector(2,3,4)},label={textContent:'Existing route'},created=[];
    const clip=new EventTarget();Object.assign(clip,{step:1,min:'-500',max:'500',closest:()=>({parentNode:{insertBefore(button){created.push(button);}}})});
    const document={createElement(){const button=new EventTarget();Object.assign(button,{attributes:{},classList:{toggle(){}},setAttribute(name,value){this.attributes[name]=value;},remove(){this.removed=true;}});return button;}};
    const plane=()=>({normal:new Vector(0,-1,0),constant:0,clone(){return{...this,normal:this.normal.clone()};}});
    const app={scene,navigationGuideGroup,navigationTarget:target,perspective:camera,currentZoneRecord:{id:'synthetic'},currentBounds:{min:{y:-500},max:{y:500}},
        els:{clip,navigationLabel:label},loadedMaterials:[],mapMaterials:[],renderer:{},fp:{eyeHeight:6,maxStepUp:6},renders:0,
        requestRender(){this.renders++;},updateClipping(){this.loadedMaterials=[{clippingPlanes:[plane()]}];},
        eqWorldToThree:(x,y,z)=>new Vector(-y,z,x),findGroundPointAt:(x,z,y)=>new Vector(x,y-2,z),
        addNavigationBeam(position){assert.notEqual(this,app,'The mesh factory runs on an isolated route adapter');const group=new Group();
            const ring=new Group();ring.geometry={...resource(),type:'RingGeometry'};ring.material={...resource(),color:{set(value){this.value=value;}}};ring.scale={setScalar(value){this.value=value;}};
            const beam=new Group();beam.geometry=resource();beam.material=resource();group.add(beam);group.add(ring);this.navigationGuideGroup.add(group);this.navigationTarget.changed=true;this.els.navigationLabel.textContent='Temporary';created.push({ring,beam});}
    };
    const state=installViewerPlayerState({app,root:{ownerDocument:document},externalSlice});
    return{state,app,clip,created,target,camera,label};
}
for(const value of [null,undefined,'',false,NaN,Infinity])assert.equal(knownViewerLocation({x:1,y:2,z:value}),false);
assert.equal(knownViewerLocation({x:'0',y:2,z:-10}),true);
const f=fixture();
try{
    assert.deepEqual(f.state.status(),{autoZ:true,hasKnownZ:false,markerVisible:false,groundBasis:'unknown'});
    f.state.setAutoZ(true);assert.equal(f.app.renderer.clippingPlanes,undefined,'No known height creates no fictitious zero slice');
    const result=f.state.observe({x:10,y:20,z:30}),mesh=f.created.find(value=>value.ring);
    assert.equal(result.ok,true);assert.equal(result.grounded,true);assert.deepEqual(result.ground,new Vector(-20,28,10));
    assert.deepEqual(mesh.ring.position,new Vector(-20,28.24,10));assert.equal(mesh.ring.name,'eoz-player-ground-marker');assert.equal(mesh.ring.userData.eqlCollision,false);
    assert.equal(mesh.beam.geometry.disposed,1);assert.equal(mesh.ring.geometry.disposed,0,'Only the detached live ring survives temporary beam cleanup');
    assert.deepEqual(f.target,{untouched:true});assert.equal(f.label.textContent,'Existing route');assert.deepEqual(f.camera.position,new Vector(2,3,4),'Player evidence does not move an inspection camera');
    assert.deepEqual(f.app.renderer.clippingPlanes.map(plane=>[plane.normal.y,plane.constant]),[[-1,55],[1,-5]],'Automatic slice centers on logged Z, independently of snapped marker ground');
    assert.deepEqual([Number(f.clip.min),Number(f.clip.max)],[-500,500],'Automatic slicing never narrows full-zone manual floor bounds');
    f.clip.value='300';f.clip.dispatchEvent(new Event('input'));assert.equal(f.state.status().autoZ,false);assert.equal(Number(f.clip.value),300);assert.deepEqual(f.app.renderer.clippingPlanes,[],'Manual input can inspect a distant floor and releases global Auto Z clipping');
    f.app.renderer.clippingPlanes=['manual'];f.state.observe({x:11,y:21,z:45});assert.deepEqual(f.app.renderer.clippingPlanes,['manual']);
    f.state.observe({x:12,y:22,z:null});assert.equal(f.state.status().hasKnownZ,true);
    f.state.setAutoZ(true);assert.deepEqual(f.app.renderer.clippingPlanes.map(plane=>plane.constant),[70,-20],'Re-enable uses latest known height after an unknown sample');
    f.app.findGroundPointAt=(x,z)=>new Vector(x,200,z);const far=f.state.observe({x:11,y:21,z:45});
    assert.equal(far.grounded,false);assert.deepEqual(far.ground,new Vector(-21,45,11));assert.equal(f.state.status().groundBasis,'logged-elevation','A distant ceiling/floor cannot replace logged height');
    f.state.clear();assert.equal(mesh.ring.geometry.disposed,1);assert.equal(mesh.ring.parent,null);assert.equal(f.state.status().markerVisible,false);assert.equal(f.state.status().hasKnownZ,false);
    assert.deepEqual(f.camera.position,new Vector(2,3,4));f.state.setAutoZ(true);assert.equal(f.state.status().hasKnownZ,false);
    f.app.findGroundPointAt=()=>null;const zero=f.state.observe({x:0,y:0,z:0});assert.equal(zero.ground.y,0);assert.equal(zero.grounded,false);
}finally{f.state.dispose();}
const external=fixture(true);try{external.state.observe({x:1,y:2,z:3});assert.equal(external.app.renderer.clippingPlanes,undefined,'Native host slice ownership is not overridden inside its iframe');assert.equal(external.state.status().autoZ,false);}finally{external.state.dispose();}
console.log('Player marker/Auto Z: finite logged coordinates, nearby collision grounding, explicit fallback, route/camera isolation, manual/unknown/re-enable behavior and disposal passed.');
