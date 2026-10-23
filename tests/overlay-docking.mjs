import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {snapOverlayBounds,applyOverlayDock,normalizeOverlayDocks}=createRequire(import.meta.url)('../desktop/overlay-docking.cjs');
const workArea={x:0,y:0,width:1920,height:1080};
const target={id:'parse',visible:true,displayId:1,bounds:{x:400,y:300,width:500,height:260}};
const base={id:'timers',displayId:1,workArea,targets:[target]};
const fixtures=[
    [{x:407,y:258,width:340,height:36},{targetId:'parse',edge:'above'},{x:400,y:264,width:500,height:36}],
    [{x:392,y:568,width:340,height:50},{targetId:'parse',edge:'below'},{x:400,y:560,width:500,height:50}],
    [{x:132,y:307,width:260,height:90},{targetId:'parse',edge:'left'},{x:140,y:300,width:260,height:260}],
    [{x:907,y:292,width:320,height:90},{targetId:'parse',edge:'right'},{x:900,y:300,width:320,height:260}]
];
for(const [bounds,relation,expected]of fixtures) {
    const outcome=snapOverlayBounds({...base,bounds});
    assert.deepEqual(outcome.relation,relation);assert.deepEqual(outcome.bounds,expected);assert.equal(outcome.changed,true);
}
const touching=snapOverlayBounds({...base,bounds:{x:400,y:560,width:500,height:50}});
assert.deepEqual(touching.relation,{targetId:'parse',edge:'below'});assert.equal(touching.changed,false,'Already touching still establishes a relation');
const away={x:400,y:590,width:500,height:50};
assert.equal(snapOverlayBounds({...base,bounds:away}).relation,null,'Dragging beyond the magnet threshold can detach');
assert.deepEqual(snapOverlayBounds({...base,bounds:away}).bounds,away);
assert.equal(snapOverlayBounds({...base,bounds:{x:873,y:562,width:320,height:50}}).relation,null,'A remote corner with only27px overlap cannot teleport into a full-width stack');

for(const alternate of [{...target,visible:false},{...target,displayId:2},{...target,id:'timers'}]) {
    assert.equal(snapOverlayBounds({...base,targets:[alternate],bounds:fixtures[1][0]}).relation,null,'Hidden, cross-display and self targets never snap');
}
const before=structuredClone({base,fixtures});snapOverlayBounds({...base,bounds:fixtures[0][0]});assert.deepEqual({base,fixtures},before);
const reversed=normalizeOverlayDocks([target,{id:'timers',visible:true,displayId:1,bounds:fixtures[1][0]}],{parse:{targetId:'timers',edge:'above'}});
assert.equal(snapOverlayBounds({...base,bounds:fixtures[1][0],relations:reversed}).relation,null,'A new snap cannot close a cycle');

// A new native target size must be used directly, never an old preference size.
const resized={x:400,y:300,width:610,height:340};
assert.deepEqual(applyOverlayDock({...base,bounds:touching.bounds,targetBounds:resized,relation:touching.relation}),
    {x:400,y:640,width:610,height:50},'An attached lower panel follows resized target width and bottom');
assert.deepEqual(applyOverlayDock({...base,bounds:fixtures[3][2],targetBounds:resized,relation:fixtures[3][1]}),
    {x:1010,y:300,width:320,height:340},'An attached side panel follows resized target height and right edge');
assert.deepEqual(applyOverlayDock({...base,bounds:{x:400,y:560,width:500,height:190},targetBounds:target.bounds,relation:touching.relation}),
    {x:400,y:560,width:500,height:190},'Resizing a docked owner preserves its independent perpendicular dimension');
assert.equal(applyOverlayDock({...base,bounds:touching.bounds,targetBounds:{...target.bounds,width:1250},relation:touching.relation}),null,'Oversize target width rejects docking instead of distorting an edge');
assert.equal(applyOverlayDock({...base,bounds:touching.bounds,targetBounds:{x:1700,y:300,width:500,height:260},relation:touching.relation}),null,'A partial off-screen group is rejected rather than clamped across the screen');
assert.equal(applyOverlayDock({...base,id:'intel',bounds:{x:400,y:560,width:500,height:160},targetBounds:{...target.bounds,height:64},relation:{targetId:'parse',edge:'right'}}),null,'A normal panel cannot inherit a target height below its160px minimum');
assert.equal(applyOverlayDock({...base,bounds:touching.bounds,targetBounds:target.bounds,relation:{targetId:'timers',edge:'above'}}),null);
assert.equal(applyOverlayDock({...base,bounds:touching.bounds,targetBounds:target.bounds,relation:{targetId:'parse',edge:'diagonal'}}),null);
assert.equal(applyOverlayDock({...base,targets:[{...target,visible:false}],bounds:touching.bounds,targetBounds:target.bounds,relation:touching.relation}),null,'A hidden target cannot continue a persistent dock');
assert.equal(applyOverlayDock({...base,targets:[{...target,displayId:2}],bounds:touching.bounds,targetBounds:target.bounds,relation:touching.relation}),null,'Target display ownership is checked during propagation too');
assert.equal(snapOverlayBounds({...base,bounds:{x:0,y:0,width:NaN,height:30}}).bounds,null,'Malformed bounds cannot reach native APIs');

const blocker={id:'intel',displayId:1,visible:true,bounds:{x:400,y:570,width:500,height:180}};
assert.equal(snapOverlayBounds({...base,targets:[target,blocker],bounds:fixtures[1][0]}).relation,null,'A snap cannot overlap a third visible panel');
assert.equal(applyOverlayDock({...base,targets:[target,blocker],bounds:touching.bounds,targetBounds:resized,relation:touching.relation}),null,'Resize propagation rejects a collision');
const boundaryBlocker={...blocker,bounds:{x:400,y:610,width:500,height:180}};
assert.deepEqual(snapOverlayBounds({...base,targets:[target,boundaryBlocker],bounds:fixtures[1][0]}).bounds,{x:400,y:560,width:500,height:50},'Touching another panel is allowed without rectangle overlap');
for(const ignored of [{...blocker,visible:false},{...blocker,displayId:2}])assert(snapOverlayBounds({...base,targets:[target,ignored],bounds:fixtures[1][0]}).relation,'Hidden or other-display panels do not create phantom collisions');

// Selection is independent of array order and prefers a closer shared edge.
const far={id:'map',displayId:1,visible:true,bounds:{x:400,y:100,width:500,height:454}};
assert.equal(snapOverlayBounds({...base,targets:[far,target],bounds:fixtures[1][0]}).relation.targetId,'parse');
const duplicate={...target,id:'aaa'};
for(const targets of [[target,duplicate],[duplicate,target]])assert.equal(snapOverlayBounds({...base,targets,bounds:fixtures[1][0]}).relation.targetId,'aaa','Equal candidate edges have stable target-ID ordering');
// Equal edge distance with disjoint opposite sides is resolved by target ID.
const left={id:'aaa',visible:true,displayId:1,bounds:{x:100,y:300,width:300,height:260}},right={id:'zzz',visible:true,displayId:1,bounds:{x:660,y:300,width:300,height:260}};
for(const targets of [[left,right],[right,left]])assert.deepEqual(snapOverlayBounds({...base,targets,bounds:{x:400,y:300,width:260,height:260}}).relation,{targetId:'aaa',edge:'right'});

const panels=[target,{id:'map',visible:true,displayId:1,bounds:{x:900,y:300,width:400,height:260}},
    {id:'intel',visible:true,displayId:1,bounds:{x:400,y:560,width:500,height:180}},
    {id:'timers',visible:true,displayId:1,bounds:touching.bounds},{id:'hidden',visible:false,displayId:1,bounds:touching.bounds},
    {id:'other',visible:true,displayId:2,bounds:touching.bounds}];
assert.deepEqual(normalizeOverlayDocks(panels,{timers:{targetId:'parse',edge:'below'},map:{targetId:'parse',edge:'right'}}),
    {map:{targetId:'parse',edge:'right'},timers:{targetId:'parse',edge:'below'}});
assert.deepEqual(normalizeOverlayDocks(panels,{parse:{targetId:'parse',edge:'below'},timers:{targetId:'hidden',edge:'below'},map:{targetId:'other',edge:'right'},intel:{targetId:'absent',edge:'above'}}),{});
const cycle={parse:{targetId:'map',edge:'left'},map:{targetId:'intel',edge:'above'},intel:{targetId:'parse',edge:'below'},timers:{targetId:'parse',edge:'below'}};
const retained={timers:{targetId:'parse',edge:'below'}};
assert.deepEqual(normalizeOverlayDocks(panels,cycle),retained,'Every cycle member is removed while a valid child can retain its now-rooted target');
assert.deepEqual(normalizeOverlayDocks(panels,Object.fromEntries(Object.entries(cycle).reverse())),retained);
assert.deepEqual(normalizeOverlayDocks(panels,{timers:{targetId:'parse',edge:'diagonal'}}),{});
console.log('Overlay docking: touching width/height alignment, live target resize, deliberate detach, bounds/visibility/display/collision/cycle guards and deterministic relation normalization passed.');
