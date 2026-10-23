// Actual Chromium DOM/pointer/modal behavior with a synthetic preview and capture
// API. No screen acquisition, wiki access, installed app or player profile.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {normalizeOcrArea} from '../app/capture-workspace.js';
assert.deepEqual(normalizeOcrArea({x:.1,y:.2,width:.3,height:.4}),{x:.1,y:.2,width:.3,height:.4});
for(const value of [null,{x:1,y:0,width:.0000001,height:1},{x:-.1,y:0,width:.4,height:.4},{x:0,y:0,width:0,height:1},{x:0,y:0,width:2,height:1},{x:NaN,y:0,width:1,height:1}])assert.equal(normalizeOcrArea(value),null);
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-calibration-ui-'));
const screenshotIndex=process.argv.indexOf('--screenshots'),screenshots=screenshotIndex<0?null:resolve(process.argv[screenshotIndex+1]);
async function run({root,temporary,screenshots}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));await app.whenReady();
    const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://fixture').pathname;
        if(name==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/app/styles.css"><link rel="stylesheet" href="/app/capture-workspace.css"></head><body><main style="padding:20px"><h1>Screen reading · synthetic calibration fixture</h1><section id="capture-settings"></section><section id="contribution-workspace" hidden></section><section id="character-workspace" hidden></section></main></body></html>');return;}
        if(!/^\/app\/[a-z.-]+\.(js|css|json)$/.test(name)){res.writeHead(404).end();return;}
        res.setHeader('Content-Type',name.endsWith('.css')?'text/css':'text/javascript');res.end(await fs.readFile(path.join(root,name)));
    }catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const window=new BrowserWindow({show:false,width:1024,height:768,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(origin+'/')}));
    const execute=(fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const until=async(fn,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await new Promise(done=>setTimeout(done,30));}const diagnostic=await execute(()=>({dialogOpen:document.querySelector('.ocr-area-dialog')?.open,dialogInert:document.querySelector('.ocr-area-dialog')?.inert,previewPresent:document.querySelector('[data-area-image]')?.hasAttribute('src'),calibrateDisabled:document.querySelector('[data-capture-calibrate]')?.disabled,percentValid:[...document.querySelectorAll('[data-area-percent]')].map(input=>({name:input.name,value:input.value,valid:input.validity.valid})),source:window.fixture?.state,calls:window.fixture?.calls.length,notices:window.fixture?.notices.slice(-3),closeSeen:window.fixture?.reopenCloseSeen,decodeHeld:Boolean(window.fixture?.releaseReopenDecode)}));throw Error(`Timed out: ${label}; synthetic state=${JSON.stringify(diagnostic)}`);};
    const click=selector=>execute(selector=>document.querySelector(selector).click(),selector);
    const open=async()=>{await click('[data-capture-calibrate]');await until(()=>execute(()=>document.querySelector('.ocr-area-dialog').open),'calibration opens');};
    const closed=()=>until(()=>execute(()=>!document.querySelector('.ocr-area-dialog').open),'calibration closes');
    const percent=values=>execute(values=>{for(const [key,value]of Object.entries(values)){const input=document.querySelector(`[data-area-percent="${key}"]`);input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}},values);
    try{
        await window.loadURL(origin);
        await execute(async()=>{
            const {mountCaptureWorkspace}=await import('/app/capture-workspace.js');
            const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;const ctx=canvas.getContext('2d');ctx.fillStyle='#0c1725';ctx.fillRect(0,0,1600,900);ctx.fillStyle='#192f48';ctx.fillRect(300,180,700,550);ctx.strokeStyle='#d8b75c';ctx.strokeRect(300,180,700,550);ctx.fillStyle='#f0d77f';ctx.font='32px sans-serif';ctx.fillText('SYNTHETIC EXAMINE PANE',330,235);ctx.fillStyle='white';for(const [index,text]of ['Synthetic Shield +3','Slot: SECONDARY','AC 12','HP 45','STR 8'].entries())ctx.fillText(text,330,310+index*65);
            let listener=()=>{},state={enabled:false,phase:'disabled',source:null,owner:null,sessionId:'',hasPreview:false};
            const source={id:'window:fixture',label:'EverQuest Synthetic Calibration',type:'window',recommended:true},calls=[],starts=[],notices=[];
            const emit=patch=>{state={...state,...patch};listener(state);};
            const api={status:async()=>state,sources:async()=>[{...source,name:source.label}],onStatus:fn=>{listener=fn;return()=>{listener=()=>{};};},onObservation:()=>()=>{},read:async()=>({records:[]}),preview:async()=>({dataUrl:canvas.toDataURL(),sourceSize:state.sourceSize,sourceId:state.source.id,owner:state.owner,sessionId:state.sessionId,region:state.region,referenceSize:state.referenceSize}),setRegion:async value=>{calls.push(value);emit({region:value.region,referenceSize:value.region?value.referenceSize:null,calibrationWarning:null});return state;},start:async value=>{starts.push(value);emit({enabled:true,phase:'running',source,owner:value.mode,sessionId:value.sessionId||`fixture-${starts.length}`,sourceSize:{width:1600,height:900},region:value.region||null,referenceSize:value.referenceSize||null,hasPreview:true});return state;}};
            const mount=()=>mountCaptureWorkspace({capture:api,wiki:null,share:null,notify:value=>notices.push(value)});
            window.fixture={api,source,calls,starts,notices,emit,mount,get state(){return state;},workspace:mount()};
        });
        assert.equal(await execute(()=>document.querySelector('[data-capture-calibrate]').disabled),true);
        await execute(()=>fixture.emit({enabled:true,phase:'running',source:fixture.source,owner:'contribution',sessionId:'initial',sourceSize:{width:1600,height:900},hasPreview:true}));
        await open();
        const size=await execute(()=>{const image=document.querySelector('[data-area-image]'),rect=image.getBoundingClientRect();return{width:rect.width,height:rect.height,ratio:image.naturalWidth/image.naturalHeight};});
        assert(size.width>0&&size.width<=1200&&size.height<=800);assert(Math.abs(size.width/size.height-size.ratio)<.01);
        await percent({x:10,y:20,width:30,height:40});await click('[data-area-save]');await closed();
        assert.deepEqual(await execute(()=>fixture.calls[0]),{region:{x:.1,y:.2,width:.3,height:.4},referenceSize:{width:1600,height:900},sourceId:'window:fixture',sessionId:'initial'});
        assert.equal(await execute(()=>document.querySelector('[data-area-image]').hasAttribute('src')),false);
        assert.equal(await execute(()=>Object.values(localStorage).some(value=>value.includes('data:image'))),false);
        await execute(()=>{fixture.workspace.dispose();fixture.workspace=fixture.mount();});
        await click('[data-capture-sources]');await click('[data-capture-start]');
        await until(()=>execute(()=>fixture.starts.length===1),'restored area start');
        assert.deepEqual(await execute(()=>fixture.starts[0].region),{x:.1,y:.2,width:.3,height:.4});
        await execute(()=>{const form=document.querySelector('[data-character-metadata]');for(const[key,value]of Object.entries({name:'Synthetic Calibration',server:'Example Realm',classes:'WAR',level:10,aaCount:0}))form.elements[key].value=String(value);form.requestSubmit();});
        await until(()=>execute(()=>document.querySelector('[data-walkthrough-source-select]')?.value==='window:fixture'),'Character inline recommended source');
        await click('[data-walkthrough-start-source]');await until(()=>execute(()=>fixture.starts.length===2),'character start');
        assert.equal(await execute(()=>Boolean(fixture.starts[1].region)),false,'Calibration is scoped to the capture owner');
        await open();
        await percent({x:90,width:30});await click('[data-area-save]');assert.equal(await execute(()=>fixture.calls.length),1,'Invalid rectangles never reach capture');
        assert.match(await execute(()=>document.querySelector('[data-area-status]').textContent),/at most 100/);
        await percent({x:0,y:0,width:.1,height:.1});await click('[data-area-save]');assert.equal(await execute(()=>fixture.calls.length),1);assert.match(await execute(()=>document.querySelector('[data-area-status]').textContent),/16 pixels/);
        const rect=await execute(()=>{const rect=document.querySelector('[data-area-stage]').getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};});
        for(const [type,x,y]of [['mouseDown',.18,.18],['mouseMove',.64,.84],['mouseUp',.64,.84]])window.webContents.sendInputEvent({type,x:Math.round(rect.x+rect.width*x),y:Math.round(rect.y+rect.height*y),button:'left',clickCount:1});
        await until(()=>execute(()=>Math.abs(Number(document.querySelector('[data-area-percent="width"]').value)-46)<1),'native pointer rectangle including the pane heading');
        await execute(()=>{document.querySelector('[data-area-status]').textContent='Synthetic preview · drag or adjust percentages before saving';document.documentElement.style.setProperty('--ui-font-scale',String(20/13));});
        if(screenshots){await fs.mkdir(screenshots,{recursive:true});for(const font of [20,13]){await execute(font=>{document.documentElement.style.setProperty('--ui-font-scale',String(font/13));document.querySelector('.ocr-area-dialog').scrollTop=0;},font);window.showInactive();await execute(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));await fs.writeFile(path.join(screenshots,font===13?'ocr-area-calibration.png':'ocr-area-calibration-20px.png'),(await window.capturePage()).toPNG());window.hide();}}
        // Capture Chromium's real queued close before the product listener,
        // then deliver that exact notification during a fresh, held decode.
        // This exercises the race without assuming platform task/microtask order.
        await execute(()=>{fixture.reopenCloseSeen=false;document.querySelector('.ocr-area-dialog').addEventListener('close',event=>{event.stopImmediatePropagation();fixture.reopenCloseSeen=event.isTrusted;fixture.reopenCloseEvent=event;},{once:true,capture:true});});
        await click('[data-area-save]');await closed();
        await until(()=>execute(()=>fixture.reopenCloseSeen),'native queued close captured after Save');
        await execute(()=>{const image=document.querySelector('[data-area-image]');fixture.originalDecode=image.decode.bind(image);image.decode=()=>new Promise(resolve=>fixture.releaseReopenDecode=resolve);});
        await click('[data-capture-calibrate]');
        await until(()=>execute(()=>Boolean(fixture.releaseReopenDecode)),'fresh preview decode held');
        await execute(()=>{document.querySelector('.ocr-area-dialog').dispatchEvent(fixture.reopenCloseEvent);delete fixture.reopenCloseEvent;});
        assert.equal(await execute(()=>document.querySelector('[data-area-image]').hasAttribute('src')),true,'The previous queued close must not clear a fresh preview while decoding');
        await execute(()=>{document.querySelector('[data-area-image]').decode=fixture.originalDecode;fixture.releaseReopenDecode();delete fixture.releaseReopenDecode;});
        await until(()=>execute(()=>document.querySelector('.ocr-area-dialog').open),'fresh preview survives the previous close event');
        assert.equal(await execute(()=>fixture.calls.length),2);
        await execute(()=>document.querySelector('.ocr-area-dialog').dispatchEvent(new Event('close')));
        assert.equal(await execute(()=>document.querySelector('.ocr-area-dialog').open&&document.querySelector('[data-area-image]').hasAttribute('src')),true,'A previous close notification cannot close the fresh modal');
        await click('[data-area-cancel]');await closed();
        await open();await click('[data-area-full]');await closed();assert.equal(await execute(()=>fixture.calls.at(-1).region),null);
        assert.equal(await execute(()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-ocr-areas-v1')).length),1,'Full frame clears only the active owner preference');
        await open();const before=await execute(()=>fixture.calls.length);await click('[data-area-cancel]');await closed();assert.equal(await execute(()=>fixture.calls.length),before);assert.equal(await execute(()=>document.querySelector('[data-area-image]').hasAttribute('src')),false);
        await execute(()=>fixture.emit({owner:'contribution',sessionId:'resize',sourceSize:{width:1600,height:900}}));await open();await execute(()=>fixture.emit({sourceSize:{width:1920,height:1080},region:null,calibrationWarning:'Source size changed; calibration reset.'}));await closed();assert.match(await execute(()=>document.querySelector('[data-capture-status]').textContent),/Source size changed/);
        assert.equal(await execute(()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-ocr-areas-v1')).length),0,'Resize warnings discard the obsolete source profile');
        await execute(()=>{fixture.workspace.dispose();localStorage.setItem('eql-eye-of-zomm-ocr-areas-v1',JSON.stringify([{key:JSON.stringify([fixture.source.label,fixture.source.type,'contribution']),region:{x:0,y:0,width:.001,height:.001},referenceSize:{width:1600,height:900}}]));fixture.workspace=fixture.mount();});await click('[data-capture-sources]');await click('[data-capture-start]');await until(()=>execute(()=>fixture.starts.length===3),'corrupt profile start');assert.equal(await execute(()=>Boolean(fixture.starts[2].region)),false,'A too-small cached area cannot prevent a normal full-frame start');
        await execute(()=>fixture.emit({owner:'contribution',sessionId:'changed',sourceSize:{width:1600,height:900}}));await open();window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await closed();
        for(let cycle=0;cycle<8;cycle++){await open();await click('[data-area-save]');await closed();}
        await execute(()=>{fixture.originalSetRegion=fixture.api.setRegion;fixture.originalPreview=fixture.api.preview;});
        for(const change of ['stop','source']){
            await execute(change=>{fixture.emit({enabled:true,phase:'running',hasPreview:true,source:fixture.source,owner:'contribution',sessionId:`pending-${change}`,sourceSize:{width:1600,height:900},region:null,calibrationWarning:null});fixture.api.setRegion=()=>{const stale={...fixture.state};return new Promise(resolve=>fixture.releaseSave=()=>resolve(stale));};},change);
            await open();await percent({x:10,y:20,width:30,height:40});
            const beforeSave=await execute(()=>({stored:localStorage.getItem('eql-eye-of-zomm-ocr-areas-v1'),successes:fixture.notices.filter(value=>/OCR area saved|OCR will read/.test(value)).length}));
            await click('[data-area-save]');await until(()=>execute(()=>Boolean(fixture.releaseSave)),'pending area save');
            await execute(change=>fixture.emit(change==='stop'?{enabled:false,phase:'disabled',hasPreview:false,source:null,owner:null,sessionId:''}:{source:{id:'window:other-synthetic',label:'Other synthetic source',type:'window'},sessionId:'other-session'}),change);
            await closed();await execute(()=>{fixture.releaseSave();delete fixture.releaseSave;});await until(()=>execute(()=>!document.querySelector('.ocr-area-dialog').inert),'stale save settled');
            assert.deepEqual(await execute(()=>({stored:localStorage.getItem('eql-eye-of-zomm-ocr-areas-v1'),successes:fixture.notices.filter(value=>/OCR area saved|OCR will read/.test(value)).length})),beforeSave,`A save interrupted by ${change} cannot persist a profile or announce success`);
            assert.equal(await execute(()=>document.querySelector('[data-area-image]').hasAttribute('src')||document.querySelector('.ocr-area-dialog').open),false,'Stale save cannot restore the preview');
        }
        await execute(()=>{fixture.api.setRegion=fixture.originalSetRegion;fixture.emit({enabled:true,phase:'running',hasPreview:true,source:fixture.source,owner:'contribution',sessionId:'preview-before-stop',sourceSize:{width:1600,height:900}});fixture.api.preview=async()=>{const preview=await fixture.originalPreview();return new Promise(resolve=>fixture.releaseStoppedPreview=()=>resolve(preview));};});
        await click('[data-capture-calibrate]');await until(()=>execute(()=>Boolean(fixture.releaseStoppedPreview)),'pending preview before Stop');
        await execute(()=>{fixture.emit({enabled:false,phase:'disabled',hasPreview:false,source:null,owner:null,sessionId:''});fixture.releaseStoppedPreview();delete fixture.releaseStoppedPreview;});
        await until(()=>execute(()=>!document.querySelector('[data-area-image]').hasAttribute('src')&&!document.querySelector('.ocr-area-dialog').open),'late stopped preview remains closed');
        assert.equal(await execute(()=>Object.values(localStorage).some(value=>value.includes('data:image'))),false,'A stopped preview is never persisted');
        await execute(()=>fixture.emit({enabled:true,phase:'running',hasPreview:true,source:fixture.source,owner:'contribution',sessionId:'preview-before-dispose',sourceSize:{width:1600,height:900}}));
        await execute(()=>{fixture.api.preview=()=>new Promise(resolve=>fixture.releasePreview=resolve);});await click('[data-capture-calibrate]');await until(()=>execute(()=>Boolean(fixture.releasePreview)),'delayed preview');
        await execute(()=>{fixture.workspace.dispose();fixture.releasePreview({dataUrl:'data:image/png;base64,AAAA',sourceSize:{width:1,height:1}});});
        assert.equal(await execute(()=>document.querySelector('.ocr-area-dialog')),null,'Dispose cannot restore an asynchronous preview');
        console.log('OCR area calibration: native modal/pointer and percent controls, queued-close reopening and rapid Save cycles, bounded proportional preview, source/owner persistence, full frame, invalid rectangle, source resize, pending Save/preview Stop/source races, Escape/Cancel and dispose privacy passed.');
    }finally{window.destroy();await new Promise(done=>server.close(done));app.quit();}
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,screenshots})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});assert.equal(code,0,'Calibration renderer regression passes');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
