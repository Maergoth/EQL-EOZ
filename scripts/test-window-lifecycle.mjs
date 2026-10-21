import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Native Electron only, with a disposable profile and synthetic game/log pack.
// No installed player profile, real game files or external service is touched.
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),electron=require('electron');
const temporary=await mkdtemp(join(tmpdir(),'eoz-window-lifecycle-'));
try {
    const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),configFile=join(profile,'eye-of-zomm-config.json'),placementFile=join(profile,'eye-of-zomm-window.json');
    await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});
    const logPath=join(game,'Logs','eqlog_Fixture_Test.txt');await writeFile(logPath,'');
    await writeFile(configFile,JSON.stringify({eqRootPath:game,logPath,logSelection:'manual',alwaysOnTop:true}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,version:'window-lifecycle-fixture',currentEra:'Classic',sample:true},zones:[],npcs:[],items:[]}));
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-window-lifecycle-fixture',version:pkg.version,main:'main.cjs'}));
    const run=async({root,profile,scenario})=>{
        const electron=require('electron'),{app,BrowserWindow,screen}=electron,Module=require('node:module'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
        const optionsById=new Map(),callsById=new Map();
        function RecordedWindow(options){
            const window=new BrowserWindow(options);optionsById.set(window.id,options);callsById.set(window.id,{show:0,hide:0});
            // Use nonactivating presentation for test windows. Actual native
            // minimize/maximize/bounds/tray state is retained and asserted.
            window.show=()=>{callsById.get(window.id).show++;window.showInactive();};
            const hide=window.hide.bind(window);window.hide=()=>{callsById.get(window.id).hide++;hide();};
            window.focus=()=>{};
            return window;
        }
        Object.setPrototypeOf(RecordedWindow,BrowserWindow);RecordedWindow.prototype=BrowserWindow.prototype;
        const nativeLoad=Module._load;
        Module._load=function(name,...args){if(name==='electron')return {...electron,BrowserWindow:RecordedWindow,...(scenario.startsWith('taskbar')?{Tray:class{constructor(){throw Error('Synthetic unavailable tray');}}}:{})};return nativeLoad.call(this,name,...args);};
        global.fetch=async()=>{throw Error('External network disabled for lifecycle smoke');};
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const until=async(predicate,label)=>{const end=Date.now()+10000;while(Date.now()<end){const result=await predicate();if(result)return result;await wait(50);}throw Error(`Timed out: ${label}`);};
        const execute=(win,fn,...args)=>win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        let owner,started=false;
        async function inspect(){
            owner=await until(()=>BrowserWindow.getAllWindows().find(win=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(win.webContents.getURL())),'main root');
            await until(()=>execute(owner,()=>document.readyState==='complete'&&Boolean(document.getElementById('settings-start-minimized'))).catch(()=>false),'settings DOM');
            await until(()=>execute(owner,()=>Boolean(document.getElementById('settings-start-minimized')&&!document.getElementById('settings-start-minimized').disabled)).catch(()=>false),'settings bridge');
            assert.equal(optionsById.get(owner.id).frame,true);assert.equal(optionsById.get(owner.id).skipTaskbar,false);assert.equal(owner.isAlwaysOnTop(),false);
            const state=()=>execute(owner,()=>window.eyeOfZommWindow.getSettings());
            if(scenario==='edit'){
                await execute(owner,()=>{document.querySelector('[data-view="settings"]').click();document.getElementById('open-whats-new').click();});
                await until(()=>execute(owner,()=>Boolean(document.querySelector('.whats-new-dialog')?.open)),'manual walkthrough');
                const walkthrough=await execute(owner,async()=>{
                    const dialog=document.querySelector('.whats-new-dialog'),next=dialog.querySelector('[data-tour-next]');
                    const source=dialog.querySelector('[data-tour-image]');await new Promise(resolve=>{if(source.complete)resolve();else{source.onload=resolve;source.onerror=resolve;}});
                    const imageLoaded=source.complete&&source.naturalWidth>0;
                    next.click();const second=dialog.querySelector('[data-tour-count]').textContent;
                    dialog.querySelector('[data-tour-previous]').click();
                    dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
                    return {imageLoaded,second,closed:!dialog.open,focusRestored:document.activeElement?.id==='open-whats-new'};
                });
                assert.equal(walkthrough.imageLoaded,true);assert.equal(walkthrough.second,'2 of 4');assert.equal(walkthrough.closed,true);assert.equal(walkthrough.focusRestored,true);
                await execute(owner,()=>{document.querySelector('[data-view="settings"]').click();document.getElementById('settings-minimize-to-tray').click();});
                await until(async()=> (await state()).minimizeToTray,'minimize checkbox persistence');
                await execute(owner,()=>document.getElementById('settings-start-minimized').click());
                await until(async()=> (await state()).startMinimized,'startup checkbox persistence');
                const area=screen.getPrimaryDisplay().workArea;
                const [minimumWidth,minimumHeight]=owner.getMinimumSize();
                // Small CI desktops can be narrower than the preferred size.
                // Choose a legal rectangle from the native constraints, then
                // center it inside the actual work area before maximizing.
                const width=Math.min(area.width,Math.max(minimumWidth,Math.min(1200,area.width-80)));
                const height=Math.min(area.height,Math.max(minimumHeight,Math.min(760,area.height-60)));
                const bounds={x:area.x+Math.floor((area.width-width)/2),y:area.y+Math.floor((area.height-height)/2),width,height};
                owner.setBounds(bounds);
                await until(()=>Object.entries(bounds).every(([key,value])=>owner.getNormalBounds()[key]===value),'native normal bounds before maximize');
                const normalBounds=owner.getNormalBounds();
                assert(normalBounds.x>=area.x&&normalBounds.y>=area.y&&normalBounds.x+normalBounds.width<=area.x+area.width&&normalBounds.y+normalBounds.height<=area.y+area.height);
                owner.maximize();await until(()=>owner.isMaximized(),'native maximize');
                console.log('EOZ_WINDOW_LIFECYCLE='+JSON.stringify({ok:true,scenario,bounds:normalBounds,maximized:true,settings:await state()}));
            }else if(scenario==='restore'){
                const settings=await state();
                if(settings.trayAvailable){assert.equal(owner.isVisible(),false);assert.equal(callsById.get(owner.id).show,0);assert.equal(owner.isMaximized(),false,'Hidden startup defers maximization');}
                else assert.equal(owner.isMinimized(),true,'Missing tray remains recoverable in the taskbar');
                await execute(owner,()=>window.eyeOfZommOverlays.control('show-main'));
                await until(()=>owner.isMaximized()&&owner.isVisible(),'saved maximized presentation');
                const foreign=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
                try{
                    await foreign.loadURL(owner.webContents.getURL()+'overlay.html?panel=parse');
                    const denied=await execute(foreign,async()=>{try{await window.eyeOfZommWindow.setSettings({startMinimized:false});return false;}catch{return true;}});
                    assert.equal(denied,true,'A real unrelated webContents cannot change startup settings');
                }finally{foreign.destroy();}
                assert.equal((await state()).startMinimized,true);
                owner.minimize();
                await until(()=>settings.trayAvailable?!owner.isVisible():owner.isMinimized(),'native minimize policy');
                console.log('EOZ_WINDOW_LIFECYCLE='+JSON.stringify({ok:true,scenario,maximizedRestored:true,foreignSettingsDenied:true,trayAvailable:settings.trayAvailable}));
            }else{
                const settings=await state();assert.equal(settings.trayAvailable,false);
                await until(()=>owner.isMinimized(),'start minimized in taskbar');
                assert.equal(callsById.get(owner.id).hide,0);
                if(scenario==='taskbar-max'){
                    const shown=callsById.get(owner.id).show;owner.restore();
                    await until(()=>owner.isMaximized(),'native taskbar restoration consumes initial maximization');
                    assert.equal(callsById.get(owner.id).show,shown);
                    owner.unmaximize();await until(()=>!owner.isMaximized(),'native user unmaximize');
                }
                await execute(owner,()=>window.eyeOfZommOverlays.control('show-main'));await until(()=>owner.isVisible(),'restore from taskbar');
                if(scenario==='taskbar-max')assert.equal(owner.isMaximized(),false,'Consumed startup state cannot re-maximize on later Open main');
                await execute(owner,()=>window.eyeOfZommWindow.setSettings({minimizeToTray:true}));
                const hides=callsById.get(owner.id).hide;owner.minimize();await until(()=>owner.isMinimized(),'tray-failure taskbar fallback');
                assert.equal(callsById.get(owner.id).hide,hides);
                console.log('EOZ_WINDOW_LIFECYCLE='+JSON.stringify({ok:true,scenario,taskbarRecovery:true,trayFailureFallback:true}));
            }
            // Exercise the real before-quit flush rather than app.exit().
            app.quit();
        }
        app.on('browser-window-created',()=>{if(!started){started=true;void inspect().catch(error=>{console.error(error.stack);app.exit(1);});}});
        setTimeout(()=>{console.error('Window lifecycle smoke exceeded 40 seconds');app.exit(2);},40000).unref();
        require(path.join(root,'desktop/main.cjs'));
    };
    const proofs=[];
    for(const scenario of ['edit','restore','taskbar','taskbar-max']){
        if(scenario.startsWith('taskbar')){
            const config=JSON.parse(await readFile(configFile,'utf8'));config.minimizeToTray=false;config.startMinimized=true;await writeFile(configFile,JSON.stringify(config));
            const placement=JSON.parse(await readFile(placementFile,'utf8'));placement.maximized=scenario==='taskbar-max';await writeFile(placementFile,JSON.stringify(placement));
        }
        await writeFile(join(temporary,'main.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});(${run.toString()})(${JSON.stringify({root,profile,scenario})}).catch(error=>{console.error(error.stack);app.exit(1);});`);
        const result=await new Promise((resolve,reject)=>{
            const child=spawn(electron,[temporary,'--disable-gpu','--mute-audio'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
            child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});child.once('error',reject);child.once('exit',code=>resolve({code,output}));
        });
        assert.equal(result.code,0,result.output);const line=result.output.match(/EOZ_WINDOW_LIFECYCLE=(.*)/);assert(line,result.output);const proof=JSON.parse(line[1]);assert.equal(proof.ok,true);proofs.push(proof);
        const saved=JSON.parse(await readFile(placementFile,'utf8')),config=JSON.parse(await readFile(configFile,'utf8'));
        assert.equal(config.alwaysOnTop,undefined);assert.equal(config.startMinimized,true);
        if(scenario==='edit'){assert.equal(config.minimizeToTray,true);assert.equal(saved.maximized,true);assert.deepEqual(saved.bounds,proof.bounds,'Immediate Quit flushes normal bounds behind maximization');}
        if(scenario==='restore')assert.equal(saved.maximized,true,'Minimize does not overwrite saved maximization on Quit');
    }
    console.log('Actual Electron window lifecycle passed: '+JSON.stringify(proofs));
} finally {
    if(dirname(temporary)!==resolve(tmpdir())||!basename(temporary).startsWith('eoz-window-lifecycle-'))throw Error('Unexpected lifecycle cleanup path');
    await rm(temporary,{recursive:true,force:true});
}
