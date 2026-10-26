// Actual mounted Chromium DOM, production workspace module, synthetic wiki and
// logs, no desktop acquisition, game files, real account or external requests.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-discovery-stability-')),require=createRequire(import.meta.url);
const screenshotIndex=process.argv.indexOf('--screenshot'),screenshot=screenshotIndex<0?null:resolve(process.argv[screenshotIndex+1]);
const tradeScreenshotIndex=process.argv.indexOf('--trade-screenshot'),tradeScreenshot=tradeScreenshotIndex<0?null:resolve(process.argv[tradeScreenshotIndex+1]);
async function run({root,temporary,screenshot,tradeScreenshot}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const html='<!doctype html><link rel="stylesheet" href="/app/styles.css"><link rel="stylesheet" href="/app/capture-workspace.css"><section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace" hidden></div><div id="capture-settings" hidden></div>';
    let window;
    const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://fixture').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}const capturePath=pathname==='/fixture-capture'?screenshot:pathname==='/fixture-trade-capture'?tradeScreenshot:null;if(capturePath){await fs.mkdir(path.dirname(capturePath),{recursive:true});window.setContentSize(1400,pathname==='/fixture-capture'?1500:1100);await new Promise(done=>setTimeout(done,150));await fs.writeFile(capturePath,(await window.capturePage()).toPNG());window.setContentSize(1200,900);res.end('captured');return;}if(!/^\/(?:app\/[a-zA-Z0-9_./-]+\.(?:js|css|json|png)|tests\/discovery-queue-stability-scenario\.js)$/.test(pathname)){res.writeHead(404).end();return;}const target=path.resolve(root,'.'+pathname);if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.png')?'image/png':'application/json');res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    window=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(origin+'/')&&!details.url.startsWith('data:')}));
    const watchdog=setTimeout(()=>{console.error('Native discovery stability fixture exceeded 30 seconds');app.exit(1);},30000);
    try{
        await window.loadURL(origin+'/');
        const result=await window.webContents.executeJavaScript(`(async()=>{const {mountCaptureWorkspace}=await import('/app/capture-workspace.js');const {discoveryQueueStabilityScenario}=await import('/tests/discovery-queue-stability-scenario.js');return discoveryQueueStabilityScenario({document,mountCaptureWorkspace,assert(condition,message){if(!condition)throw Error(message);},onPending:async()=>{if(!${Boolean(screenshot)})return;const list=document.querySelector('[data-contribution-list]'),sidebar=list.parentElement,old=[list.style.cssText,sidebar.style.cssText],scroll=[list.scrollTop,sidebar.scrollTop];list.style.maxHeight='none';sidebar.style.maxHeight='none';await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));const response=await fetch('/fixture-capture');if(!response.ok)throw Error('Synthetic capture failed');list.style.cssText=old[0];sidebar.style.cssText=old[1];list.scrollTop=scroll[0];sidebar.scrollTop=scroll[1];},onTradeCleanup:async()=>{if(!${Boolean(tradeScreenshot)})return;await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));const response=await fetch('/fixture-trade-capture');if(!response.ok)throw Error('Synthetic trade capture failed');}});})()`);
        assert.equal(result.pendingAndUnavailableStable,true);assert.equal(result.calls.prepare,0);assert.equal(result.calls.submit,0);
        console.log(JSON.stringify({nativeWindow:true,isolatedProfile:true,externalRequests:false,...result}));
    }finally{clearTimeout(watchdog);window.destroy();await new Promise(done=>server.close(done));}
    app.exit(0);
}
try{
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-native-discovery-stability',version:'1.0.0',main:'main.cjs'}));
    await writeFile(join(temporary,'main.cjs'),`(${run.toString()})(${JSON.stringify({root,temporary,screenshot,tradeScreenshot})}).catch(error=>{console.error(error);require('electron').app.exit(1);});`);
    const child=spawn(process.env.EOZ_TEST_ELECTRON_BINARY||require('electron'),[temporary],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
    const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done);});if(stdout)console.log(stdout.trim());if(code!==0&&stderr)console.error(stderr.trim());assert.equal(code,0,'Native discovery stability fixture failed');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-discovery-stability-'));await rm(temporary,{recursive:true,force:true});}
