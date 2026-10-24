// Actual main/preload and process restarts, with a disposable synthetic profile.
// The parent owns every Electron child, pipe, watchdog and temporary pathname.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-character-storage-'));
const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),require=createRequire(import.meta.url),proofs=[];
let occupied;
async function native({root,temporary,profile,port,phase,seed}){
    const electron=require('electron'),{app,BrowserWindow,session}=electron,Module=require('node:module'),path=require('node:path'),fs=require('node:fs/promises'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',profile);app.disableHardwareAcceleration();
    const watchdog=setTimeout(()=>{console.error('Character storage fixture watchdog');app.exit(2);},30000);watchdog.unref();
    const original=Module._load;function HiddenWindow(options){const win=new BrowserWindow({...options,show:false});win.show=()=>{};win.focus=()=>{};return win;}Object.setPrototypeOf(HiddenWindow,BrowserWindow);HiddenWindow.prototype=BrowserWindow.prototype;
    Module._load=function(name,...args){return name==='electron'?{...electron,BrowserWindow:HiddenWindow}:original.call(this,name,...args);};
    const create=http.createServer;http.createServer=function(...args){const server=create.apply(this,args),listen=server.listen;server.listen=function(...values){if(values[0]===53147)values[0]=port;return listen.apply(this,values);};return server;};
    global.fetch=async()=>{throw Error('No external fixture requests');};
    await app.whenReady();session.defaultSession.webRequest.onBeforeRequest((details,done)=>{try{const url=new URL(details.url);done({cancel:['http:','https:'].includes(url.protocol)&&url.hostname!=='127.0.0.1'});}catch{done({cancel:false});}});
    const wait=ms=>new Promise(done=>setTimeout(done,ms)),until=async(fn,label)=>{const end=Date.now()+15000;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch{}await wait(30);}throw Error(label);},execute=(win,fn,...args)=>win.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const work=(async()=>{
        const owner=await until(()=>BrowserWindow.getAllWindows().find(win=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(win.webContents.getURL())),'actual main root');
        await until(()=>execute(owner,()=>document.readyState==='complete'&&Boolean(document.querySelector('#character-workspace [data-character-inventory]'))),'actual Character workspace');
        const origin=new URL(owner.webContents.getURL()).origin;
        const result=await execute(owner,async(phase,seed)=>{
            const api=window.eyeOfZommCharacterStorage;if(!api)throw Error('Missing shipped Character persistence bridge');
            const before=await api.read();if(before.error)throw Error(before.error);
            if(phase==='seed')for(const [key,value]of Object.entries(seed)){localStorage.setItem(key,value);await api.write({key,value});}
            const values=(await api.read()).values;
            return {values,origin:location.origin,legacy:localStorage.getItem('synthetic-origin-only-marker')};
        },phase,seed);
        if(phase==='seed')await execute(owner,()=>localStorage.setItem('synthetic-origin-only-marker','first-origin'));
        for(const [key,value]of Object.entries(seed))assert.equal(result.values[key],value,`${phase}: exact Character/walkthrough values survive relaunch`);
        if(phase!=='seed')await until(()=>execute(owner,()=>document.querySelector('[data-character-identity]')?.textContent.includes('Storage Fixture')&&Boolean(document.querySelector('[data-slot-id="finger1"] [data-equipped-card]'))),'The actual Character UI restores private-file metadata and equipped gear');
        if(phase==='same')assert.equal(result.legacy,'first-origin','Real process restart on the same origin retains ordinary localStorage');
        if(phase==='fallback')assert.equal(result.legacy,null,'An occupied preferred port creates a separate empty browser origin');
        const foreign=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
        try{await foreign.loadURL(origin+'/overlay.html?panel=parse');const denied=await execute(foreign,async()=>{const api=window.eyeOfZommCharacterStorage;return Promise.all([()=>api.read(),()=>api.write({key:'eql-eye-of-zomm-character-v1',value:'bad'}),()=>api.flush()].map(async fn=>{try{await fn();return false;}catch{return true;}}));});assert.deepEqual(denied,[true,true,true],'A foreign renderer cannot access Character files');}finally{foreign.destroy();}
        await execute(owner,()=>window.eyeOfZommCharacterStorage.flush());
        await fs.writeFile(path.join(temporary,`result-${phase}.json`),JSON.stringify({ok:true,phase,origin,fileAuthoritative:true,foreignDenied:true,legacySameOrigin:phase==='same',fallbackOrigin:phase==='fallback',actualCharacterUi:phase!=='seed'}));
        clearTimeout(watchdog);app.quit();
    })();
    require(path.join(root,'desktop/main.cjs'));
    await work;
}
try{
    await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});await writeFile(join(game,'Logs','eqlog_Storage_Fixture.txt'),'');
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-character-storage-fixture',version:pkg.version,main:'main.cjs'}));
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:join(game,'Logs','eqlog_Storage_Fixture.txt'),frontendCacheVersion:pkg.version}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,version:'synthetic-character-storage',sample:true},zones:[],npcs:[],items:[]}));
    const seed={
        'eql-eye-of-zomm-character-v1':JSON.stringify({schemaVersion:1,metadata:{name:'Storage Fixture',server:'Synthetic',classes:['WAR'],level:60,aaCount:25},candidates:[{id:'storage-ring',name:'Synthetic Storage Ring',wikiTitle:'Synthetic Storage Ring',catalogIdentity:{name:'Synthetic Storage Ring',wikiTitle:'Synthetic Storage Ring',match:'manual'},slots:['FINGER'],tier:4,fraction:0,observedStats:{HP:40},augmentStatus:'none'}],equipment:{finger1:'storage-ring'},statSnapshots:{base:{stats:{HP:100},confirmed:true}},sequence:1}),
        'eql-eye-of-zomm-character-walkthrough-v1':JSON.stringify({schemaVersion:1,active:false,step:'details',items:[],ignored:[{name:'synthetic removed ring',tier:3,fraction:0,augments:[]}]})
    };
    const probe=http.createServer();await new Promise(done=>probe.listen(0,'127.0.0.1',done));const port=probe.address().port;await new Promise(done=>probe.close(done));
    for(const phase of ['seed','same','fallback']){
        if(phase==='same'){const config=JSON.parse(await readFile(join(profile,'eye-of-zomm-config.json'),'utf8'));config.frontendCacheVersion='synthetic-previous-version';await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify(config));}
        if(phase==='fallback'){occupied=http.createServer((_req,res)=>res.writeHead(503).end());await new Promise(done=>occupied.listen(port,'127.0.0.1',done));}
        await writeFile(join(temporary,'main.cjs'),`(${native.toString()})(${JSON.stringify({root,temporary,profile,port,phase,seed})}).catch(error=>{console.error(error.stack||String(error));require('electron').app.exit(1);});`);
        const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const result=await new Promise((done,reject)=>{const child=spawn(require('electron'),[temporary,'--disable-gpu','--mute-audio'],{env,windowsHide:true,stdio:['ignore','pipe','pipe'],timeout:40000});let output='';const collect=chunk=>{output=(output+chunk).slice(-200000);};child.stdout.on('data',collect);child.stderr.on('data',collect);child.once('error',reject);child.once('close',code=>done({code,output}));});
        assert.equal(result.code,0,result.output);proofs.push(JSON.parse(await readFile(join(temporary,`result-${phase}.json`),'utf8')));
        assert.equal(JSON.parse(await readFile(join(profile,'eye-of-zomm-config.json'),'utf8')).frontendCacheVersion,pkg.version,'Real cache-upgrade handling completes without clearing Character data');
    }
    assert.equal(proofs[0].origin,proofs[1].origin);assert.notEqual(proofs[1].origin,proofs[2].origin);
    console.log('EOZ_CHARACTER_STORAGE='+JSON.stringify({ok:true,actualMainPreload:true,processes:3,cacheUpgrade:true,occupiedPreferredPort:true,privateFileSurvives:true,foreignFramesDenied:true,proofs,installedProfile:false}));
}finally{
    if(occupied)await new Promise(done=>occupied.close(done));
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert.ok(basename(temporary).startsWith('eoz-character-storage-'));
    await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
