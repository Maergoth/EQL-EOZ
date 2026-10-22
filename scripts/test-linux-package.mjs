import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// Launch the shipped Linux binary with its original resources/app.asar and
// sandbox intact. CDP drives public renderer controls; no product test endpoint,
// injected main, copied Electron executable, installation, or real game file.
assert.equal(process.platform,'linux','The packaged native smoke runs on Linux CI.');
const root=fileURLToPath(new URL('../',import.meta.url));
const temporary=await mkdtemp(join(tmpdir(),'eoz-linux-package-'));
let child,connection,output='';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(predicate,label)=>{const end=Date.now()+25000;while(Date.now()<end){if(child?.exitCode!==null&&child?.exitCode!==undefined)throw new Error(`Packaged process exited: ${output}`);const result=await predicate();if(result)return result;await wait(100);}throw new Error(`Timed out: ${label}\n${output}`);};
async function connect(url){
    const socket=new WebSocket(url),pending=new Map();let next=0;
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));const request=pending.get(message.id);if(!request)return;pending.delete(message.id);clearTimeout(request.timer);if(message.error)request.reject(new Error(message.error.message));else request.resolve(message.result);});
    socket.addEventListener('close',()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Packaged debug connection closed'));}pending.clear();});
    return {socket,async send(method,params={}){const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Packaged debug request timed out: ${method}`));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});},close(){socket.close();}};
}
try{
    const profile=join(temporary,'profile'),configRoot=join(temporary,'config'),game=join(temporary,'Synthetic Proton prefix','drive_c','EverQuest Legends'),logs=join(game,'logs'),log=join(logs,'eqlog_Fixture_Test.txt');
    await mkdir(profile,{recursive:true});await mkdir(logs,{recursive:true});await mkdir(join(game,'Maps'));
    await writeFile(log,'[Thu Oct 22 01:00:00 2026] Synthetic packaged Linux startup.\n');
    await writeFile(join(game,'Maps','mistmoore.txt'),'L -100,-100,0,100,100,0,150,160,180\n');
    const config={eqRootPath:game,logPath:log,logSelection:'manual'};
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify(config));
    // XDG isolation also bounds every Electron/Chromium fallback location.
    for(const name of ['EQLWiki - Eye of Zomm','eqlwiki-eye-of-zomm']){
        await mkdir(join(configRoot,name),{recursive:true});await writeFile(join(configRoot,name,'eye-of-zomm-config.json'),JSON.stringify(config));
    }
    const executable=join(root,'dist','linux-unpacked','eqlwiki-eye-of-zomm');
    child=spawn(executable,[`--user-data-dir=${profile}`,'--remote-debugging-port=0','--disable-gpu','--mute-audio'],{stdio:['ignore','pipe','pipe'],env:{...process.env,XDG_CONFIG_HOME:configRoot,XDG_CACHE_HOME:join(temporary,'cache')}});
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    let launchError;child.on('error',error=>{launchError=error;});
    const debug=await until(()=>{if(launchError)throw launchError;return output.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/[^\s]+)/);},'packaged Chromium debug endpoint');
    const page=await until(async()=>{try{return(await(await fetch(`http://127.0.0.1:${debug[2]}/json/list`)).json()).find(target=>target.type==='page'&&/^http:\/\/127\.0\.0\.1:\d+\/$/.test(target.url));}catch{return false;}},'packaged application page');
    connection=await connect(page.webSocketDebuggerUrl);
    const evaluate=async(fn,...args)=>{const response=await connection.send('Runtime.evaluate',{expression:`(${fn.toString()})(...${JSON.stringify(args)})`,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description||response.exceptionDetails.text);return response.result.value;};
    await until(()=>evaluate(()=>Boolean(window.eyeOfZommOverlays&&document.querySelector('#bridge-status')?.textContent==='Live log')),'real packaged log watcher');
    const info=await evaluate(async()=>({info:await(await fetch('/api/info')).json(),update:await window.eyeOfZommUpdates.getStatus(),require:typeof window.require}));
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    assert.equal(info.info.version,pkg.version);assert.equal(info.info.eqRootPath,game);assert.equal(info.info.logPath,log);assert.equal(info.require,'undefined');assert.equal(info.update.isPackaged,true);
    await until(()=>evaluate(async()=>Boolean((await window.eyeOfZommOverlays.getState()).sessionAvailable)),'initial packaged session');
    await appendFile(log,'[Thu Oct 22 01:00:01 2026] You have entered The Castle of Mistmoore.\n[Thu Oct 22 01:00:02 2026] Your Location is 10.00, 20.00, 0.00\n[Thu Oct 22 01:00:03 2026] You slash a synthetic skeleton for 17 points of damage.\n');
    const state=await until(()=>evaluate(async()=>{const state=await window.eyeOfZommOverlays.getState();return state.snapshot?.session?.parse?.totalDamage===17&&state.snapshot?.session?.map?.location?state:false;}),'packaged live log, zone and location synchronization');
    assert.match(state.snapshot.session.zone,/Mistmoore/i);
    await evaluate(async()=>{document.querySelector('[data-view="settings"]').click();await window.eyeOfZommOverlays.control('show-all');document.querySelector('#open-whats-new').click();});
    assert.equal(await evaluate(()=>Boolean(document.querySelector('.whats-new-dialog')?.open)),true,'Packaged modal opens');
    const count=await until(async()=>{const targets=await(await fetch(`http://127.0.0.1:${debug[2]}/json/list`)).json();const panels=targets.filter(target=>/\/overlay(?:-map)?\.html\?panel=/.test(target.url));return panels.length===4?panels.length:false;},'four packaged native panel renderers');
    console.log('EOZ_LINUX_PACKAGE_SMOKE='+JSON.stringify({ok:true,version:pkg.version,shippedExecutable:true,originalAsar:true,isPackaged:true,sandboxDisabled:false,syntheticProtonPath:true,liveLog:true,zone:true,location:true,nativePanels:count,modal:true,installed:false,waylandTested:false}));
}finally{
    connection?.close();
    if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([exited,wait(5000)]);if(child.exitCode===null){child.kill('SIGKILL');await exited;}}
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-linux-package-'));
    await rm(temporary,{recursive:true,force:true});
}
