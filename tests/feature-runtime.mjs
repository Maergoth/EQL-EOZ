import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import * as registry from '../app/feature-registry.js';
import {mountFeatureControls} from '../app/feature-controls.js';
import {mountFeatureVisibility} from '../app/feature-visibility.js';
import {createCharacterProfiles} from '../app/character-profiles.js';
import {createCharacterWalkthrough} from '../app/character-walkthrough.js';
import {mountOverlayController} from '../app/overlay-controller.js';
import {renderIntel,renderParseContent} from '../app/overlay.js';
import {mountWhatsNew} from '../app/whats-new.js';
import {RELEASE_HISTORY} from '../app/release-history.js';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {EQLogParser} from '../app/parser.js';
import {TimerEngine} from '../app/timer-engine.js';
import {createOverlaySession} from '../app/overlay-session.js';
const require=createRequire(import.meta.url),{FeatureControls}=require('../desktop/feature-controls.cjs'),{WikiClient}=require('../desktop/wiki-client.cjs');
const {CaptureHost}=require('../desktop/capture-host.cjs'),{OverlayHost,normalizePreferences}=require('../desktop/overlay-host.cjs'),{CharacterRepository}=require('../desktop/character-repository.cjs');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const tick=()=>new Promise(done=>setImmediate(done));

assert.equal(registry.FEATURE_CATALOG.length,11);
assert.equal(registry.featureEnabled({},null),true);
assert.equal(registry.featureEnabled({},'typo'),false);
assert.equal(registry.featurePanelEnabled({map:false},'map'),false);
assert.equal(registry.featurePanelEnabled({overlays:false},'parse'),false);
assert.equal(registry.featurePanelEnabled({items:false},'intel'),true,'Shared item cards remain available outside the item browser');
{
    const dom=new JSDOM('<section id="features"></section>'),root=dom.window.document.querySelector('section'),held=deferred();let saved,notification;
    const view=mountFeatureControls({root,initial:{schemaVersion:1,revision:0,features:{}},api:{set:async patch=>{saved=patch;await held.promise;return {schemaVersion:1,revision:1,features:patch};},onChanged:callback=>{notification=callback;return()=>{};}}});
    const input=root.querySelector('[data-feature-setting="map"]');assert.equal(root.querySelectorAll('input[type="checkbox"]').length,11);
    assert(input.labels.length,'Checkboxes have native accessible labels');input.click();await tick();assert.deepEqual(saved,{map:false});assert(input.disabled);assert.equal(root.getAttribute('aria-busy'),'true');
    held.resolve();await tick();assert.equal(input.checked,false);assert(!input.disabled);assert.match(root.textContent,/saved/i);
    notification({schemaVersion:1,revision:0,features:{map:true}});assert.equal(input.checked,false,'Late older ACK cannot restore a disabled feature');
    view.dispose();dom.window.close();
}
{
    const parser=new EQLogParser();parser.character='Synthetic';
    const line=text=>'[Wed Oct 28 12:00:00 2026] '+text;
    parser.parse(line('You hit a synthetic rat for 20 points of damage.'));parser.parse(line('You have looted a Synthetic Gem.'));
    const before=parser.snapshot();assert.equal(before.totalDamage,20);assert.equal(before.totalLoot,1);
    assert.equal(parser.parse(line('You hit a synthetic rat for 70 points of damage.'),{recordCombat:false})?.type,undefined);
    const loot=parser.parse(line('You have looted a Synthetic Ruby.'),{recordDrops:false});assert.equal(loot.type,'loot','Independent contribution/observation consumers still receive loot events');
    parser.parse(line('You have entered Synthetic Vale.'),{recordCombat:false,recordDrops:false});
    const after=parser.snapshot();assert.equal(after.totalDamage,20);assert.equal(after.totalLoot,1);assert.equal(after.lootLog.length,1);assert.equal(after.zone,'Synthetic Vale');
    assert.deepEqual(parser.snapshot({includeCombat:false,includeDrops:false}).encounters,[]);assert.equal(parser.snapshot({includeCombat:false,includeDrops:false}).lootLog.length,0);assert.equal(parser.snapshot().encounters.length,before.encounters.length,'Bounded projections do not erase saved session work');
    parser.parse(line('You hit a synthetic rat for 5 points of damage.'),{recordCombat:true,recordDrops:false});assert.equal(parser.snapshot().totalDamage,25);
}
{
    let now=1000,canceled=0;const match=deferred();
    const engine=new TimerEngine({now:()=>now,matcher:{batch:()=>match.promise,cancel:()=>canceled++}});
    engine.start({label:'Synthetic countdown',durationSeconds:60},now);
    const definitions=engine.definitions;engine.setEnabled(false);assert.equal(canceled,1);assert.equal(engine.snapshot().timers[0].status,'paused');
    now+=120000;assert.equal(engine.snapshot().timers[0].remainingMs,60000);assert.equal(engine.drainCues().length,0);assert.deepEqual(engine.definitions,definitions);
    engine.setEnabled(true);assert.equal(engine.snapshot().timers[0].status,'paused','Re-enable needs an explicit countdown resume');
    engine.close();
    const storage=new Map(),published=[];const session=createOverlaySession({features:{triggers:false,overlays:false},storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},api:{publish:value=>published.push(value)},getSession:()=>({}),setInterval:()=>1,clearInterval:()=>{}});
    await assert.rejects(session.commandTimer('start',{label:'Denied',durationSeconds:5}),/disabled/);await session.publish();assert.equal(published.length,0);session.dispose();
}
{
    // Real WikiClient public-operation wrappers and final request admission.
    // Only the delayed local step is synthetic; no transport is allowed.
    let posts=0,entered;const wait=deferred(),controls=new FeatureControls({registry});
    class DelayedWiki extends WikiClient {
        async shareCharacter(){entered=true;await wait.promise;return this.characterSheetCapability();}
        async characterSheetCapability(){return this.request({action:'edit',title:'User:Synthetic',text:'<noinclude>[[Category:EoZ]]</noinclude>'},{post:true});}
    }
    const client=new DelayedWiki({featureLease:id=>controls.lease(id),fetchImpl:async()=>{posts++;throw Error('Unexpected transport');}});
    const old=client.shareCharacter();assert(entered);await controls.set({character:false});await controls.set({character:true});wait.resolve();await assert.rejects(old,/disabled/);assert.equal(posts,0,'A nested public helper cannot renew the old operation after disable/re-enable');
    await controls.set({contributions:false});await assert.rejects(client.preparePlan({}),/disabled/);assert.equal(posts,0);
}
{
    const origin='http://127.0.0.1:53147',contents={mainFrame:{url:origin+'/'},send(){}},main={webContents:contents,isDestroyed:()=>false};
    const firstStop=deferred();let stops=0,starts=0,recognized=0,appended=0,host;
    const controls=new FeatureControls({registry,apply:()=>host.featuresChanged()});
    const electron={app:{isPackaged:false,getPath:()=>'/unused'},ipcMain:{handle(){},removeHandler(){}},nativeImage:{createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:100,height:40})})}};
    const ocr={stop:()=>++stops===1?firstStop.promise:Promise.resolve(),recognize:()=>{recognized++;throw Error('Canceled OCR must not start');}};
    const journal={append:async value=>{appended++;return {...value,recordedAt:new Date().toISOString()};},close:async()=>{},initialize:async()=>{}};
    host=new CaptureHost({electron,origin,getMainWindow:()=>main,readingEnabled:true,isFeatureEnabled:()=>controls.enabled('screenReading'),isModeEnabled:mode=>controls.enabled(mode==='character'?'character':'contributions'),featureLease:id=>controls.lease(id),ocr,journal});
    host.choices=[{id:'window:synthetic',name:'EverQuest Synthetic'}];host.startSource=async()=>{starts++;};
    const pending=host.start({mode:'character',sourceId:'window:synthetic'});await tick();
    await controls.set({character:false});await controls.set({character:true});firstStop.resolve();await pending;
    assert.equal(starts,0,'An awaited source start cannot acquire a fresh mode intent after disable/re-enable');assert.equal(host.owner,null);assert.equal(host.readingEnabled,true,'Availability does not change OCR consent');
    const held=deferred();ocr.stop=()=>++stops===4?held.promise:Promise.resolve();stops=3;
    const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(100,16);png.writeUInt32BE(40,20);
    const imported=host.importPng(png,{mode:'character'});await tick();assert.equal(host.owner,null,'Manual imports can have no continuous owner');
    await controls.set({character:false});await controls.set({character:true});held.resolve();assert.equal((await imported).cancelled,true);assert.equal(recognized,0);assert.equal(appended,0);
    host.owner='character';host.contributionResume={source:{id:'window:synthetic'},sessionId:'old-resume'};
    await controls.set({contributions:false});assert.equal(host.contributionResume,null,'Disabling Contributions clears its queued resume even under Character ownership');await controls.set({contributions:true});host.owner=null;
    const module=deferred();host.logEvidenceModule=module.promise;
    const logged=host.ingestLogObservation({type:'kill',victim:'Synthetic Rat'},{live:true});await controls.set({contributions:false});await controls.set({contributions:true});
    module.resolve({logContributionObservation:()=>({kind:'game-log',owner:'contribution',subject:{kind:'npc',name:'Synthetic Rat'},fields:[],relations:[],input:{logId:'synthetic',cursor:1},capturedAt:new Date().toISOString()})});
    assert.equal((await logged).accepted,false);assert.equal(appended,0,'Late log-module completion cannot add a disabled contribution observation');
    await controls.set({screenReading:false});assert.equal((await host.ingestLogObservation({type:'kill',victim:'Synthetic Rat'},{live:true})).accepted,true,'Logs remain independent of OCR availability');
    await host.dispose();
}
{
    const screen=new EventEmitter();screen.getAllDisplays=()=>[{workArea:{x:0,y:0,width:1920,height:1040}}];let enabled=true,created=0,destroyed=0;
    const origin='http://127.0.0.1:53147',contents={mainFrame:{url:origin+'/'},send(){}},main={webContents:contents,isDestroyed:()=>false};
    const host=new OverlayHost({electron:{screen,globalShortcut:{unregister(){}},ipcMain:{removeHandler(){}}},origin,getMainWindow:()=>main,showMain(){},readPreferences:async()=>({}),writePreferences:async()=>{},isPanelEnabled:id=>id!=='parse'||enabled});
    host.preferences=normalizePreferences({panels:{parse:{visible:true}}},screen.getAllDisplays());
    host.windows.set('parse',{isDestroyed:()=>false,destroy(){destroyed++;host.windows.delete('parse');}});
    enabled=false;host.featuresChanged();assert.equal(destroyed,1);assert.equal(host.preferences.panels.parse.visible,true,'Saved window preference is retained');
    enabled=true;host.featuresChanged();host.createPanel=()=>{created++;return null;};
    await host.handleMainRequest({sender:contents,senderFrame:contents.mainFrame},'publish',{schemaVersion:1,session:{timers:{timers:[]}}});host.restoreBounds();
    assert.equal(created,0,'A heartbeat and display change cannot reopen a feature-suspended panel');assert.equal(host.getState().panels.parse.visible,false);
    await host.control('show','parse');assert.equal(created,1,'Only an explicit Show clears transient suspension');
    let menu;host.electron.Menu={buildFromTemplate:rows=>rows};host.tray={setToolTip(){},setContextMenu:rows=>menu=rows,destroy(){}};enabled=false;host.featuresChanged();assert(!menu.some(row=>row.label==='Combat parse'),'Disabled panels are absent from the actual native tray menu');assert(menu.some(row=>row.label==='Map & intel'));
    host.isPanelEnabled=()=>false;host.featuresChanged();assert.deepEqual(menu.filter(row=>row.label).map(row=>row.label),['Open Eye of Zomm','Quit Eye of Zomm'],'Core recovery stays without any unavailable overlay actions');host.dispose();
}
{
    // Exercise the real suspension path without starting a worker: an already
    // admitted atomic commit must ACK; staged imports cancel instead.
    const done=deferred(),calls=[],repository={job:{committing:true,running:done.promise},seed:null,request:async action=>{calls.push(action);return {ok:true};}};
    let finished=false;const suspend=CharacterRepository.prototype.suspend.call(repository).then(()=>finished=true);await tick();assert.equal(finished,false);assert.deepEqual(calls,[]);
    done.resolve();await suspend;assert.deepEqual(calls,['flush']);assert.equal(repository.job.cancelled,undefined);
    repository.job={committing:false,id:'staged'};await CharacterRepository.prototype.suspend.call(repository);assert.equal(repository.job.cancelled,true);assert.deepEqual(calls,['flush','cancelImport','flush']);
}
{
    const dom=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
    const prior={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData};Object.assign(globalThis,{document:dom.window.document,window:dom.window,FormData:dom.window.FormData});
    const pending=[],notices=[],values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};let reads=0;
    const wiki={contributionIgnores:()=>{reads++;const value=deferred();pending.push(value);return value.promise;}};
    let workspace;
    try{
        workspace=mountCaptureWorkspace({document:dom.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,characterRepository:null,inventory:null,share:null,features:{contributions:false,character:false},notify:message=>notices.push(message),getPack:()=>({items:[],npcs:[],zones:[]})});
        await tick();assert.equal(reads,0,'Disabled startup does not call the denied contribution ignore API');assert.deepEqual(notices,[]);
        workspace.setFeatures({contributions:true,character:false});await tick();assert.equal(reads,1);
        workspace.setFeatures({contributions:false,character:false});pending[0].resolve({schemaVersion:1,entries:[{kind:'npc',name:'Old Ignored',basis:'exact'}]});await tick();
        assert.equal(workspace.suppression('npc','Old Ignored').suppressed,false,'A retired availability epoch cannot apply its late ignore list');assert.deepEqual(notices,[]);
        workspace.setFeatures({contributions:true,character:false});await tick();assert.equal(reads,2,'Re-enable reads a fresh device ignore list');
        pending[1].resolve({schemaVersion:1,entries:[{kind:'npc',name:'Current Ignored',basis:'exact'}]});await tick();assert.equal(workspace.suppression('npc','Current Ignored').suppressed,true);
        workspace.setFeatures({contributions:false,character:false});workspace.setFeatures({contributions:true,character:false});await tick();workspace.setFeatures({contributions:false,character:false});pending[2].resolve(null);await tick();assert.deepEqual(notices,[],'A late failed disabled request does not emit a misleading startup warning');
    }finally{workspace?.dispose();Object.assign(globalThis,prior);dom.window.close();}
}
{
    // Exercise the actual renderer buffer, native local-collection gate and
    // existing RendererDrain together; no network, disk or Electron GUI.
    const {RendererDrain,CHANNEL:drainChannel}=require('../desktop/renderer-drain.cjs'),{DropObservationHost}=require('../desktop/drop-observation-host.cjs');
    const source=await readFile(new URL('../app/app.js',import.meta.url),'utf8'),mainSource=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8');
    const handlers=new Map(),origin='http://127.0.0.1:53147',stored=[],applied=[],notifications=[];let callback,resume,hold=deferred(),fail=false,controls;
    const contents={mainFrame:{url:origin+'/'},send(channel,value){assert.equal(channel,drainChannel);if(value.resume){resume();return;}Promise.resolve().then(callback).then(ok=>drain.handle(event,'complete',{id:value.id,ok:ok===true}));}},main={webContents:contents,isDestroyed:()=>false},event={sender:contents,senderFrame:contents.mainFrame};
    const ipcMain={handle:(channel,handler)=>handlers.set(channel,handler),removeHandler:channel=>handlers.delete(channel)};
    const storage={initialize:async()=>{},status:()=>({enabled:true,pending:stored.length}),append:async events=>{await hold.promise;if(fail)throw Error('Synthetic disk full');stored.push(...events);return {accepted:events.length};},close:async()=>{}};
    const observations=new DropObservationHost({electron:{ipcMain},origin,getMainWindow:()=>main,client:{status(){throw Error('No network during local drain');}},storage,autoStart:false,isFeatureEnabled:()=>controls.enabled('dropObservations')});
    const drain=new RendererDrain({ipcMain,origin,getMainWindow:()=>main,timeout:1000});
    const context=vm.createContext({window:{eyeOfZommObservations:{collect:events=>observations.handle(event,'collect',{events})},eyeOfZommLifecycle:{onDrain:(fn,release)=>{callback=fn;resume=release;}}},observationPending:[{id:'synthetic_before_disable'}],observationSending:null,observationRetry:null,observationWarning:false,observationPreference:true,sessionDraining:false,pollTimer:null,
        showNotice:message=>notifications.push(message),setTimeout:()=>1,clearTimeout(){},schedulePoll(){},captureWorkspace:{drainCharacterForClose:async()=>{},resumeCharacterAfterCloseDrain(){}},rendererDrain:drain,quitting:false,reloading:false});
    const flushStart=source.indexOf('async function flushObservations()'),flushEnd=source.indexOf('let lootByNpcZone',flushStart);assert(flushStart>=0&&flushEnd>flushStart);
    vm.runInContext(source.slice(flushStart,flushEnd),context);drain.handle(event,'ready');
    const prepareStart=mainSource.indexOf('async function prepareFeatureState('),prepareEnd=mainSource.indexOf('async function applyFeatureState(',prepareStart);assert(prepareStart>=0&&prepareEnd>prepareStart);vm.runInContext(mainSource.slice(prepareStart,prepareEnd),context);
    controls=new FeatureControls({registry,prepare:context.prepareFeatureState,apply:async next=>{applied.push(next.features.dropObservations);assert.equal(stored.length,1,'All pre-disable pending rows save before native policy revokes');}});
    const oldLease=controls.lease('dropObservations'),saving=context.flushObservations(),change=controls.set({dropObservations:false});await tick();assert(context.sessionDraining);assert(oldLease());assert.equal(applied.length,0);assert.equal(stored.length,0);
    hold.resolve();await saving;await change;assert.equal(context.observationPending.length,0);assert.equal(stored.length,1);assert.equal(controls.enabled('dropObservations'),false);assert.equal(context.sessionDraining,false);assert.equal(context.observationPreference,true,'Availability never overwrites collection consent');
    context.observationPending.push({id:'synthetic_defensive_retention'});assert.equal(await context.flushObservations(),false);assert.equal(context.observationPending.length,1);assert.equal(stored.length,1);assert.equal(context.observationPreference,true,'Availability denial cannot masquerade as consent being off');
    controls.apply=async()=>{};await controls.set({dropObservations:true});await context.flushObservations();assert.equal(stored.length,2);assert.equal(context.observationPending.length,0);
    context.observationPending.push({id:'synthetic_failed_save'});fail=true;const validLease=controls.lease('dropObservations'),before=controls.snapshot();await assert.rejects(controls.set({dropObservations:false}),/could not be saved/);assert.deepEqual(controls.snapshot(),before);assert(validLease());assert.equal(context.observationPending.length,1);assert.equal(context.sessionDraining,false,'A failed local save resumes the existing window without changing availability');
    fail=false;await context.flushObservations();assert.equal(stored.length,3);assert.equal(context.observationPending.length,0);
    context.quitting=true;const prior=controls.snapshot();await assert.rejects(controls.set({dropObservations:false}),/window operation/);assert.deepEqual(controls.snapshot(),prior);context.quitting=false;
    drain.dispose();await observations.close();
}
{
    const dom=new JSDOM('<div id="contribution-workspace"></div><section class="view is-active"><div id="character-workspace"></div></section><div id="capture-settings"></div><div id="overlay-controller"></div><button id="open-native-overlays"></button>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
    const prior={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData};Object.assign(globalThis,{document:dom.window.document,window:dom.window,FormData:dom.window.FormData});
    const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},profiles=createCharacterProfiles({storage}),flow=createCharacterWalkthrough({storage:profiles.storage});flow.begin();flow.advance();flow.inventoryImported();
    let workspace,projection,controller;
    const available={character:true,contributions:false,screenReading:false,map:false,combat:false,triggers:true};
    try{
        workspace=mountCaptureWorkspace({document:dom.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki:null,capture:null,characterRepository:null,inventory:null,share:null,features:available,getPack:()=>({items:[],npcs:[],zones:[]})});
        projection=mountFeatureVisibility({root:dom.window.document,features:available,MutationObserver:dom.window.MutationObserver});
        const hidden=selector=>Boolean(dom.window.document.querySelector(selector).closest('[hidden],[data-feature-ui-hidden]'));
        assert(hidden('#contribution-workspace'));assert(hidden('#capture-settings'));assert(hidden('[data-character-stat-preparation]'));assert(hidden('[data-walkthrough-source-select]'));assert(hidden('[data-walkthrough-read-stats]'));assert(hidden('.walkthrough-options'));assert(hidden('[data-character-wiki-gaps]'));
        assert(!hidden('[data-walkthrough-stats-values]'),'Manual recorded statistics remain available without OCR');assert(!hidden('[data-walkthrough-stats] button'));assert(!dom.window.document.querySelector('[data-share-photo]').closest('[data-feature-ui-hidden]'),'Optional private image selection is not Screen Reading');
        assert.match(dom.window.document.querySelector('[data-walkthrough-stats-age]').textContent,/manually/);
        const screenOn={...available,screenReading:true};workspace.setFeatures(screenOn);projection.setFeatures(screenOn);assert(!hidden('#capture-settings'));assert(!hidden('[data-walkthrough-read-stats]'));assert(hidden('[data-capture-start]'),'Contribution start stays absent while Character OCR remains enabled');assert(hidden('[data-capture-import]'));assert(!dom.window.document.querySelector('[data-capture-sources]').closest('[data-feature-ui-hidden]'));assert(hidden('[data-capture-sources]'),'Availability projection preserves the separate unchecked OCR consent guard');
        controller=mountOverlayController({document:dom.window.document,api:null,setInterval:()=>1,clearInterval(){}});
        const panels=Object.fromEntries(['parse','map','intel','timers'].map(id=>[id,{disabled:id==='parse'||id==='map',visible:false}]));controller.render({panels,globalMode:'hidden'});projection.setFeatures(screenOn);assert(hidden('.overlay-controller-row[data-panel="parse"]'));assert(hidden('.overlay-controller-row[data-panel="map"]'));assert(!hidden('.overlay-controller-row[data-panel="intel"]'));
        controller.render({panels:Object.fromEntries(Object.keys(panels).map(id=>[id,{disabled:true}])),globalMode:'hidden'});assert(hidden('#overlay-controller'));assert(hidden('#open-native-overlays'),'No global overlay controls remain when every panel feature is off');
        const inspection=dom.window.document.createElement('section');inspection.innerHTML=renderIntel({npcs:[{name:'Synthetic Keeper',waypoint:'/waypoint 1, 2',drops:[{name:'Synthetic Gem',stats:{HP:5}}]}]})+renderParseContent({tab:'session',stats:{totalDamage:5,totalLoot:2}});dom.window.document.body.append(inspection);projection.setFeatures({...screenOn,npcIntel:true,items:false,drops:false});
        for(const selector of ['[data-npc-action="route"]','[data-npc-action="map"]','[data-npc-action="copy-waypoint"]'])assert(hidden(selector));assert(!hidden('[data-item-hover]'),'Shared item inspection survives disabling only the item browser');assert(hidden('tr[data-feature-ui="drops"]'),'Drop totals disappear from the enabled Parse tool');
    }finally{controller?.dispose();projection?.dispose();workspace?.dispose();Object.assign(globalThis,prior);dom.window.close();}
}
{
    const {WikiHost}=require('../desktop/wiki-host.cjs');let enabled={character:true,contributions:false,dropObservations:false},closed=0,status=0;
    const host={isFeatureEnabled:id=>enabled[id],loginWindow:{isDestroyed:()=>false,close(){closed++;}},capturedItemPlans:new Map(),discoveryVerifier:{clear(){}},client:{cancelFeature(){}},freshStatus:async()=>status++,disposed:false};
    WikiHost.prototype.featuresChanged.call(host);assert.equal(closed,0,'An enabled Character consumer retains the shared login window');
    enabled.character=false;WikiHost.prototype.featuresChanged.call(host);assert.equal(closed,1);await WikiHost.prototype.publishStatus.call(host);assert.equal(status,0,'Withdrawing the last wiki consumer cannot start another account-status request');
}
{
    const dom=new JSDOM('<button id="tour-open"></button>',{url:'http://127.0.0.1/',pretendToBeVisual:true}),document=dom.window.document;
    const tour=mountWhatsNew({document,button:document.querySelector('button'),storage:null,getVersion:()=>RELEASE_HISTORY[0].version});
    const disabled=Object.fromEntries(registry.FEATURE_IDS.map(id=>[id,false])),projection=mountFeatureVisibility({root:document,features:disabled,MutationObserver:dom.window.MutationObserver});
    try{
        const featureRelease=RELEASE_HISTORY.find(release=>release.steps.some(step=>registry.featureForView(step.view)));tour.open(featureRelease.version);
        for(let i=0;!registry.featureForView(featureRelease.steps[i].view);i++)document.querySelector('[data-tour-next]').click();
        projection.setFeatures(disabled);assert(document.querySelector('[data-tour-feature]').hasAttribute('data-feature-ui-hidden'));assert(!document.querySelector('[data-tour-image]').hasAttribute('data-feature-ui-hidden'),'Historical artwork is still available as release history');
        const coreRelease=RELEASE_HISTORY.find(release=>!release.steps.length||release.steps.some(step=>!registry.featureForView(step.view)));tour.open(coreRelease.version);
        if(coreRelease.steps.length)for(let i=0;registry.featureForView(coreRelease.steps[i].view);i++)document.querySelector('[data-tour-next]').click();
        await tick();assert(!document.querySelector('[data-tour-feature]').hasAttribute('data-feature-ui'));assert(!document.querySelector('[data-tour-feature]').hasAttribute('data-feature-ui-hidden'),'Reused tour action restores core Settings navigation without revealing a disabled tool');
    }finally{projection.dispose();tour.dispose();dom.window.close();}
}
{
    const source=await readFile(new URL('../app/app.js',import.meta.url),'utf8'),start=source.indexOf('function cancelDiscoveryChecks(){'),end=source.indexOf('window.eyeOfZommDiscovery?.onAction',start);assert(start>=0&&end>start);
    let enabled=false,local=0,native=0;const context=vm.createContext({featureEnabled:id=>registry.featureEnabled({contributions:enabled},id),wikiDiscovery:{cancelChecks:()=>local++},window:{eyeOfZommDiscovery:{action:async action=>{assert.equal(action,'cancel-item-checks');native++;}}}});
    vm.runInContext(source.slice(start,end),context);context.cancelDiscoveryChecks();await tick();assert.equal(local,1);assert.equal(native,0,'Disabled Contribute cleanup remains local; the native disable transition already withdrew requests');
    enabled=true;context.cancelDiscoveryChecks();await tick();assert.equal(local,2);assert.equal(native,1,'Enabled source changes retain native item-check invalidation');
}
{
    // Availability is not an authored editor action: preserve even historical
    // blank/default fields and exact registry timestamps byte for byte.
    const dom=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
    const prior={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData};Object.assign(globalThis,{document:dom.window.document,window:dom.window,FormData:dom.window.FormData});
    const key='eql-eye-of-zomm-contributions-v1',draft={id:'contribution-1',key:'npc|a synthetic pending watcher|synthetic vale',aliasKeys:[],kind:'npc',name:'a synthetic pending watcher',title:'a synthetic pending watcher',zone:'Synthetic Vale',instance:'unknown',era:'',playerText:'Keep this synthetic draft.',fields:{},sources:[],relations:[],evidence:[],status:'needs-review',membership:'unknown',canonicalTitle:null,revisionId:null,reasons:['catalog-unknown'],intent:'review',manual:true};
    const values=new Map([[key,JSON.stringify({schemaVersion:1,sequence:1,cursor:0,candidates:[draft],archive:[],registry:[],ignored:[],seenLogIds:[]})]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},pack={meta:{sample:true,wikiEntitiesComplete:true},items:[],npcs:[],zones:[]};let workspace;
    try{
        workspace=mountCaptureWorkspace({document:dom.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki:null,capture:null,characterRepository:null,inventory:null,share:null,getPack:()=>pack});await tick();
        const original=values.get(key);assert.equal(JSON.parse(original).candidates[0].era,'');assert.equal(JSON.parse(original).candidates[0].intent,'review');
        await workspace.prepareFeatureChange({map:false});workspace.setFeatures({map:false});assert.equal(values.get(key),original);
        await workspace.prepareFeatureChange({contributions:false});workspace.setFeatures({contributions:false});workspace.setFeatures({contributions:false,character:false});workspace.setFeatures({contributions:false,character:true});await tick();assert.equal(values.get(key),original,'Untouched draft and registry timestamps survive unrelated/off/on availability patches exactly');
        workspace.setFeatures({contributions:true});workspace.openContribution('contribution-1');const field=dom.window.document.querySelector('[data-candidate-form] [name="playerText"]');assert(field);field.value='Synthetic author edit retained immediately.';field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
        assert.equal(JSON.parse(values.get(key)).candidates[0].playerText,field.value,'Actual authored input is already saved before a feature toggle');const edited=values.get(key);
        await workspace.prepareFeatureChange({character:false});workspace.setFeatures({character:false});await workspace.prepareFeatureChange({contributions:false});workspace.setFeatures({character:false,contributions:false});workspace.refresh();await tick();assert.equal(values.get(key),edited,'Availability changes do not resave or normalize an already-persisted authored edit');
    }finally{workspace?.dispose();Object.assign(globalThis,prior);dom.window.close();}
}
{
    const dom=new JSDOM('<div id="contribution-workspace"></div><section class="view is-active"><div id="character-workspace"></div></section><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true}),prior={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData};Object.assign(globalThis,{document:dom.window.document,window:dom.window,FormData:dom.window.FormData});
    const values=new Map([['eql-eye-of-zomm-character-v1',JSON.stringify({schemaVersion:1,metadata:{name:'Synthetic',server:'Realm'},inventoryExport:{schemaVersion:1,rejectedItems:[{name:'Synthetic Unlisted Gem',baseName:'Synthetic Unlisted Gem',location:'Bank1',reason:'wiki-item-missing'}]}})]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},pack={meta:{sample:false,wikiEntitiesComplete:true},items:[],npcs:[],zones:[],wikiEntities:{items:[],npcs:[],zones:[],titles:[]}};let workspace;
    try{
        workspace=mountCaptureWorkspace({document:dom.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki:null,capture:null,characterRepository:null,inventory:null,share:null,features:{contributions:false},getPack:()=>pack});await tick();const before=values.get('eql-eye-of-zomm-contributions-v1');assert.equal(JSON.parse(before||'{"candidates":[]}').candidates.length,0);
        workspace.refresh();workspace.setFeatures({contributions:false,character:false});workspace.setFeatures({contributions:false,character:true});workspace.refresh();await tick();assert.equal(values.get('eql-eye-of-zomm-contributions-v1'),before,'Character renders cannot create contribution work while Contributions is unavailable');
        workspace.setFeatures({contributions:true});await tick();assert(JSON.parse(values.get('eql-eye-of-zomm-contributions-v1')).candidates.some(candidate=>candidate.name==='Synthetic Unlisted Gem'),'A later explicit feature enable can discover retained inventory gaps');
    }finally{workspace?.dispose();Object.assign(globalThis,prior);dom.window.close();}
}
{
    const source=await readFile(new URL('../app/capture-workspace.js',import.meta.url),'utf8'),start=source.indexOf('    async function contributeInventoryItem('),end=source.indexOf('    function acceptsStatsRead(',start);assert(start>=0&&end>start);
    const wait=deferred(),candidate={id:'synthetic-gap',name:'Synthetic Missing Gem'},adds=[];let enabled=true;
    const context=vm.createContext({enabled:()=>enabled,ignoreLoadEpoch:0,disposed:false,inventoryGaps:[{id:candidate.id,name:candidate.name}],queue:{snapshot:()=>[candidate],add:value=>{adds.push(value);return candidate;}},discoveryGate:{signature:()=> 'same',check:()=>wait.promise,project:()=>({reasons:['missing-page']})},selectedId:'',renderQueue(){},renderCandidate(){},navigate(){},loadWiki(){},notify(){}});
    vm.runInContext(source.slice(start,end),context);const old=context.contributeInventoryItem(0);enabled=false;context.ignoreLoadEpoch++;enabled=true;wait.resolve();await old;assert.equal(adds.length,0,'A result from before disable/re-enable cannot force a new contribution draft');enabled=false;await context.contributeInventoryItem(0);assert.equal(adds.length,0);
}
console.log('Feature runtime: accessible ACK controls, independent parser projection/retention, timer suspension, overlay publication denial and real nested wiki lease revocation passed.');
