// Real isolated Electron surface/preload with synthetic text only. No game,
// installed profile, desktop acquisition, wiki traffic or clipboard changes.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-spawn-prompt-'));
const at=process.argv.indexOf('--screenshots'),screenshots=at<0?null:resolve(process.argv[at+1]);
async function run({root,temporary,screenshots}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const {DiscoveryHost}=require(path.join(root,'desktop/discovery-host.cjs'));
    const resources=new Set(['spawn-prompt.html','spawn-prompt.js','spawn-prompt.css','wiki-discovery-ui.js']);
    const server=http.createServer(async(req,res)=>{try{const file=new URL(req.url,'http://fixture').pathname.slice(1);if(!file){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Synthetic main fixture</title>');return;}if(!resources.has(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join(root,'app',file)));}catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const main=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}}),host=new DiscoveryHost({electron:require('electron'),origin,getMainWindow:()=>main});
    const wait=ms=>new Promise(done=>setTimeout(done,ms)),until=async(fn,label)=>{const end=Date.now()+5000;while(Date.now()<end){if(await fn())return;await wait(25);}throw Error(`Timed out ${label}`);};
    let foreign;
    try{
        await main.loadURL(origin+'/');const mainEvent={sender:main.webContents,senderFrame:main.webContents.mainFrame};
        await host.handle(mainEvent,'show',{id:'spawn-synthetic',candidateId:'synthetic',kind:'monster',name:'a synthetic <b>spawn guardian</b>',zone:'Synthetic Grove',purpose:'spawn-location'});
        const popup=host.spawnWindow,execute=fn=>popup.webContents.executeJavaScript(`(${fn.toString()})()`);
        await until(()=>execute(()=>document.getElementById('name').textContent.includes('<b>spawn guardian</b>')),'literal synthetic name');
        assert.equal(await execute(()=>document.querySelector('h1 b')),null,'Untrusted names are literal text');
        assert.equal(popup.isVisible(),true);assert.equal(main.isVisible(),false);assert.equal(BrowserWindow.getFocusedWindow(),null,'Showing the prompt did not activate an app window');
        assert.equal(await execute(()=>typeof window.require),'undefined');assert.equal(await execute(()=>typeof window.eyeOfZommCapture),'undefined');
        const rect=await execute(()=>{const element=document.getElementById('prompt'),rect=element.getBoundingClientRect();return {width:rect.width,height:rect.height,scroll:document.documentElement.scrollHeight,client:document.documentElement.clientHeight,text:element.innerText};});assert(rect.width>250&&rect.height>=150&&rect.scroll<=rect.client+1,JSON.stringify(rect));assert(rect.text.includes('/loc'));
        popup.webContents.sendInputEvent({type:'mouseMove',x:30,y:50});await until(()=>execute(()=>document.getElementById('prompt').matches(':hover')),'actual native hover');
        await wait(15500);assert.equal(popup.isVisible(),true,'Hover pauses the real fifteen-second dismissal');assert.equal(host.spawnState().length,1);
        if(screenshots){await fs.mkdir(screenshots,{recursive:true});await fs.writeFile(path.join(screenshots,'unknown-monster-spawn.png'),(await popup.webContents.capturePage()).toPNG());}
        foreign=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'desktop/spawn-prompt-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});await foreign.loadURL(`${origin}/spawn-prompt.html`);
        const denied=await foreign.webContents.executeJavaScript("window.eyeOfZommSpawnPrompt.getState().then(()=>false,()=>true)");assert(denied,'Identical URL/preload in another window cannot access the popup bridge');foreign.destroy();foreign=null;
        const button=await execute(()=>{const r=document.getElementById('dismiss').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});popup.webContents.sendInputEvent({type:'mouseMove',...button});popup.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...button});popup.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...button});
        await until(()=>!popup.isVisible()&&!host.spawnState().length,'trusted native dismiss');assert.equal(main.isVisible(),false);
        console.log('Native spawn prompt: actual sandboxed preload/text, bottom-right non-activating window, 15s hover hold, foreign-window denial and trusted dismissal passed.');
    }finally{host.dispose();if(foreign&&!foreign.isDestroyed())foreign.destroy();if(!main.isDestroyed())main.destroy();await new Promise(done=>server.close(done));app.quit();}
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`process.stdout.on('error',()=>{});process.stderr.on('error',()=>{});(${run.toString()})(${JSON.stringify({root,temporary,screenshots})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});assert.equal(code,0,'Synthetic native spawn prompt passes');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
