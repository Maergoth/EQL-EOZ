// Use an explicit gesture instead of native caption movement: Electron does
// not expose a portable native drag-end event on every supported platform.
export function mountOverlayDrag({document,bridge,panel,canMove,onError=()=>{}}) {
    let gesture=null,disposed=false;
    const listeners=[];
    const listen=(target,name,callback)=>{target.addEventListener(name,callback);listeners.push(()=>target.removeEventListener(name,callback));};
    function release(current) {
        current.pointer=null;
        document.body.classList.remove('is-moving');
        if(document.body.hasPointerCapture?.(current.id))document.body.releasePointerCapture(current.id);
    }
    async function flush(current) {
        if(current.busy)return;
        current.busy=true;
        try {
            if(!current.started){await bridge.action('move-start');current.started=true;}
            while(current.pending){const position=current.pending;current.pending=null;await bridge.action('move',position);}
            if(current.ending) {
                await bridge.action('move-end',{cancel:current.cancelled});
                if(gesture===current)gesture=null;
            }
        } catch {
            release(current);
            if(current.started)try{await bridge.action('move-end',{cancel:true});}catch{/* Host may already have hidden/locked the panel. */}
            if(gesture===current)gesture=null;
            if(!disposed&&canMove())onError('Move unavailable. Show and unlock this panel, then retry.');
        } finally {current.busy=false;}
    }
    function position(event) {
        if(!gesture||gesture.pointer!==event.pointerId)return;
        gesture.pending={deltaX:event.screenX-gesture.x,deltaY:event.screenY-gesture.y};
        void flush(gesture);
    }
    function finish(cancel=false) {
        if(!gesture||gesture.ending)return;
        const current=gesture;current.ending=true;current.cancelled=cancel;
        release(current);void flush(current);
    }
    function surface(target) {
        if(target.closest?.('button,input,select,textarea,a,.hover-menu,[contenteditable],.overlay-resize-edge'))return null;
        if(panel==='map')return target.closest?.('.native-map-drag-grip');
        if(panel==='intel')return target.closest?.('#overlay-header');
        return target.closest?.('#parse-drag-grip')||(panel==='timers'?target.closest?.('#panel-content'):null);
    }
    listen(document,'pointerdown',event=>{
        if(disposed||gesture||event.button!==0||event.isPrimary===false||!canMove()||!surface(event.target))return;
        event.preventDefault();
        gesture={id:event.pointerId,pointer:event.pointerId,x:event.screenX,y:event.screenY,pending:null,busy:false,started:false,ending:false,cancelled:false};
        document.body.setPointerCapture(event.pointerId);
        document.body.classList.add('is-moving');void flush(gesture);
    });
    listen(document,'pointermove',position);
    listen(document,'pointerup',event=>{if(gesture?.pointer!==event.pointerId)return;position(event);finish();});
    listen(document,'pointercancel',event=>{if(gesture?.pointer===event.pointerId)finish(true);});
    listen(document.body,'lostpointercapture',event=>{if(gesture?.pointer===event.pointerId)finish(true);});
    listen(document.defaultView,'pagehide',()=>finish(true));
    return {isActive:()=>gesture!==null,cancel(){finish(true);},dispose(){disposed=true;finish(true);listeners.forEach(remove=>remove());}};
}
