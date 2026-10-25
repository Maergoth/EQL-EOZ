// Actual Chromium Character walkthrough with synthetic observations and fake
// capture/share boundaries. No desktop acquisition, wiki, installed profile,
// player pixels, filesystem save dialog or system clipboard is used.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temporary=await mkdtemp(join(tmpdir(),'eoz-character-walkthrough-'));
const screenshotIndex=process.argv.indexOf('--screenshots');
if(screenshotIndex>=0)assert(process.argv[screenshotIndex+1],'--screenshots requires an output directory');
const screenshots=screenshotIndex<0?null:resolve(process.argv[screenshotIndex+1]);
const resultFile=join(temporary,'result.json');

async function run({root,temporary,screenshots}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));
    app.on('window-all-closed',()=>{});
    await app.whenReady();
    const errors=[],requests=[];
    const server=http.createServer(async(req,res)=>{try{
        const name=new URL(req.url,'http://fixture').pathname;
        if(name==='/'){
            res.setHeader('Content-Type','text/html');
            res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app/styles.css"><link rel="stylesheet" href="/app/capture-workspace.css"><style>html,body{height:auto;min-height:100%;overflow:auto}body{display:block}.fixture-shell{max-width:1400px;margin:auto;padding:20px}.fixture-heading{display:flex;align-items:baseline;justify-content:space-between;gap:16px;color:var(--gold2)}.fixture-heading small{color:var(--muted);font-size:12px}#capture-settings,#contribution-workspace{display:none}</style></head><body><main class="fixture-shell"><div class="fixture-heading"><h1>Eye of Zomm · Character</h1><small>Synthetic walkthrough fixture</small></div><section id="capture-settings"></section><section id="contribution-workspace" hidden></section><section id="character-workspace"></section></main></body></html>');return;
        }
        if(!/^\/app\/[a-z.-]+\.(js|css|json)$/.test(name)&&!['/app/vendor/item-scaling-core.js','/app/vendor/item-scaling-rules.js'].includes(name)){res.writeHead(404).end();return;}
        res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/javascript');
        res.end(await fs.readFile(path.join(root,name)));
    }catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));
    const origin=`http://127.0.0.1:${server.address().port}`;
    // This serves the Character component, not the normal main-window chrome.
    // A framed 1024px content request needs a wider outer window; Windows clamps
    // that outer window to a 1024px CI display and silently shrinks the content.
    // A frameless fixture preserves the real supported 1024px content contract.
    const window=new BrowserWindow({show:false,frame:false,useContentSize:true,width:1024,height:900,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.on('console-message',(_event,...args)=>{const text=args.map(value=>typeof value==='string'?value:JSON.stringify(value)).join(' ');if(errors.length<20)errors.push(text.slice(0,600));});
    window.webContents.on('render-process-gone',(_event,details)=>errors.push(`renderer: ${details.reason}`));
    window.webContents.on('did-fail-load',(_event,code,description,url)=>errors.push(`load ${code}: ${description} ${url}`));
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>{const allowed=details.url.startsWith(origin+'/')||details.url.startsWith('data:image/png;');if(!allowed)requests.push(details.url.slice(0,200));done({cancel:!allowed});});
    const execute=(fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const diagnostic=()=>execute(()=>({flow:window.fixture?.flow(),state:window.fixture?.state,metadata:window.fixture?.model().metadata,candidates:window.fixture?.model().candidates.map(c=>({id:c.id,name:c.name,slots:c.slots,stats:c.observedStats})),notices:window.fixture?.notices.slice(-4),status:document.querySelector('[data-walkthrough-status]')?.textContent,dialog:document.querySelector('.character-share-dialog')?.open,pointer:window.fixture?.pointerEvents})).catch(()=>null);
    const until=async(fn,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await new Promise(done=>setTimeout(done,25));}throw Error(`Timed out: ${label}; synthetic state=${JSON.stringify(await diagnostic())}; renderer=${JSON.stringify(errors)}`);};
    const click=selector=>execute(selector=>{const node=document.querySelector(selector);if(!node)throw Error(`Missing ${selector}`);node.click();},selector);
    const equipSelected=async slot=>{await execute(slot=>{const select=document.querySelector('[data-card-equip-slot]');if(!select)throw Error('Selected known item has no Equip control');select.value=slot;if(select.value!==slot)throw Error(`Selected item cannot use ${slot}`);select.dispatchEvent(new Event('change',{bubbles:true}));},slot);await click('[data-card-equip]');};
    const editCapturedValues=()=>execute(()=>{const details=[...document.querySelectorAll('[data-character-editor] details')].find(node=>node.querySelector(':scope > summary')?.textContent.includes('Edit captured values'));if(details&&!details.open)details.querySelector(':scope > summary').click();});
    const step=name=>until(()=>execute(name=>fixture.flow().step===name,name),`walkthrough ${name}`);
    const model=()=>execute(()=>fixture.model());
    const observe=(kind,fields,patch={})=>execute((kind,fields,patch)=>fixture.observe(kind,fields,patch),kind,fields,patch);
    const snapshot=async(name,{font=13,selector='.character-walkthrough'}={})=>{
        await execute((font,selector)=>{document.documentElement.style.setProperty('--ui-font-scale',String(font/13));document.querySelector(selector)?.scrollIntoView({block:'start'});for(const a of document.getAnimations())if(a.effect.getTiming().iterations!==Infinity)a.finish();},font,selector);
        const layout=await execute(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
        assert(layout.width>=1024&&Math.max(layout.scroll,layout.body)<=layout.width+2,`Character layout fits ${font}px at ${layout.width}px: ${JSON.stringify(layout)}`);
        if(!screenshots)return;
        await fs.mkdir(screenshots,{recursive:true});window.showInactive();
        await execute(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        window.webContents.invalidate();await new Promise(done=>setTimeout(done,100));
        await fs.writeFile(path.join(screenshots,name),(await window.capturePage()).toPNG());window.hide();
    };
    try{
        await window.loadURL(origin);
        await execute(async()=>{
            const {mountCaptureWorkspace}=await import('/app/capture-workspace.js');
            let statusListener=()=>{},observationListener=()=>{},sequence=0;
            let state={enabled:false,phase:'disabled',owner:null,source:null,sessionId:'',hasPreview:false,generation:0,generationStartedAt:0};
            const source={id:'window:synthetic-game',name:'EverQuest · Synthetic Fixture',label:'EverQuest · Synthetic Fixture',type:'window',recommended:true};
            const starts=[],stops=[],notices=[],reads=[],imports=[],fileReads=[],navigations=[],saves=[];
            const emit=patch=>{state={...state,...patch};statusListener(state);};
            const model=()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-character-v1'));
            const flow=()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-character-walkthrough-v1'))||{step:'details',active:false};
            const observe=(kind,values,patch={})=>{const observation={id:`synthetic-${++sequence}`,sequence,kind:'ocr',owner:'character',sessionId:flow().sessionId,capturedAt:new Date().toISOString(),input:{sourceId:state.source?.id,captureGeneration:state.generation},parser:{version:'synthetic'},subject:{kind,name:values.name||'Synthetic character'},fields:Object.entries(values).map(([key,value])=>({key,value,confidence:90})),...patch};observationListener(observation);return observation;};
            const api={status:async()=>state,sources:async()=>[source],onStatus:fn=>{statusListener=fn;return()=>{};},onObservation:fn=>{observationListener=fn;return()=>{};},read:async value=>{reads.push(value);return{records:[],lastSequence:sequence};},observeLog:async()=>({accepted:false}),importImage:async value=>{imports.push(value);return{records:[]};},start:async value=>{starts.push(value);emit({enabled:true,phase:'running',owner:value.mode,source,sessionId:value.sessionId,generation:state.generation+1,generationStartedAt:Date.now()});return state;},stop:async value=>{stops.push(value);emit({enabled:false,phase:'disabled',owner:null,source:null,sessionId:''});return state;}};
            const labels=['Any Slot','Ear','Head','Face','Ear','Neck','Shoulders','Arms','Back','Wrist','Wrist','Range','Hands','Primary','Secondary','Fingers','Fingers','Chest','Legs','Feet','Waist','Any Slot','Ammo'];
            const row=(loc,name='Empty',id=0,count=0)=>[loc,name,id,count,11].join('\t');
            const rows=labels.flatMap((label,i)=>i===1?[row(label,'Synthetic Ear Stone +4',200,1),row('Ear-Slot7','Synthetic Rune (Exaltation)',202,1),row('Ear-Slot10','Synthetic Missing Rune (Exaltation)',203,1)]:i===4?[row(label,'Synthetic Ear Stone +5',200,1)]:i===2?[row(label,'Synthetic Missing Hood +2',204,1)]:i===19?[row(label,'Synthetic Trail Boots +3',201,1)]:[row(label)]);
            const exportText=['Location\tName\tID\tCount\tSlots',...rows,row('General 1','Synthetic Loose Stone',205,1),'','KeyRing\tName\tID\t','Equipment\tSynthetic Keyring Blade\t206'].join('\r\n');
            const catalog=[{name:'Synthetic Ear Stone',wikiTitle:'Synthetic Ear Stone',slots:['EAR'],stats:{HP:999999}},{name:'Synthetic Trail Boots',wikiTitle:'Synthetic Trail Boots',slots:['FEET'],stats:{HP:999999}}];
            const pack={meta:{sample:false,wikiEntitiesComplete:true,manifestVersion:'synthetic-097'},items:catalog,npcs:[],zones:[],wikiEntities:{items:[...catalog.map(c=>c.name),'Synthetic Rune (Exaltation)','Synthetic Loose Stone','Synthetic Keyring Blade'],npcs:[],titles:[]},icons:{}};
            const inventory={read:async value=>{fileReads.push(value);if(fixture.fileMode==='defer')return new Promise(resolve=>fixture.resolveFile=resolve);if(fixture.fileMode==='missing')return{ok:false,notFound:true};if(fixture.fileMode==='cancel')return{ok:false,cancelled:true};return{ok:true,text:fixture.fileMode==='malformed'?'Location\tName\tID\tCount\tSlots\nHead\tBad\t1\t1\t0':exportText,file:{name:'Synthetic_Realm-Inventory.txt',bytes:exportText.length,sha256:'a'.repeat(64),modifiedAt:fixture.fileMode==='old'?1:Date.now()}};}};
            const share={savePng:async png=>{saves.push(png.length);return{ok:true};},copyPng:async()=>({ok:true})};
            const mount=()=>mountCaptureWorkspace({capture:api,inventory,wiki:null,share,getPack:()=>pack,notify:message=>notices.push(message),navigate:view=>navigations.push(view)});
            window.confirm=()=>true;
            window.fixture={source,starts,stops,notices,reads,imports,fileReads,navigations,saves,emit,observe,model,flow,mount,fileMode:'missing',get state(){return state;}};fixture.workspace=mount();
        });
        await until(()=>execute(()=>fixture.reads.length===1),'journal replay');
        assert.equal(await execute(()=>fixture.starts.length),0,'Opening Character never starts screen acquisition');
        const details=async(name,server)=>{await execute((name,server)=>{const form=document.querySelector('[data-character-metadata]');for(const[key,value]of Object.entries({name,server,classes:'RNG / CLR / ENC',level:58,aaCount:123,race:'Human'}))form.elements[key].value=String(value);form.requestSubmit();},name,server);await step('inventory');};
        await details('Synthetic Pathfinder','Example Realm');
        const profileId=await execute(()=>document.querySelector('[data-character-select]').value);
        assert.equal(await execute(()=>document.querySelector('[data-character-select]').selectedOptions[0].textContent),'Synthetic Pathfinder (Example Realm)');
        assert.doesNotMatch(await execute(()=>document.querySelector('.character-walkthrough').textContent),/unequip|take.*off|baseline/i);
        await until(()=>execute(()=>fixture.fileReads.length>0),'automatic local export polling');
        await execute(()=>fixture.fileMode='old');await until(()=>execute(()=>document.querySelector('[data-inventory-import-status]').textContent.includes('older export')),'automatic old export rejection');
        await execute(()=>fixture.fileMode='cancel');await click('[data-inventory-choose]');await step('inventory');
        await execute(()=>fixture.fileMode='malformed');await click('[data-inventory-read]');await until(()=>execute(()=>fixture.notices.some(n=>/inventory|worn|equipment/i.test(n))),'malformed export warning');assert.equal((await model()).candidates.length,0);
        await snapshot('character-inventory-export.png');
        await execute(()=>fixture.fileMode='fresh');await step('stats');
        let saved=await model();assert.equal(Object.keys(saved.equipment).length,3);assert.equal(saved.equipment.head,undefined,'Missing parent leaves empty equipment');assert.equal(saved.candidates.length,4,'Exact presence-only loose item is accepted');
        const ear=saved.candidates.find(c=>c.id===saved.equipment.ear1);assert.equal(ear.augments.length,1);assert.equal(ear.augmentSlots,2);assert.equal(ear.augments[0].name,'Synthetic Rune (Exaltation)');assert.equal(saved.inventoryExport.rejectedItems.length,2);
        assert.equal(saved.candidates.find(c=>c.id===saved.equipment.ear2).tier,5,'Paired physical items retain individual tier');
        assert.equal(saved.candidates.some(c=>c.name==='Synthetic Keyring Blade'),false,'Keyring is never equipped');
        assert.equal(await execute(()=>fixture.starts.length),0,'Preparation appears before capture');
        assert.deepEqual(await execute(()=>[...document.querySelectorAll('.character-preparation strong')].map(n=>n.textContent)),['Open your Inventory.','Scroll down.','Click off your buffs.']);
        assert.equal(await execute(()=>document.querySelectorAll('[data-inventory-contribute]').length),2,'Missing parent and socket queued independently');
        await snapshot('character-recorded-stats.png');
        await click('[data-inventory-contribute="0"]');assert.equal(await execute(()=>fixture.navigations.at(-1)),'contribute');assert.equal(await execute(()=>fixture.starts.length),0,'Wiki gap does not start item capture');assert.equal(await execute(()=>fixture.imports.length),0);
        // A log fills the zone while the old blank-zone draft is being edited.
        await execute(()=>{const form=document.querySelector('[data-candidate-form]');form.elements.playerText.focus();fixture.workspace.consumeLog({type:'loot',item:'Synthetic Missing Hood +2',source:'Unknown',sourceEvidence:{kind:'unknown'}},{live:true,at:Date.now(),zone:'Synthetic Evidence Vale',logId:'synthetic-source',cursor:1});form.elements.playerText.value='Reviewed factual note';form.elements.playerText.dispatchEvent(new Event('input',{bubbles:true}));});
        assert.equal(await execute(()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-contributions-v1')).candidates.find(c=>c.name==='Synthetic Missing Hood').zone),'Synthetic Evidence Vale','Unedited stale metadata cannot erase a newly observed zone');
        const contributionCount=await execute(()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-contributions-v1')).candidates.length);
        await click('[data-walkthrough-read-stats]');await until(()=>execute(()=>fixture.state.phase==='running'),'explicit stat capture');
        const afterStart=await model();await observe('item',{name:'Synthetic Trail Boots',hp:777777,slots:['FEET']});assert.deepEqual((await model()).candidates,afterStart.candidates,'Character ignores item OCR');
        await observe('character',{hpMaximum:5432,hpCurrent:5000,acMitigation:401,acMitigationSoftcap:374,acEvasion:500,atkOffense:358,atkAccuracy:828,str:269,accuracy:7,attackSpeed:150,spellShielding:0});
        await until(()=>execute(()=>document.querySelector('[data-walkthrough-stats-values]').value.includes('5432')),'fresh current stats proposal');
        assert.doesNotMatch(await execute(()=>document.querySelector('[data-walkthrough-stats-values]').value),/HP CURRENT/i);
        await execute(()=>document.querySelector('[data-walkthrough-stats]').requestSubmit());await step('review');
        saved=await model();assert.equal(saved.statSnapshots.base,null);assert.equal(saved.statSnapshots.equipped,null);assert.equal(saved.statSnapshots.current.stats.HP_MAXIMUM,5432);assert.equal(saved.statSnapshots.current.stats.ACCURACY,7);
        assert.match(await execute(()=>document.querySelector('[data-character-stat-summary]').textContent),/5,432|5432/);assert.doesNotMatch(await execute(()=>document.querySelector('[data-character-stat-summary]').textContent),/999,999|1999998/);
        await snapshot('character-imported-inspect.png',{selector:'[data-character-workbench]'});
        await click('[data-character-preview]');await until(()=>execute(()=>document.querySelector('.character-share-dialog').open),'review snapshot');
        assert.match(await execute(()=>document.querySelector('[data-share-inspect]').textContent),/5,432|5432/);await click('[data-share-save]');await step('complete');await click('[data-share-close]');
        const original=await model();
        const selectProfile=async value=>{await until(()=>execute(()=>!document.querySelector('[data-character-select]').disabled),'character selector enabled');await execute(value=>{const select=document.querySelector('[data-character-select]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));},value);await until(()=>execute(value=>document.querySelector('[data-character-select]').value===value,value),'profile switch');};
        await selectProfile('__new__');await step('details');await execute(()=>fixture.fileMode='missing');await details('Synthetic Pathfinder','Second Realm');
        const secondId=await execute(()=>document.querySelector('[data-character-select]').value);assert.notEqual(secondId,profileId);assert.equal((await model()).candidates.length,0);
        await execute(()=>fixture.fileMode='defer');await click('[data-inventory-read]');await until(()=>execute(()=>Boolean(fixture.resolveFile)),'deferred inventory read');
        // Cancel invalidates an in-flight file read before it can affect another profile.
        await click('[data-character-stop]');await execute(()=>fixture.resolveFile({ok:false,notFound:true}));await until(()=>execute(()=>!document.querySelector('[data-character-select]').disabled),'read cancellation settled');
        await selectProfile(profileId);await step('complete');assert.deepEqual((await model()).equipment,original.equipment);assert.deepEqual((await model()).statSnapshots,original.statSnapshots);
        await execute(()=>{fixture.workspace.dispose();fixture.workspace=fixture.mount();});await step('complete');assert.deepEqual((await model()).equipment,original.equipment,'Inventory survives remount');
        await snapshot('character-select-profiles.png',{selector:'#character-workspace > .capture-toolbar'});
        // A retired automatic poll must release the new profile's polling slot.
        await selectProfile(secondId);await execute(()=>fixture.fileMode='defer');await click('[data-character-reimport]');await until(()=>execute(()=>Boolean(fixture.resolveFile)),'old profile automatic read pending');
        await selectProfile(profileId);await step('complete');await click('[data-character-reimport]');await step('inventory');
        const beforeNewPoll=await execute(()=>fixture.fileReads.length);await execute(()=>{fixture.fileMode='missing';fixture.resolveFile({ok:false,notFound:true});fixture.resolveFile=null;});
        await until(()=>execute(count=>fixture.fileReads.length>count,beforeNewPoll),'new profile automatic polling resumes after stale read');
        await click('[data-character-clear]');await until(()=>execute(()=>fixture.model().candidates.length===0),'red clear inventory');
        assert.equal((await model()).metadata.name,'Synthetic Pathfinder');assert.equal((await model()).statSnapshots.current,null);assert.equal((await model()).inventoryExport,null);assert.equal(await execute(()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-contributions-v1')).candidates.length),contributionCount,'Clearing Character preserves contribution drafts');
        await selectProfile(secondId);assert.equal((await model()).metadata.server,'Second Realm');
        assert.equal(requests.length,0,`Walkthrough stays offline: ${JSON.stringify(requests)}`);await execute(()=>fixture.workspace.dispose());
        return{ok:true,message:'Native inventory/current-stat walkthrough passed: fresh auto export, malformed/cancel preservation, exact presence, empty missing slots/sockets, gear-independent recorded totals, no Character item OCR, saved profiles, guarded async cancellation and isolated Clear inventory.',screenshots:!!screenshots};
    }catch(error){const detail=`\nRenderer diagnostics: ${JSON.stringify(errors)}\nSynthetic UI: ${JSON.stringify(await diagnostic())}`;error.message+=detail;error.stack=String(error.stack||error.message)+detail;throw error;}
    finally{window.destroy();await new Promise(done=>server.close(done));}
}

try{
    const entry=join(temporary,'main.cjs');
    // Fail closed before any async work, including closed output pipes. The
    // parent awaits this process; all diagnostics go to a bounded result file.
    await writeFile(entry,`const fs=require('node:fs'),app=require('electron').app;let done=false;const finish=(result,code)=>{if(done)return;done=true;try{fs.writeFileSync(${JSON.stringify(resultFile)},JSON.stringify(result))}catch{}app.exit(code)};const fail=error=>finish({ok:false,error:String(error?.stack||error).slice(0,24000)},1);process.stdout.on('error',fail);process.stderr.on('error',fail);process.on('uncaughtException',fail);process.on('unhandledRejection',fail);setTimeout(()=>fail(Error('Character walkthrough child exceeded 90 seconds')),90000).unref();(${run.toString()})(${JSON.stringify({root,temporary,screenshots})}).then(result=>finish(result,0),fail);`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{
        const child=spawn(electron,[entry],{env,stdio:'ignore',windowsHide:true});let settled=false;
        const stop=()=>{if(child.exitCode!==null||child.killed)return;try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else child.kill('SIGKILL');}catch{}};
        const timer=setTimeout(()=>{stop();},100000);
        const cleanup=()=>{clearTimeout(timer);process.off('exit',stop);};process.once('exit',stop);
        child.once('error',error=>{if(!settled){settled=true;cleanup();reject(error);}});
        child.once('exit',(code,signal)=>{if(!settled){settled=true;cleanup();done(code??signal);}});
    });
    const result=await readFile(resultFile,'utf8').then(JSON.parse).catch(()=>({ok:false,error:'Child exited without a result file.'}));
    assert.equal(code,0,result.error||'Character walkthrough native renderer failed');assert.equal(result.ok,true,result.error);
    console.log(result.message);
}finally{
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));
    assert(temporary.startsWith(join(tmpdir(),'eoz-character-walkthrough-')));
    await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
