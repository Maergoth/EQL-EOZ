// Actual main/preload and native config, isolated from installed profiles.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-screen-master-')),profile=join(temporary,'profile'),require=createRequire(import.meta.url);
async function native({root,profile,phase}){
    const electron=require('electron'),{app,BrowserWindow}=electron,Module=require('node:module'),path=require('node:path'),assert=require('node:assert/strict');
    app.setPath('userData',profile);app.disableHardwareAcceleration();
    const watchdog=setTimeout(()=>app.exit(2),30000);watchdog.unref();
    let captures=0;const wrapped={...electron,desktopCapturer:{getSources:async()=>{captures++;return [];}}},original=Module._load;
    function HiddenWindow(options){const win=new BrowserWindow({...options,show:false});win.show=()=>{};win.focus=()=>{};return win;}Object.setPrototypeOf(HiddenWindow,BrowserWindow);HiddenWindow.prototype=BrowserWindow.prototype;wrapped.BrowserWindow=HiddenWindow;
    Module._load=function(name,...args){return name==='electron'?wrapped:original.call(this,name,...args);};global.fetch=async()=>{throw Error('No external requests in the master-switch fixture');};
    await app.whenReady();electron.session.defaultSession.webRequest.onBeforeRequest((details,done)=>{const url=new URL(details.url);done({cancel:['http:','https:'].includes(url.protocol)&&url.hostname!=='127.0.0.1'});});
    const wait=ms=>new Promise(done=>setTimeout(done,ms)),until=async(fn,label)=>{const end=Date.now()+15000;while(Date.now()<end){try{if(await fn())return;}catch{}await wait(30);}throw Error(label);};
    const work=(async()=>{
        let main;await until(()=>{main=BrowserWindow.getAllWindows().find(win=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(win.webContents.getURL()));return Boolean(main);},'actual main');
        const run=(fn,...args)=>main.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        await until(()=>run(()=>Boolean(document.querySelector('[data-capture-opt-in]')&&window.eyeOfZommCapture)),'actual settings and preload');
        assert.equal((await run(()=>window.eyeOfZommCapture.status())).readingEnabled,phase==='enabled','Native config survives process restart without inferring permission from a reader');
        if(phase==='enabled'){
            // The persisted enabled phase may legitimately enumerate before
            // the fixture disables it. Exercise that allowed path explicitly
            // so the disabled-period assertion cannot depend on startup timing.
            await run(()=>window.eyeOfZommCapture.sources());assert(captures>0,'Persisted permission permits source enumeration before disable');
            await until(()=>run(async()=>{await window.eyeOfZommCapture.setReadingEnabled(false);return !(await window.eyeOfZommCapture.status()).readingEnabled;}),'disable persisted permission');
        }
        const disabledCaptureBaseline=captures;
        if(phase!=='enabled')assert.equal(disabledCaptureBaseline,0,'An absent or persisted-off permission cannot enumerate during startup');
        await run(()=>document.querySelector('[data-view="contribute"]').click());await wait(150);
        const result=await run(async()=>{
            const api=window.eyeOfZommCapture;
            const denied=[];for(const action of [()=>api.sources(),()=>api.start({mode:'character',sourceId:'window:forged'}),()=>api.start({mode:'contribution',sourceId:'window:forged'}),()=>api.resume(),()=>api.importImage({mode:'character',source:'clipboard'}),()=>api.importImage({mode:'contribution',source:'file'})])try{await action();denied.push(false);}catch(error){denied.push(/Screen reading is disabled/.test(error.message));}
            const warning=document.querySelector('[data-screen-reading-warning]');return {denied,text:warning.textContent,color:getComputedStyle(warning).color,status:await api.status()};
        });
        assert.deepEqual(result.denied,[true,true,true,true,true,true]);assert.equal(result.status.enabled,false);assert.equal(result.status.owner,null);assert.match(result.text,/ALL screen reading is disabled/);assert.equal(result.color,'rgb(255, 132, 132)');
        assert.equal(captures,disabledCaptureBaseline,'Opening Contribute and all blocked image paths cannot enumerate after native disable acknowledgment');
        if(phase==='initial'){
            await run(()=>document.querySelector('[data-capture-opt-in]').click());await until(()=>run(async()=>(await window.eyeOfZommCapture.status()).readingEnabled),'checkbox grants native permission');
            await until(()=>captures===1,'Active Contribute automatically requests its source after enabling');assert.equal((await run(()=>window.eyeOfZommCapture.status())).enabled,false,'No source means no fabricated active capture');await wait(150);assert.equal(captures,1,'The active tab requests a source once, without a reload/restart loop');
        }
        clearTimeout(watchdog);console.log('SCREEN_MASTER_PHASE='+phase);app.quit();
    })();
    require(path.join(root,'desktop/main.cjs'));await work;
}
try{
    const game=join(temporary,'synthetic-game');await mkdir(join(game,'Logs'),{recursive:true});const log=join(game,'Logs','eqlog_Synthetic_Test.txt');await writeFile(log,'');await mkdir(join(profile,'data'),{recursive:true});
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-screen-master',version:pkg.version,main:'main.cjs'}));
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,frontendCacheVersion:pkg.version}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,sample:true,version:'synthetic-master'},items:[],npcs:[],zones:[]}));
    for(const phase of ['initial','enabled','disabled']){
        await writeFile(join(temporary,'main.cjs'),`(${native.toString()})(${JSON.stringify({root,profile,phase})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
        const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const result=await new Promise((done,reject)=>{const child=spawn(require('electron'),[temporary,'--disable-gpu','--mute-audio'],{env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:35000});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('exit',code=>done({code,output}));});
        assert.equal(result.code,0,result.output);const config=JSON.parse(await readFile(join(profile,'eye-of-zomm-config.json'),'utf8'));assert.equal(config.screenReadingEnabled,phase==='initial');
    }
    console.log('Native screen-reading master: absent preference disabled, exact main IPC, red warning, checkbox permission, automatic active-tab source request without churn, all unchecked image paths denied and true/false restart persistence passed.');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-screen-master-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
