import { worldToClientMap, formatWorldLocationForPlayer } from './coordinate-system.js';
import { mountMapOverlay3D } from './map-overlay-3d.js';
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function mapBounds(lines) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for (const line of lines || []) for (const index of [0,3]) { minX=Math.min(minX,line[index]);maxX=Math.max(maxX,line[index]);minY=Math.min(minY,line[index+1]);maxY=Math.max(maxY,line[index+1]); }
    return Number.isFinite(minX) ? {minX,minY,maxX,maxY} : {minX:-500,minY:-500,maxX:500,maxY:500};
}
export const knownMapZ = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
export const loggedMapSliceCenter=(autoZ,current,location)=>autoZ&&knownMapZ(location?.z)?Number(location.z):current;
// Hate's high ceiling obscures its playable floor in an unfiltered initial
// view. This is a presentation default, never a change to source/collision data.
export function defaultMapSliceCenter(zone, viewerZone = '') {
    const identity = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return [zone, viewerZone].some(value => ['planeofhate', 'hateplane'].includes(identity(value))) ? 120 : null;
}
export function mapElevationBounds(lines = [],npcs = [],location = null) {
    let low=Infinity,high=-Infinity;
    const include=value=>{if(knownMapZ(value)){low=Math.min(low,Number(value));high=Math.max(high,Number(value));}};
    for(const line of lines){include(line[2]);include(line[5]);}for(const npc of npcs)include(npc.loc?.[2]);include(location?.z);
    const min = Number.isFinite(low) ? Math.floor(low) : -1,max = Number.isFinite(high) ? Math.ceil(high) : 1;
    return min === max ? {min:min-1,max:max+1} : {min,max};
}
export const mapSliceContainsZ = (z,center,tolerance = 25) => !knownMapZ(z) || Math.abs(Number(z)-center)<=tolerance;
export function clipMapSegmentToSlice(start,end,center,tolerance = 25) {
    if (!knownMapZ(start.z) || !knownMapZ(end.z)) return [start,end];
    const from = Number(start.z),to = Number(end.z),delta = to-from;
    if (!delta) return mapSliceContainsZ(from,center,tolerance) ? [start,end] : null;
    const crossings = [(center-tolerance-from)/delta,(center+tolerance-from)/delta].sort((a,b)=>a-b);
    const low = Math.max(0,crossings[0]),high = Math.min(1,crossings[1]);
    if (low>high) return null;
    const at = t => ({x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t,z:from+delta*t});
    return [at(low),at(high)];
}
const normalizedLabel = value => String(value || '').normalize('NFKC').replace(/_/g,' ').replace(/’/g,"'").replace(/\s+/g,' ').trim().toLocaleLowerCase();
const overlaps = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
// Screen-space labels are expendable; source markers and their hit targets are
// not. Reserve selected names first, then try alternate quadrants around each
// remaining anchor instead of painting text on top of another name or marker.
export function layoutMapLabels({npcs = [],npcNames = npcs.map(npc => npc.name),labels = [],width,height,measureText = text => String(text).length*6,blocked = [],fontScale = 1} = {}) {
    const names = new Set(npcNames.map(normalizedLabel).filter(Boolean));
    const occupied = [...blocked,...npcs.map(npc => ({x:npc.screen.x-6,y:npc.screen.y-6,width:12,height:12}))];
    const placed = {npcs:[],labels:[]};
    const candidates = [...npcs.map((npc,index) => ({...npc,text:String(npc.name || ''),kind:'npcs',index})).sort((a,b) => Number(Boolean(b.selected))-Number(Boolean(a.selected))),
        ...labels.filter(label => !names.has(normalizedLabel(label.label))).map((label,index) => ({...label,text:String(label.label || ''),kind:'labels',index}))];
    for (const candidate of candidates) {
        const point = candidate.screen;
        if (!candidate.text || !point || point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
        const textWidth = Math.ceil(measureText(candidate.text,candidate.kind)),textHeight = Math.ceil((candidate.kind === 'npcs' ? 13 : 12)*Math.max(.5,Math.min(3,Number(fontScale)||1)));
        const positions = [[point.x+8,point.y-6-textHeight],[point.x-textWidth-8,point.y+6],[point.x+8,point.y+6],[point.x-textWidth-8,point.y-6-textHeight]];
        const first = candidate.selected ? 0 : candidate.index%positions.length;
        for (let offset=0;offset<positions.length;offset++) {
            const [x,y] = positions[(first+offset)%positions.length],box = {x:x-2,y:y-1,width:textWidth+4,height:textHeight+2};
            if (box.x < 1 || box.y < 1 || box.x+box.width > width-1 || box.y+box.height > height-1 || occupied.some(other => overlaps(box,other))) continue;
            occupied.push(box); placed[candidate.kind].push({...candidate,x,y,width:textWidth,height:textHeight}); break;
        }
    }
    return placed;
}
export const NATIVE_MAP_MODES = ['map','top','first'];
export const nextNativeMapMode = mode => NATIVE_MAP_MODES[(NATIVE_MAP_MODES.indexOf(mode)+1)%NATIVE_MAP_MODES.length];
export const mapNpcKey = npc => String(npc.id || JSON.stringify([npc.name,Boolean(npc.raidInstance)]));
export function mapNpcHitTargets(markers = [],placedLabels = []) {
    const labels = new Map(placedLabels.map(label => [mapNpcKey(label),label]));
    return markers.map(marker => {
        const label = labels.get(mapNpcKey(marker));
        return {marker,label:label ? {x:label.x-2,y:label.y-1,width:label.width+4,height:label.height+2} : null};
    });
}
export function hitMapNpc(point,targets = []) {
    if (!point || ![point.x,point.y].every(Number.isFinite)) return null;
    const names = targets.filter(({label}) => label && point.x>=label.x && point.x<=label.x+label.width && point.y>=label.y && point.y<=label.y+label.height);
    const hits = names.length ? names : targets.filter(({marker}) => Math.hypot(marker.screen.x-point.x,marker.screen.y-point.y)<=12);
    hits.sort((a,b) => Math.hypot(a.marker.screen.x-point.x,a.marker.screen.y-point.y)-Math.hypot(b.marker.screen.x-point.x,b.marker.screen.y-point.y) ||
        Number(Boolean(b.marker.selected))-Number(Boolean(a.marker.selected)));
    return hits[0]?.marker || null;
}
export function mountMapOverlay({ root, bridge, getSession, document = globalThis.document } = {}) {
    if (!root) return {render(){},setVisible(){},dispose(){}};
    root.innerHTML = `<style>
.native-map{height:100%;display:flex;flex-direction:column;min-height:0}
.native-map-header{display:grid!important;grid-template-columns:12px minmax(28px,1fr) auto max(18px,calc(18px * var(--font-scale)));grid-template-rows:minmax(max(36px,calc(28px * var(--font-scale))),auto) auto;column-gap:4px;row-gap:0;height:auto!important;min-height:36px!important;outline-offset:-1px;-webkit-app-region:no-drag!important}
.native-map-header .native-map-title{grid-column:2;grid-row:1;min-width:0;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:max(36px,calc(28px * var(--font-scale)));-webkit-app-region:no-drag}
.native-map-drag-grip{grid-column:1;grid-row:1;display:block;width:12px;height:28px;line-height:28px;text-align:center;color:#8d9aa9;cursor:grab;-webkit-app-region:drag}
.is-locked .native-map-drag-grip{opacity:.35;cursor:default;-webkit-app-region:no-drag}
.native-map-header>.hover-menu{grid-column:4;grid-row:1;align-self:center;margin:0}
.native-map-tools{grid-column:3;grid-row:1;display:flex;flex-wrap:nowrap;gap:3px;align-items:center;min-width:0;max-width:0;visibility:hidden;opacity:0;overflow:hidden;pointer-events:none;padding:0;font-size:calc(11px * var(--font-scale,1));-webkit-app-region:no-drag}
.native-map-header:is(:hover,:focus-visible,.is-controls-open) .native-map-tools,.native-map-header:has(:focus-visible) .native-map-tools{max-width:min(250px,calc(100vw - 78px - 18px * max(1,var(--font-scale))));visibility:visible;opacity:1;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;pointer-events:auto}
.native-map-tools::-webkit-scrollbar{display:none}
.native-map-tools::after{content:"";flex:0 0 6px;height:1px}
.native-map [hidden]{display:none!important}
.native-map-tools button{flex:0 0 auto;min-width:20px;font-size:calc(11px * var(--font-scale,1));line-height:calc(18px * var(--font-scale));padding:1px 3px;white-space:nowrap}.native-map-tools>[data-map-action=mode]{min-width:30px;max-width:max(78px,5.5em);overflow:hidden;text-overflow:ellipsis}
.native-map-slice{grid-column:1/-1;grid-row:2;display:flex;align-items:center;gap:5px;min-width:0;max-height:0;visibility:hidden;opacity:0;overflow:hidden;pointer-events:none;font-size:calc(11px * var(--font-scale,1));-webkit-app-region:no-drag}
.native-map-header:is(:hover,:focus-visible,.is-controls-open) .native-map-slice,.native-map-header:has(:focus-visible) .native-map-slice{max-height:max(34px,calc(28px * var(--font-scale)));visibility:visible;opacity:1;overflow:visible;pointer-events:auto;padding:0 0 5px}
.native-map-slice input[type=range]{flex:1;min-width:40px;accent-color:#d8b75c}.native-map-slice output{font-size:calc(10px * var(--font-scale,1));min-width:72px;color:#d8c895;white-space:nowrap}.native-map-slice label{display:flex;align-items:center;gap:3px;color:#9ba8b8}.native-map-slice input[type=number]{width:46px;padding:2px 3px;font-size:calc(10px * var(--font-scale,1))}
.native-map-slice button{flex:0 0 auto;font:inherit;padding:2px 4px;white-space:nowrap}.native-map-slice button[aria-pressed=true]{color:#f0d77f;border-color:#c9ae60;background:#4b421f}
@media(max-width:360px){.native-map-tools{gap:2px}.native-map-tools button{font-size:calc(10px * var(--font-scale,1));padding:1px 2px}.native-map-tools>[data-map-action=mode]{max-width:48px}.native-map-header .native-map-title{font-size:calc(11px * var(--font-scale,1))}}
.native-map-stage{position:relative;min-height:0;flex:1;overflow:hidden;border:1px solid #ffffff14;border-radius:4px;touch-action:none}.native-map-stage canvas{display:block;width:100%;height:100%;cursor:grab}.native-map-stage canvas:active{cursor:grabbing}
.native-map-3d-stage{position:absolute;inset:0;min-height:0}.native-map-3d-stage iframe{width:100%;height:100%;border:0}
.native-map-message{position:absolute;inset:15px;pointer-events:none;color:#a6b4c8;font-size:calc(12px * var(--font-scale,1));line-height:1.5}
.native-map-note,.native-map-3d-status,.native-map-action-status{font-size:calc(10px * var(--font-scale,1));color:#9ba8b8;padding:5px 0 1px;overflow-wrap:anywhere;flex:0 0 auto}.native-map-3d-status:empty,.native-map-action-status:empty{display:none}.native-map-route{color:#e8d18b;font-size:calc(11px * var(--font-scale,1));overflow-wrap:anywhere;flex:0 0 auto}
.native-map-npc-links{position:absolute;inset:0;pointer-events:none}.native-map-npc-link{position:absolute;opacity:0;pointer-events:none;padding:0!important;border:0!important;font:calc(11px * var(--font-scale)) var(--ui-font-family,"Segoe UI",sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.native-map-npc-link:focus-visible{opacity:1;background:#101722!important;color:#fff0ad;outline:1px solid #f0d77f;min-width:24px;width:max-content!important;max-width:100%;z-index:2}
</style><div class="native-map"><div class="native-map-local-header"><div class="native-map-tools" role="toolbar" aria-label="Map controls"><button data-map-action="reset" title="Reset to Map, follow player, default zoom and Z slice">Reset</button><button data-map-action="follow" aria-pressed="true">Follow</button><button data-map-action="zoom-in" aria-label="Zoom in">+</button><button data-map-action="zoom-out" aria-label="Zoom out">−</button><button data-map-action="mode" aria-label="Map view: Map; switch to Top 3D">Map</button><div class="native-map-slice"><output data-map-slice-label for="native-map-z">Z ±25</output><input id="native-map-z" data-map-z type="range" min="-1" max="1" step="1" value="0" aria-label="Map Z slice"><label title="Show known elevations within this distance of the selected Z">± <input data-map-tolerance type="number" min="1" max="250" step="1" value="25" aria-label="Map Z tolerance"></label></div></div></div><div class="native-map-stage"><canvas aria-label="Current zone map"></canvas><div class="native-map-npc-links" role="group" aria-label="Named map destinations"></div><div class="native-map-3d-stage" hidden></div><div class="native-map-message"></div></div><div class="native-map-route"></div><div class="native-map-note"></div><div class="native-map-3d-status" role="status"></div></div>`;
    const tools=root.querySelector('.native-map-tools'),slice=tools.querySelector('.native-map-slice');
    const $=selector=>root.querySelector(selector)||tools.querySelector(selector)||slice.querySelector(selector),canvas=$('canvas'),context=canvas.getContext('2d');
    const shell=root.closest?.('.overlay-shell') || root;
    const outerHeader=shell.querySelector?.('#overlay-header');
    const header=outerHeader || $('.native-map-local-header');
    const title=header.querySelector('#overlay-title')||document.createElement('span');
    const previousTabindex=header.getAttribute('tabindex'),previousLabel=header.getAttribute('aria-label'),previousTitle=title.getAttribute('title');
    header.classList.add('native-map-header');header.tabIndex=0;header.setAttribute('aria-label','Map window; hover the zone title or focus this header for map controls');shell.classList.add('native-map-host');title.classList.add('native-map-title');
    if(!outerHeader){title.textContent='Map';header.prepend(title);}
    const dragGrip=document.createElement('span');dragGrip.className='native-map-drag-grip';dragGrip.textContent='⠿';dragGrip.title='Drag Map window when unlocked';dragGrip.setAttribute('aria-hidden','true');header.prepend(dragGrip);
    if(outerHeader){outerHeader.insertBefore(tools,outerHeader.querySelector('.hover-menu'));$('.native-map-local-header').hidden=true;}
    header.append(slice);
    for(const button of tools.querySelectorAll('button'))if(!button.title)button.title=button.getAttribute('aria-label')||button.textContent;
    const actionStatus=document.createElement('div');actionStatus.className='native-map-action-status';actionStatus.setAttribute('role','status');$('.native-map').append(actionStatus);
    const autoZButton=document.createElement('button');autoZButton.type='button';autoZButton.textContent='Auto Z';autoZButton.dataset.mapAutoZ='1';autoZButton.setAttribute('aria-label','Follow logged player elevation automatically');slice.insertBefore(autoZButton,slice.firstChild);
    let data=null,session={},zone='',dataVersion=null,generation=0,disposed=false,follow=true,autoZ=true,lastKnownPlayerZ=null,sliceCenter=null,sliceTolerance=25,zoom=1,center={x:0,y:0},baseScale=1,drag=null,targets=[],mode='map',three=null,threeMode=null,modeSerial=0,visible=true,lastFocus='',pendingFocus=null;
    const listeners=[],npcButtons=new Map();let headerCloseTimer=null;
    const listen=(node,event,callback,options)=>{node.addEventListener(event,callback,options);listeners.push(()=>node.removeEventListener(event,callback,options));};
    const headerKeyboardFocus=()=>header.matches(':focus-visible')||Boolean(header.querySelector(':focus-visible'));
    const revealHeader=()=>{clearTimeout(headerCloseTimer);headerCloseTimer=null;header.classList.add('is-controls-open');};
    const deferHeaderClose=()=>{clearTimeout(headerCloseTimer);headerCloseTimer=setTimeout(()=>{headerCloseTimer=null;if(!disposed&&!header.matches(':hover')&&!headerKeyboardFocus())header.classList.remove('is-controls-open');},180);};
    listen(header,'pointerenter',revealHeader);listen(header,'pointerleave',deferHeaderClose);listen(header,'focusin',()=>{if(headerKeyboardFocus())revealHeader();});listen(header,'focusout',event=>{if(!header.contains(event.relatedTarget))deferHeaderClose();});
    const modes={map:'Map',top:'Top 3D',first:'First Person'};
    const activeSlice=()=>{const elevations=mapElevationBounds(data?.lines,session.map?.npcs,session.map?.location);return sliceCenter??(elevations.min+elevations.max)/2;};
    const isVisible=()=>visible&&!document.hidden;
    // A focus request belongs to one camera action. Snapshots retain it for
    // other consumers, so never replay an already consumed request into a new
    // iframe after Reset, a manual mode change, or a hidden-window restore.
    const sessionFor3D=()=>({...session,map:{...session.map,focus:pendingFocus}});
    function fit({resetZoom=true,resetCenter=true}={}) {
        const bounds=mapBounds(data?.lines);
        if(resetCenter)center={x:(bounds.minX+bounds.maxX)/2,y:(bounds.minY+bounds.maxY)/2};
        const rect=canvas.getBoundingClientRect();baseScale=Math.min(rect.width/Math.max(1,bounds.maxX-bounds.minX+80),rect.height/Math.max(1,bounds.maxY-bounds.minY+80));
        if(resetZoom)zoom=1;
    }
    function release3D(){modeSerial++;three?.dispose();three=null;threeMode=null;$('.native-map-3d-status').textContent='';}
    function update3D(){
        canvas.hidden=mode!=='map';$('.native-map-npc-links').hidden=mode!=='map';$('.native-map-message').hidden=mode!=='map';$('.native-map-3d-stage').hidden=mode==='map';
        if(mode==='map'||!isVisible()){if(three)release3D();return;}
        if(!three)three=mountMapOverlay3D({root:$('.native-map-3d-stage'),getSession:sessionFor3D,onStatus:message=>{if(!disposed)$('.native-map-3d-status').textContent=String(message||'');},onSelectNpc:selectNpc,onFocusApplied:(focus,result)=>{if(pendingFocus?.sequence!==focus?.sequence||pendingFocus?.zone!==focus?.zone)return;pendingFocus=null;if(knownMapZ(result?.cameraFloorZ)){sliceCenter=Number(result.cameraFloorZ);draw();}},onFollowChange:value=>{follow=Boolean(value);$('[data-map-action="follow"]').setAttribute('aria-pressed',String(follow));}});
        three.render(sessionFor3D());three.setFollow?.(follow);three.setSlice?.({center:activeSlice(),tolerance:sliceTolerance});
        if(threeMode!==mode){threeMode=mode;const owner=++modeSerial;void Promise.resolve(three.setMode(mode)).catch(()=>{if(!disposed&&owner===modeSerial)$('.native-map-3d-status').textContent='This 3D view is unavailable. Choose Map or check the selected game folder.';});}
    }
    function setMode(next){const previous=mode;mode=NATIVE_MAP_MODES.includes(next)?next:'map';const button=$('[data-map-action="mode"]');button.textContent=modes[mode];button.setAttribute('aria-label',`Map view: ${modes[mode]}; switch to ${modes[nextNativeMapMode(mode)]}`);button.title=button.getAttribute('aria-label');if(mode==='map'&&previous!==mode){update3D();fit({resetZoom:false,resetCenter:false});}draw();}
    async function selectNpc(npc){if(!npc)return;actionStatus.textContent='';try{await bridge.action('session:select-npc',{id:npc.id,npc:npc.name,zone:npc.zone||zone,raidInstance:!!npc.raidInstance});}catch(error){if(!disposed)actionStatus.textContent=error?.message||'This destination is no longer available. Choose a current map marker.';}}
    function renderNpcButtons(){
        const keys=new Set();
        for(const target of targets){const npc=target.marker,key=mapNpcKey(npc);keys.add(key);let button=npcButtons.get(key);
            if(!button){button=document.createElement('button');button.type='button';button.className='native-map-npc-link';button.dataset.mapNpc=key;npcButtons.set(key,button);$('.native-map-npc-links').append(button);}
            const box=target.label||{x:npc.screen.x-12,y:npc.screen.y-12,width:24,height:24};
            button.textContent=npc.name;button.setAttribute('aria-label',`${npc.name}${npc.raidInstance?' · Raid Zone':' · Normal Zone'}; select destination`);button.setAttribute('aria-pressed',String(Boolean(npc.selected)));
            Object.assign(button.style,{left:`${box.x}px`,top:`${box.y}px`,width:`${box.width}px`,height:`${box.height}px`});
        }
        for(const [key,button]of npcButtons)if(!keys.has(key)){button.remove();npcButtons.delete(key);}
    }
    const screen=(point,width,height)=>({x:(point.x-center.x)*baseScale*zoom+width/2,y:(point.y-center.y)*baseScale*zoom+height/2});
    function draw(){
        if(disposed)return;
        title.title=title.textContent||'Map';
        $('[data-map-action="follow"]').setAttribute('aria-pressed',String(follow));
        const map=session.map||{},player=map.location?worldToClientMap(map.location):null,elevations=mapElevationBounds(data?.lines,map.npcs,map.location);
        if(knownMapZ(map.location?.z))lastKnownPlayerZ=Number(map.location.z);
        sliceCenter=loggedMapSliceCenter(autoZ,sliceCenter,{z:lastKnownPlayerZ});autoZButton.setAttribute('aria-pressed',String(autoZ));autoZButton.title=autoZ?'Follow the latest known logged player Z; unknown height keeps the current slice.':'Manual Z slice. Enable Auto Z to follow your latest known elevation.';
        if(sliceCenter===null&&(knownMapZ(map.location?.z)||data?.status==='ready'))sliceCenter=knownMapZ(map.location?.z)?Number(map.location.z):(elevations.min+elevations.max)/2;
        const activeZ=activeSlice(),zInput=$('[data-map-z]');zInput.min=String(Math.min(elevations.min,Math.floor(activeZ)));zInput.max=String(Math.max(elevations.max,Math.ceil(activeZ)));zInput.value=String(activeZ);
        const sliceText=`Z ${Number(activeZ.toFixed(1))} ±${sliceTolerance}`;$('[data-map-slice-label]').textContent=sliceText;zInput.setAttribute('aria-valuetext',sliceText);zInput.title='Approximate floor slice; mobs without a known Z stay visible';
        $('.native-map-route').textContent=map.route?.message||map.selectedNpcName||'';
        $('.native-map-note').textContent=[data?.sourceLabel,player?formatWorldLocationForPlayer(map.location,1):'',map.location?.at&&Date.now()-map.location.at>15000?'Last logged position':''].filter(Boolean).join(' · ');
        update3D();if(mode!=='map'||!context)return;
        const rect=canvas.getBoundingClientRect(),width=rect.width,height=rect.height,dpr=globalThis.devicePixelRatio||1;if(!width||!height)return;
        if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
        context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);context.fillStyle='#080f19';context.fillRect(0,0,width,height);
        if(follow&&player)center={x:player.x,y:player.y};const onFloor=z=>mapSliceContainsZ(z,activeZ,sliceTolerance);context.lineWidth=1;
        for(const line of data?.lines||[]){const clipped=clipMapSegmentToSlice({x:line[0],y:line[1],z:line[2]},{x:line[3],y:line[4],z:line[5]},activeZ,sliceTolerance);if(!clipped)continue;const a=screen(clipped[0],width,height),b=screen(clipped[1],width,height);if((a.x<0&&b.x<0)||(a.x>width&&b.x>width)||(a.y<0&&b.y<0)||(a.y>height&&b.y>height))continue;context.strokeStyle=line[6]+line[7]+line[8]<90?'#8a98ac':`rgb(${line[6]},${line[7]},${line[8]})`;context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}
        if(map.route?.points?.length>1){context.strokeStyle='#f0d77f';context.lineWidth=3;for(let index=1;index<map.route.points.length;index++){const clipped=clipMapSegmentToSlice(map.route.points[index-1],map.route.points[index],activeZ,sliceTolerance);if(!clipped)continue;const a=screen(worldToClientMap(clipped[0]),width,height),b=screen(worldToClientMap(clipped[1]),width,height);context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.stroke();}}
        const computed=document.defaultView.getComputedStyle(canvas),fontScale=Number.parseFloat(document.defaultView.getComputedStyle(document.documentElement).getPropertyValue('--font-scale'))||1;
        const npcFont=`${11*fontScale}px ${computed.fontFamily}`,labelFont=`${10*fontScale}px ${computed.fontFamily}`;
        const markers=[];context.font=npcFont;
        for(const npc of map.npcs||[]){if(!Array.isArray(npc.loc)||npc.loc.length<2||!onFloor(npc.loc[2]))continue;const point=screen(worldToClientMap({x:npc.loc[0],y:npc.loc[1]}),width,height);if(point.x<0||point.x>width||point.y<0||point.y>height)continue;const selected=map.selectedNpcId===npc.id;context.fillStyle=npc.raidInstance?'#e79b9b':selected?'#fff0ad':'#d8b75c';context.beginPath();context.arc(point.x,point.y,selected?5:3,0,Math.PI*2);context.fill();markers.push({...npc,screen:point,selected});}
        const playerScreen=player?screen(player,width,height):null;
        const placed=layoutMapLabels({npcs:markers,npcNames:(map.npcs||[]).map(npc=>npc.name),labels:(data?.labels||[]).filter(label=>onFloor(label.z)).map(label=>({...label,screen:screen(label,width,height)})),width,height,fontScale,blocked:playerScreen?[{x:playerScreen.x-7,y:playerScreen.y-7,width:14,height:14}]:[],measureText:(text,kind)=>{context.font=kind==='npcs'?npcFont:labelFont;return context.measureText(text).width;}});
        context.textBaseline='top';for(const label of placed.labels){context.font=labelFont;context.fillStyle='#8595aa';context.fillText(label.text,label.x,label.y);}for(const label of placed.npcs){context.font=npcFont;context.fillStyle=label.raidInstance?'#e79b9b':label.selected?'#fff0ad':'#d8b75c';context.fillText(label.text,label.x,label.y);}context.textBaseline='alphabetic';
        targets=mapNpcHitTargets(markers,placed.npcs);renderNpcButtons();
        if(player){const point=screen(player,width,height);context.fillStyle='#77d8f1';context.strokeStyle='#07101a';context.lineWidth=2;context.beginPath();context.arc(point.x,point.y,5,0,Math.PI*2);context.fill();context.stroke();}
        $('.native-map-message').textContent=!zone?'Waiting for a logged zone.':!data?'Loading local map…':data.status!=='ready'?data.message||'No map line data.':!player?'Type /loc in game to show your position.':'';
    }
    async function load(nextZone){const owner=++generation;data=null;draw();try{const result=await bridge.action('session:map-data',{zone:nextZone});if(disposed||owner!==generation)return;data=result;fit();draw();}catch(error){if(disposed||owner!==generation)return;data={status:'error',message:error.message||'Unable to load this map.',lines:[],labels:[]};draw();}}
    function render(next){session=next||getSession?.()||{};const nextZone=session.map?.zone||session.zone||'',nextVersion=session.map?.dataVersion??0;
        if(nextZone!==zone||nextVersion!==dataVersion){const changedZone=nextZone!==zone;zone=nextZone;dataVersion=nextVersion;data=null;targets=[];pendingFocus=null;lastKnownPlayerZ=null;if(changedZone){zoom=1;autoZ=true;sliceCenter=defaultMapSliceCenter(zone,session.map?.viewerZone);sliceTolerance=25;$('[data-map-tolerance]').value='25';}generation++;release3D();if(zone)void load(zone);}
        const focus=session.map?.focus;if(focus&&focus.zone===zone&&focus.sequence!==undefined){const key=JSON.stringify([zone,focus.sequence]);if(key!==lastFocus){lastFocus=key;pendingFocus=focus;follow=false;autoZ=false;if(knownMapZ(focus.loc?.[2]))sliceCenter=Number(focus.loc[2]);setMode('first');}}
        draw();
    }
    function reset(){pendingFocus=null;follow=true;autoZ=true;sliceCenter=defaultMapSliceCenter(zone,session.map?.viewerZone);sliceTolerance=25;$('[data-map-tolerance]').value='25';fit();setMode('map');}
    listen(tools,'click',event=>{const action=event.target.closest?.('[data-map-action]')?.dataset.mapAction;if(!action)return;event.stopPropagation();
        if(action==='reset')reset();if(action==='follow'){follow=!follow;three?.setFollow?.(follow);}if(action==='zoom-in'||action==='zoom-out'){const factor=action==='zoom-in'?1.4:1/1.4;if(mode==='map')zoom=Math.max(.25,Math.min(40,zoom*factor));else three?.zoomBy?.(factor);}if(action==='mode'){pendingFocus=null;setMode(nextNativeMapMode(mode));}draw();});
    listen(tools,'focusin',event=>{
        const button=event.target.closest?.('[data-map-action]');if(!button)return;
        const reveal=()=>{if(disposed||document.activeElement!==button)return;const area=tools.getBoundingClientRect(),bounds=button.getBoundingClientRect(),left=area.left+tools.clientLeft+2,right=area.left+tools.clientLeft+tools.clientWidth-2;const delta=bounds.right>right?Math.ceil(bounds.right-right):bounds.left<left?Math.floor(bounds.left-left):0;if(delta)tools.scrollLeft=Math.max(0,Math.min(tools.scrollWidth-tools.clientWidth,tools.scrollLeft+delta));};
        reveal();queueMicrotask(reveal);
    });
    listen(root,'click',event=>{const key=event.target.closest?.('[data-map-npc]')?.dataset.mapNpc;if(key)selectNpc(targets.find(target=>mapNpcKey(target.marker)===key)?.marker);});
    listen(autoZButton,'click',()=>{autoZ=!autoZ;draw();});
    listen($('[data-map-z]'),'input',event=>{autoZ=false;sliceCenter=Number(event.target.value);draw();});listen($('[data-map-tolerance]'),'change',event=>{sliceTolerance=Math.max(1,Math.min(250,Number(event.target.value)||25));event.target.value=String(sliceTolerance);draw();});
    listen(canvas,'wheel',event=>{event.preventDefault();zoom=Math.max(.25,Math.min(40,zoom*(event.deltaY<0?1.2:1/1.2)));draw();},{passive:false});
    const pointerPoint=event=>{const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};};
    listen(canvas,'pointerdown',event=>{drag={x:event.clientX,y:event.clientY,center:{...center},moved:false,target:hitMapNpc(pointerPoint(event),targets)};canvas.setPointerCapture?.(event.pointerId);});
    listen(canvas,'pointermove',event=>{if(drag){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){follow=false;center={x:drag.center.x-dx/(baseScale*zoom),y:drag.center.y-dy/(baseScale*zoom)};canvas.style.cursor='grabbing';draw();return;}}canvas.style.cursor=hitMapNpc(pointerPoint(event),targets)?'pointer':'grab';});
    listen(canvas,'pointerup',event=>{if(!drag)return;if(!drag.moved)selectNpc(drag.target);drag=null;canvas.style.cursor=hitMapNpc(pointerPoint(event),targets)?'pointer':'grab';});
    listen(canvas,'pointercancel',()=>{drag=null;canvas.style.cursor='grab';});listen(canvas,'pointerleave',()=>{if(!drag)canvas.style.cursor='grab';});
    listen(document,'visibilitychange',()=>{if(!isVisible())release3D();else update3D();});
    const observer=globalThis.ResizeObserver?new ResizeObserver(()=>{if(data&&mode==='map'){fit({resetZoom:false,resetCenter:false});draw();}}):null;observer?.observe($('.native-map-stage'));
    render(getSession?.());
    return {render,setVisible(value){visible=Boolean(value);if(!isVisible())release3D();else update3D();},dispose(){disposed=true;generation++;clearTimeout(headerCloseTimer);release3D();listeners.forEach(remove=>remove());observer?.disconnect();tools.remove();slice.remove();dragGrip.remove();header.classList.remove('native-map-header','is-controls-open');title.classList.remove('native-map-title');shell.classList.remove('native-map-host');if(previousTitle===null)title.removeAttribute('title');else title.setAttribute('title',previousTitle);if(previousLabel===null)header.removeAttribute('aria-label');else header.setAttribute('aria-label',previousLabel);if(previousTabindex===null)header.removeAttribute('tabindex');else header.setAttribute('tabindex',previousTabindex);}};
}
