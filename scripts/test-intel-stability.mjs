// Actual Intel renderer and DOM scroll geometry over synthetic records only.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-intel-stability-'));
async function run({root,profile}){
    const {app,BrowserWindow}=require('electron'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
    app.setPath('userData',profile);await app.whenReady();
    const fixture=()=>{
        const item=(name,index)=>({name:`${name} drop ${index}`,stats:{HP:index+1},baseStats:{HP:index+1}});
        const npcs=Array.from({length:22},(_,i)=>{const name=`Mob ${String(i).padStart(2,'0')}`;return{id:name,name,distance:100-i,raidInstance:i===0,dropCount:5,drops:Array.from({length:3},(_,n)=>item(name,n))};}).reverse();
        window.intelState={sessionAvailable:true,preferences:{locked:false,fontScale:1,backgroundOpacity:.85},snapshot:{session:{zone:'Synthetic Keep',intel:{zone:'Synthetic Keep',itemTier:0,npcs,focusedNpcId:'',focusSequence:0,packVersion:'synthetic'}}}};
        window.eyeOfZommOverlay={getState:async()=>window.intelState,onState(callback){window.publishIntel=next=>{window.intelState=next;callback(next);};return()=>{};},async action(name,payload){if(name==='session:intel-drops'){if(window.failIntelNpc===payload.npc){window.failIntelNpc='';throw Error('Synthetic retryable drop failure');}return {items:Array.from({length:5},(_,n)=>item(payload.npc,n)),total:5};}return window.intelState;}};
    };
    const appRoot=path.join(root,'app'),server=http.createServer(async(req,res)=>{try{
        const pathname=new URL(req.url,'http://fixture').pathname;
        if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(`(${fixture.toString()})();import('./overlay.js');`);return;}
        const absolute=path.resolve(appRoot,'.'+pathname);if(!absolute.startsWith(appRoot+path.sep))throw Error('outside fixture root');
        const ext=path.extname(absolute);res.setHeader('Content-Type',ext==='.html'?'text/html':ext==='.css'?'text/css':ext==='.json'?'application/json':'text/javascript');
        const bytes=await fs.readFile(absolute);res.end(ext==='.html'?bytes.toString().replace('<script type="module" src="./overlay.js"></script>','<script type="module" src="./fixture.js"></script>'):bytes);
    }catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const window=new BrowserWindow({show:false,width:480,height:640,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(origin+'/')}));
    const execute=(fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const until=async(fn,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await new Promise(done=>setTimeout(done,25));}throw Error(`Timed out: ${label}`);};
    const anchor=()=>{const list=document.querySelector('#intel-body'),top=list.getBoundingClientRect().top,row=[...list.querySelectorAll('[data-intel-key]')].find(row=>row.getBoundingClientRect().bottom>top+2);return {key:row?.dataset.intelKey,offset:row?row.getBoundingClientRect().top-top:0,scroll:list.scrollTop,order:[...list.querySelectorAll('.npc-name')].map(row=>row.textContent)};};
    try{
        await window.loadURL(origin+'/overlay.html?panel=intel');await until(()=>execute(()=>document.querySelectorAll('.npc-row').length===22),'real Intel rows');
        await execute(()=>document.querySelector('[data-intel-section-toggle="raid"]').click());
        await execute(()=>[...document.querySelectorAll('.npc-row')].find(row=>row.querySelector('.npc-name').textContent==='Mob 05').querySelector('[data-intel-expand]').click());
        await until(()=>execute(()=>[...document.querySelectorAll('.npc-row')].find(row=>row.querySelector('.npc-name').textContent==='Mob 05').textContent.includes('drop 4')),'expanded complete loot');
        await execute(()=>{const list=document.querySelector('#intel-body'),row=[...list.querySelectorAll('.npc-row')].find(row=>row.querySelector('.npc-name').textContent==='Mob 11');list.scrollTop+=row.getBoundingClientRect().top-list.getBoundingClientRect().top+19;});
        // The window remains hidden; assert the focused-panel DOM branch using
        // an explicit ownership fixture, without requesting physical OS focus.
        await execute(()=>{Object.defineProperty(document,'hasFocus',{value:()=>true,configurable:true});[...document.querySelectorAll('.npc-row')].find(row=>row.querySelector('.npc-name').textContent==='Mob 11').querySelector('[data-intel-expand]').focus({preventScroll:true});});
        const before=await execute(anchor);assert(before.scroll>100);
        await execute(()=>{window.keptIntelRow=document.querySelector('.npc-row');window.intelGeometryReads=0;const original=Element.prototype.getBoundingClientRect;window.restoreIntelRect=()=>Element.prototype.getBoundingClientRect=original;Element.prototype.getBoundingClientRect=function(){window.intelGeometryReads++;return original.call(this);};});
        for(let n=0;n<20;n++)await execute(n=>{const next=structuredClone(window.intelState);next.snapshot.session.parse={damage:n};next.snapshot.session.intel.npcs.forEach(npc=>npc.distance+=1);window.publishIntel(next);},n);
        assert.deepEqual(await execute(()=>({reads:window.intelGeometryReads,sameRow:window.keptIntelRow===document.querySelector('.npc-row')})),{reads:0,sameRow:true},'Native heartbeat/distance updates retain the real DOM and avoid every row geometry walk');
        await execute(()=>{window.restoreIntelRect();});
        for(let n=0;n<12;n++){
            await execute(n=>{const next=structuredClone(window.intelState);next.snapshot.session.intel.npcs.reverse();next.snapshot.session.intel.npcs.forEach((npc,i)=>npc.distance=n*100+i+1);window.publishIntel(next);},n);
            const after=await execute(anchor);assert.equal(after.key,before.key,'routine location updates preserve the visible mob');assert(Math.abs(after.offset-before.offset)<1.1,'routine updates preserve its viewport offset');assert.deepEqual(after.order,before.order,'distance/order changes cannot reorder the list');
            assert.equal(await execute(()=>document.activeElement?.hasAttribute('data-intel-expand')&&document.activeElement.closest('.npc-row').querySelector('.npc-name').textContent==='Mob 11'),true,'Show More/Show Less keyboard focus survives DOM replacement');
        }
        assert.equal(await execute(()=>document.querySelector('[data-intel-section-toggle="raid"]').getAttribute('aria-expanded')),'false');
        assert.equal(await execute(()=>[...document.querySelectorAll('.npc-row')].find(row=>row.querySelector('.npc-name').textContent==='Mob 05').querySelector('[data-intel-expand]').getAttribute('aria-expanded')),'true');
        await execute(()=>{window.failIntelNpc='Mob 12';[...document.querySelectorAll('.npc-row')].find(row=>row.querySelector('.npc-name').textContent==='Mob 12').querySelector('[data-intel-expand]').click();});
        await until(()=>execute(()=>Boolean(document.querySelector('[data-intel-retry]'))),'retryable complete-drop error');
        await execute(()=>{document.querySelector('[data-intel-retry]').focus({preventScroll:true});const next=structuredClone(window.intelState);next.snapshot.session.intel.npcs.reverse();window.publishIntel(next);});
        assert.equal(await execute(()=>document.activeElement?.hasAttribute('data-intel-retry')),true,'Retry retains keyboard focus across routine snapshots');
        await execute(()=>{const next=structuredClone(window.intelState);next.snapshot.session.intel.focusedNpcId='Mob 19';next.snapshot.session.intel.focusSequence=1;window.publishIntel(next);});
        await until(()=>execute(()=>{const list=document.querySelector('#intel-body').getBoundingClientRect(),row=[...document.querySelectorAll('.npc-row')].find(row=>row.querySelector('.npc-name').textContent==='Mob 19').getBoundingClientRect();return row.top>=list.top-1&&row.bottom<=list.bottom+1;}),'an actual new focus event reveals the selected mob');
        await execute(()=>document.querySelector('#intel-body').scrollTop=180);const moved=await execute(anchor);
        await execute(()=>{const next=structuredClone(window.intelState);next.snapshot.session.intel.npcs.reverse();next.snapshot.session.intel.npcs.forEach(npc=>npc.distance+=3);window.publishIntel(next);});
        const settled=await execute(anchor);assert.equal(settled.key,moved.key,'an already handled focus does not pull a browsing user back');assert(Math.abs(settled.offset-moved.offset)<1.1);
        console.log('Native Intel stability: real DOM keeps stable rows, viewport anchor, expanded loot and collapsed section through 12 reordered distance updates; explicit focus jumps once.');
    }finally{window.destroy();server.closeAllConnections();await new Promise(done=>server.close(done));app.quit();}
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`const timer=setTimeout(()=>{console.error('Intel stability timeout');require('electron').app.exit(2);},45000);timer.unref();(${run.toString()})(${JSON.stringify({root,profile:join(temporary,'profile')})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry,'--disable-gpu'],{env,stdio:'inherit',windowsHide:true});const timeout=setTimeout(()=>child.kill(),55000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);done(code);});});assert.equal(code,0);
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-intel-stability-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
