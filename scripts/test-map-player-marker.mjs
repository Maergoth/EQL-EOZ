// Actual Chromium canvas/CSS with synthetic maps and a disposable profile.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-map-marker-'));
const scaleIndex=process.argv.indexOf('--scale-factor'),scale=scaleIndex<0?null:Number(process.argv[scaleIndex+1]);
if(scaleIndex>=0&&(!Number.isFinite(scale)||scale<1||scale>3))throw Error('--scale-factor requires a number from 1 to 3');
async function run({root,temporary,scaleFactor}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile-'+scaleFactor));app.commandLine.appendSwitch('force-device-scale-factor',String(scaleFactor));app.disableHardwareAcceleration();await app.whenReady();
    const html='<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app/overlay.css"></head><body data-panel="map"><main id="overlay" class="overlay-shell"><header id="overlay-header" class="overlay-header"><h1 id="overlay-title">Synthetic Map</h1><div class="hover-menu"></div></header><section class="panel-content"><div id="native-map-root"></div></section></main></body></html>';
    const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://fixture').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(!/^\/app\/[a-zA-Z0-9_./-]+\.(?:js|css)$/.test(name)){res.writeHead(404).end();return;}const target=path.resolve(root,'.'+name);if(!target.startsWith(path.join(root,'app')+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/css');res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const window=new BrowserWindow({show:false,useContentSize:true,width:520,height:420,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(origin+'/')}));
    const execute=(fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    try{
        await window.loadURL(origin+'/');
        await execute(async()=>{const {mountMapOverlay}=await import('/app/map-overlay.js');window.mapSession={map:{zone:'Synthetic Vale',dataVersion:1,location:{x:0,y:0,z:0},npcs:[]}};window.markerMap=mountMapOverlay({root:document.getElementById('native-map-root'),getSession:()=>mapSession,bridge:{action:async()=>({status:'ready',lines:[[-100,-100,0,100,-100,0,180,40,40]],labels:[]})}});await new Promise(done=>setTimeout(done,40));});
        const inspect=()=>execute(()=>{const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,dpr=devicePixelRatio||1,rect=canvas.getBoundingClientRect();let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const at=(y*canvas.width+x)*4;if(pixels[at]<160&&pixels[at+1]>170&&pixels[at+2]>220&&pixels[at+3]>200){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}return{background:getComputedStyle(document.querySelector('#overlay')).backgroundColor,canvasBackground:getComputedStyle(canvas).backgroundColor,cornerAlpha:ctx.getImageData(1,1,1,1).data[3],dpr,left:rect.width/2-(minX+.5)/dpr,right:(maxX+.5)/dpr-rect.width/2,up:rect.height/2-(minY+.5)/dpr,down:(maxY+.5)/dpr-rect.height/2};});
        // The dark outline erodes the opaque cyan tip differently across
        // rasterizers. Direction is its asymmetry, not an absolute tip length.
        // A symmetric dot, a reversed arrow, or the wrong axis must fail.
        const pointsLeft=value=>value.left-value.right>=2&&Math.abs(value.up-value.down)<=1.5;
        const pointsUp=value=>value.up-value.down>=2&&Math.abs(value.left-value.right)<=1.5;
        await execute(()=>document.documentElement.style.setProperty('--panel-opacity','.15'));let result=await inspect();assert.match(result.background,/0\.15\)/);assert.equal(result.cornerAlpha,0,'Map canvas does not hide the translucent shell');assert.equal(result.canvasBackground,'rgba(0, 0, 0, 0)');assert.equal(await execute(()=>getComputedStyle(document.querySelector('.native-map-3d-stage')).opacity),'0.15','Native 3D surface uses the same fade setting');assert(result.left<6&&result.up<6,'First location is a dot, without invented facing');
        assert(!pointsLeft(result)&&!pointsUp(result),'The initial dot cannot satisfy either trajectory-arrow check');
        await execute(()=>{mapSession.map.location={x:10,y:0,z:0};markerMap.render(mapSession);});result=await inspect();const left=result;assert(pointsLeft(result)&&!pointsUp(result),'World +X arrow points left on client map: '+JSON.stringify(result));
        await execute(()=>{mapSession.map.location={x:10,y:10,z:0};markerMap.render(mapSession);});result=await inspect();const up=result;assert(pointsUp(result)&&!pointsLeft(result),'World +Y arrow points up: '+JSON.stringify(result));
        await execute(()=>{mapSession.map.location={x:10.1,y:10.1,z:0};markerMap.render(mapSession);});result=await inspect();assert(pointsUp(result)&&!pointsLeft(result),'Jitter preserves the last arrow');
        await execute(()=>{mapSession.map.location={x:0,y:10,z:0};markerMap.render(mapSession);});result=await inspect();assert(result.right-result.left>=2&&!pointsLeft(result)&&!pointsUp(result),'The reversed X arrow fails both positive-direction checks');
        await execute(()=>{mapSession.map.location={x:0,y:0,z:0};markerMap.render(mapSession);});result=await inspect();assert(result.down-result.up>=2&&!pointsLeft(result)&&!pointsUp(result),'The reversed Y arrow fails both positive-direction checks');
        await execute(()=>{document.documentElement.style.setProperty('--panel-opacity','1');markerMap.render(mapSession);});result=await inspect();assert.equal(result.background,'rgb(7, 11, 18)');assert.equal(result.cornerAlpha,0,'Opacity is applied by the shell at both limits');
        await execute(()=>{mapSession.map.dataVersion++;markerMap.render(mapSession);});result=await inspect();assert(result.left<6&&result.up<6,'New log/map context returns to an unknown-direction dot');
        assert(!pointsLeft(result)&&!pointsUp(result),'A reset dot cannot masquerade as a direction');
        console.log('Native map component passed '+JSON.stringify({scaleFactor,left:{dpr:left.dpr,front:left.left,rear:left.right,cross:left.up-left.down},up:{front:up.up,rear:up.down,cross:up.left-up.right}}));
    }finally{await execute(()=>window.markerMap?.dispose()).catch(()=>{});window.destroy();await new Promise(done=>server.close(done));}app.exit(0);
}
try{for(const scaleFactor of scale===null?[1,1.5]:[scale]){const entry=join(temporary,'main-'+scaleFactor+'.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,scaleFactor})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});assert.equal(code,0);}}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(temporary.startsWith(join(tmpdir(),'eoz-map-marker-')));await rm(temporary,{recursive:true,force:true});}
