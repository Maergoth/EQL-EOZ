import assert from 'node:assert/strict';
import {mountOverlayDrag} from '../app/overlay-drag.js';

class Events {
    listeners=new Map();
    addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);}
    removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
    fire(name,props={}){const event={button:0,isPrimary:true,pointerId:1,screenX:100,screenY:100,preventDefault(){this.prevented=true;},...props};for(const listener of this.listeners.get(name)||[])listener(event);return event;}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({panel='parse',defer}={}) {
    const document=new Events(),body=new Events(),classes=new Set(),captures=new Set(),calls=[],errors=[];
    body.classList={add:value=>classes.add(value),remove:value=>classes.delete(value)};
    body.setPointerCapture=id=>captures.add(id);body.hasPointerCapture=id=>captures.has(id);body.releasePointerCapture=id=>captures.delete(id);
    document.body=body;document.defaultView=new Events();let enabled=true;
    const bridge={async action(action,payload){calls.push({action,payload});if(action===defer?.action)await defer.promise;return {ok:true};}};
    const controller=mountOverlayDrag({document,bridge,panel,canMove:()=>enabled,onError:error=>errors.push(error)});
    const target=selector=>({closest:query=>query.split(',').some(part=>part===selector)?{}:null});
    return {document,body,classes,captures,calls,errors,controller,target,setEnabled(value){enabled=value;}};
}
function deferred(action){let resolve;const promise=new Promise(done=>resolve=done);return {action,promise,resolve};}

{
    const gate=deferred('move-start'),f=fixture({defer:gate}),grip=f.target('#parse-drag-grip');
    f.document.fire('pointerdown',{target:grip});
    assert(f.classes.has('is-moving'));assert.deepEqual(f.calls.map(call=>call.action),['move-start']);
    f.document.fire('pointermove',{screenX:101,screenY:102});
    f.document.fire('pointermove',{screenX:120,screenY:110});
    f.document.fire('pointerup',{screenX:123,screenY:114});
    assert(!f.classes.has('is-moving'));assert.equal(f.captures.size,0);
    assert.equal(f.calls.length,1,'Movement waits for host detachment, including fast release before start reply');
    gate.resolve();await settle();
    assert.deepEqual(f.calls,[{action:'move-start',payload:undefined},{action:'move',payload:{deltaX:23,deltaY:14}},{action:'move-end',payload:{cancel:false}}]);
    f.controller.dispose();
}
{
    const gate=deferred('move'),f=fixture({defer:gate});
    f.document.fire('pointerdown',{target:f.target('#parse-drag-grip')});await settle();
    f.document.fire('pointermove',{screenX:101});
    f.document.fire('pointermove',{screenX:120});
    f.document.fire('pointerup',{screenX:140});
    f.document.fire('pointerdown',{target:f.target('#parse-drag-grip')});
    assert.equal(f.calls.filter(call=>call.action==='move-start').length,1,'A second gesture cannot overtake an in-flight final movement');
    gate.resolve();await settle();
    assert.deepEqual(f.calls.map(call=>[call.action,call.payload?.deltaX]),[['move-start',undefined],['move',1],['move',40],['move-end',undefined]]);
    f.controller.dispose();
}
for(const cancel of ['pointercancel','lostpointercapture','state','dispose','pagehide']) {
    const f=fixture();f.document.fire('pointerdown',{target:f.target('#parse-drag-grip')});await settle();
    if(cancel==='state'){f.setEnabled(false);f.controller.cancel();}
    else if(cancel==='dispose')f.controller.dispose();
    else (cancel==='lostpointercapture'?f.body:cancel==='pagehide'?f.document.defaultView:f.document).fire(cancel);
    await settle();assert.deepEqual(f.calls.at(-1),{action:'move-end',payload:{cancel:true}},cancel);assert(!f.classes.has('is-moving'));f.controller.dispose();
}
for(const [panel,selector]of [['parse','#parse-drag-grip'],['timers','#panel-content'],['intel','#overlay-header'],['map','.native-map-drag-grip']]) {
    const f=fixture({panel});
    for(const control of ['button','input','select','textarea','a','.hover-menu','.overlay-resize-edge'])f.document.fire('pointerdown',{target:{closest:query=>query.split(',').includes(control)||query===selector?{}:null}});
    assert.equal(f.calls.length,0,`${panel}: controls remain interactive`);
    f.setEnabled(false);f.document.fire('pointerdown',{target:f.target(selector)});assert.equal(f.calls.length,0,'Locked/hidden/pass-through surfaces cannot start a move');
    f.setEnabled(true);assert(f.document.fire('pointerdown',{target:f.target(selector)}).prevented);await settle();
    f.document.fire('pointerup');await settle();assert.equal(f.calls.at(-1).action,'move-end');f.controller.dispose();
}
console.log('Overlay drag: serialized detachment/move/release, coalesced fast drags, cancellation and interactive controls passed.');
