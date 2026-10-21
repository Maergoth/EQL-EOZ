import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Actual main application/embedded viewer, with only disposable synthetic files.
// Chromium zoom exercises smaller CSS viewports; it is not a physical DPI test.
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),electron=require('electron');
const temporary=await mkdtemp(join(tmpdir(),'eoz-map-layout-'));
const screenshotIndex=process.argv.indexOf('--screenshots'),screenshots=screenshotIndex<0?join(temporary,'screenshots'):resolve(process.argv[screenshotIndex+1]||'');
const recordOnly=process.argv.includes('--record-only');
try{
    const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),log=join(game,'Logs','eqlog_Fixture_Test.txt');
    await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});await mkdir(screenshots,{recursive:true});
    await writeFile(log,`[${new Date().toISOString()}] Synthetic map layout starts.\n`);
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,logSelection:'manual'}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,version:'synthetic-layout',sample:true},zones:[],npcs:[],items:[]}));
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-map-layout',version:pkg.version,main:'main.cjs'}));
    const run=async({root,screenshots,recordOnly})=>{
        const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
        BrowserWindow.prototype.show=()=>{};global.fetch=async()=>{throw Error('External network disabled for synthetic map layout');};
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const until=async(fn,label)=>{const end=Date.now()+10000;while(Date.now()<end){const value=await fn();if(value)return value;await wait(60);}throw Error(`Timed out: ${label}`);};
        let started=false;
        async function inspect(window){
            await until(()=>window.webContents.executeJavaScript("Boolean(document.querySelector('[data-view=map]') && window.eyeOfZommOverlays)"),'main renderer');
            await window.webContents.executeJavaScript("document.querySelector('[data-view=map]').click()");
            await until(()=>window.webContents.executeJavaScript("Boolean(document.querySelector('#zone-viewer')?.contentWindow?.eqlZoneViewer?.els?.miniMap)"),'embedded viewer');
            await window.webContents.executeJavaScript("document.querySelector('#app-update-badge').hidden=false;document.querySelector('#app-update-badge').textContent='Update Available'");
            window.setMinimumSize(0,0);
            const results=[];
            for(const [width,height,zoom] of [[1100,760,1],[1024,700,1],[1024,700,1.25],[1024,700,1.5],[900,600,1]]){
                window.setContentSize(width,height);window.webContents.setZoomFactor(zoom);window.webContents.invalidate();await window.capturePage(undefined,{stayHidden:true,stayAwake:true});
                await until(async()=>Math.abs((await window.webContents.executeJavaScript('innerWidth'))-width/zoom)<3,'scaled client viewport');await wait(80);
                const result=await window.webContents.executeJavaScript(`(${(()=>{
                    const iframe=document.querySelector('#zone-viewer'),viewer=iframe.contentWindow,app=viewer.eqlZoneViewer;
                    app.els.statusText.textContent='Synthetic map note: default map set; selected location and route status remain readable when this window is resized.';
                    const rect=element=>{const r=element.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
                    return{window:{width:innerWidth,height:innerHeight},frame:rect(iframe),app:rect(app.root.querySelector('.eqlzv-app')),viewport:rect(app.els.viewport),footer:rect(app.els.statusText.closest('.eqlzv-status')),footerText:rect(app.els.statusText),version:rect(document.querySelector('#titlebar-version')),update:rect(document.querySelector('#app-update-badge')),overlays:rect(document.querySelector('#open-native-overlays')),search:rect(document.querySelector('#wiki-search')),frameHeight:viewer.innerHeight,frameWidth:viewer.innerWidth};
                }).toString()})()`);
                results.push({width,height,zoom,...result});
                if(!recordOnly){assert(result.frame.bottom<=result.window.height+1,'Main map frame extends below client viewport');assert(result.footer.bottom<=result.frameHeight+1,'Embedded map note is clipped below frame');assert(result.footerText.bottom<=result.frameHeight+1,'Map note text is clipped');assert(result.viewport.height>=65,`Map canvas must retain usable height: ${JSON.stringify({width,height,zoom,...result})}`);assert(result.version.width>0&&result.version.height>0,'Current version stays visible at compact widths');assert(result.update.width>0&&result.update.right<=result.window.width&&result.overlays.right<=result.window.width,'Update and Overlays stay visible in compact headers');assert(result.search.width>=20,'Search retains an editable input');}
                if(zoom===1.25){window.webContents.invalidate();await wait(80);const image=await window.capturePage(undefined,{stayHidden:true,stayAwake:true});await fs.writeFile(path.join(screenshots,recordOnly?'map-layout-before.png':'map-layout-after.png'),image.toPNG());}
            }
            let miniMap;
            if(!recordOnly){
                miniMap=await window.webContents.executeJavaScript(`(${(()=>{
                    const viewer=document.querySelector('#zone-viewer').contentWindow,app=viewer.eqlZoneViewer,panel=app.els.miniMap;
                    app.els.overlay.hidden=true;app.mapBounds.min.set(-500,-5,-500);app.mapBounds.max.set(500,5,500);app.mapContentBounds.copy(app.mapBounds);
                    app.mapData={lines:[{x1:-100,y1:0,z1:0,x2:100,y2:0,z2:0,r:255,g:230,b:150,layer:0}]};app.miniMapVisible=true;panel.hidden=false;app.drawMiniMap();
                    const canvas=app.els.miniMapCanvas,before=canvas.toDataURL();panel.querySelector('[data-minimap-zoom="in"]').click();
                    const clicked=app.miniMapZoom,changed=canvas.toDataURL()!==before;
                    const wheel=new viewer.WheelEvent('wheel',{deltaY:-1,bubbles:true,cancelable:true});panel.dispatchEvent(wheel);const wheeled=app.miniMapZoom;
                    panel.querySelector('[data-minimap-zoom="reset"]').click();const reset=app.miniMapZoom;
                    const bounds=panel.getBoundingClientRect(),viewport=app.els.viewport.getBoundingClientRect();
                    return{clicked,changed,wheeled,reset,wheelConsumed:wheel.defaultPrevented,panelFits:bounds.top>=viewport.top-1&&bounds.bottom<=viewport.bottom+1,canvasFits:canvas.getBoundingClientRect().bottom<=bounds.bottom+1};
                }).toString()})()`);
                assert(miniMap.clicked>1&&miniMap.changed,'Local Map + zoom changes the real drawn line scale');assert(miniMap.wheeled>miniMap.clicked&&miniMap.wheelConsumed,'Local Map wheel zoom consumes only its own event');assert.equal(miniMap.reset,1);assert(miniMap.panelFits&&miniMap.canvasFits,'Minimap and its canvas fit the resized viewport');
                window.webContents.invalidate();await wait(80);await fs.writeFile(path.join(screenshots,'local-map-zoom.png'),(await window.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());
            }
            await fs.writeFile(path.join(screenshots,recordOnly?'map-layout-before.json':'map-layout-after.json'),JSON.stringify({results,miniMap},null,2));
            console.log('EOZ_MAP_LAYOUT='+JSON.stringify({ok:true,recordOnly,results:results.map(row=>({width:row.width,height:row.height,zoom:row.zoom,canvasHeight:row.viewport.height,footerBottom:row.footer.bottom,frameHeight:row.frameHeight})),miniMap,screenshots}));app.exit(0);
        }
        app.on('browser-window-created',(_event,window)=>{if(started)return;started=true;window.webContents.once('did-finish-load',()=>{void inspect(window).catch(error=>{console.error(error.stack);app.exit(1);});});});
        setTimeout(()=>app.exit(2),30000).unref();require(path.join(root,'desktop/main.cjs'));
    };
    await writeFile(join(temporary,'main.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});(${run.toString()})(${JSON.stringify({root,screenshots,recordOnly})});`);
    const result=await new Promise((resolve,reject)=>{const child=spawn(electron,[temporary,'--disable-gpu','--mute-audio'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('exit',code=>resolve({code,output}));});
    assert.equal(result.code,0,result.output);assert.match(result.output,/EOZ_MAP_LAYOUT=.*"ok":true/);console.log(result.output.match(/EOZ_MAP_LAYOUT=.*/)[0]);
}finally{if(dirname(temporary)!==resolve(tmpdir())||!basename(temporary).startsWith('eoz-map-layout-'))throw Error('Unexpected layout-test cleanup path');await rm(temporary,{recursive:true,force:true});}
