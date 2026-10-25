// Keep pointer previews quiet while users move between controls. Keyboard
// focus may call show directly; this controller only schedules pointer hovers.
export const TOOLTIP_HOVER_DELAY_MS = 350;
export function createTooltipHover({show,valid=target=>target?.isConnected!==false,setTimeout=globalThis.setTimeout,clearTimeout=globalThis.clearTimeout}={}) {
    let target=null,point=null,timer=null,disposed=false;
    const cancel=()=>{if(timer!==null)clearTimeout(timer);target=null;point=null;timer=null;};
    return {
        queue(next,event){
            if(disposed||!next)return;
            point=Number.isFinite(event?.clientX)?{clientX:event.clientX,clientY:event.clientY}:null;
            if(target===next)return;
            cancel();target=next;point=Number.isFinite(event?.clientX)?{clientX:event.clientX,clientY:event.clientY}:null;
            timer=setTimeout(()=>{const pending=target,position=point;cancel();if(!disposed&&valid(pending))show(pending,position);},TOOLTIP_HOVER_DELAY_MS);
        },
        cancel,
        dispose(){disposed=true;cancel();}
    };
}
