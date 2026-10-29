// Production main/preload integration; only native dialogs/capture enumeration
// are replaced, so no installed profile, real game source or public wiki is used.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,open,rm,lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname,basename,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:resolve(args[i+1]);};
assert(args.length%2===0&&args.every((value,index)=>index%2===0?['--screenshots','--proof','--packaged-root'].includes(value):Boolean(value)),'Use --screenshots, --proof and/or --packaged-root paths.');
const packagedRoot=option('--packaged-root'),runtimeRoot=packagedRoot||root;
if(packagedRoot){const stat=await lstat(packagedRoot);assert(stat.isFile()&&!stat.isSymbolicLink()&&basename(packagedRoot)==='app.asar','Use an explicit regular app.asar.');}
const archiveHash=async()=>packagedRoot?{path:packagedRoot,bytes:(await lstat(packagedRoot)).size,sha256:createHash('sha256').update(await readFile(packagedRoot)).digest('hex')}:null;
const archiveBefore=await archiveHash();
const temporary=await mkdtemp(join(tmpdir(),'eoz-feature-controls-'));
const proof=option('--proof')||join(root,'.local','feature-controls-proof',new Date().toISOString().replace(/[:.]/g,'-')),screenshots=option('--screenshots')||join(proof,'screenshots');
const require=createRequire(import.meta.url),electron=require('electron');
const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game');
const sourceFiles=execFileSync('git',['-c','safe.directory=*','-C',root,'ls-files','--cached','--others','--exclude-standard','app','desktop','package.json','package-lock.json'],{encoding:'utf8',windowsHide:true}).trim().split('\n').filter(file=>/\.(?:c?js|mjs|json|html|css|svg)$/.test(file));
const sourceHashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(join(root,file))).digest('hex')])));
const before=await sourceHashes();
let passed=false;

async function native({root,temporary,profile,game,proof,screenshots,phase,expectedVersion,packaged}){
    const electron=require('electron'),{app,BrowserWindow,session}=electron;
    const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
    const phaseFile=path.join(proof,phase+'.json'),events=[],network={blocked:0},startedAt=new Date().toISOString();
    let owner,finished=false,chooserResolve=null,chooserRequested=false,holdAppend=false,appendEntered=false,releaseAppend=null,completedLogOffset=0;
    const write=value=>fs.writeFileSync(phaseFile,JSON.stringify({startedAt,phase,...value},null,2)+'\n');
    const fatal=error=>{if(finished)return;finished=true;write({ok:false,error:error.stack||String(error),events,currentURL:owner&&!owner.isDestroyed()?owner.webContents.getURL():null});app.exit(1);};
    process.on('uncaughtException',fatal);process.on('unhandledRejection',fatal);
    const watchdog=setTimeout(()=>fatal(Error('Native feature proof exceeded 90 seconds.')),90000);watchdog.unref();
    const mark=(name,value={})=>{events.push({name,...value});write({ok:null,events});};
    app.setPath('userData',profile);app.disableHardwareAcceleration();
    const nativeShowInactive=BrowserWindow.prototype.showInactive;
    BrowserWindow.prototype.show=()=>{};BrowserWindow.prototype.showInactive=()=>{};BrowserWindow.prototype.focus=()=>{};
    const wrapped={...electron,desktopCapturer:{...electron.desktopCapturer,getSources:async()=>[]},
        dialog:{...electron.dialog,showErrorBox:(title,message)=>fatal(Error(title+': '+message)),
            showOpenDialog:async()=>{assert.equal(phase,'initial');assert(!chooserRequested);chooserRequested=true;return new Promise(done=>{chooserResolve=done;});}},
        shell:{...electron.shell,openExternal:async()=>{throw Error('External navigation is disabled in this synthetic proof.');}}};
    const load=Module._load;Module._load=function(name,...rest){return name==='electron'?wrapped:load.call(this,name,...rest);};
    if(phase==='initial'){
        const {DropObservationStorage}=require(path.join(root,'desktop/drop-observation-storage.cjs')),append=DropObservationStorage.prototype.append;
        DropObservationStorage.prototype.append=async function(...values){
            if(holdAppend&&Array.isArray(values[0])&&values[0].length){holdAppend=false;appendEntered=true;await new Promise(done=>{releaseAppend=done;});}
            return append.apply(this,values);
        };
    }
    global.fetch=async()=>{network.blocked++;throw Error('Public network disabled in the synthetic feature proof.');};
    const restrict=ses=>{
        ses.webRequest.onBeforeRequest((details,done)=>{try{const url=new URL(details.url),deny=['http:','https:'].includes(url.protocol)&&url.hostname!=='127.0.0.1';if(deny)network.blocked++;done({cancel:deny});}catch{done({cancel:true});}});
        ses.webRequest.onCompleted(details=>{try{const url=new URL(details.url);if(details.method==='GET'&&details.statusCode===200&&url.hostname==='127.0.0.1'&&url.pathname==='/api/log'){const offset=Number(url.searchParams.get('offset'));if(Number.isSafeInteger(offset)&&offset>0)completedLogOffset=Math.max(completedLogOffset,offset);}}catch{}});
    };
    const wait=ms=>new Promise(done=>setTimeout(done,ms));
    const eqStamp=()=>{const now=new Date(),pad=value=>String(value).padStart(2,'0');return `[${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][now.getDay()]} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]} ${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${now.getFullYear()}] `;};
    const until=async(fn,label,timeout=15000)=>{const end=Date.now()+timeout;let last;while(Date.now()<end){try{last=await fn();if(last)return last;}catch(error){last=error.message;}await wait(40);}throw Error(label+'; last='+JSON.stringify(last));};
    const run=(fn,...values)=>owner.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(values)})`);
    const active=()=>run(()=>document.querySelector('[data-view-panel].is-active')?.dataset.viewPanel);
    const state=()=>run(()=>window.eyeOfZommFeatures.getState());
    const nav={map:'map',npcIntel:'npcs',items:'items',drops:'drops',combat:'combat',triggers:'timers',contributions:'contribute',character:'character'};
    const ids=['map','npcIntel','items','drops','combat','triggers','contributions','character','overlays','screenReading','dropObservations'];
    const settingsCards={map:'#map-settings',combat:'#combat-settings',screenReading:'#capture-settings',dropObservations:'#observation-settings',overlays:'#overlay-controller'};
    const overlayRows={map:'map',npcIntel:'intel',combat:'parse',triggers:'timers'};
    const visibility=async(entries,label)=>until(()=>run(entries=>entries.every(([selector,expected])=>{
        const node=document.querySelector(selector);if(!node)return false;
        let visible=true;
        for(let current=node;current;current=current.parentElement){const style=getComputedStyle(current);if(current.hidden||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'){visible=false;break;}}
        visible=visible&&node.getClientRects().length>0;
        return visible===expected;
    }),entries),label);
    const change=async(id,enabled)=>{
        await run((id,enabled)=>{const input=document.querySelector(`[data-feature-setting="${id}"]`);if(!input||input.disabled)throw Error('Missing ready feature checkbox '+id);if(input.checked!==enabled)input.click();},id,enabled);
        await until(async()=>{const value=await state();return value.features[id]===enabled&&await run(()=>document.querySelector('#feature-settings')?.getAttribute('aria-busy')==='false');},'native acknowledged '+id+'='+enabled);
        if(nav[id])await until(()=>run((view,enabled)=>{const node=document.querySelector(`[data-view="${view}"]`);return Boolean(node)&&(!node.hidden&&getComputedStyle(node).display!=='none')===enabled;},nav[id],enabled),'navigation follows '+id);
        if(settingsCards[id])await visibility([[settingsCards[id],enabled]],'Settings card is entirely '+(enabled?'shown':'hidden')+': '+id);
        if(overlayRows[id]){const flags=(await state()).features;await visibility([[`.overlay-controller-row[data-panel="${overlayRows[id]}"]`,enabled&&flags.overlays]],'Generated overlay row follows '+id);}
    };
    const collectionConsent=async enabled=>{
        await run(enabled=>new Promise((resolve,reject)=>{
            const input=document.querySelector('[data-observation-enabled]'),status=document.querySelector('[data-observation-status]');
            if(!input||input.disabled||!status)return reject(Error('Collection consent UI is unavailable.'));
            if(input.checked===enabled)return reject(Error('Collection consent must change through its UI handler.'));
            const timeout=setTimeout(()=>{observer.disconnect();reject(Error('Collection consent renderer acknowledgement timed out.'));},5000);
            const observer=new MutationObserver(()=>{if(input.checked===enabled&&/\d+ pending.*\d+ delivered/.test(status.textContent)){clearTimeout(timeout);observer.disconnect();resolve(true);}});
            observer.observe(status,{childList:true,characterData:true,subtree:true});input.click();
        }),enabled);
        assert.equal((await run(()=>window.eyeOfZommObservations.status())).enabled,enabled,'Actual collection consent UI and native storage agree');
    };
    const saved=async()=>run(async()=>{const api=window.eyeOfZommCharacterRepository,b=await api.bootstrap();assertOk(b);const core=await api.getCore({profileId:b.activeProfileId});assertOk(core);const item=await api.get({profileId:b.activeProfileId,id:'feature-keepsake'});assertOk(item);const storage=await window.eyeOfZommCharacterStorage.read({keys:['eql-eye-of-zomm-contributions-v1']});return{profileId:b.activeProfileId,core:core.core,item:item.item||item.card,contributions:storage.values['eql-eye-of-zomm-contributions-v1']};function assertOk(value){if(!value.ok)throw Error(value.error||'Character native read failed.');}});
    const capture=async(name,width,height)=>{
        const featuresPicture=name.startsWith('feature-controls');
        const picturePosition=()=>run(()=>{
            const bounds=node=>{if(!node)return null;const r=node.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
            const visible=node=>{const r=bounds(node);if(!r||r.width<=0||r.height<=0||r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight)return false;for(let parent=node.parentElement;parent;parent=parent.parentElement){const s=getComputedStyle(parent),p=bounds(parent);if(parent.hidden||s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse')return false;if(/auto|scroll|hidden|clip/.test(s.overflowY)&&(r.top<p.top||r.bottom>p.bottom))return false;if(/auto|scroll|hidden|clip/.test(s.overflowX)&&(r.left<p.left||r.right>p.right))return false;}return true;};
            const heading=document.querySelector('#settings-topic-features-title'),controls=[...document.querySelectorAll('[data-feature-setting]')],content=document.querySelector('.content');
            return{viewport:{width:innerWidth,height:innerHeight},scroll:{windowX:scrollX,windowY:scrollY,contentTop:content?.scrollTop,contentLeft:content?.scrollLeft},content:bounds(content),topic:bounds(document.querySelector('[data-settings-topic="features"]')),heading:bounds(heading),headingVisible:visible(heading),controls:controls.map(input=>({id:input.dataset.featureSetting,bounds:bounds(input.closest('label')),visible:visible(input.closest('label'))}))};
        });
        if(featuresPicture)mark('capture-position',{name,stage:'before-resize',...await picturePosition()});
        owner.setContentSize(width,height);nativeShowInactive.call(owner);await wait(120);await run(()=>{document.querySelector('[data-tour-close]')?.click();document.querySelector('#settings-search')?.blur();return Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));});
        await run(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        if(featuresPicture){
            mark('capture-position',{name,stage:'after-resize-show-stable',...await picturePosition()});
            await run(()=>document.querySelector('[data-settings-topic="features"]').click());
            mark('capture-position',{name,stage:'after-topic-click',...await picturePosition()});
            await until(async()=>{const p=await picturePosition();return p.headingVisible&&p.controls.length===11&&p.controls.every(control=>control.visible);},'Features heading and all eleven complete switch cards are in the resized capture viewport');
            await run(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        }
        const geometry=await run(()=>({viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,view:document.querySelector('[data-view-panel].is-active')?.dataset.viewPanel,featureControls:document.querySelectorAll('[data-feature-setting]').length}));
        if(featuresPicture){geometry.picturePosition=await picturePosition();assert.equal(geometry.view,'settings');assert(geometry.picturePosition.headingVisible&&geometry.picturePosition.controls.length===11&&geometry.picturePosition.controls.every(control=>control.visible),'Features picture position remains correct immediately before capture');}
        assert(geometry.scrollWidth<=geometry.viewport.width+1,'No global horizontal overflow');
        const image=await owner.capturePage();assert(!image.isEmpty());await fsp.writeFile(path.join(screenshots,name+'.png'),image.toPNG());owner.hide();mark('screenshot',{name,...geometry});
    };
    try{
        await app.whenReady();restrict(session.defaultSession);app.on('session-created',restrict);
        assert.equal(JSON.parse(await fsp.readFile(path.join(root,'package.json'),'utf8')).version,expectedVersion,'Actual runtime package version matches the candidate');
        const work=(async()=>{
            await until(()=>{owner=BrowserWindow.getAllWindows().find(win=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(win.webContents.getURL()));return owner;},'Production main window');
            await until(()=>run(()=>window.eyeOfZommFeatures&&document.querySelectorAll('[data-feature-setting]').length===11&&document.querySelector('#feature-settings').getAttribute('aria-busy')==='false'),'Real Settings controls and preload');
            await run(()=>document.querySelector('[data-tour-close]')?.click());
            assert(owner.webContents.getLastWebPreferences().sandbox);assert(owner.webContents.getLastWebPreferences().contextIsolation);assert(!owner.webContents.getLastWebPreferences().nodeIntegration);
            await run(()=>document.querySelector('[data-view="settings"]').click());await until(async()=>await active()==='settings','Settings view');
            const initial=await state();assert.deepEqual(Object.keys(initial.features),ids);assert.equal(initial.schemaVersion,1);
            const captureConsent=JSON.parse(await fsp.readFile(path.join(profile,'eye-of-zomm-config.json'),'utf8')).screenReadingEnabled;
            assert.equal(captureConsent,true,'Availability cannot infer or erase the separately saved permission');
            if(phase==='restart'){
                assert(ids.every(id=>initial.features[id]===false),'All eleven settings survive actual restart');
                const observations=await run(()=>window.eyeOfZommObservations.status());assert.equal(observations.enabled,false,'Observation consent survives restart');assert.equal(observations.pending,1,'The drained synthetic observation survives actual restart');
                assert.equal((await run(()=>window.eyeOfZommCapture.status())).readingEnabled,false,'Disabled availability denies capture despite retained consent');
                assert.equal(BrowserWindow.getAllWindows().filter(win=>/[?&]panel=/.test(win.webContents.getURL())).length,0,'Disabled overlays cannot reopen on startup');
                for(const id of ids)await change(id,true);
                await visibility([...Object.values(settingsCards).map(selector=>[selector,true]),['[data-settings-topic="tools"]',true],['[data-settings-topic="reading"]',true]],'Restart re-enable restores feature Settings without placeholders');
                const lastPublished=(await run(()=>window.eyeOfZommOverlays.getState())).lastSnapshotAt;
                await until(()=>run(previous=>window.eyeOfZommOverlays.getState().then(state=>state.lastSnapshotAt>previous),lastPublished),'New normal overlay publication after restart re-enable');
                assert.equal(BrowserWindow.getAllWindows().filter(win=>/[?&]panel=/.test(win.webContents.getURL())).length,0,'Normal publication after restart re-enable cannot restore automatic overlay windows');
                const previous=JSON.parse(await fsp.readFile(path.join(proof,'initial-data.json'),'utf8'));assert.deepEqual(await saved(),previous,'Character and contribution data survive actual restart');
                assert.equal((await run(()=>window.eyeOfZommCapture.status())).enabled,false,'Re-enabling availability never starts capture');
                assert.equal((await run(()=>window.eyeOfZommObservations.status())).enabled,false,'Re-enabling availability does not grant upload consent');
                mark('restart-preserved',{settings:11,data:true,consents:true,newNormalOverlayPublication:true,noAutomaticOverlayWindows:true});
            }else{
                assert(ids.every(id=>initial.features[id]===true),'Old profiles default all availability on');
                await visibility([...Object.values(settingsCards).map(selector=>[selector,true]),...Object.values(overlayRows).map(panel=>[`.overlay-controller-row[data-panel="${panel}"]`,true])],'Enabled Settings cards and generated rows begin visible');
                const baseline=await saved();assert.equal(baseline.item.notes,'Keep this synthetic manual note.');assert.equal(baseline.core.statSnapshots.current.stats.HP,1234);assert.match(baseline.contributions,/Keep this synthetic draft/);
                await fsp.writeFile(path.join(proof,'initial-data.json'),JSON.stringify(baseline,null,2)+'\n');
                await change('contributions',false);
                await until(async()=>completedLogOffset>0&&await run(()=>document.querySelector('#top-character')?.textContent==='FeatureFixture'&&document.querySelector('#top-zone')?.textContent==='Synthetic Vale'&&/Live log/i.test(document.querySelector('#bridge-status')?.textContent||'')),'Historical seed consumed and a completed positive-offset renderer poll precedes fresh evidence');
                await collectionConsent(false);await collectionConsent(true);
                const pendingBefore=(await run(()=>window.eyeOfZommObservations.status())).pending;assert.equal(pendingBefore,0);
                mark('live-observation-preconditions',{positiveLogOffset:completedLogOffset,renderedContext:true,collectionUiAcknowledged:true});
                const log=path.join(game,'Logs','eqlog_FeatureFixture_Synthetic.txt');holdAppend=true;
                await fsp.appendFile(log,[eqStamp()+'You have entered Synthetic Vale.',eqStamp()+'You have slain a synthetic sentinel!'].join('\n')+'\n');
                await until(()=>appendEntered&&releaseAppend,'First real typed observation entered native append');
                await run(()=>{const control=document.querySelector('[data-feature-setting="dropObservations"]');if(!control?.checked||control.disabled)throw Error('Observation feature must begin enabled.');control.click();});
                await until(()=>run(()=>document.querySelector('#feature-settings').getAttribute('aria-busy')==='true'),'Feature change remains pending while the existing append is held');
                assert.equal((await state()).features.dropObservations,true,'Existing collection lease remains enabled until its append drains');
                assert.equal(await run(()=>document.querySelector('#feature-settings').getAttribute('aria-busy')),'true','No off acknowledgement can precede durable append');
                releaseAppend();releaseAppend=null;
                await until(async()=>(await state()).features.dropObservations===false&&await run(()=>document.querySelector('#feature-settings').getAttribute('aria-busy')==='false'),'Off acknowledgement follows actual append');
                const drained=await run(()=>window.eyeOfZommObservations.status());assert.equal(drained.pending,pendingBefore+1);assert.equal(drained.enabled,true,'Availability disable preserves collection consent');
                mark('pending-observation-preserved',{before:pendingBefore,after:drained.pending,consentPreserved:true,offAckAfterAppend:true});
                await change('dropObservations',true);await collectionConsent(false);
                // A real native file read waits only at its external chooser boundary.
                await run(()=>{globalThis.__featureFileRead=window.eyeOfZommInventory.read({name:'FeatureFixture',server:'Synthetic',chooseFile:true});return true;});
                await until(()=>chooserResolve,'Synthetic chooser pending');await change('character',false);
                chooserResolve({canceled:false,filePaths:[path.join(game,'synthetic-choice.txt')]});chooserResolve=null;
                const revoked=await run(()=>globalThis.__featureFileRead);assert.equal(revoked.ok,false);assert.match(revoked.error,/changed|disabled/i);
                const denied=await run(()=>window.eyeOfZommCharacterRepository.bootstrap());assert.equal(denied.ok,false);assert.equal(denied.code,'feature-disabled');
                await change('character',true);assert.deepEqual(await saved(),baseline);mark('inflight-native-read-revoked');
                await change('contributions',false); // This fixture observes loot, never publishes or adds contribution work.
                const stamp=eqStamp();
                await fsp.appendFile(log,[stamp+'You have entered Synthetic Vale.',stamp+'[50 WAR/CLR] FeatureFixture (Human) ZONE: Synthetic Vale 1 (synthetic)',stamp+'You have looted a Synthetic Copper Ring from the corpse of a synthetic sentinel!',stamp+'You have looted a Synthetic Riverstone from the corpse of a synthetic keeper!',stamp+'You have looted a Synthetic Silk Thread from the corpse of a synthetic sentinel!'].join('\n')+'\n');
                await run(()=>document.querySelector('[data-view="drops"]').click());await until(async()=>await active()==='drops','Drops view before its rendered count');
                await until(()=>run(()=>Number(document.querySelector('#drop-count').textContent)===3),'Real log import records three synthetic drops');
                await capture('drop-log',1400,950);
                await run(()=>document.querySelector('[data-view="settings"]').click());
                for(const id of ids)await change(id,false);
                await visibility([['#feature-settings',true],['[data-settings-topic="features"]',true],['#settings-topic-tools',false],['[data-settings-topic="tools"]',false],['#settings-topic-reading',false],['[data-settings-topic="reading"]',false],['#open-native-overlays',false]],'Empty feature topics and overlay header control disappear');
                assert.equal(await run(()=>[...document.querySelectorAll('[data-feature-setting]')].filter(node=>{for(let current=node;current;current=current.parentElement){const style=getComputedStyle(current);if(current.hidden||style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse')return false;}return node.getClientRects().length>0;}).length),11,'All Features switches remain actually visible for re-enable');
                await run(()=>document.querySelector('[data-view="overview"]').click());
                await visibility([['[data-go-view="map"]',false],['#overview-npcs',false],['#metric-fight',false]],'Overview map CTA, NPC intel and fight metric are entirely hidden');
                await run(()=>document.querySelector('[data-view="settings"]').click());
                mark('hidden-feature-ui',{settingsCards:5,emptyTopics:['tools','reading'],overview:['map','npcIntel','combat'],switchesVisible:11,generatedOverlayRowsHidden:4});
                const coreDenied=await run(()=>window.eyeOfZommCharacterRepository.bootstrap());assert.equal(coreDenied.code,'feature-disabled');
                const capturesDenied=await run(async()=>{try{await window.eyeOfZommCapture.sources();return false;}catch(error){return /disabled/i.test(error.message);}});assert(capturesDenied);
                const overlayDenied=await run(async()=>{try{await window.eyeOfZommOverlays.control('show','parse');return false;}catch(error){return /disabled/i.test(error.message);}});assert(overlayDenied);
                assert.equal((await run(()=>window.eyeOfZommObservations.status())).enabled,false);
                assert.equal(JSON.parse(await fsp.readFile(path.join(profile,'eye-of-zomm-config.json'),'utf8')).screenReadingEnabled,true);
                await run((ids)=>window.eyeOfZommFeatures.set(Object.fromEntries(ids.map(id=>[id,true]))),ids);
                await until(()=>run(()=>[...document.querySelectorAll('[data-feature-setting]')].every(node=>node.checked)),'Actual changed event restores all checkbox states');
                await visibility([...Object.values(settingsCards).map(selector=>[selector,true]),...Object.values(overlayRows).map(panel=>[`.overlay-controller-row[data-panel="${panel}"]`,true]),['[data-settings-topic="tools"]',true],['[data-settings-topic="reading"]',true]],'Re-enable restores actual cards, topics and generated rows');
                await run(()=>document.querySelector('[data-view="overview"]').click());
                await visibility([['[data-go-view="map"]',true],['#overview-npcs',true],['#metric-fight',true]],'Re-enable restores actual Overview controls');
                await run(()=>document.querySelector('[data-view="settings"]').click());
                assert.deepEqual(await saved(),baseline,'Toggling features preserves Character and contribution data');
                await run(()=>document.querySelector('[data-view="items"]').click());await until(async()=>await active()==='items','Items view');
                await run(()=>window.eyeOfZommFeatures.set({items:false}));await until(async()=>await active()==='overview','Active disabled view safely returns to Overview');
                await run(()=>document.querySelector('[data-view="settings"]').click());await change('items',true);
                await run(()=>window.eyeOfZommOverlays.control('show','parse'));
                await until(()=>BrowserWindow.getAllWindows().some(win=>/[?&]panel=parse/.test(win.webContents.getURL())),'Actual native Parse created');
                await change('combat',false);await until(()=>!BrowserWindow.getAllWindows().some(win=>/[?&]panel=parse/.test(win.webContents.getURL())),'Disabling Combat destroys actual Parse window');
                const lastPublished=(await run(()=>window.eyeOfZommOverlays.getState())).lastSnapshotAt;
                await change('combat',true);
                await until(()=>run(previous=>window.eyeOfZommOverlays.getState().then(state=>state.lastSnapshotAt>previous),lastPublished),'Normal post-enable overlay publish acknowledged');
                assert(!BrowserWindow.getAllWindows().some(win=>/[?&]panel=parse/.test(win.webContents.getURL())),'A normal publish after re-enable does not reopen overlay');
                const foreign=new BrowserWindow({show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
                try{await foreign.loadURL(new URL('/overlay.html?panel=parse',owner.webContents.getURL()).href);const result=await foreign.webContents.executeJavaScript("Promise.all([window.eyeOfZommFeatures.getState(),window.eyeOfZommFeatures.set({items:false})].map(value=>value.then(()=>false,()=>true)))");assert.deepEqual(result,[true,true]);}finally{foreign.destroy();}
                mark('native-policy',{all11:true,overlayDenied:true,overlayClosed:true,noAutoRestart:true,foreignFrameDenied:true,dataPreserved:true,consentsPreserved:true});
                await run(()=>{const search=document.querySelector('#settings-search');search.value='font';search.dispatchEvent(new Event('input',{bubbles:true}));});
                await until(()=>run(()=>!document.querySelector('#appearance-settings').closest('[data-settings-filtered]')&&document.querySelector('#settings-topic-game').hasAttribute('data-settings-filtered')),'Settings search filters actual panels');
                await run(()=>document.querySelector('[data-settings-topic="features"]').click());
                assert.equal(await run(()=>document.activeElement.id),'settings-topic-features-title');assert.equal(await run(()=>document.querySelector('#settings-search').value),'');
                await capture('feature-controls',1400,1050);await capture('feature-controls-narrow',1024,900);
                for(const id of ids)await change(id,false);
                assert.deepEqual((await state()).features,Object.fromEntries(ids.map(id=>[id,false])));
            }
            await run(()=>window.eyeOfZommCharacterRepository.flush()).catch(()=>{});
            const config=JSON.parse(await fsp.readFile(path.join(profile,'eye-of-zomm-config.json'),'utf8'));
            assert.equal(config.screenReadingEnabled,true);mark('complete',{networkBlocked:network.blocked});
            finished=true;clearTimeout(watchdog);write({ok:true,actualMainPreload:true,runtimeMode:packaged?'packaged-asar':'source',runtimeRoot:root,sandbox:true,installedProfile:false,phase,events,network,configFeatures:config.features,captureConsent:config.screenReadingEnabled});app.quit();
        })();
        require(path.join(root,'desktop/main.cjs'));await work;
    }catch(error){fatal(error);}
}

try{
    await mkdir(proof,{recursive:true});await mkdir(screenshots,{recursive:true});await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});
    // Startup tail replay establishes context but must never create live observations.
    const historical=new Date(Date.now()-60000),pad=value=>String(value).padStart(2,'0');
    const historicalStamp=`[${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][historical.getDay()]} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][historical.getMonth()]} ${pad(historical.getDate())} ${pad(historical.getHours())}:${pad(historical.getMinutes())}:${pad(historical.getSeconds())} ${historical.getFullYear()}] `;
    await writeFile(join(game,'Logs','eqlog_FeatureFixture_Synthetic.txt'),[historicalStamp+'You have entered Synthetic Vale.',historicalStamp+'[50 WAR/CLR] FeatureFixture (Human) ZONE: Synthetic Vale 1 (synthetic)'].join('\n')+'\n');await writeFile(join(game,'synthetic-choice.txt'),'Synthetic chooser-only file; revoked before reading.\n');
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-feature-controls-fixture',version:pkg.version,main:'main.cjs'}));
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:join(game,'Logs','eqlog_FeatureFixture_Synthetic.txt'),logSelection:'manual',frontendCacheVersion:pkg.version,screenReadingEnabled:true}));
    const names=['Synthetic Copper Ring','Synthetic Riverstone','Synthetic Silk Thread'];
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,sample:true,version:'synthetic-feature-controls',wikiEntitiesComplete:true},zones:[{name:'Synthetic Vale',wikiTitle:'Synthetic Vale',aliases:['synthetic']}],items:names.map(name=>({name,wikiTitle:name,slots:['FINGER'],stats:{HP:10,AC:2}})),npcs:[{name:'a synthetic sentinel',zone:'Synthetic Vale',wikiTitle:'a synthetic sentinel'},{name:'a synthetic keeper',zone:'Synthetic Vale',wikiTitle:'a synthetic keeper'}],icons:{},wikiEntities:{items:names,npcs:['a synthetic sentinel','a synthetic keeper'],titles:['Synthetic Vale',...names,'a synthetic sentinel','a synthetic keeper']}}));
    const model={schemaVersion:1,metadata:{name:'FeatureFixture',server:'Synthetic',race:'Human',classes:['WAR','CLR'],level:50,aaCount:12},candidates:[{id:'feature-keepsake',name:names[0],wikiTitle:names[0],catalogIdentity:{name:names[0],wikiTitle:names[0],match:'manual'},slots:['FINGER'],tier:3,fraction:0,observedStats:{HP:10},augmentStatus:'none',notes:'Keep this synthetic manual note.'}],equipment:{finger1:'feature-keepsake'},statSnapshots:{current:{stats:{HP:1234},confirmed:true}},sequence:1};
    const draft={id:'contribution-1',key:'npc|a synthetic pending watcher|synthetic vale',aliasKeys:[],kind:'npc',name:'a synthetic pending watcher',title:'a synthetic pending watcher',zone:'Synthetic Vale',instance:'unknown',era:'',playerText:'Keep this synthetic draft.',fields:{},sources:[],relations:[],evidence:[],status:'needs-review',membership:'unknown',canonicalTitle:null,revisionId:null,reasons:['catalog-unknown'],intent:'review',manual:true};
    await writeFile(join(profile,'eye-of-zomm-character-storage.json'),JSON.stringify({schemaVersion:1,values:{'eql-eye-of-zomm-character-v1':JSON.stringify(model),'eql-eye-of-zomm-contributions-v1':JSON.stringify({schemaVersion:1,sequence:1,cursor:0,candidates:[draft],archive:[],registry:[],ignored:[],seenLogIds:[]})}}));
    const phases=[];
    for(const phase of ['initial','restart']){
        await writeFile(join(temporary,'main.cjs'),`(${native.toString()})(${JSON.stringify({root:runtimeRoot,temporary,profile,game,proof,screenshots,phase,expectedVersion:pkg.version,packaged:Boolean(packagedRoot)})});`);
        const stdout=await open(join(proof,phase+'.stdout.log'),'w'),stderr=await open(join(proof,phase+'.stderr.log'),'w');const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const result=await new Promise(done=>{const child=spawn(electron,[temporary,'--disable-gpu','--mute-audio'],{cwd:root,env,windowsHide:true,stdio:['ignore',stdout.fd,stderr.fd],timeout:100000});child.once('error',error=>done({exitCode:null,error:error.message}));child.once('close',(exitCode,signal)=>done({exitCode,signal}));});await stdout.close();await stderr.close();
        await writeFile(join(proof,phase+'-completion.json'),JSON.stringify(result,null,2)+'\n');assert.equal(result.exitCode,0,'Read '+join(proof,phase+'.json')+' and file-backed logs.');
        const receipt=JSON.parse(await readFile(join(proof,phase+'.json'),'utf8'));assert.equal(receipt.ok,true);phases.push(receipt);
    }
    const after=await sourceHashes();assert.deepEqual(after,before,'Runtime source must remain frozen during native proof');const archiveAfter=await archiveHash();assert.deepEqual(archiveAfter,archiveBefore,'Exact ASAR remains unchanged');
    await writeFile(join(proof,'receipt.json'),JSON.stringify({ok:true,runtimeMode:packagedRoot?'packaged-asar':'source',runtimeRoot,archiveBefore,archiveAfter,sourceHead:execFileSync('git',['-c','safe.directory=*','-C',root,'rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),sourceFiles:sourceFiles.length,sourceBefore:before,sourceAfter:after,phases,screenshots,limitations:['Synthetic native dialogs/capture enumeration replace external human/OS sources; no actual file picker, live game, public wiki or installed profile was used.','This is a focused native feature integration proof, not a complete regression suite or package/release verification.']},null,2)+'\n');passed=true;
    console.log(JSON.stringify({ok:true,processes:2,proof:join(proof,'receipt.json'),screenshots}));
}finally{
    if(passed){assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-feature-controls-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
