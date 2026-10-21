import { worldToClientMap, formatWorldLocationForPlayer } from './coordinate-system.js';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mapBounds(lines) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const line of lines || []) for (const index of [0,3]) { minX=Math.min(minX,line[index]);maxX=Math.max(maxX,line[index]);minY=Math.min(minY,line[index+1]);maxY=Math.max(maxY,line[index+1]); }
    return Number.isFinite(minX) ? {minX,minY,maxX,maxY} : {minX:-500,minY:-500,maxX:500,maxY:500};
}
export function mountMapOverlay({ root, bridge, getSession, document = globalThis.document } = {}) {
    if (!root) return {render(){},dispose(){}};
    root.innerHTML = `<style>.native-map{height:100%;display:flex;flex-direction:column;min-height:0}.native-map-tools{display:flex;gap:5px;align-items:center;font-size:11px;padding:2px 0 6px}.native-map-tools select{flex:1;min-width:0}.native-map-stage{position:relative;min-height:80px;flex:1;overflow:hidden;border:1px solid #ffffff14;border-radius:4px;touch-action:none}.native-map-stage canvas{display:block;width:100%;height:100%;cursor:grab}.native-map-stage canvas:active{cursor:grabbing}.native-map-message{position:absolute;inset:15px;pointer-events:none;color:#a6b4c8;font-size:12px;line-height:1.5}.native-map-note{font-size:10px;color:#9ba8b8;padding:5px 0 1px}.native-map-route{color:#e8d18b;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.native-map-tools button{font-size:11px;padding:2px 5px}</style><div class="native-map"><div class="native-map-tools"><button data-map-action="fit" title="Fit zone">Fit</button><button data-map-action="reload" title="Reload local map">↻</button><button data-map-action="follow" aria-pressed="true">Follow</button><button data-map-action="zoom-in" aria-label="Zoom in">+</button><button data-map-action="zoom-out" aria-label="Zoom out">−</button><select data-map-floors aria-label="Map floor"><option value="all">All floors</option><option value="near">Near my Z</option></select><button data-map-action="open" title="Open complete Map Explorer">↗</button></div><div class="native-map-stage"><canvas aria-label="Current zone map"></canvas><div class="native-map-message"></div></div><div class="native-map-route"></div><div class="native-map-note"></div></div>`;
    const $=selector=>root.querySelector(selector), canvas=$('canvas'),context=canvas.getContext('2d');
    let data=null,session={},zone='',dataVersion=null,generation=0,disposed=false,follow=true,floor='all',zoom=1,center={x:0,y:0},baseScale=1,drag=null,markers=[];
    const listeners=[];
    const listen=(node,event,callback,options)=>{node.addEventListener(event,callback,options);listeners.push(()=>node.removeEventListener(event,callback,options));};
    function fit() {
        const bounds=mapBounds(data?.lines);center={x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2};
        const rect=canvas.getBoundingClientRect();baseScale=Math.min(rect.width/Math.max(1,bounds.maxX-bounds.minX+80),rect.height/Math.max(1,bounds.maxY-bounds.minY+80));zoom=1;
    }
    const screen=(point,width,height)=>({x:(point.x-center.x)*baseScale*zoom+width/2,y:(point.y-center.y)*baseScale*zoom+height/2});
    function draw() {
        if(disposed||!context)return;
        const rect=canvas.getBoundingClientRect(),width=rect.width,height=rect.height,dpr=globalThis.devicePixelRatio||1;
        if(!width||!height)return;
        if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
        context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);context.fillStyle='#080f19';context.fillRect(0,0,width,height);
        const map=session.map||{},player=map.location?worldToClientMap(map.location):null;
        if(follow&&player)center={x:player.x,y:player.y};
        const onFloor=z=>floor==='all'||!player||Math.abs(z-player.z)<=30;
        context.lineWidth=1;
        for(const line of data?.lines||[]){if(!onFloor((line[2]+line[5])/2))continue;const a=screen({x:line[0],y:line[1]},width,height),b=screen({x:line[3],y:line[4]},width,height);if((a.x<0&&b.x<0)||(a.x>width&&b.x>width)||(a.y<0&&b.y<0)||(a.y>height&&b.y>height))continue;context.strokeStyle=line[6]+line[7]+line[8]<90?'#8a98ac':`rgb(${line[6]},${line[7]},${line[8]})`;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}
        context.font='10px Segoe UI';context.fillStyle='#8595aa';
        for(const label of data?.labels||[]){if(!onFloor(label.z))continue;const point=screen(label,width,height);if(point.x>=0&&point.x<=width&&point.y>=0&&point.y<=height)context.fillText(label.label,point.x+3,point.y-3);}
        if(map.route?.points?.length>1){context.strokeStyle='#f0d77f';context.lineWidth=3;context.beginPath();map.route.points.forEach((p,index)=>{const point=screen(worldToClientMap(p),width,height);if(index)context.lineTo(point.x,point.y);else context.moveTo(point.x,point.y);});context.stroke();}
        markers=[];context.font='11px Segoe UI';
        for(const npc of map.npcs||[]){if(!Array.isArray(npc.loc)||npc.loc.length<2)continue;const world={x:npc.loc[0],y:npc.loc[1],z:npc.loc[2]||0};if(!onFloor(world.z))continue;const point=screen(worldToClientMap(world),width,height);if(point.x<0||point.x>width||point.y<0||point.y>height)continue;const selected=map.selectedNpcId===npc.id;context.fillStyle=npc.raidInstance?'#e79b9b':selected?'#fff0ad':'#d8b75c';context.beginPath();context.arc(point.x,point.y,selected?5:3,0,Math.PI*2);context.fill();context.fillText(npc.name,point.x+6,point.y-4);markers.push({...npc,screen:point});}
        if(player){const point=screen(player,width,height);context.fillStyle='#77d8f1';context.strokeStyle='#07101a';context.lineWidth=2;context.beginPath();context.arc(point.x,point.y,5,0,Math.PI*2);context.fill();context.stroke();}
        $('.native-map-message').textContent=!zone?'Waiting for a logged zone.':!data? 'Loading local map…':data.status!=='ready'?data.message||'No map line data.':!player?'Type /loc in game to show your position.':'';
        $('.native-map-route').textContent=map.route?.message||map.selectedNpcName||'';
        $('.native-map-note').textContent=[data?.sourceLabel,player?formatWorldLocationForPlayer(map.location,1):'',map.location?.at&&Date.now()-map.location.at>15000?'Last logged position':''].filter(Boolean).join(' · ');
    }
    async function load(nextZone){const owner=++generation;data=null;draw();try{const result=await bridge.action('session:map-data',{zone:nextZone});if(disposed||owner!==generation)return;data=result;fit();draw();}catch(error){if(disposed||owner!==generation)return;data={status:'error',message:error.message||'Unable to load this map.',lines:[],labels:[]};draw();}}
    function render(next){session=next||getSession?.()||{};const nextZone=session.map?.zone||session.zone||'',nextVersion=session.map?.dataVersion??0;if(nextZone!==zone||nextVersion!==dataVersion){zone=nextZone;dataVersion=nextVersion;data=null;zoom=1;generation++;if(zone)void load(zone);}draw();}
    listen(root,'click',event=>{const action=event.target.closest?.('[data-map-action]')?.dataset.mapAction;if(!action)return;if(action==='reload'&&zone)void load(zone);if(action==='fit'){follow=false;fit();}if(action==='follow')follow=!follow;if(action==='zoom-in')zoom=Math.min(40,zoom*1.4);if(action==='zoom-out')zoom=Math.max(.25,zoom/1.4);if(action==='open')void bridge.action('session:open',{view:'map'});$('[data-map-action="follow"]').setAttribute('aria-pressed',String(follow));draw();});
    listen($('[data-map-floors]'),'change',event=>{floor=event.target.value;draw();});
    listen(canvas,'wheel',event=>{event.preventDefault();zoom=Math.max(.25,Math.min(40,zoom*(event.deltaY<0?1.2:1/1.2)));draw();},{passive:false});
    listen(canvas,'pointerdown',event=>{drag={x:event.clientX,y:event.clientY,center:{...center},moved:false};canvas.setPointerCapture?.(event.pointerId);});
    listen(canvas,'pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){follow=false;center={x:drag.center.x-dx/(baseScale*zoom),y:drag.center.y-dy/(baseScale*zoom)};draw();}});
    listen(canvas,'pointerup',event=>{if(!drag)return;if(!drag.moved){const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const npc=markers.find(marker=>Math.hypot(marker.screen.x-x,marker.screen.y-y)<Math.max(12,marker.name.length*3));if(npc)void bridge.action('session:select-npc',{npc:npc.name,zone,raidInstance:!!npc.raidInstance});}drag=null;});
    const observer=globalThis.ResizeObserver?new ResizeObserver(()=>{if(data){fit();draw();}}):null;observer?.observe(canvas);
    render(getSession?.());
    return {render,dispose(){disposed=true;generation++;listeners.forEach(remove=>remove());observer?.disconnect();}};
}
