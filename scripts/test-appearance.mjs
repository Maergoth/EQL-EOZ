import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real Electron renderers/IPC with disposable synthetic data. --packaged-root
// loads the exact built ASAR using the same pinned Electron runtime; it does
// not install a package or claim compositor/game-client acceptance.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const argument = name => { const index=process.argv.indexOf(name); return index<0 ? null : process.argv[index+1]; };
const root = argument('--packaged-root') ? resolve(argument('--packaged-root')) : projectRoot;
const electron = argument('--electron') || createRequire(import.meta.url)('electron');
const temporary = await mkdtemp(join(tmpdir(), 'eoz-appearance-smoke-'));
try {
    const profile=join(temporary,'profile'), game=join(temporary,'synthetic-game'), log=join(game,'Logs','eqlog_Fixture_Test.txt');
    const screenshots=argument('--screenshots') ? resolve(argument('--screenshots')) : join(temporary,'screenshots');
    await mkdir(join(profile,'data'),{recursive:true}); await mkdir(join(game,'Logs'),{recursive:true}); await mkdir(join(game,'Maps')); await mkdir(screenshots,{recursive:true});
    await writeFile(log,'[Thu Oct 22 01:00:00 2026] Synthetic font smoke starts.\n');
    await writeFile(join(game,'Maps','mistmoore.txt'),'L -100,-100,0,100,100,0,150,160,180\nP -20,-10,0,216,183,92,2,Synthetic_Keeper\n');
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,logSelection:'manual'}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({
        meta:{schemaVersion:3,version:'appearance-synthetic',sample:true,currentEra:'Classic'},
        zones:[{name:'Mistmoore Castle',viewerName:'Mistmoore Castle',aliases:['mistmoore','The Castle of Mistmoore']}],
        // Keep the label clear of the player marker: decluttering deliberately
        // hides colliding names, which is independent of typography support.
        npcs:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',wikiTitle:'Synthetic Keeper',avgLevel:26,levelMin:26,levelMax:26,era:'Classic',loc:[70,60,0]}],
        items:[{name:'Synthetic Charm',wikiTitle:'Synthetic Charm',classes:['MNK'],slots:['NECK'],stats:{HP:1},era:'Classic',dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle'}]}],icons:{}
    }));
    const pkg=JSON.parse(await readFile(join(projectRoot,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-appearance-smoke',version:pkg.version,main:'main.cjs'}));
    const run=async({root,log,screenshots,phase})=>{
        const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
        BrowserWindow.prototype.show=()=>{};BrowserWindow.prototype.showInactive=()=>{};
        global.fetch=async()=>{throw new Error('External network disabled for appearance smoke');};
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const until=async(predicate,label)=>{const end=Date.now()+10000;while(Date.now()<end){const result=await predicate();if(result)return result;await wait(60);}throw new Error(`Timed out: ${label}`);};
        const execute=(window,fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        const panels=()=>Object.fromEntries(BrowserWindow.getAllWindows().filter(window=>/\/overlay(?:-map)?\.html\?panel=/.test(window.webContents.getURL())).map(window=>[new URL(window.webContents.getURL()).searchParams.get('panel'),window]));
        let owner;
        const state=()=>execute(owner,()=>window.eyeOfZommOverlays.getState());
        const appearance=window=>execute(window,()=>({family:document.documentElement.dataset.fontFamily,scale:Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-font-scale')),body:getComputedStyle(document.body).fontFamily,labelSize:parseFloat(getComputedStyle(document.querySelector('label[for="settings-font-size"]')||document.querySelector('#overlay-title')).fontSize)}));
        const controls=()=>execute(owner,()=>{document.querySelector('[data-view="settings"]')?.click();return Boolean(document.querySelector('#settings-font-family')?.options.length);}).catch(()=>false);
        const choose=async(family,size)=>{
            await execute(owner,(family,size)=>{const select=document.querySelector('#settings-font-family');select.value=family;select.dispatchEvent(new Event('change',{bubbles:true}));const input=document.querySelector('#settings-font-size');input.value=String(size);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},family,size);
            await until(async()=>{const current=await state();return current.appearance.fontFamily===family&&current.appearance.fontSize===size;},'saved appearance');
            for(const window of [owner,...Object.values(panels())])await until(async()=>{const current=await appearance(window);return current.family===family&&Math.abs(current.scale-size/13)<.001;},'shared rendered font');
        };
        const capture=async(window,name)=>{window.webContents.invalidate();await wait(100);const image=await window.capturePage(undefined,{stayHidden:true,stayAwake:true});assert(!image.isEmpty());await fs.writeFile(path.join(screenshots,`${phase}-${name}.png`),image.toPNG());};
        const geometry=async(size,panelScale)=>{
            const main=await execute(owner,()=>{document.querySelector('#appearance-settings').scrollIntoView({block:'center'});return [...document.querySelectorAll('#settings-font-family,#settings-font-size,#reset-appearance')].map(element=>{const rect=element.getBoundingClientRect();return {id:element.id,inside:rect.width>0&&rect.height>0&&rect.left>=0&&rect.top>=0&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1};});});
            assert(main.every(control=>control.inside),`Main 1024px font controls fit at ${size}px: ${JSON.stringify(main)}`);
            for(const [id,window] of Object.entries(panels())){
                await execute(owner,(id,scale)=>window.eyeOfZommOverlays.control('font-scale',id,scale),id,panelScale);
                await until(()=>execute(window,expected=>Math.abs(Number(getComputedStyle(document.documentElement).getPropertyValue('--font-scale'))-expected)<.001,size/13*panelScale),'combined native font scale');
                const footer=await execute(window,()=>{const element=document.querySelector('#overlay-status'),rect=element.getBoundingClientRect();return !rect.height||getComputedStyle(element).display==='none'||rect.top>=0&&rect.bottom<=innerHeight+1;});
                assert(footer,`${id} footer fits at global ${size}px × panel ${panelScale}`);
                if(id!=='timers'){
                    const menu=await execute(window,()=>{document.querySelector('#panel-menu-button').click();const last=document.querySelector('#panel-menu button:last-child');last.scrollIntoView({block:'nearest'});last.focus();const rect=last.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight+1&&rect.left>=0&&rect.right<=innerWidth+1;});
                    assert(menu,`${id} final menu action remains reachable at global ${size}px × panel ${panelScale}`);
                    await execute(window,()=>document.querySelector('#panel-menu-button').click());
                }else{
                    try {
                        await until(()=>execute(window,()=>{const content=document.querySelector('#panel-content');return content.scrollHeight<=content.clientHeight+2;}),'Trigger native height follows combined font scale');
                    } catch(error) {
                        await capture(window,'trigger-height-failure');
                        const dimensions=await execute(window,()=>({viewport:innerHeight,scale:getComputedStyle(document.documentElement).getPropertyValue('--font-scale'),elements:['#overlay','#panel-content','#timer-list','#swing-body','#session-restart','#overlay-status'].map(selector=>{const element=document.querySelector(selector),rect=element.getBoundingClientRect();return {selector,height:rect.height,top:rect.top,bottom:rect.bottom,scroll:element.scrollHeight,client:element.clientHeight};})}));
                        throw new Error(`${error.message}: ${JSON.stringify(dimensions)}`);
                    }
                }
                if(id==='map'){
                    const reachable=await execute(window,()=>{const last=document.querySelector('[data-map-tolerance]');last.focus();last.scrollIntoView({block:'nearest',inline:'nearest'});const rect=last.getBoundingClientRect();return rect.left>=0&&rect.right<=innerWidth+1&&rect.top>=0&&rect.bottom<=innerHeight+1;});
                    assert(reachable,'End of enlarged Map toolbar remains keyboard reachable');
                }
            }
        };
        const inspect=async()=>{
            owner=await until(()=>BrowserWindow.getAllWindows().find(window=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())),'main renderer');
            await until(async()=>execute(owner,()=>Boolean(window.eyeOfZommOverlays&&document.querySelector('#bridge-status')?.textContent==='Live log')),'synthetic log watcher');
            await until(controls,'appearance controls');
            await until(async()=>(await state()).sessionAvailable,'shared session');
            owner.unmaximize();owner.setSize(1024,768);
            const initial=await state();
            if(phase==='restart'){
                assert.deepEqual(initial.appearance,{fontFamily:'georgia',fontSize:20},'Native host reload retains the chosen font');
                await until(async()=>(await appearance(owner)).family==='georgia','main restore');
                await execute(owner,()=>document.querySelector('#reset-appearance').click());
                await until(async()=>{const value=(await state()).appearance;return value.fontFamily==='theme'&&value.fontSize===13;},'reset defaults');
                return {ok:true,persistedAcrossProcess:true,reset:true,packagedSources:root.endsWith('.asar')};
            }
            await execute(owner,()=>window.eyeOfZommOverlays.control('show-all'));
            await until(()=>Object.keys(panels()).length===4,'all four native panels');
            for(const window of Object.values(panels()))await until(async()=>execute(window,()=>Boolean(document.querySelector('#panel-content')?.children.length)),'native panel renderer');
            const ids=Object.values(panels()).map(window=>window.id),sessionId=(await state()).snapshot.sessionId;
            const baseline=await appearance(owner);
            await execute(owner,()=>{document.querySelector('[data-view="timers"]').click();document.querySelector('#timer-settings [data-timer-tab="running"]').click();const form=document.querySelector('#timer-settings [data-quick-timer]');form.elements.namedItem('label').value='Appearance deadline';form.elements.namedItem('durationSeconds').value='300';form.requestSubmit();});
            await until(async()=>(await state()).snapshot.session.timers.timers.some(timer=>timer.label==='Appearance deadline'),'existing timer before font changes');
            const deadline=(await state()).snapshot.session.timers.timers.find(timer=>timer.label==='Appearance deadline');
            await controls();
            await fs.appendFile(log,'[Thu Oct 22 01:00:01 2026] You have entered The Castle of Mistmoore.\n[Thu Oct 22 01:00:02 2026] Your Location is 10.00, 20.00, 0.00\n[Thu Oct 22 01:00:03 2026] You slash a synthetic skeleton for 9 points of damage.\n');
            await until(async()=>(await state()).snapshot.session.parse.totalDamage===9,'one shared live parser');
            await choose('verdana',10);const small=await appearance(owner);await geometry(10,.75);
            await choose('verdana',20);const large=await appearance(owner);await geometry(20,1.75);
            assert(large.labelSize>small.labelSize*1.9,'Previously fixed-pixel Settings labels scale visibly');
            assert(large.labelSize>baseline.labelSize,'Large text exceeds defaults');
            assert(/Verdana/.test(large.body),'Selected family reaches the main computed style');
            for(const window of Object.values(panels()))assert(/Verdana/.test((await appearance(window)).body),'Selected family reaches each native panel');
            for(const id of Object.keys(panels()))await execute(owner,id=>window.eyeOfZommOverlays.control('font-scale',id,1),id);
            // The native map canvas must use the same chosen text family/size.
            await execute(panels().map,()=>{window.eozFontDraws=[];const native=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...args){window.eozFontDraws.push({font:this.font,text:String(args[0])});return native.apply(this,args);};});
            await execute(panels().map,()=>document.querySelector('[data-map-action="zoom-in"]').click());
            try {
                await until(async()=>execute(panels().map,()=>window.eozFontDraws.some(draw=>/Verdana/.test(draw.font)&&parseFloat(draw.font)>15&&/Synthetic/.test(draw.text))),'selected map label family and size');
            } catch(error) {
                await capture(panels().map,'map-label-failure');
                const diagnostic=await execute(panels().map,()=>({draws:window.eozFontDraws.slice(-12),font:getComputedStyle(document.querySelector('canvas')).fontFamily,canvas:{width:document.querySelector('canvas').clientWidth,height:document.querySelector('canvas').clientHeight},message:document.querySelector('.native-map-message')?.textContent,markers:[...document.querySelectorAll('[data-map-npc]')].map(element=>element.textContent)}));
                const snapshot=(await state()).snapshot.session.map;
                throw new Error(`${error.message}: ${JSON.stringify({diagnostic,map:snapshot})}`);
            }
            await capture(owner,'main-large');await capture(panels().map,'map-large');
            await choose('georgia',20);
            await execute(owner,()=>document.querySelector('#open-whats-new').click());
            assert.equal(await execute(owner,()=>Boolean(document.querySelector('.whats-new-dialog')?.open)),true,'Real modal opens at the largest font');
            await execute(owner,()=>document.querySelector('[data-tour-close]').click());
            const reloaded=panels().intel;reloaded.webContents.reload();
            await until(async()=>execute(reloaded,()=>document.documentElement.dataset.fontFamily==='georgia').catch(()=>false),'native panel reload');
            assert.deepEqual(Object.values(panels()).map(window=>window.id),ids,'Font changes never recreate native windows');
            assert.equal((await state()).snapshot.sessionId,sessionId,'Font changes and panel reload preserve one parser session');
            assert.equal((await state()).snapshot.session.parse.totalDamage,9,'Font changes do not duplicate log lines');
            const currentDeadline=(await state()).snapshot.session.timers.timers.find(timer=>timer.id===deadline.id);
            assert.equal(currentDeadline.expiresAt,deadline.expiresAt,'Font changes preserve timer identity and deadline');
            owner.webContents.reload();
            await until(controls,'main Settings after reload');
            await until(async()=>(await appearance(owner)).family==='georgia','main reload preserves font');
            await until(async()=>{const current=await state();return current.snapshot.sessionId!==sessionId&&current.snapshot.session.parse.totalDamage===9;},'One replacement owner rebuilds the synthetic log tail after main reload');
            await capture(owner,'main-persisted');
            return {ok:true,nativePanels:4,liveFontSizes:[10,20],computedLabelSizes:[small.labelSize,large.labelSize],family:true,mapCanvas:true,modal:true,reload:true,sharedSession:true,packagedSources:root.endsWith('.asar')};
        };
        let started=false;app.on('browser-window-created',()=>{if(started)return;started=true;inspect().then(result=>{console.log('EOZ_APPEARANCE_SMOKE='+JSON.stringify(result));app.exit(0);}).catch(error=>{console.error(error.stack);app.exit(1);});});
        setTimeout(()=>{console.error('Appearance smoke exceeded 60 seconds');app.exit(2);},60000).unref();
        require(path.join(root,'desktop/main.cjs'));
    };
    for(const phase of ['first','restart']){
        await writeFile(join(temporary,'main.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});(${run.toString()})(${JSON.stringify({root,log,screenshots,phase})});`);
        const result=await new Promise((resolve,reject)=>{const child=spawn(electron,[temporary,'--disable-gpu','--mute-audio'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('exit',code=>resolve({code,output}));});
        assert.equal(result.code,0,result.output);assert.match(result.output,/EOZ_APPEARANCE_SMOKE=.*"ok":true/);console.log(result.output.match(/EOZ_APPEARANCE_SMOKE=.*/)[0]);
    }
}finally{
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-appearance-smoke-'));
    await rm(temporary,{recursive:true,force:true});
}
