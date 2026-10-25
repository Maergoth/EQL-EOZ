// Actual application log owner, IPC broker and native map. All files/profile
// records are synthetic; external network and foreground window display are off.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(join(tmpdir(),'eoz-map-latency-'));
const baseline=process.argv.includes('--baseline');
const screenshotIndex=process.argv.indexOf('--screenshots'),screenshots=screenshotIndex<0?null:resolve(process.argv[screenshotIndex+1]);
async function run({root,log,otherLog,baseline,screenshots}){
    const electron=require('electron'),{app,BrowserWindow,dialog}=electron,fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
    BrowserWindow.prototype.show=()=>{};BrowserWindow.prototype.showInactive=()=>{};
    global.fetch=async()=>{throw Error('External network disabled for synthetic map timing');};
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[otherLog]});
    const wait=ms=>new Promise(done=>setTimeout(done,ms));
    const until=async(fn,label,timeout=10000)=>{const deadline=Date.now()+timeout;while(Date.now()<deadline){const value=await fn();if(value)return value;await wait(10);}throw Error('Timed out: '+label);};
    const execute=(window,fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const panels=()=>Object.fromEntries(BrowserWindow.getAllWindows().filter(window=>/\/overlay(?:-map)?\.html\?panel=/.test(window.webContents.getURL())).map(window=>[new URL(window.webContents.getURL()).searchParams.get('panel'),window]));
    let owner;
    async function inspect(){
        owner=await until(()=>BrowserWindow.getAllWindows().find(window=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())),'main owner');
        await until(async()=>execute(owner,()=>document.querySelector('#bridge-status')?.textContent==='Live log'),'first read');
        const map=await until(()=>panels().map,'restored native map');
        await until(async()=>execute(map,()=>Boolean(document.querySelector('.native-map-note'))),'map component');
        await execute(owner,()=>{
            window.mapTiming={reads:[]};const original=window.fetch.bind(window);
            window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).includes('/api/log?')){const json=response.json.bind(response);response.json=async()=>{const value=await json();mapTiming.reads.push({at:Date.now(),startOffset:value.startOffset,offset:value.newOffset,length:value.length,locations:[...String(value.text||'').matchAll(/Your Location is ([^\r\n]+)/g)].map(match=>match[1])});return value;};}return response;};
        });
        await execute(map,()=>{
            window.mapTiming={states:[],draws:[]};window.eyeOfZommOverlay.onState(state=>{const location=state.snapshot?.session?.map?.location;mapTiming.states.push({at:Date.now(),sequence:state.snapshot?.sequence,location});});
            new MutationObserver(()=>{const text=document.querySelector('.native-map-note')?.textContent||'';if(text!==mapTiming.draws.at(-1)?.text)mapTiming.draws.push({at:Date.now(),text});}).observe(document.querySelector('.native-map-note'),{childList:true,subtree:true,characterData:true});
        });
        const append=async(text,file=log)=>{const stamp=new Date().toISOString(),at=Date.now();await fs.appendFile(file,`[${stamp}] ${text}\n`);return at;};
        const state=()=>execute(owner,()=>window.eyeOfZommOverlays.getState());
        await append('You have entered Synthetic Vale.');await append('Your Location is 0, 0, 0');
        await until(async()=>execute(map,()=>document.querySelector('.native-map-note')?.textContent.includes('/loc 0.0, 0.0, 0.0')),'initial map position');
        const measurements=[];
        for(let index=1;index<=4;index++){
            const before=(await state()).snapshot.sequence;
            await until(async()=>(await state()).snapshot.sequence>before,'next idle heartbeat');
            const value=index*10,text=`${value}, ${value}, 0`,appendedAt=await append('Your Location is '+text);
            const drawn=await until(async()=>execute(map,text=>mapTiming.draws.find(row=>row.text.includes(text)),`/loc ${value}.0, ${value}.0, 0.0`),'native position '+value);
            const read=await execute(owner,text=>mapTiming.reads.find(row=>row.locations.includes(text)),text);
            assert(read,'Actual log read must contain each sample');
            measurements.push({appendToReadMs:read.at-appendedAt,readToDrawMs:drawn.at-read.at,appendToDrawMs:drawn.at-appendedAt});
            if(!baseline)assert(drawn.at-read.at<350,'A read location must not wait for the1s heartbeat: '+JSON.stringify(measurements.at(-1)));
        }
        const duplicateStart=(await state()).snapshot.sequence;
        await fs.appendFile(log,Array.from({length:100},()=>`[${new Date().toISOString()}] Your Location is 40, 40, 0\n`).join(''));await wait(1150);
        const duplicatePublishes=(await state()).snapshot.sequence-duplicateStart;
        if(!baseline)assert(duplicatePublishes<=2,'Duplicate coordinates use only the unchanged idle heartbeat');
        const backlogStart=Date.now(),beforeBacklog=await execute(owner,()=>mapTiming.reads.length);
        const padding=`[${new Date().toISOString()}] Synthetic backlog padding ${'.'.repeat(4020)}\n`;
        await fs.appendFile(log,padding.repeat(1700)+`[${new Date().toISOString()}] Your Location is 60, 70, 0\n`);
        const caughtUp=await until(async()=>execute(map,()=>mapTiming.draws.find(row=>row.text.includes('/loc 60.0, 70.0, 0.0'))),'bounded unread tail');
        const backlogReads=await execute(owner,start=>mapTiming.reads.slice(start).filter(row=>row.offset>row.startOffset),beforeBacklog);
        assert(backlogReads.length>=4,'The native fixture crosses multiple production 2MiB reads');
        assert(backlogReads.every(row=>row.offset-row.startOffset<=2*1024*1024),'Every real log API response retains its 2MiB bound');
        const backlogMs=caughtUp.at-backlogStart;
        if(!baseline)assert(backlogReads.at(-1).at-backlogReads[0].at<1300,'A known tail drains without waiting the full interval after every chunk');
        // A real manually selected replacement log in the same zone has no
        // location. The native map must clear its previous character's marker.
        await execute(owner,()=>document.querySelector('#change-log').click());
        await until(async()=>execute(owner,()=>document.querySelector('#settings-log-path')?.textContent.endsWith('eqlog_Other_Synthetic.txt')),'replacement log');
        await until(async()=>{const next=await state();return next.snapshot?.session?.character==='Other'&&next.snapshot?.session?.map?.location===null;},'old source marker clears');
        await append('Your Location is 80, 90, 0',otherLog);
        await until(async()=>execute(map,()=>document.querySelector('.native-map-note')?.textContent.includes('/loc 80.0, 90.0, 0.0')),'replacement location');
        const cyan=await execute(map,()=>{const canvas=document.querySelector('canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<160&&pixels[i+1]>170&&pixels[i+2]>220&&pixels[i+3]>200)count++;return count;});
        assert(cyan>5,'The actual canvas renders the native position marker');
        if(screenshots){await fs.mkdir(screenshots,{recursive:true});map.webContents.invalidate();await wait(100);await map.capturePage(undefined,{stayHidden:true,stayAwake:true});const image=await map.capturePage(undefined,{stayHidden:true,stayAwake:true});assert(!image.isEmpty());await fs.writeFile(path.join(screenshots,'native-map-location.png'),image.toPNG());}
        console.log('EOZ_MAP_LOCATION_TIMING='+JSON.stringify({ok:true,baseline,measurements,duplicatePublishes,backlogMs,backlogReads:backlogReads.length,restoredVisible:true,sourceSwitch:true,canvasMarker:true}));
    }
    let started=false;app.on('browser-window-created',()=>{if(!started){started=true;void inspect().then(()=>app.exit(0)).catch(error=>{console.error(error.stack);app.exit(1);});}});
    setTimeout(()=>{console.error('Map timing exceeded45seconds');app.exit(2);},45000).unref();
    require(path.join(root,'desktop/main.cjs'));
}
try{
    const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),logs=join(game,'Logs'),maps=join(game,'Maps');
    await mkdir(join(profile,'data'),{recursive:true});await mkdir(logs,{recursive:true});await mkdir(maps);
    const log=join(logs,'eqlog_Fixture_Synthetic.txt'),otherLog=join(logs,'eqlog_Other_Synthetic.txt');
    await writeFile(log,`[${new Date().toISOString()}] Synthetic timing starts.\n`);await writeFile(otherLog,`[${new Date().toISOString()}] You have entered Synthetic Vale.\n`);
    await writeFile(join(maps,'synthetic.txt'),'L -100,-100,0,100,100,0,150,150,150\n');
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,version:'synthetic-map-latency',currentEra:'Classic',sample:true},zones:[{name:'Synthetic Vale',viewerName:'synthetic',aliases:['synthetic']}],npcs:[],items:[],icons:{}}));
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,logSelection:'manual'}));
    await writeFile(join(profile,'eye-of-zomm-overlays.json'),JSON.stringify({schemaVersion:1,panels:{map:{visible:true,locked:true}}}));
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'synthetic-map-latency',version:pkg.version,main:'main.cjs'}));
    await writeFile(join(temporary,'main.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});app.disableHardwareAcceleration();(${run.toString()})(${JSON.stringify({root,log,otherLog,baseline,screenshots})}).catch(error=>{console.error(error.stack);app.exit(1);});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const result=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[temporary,'--disable-gpu','--mute-audio'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('exit',code=>done({code,output}));});
    assert.equal(result.code,0,result.output);assert.match(result.output,/EOZ_MAP_LOCATION_TIMING=.*"ok":true/);console.log(result.output.match(/EOZ_MAP_LOCATION_TIMING=.*/)[0]);
}finally{
    if(dirname(resolve(temporary))!==resolve(tmpdir())||!basename(temporary).startsWith('eoz-map-latency-'))throw Error('Unexpected synthetic cleanup path');
    await rm(temporary,{recursive:true,force:true});
}
