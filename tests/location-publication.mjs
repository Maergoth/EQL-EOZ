import assert from 'node:assert/strict';
import {createOverlaySession} from '../app/overlay-session.js';
import {locationPollDelay} from '../app/movement-tracking.js';

const flush=async()=>{for(let index=0;index<10;index++)await Promise.resolve();};
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return{promise,resolve};}
function fixture(){
    let at=1000,next=0,heartbeat,blocked=null,builds=0,active=0,maxActive=0;
    let source={character:'Synthetic',zone:'Synthetic Vale',map:{dataVersion:1,location:{x:1,y:2,z:3}}};
    const timers=new Map(),sent=[];
    const owner=createOverlaySession({now:()=>at,storage:{getItem(){},setItem(){}},getSession(){builds++;return structuredClone(source);},
        setInterval(fn,delay){assert.equal(delay,1000);heartbeat=fn;return 99;},clearInterval(){},
        setTimeout(fn,delay){const id=++next;timers.set(id,{fn,at:at+delay});return id;},clearTimeout:id=>timers.delete(id),
        api:{async publish(value){active++;maxActive=Math.max(active,maxActive);sent.push(value);const wait=blocked;blocked=null;try{if(wait)await wait.promise;}finally{active--;}}}});
    return{owner,sent,timers,get builds(){return builds;},get maxActive(){return maxActive;},
        update(value){source=value;},block(){blocked=deferred();return blocked;},heartbeat:()=>heartbeat(),
        async advance(ms){at+=ms;for(const [id,timer]of [...timers])if(timer.at<=at){timers.delete(id);timer.fn();}await flush();}};
}
{
    const f=fixture();try{
        f.owner.requestPublish();for(let i=0;i<100;i++)f.owner.requestPublish();await flush();
        assert.equal(f.sent.length,1);assert.equal(f.builds,1,'A batch burst constructs a full snapshot only once');
        for(let index=0;index<100;index++){f.update({map:{location:{x:index,y:0,z:0}}});f.owner.requestPublish();}
        await flush();assert.equal(f.sent.length,1);assert.equal(f.timers.size,1,'A single bounded trailing timer owns rapid movement');
        await f.advance(99);assert.equal(f.sent.length,1);await f.advance(1);
        assert.equal(f.sent.length,2);assert.equal(f.sent.at(-1).session.map.location.x,99);assert.equal(f.builds,2);
        f.heartbeat();await flush();assert.equal(f.sent.length,3,'The unchanged 1s heartbeat still expires timers and updates idle panels');
    }finally{f.owner.dispose();}
}
{
    const f=fixture();try{
        const pending=f.block();const first=f.owner.publish();await flush();
        for(let index=0;index<50;index++){f.update({character:'New source',zone:'New zone',map:{dataVersion:2,location:{x:index,y:0,z:0}}});f.owner.requestPublish();void f.owner.publish();}
        f.update({character:'New source',zone:'New zone',map:{dataVersion:3,location:null}});f.owner.requestPublish();
        assert.equal(f.builds,1,'Busy transport never builds intermediate stale snapshots');
        pending.resolve();await first;await flush();await f.advance(100);
        assert.equal(f.maxActive,1);assert.equal(f.sent.length,2);assert.equal(f.builds,2);
        assert.equal(f.sent.at(-1).session.character,'New source');assert.equal(f.sent.at(-1).session.map.location,null,'The trailing snapshot reads current source state rather than a captured old location');
    }finally{f.owner.dispose();}
}
{
    const f=fixture();f.owner.requestPublish();await flush();f.owner.requestPublish();assert.equal(f.timers.size,1);f.owner.dispose();assert.equal(f.timers.size,0);await f.advance(1000);assert.equal(f.sent.length,1,'Closing cancels queued location work');
}
assert.equal(locationPollDelay(),650);assert.equal(locationPollDelay({mapVisible:true}),250);assert.equal(locationPollDelay({routeActive:true}),180);
console.log('Location publication: bounded pre-snapshot coalescing, trailing newest/source clears, single transport, unchanged heartbeat and disposal passed.');
