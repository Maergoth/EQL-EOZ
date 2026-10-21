import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,rm,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// CI integration proof for the real native Map/iframe/WebGL/camera boundary.
// Real configured-folder indexing, S3D/EQG source hydration and the shipped
// parser Worker read synthetic empty PFS archives first. Only geometry parsing
// and display are then substituted for camera assertions; these empty archives
// deliberately have no zone WLD. No installed profile/game files are required.
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),electron=require('electron');
const temporary=await mkdtemp(join(tmpdir(),'eoz-map-3d-smoke-'));
try{
    const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),log=join(game,'Logs','eqlog_Fixture_Test.txt');
    await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Maps'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});
    await writeFile(join(game,'Maps','mistmoore.txt'),'L -200,-200,12,200,-200,12,180,190,210\nL 200,-200,12,200,200,12,180,190,210\nP -80,-100,12,216,183,92,2,Synthetic_Keeper\n');
    // A valid PFS header with an empty directory: synthetic, no game content.
    const emptyPfs=Buffer.alloc(16);emptyPfs.writeUInt32LE(12,0);emptyPfs.write('PFS ',4,'ascii');emptyPfs.writeUInt32LE(0x20000,8);
    for(const name of ['mistmoore.s3d','mistmoore.eqg','eozsynthetic.eqg'])await writeFile(join(game,name),emptyPfs);
    await writeFile(join(game,'mp3index.txt'),'1,synthetic-silence.mp3\r\n');
    await writeFile(join(game,'mistmoore_assets.txt'),'eozsynthetic.eqg\r\n');
    await writeFile(join(game,'mistmoore_private.txt'),'Synthetic unrelated root text must not enter the zone source.\n');
    await writeFile(join(game,'mistmoore_chr.txt'),'Synthetic unused character-list text.\n');
    await writeFile(log,`[${new Date().toISOString()}] Synthetic 3D boundary smoke begins.\n`);
    await symlink(join(game,'Logs'),join(game,'Maps','Linked'),'junction');
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,logSelection:'manual'}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({
        meta:{schemaVersion:3,version:'synthetic-3d-smoke',sample:true,currentEra:'Classic'},
        zones:[{name:'Mistmoore Castle',viewerName:'Mistmoore Castle',aliases:['mistmoore','The Castle of Mistmoore']}],
        npcs:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false,avgLevel:26,era:'Classic',loc:[10,20,12]},
            {name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true,avgLevel:26,era:'Classic',loc:[100,80,12]},
            {name:'Unknown Elevation Watcher',zone:'Mistmoore Castle',avgLevel:26,era:'Classic',loc:[140,120]}],
        items:[{name:'Normal Fixture Ring',classes:['MNK'],era:'Classic',slots:['FINGER'],stats:{HP:10},dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false}]},
            {name:'Raid Fixture Ring',classes:['MNK'],era:'Classic',slots:['FINGER'],stats:{HP:20},dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true}]},
            {name:'Unknown Height Fixture Ring',classes:['MNK'],era:'Classic',slots:['FINGER'],stats:{HP:5},dropSources:[{name:'Unknown Elevation Watcher',zone:'Mistmoore Castle'}]}]
    }));
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-map-3d-smoke',version:pkg.version,main:'main.cjs'}));
    const run=async({root,log})=>{
        const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
        const show=BrowserWindow.prototype.showInactive;
        // Visible, nonactivating windows let the real visibility lifecycle run.
        // This CI fixture does not prove compositing over a foreground game.
        BrowserWindow.prototype.show=function(){return show.call(this);};
        const originalFocus=BrowserWindow.prototype.focus;let focusCalls=0;
        BrowserWindow.prototype.focus=function(){focusCalls++;};
        global.fetch=async()=>{throw Error('External network disabled for synthetic 3D smoke');};
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const until=async(fn,label,timeout=12000)=>{const end=Date.now()+timeout;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await wait(65);}throw Error(`Timed out: ${label}${last?` (${last.message})`:''}`);};
        const execute=(target,fn,...args)=>target.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        const mainExecute=(window,fn,...args)=>execute(window.webContents,fn,...args);
        let started=false;
        async function inspect(){
            const owner=await until(()=>BrowserWindow.getAllWindows().find(window=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())),'main owner');
            await until(()=>mainExecute(owner,()=>window.eyeOfZommOverlays&&document.querySelector('#bridge-status')?.textContent==='Live log'),'initial log cursor');
            const state=()=>mainExecute(owner,()=>window.eyeOfZommOverlays.getState());
            const control=(action,panel)=>mainExecute(owner,(action,panel)=>window.eyeOfZommOverlays.control(action,panel),action,panel);
            const stamp=new Date().toString().replace(/ GMT.*$/,'');
            await fs.appendFile(log,[`[${stamp}] [26 MNK] Fixture (Iksar) ZONE: The Castle of Mistmoore (mistmoore)`,`[${stamp}] Your Location is 10, 20, 12`].join('\n')+'\n');
            await until(async()=>{const value=await state();return value.snapshot?.session?.map?.location?.z===12&&value.snapshot.session.map.npcs.length===3;},'logged player and three synthetic source records');
            await control('show','map');
            const map=await until(()=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL().includes('/overlay-map.html?panel=map')),'native Map document');
            await until(()=>mainExecute(map,()=>Boolean(document.querySelector('[data-map-action="mode"]'))&&!document.hidden),'visible native Map controller');
            owner.hide();const before=await state(),logged=before.snapshot.session.map.location,sessionId=before.snapshot.sessionId;
            const frame=()=>map.webContents.mainFrame.frames.find(candidate=>candidate.url.includes('/zoneviewer/viewer.html?overlay=1'));
            const childExecute=(fn,...args)=>execute(frame(),fn,...args);
            const click=action=>mainExecute(map,action=>document.querySelector(`[data-map-action="${action}"]`).click(),action);
            await click('mode');
            await until(()=>frame()&&childExecute(()=>Boolean(window.eqlEyeOfZommViewer?.focusAtLocation&&window.eqlZoneViewer?.renderer)),'shipped overlay viewer API and WebGL renderer');
            const policy=await childExecute(async()=>{
                const blocked=async(url,options)=>{try{await fetch(url,options);return false;}catch{return true;}};
                const manifest=await fetch('/api/eq-files'),map=await fetch('/api/eq-file?path=Maps%2Fmistmoore.txt&surface=overlay-map');
                const inventory=await manifest.json(),linked=await fetch('/api/eq-file?path=Maps%2FLinked%2Feqlog_Fixture_Test.txt&surface=overlay-map');
                const linkedBody=await linked.text();
                return{info:await blocked('/api/info'),log:await blocked('/api/log'),rawLog:await blocked('/api/eq-file?path=Logs%2Feqlog_Fixture_Test.txt'),
                    mutation:await blocked('/api/log/automatic',{method:'POST'}),manifest:manifest.ok,map:map.ok&&(await map.text()).includes('Synthetic_Keeper'),
                    linkedLogDenied:linked.status===404&&!linkedBody.includes('Synthetic 3D boundary smoke'),junctionOmitted:!(inventory.files||[]).some(file=>/maps[\\/]linked[\\/]/i.test(file.path)),
                    main:typeof window.eyeOfZommOverlays,updater:typeof window.eyeOfZommUpdates,native:typeof window.eyeOfZommOverlay,window:typeof window.eyeOfZommWindow,require:typeof window.require};
            });
            assert.deepEqual(policy,{info:true,log:true,rawLog:true,mutation:true,manifest:true,map:true,linkedLogDenied:true,junctionOmitted:true,main:'undefined',updater:'undefined',native:'undefined',window:'undefined',require:'undefined'},'The real child partition allows maps while denying private/mutation APIs, canonical junction escapes and native preloads');
            const hydrated=await childExecute(async()=>{
                const app=window.eqlZoneViewer,api=window.eqlEyeOfZommViewer;
                const configured=await api.useConfiguredFolder();
                if(!configured.ok)throw Error('Real configured-folder restoration failed: '+configured.reason);
                const s3d=app.zones.find(record=>record.id==='mistmoore'&&record.format==='S3D');
                const eqg=app.zones.find(record=>record.id==='mistmoore'&&record.format==='EQG');
                if(!s3d||!eqg)throw Error('The real folder index did not identify both synthetic archive formats.');
                const first=await app.source.filesForZone(s3d),second=await app.source.filesForZone(eqg);
                const summarize=async files=>Promise.all(files.map(async file=>({name:file.name,native:file instanceof File,
                    text:/\.txt$/i.test(file.name)?await file.text():null,bytes:(await file.arrayBuffer()).byteLength})));
                // Exercise structured cloning and the actual shipped parser,
                // whose honest result is no geometry for this empty archive.
                const workerResult=await new Promise((resolve,reject)=>{
                    const worker=new Worker('./zone-parser.worker.js'),progress=[];
                    const timeout=setTimeout(()=>{worker.terminate();reject(Error('Synthetic PFS Worker timed out.'));},10000);
                    worker.onmessage=event=>{const value=event.data||{};if(value.type==='progress')progress.push(value.message);
                        if(value.type==='error'||value.type==='complete'){clearTimeout(timeout);worker.terminate();resolve({type:value.type,message:value.message||'',progress});}};
                    worker.onerror=event=>{clearTimeout(timeout);worker.terminate();reject(Error(event.message||'Synthetic PFS Worker failed.'));};
                    worker.postMessage({id:845,action:'parse',zone:'mistmoore',format:'S3D',files:first});
                });
                return{source:configured.source,s3d:await summarize(first),eqg:await summarize(second),worker:workerResult,
                    excluded:!app.source.files.has('mistmoore_private.txt')&&!app.source.files.has('mistmoore_chr.txt')};
            });
            assert.equal(hydrated.source,'settings','The smoke must restore the actual configured folder, not replace the API');
            assert.deepEqual(hydrated.s3d.map(file=>file.name).sort(),['mistmoore.s3d','mp3index.txt']);
            assert.deepEqual(hydrated.eqg.map(file=>file.name).sort(),['eozsynthetic.eqg','mistmoore.eqg','mistmoore_assets.txt','mp3index.txt']);
            assert(hydrated.s3d.concat(hydrated.eqg).every(file=>file.native&&file.bytes>0),'Actual source hydration reads native cloneable File bytes over the restricted bridge');
            assert.equal(hydrated.s3d.find(file=>file.name==='mp3index.txt').text,'1,synthetic-silence.mp3\r\n');
            assert.equal(hydrated.eqg.find(file=>file.name==='mistmoore_assets.txt').text,'eozsynthetic.eqg\r\n');
            assert.equal(hydrated.excluded,true,'Zone-prefixed private/unused root text cannot be swept into EQG hydration');
            assert.equal(hydrated.worker.type,'error');assert.match(hydrated.worker.message,/The parser did not produce a zone GLB/);
            assert(hydrated.worker.progress.some(message=>message==='Decoding mistmoore (S3D)…'),'The real parser Worker receives hydrated source files before reporting the expected empty-archive result');
            await childExecute(()=>{
                const app=window.eqlZoneViewer,api=window.eqlEyeOfZommViewer,V=app.perspective.position.constructor;
                window.syntheticFocusResults=[];
                const focus=api.focusAtLocation.bind(api);
                api.focusAtLocation=(...args)=>{const result=focus(...args);window.syntheticFocusResults.push(result);return result;};
                const select=api.setOverlaySelection.bind(api);api.setOverlaySelection=id=>{window.syntheticSelection=id;return select(id);};
                // Keep real folder restoration, zone selection, maps and lazy
                // archive reads. Substitute geometry only for camera checks.
                app.cache.get=async()=>null;app.cache.set=async()=>{};app.cache.clearPrefix=async()=>{};
                app.parse=async()=>({objects:{},textures:{},stats:{},synthetic:true});
                // Leave api.loadZone and its real zone-ready guard intact so
                // last-logged HUD/route state follows the normal loaded identity.
                app.displayParsedZone=async()=>{
                        app.addNavigationPath([new V(-10,12,0),new V(10,12,0)]);
                        const template=app.navigationGuideGroup.children.find(child=>child.isMesh),geometry=new template.geometry.constructor();
                        geometry.setAttribute('position',new template.geometry.attributes.position.constructor(new Float32Array([-500,12,-500,-500,12,500,500,12,500,500,12,-500]),3));
                        geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();geometry.computeBoundingSphere();
                        const material=template.material.clone();material.color.setHex(0x38566a);material.opacity=1;material.transparent=false;material.depthWrite=true;material.blending=1;material.side=2;
                        const plane=new template.constructor(geometry,material);plane.name='synthetic-ci-plane-not-an-archive';plane.userData.eqlCollision=true;
                        app.clearNavigationGuide();app.zoneGroup.clear();app.zoneGroup.add(plane);app.zoneGroup.visible=true;
                        app.currentBounds.min.set(-500,10,-500);app.currentBounds.max.set(500,14,500);app.terrainBounds.copy(app.currentBounds);app.topFitBounds.copy(app.currentBounds);app.mapBounds.copy(app.currentBounds);
                        app.loadedMaterials=[material];app.mapMaterials=[];
                        app.setViewerControlsEnabled(true);app.els.overlay.hidden=true;app.els.zoneBadge.textContent='Synthetic plane (no archive)';
                        app.fp.setScene(app.scene);app.requestRender();
                };
            });
            await until(()=>childExecute(()=>window.eqlZoneViewer.currentZoneRecord?.id==='mistmoore'&&window.eqlZoneViewer.zoneGroup.getObjectByName('synthetic-ci-plane-not-an-archive')&&window.eqlZoneViewer.mode==='top'),'real Top camera on synthetic geometry');
            const top=await childExecute(()=>{const app=window.eqlZoneViewer;app.renderer.render(app.scene,app.camera);return{mode:app.mode,webgl:app.renderer.getContext().getParameter(app.renderer.getContext().VERSION),lost:app.renderer.getContext().isContextLost(),triangles:app.renderer.info.render.triangles,canvas:app.renderer.domElement instanceof HTMLCanvasElement};});
            assert(top.canvas&&!top.lost&&/WebGL/.test(top.webgl)&&top.triangles>=2,'Actual shipped WebGL renderer draws the synthetic plane');
            await click('mode');await until(()=>childExecute(()=>window.eqlZoneViewer.mode==='first'),'real First Person mode');
            const beforeFocus=await childExecute(()=>({camera:window.eqlZoneViewer.perspective.position.toArray(),hud:window.eqlZoneViewer.els.coord.textContent}));
            assert(Math.abs(beforeFocus.camera[0]+10)<.01&&Math.abs(beforeFocus.camera[2]-20)<.01&&Math.abs(beforeFocus.camera[1]-18)<.01,'Follow keeps the logged player centered when cycling Top to First with no new log sample');
            const sources=(await state()).snapshot.session.map.npcs,raid=sources.find(npc=>npc.raidInstance),unknown=sources.find(npc=>npc.loc.length===2);
            assert(raid?.id&&unknown?.id,'Fixture retains exact normal/raid and unknown-height identities');
            const nativeAction=(name,payload)=>mainExecute(map,(name,payload)=>window.eyeOfZommOverlay.action(name,payload),name,payload);
            const focusCount=focusCalls;
            await nativeAction('session:map-focus',{id:raid.id,npc:raid.name,zone:'Mistmoore Castle',raidInstance:true});
            await until(()=>childExecute(()=>window.syntheticFocusResults.length>=1),'owner-dispatched exact raid camera focus');
            const focused=await childExecute(()=>{const app=window.eqlZoneViewer;return{mode:app.mode,camera:app.perspective.position.toArray(),hud:app.els.coord.textContent,result:window.syntheticFocusResults.at(-1),selection:window.syntheticSelection,active:[...document.querySelectorAll('.eoz-rare-marker.is-active')].map(node=>node.dataset.npc)};});
            assert.equal(focused.mode,'first');assert.notDeepEqual(focused.camera,beforeFocus.camera);assert.equal(focused.hud,beforeFocus.hud,'Inspecting an NPC cannot replace the last logged HUD position');
            assert.equal(focused.result.ok,true);assert.equal(focused.result.heightEstimated,false);assert.equal(focused.result.cameraFloorZ,12);
            assert.equal(focused.selection,raid.id);assert.equal(focused.active.length,1,'Exact source identity activates one same-name variant');
            assert(Math.abs(focused.camera[0]+100)<.01&&Math.abs(focused.camera[2]-80)<.01&&Math.abs(focused.camera[1]-18)<.01,'Real FP camera reaches the exact raid source on the synthetic floor');
            assert.equal((await state()).snapshot.session.map.selectedNpcId,raid.id);assert.equal(owner.isVisible(),false);assert.equal(focusCalls,focusCount,'Camera preview neither opens nor activates main');
            await mainExecute(map,()=>{const slider=document.querySelector('[data-map-z]');slider.value=slider.max;slider.dispatchEvent(new Event('input',{bubbles:true}));});
            await nativeAction('session:map-focus',{id:unknown.id,npc:unknown.name,zone:'Mistmoore Castle',raidInstance:false});
            await until(()=>childExecute(()=>window.syntheticFocusResults.length>=2),'unknown-height camera focus');
            const unknownFocus=await childExecute(()=>({result:window.syntheticFocusResults.at(-1),camera:window.eqlZoneViewer.perspective.position.toArray(),hud:window.eqlZoneViewer.els.coord.textContent}));
            assert.equal(unknownFocus.result.heightEstimated,true);assert.equal(unknownFocus.result.cameraFloorZ,12);assert.equal(unknownFocus.camera[1],18,'Missing Z grounds on the actual synthetic surface, not zero');assert.equal(unknownFocus.hud,beforeFocus.hud);
            await until(()=>mainExecute(map,()=>Number(document.querySelector('[data-map-z]').value)===12),'unknown-height focus centers slice on camera floor');
            const after=await state();assert.equal(after.snapshot.sessionId,sessionId);assert.deepEqual(after.snapshot.session.map.location,logged,'Native camera motion never changes parser position or route start');
            await click('reset');await until(()=>mainExecute(map,()=>document.querySelector('[data-map-action="mode"]').textContent==='Map'&&!document.querySelector('.native-map-3d-frame')),'Reset unloads 3D iframe');
            await wait(1150);assert.equal(await mainExecute(map,()=>Boolean(document.querySelector('.native-map-3d-frame'))),false,'Retained snapshots cannot replay a consumed mob focus after Reset');
            await click('mode');await until(()=>Boolean(frame()),'new lazy iframe after choosing Top');
            await control('hide','map');await until(()=>mainExecute(map,()=>!document.querySelector('.native-map-3d-frame')),'hiding Map unloads iframe');
            assert.equal((await state()).snapshot.sessionId,sessionId);assert.equal(owner.isDestroyed(),false);
            console.log('EOZ_MAP_3D_SMOKE='+JSON.stringify({ok:true,realConfiguredFolder:true,realS3dEqgHydration:true,realParserWorker:true,syntheticGeometry:true,realWebGL:true,privateApisBlocked:true,realCameraModes:true,loggedPositionRetained:true,unknownHeightGrounded:true,resetAndHideUnload:true}));
            BrowserWindow.prototype.focus=originalFocus;app.exit(0);
        }
        app.on('browser-window-created',()=>{if(started)return;started=true;void inspect().catch(error=>{console.error(error.stack);app.exit(1);});});
        setTimeout(()=>{console.error('3D overlay smoke exceeded 55 seconds');app.exit(2);},55000).unref();require(path.join(root,'desktop/main.cjs'));
    };
    await writeFile(join(temporary,'main.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});(${run.toString()})(${JSON.stringify({root,log})});`);
    const result=await new Promise((resolve,reject)=>{const child=spawn(electron,[temporary,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('exit',code=>resolve({code,output}));});
    assert.equal(result.code,0,result.output);assert.match(result.output,/EOZ_MAP_3D_SMOKE=.*"ok":true/);console.log(result.output.match(/EOZ_MAP_3D_SMOKE=.*/)[0]);
}finally{if(dirname(temporary)!==resolve(tmpdir())||!basename(temporary).startsWith('eoz-map-3d-smoke-'))throw Error('Unexpected 3D-smoke cleanup path');await rm(temporary,{recursive:true,force:true});}
