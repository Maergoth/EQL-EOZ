import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-overlay-resize-'));
const workAreaIndex=process.argv.indexOf('--work-area'),workAreaMatch=workAreaIndex<0?null:/^(\d+)x(\d+)$/.exec(process.argv[workAreaIndex+1]||'');
if(workAreaIndex>=0&&(!workAreaMatch||Number(workAreaMatch[1])<1024||Number(workAreaMatch[2])<700))throw Error('--work-area requires WIDTHxHEIGHT, at least 1024x700');
const fixtureWorkArea=workAreaMatch?{width:Number(workAreaMatch[1]),height:Number(workAreaMatch[2])}:null;
const scaleIndex=process.argv.indexOf('--scale-factor'),scaleFactor=scaleIndex<0?null:Number(process.argv[scaleIndex+1]);
if(scaleIndex>=0&&(!Number.isFinite(scaleFactor)||scaleFactor<1||scaleFactor>3))throw Error('--scale-factor requires a number from 1 to 3');
async function run({root,temporary,fixtureWorkArea,scaleFactor}){
    const electron=require('electron'),{app,BrowserWindow}=electron,http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
    const {probeWin32HitTest}=require(path.join(root,'scripts/win32-hit-test-probe.cjs'));app.setPath('userData',path.join(temporary,'profile'));if(scaleFactor)app.commandLine.appendSwitch('force-device-scale-factor',String(scaleFactor));app.disableHardwareAcceleration();app.on('window-all-closed',()=>{});await app.whenReady();
    const primary=electron.screen.getPrimaryDisplay(),actualArea=primary.workArea;
    if(fixtureWorkArea)assert(actualArea.width>=fixtureWorkArea.width&&actualArea.height>=fixtureWorkArea.height,'The simulated work area must fit the actual primary monitor');
    const workArea=fixtureWorkArea?{x:actualArea.x,y:actualArea.y,...fixtureWorkArea}:actualArea;
    // Only the host display contract is constrained. Native windows, pointer
    // input and the physical OS display remain real and unchanged.
    const fixtureScreen=fixtureWorkArea?new Proxy(electron.screen,{get(target,key){if(key==='getAllDisplays')return()=>[{...primary,workArea}];const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}}):electron.screen;
    assert.ok(workArea.width>=900&&workArea.height>=600,'native resizing/docking fixture needs the supported minimum work area');
    const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<!doctype html><title>Synthetic resize controller</title>');return;}const pathname=new URL(req.url,'http://localhost').pathname,relative=pathname.slice(1);if(relative.includes('..')||!/^[-a-zA-Z0-9_/.]+$/.test(relative))throw Error('Invalid fixture path');res.setHeader('Content-Type',relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,'app',relative)));}catch{res.writeHead(404).end();}});await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const main=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});await main.loadURL(`${origin}/`);
    const {OverlayHost}=require(path.join(root,'desktop/overlay-host.cjs')),host=new OverlayHost({electron:{...electron,screen:fixtureScreen,Tray:class{constructor(){throw Error('No fixture tray');}},globalShortcut:{register:()=>true,unregister(){}}},origin,getMainWindow:()=>main,readPreferences:async()=>({panels:Object.fromEntries(['parse','map','intel','timers'].map((id,index)=>[id,{visible:true,locked:false,manualHeight:true,bounds:{x:100+index*300,y:100,width:280,height:id==='timers'?100:220}}]))}),writePreferences:async()=>{},warn:()=>{}});
    const execute=(win,fn,...args)=>win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`),wait=ms=>new Promise(done=>setTimeout(done,ms));
    const fixturePointer=async(win,point)=>execute(win,expected=>{
        if(!window.__fixturePointerGate){window.__fixturePointerGate=true;window.addEventListener('pointermove',event=>{
            const target=window.__fixturePointerTarget;if(!target||Math.abs(event.screenX-target.x)<=1&&Math.abs(event.screenY-target.y)<=1)return;
            // sendInputEvent does not move the physical OS cursor. A native
            // window translation can therefore inject a second trusted move
            // from that stationary cursor. Keep this fixture's two drivers
            // separate; never alter the real injected event or app handlers.
            window.__fixturePointerNoiseCount++;if(window.__fixturePointerNoise.length<20)window.__fixturePointerNoise.push({trusted:event.isTrusted,screenX:event.screenX,screenY:event.screenY,expected:{...target}});event.stopImmediatePropagation();
        },true);}
        if(expected&&!window.__fixturePointerTarget){window.__fixturePointerNoiseCount=0;window.__fixturePointerNoise=[];}
        window.__fixturePointerTarget=expected;return{count:window.__fixturePointerNoiseCount||0,events:window.__fixturePointerNoise||[]};
    },point);
    const until=async(fn,label)=>{for(let n=0;n<100;n++){if(await fn())return;await wait(30);}throw Error(label);};
    const seedResizeBounds=async(id,win,bounds)=>{
        // Fixture placement changes position and size together. X11 may emit
        // the move before the resize; treating that setup as a native drag
        // can persist/reapply the old size before the requested size arrives.
        // Match seedLayout below: guard only setup, then restore the real
        // handlers before any trusted pointer gesture is sent.
        const wasSync=host.dockingSync;host.cancelPanelMove(id);host.dockingSync=true;
        let changedAt=Date.now();const changed=()=>{changedAt=Date.now();};win.on('move',changed);win.on('resize',changed);
        try{
            host.preferences.panels[id].bounds={...bounds};host.apply(id);
            await until(async()=>{
                const current=win.getBounds(),saved=host.getState().panels[id].bounds;
                if(Date.now()-changedAt<350||!['x','y','width','height'].every(key=>Math.abs(current[key]-bounds[key])<=1&&Math.abs(saved[key]-current[key])<=1))return false;
                return execute(win,expected=>Math.abs(document.documentElement.clientWidth-expected.width)<=1&&Math.abs(document.documentElement.clientHeight-expected.height)<=1,current);
            },'native, saved and renderer bounds settle after fixture positioning');
        }finally{host.cancelPanelMove(id);win.off('move',changed);win.off('resize',changed);host.dockingSync=wasSync;}
    };
    const watchdog=setTimeout(()=>{console.error('Overlay resize/drag native watchdog');app.exit(1);},75000),results=[];
    try{
        await host.initialize();const cycles=[host.getState().globalMode];for(const expected of ['locked','hidden','unlocked']){await host.control('cycle-all');assert.equal(host.getState().globalMode,expected);cycles.push(expected);}for(const [id,win]of host.windows){
            await host.control('hide-all');await host.control('show',id);await host.control('lock',id,false);
            assert.deepEqual(Object.entries(host.getState().panels).filter(([,panel])=>panel.visible).map(([id])=>id),[id],'Each edge fixture has exactly one native magnet target');
            await until(()=>execute(win,()=>document.querySelectorAll('.overlay-resize-edge:not([hidden])').length===8).catch(()=>false),`${id} custom edges ready`);win.showInactive();await wait(50);
            const points=await execute(win,()=>[...document.querySelectorAll('.overlay-resize-edge')].map(handle=>{const rect=handle.getBoundingClientRect(),style=getComputedStyle(handle);return{edge:handle.dataset.resizeEdge,x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2),cursor:style.cursor,region:style.webkitAppRegion,parent:handle.parentElement.tagName};}));
            assert.equal(win.isResizable(),false,'unsupported transparent native sizing stays disabled');assert.equal(points.length,8);for(const point of points){assert.equal(point.parent,'BODY');assert.equal(point.region,'no-drag');assert.match(point.cursor,/resize$/);}
            let nativeHits=null;
            if(process.platform==='win32'){
                const bounds=win.getBounds(),handle=win.getNativeWindowHandle().readBigUInt64LE().toString();
                nativeHits=await probeWin32HitTest({handle,scope:id+'/edges',includeStyle:true,points:points.map(point=>({edge:point.edge,x:bounds.x+point.x,y:bounds.y+point.y}))});assert.equal(nativeHits.thickFrame,false);for(const hit of nativeHits.hits)assert.equal(hit.hit,1,`${id}/${hit.edge} is native client input, not a denied frame border`);
            }
            for(const edge of ['se','e','s','w','n','nw','ne','sw']){
                const requested={x:workArea.x+300,y:workArea.y+220,width:400,height:id==='timers'?120:260};try{await seedResizeBounds(id,win,requested);}catch(error){throw Error(`${id}/${edge}: ${error.message}; native=${JSON.stringify({bounds:win.getBounds(),contentBounds:win.getContentBounds(),minimum:win.getMinimumSize(),maximum:win.getMaximumSize(),ozone:app.commandLine.getSwitchValue('ozone-platform'),workAreas:fixtureScreen.getAllDisplays().map(display=>display.workArea),preferences:host.getState().panels})}; renderer=${JSON.stringify(await execute(win,()=>({width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,innerWidth,innerHeight,devicePixelRatio,handles:document.querySelectorAll('.overlay-resize-edge:not([hidden])').length})))}`);}
                await execute(win,()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
                const before=win.getBounds(),point=await execute(win,edge=>{const handle=document.querySelector(`[data-resize-edge="${edge}"]`),rect=handle.getBoundingClientRect();window.__resizeTrusted=false;window.__resizePointer=[];if(!window.__resizeTraceInstalled){window.__resizeTraceInstalled=true;for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,event=>{if(window.__resizePointer.length<20)window.__resizePointer.push({type,trusted:event.isTrusted,edge:event.target.dataset?.resizeEdge,screenX:event.screenX,screenY:event.screenY,clientX:event.clientX,clientY:event.clientY,pointerId:event.pointerId,viewport:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight}});},true);}handle.addEventListener('pointerdown',event=>{window.__resizeTrusted=event.isTrusted;},{once:true});return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)};},edge),dx=edge.includes('w')?-20:edge.includes('e')?20:0,dy=edge.includes('n')?-12:edge.includes('s')?12:0;
                const start={...point,globalX:before.x+point.x,globalY:before.y+point.y},moved={x:point.x+dx,y:point.y+dy,globalX:before.x+point.x+dx,globalY:before.y+point.y+dy};
                try{await fixturePointer(win,{x:start.globalX,y:start.globalY});win.webContents.sendInputEvent({type:'mouseMove',...start});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...start});await until(()=>execute(win,()=>document.body.classList.contains('is-resizing')&&window.__resizeTrusted),`${id}/${edge} trusted pointer starts`);await fixturePointer(win,{x:moved.globalX,y:moved.globalY});win.webContents.sendInputEvent({type:'mouseMove',...moved});
                await until(()=>{const bounds=win.getBounds();return Math.abs(bounds.width-before.width-Math.abs(dx))<=1&&Math.abs(bounds.height-before.height-Math.abs(dy))<=1&&Math.abs(bounds.x-before.x-Math.min(0,dx))<=1&&Math.abs(bounds.y-before.y-Math.min(0,dy))<=1;},`${id}/${edge} native bounds and opposite edge`);
                const after=win.getBounds();win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:moved.globalX-after.x,y:moved.globalY-after.y,globalX:moved.globalX,globalY:moved.globalY});await until(()=>execute(win,()=>!document.body.classList.contains('is-resizing')),'pointer capture released');
                await execute(win,()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
                }catch(error){throw Error(`${error.message}; native=${JSON.stringify({before,requested,expected:{x:before.x+Math.min(0,dx),y:before.y+Math.min(0,dy),width:before.width+Math.abs(dx),height:before.height+Math.abs(dy)},actual:win.getBounds(),content:win.getContentBounds(),start,moved,preferences:host.getState().panels,workArea,actualArea,scaleFactor})}; renderer=${JSON.stringify(await execute(win,()=>({events:window.__resizePointer,foreignPointerMoves:window.__fixturePointerNoise,active:document.body.classList.contains('is-resizing'),status:document.querySelector('#overlay-status')?.textContent,width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,innerWidth,innerHeight,devicePixelRatio})))}`);}finally{await fixturePointer(win,null);}
            }
            await host.control('lock',id,true);await until(()=>execute(win,()=>[...document.querySelectorAll('.overlay-resize-edge')].every(handle=>handle.hidden&&handle.disabled)),`${id} lock removes resize input`);await host.control('hide',id);results.push({id,trustedEdges:8,nativeHits,lock:true});
        }
        console.log('Native client hit regions and trusted edge resizing passed; checking docking.');await host.control('hide-all');await host.control('unlock-all');const native=id=>host.windows.get(id),area=workArea,x=area.x+100,y=area.y+80;
        const seedLayout=async definitions=>{
            // Seeding is deliberately not a native drag. All interaction below
            // uses trusted pointer input; fixture positioning must not invoke
            // the window manager's move fallback or its release snapping.
            await host.control('hide-all');for(const id of host.windows.keys())host.cancelPanelMove(id);host.docksSuspended=false;host.dockingSync=true;
            let nativeChangedAt=Date.now();const changed=()=>{nativeChangedAt=Date.now();};for(const win of host.windows.values()){win.on('move',changed);win.on('resize',changed);}
            try{for(const [id,prefs]of Object.entries(host.preferences.panels)){delete prefs.dock;Object.assign(prefs,{visible:Boolean(definitions[id]),locked:false,passThrough:false,manualHeight:true});if(definitions[id])prefs.bounds={...definitions[id].bounds};host.apply(id);}
            // Windows may enforce a38..56px native track minimum, depending
            // on the physical DPI and Electron's forced fixture scale. Only
            // the requested36px fixture adopts that observed native minimum;
            // its grip is additionally checked against a36px viewport below.
            for(const [id,definition]of Object.entries(definitions))try{await until(()=>{const bounds=native(id).getBounds();return ['x','y','width','height'].every(key=>id==='timers'&&definition.bounds.height===36&&key==='height'?bounds.height>=36&&bounds.height<=64:Math.abs(bounds[key]-definition.bounds[key])<=1);},`${id} seeded native rectangle ready`);if(id==='timers'&&definition.bounds.height===36)host.preferences.panels[id].bounds={...native(id).getBounds()};}catch(error){throw Error(`${error.message}; requested=${JSON.stringify(definition.bounds)}; native=${JSON.stringify(native(id).getBounds())}; minimum=${JSON.stringify(native(id).getMinimumSize())}; saved=${JSON.stringify(host.getState().panels[id])}`);}
            // Attach after native positioning has settled. This preserves the
            // test's actual dock graph without simulating a drag to create it.
            await until(()=>Date.now()-nativeChangedAt>=350,'seeded native move/resize notifications settle before attaching docks');for(const id of host.windows.keys())host.cancelPanelMove(id);
            for(const [id,definition]of Object.entries(definitions))if(definition.dock)host.preferences.panels[id].dock={...definition.dock};
            host.broadcast(false);for(const id of Object.keys(definitions))await until(()=>execute(native(id),expected=>Math.abs(document.documentElement.clientWidth-expected.width)<=1&&Math.abs(document.documentElement.clientHeight-expected.height)<=1,host.preferences.panels[id].bounds),`${id} seeded viewport ready`);
            }finally{host.dockingSync=false;for(const win of host.windows.values()){win.off('move',changed);win.off('resize',changed);}}
        };
        const dockFixture=()=>({parse:{bounds:{x,y,width:360,height:220}},timers:{bounds:{x,y:y+220,width:360,height:100},dock:{targetId:'parse',edge:'below'}},map:{bounds:{x:x+360,y,width:300,height:220},dock:{targetId:'parse',edge:'right'}},intel:{bounds:{x:x+360,y:y+220,width:300,height:200},dock:{targetId:'map',edge:'below'}}});
        await seedLayout(dockFixture());
        const timerHeight=native('timers').getBounds().height;assert.ok(Math.abs(timerHeight-100)<=2,'native rounding remains bounded');let intelHeight=native('intel').getBounds().height;
        assert.deepEqual(host.getState().panels.timers.dock,{targetId:'parse',edge:'below'});assert.deepEqual(host.getState().panels.map.dock,{targetId:'parse',edge:'right'});
        assert.deepEqual(host.getState().panels.intel.dock,{targetId:'map',edge:'below'});
        const layout=()=>Object.fromEntries(Object.entries(host.getState().panels).map(([id,prefs])=>[id,{visible:prefs.visible,locked:prefs.locked,bounds:prefs.bounds,dock:prefs.dock,native:native(id).getBounds()}]));
        const compactFit=()=>{for(const [id,panel]of Object.entries(layout())){const bounds=panel.native;assert.ok(bounds.x>=area.x&&bounds.y>=area.y&&bounds.x+bounds.width<=area.x+Math.min(1024,area.width)&&bounds.y+bounds.height<=area.y+Math.min(700,area.height),`${id} fixture fits a compact CI work area: ${JSON.stringify({bounds,workArea:area})}`);}};
        compactFit();
        const beforeResize=layout(),resizeReply=await execute(native('parse'),()=>window.eyeOfZommOverlay.action('resize',{width:420,height:260}));
        assert.deepEqual(native('timers').getBounds(),{x,y:y+260,width:420,height:timerHeight},JSON.stringify({beforeResize,resizeReply,afterResize:layout(),workArea:area}));assert.deepEqual(native('map').getBounds(),{x:x+420,y,width:300,height:260});assert.deepEqual(native('intel').getBounds(),{x:x+420,y:y+260,width:300,height:intelHeight});
        const group=host.getState().panels;await host.control('hide-all');assert.equal(host.docksSuspended,true);host.timerContentHeight=60;host.fitTimerWindow();for(const id of ['map','intel','timers']){assert.deepEqual(host.getState().panels[id].dock,group[id].dock);assert.deepEqual(host.getState().panels[id].bounds,group[id].bounds);}await host.control('cycle-all');for(const id of ['parse','map','intel','timers'])for(const key of ['x','y','width','height'])assert.ok(Math.abs(native(id).getBounds()[key]-group[id].bounds[key])<=1,`${id}/${key}: global re-show retains bounds with only native DIP rounding`);
        const shownParse=native('parse').getBounds(),shownMap=native('map').getBounds(),shownIntel=native('intel').getBounds(),shownTimers=native('timers').getBounds();assert.equal(shownMap.x,shownParse.x+shownParse.width);assert.equal(shownMap.y,shownParse.y);assert.equal(shownMap.height,shownParse.height);assert.equal(shownIntel.x,shownMap.x);assert.equal(shownIntel.width,shownMap.width);assert.equal(shownIntel.y,shownMap.y+shownMap.height);assert.equal(shownTimers.x,shownParse.x);assert.equal(shownTimers.width,shownParse.width);assert.equal(shownTimers.y,shownParse.y+shownParse.height);intelHeight=shownIntel.height;
        native('timers').setBounds({x,y:y+400,width:420,height:timerHeight});await until(()=>!host.getState().panels.timers.dock&&Math.abs(native('timers').getBounds().y-y-400)<=1,'native timer move detaches before resizing its former parent');const detachedTimer=native('timers').getBounds();assert.equal(host.getState().panels.timers.dock,undefined);
        await execute(native('parse'),()=>window.eyeOfZommOverlay.action('resize',{width:440,height:280}));assert.deepEqual(native('timers').getBounds(),detachedTimer);assert.deepEqual(native('map').getBounds(),{x:x+440,y,width:300,height:280});assert.deepEqual(native('intel').getBounds(),{x:x+440,y:y+280,width:300,height:intelHeight});
        compactFit();
        console.log('Docked edge resizing passed; checking gradual trusted drags.');const dragResults=[];
        const near=(actual,expected,label)=>{for(const key of ['x','y','width','height'])assert.ok(Math.abs(actual[key]-expected[key])<=1,`${label}/${key}: ${JSON.stringify({actual,expected})}`);};
        const dragSurface=async id=>execute(native(id),panel=>{
            const selector=panel==='map'?'.native-map-drag-grip':panel==='intel'?'#overlay-title':'.parse-drag-grip',element=document.querySelector(selector),rect=element?.getBoundingClientRect();
            if(!rect?.width||!rect.height)throw Error(`No visible drag surface: ${panel}/${selector}`);
            const x=Math.round(rect.left+rect.width/2),y=Math.round(rect.top+rect.height/2),hit=document.elementFromPoint(x,y),style=getComputedStyle(panel==='intel'?element.closest('#overlay-header'):element);
            window.__moveTrusted=false;window.__moveTrace=[];if(!window.__moveTraceInstalled){window.__moveTraceInstalled=true;for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,event=>{if(window.__moveTrace.length<60)window.__moveTrace.push({type,trusted:event.isTrusted,target:event.target.id||event.target.className,screenX:event.screenX,screenY:event.screenY,clientX:event.clientX,clientY:event.clientY});},true);}
            element.addEventListener('pointerdown',event=>{window.__moveTrusted=event.isTrusted;},{once:true});
            const resizeOverlaps=[...document.querySelectorAll('[data-resize-edge]:not([hidden])')].flatMap(handle=>{const edge=handle.getBoundingClientRect();return rect.left<edge.right&&rect.right>edge.left&&rect.top<edge.bottom&&rect.bottom>edge.top?[{edge:handle.dataset.resizeEdge,rect:{left:edge.left,top:edge.top,right:edge.right,bottom:edge.bottom}}]:[];});
            return{x,y,rect:{left:rect.left,top:rect.top,bottom:rect.bottom,right:rect.right},viewport:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight},region:style.webkitAppRegion,hitIsSurface:hit===element||element.contains(hit),resizeEdge:hit?.closest('[data-resize-edge]')?.dataset.resizeEdge,resizeOverlaps,selector};
        },id);
        const dragNativeHit=async(win,point,scope)=>{
            if(process.platform!=='win32')return null;const bounds=win.getBounds(),handle=win.getNativeWindowHandle().readBigUInt64LE().toString(),screenX=bounds.x+point.x,screenY=bounds.y+point.y;
            const result=await probeWin32HitTest({handle,scope,points:[{edge:'drag',x:screenX,y:screenY}]}),hit=result.hits[0].hit;assert.equal(hit,1,'JavaScript drag grips must receive client input rather than a native caption gesture');return hit;
        };
        const trustedDrag=async(id,steps,{expectedRelease=null,checkDetached=true,compactMinimum=false}={})=>{
            console.log(`Checking ${id} drag (${steps.length} steps${expectedRelease?', release snap':''}).`);
            const win=native(id),before=win.getBounds(),beforeState=host.getState().panels,beforeNative=Object.fromEntries([...host.windows].map(([peer,window])=>[peer,window.getBounds()])),point=await dragSurface(id);assert.equal(point.region,'no-drag',`${id} drag surface receives pointer events`);assert.equal(point.hitIsSurface,true,`${id} visible grip center is clickable`);assert.equal(point.resizeEdge,undefined,`${id} drag grip does not overlap the resize corner`);
            if(id!=='intel')assert.deepEqual(point.resizeOverlaps,[],`${id} whole drag grip clears every resize hit region: ${JSON.stringify(point)}`);
            if(compactMinimum)assert.ok(point.rect.top>=7&&point.rect.bottom<=36-7,`Triggers grip also fits the requested36px viewport between resize edges: ${JSON.stringify(point)}`);
            const nativeHit=await dragNativeHit(win,point,id+'/drag'),start={x:before.x+point.x,y:before.y+point.y};
            const send=async(type,delta)=>{const globalX=start.x+delta.x,globalY=start.y+delta.y;await fixturePointer(win,{x:globalX,y:globalY});const current=win.getBounds();win.webContents.sendInputEvent({type,...(type==='mouseDown'||type==='mouseUp'?{button:'left',clickCount:1}:{}),x:globalX-current.x,y:globalY-current.y,globalX,globalY});};
            const unchangedPeers=()=>{const state=host.getState().panels;for(const [peer,prefs]of Object.entries(beforeState)){if(peer===id)continue;assert.deepEqual(native(peer).getBounds(),beforeNative[peer],`${id} drag keeps ${peer} native bounds fixed`);assert.deepEqual(state[peer].bounds,prefs.bounds,`${id} drag keeps ${peer} saved bounds fixed`);const expectedDock=prefs.dock?.targetId===id?undefined:prefs.dock;assert.deepEqual(state[peer].dock,expectedDock,`${id} drag changes only incident dock relations`);}};
            try{
                await send('mouseMove',{x:0,y:0});await send('mouseDown',{x:0,y:0});await until(()=>execute(win,()=>document.body.classList.contains('is-moving')&&window.__moveTrusted),`${id} trusted drag begins`);
                if(checkDetached)await until(()=>!host.getState().panels[id].dock&&Object.values(host.getState().panels).every(prefs=>prefs.dock?.targetId!==id),`${id} detaches as soon as the grip is pressed`);
                for(const delta of steps){await send('mouseMove',delta);await until(()=>{const current=win.getBounds();return Math.abs(current.x-before.x-delta.x)<=1&&Math.abs(current.y-before.y-delta.y)<=1;},`${id} follows a ${delta.x},${delta.y} pixel drag`);near(win.getBounds(),{...before,x:before.x+delta.x,y:before.y+delta.y},`${id} drag preserves width/height`);unchangedPeers();}
                // Real session broadcasts and Triggers content measurements
                // must not restore a detached rectangle mid-gesture.
                await execute(native('timers'),()=>window.eyeOfZommOverlay.action('content-height',100));host.broadcast(false);await wait(80);const final=steps.at(-1),free={...before,x:before.x+final.x,y:before.y+final.y};near(win.getBounds(),free,`${id} broadcast during drag`);unchangedPeers();
                await send('mouseUp',final);await until(()=>execute(win,()=>!document.body.classList.contains('is-moving')),`${id} releases pointer capture`);await until(()=>{const actual=win.getBounds(),expected=expectedRelease||free;return ['x','y','width','height'].every(key=>Math.abs(actual[key]-expected[key])<=1);},`${id} final native position settles`);await wait(220);near(win.getBounds(),expectedRelease||free,`${id} does not rubberband after release`);unchangedPeers();
                if(!expectedRelease)assert.equal(host.getState().panels[id].dock,undefined,`${id} remains freely placed`);const noise=await execute(win,()=>window.__fixturePointerNoiseCount||0);return{id,nativeHit,steps:steps.length,freePlacement:!expectedRelease,foreignPointerMovesIgnored:noise,...(compactMinimum?{requestedMinimumHeight:36,actualNativeHeight:before.height}:{})};
            }catch(error){throw Error(`${error.message}; layout=${JSON.stringify(layout())}; point=${JSON.stringify(point)}; events=${JSON.stringify(await execute(win,()=>({events:window.__moveTrace,foreignPointerMoves:window.__fixturePointerNoise})))}`);}finally{await fixturePointer(win,null);}
        };
        // Releasing only six pixels from the old group must still leave it
        // detached. A large "break free" movement would hide the original bug.
        for(const id of ['parse','timers','map','intel']){await seedLayout(dockFixture());dragResults.push(await trustedDrag(id,[{x:1,y:1},{x:3,y:2},{x:6,y:4}]));}
        await seedLayout({timers:{bounds:{x,y,width:360,height:36}}});dragResults.push(await trustedDrag('timers',[{x:1,y:1},{x:12,y:8},{x:40,y:28}],{compactMinimum:true}));
        // A new target is optional and has a small release-only magnet: twelve
        // pixels remains free; a later deliberate release seven pixels away
        // docks. The former connected group is never a release target.
        await seedLayout({parse:{bounds:{x,y,width:360,height:220}},timers:{bounds:{x,y:y+220,width:360,height:100},dock:{targetId:'parse',edge:'below'}},map:{bounds:{x:x+480,y,width:300,height:220}}});
        dragResults.push(await trustedDrag('timers',[{x:1,y:1},{x:484,y:12}]));
        dragResults.push(await trustedDrag('timers',[{x:-4,y:-5}],{expectedRelease:{x:x+480,y:y+220,width:300,height:100}}));assert.deepEqual(host.getState().panels.timers.dock,{targetId:'map',edge:'below'},'a later release near a new target docks intentionally');
        const result={ok:true,cycles,panels:results,drags:dragResults,docking:{allPanels:true,touchingEdges:true,resizeChain:true,globalHiddenSuspension:true,undock:true,immediateDetach:true,stationaryPeers:true,releaseOnlySnap:true,freePlacement:true},environment:{workArea,actualArea,requestedScaleFactor:scaleFactor,devicePixelRatio:await execute(native('parse'),()=>devicePixelRatio)},installedProfile:false,physicalMouseMoved:false};await fs.writeFile(path.join(temporary,'result.json'),JSON.stringify(result));console.log(`EOZ_OVERLAY_RESIZE=${JSON.stringify(result)}`);
    }catch(error){console.error(error.stack);throw error;}finally{host.dispose();await host.writeQueue;main.destroy();server.closeAllConnections();await new Promise(done=>server.close(done));clearTimeout(watchdog);}app.exit(0);
}
try{const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,fixtureWorkArea,scaleFactor})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});assert.equal(code,0);const result=JSON.parse(await readFile(join(temporary,'result.json'),'utf8'));assert.equal(result.ok,true);assert.equal(result.panels.length,4);assert.equal(result.drags.length,7);assert.equal(result.docking.resizeChain,true);assert.equal(result.docking.freePlacement,true);}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert.ok(basename(temporary).startsWith('eoz-overlay-resize-'));await rm(temporary,{recursive:true,force:true});}
