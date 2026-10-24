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
        if(!/^\/app\/[a-z.-]+\.(js|css|json)$/.test(name)){res.writeHead(404).end();return;}
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
            let statusListener=()=>{},observationListener=()=>{},sequence=0,firstFrameAt=0;
            let state={enabled:false,phase:'disabled',owner:null,source:null,sessionId:'',hasPreview:false,generation:0,generationStartedAt:0};
            const source={id:'window:synthetic-game',name:'EverQuest · Synthetic Fixture',label:'EverQuest · Synthetic Fixture',type:'window',recommended:true};
            const starts=[],stops=[],resumes=[],notices=[],saveCalls=[],copyCalls=[],reads=[],sourcesCalls=[],imports=[];
            const emit=patch=>{state={...state,...patch};statusListener(state);};
            const model=()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-character-v1'));
            const flow=()=>JSON.parse(localStorage.getItem('eql-eye-of-zomm-character-walkthrough-v1'))||{step:'details',active:false};
            const observe=(kind,values,patch={})=>{
                const observation={id:`synthetic-observation-${++sequence}`,sequence,kind:'ocr',owner:'character',sessionId:flow().sessionId,capturedAt:new Date().toISOString(),input:{sourceId:state.source?.id,captureGeneration:state.generation},source:'screen-read',parser:{version:'synthetic-ui'},subject:{kind,name:values.name||'Synthetic character'},fields:Object.entries(values).map(([key,value])=>({key,value,confidence:90,raw:`${key}: ${value}`})),evidence:{text:'Synthetic observation; no game or player pixels.'},...patch};
                observationListener(observation);return observation;
            };
            const api={status:async()=>{const snapshot=structuredClone(state);if(fixture.deferStatus)return new Promise(resolve=>{fixture.releaseStatus=()=>{fixture.deferStatus=false;fixture.releaseStatus=null;resolve(snapshot);};});return snapshot;},sources:async()=>{sourcesCalls.push(true);return[{id:'screen:fixture',name:'Synthetic display',type:'screen'},source];},
                onStatus:fn=>{statusListener=fn;return()=>{statusListener=()=>{};};},onObservation:fn=>{observationListener=fn;return()=>{observationListener=()=>{};};},
                read:async value=>{reads.push(value);const records=(fixture.replayRecords||[]).filter(record=>record.sequence>(value.afterSequence||0));return{records,lastSequence:Math.max(sequence,...records.map(record=>record.sequence))};},
                importImage:async value=>{imports.push(value);const generation=state.generation+1;emit({generation,generationStartedAt:Date.now()});return new Promise(resolve=>{fixture.pendingImport={finish(entries){const records=entries.map(({kind,values})=>observe(kind,values,{kind:'manual',sessionId:value.sessionId,input:{sourceId:null,captureGeneration:generation}}));fixture.pendingImport=null;resolve({records,message:'Synthetic screenshot read.'});}};});},
                start:async value=>{starts.push(value);firstFrameAt=Date.now();await new Promise(done=>setTimeout(done,25));emit({enabled:true,phase:'running',owner:value.mode,sessionId:value.sessionId,source,characterSessionId:value.sessionId,contributionPaused:true,resumable:false,hasPreview:false,generation:state.generation+1,generationStartedAt:firstFrameAt});return state;},
                stop:async value=>{stops.push(value);emit({enabled:false,phase:'disabled',owner:null,sessionId:'',source:null,hasPreview:false,resumable:false});return state;},
                resume:async()=>{resumes.push(true);emit({phase:'running',resumable:false,error:null,readWarning:null,generation:state.generation+1,generationStartedAt:Date.now()});return state;}};
            const share={savePng:async value=>{saveCalls.push({png:value.startsWith('data:image/png;base64,'),length:value.length});return{ok:fixture.saveSucceeds};},copyPng:async value=>{copyCalls.push({png:value.startsWith('data:image/png;base64,'),length:value.length});return{ok:true};}};
            const catalog=[['Synthetic Trail Boots',['FEET']],['Synthetic Trial Boots',['FEET']],['Synthetic Universal Sigil',['ANY']],['Synthetic Spare Cap',['HEAD']],['Synthetic Brief Hover Bracer',['WRIST']],['Synthetic Brief Gloves',['HANDS']],['Synthetic Brief Hover Gloves',['HANDS']],['Synthetic Slots-phase Tooltip',['PRIMARY']],['Synthetic Pending ANY',['ANY']],['Synthetic Recovered Ring',['FINGER']],['Synthetic Review-phase Tooltip',['WAIST']],['Synthetic Review Screenshot',['EAR']]].map(([name,slots])=>({name,wikiTitle:name,slots,stats:{}}));
            const mount=()=>mountCaptureWorkspace({capture:api,wiki:null,share,notify:value=>notices.push(value),getPack:()=>({items:catalog,icons:{}})});
            window.fixture={source,starts,stops,resumes,notices,saveCalls,copyCalls,reads,sourcesCalls,imports,emit,observe,model,flow,mount,saveSucceeds:false,get state(){return state;},get firstFrameAt(){return firstFrameAt;}};
            fixture.workspace=mount();
        });
        await until(()=>execute(()=>fixture.reads.length===1),'empty local journal replay');
        assert.equal(await execute(()=>fixture.starts.length),0,'Opening Character never starts screen acquisition');
        assert.equal(await execute(()=>getComputedStyle(document.querySelector('#capture-settings')).display),'none','Source setup must work without visiting Settings');
        await execute(()=>{const form=document.querySelector('[data-character-metadata]');for(const[key,value]of Object.entries({name:'Synthetic Pathfinder',server:'Example Realm',classes:'RNG / CLR / ENC',level:58,aaCount:123,race:'Human'}))form.elements[key].value=String(value);form.requestSubmit();});
        await step('source');
        assert.deepEqual((await model()).metadata,{name:'Synthetic Pathfinder',server:'Example Realm',classes:['RNG','CLR','ENC'],level:58,aaCount:123,race:'Human',sessionName:''});
        await until(()=>execute(()=>document.querySelector('[data-walkthrough-source-select]')?.value==='window:synthetic-game'),'recommended game source selected inline');
        await snapshot('character-inline-source.png');
        await click('[data-walkthrough-start-source]');await step('unequip');
        assert.equal(await execute(()=>fixture.starts.length),1);
        assert.deepEqual(await execute(()=>fixture.starts[0]),{mode:'character',sourceId:'window:synthetic-game',sessionId:await execute(()=>fixture.flow().sessionId)});
        const boots={name:'Synthetic Trail Boots',slots:['Feet'],tier:2,fraction:0,hp:37,str:9,haste:12,rawStatBlock:'Feet\nTier: 2\nHP: 37\nSTR: 9\nHaste: 12%\nWorn Effect: Trail Sense'};
        const any={name:'Synthetic Universal Sigil',slots:['ANY'],tier:1,fraction:0,hp:11,str:2,rawStatBlock:'ANY\nHP: 11\nSTR: 2'};
        const removed={name:'Synthetic Spare Cap',slots:['Head'],tier:0,fraction:0,hp:19,str:3,rawStatBlock:'Head\nHP: 19\nSTR: 3'};
        await observe('item',boots,{capturedAt:new Date(await execute(()=>fixture.firstFrameAt)).toISOString()});await observe('item',any);await observe('item',removed);
        let current=await model();assert.equal(current.candidates.length,3);
        const bootsId=current.candidates.find(c=>c.name===boots.name).id,anyId=current.candidates.find(c=>c.name===any.name).id,removedId=current.candidates.find(c=>c.name===removed.name).id;
        assert.equal(current.equipment.feet,bootsId,'Unambiguous Feet are assigned automatically');
        assert(!Object.values(current.equipment).includes(anyId),'ANY awaits the user choice');
        assert.equal(current.equipment.head,removedId);
        assert.equal(await execute(id=>Boolean(document.querySelector(`[data-loose-inventory] [data-character-card="${id}"]`)),bootsId),false,'Equipped physical cards do not remain in loose inventory');
        assert.equal(await execute(id=>document.querySelector('[data-equipped-card="feet"]')?.dataset.editCard===id,bootsId),true,'The equipment board opens the exact equipped physical card');
        await execute(()=>fixture.emit({reading:true,queuedFrames:2}));assert.match(await execute(()=>document.querySelector('[data-walkthrough-reading]').textContent),/Reading.*2 waiting.*Wait for each item card/);
        if(screenshots){const bounds=window.getBounds();window.setContentSize(1280,1000);await snapshot('character-tooltip-capture.png',{selector:'[data-walkthrough-stage]'});window.setBounds(bounds);}
        await execute(()=>fixture.emit({reading:false,queuedFrames:0,lastReadAt:Date.now(),lastReadItemCount:0}));assert.match(await execute(()=>document.querySelector('[data-walkthrough-reading]').textContent),/last frame had no readable item tooltip/);
        assert.equal(await execute(()=>document.querySelector('[data-calculated-stat="HP"]').cells[2].textContent),'56 *','Only assigned gear contributes to the gear total');
        await click(`[data-equipped-card="head"][data-edit-card="${removedId}"]`);await editCapturedValues();
        const x=await execute(()=>{const b=document.querySelector('[data-remove-card]'),r=b.getBoundingClientRect();return{label:b.getAttribute('aria-label')||b.textContent,width:r.width,height:r.height};});
        assert.match(x.label,/Remove/i);assert(x.width>=20&&x.height>=20,`The selected-card remove action remains visible: ${JSON.stringify(x)}`);
        // A hidden Chromium compositor can retain the pre-scroll hit-test
        // surface even when getBoundingClientRect/elementFromPoint are current.
        // Show without activation, commit the scrolled frame, then prove that
        // trusted pointer input reaches this exact action before pressing it.
        window.showInactive();
        try{
            await execute(id=>{document.querySelector('[data-remove-card]').scrollIntoView({block:'center',behavior:'instant'});fixture.removalTarget=id;fixture.pointerEvents=[];for(const type of ['mousemove','mousedown','mouseup','click'])document.addEventListener(type,event=>{if(fixture.pointerEvents.length<20)fixture.pointerEvents.push({type,trusted:event.isTrusted,id:event.target.closest('button')?.dataset.inventoryRemove||(event.target.closest('[data-remove-card]')?fixture.removalTarget:''),x:event.clientX,y:event.clientY});},true);},removedId);
            await execute(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
            window.webContents.invalidate();await window.capturePage();
            const hit=await execute(()=>{const button=document.querySelector('[data-remove-card]'),rect=button.getBoundingClientRect(),x=Math.round(rect.x+rect.width/2),y=Math.round(rect.y+rect.height/2);return{x,y,exposed:document.elementFromPoint(x,y)?.closest('button')===button};});
            assert.equal(hit.exposed,true,'The remove action is not covered by the item card');
            window.webContents.sendInputEvent({type:'mouseMove',x:hit.x,y:hit.y});
            await until(()=>execute(id=>fixture.pointerEvents.some(event=>event.type==='mousemove'&&event.trusted&&event.id===id),removedId),'trusted native move reaches the committed remove hit target');
            for(const type of ['mouseDown','mouseUp'])window.webContents.sendInputEvent({type,x:hit.x,y:hit.y,button:'left',clickCount:1});
            await until(()=>execute(id=>!fixture.model().candidates.some(c=>c.id===id),removedId),'native pointer removes the inventory card');
            assert.equal(await execute(id=>fixture.pointerEvents.some(event=>event.type==='click'&&event.trusted&&event.id===id),removedId),true,'Removal is driven by a trusted click on the X');
        }finally{window.hide();}
        assert.equal((await model()).equipment.head,undefined);
        assert.equal(await execute(()=>document.querySelector('[data-calculated-stat="HP"]').cells[2].textContent),'37 *','Removing assigned gear immediately updates the gear total');
        await execute(()=>{fixture.workspace.dispose();fixture.workspace=fixture.mount();});await step('unequip');
        assert.equal(await execute(()=>fixture.starts.length),1,'Remounting resumes the local workflow without starting another source');
        await observe('item',removed);
        assert.equal((await model()).candidates.length,2,'Removed card stays removed after remount and a new observation ID');
        // Neither equipped pixels nor a previous session can seed the baseline.
        await observe('character',{hp:999,str:999});
        const lateUnequipAt=await execute(()=>Date.now());await new Promise(done=>setTimeout(done,5));await click('[data-walkthrough-next]');await step('base');
        const cardsBeforeLate=(await model()).candidates.length,bootsSeen=(await model()).candidates.find(c=>c.id===bootsId).seenCount;
        await observe('item',boots,{capturedAt:new Date(lateUnequipAt).toISOString()});assert.equal((await model()).candidates.length,cardsBeforeLate,'Late Unequip OCR merges into its original card after Next');assert((await model()).candidates.find(c=>c.id===bootsId).seenCount>bootsSeen);
        const acceptedLate=await observe('item',{name:'Synthetic Brief Hover Bracer',slots:['Wrist'],hp:0,str:0,rawStatBlock:'Wrist\nHP: 0\nSTR: 0'},{capturedAt:new Date(lateUnequipAt).toISOString()});assert.equal((await model()).candidates.length,cardsBeforeLate+1,'A distinct brief Unequip tooltip still becomes a card after Next');
        const rejectedBaseItem=await observe('item',{name:'Synthetic Base-phase Tooltip',slots:['Primary'],hp:999});assert.equal((await model()).candidates.length,cardsBeforeLate+1,'A tooltip actually captured during Base is not ingested');
        const gate=await execute(()=>fixture.flow());
        assert.equal(await execute(()=>document.querySelector('[data-walkthrough-base-values]').value),'');
        await observe('character',{hp:999,str:999},{capturedAt:new Date(gate.baseAfterAt-1).toISOString(),sequence:gate.baseAfterSequence+1});
        await observe('character',{hp:888,str:888},{capturedAt:new Date(gate.baseAfterAt+1).toISOString(),sequence:gate.baseAfterSequence});
        await observe('character',{hp:777,str:777},{capturedAt:new Date(gate.baseAfterAt+1).toISOString(),sequence:gate.baseAfterSequence+3,sessionId:'retired-synthetic-session'});
        assert.equal(await execute(()=>document.querySelector('[data-walkthrough-base-values]').value),'','Pre-confirm pixels, old sequence and wrong session remain rejected');
        await observe('character',{hp:600,mana:240,endurance:410,str:75,acMitigation:61,acMitigationSoftcap:43,acEvasion:127,attackOffense:46,attackAccuracy:107},{capturedAt:new Date(gate.baseAfterAt+5).toISOString(),sequence:gate.baseAfterSequence+4});
        assert.match(await execute(()=>document.querySelector('[data-walkthrough-base-values]').value),/Mitigation AC: 61/);
        assert.match(await execute(()=>document.querySelector('[data-walkthrough-base-age]').textContent),/Fresh No Equipment/);
        await execute(()=>{const input=document.querySelector('[data-walkthrough-base-values]');input.value=input.value.replace('HP: 600','HP: 605');input.dispatchEvent(new Event('input',{bubbles:true}));input.blur();});
        await observe('character',{hp:699,str:79},{capturedAt:new Date(gate.baseAfterAt+7).toISOString(),sequence:gate.baseAfterSequence+5});
        assert.match(await execute(()=>document.querySelector('[data-walkthrough-base-values]').value),/HP: 605/,'A later read cannot overwrite a deliberate base correction after blur');
        const readsBeforeRemount=await execute(()=>fixture.reads.length);
        await execute((acceptedLate,rejectedBaseItem)=>{const canceled={...acceptedLate,id:'synthetic-invalidated-journal-row',subject:{kind:'item',name:'Synthetic Canceled Crop'},fields:[{key:'name',value:'Synthetic Canceled Crop'},{key:'hp',value:999}]};fixture.replayRecords=[acceptedLate,rejectedBaseItem,canceled];fixture.deferStatus=true;fixture.workspace.dispose();fixture.workspace=fixture.mount();},acceptedLate,rejectedBaseItem);await step('base');
        await until(()=>execute(()=>typeof fixture.releaseStatus==='function'),'deferred capture status on remount');assert.equal(await execute(()=>fixture.reads.length),readsBeforeRemount,'Journal replay waits until capture status is confirmed');
        await execute(()=>{fixture.emit({generation:fixture.state.generation+1,generationStartedAt:Date.now()});fixture.releaseStatus();});
        await until(()=>execute(reads=>fixture.reads.length>reads,readsBeforeRemount),'journal replay after current generation status');
        assert.equal((await model()).candidates.length,cardsBeforeLate+1,'A delayed old status response cannot restore canceled-generation journal records or duplicate accepted cards');
        assert.match(await execute(()=>document.querySelector('[data-walkthrough-base-values]').value),/HP: 605/,'Base corrections survive a workspace remount');
        await snapshot('character-base-stat-review.png',{font:20});
        await execute(()=>document.querySelector('[data-walkthrough-base]').requestSubmit());await step('reequip');
        assert.equal((await model()).statSnapshots.base.stats.HP,605);
        // The file picker/OCR invocation, not its completion timestamp, decides
        // whether a manual Inventory image belongs to this Base phase.
        const seenBeforeImport=(await model()).candidates.find(card=>card.id===bootsId).seenCount;
        await click('[data-walkthrough-stage] [data-character-import]');await until(()=>execute(()=>Boolean(fixture.pendingImport)),'pending manual import from Re-equip');
        await click('[data-walkthrough-back]');await step('base');
        await execute(boots=>fixture.pendingImport.finish([{kind:'character',values:{hp:9999,str:999}},{kind:'item',values:boots}]),boots);
        await until(()=>execute(()=>!fixture.pendingImport),'late Re-equip file read completed');
        assert.equal(await execute(()=>document.querySelector('[data-walkthrough-base-values]').value),'','A Re-equip Inventory import completing after Back cannot populate fresh Base values');
        assert((await model()).candidates.find(card=>card.id===bootsId).seenCount>seenBeforeImport,'The same delayed import may still update an eligible item card');
        assert.equal((await model()).statSnapshots.base.stats.HP,605,'A stale manual read does not overwrite the accepted baseline');
        const manualBaseValues={hp:605,mana:240,endurance:410,str:75,acMitigation:61,acMitigationSoftcap:43,acEvasion:127,attackOffense:46,attackAccuracy:107};
        const readManualBase=async()=>{await click('[data-walkthrough-stage] [data-character-import]');await until(()=>execute(()=>Boolean(fixture.pendingImport)),'manual import initiated in Base');await execute(values=>fixture.pendingImport.finish([{kind:'character',values}]),manualBaseValues);await until(()=>execute(()=>/HP: 605/.test(document.querySelector('[data-walkthrough-base-values]').value)),'legitimate Base import accepted');};
        await readManualBase();assert.match(await execute(()=>document.querySelector('[data-walkthrough-base-age]').textContent),/Fresh No Equipment/);
        await execute(()=>fixture.emit({generation:fixture.state.generation+1,generationStartedAt:Date.now()}));
        assert.equal(await execute(()=>document.querySelector('[data-walkthrough-base-values]').value),'','A later capture-generation change clears an unreviewed manual proposal');
        await readManualBase();await execute(()=>document.querySelector('[data-walkthrough-base]').requestSubmit());await step('reequip');
        const originalCount=(await model()).candidates.length;
        await observe('item',boots);
        current=await model();assert.equal(current.candidates.length,originalCount,'Re-equipped same physical item merges into its card');
        assert(current.candidates.find(c=>c.id===bootsId).seenCount>1,'The existing physical card receives the new evidence');
        assert.equal(current.equipment.feet,bootsId);
        await click(`[data-equipped-card="feet"][data-edit-card="${bootsId}"]`);await editCapturedValues();
        await execute(()=>{const raw=document.querySelector('.character-card-editor').elements.rawStatBlock;raw.focus();raw.value=raw.value.replace('Haste: 12%','Haste: 16%')+'\nUnsaved review note: keep this text';raw.dispatchEvent(new Event('input',{bubbles:true}));fixture.focusedRaw=raw;fixture.unsavedRaw=raw.value;});
        await observe('item',{...boots,hp:41,sta:4,rawStatBlock:'Feet\nTier: 2\nHP: 41\nSTR: 9\nSTA: 4\nHaste: 12%\nWorn Effect: Trail Sense'});
        const concurrent=(await model()).candidates.find(c=>c.id===bootsId);
        assert.equal(concurrent.observedStats.HP,41,'Same-card recapture can update an existing number while its editor is open');
        assert.equal(concurrent.observedStats.STA,4,'Same-card recapture can recover a missing number while its editor is open');
        assert.equal(concurrent.observedStats.HASTE,12,'An unsaved text correction is not silently applied to the model');
        await observe('item',{name:'Synthetic Brief Gloves',slots:['Hands'],tier:0,fraction:0,hp:5,rawStatBlock:'Hands\nHP: 5'});
        current=await model();
        const focusedCaptureId=current.candidates.find(c=>c.name==='Synthetic Brief Gloves').id;
        assert.equal(current.equipment.hands,focusedCaptureId);
        assert.equal(await execute(id=>document.querySelector('[data-equipped-card="hands"]')?.dataset.editCard===id,focusedCaptureId),true,'A fresh known card appears in its equipment slot while another editor retains focus');
        assert.equal(await execute(()=>document.querySelector('[data-calculated-stat="HP"]').cells[2].textContent),'46 *','Assigned gear totals update while the raw editor is protected');
        assert.equal(await execute(()=>document.querySelector('.character-card-editor').elements.rawStatBlock===fixture.focusedRaw&&document.activeElement===fixture.focusedRaw&&fixture.focusedRaw.value===fixture.unsavedRaw),true,'Live intake preserves the focused raw textarea and every unsaved character');
        await execute(()=>document.querySelector('.character-card-editor').requestSubmit());
        const corrected=(await model()).candidates.find(c=>c.id===bootsId);
        assert.match(corrected.rawStatBlock,/Unsaved review note: keep this text/,'The retained edit can still be saved');
        assert.equal(corrected.observedStats.HASTE,16,'Saving the deliberate Haste text change applies that correction');
        assert.equal(corrected.observedStats.STA,4,'Saving an older form must retain a newly recovered same-card field');
        assert.equal(corrected.observedStats.HP,41,'An unchanged old raw/numeric value cannot overwrite a newer same-card observation');
        await click(`[data-equipped-card="hands"][data-edit-card="${focusedCaptureId}"]`);await editCapturedValues();await click('[data-remove-card]');
        assert.equal((await model()).candidates.length,originalCount);
        await click(`[data-equipped-card="feet"][data-edit-card="${bootsId}"]`);await editCapturedValues();
        await execute(()=>{const form=document.querySelector('.character-card-editor'),raw=form.elements.rawStatBlock;raw.value=raw.value.replace('Haste: 12%','Haste: 16%')+'\nUnrecognized inscription: ?';form.requestSubmit();});
        current=await model();assert.equal(current.candidates.find(c=>c.id===bootsId).observedStats.HASTE,16,'Raw written Haste is reparsed on Save item');
        assert.match(current.candidates.find(c=>c.id===bootsId).rawStatBlock,/Unrecognized inscription: \?/,'Unparsed written text remains available for manual recovery');
        await observe('item',boots);
        assert.equal((await model()).candidates.find(c=>c.id===bootsId).observedStats.HASTE,16,'Fresh OCR cannot overwrite the user correction');
        await snapshot('character-item-stat-review.png',{font:13,selector:'[data-character-editor]'});
        // Explicitly choosing a source again must return to Re-equip, preserving
        // the same capture session and item identities rather than restarting.
        const sessionBefore=await execute(()=>fixture.flow().sessionId);
        await click('[data-walkthrough-source]');await step('source');
        await click('[data-walkthrough-start-source]');await step('reequip');
        assert.equal(await execute(()=>fixture.flow().sessionId),sessionBefore);
        assert.equal((await model()).candidates.length,originalCount);
        // The flow remains visibly resumable after a real source pause/loss.
        await execute(()=>fixture.emit({phase:'paused',resumable:true,readWarning:'Synthetic source temporarily unavailable.'}));
        await until(()=>execute(()=>Boolean(document.querySelector('[data-walkthrough-resume]'))),'inline resume after source pause');
        assert.match(await execute(()=>document.querySelector('[data-walkthrough-reading]').textContent),/paused.*Resume capture/);
        await click('[data-walkthrough-resume]');await until(()=>execute(()=>fixture.state.phase==='running'),'capture resumes');
        assert.equal(await execute(()=>fixture.resumes.length),1);assert.equal(await execute(()=>fixture.flow().step),'reequip');
        const lateReequipAt=await execute(()=>Date.now()),currentInput=await execute(()=>({sourceId:fixture.state.source.id,captureGeneration:fixture.state.generation}));await new Promise(done=>setTimeout(done,5));await click('[data-walkthrough-next]');await step('slots');
        const assertItemPhaseStatus=async()=>{
            assert.match(await execute(()=>document.querySelector('[data-walkthrough-status]').textContent),/Reading continues.*hover over missing items here.*earlier queued reads can finish too/,'Slots and Review explain that current and earlier queued items remain readable');
            assert.equal(await execute(()=>fixture.state.phase),'running');assert.equal(await execute(()=>fixture.stops.length),0,'Confirming slots keeps the capture source active');
        };
        await assertItemPhaseStatus();
        const slotsCount=(await model()).candidates.length;await observe('item',boots,{capturedAt:new Date(lateReequipAt).toISOString()});assert.equal((await model()).candidates.length,slotsCount,'Late Re-equip OCR merges after advancing to Slots');
        await observe('item',{name:'Synthetic Brief Hover Gloves',slots:['Hands'],hp:0,str:0,rawStatBlock:'Hands\nHP: 0\nSTR: 0'},{capturedAt:new Date(lateReequipAt).toISOString()});assert.equal((await model()).candidates.length,slotsCount+1,'A distinct brief Re-equip tooltip still becomes a card in Slots');
        for(const patch of [{input:{...currentInput,captureGeneration:currentInput.captureGeneration-1}},{input:{...currentInput,sourceId:'window:retired'}},{sessionId:'retired-session'}])await observe('item',{name:'Synthetic Rejected Source Item',slots:['Primary'],hp:999},{capturedAt:new Date(lateReequipAt).toISOString(),...patch});
        assert.equal((await model()).candidates.length,slotsCount+1,'Wrong source/generation/session frames stay rejected');
        const slotsRead=await observe('item',{name:'Synthetic Slots-phase Tooltip',slots:['Primary'],hp:0});assert.equal((await model()).candidates.length,slotsCount+2,'A new tooltip captured during slot confirmation becomes a distinct card');
        if(screenshots){const prior=window.getContentBounds();window.setContentSize(1515,1000);await execute(()=>{const inventory=document.querySelector('[data-character-inventory]');inventory.scrollTop=inventory.scrollHeight;});await snapshot('character-slots-live-reading.png');window.setContentSize(prior.width,prior.height);}
        window.webContents.focus();
        await execute(id=>{fixture.anyBlurEvents=0;document.querySelector('#character-workspace').addEventListener('focusout',()=>fixture.anyBlurEvents++);const select=document.querySelector(`[data-walkthrough-slot="${id}"]`);select.value='charm';select.dispatchEvent(new Event('change',{bubbles:true}));select.focus();fixture.focusedAny=select;},anyId);
        await observe('item',boots);
        assert.equal(await execute(()=>document.activeElement===fixture.focusedAny&&fixture.focusedAny.isConnected&&fixture.focusedAny.value==='charm'),true,'Recurring item reads preserve the focused ANY control and its chosen value');
        await observe('item',{name:'Synthetic Pending ANY',slots:['ANY'],hp:0});
        const pendingAny=(await model()).candidates.find(card=>card.name==='Synthetic Pending ANY').id;
        assert.equal(await execute(id=>document.activeElement===fixture.focusedAny&&!document.querySelector(`[data-walkthrough-slot="${id}"]`),pendingAny),true,'New choices defer while an existing slot control is being used');
        await execute(()=>fixture.focusedAny.blur());assert.equal(await execute(()=>document.activeElement===fixture.focusedAny),false,'Leaving the ANY dropdown really moves document focus');assert((await execute(()=>fixture.anyBlurEvents))>0,'The fixture dispatches the real DOM focusout event');await until(()=>execute(id=>Boolean(document.querySelector(`[data-walkthrough-slot="${id}"]`)),pendingAny),'new ANY choice appears after the protected interaction ends');
        await execute((oldId,newId)=>{for(const[id,value]of [[oldId,''],[newId,'__skip__']]){const select=document.querySelector(`[data-walkthrough-slot="${id}"]`);select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}},anyId,pendingAny);
        const beforeRecovery=(await model()).candidates.length;
        await execute((read,boots)=>{
            const record=(index,values,patch={})=>({...read,id:`synthetic-recovered-${index}`,sequence:read.sequence+index,subject:{kind:'item',name:values.name},fields:Object.entries(values).map(([key,value])=>({key,value,confidence:90,raw:`${key}: ${value}`})),...patch});
            const ring={name:'Synthetic Recovered Ring',slots:['Fingers'],tier:2,fraction:0,hp:0};
            fixture.replayRecords=[...Array.from({length:4},(_,index)=>record(index+1,ring)),record(5,boots),record(6,ring,{sessionId:'synthetic-older-walkthrough'})];
            fixture.workspace.dispose();fixture.workspace=fixture.mount();
        },slotsRead,boots);
        await until(async()=>(await model()).candidates.length===beforeRecovery+2,'current-flow journal recovery without repeated-card duplication');
        const recovered=(await model()).candidates.filter(card=>card.name==='Synthetic Recovered Ring');
        assert.equal(recovered.length,2,'The same name in an older session retains a distinct physical card');
        assert.equal(recovered.find(card=>card.evidence.some(evidence=>evidence.sessionId===sessionBefore)).seenCount,4,'Four current-flow rereads merge into one recovered physical card');
        assert.equal(recovered.find(card=>card.seenCount===4).evidence.length,4);
        assert.equal((await model()).candidates.find(card=>card.id===bootsId).observedStats.HASTE,16,'Journal recovery preserves deliberately corrected values');
        const readsBeforeRepeat=await execute(()=>fixture.reads.length);await execute(()=>{fixture.workspace.dispose();fixture.workspace=fixture.mount();});
        await until(()=>execute(count=>fixture.reads.length>count,readsBeforeRepeat),'repeated remount journal replay');
        assert.equal((await model()).candidates.length,beforeRecovery+2,'Exact observation IDs remain idempotent across repeated remounts');
        assert.equal((await model()).candidates.find(card=>card.seenCount===4&&card.name==='Synthetic Recovered Ring').evidence.length,4);
        assert.equal(await execute(id=>document.querySelector(`[data-walkthrough-slot="${id}"]`).value,anyId),'');
        await click('[data-walkthrough-next]');assert.equal(await execute(()=>fixture.flow().step),'slots','Unresolved ANY cannot silently complete');
        await execute(id=>{const select=document.querySelector(`[data-walkthrough-slot="${id}"]`);select.value='charm';select.dispatchEvent(new Event('change',{bubbles:true}));},anyId);
        await click('[data-walkthrough-next]');await step('review');
        await assertItemPhaseStatus();
        const beforeReviewItems=(await model()).candidates.length;
        await observe('item',{name:'Synthetic Review-phase Tooltip',slots:['Waist'],hp:0});assert.equal((await model()).candidates.length,beforeReviewItems+1,'A new tooltip captured during final review becomes a distinct card');
        await click('[data-character-workbench] [data-character-import]');await until(()=>execute(()=>Boolean(fixture.pendingImport)),'explicit item screenshot import from Review');
        await execute(()=>fixture.pendingImport.finish([{kind:'item',values:{name:'Synthetic Review Screenshot',slots:['Ear'],hp:0}}]));await until(()=>execute(()=>!fixture.pendingImport),'Review item import completed');
        assert.equal((await model()).candidates.length,beforeReviewItems+2,'Explicit screenshot reading also remains available during Review');
        current=await model();assert.equal(current.equipment.charm,anyId);assert.equal(current.statSnapshots.equipped,null,'No equipped capture is needed');
        assert.equal(await execute(()=>document.querySelector('[data-calculated-stat="HP"]').cells[3].textContent),'657 *','Equipped HP uses reviewed base plus gear');
        for(const [key,value]of Object.entries({AC_MITIGATION:61,AC_MITIGATION_SOFTCAP:43,AC_EVASION:127,ATK_OFFENSE:46,ATK_ACCURACY:107}))assert.deepEqual(await execute(key=>[...document.querySelector(`[data-calculated-stat="${key}"]`).cells].slice(1).map(c=>c.textContent),key),[String(value),'—','Unknown'],`${key} stays a distinct observation without an invented equipped formula`);
        const resourceLabels=await execute(()=>[...[...document.querySelectorAll('[data-character-stat-summary] section')].find(section=>section.querySelector('h4')?.textContent==='Resources').querySelectorAll('dt')].map(label=>label.textContent));assert.equal(resourceLabels.length,3,'The compact summary has exactly one row per resource');assert.equal(new Set(resourceLabels).size,3);
        await snapshot('character-inventory.png',{selector:'[data-character-identity]'});
        await snapshot('character-walkthrough-review.png');
        await snapshot('character-walkthrough-review-20px.png',{font:20});
        await snapshot('character-equipped-estimates.png',{font:13,selector:'.character-stats'});
        await click('[data-walkthrough-stage] [data-character-preview]');await until(()=>execute(()=>document.querySelector('.character-share-dialog').open),'actual canvas PNG preview');
        assert.equal(await execute(()=>document.querySelector('[data-share-image]').naturalWidth),1800);
        await click('[data-share-save]');await until(()=>execute(()=>fixture.saveCalls.length===1),'canceled save returned');
        assert.equal(await execute(()=>fixture.flow().step),'review');assert.equal(await execute(()=>fixture.state.phase),'running');assert.equal(await execute(()=>fixture.stops.length),0,'Canceled save must keep capture running');
        assert.match(await execute(()=>document.querySelector('[data-share-status]').textContent),/canceled.*active/i);
        await execute(()=>fixture.saveSucceeds=true);await click('[data-share-save]');await step('complete');
        const completedCards=(await model()).candidates.length;await observe('item',{name:'Synthetic Closed Flow Tooltip',slots:['Primary'],hp:999},{capturedAt:new Date(lateReequipAt).toISOString()});assert.equal((await model()).candidates.length,completedCards,'A closed walkthrough cannot consume a delayed live item');
        assert.equal(await execute(()=>fixture.stops.length),1);assert.deepEqual(await execute(()=>fixture.stops[0]),{mode:'character'});
        assert.equal(await execute(()=>fixture.saveCalls.every(c=>c.png&&c.length>1000)),true);
        await click('[data-share-copy]');await until(()=>execute(()=>fixture.copyCalls.length===1),'copy remains available for the finished preview');
        assert.equal(await execute(()=>fixture.stops.length),1,'Repeated export after completion cannot stop capture twice');
        await click('[data-share-close]');
        // Copy is a completion action in its own right, not just an action on an
        // already completed save. A second explicit walkthrough has fresh base
        // values and no observed equipped-stat capture.
        await click('[data-walkthrough-new]');await step('details');
        await execute(()=>document.querySelector('[data-character-metadata]').requestSubmit());await step('source');
        await click('[data-walkthrough-start-source]');await step('unequip');
        // Identity matching may correct OCR spelling, but never supplies stats
        // or permits an unresolved item to contribute to equipped totals.
        await click(`[data-loose-inventory] [data-edit-card="${bootsId}"]`);await click('[data-slot-id="feet"] [data-equip-slot]');assert.equal((await model()).equipment.feet,bootsId,'The second walkthrough explicitly equips an existing known card before the occupied-slot check');
        const gearHp=()=>execute(()=>Number(document.querySelector('[data-calculated-stat="HP"]').cells[2].textContent.match(/-?\d+/)?.[0]));
        const beforeUnknownHp=await gearHp();
        const mystery={name:'Synthetic Uncatalogued Mystery',slots:['Head'],tier:2,hp:9000,rawStatBlock:'Head\nHP: 9000\nUncatalogued inscription: keep this'};
        const fuzzy={name:'Synthetic Tral Boots +2',slots:['Feet'],tier:2,fraction:0,hp:91,str:7,rawStatBlock:'Feet\nHP: 91\nSTR: 7\nUnparsed inscription: preserve me'};
        await observe('item',mystery);await observe('item',fuzzy);
        const unknownCards=(await model()).candidates,mysteryId=unknownCards.find(card=>card.name===mystery.name).id,fuzzyId=unknownCards.find(card=>card.observedName===fuzzy.name).id;
        for(const id of [mysteryId,fuzzyId]){assert(!Object.values((await model()).equipment).includes(id));assert.equal(await execute(id=>{const card=document.querySelector(`[data-loose-inventory] [data-character-card="${id}"]`);return card?.classList.contains('is-unmatched')&&Boolean(card.querySelector('[data-item-unmatched]'));},id),true);}
        assert.equal(await gearHp(),beforeUnknownHp,'Unknown and fuzzy-unreviewed items cannot increase equipment stats');
        assert.equal(await execute(id=>document.querySelector(`[data-character-card="${id}"]`).querySelectorAll('[data-item-tier]').length,fuzzyId),1,'A captured tier suffix does not produce a second tier badge');
        await click(`[data-loose-inventory] [data-edit-card="${fuzzyId}"]`);assert.equal(await execute(id=>document.querySelector('[data-item-match-picker]')?.dataset.itemMatchPicker===id,fuzzyId),true);
        await execute(()=>{const query=document.querySelector('[data-item-match-query]');query.value='trail boots';query.dispatchEvent(new Event('input',{bubbles:true}));});await until(()=>execute(()=>[...document.querySelectorAll('[data-item-match-select]')].some(button=>button.textContent.includes('Synthetic Trail Boots'))),'flexible existing-item picker');
        await snapshot('character-unmatched-match.png',{selector:'[data-loose-inventory]'});
        const observedBeforeMatch=(await model()).candidates.find(card=>card.id===fuzzyId);await execute(()=>[...document.querySelectorAll('[data-item-match-select]')].find(button=>button.textContent.includes('Synthetic Trail Boots')).click());
        const matched=(await model()).candidates.find(card=>card.id===fuzzyId);assert.equal(matched.name,'Synthetic Trail Boots');assert.equal(matched.observedName,fuzzy.name);assert.deepEqual(matched.observedStats,observedBeforeMatch.observedStats);assert.equal(matched.rawStatBlock,fuzzy.rawStatBlock);assert.deepEqual(matched.evidence,observedBeforeMatch.evidence,'Canonicalizing identity preserves the original capture evidence');
        assert.equal((await model()).equipment.feet,bootsId,'Matching does not silently replace an occupied slot');
        await click(`[data-equipped-card="feet"][data-edit-card="${bootsId}"]`);await click('[data-card-unequip]');assert.equal(await execute(id=>document.querySelectorAll(`[data-loose-inventory] [data-character-card="${id}"]`).length,bootsId),1);
        const withoutBootsHp=await gearHp();await click(`[data-loose-inventory] [data-edit-card="${fuzzyId}"]`);await click('[data-slot-id="feet"] [data-equip-slot]');assert.equal((await model()).equipment.feet,fuzzyId);assert.equal(await gearHp(),withoutBootsHp+91,'Clicking the empty slot equips the selected known item and immediately updates totals');
        assert.equal(await execute(id=>Boolean(document.querySelector(`[data-loose-inventory] [data-character-card="${id}"]`)),fuzzyId),false);await click(`[data-equipped-card="feet"][data-edit-card="${fuzzyId}"]`);await click('[data-card-unequip]');assert.equal(await gearHp(),withoutBootsHp);assert.equal(await execute(id=>document.querySelectorAll(`[data-loose-inventory] [data-character-card="${id}"]`).length,fuzzyId),1,'Unequip restores the same physical item without duplication');
        const beforeLegacyHp=await gearHp();await execute(id=>{fixture.workspace.dispose();const legacy=fixture.model();legacy.equipment.head=id;const card=legacy.candidates.find(card=>card.id===id);card.wikiTitle=card.name;card.wikiMatch='confirmed';delete card.catalogIdentity;localStorage.setItem('eql-eye-of-zomm-character-v1',JSON.stringify(legacy));fixture.workspace=fixture.mount();},mysteryId);await step('unequip');assert.equal((await model()).equipment.head,undefined,'A legacy typed wiki match cannot restore an unknown item into equipment');assert.equal(await gearHp(),beforeLegacyHp,'Legacy unknown gear is excluded from computed totals after real remount');assert.equal(await execute(id=>Boolean(document.querySelector(`[data-loose-inventory] [data-character-card="${id}"] [data-item-unmatched]`)),mysteryId),true);
        const persistedMatched=(await model()).candidates.find(card=>card.id===fuzzyId);assert.equal(persistedMatched.name,'Synthetic Trail Boots');assert.equal(persistedMatched.observedName,fuzzy.name);assert.equal((await model()).metadata.aaCount,123);assert.match(await execute(()=>document.querySelector('[data-character-identity]').textContent),/Synthetic Pathfinder/);
        await snapshot('character-compact-inventory-1024.png',{selector:'[data-character-slots]'});await snapshot('character-compact-inventory-1024-20px.png',{font:20,selector:'[data-character-slots]'});
        await click('[data-walkthrough-next]');await step('base');
        const copyGate=await execute(()=>fixture.flow());
        await observe('character',{hp:620,str:76},{capturedAt:new Date(copyGate.baseAfterAt+1).toISOString(),sequence:copyGate.baseAfterSequence+1});
        await execute(()=>document.querySelector('[data-walkthrough-base]').requestSubmit());await step('reequip');
        await click('[data-walkthrough-next]');await step('slots');await click('[data-walkthrough-next]');await step('review');
        assert.equal((await model()).statSnapshots.equipped,null);
        await click('[data-walkthrough-stage] [data-character-preview]');await until(()=>execute(()=>document.querySelector('.character-share-dialog').open),'second snapshot preview');
        await click('[data-share-copy]');await step('complete');
        assert.equal(await execute(()=>fixture.copyCalls.length),2);assert.equal(await execute(()=>fixture.stops.length),2,'Copy completes exactly its own walkthrough');
        await click('[data-share-copy]');await until(()=>execute(()=>fixture.copyCalls.length===3),'repeat completed copy');
        assert.equal(await execute(()=>fixture.stops.length),2,'Repeat copy does not stop another session');
        await click('[data-share-close]');
        assert.equal(requests.length,0,`Walkthrough must stay offline: ${JSON.stringify(requests)}`);
        await execute(()=>fixture.workspace.dispose());
        return{ok:true,message:'Native Character walkthrough passed: details/source, staged freshness, automatic and ANY slots, same-item merge, persistent removal, computed review, resumable capture, canceled save and one completion stop.',screenshots:!!screenshots};
    }catch(error){error.message+=`\nRenderer diagnostics: ${JSON.stringify(errors)}\nSynthetic UI: ${JSON.stringify(await diagnostic())}`;throw error;}
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
