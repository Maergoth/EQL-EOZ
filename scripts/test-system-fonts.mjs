import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';import {fileURLToPath} from 'node:url';
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..'),arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const root=arg('--packaged-root')?resolve(arg('--packaged-root')):projectRoot,electron=createRequire(import.meta.url)('electron');
const screenshots=arg('--screenshots')?resolve(arg('--screenshots')):null;
const temporary=await mkdtemp(join(tmpdir(),'eoz-system-fonts-'));
async function run({root,temporary,phase,screenshots}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();
    const nativeShowInactive=BrowserWindow.prototype.showInactive;
    BrowserWindow.prototype.show=()=>{};BrowserWindow.prototype.showInactive=()=>{};
    global.fetch=async()=>{throw Error('External requests disabled in system-font fixture.');};
    const wait=ms=>new Promise(done=>setTimeout(done,ms));
    const until=async(fn,label)=>{const end=Date.now()+12000;while(Date.now()<end){const result=await fn();if(result)return result;await wait(50);}throw Error(`Timed out: ${label}`);};
    const execute=(window,fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`,true);
    async function capture(window,name){
        if(!screenshots)return;await fs.mkdir(screenshots,{recursive:true});
        // Chromium may retain a stale hidden frame. Show without activation for
        // the capture only, finish finite transitions and restore hidden state.
        const wasVisible=window.isVisible();nativeShowInactive.call(window);
        try{
            await execute(window,()=>{for(const animation of document.getAnimations()){try{if(animation.effect?.getTiming().iterations!==Infinity)animation.finish();}catch{}}});
            window.webContents.invalidate();await execute(window,()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));await wait(160);
            if(name==='system-fonts')await execute(window,()=>{document.querySelector('#settings-eq-root').textContent='Synthetic EverQuest folder';document.querySelector('#settings-log-path').textContent='Logs/eqlog_Font_Test.txt (synthetic)';});
            await execute(window,()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
            const image=await window.webContents.capturePage();assert(!image.isEmpty());
            await fs.writeFile(path.join(screenshots,`${name}.png`),image.toPNG());
        }finally{if(!wasVisible)window.hide();}
    }
    let started=false;
    app.on('browser-window-created',()=>{if(started)return;started=true;(async()=>{
        const owner=await until(()=>BrowserWindow.getAllWindows().find(window=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())),'main window');
        await until(()=>execute(owner,()=>Boolean(document.querySelector('#settings-local-font')&&window.eyeOfZommOverlays)),'font UI');
        await execute(owner,()=>document.querySelector('[data-tour-close]')?.click());
        await execute(owner,()=>document.querySelector('[data-view="settings"]').click());
        const state=()=>execute(owner,()=>window.eyeOfZommOverlays.getState());
        await until(async()=>{const current=await state();return current.sessionAvailable&&await execute(owner,()=>document.querySelector('#bridge-status')?.textContent==='Live log');},'synthetic bridge and shared session');
        await execute(owner,()=>document.querySelector('[data-view="settings"]').click());
        if(phase==='restore'){
            const expected=JSON.parse(await fs.readFile(path.join(temporary,'chosen.json'),'utf8'));
            await until(async()=>{const current=(await state()).appearance;return current.fontFamily==='local'&&current.localFontFamily===expected.family&&current.fontSize===17;},'local font process persistence');
            assert.equal(await execute(owner,()=>document.querySelector('#settings-local-font').value),expected.family);
            await execute(owner,()=>document.querySelector('#reset-appearance').click());
            await until(async()=>(await state()).appearance.fontFamily==='theme','reset local font');
            console.log('EOZ_SYSTEM_FONTS='+JSON.stringify({ok:true,phase,persistence:true,reset:true}));return;
        }
        await execute(owner,()=>document.querySelector('#refresh-system-fonts').click());
        let families;
        await until(async()=>{const result=await execute(owner,()=>({families:[...document.querySelector('#installed-font-families').options].map(option=>option.value),status:document.querySelector('#settings-system-font-status').textContent}));
            if(/unavailable|denied/i.test(result.status))throw Error(`Actual installed font access failed: ${result.status}`);families=result.families;return families.length>0;},'actual OS font families');
        const presetLabels=new Set(JSON.parse(await fs.readFile(path.join(root,'app','appearance-presets.json'),'utf8')).fonts.map(font=>font.label.toLowerCase()));
        const nonPreset=families.filter(name=>!presetLabels.has(name.toLowerCase()));assert(nonPreset.length,'An actual installed family beyond the shipped presets is required.');
        const family=['Calibri','Bahnschrift','Comic Sans MS','Noto Sans','Liberation Sans','DejaVu Sans'].find(preferred=>nonPreset.includes(preferred))||nonPreset[0];
        const fallback=await execute(owner,async()=>{
            const {mountSystemFontSettings}=await import('./system-font-settings.js');
            const {normalizeAppearance,appearanceFont}=await import('./appearance.js');
            const doc=document.implementation.createHTMLDocument('Fallback fixture');
            doc.body.innerHTML='<select id="settings-font-family"><option value="local">Installed</option></select><input id="settings-local-font"><button id="refresh-system-fonts"></button><button id="apply-system-font"></button><datalist id="installed-font-families"></datalist><p id="settings-system-font-status"></p>';
            let current={fontFamily:'theme',fontSize:13};
            const control=mountSystemFontSettings({document:doc,getAppearance:()=>current,saveAppearance:async next=>{current=normalizeAppearance(next);},queryFonts:null});
            doc.getElementById('refresh-system-fonts').click();const message=doc.getElementById('settings-system-font-status').textContent;
            doc.getElementById('settings-local-font').value='游ゴシック';doc.getElementById('apply-system-font').click();await Promise.resolve();await Promise.resolve();
            const element=doc.createElement('div');element.style.color='blue';element.style.fontFamily=appearanceFont({fontFamily:'local',localFontFamily:'Font";color:red;/*',fontSize:13}).stack;
            control.dispose();return {message,current,color:element.style.color,font:element.style.fontFamily};
        });
        assert.match(fallback.message,/manually/);assert.equal(fallback.current.localFontFamily,'游ゴシック');assert.equal(fallback.color,'blue');assert.match(fallback.font,/Font/);
        await fs.writeFile(path.join(temporary,'chosen.json'),JSON.stringify({family,count:families.length}));
        await execute(owner,family=>{document.querySelector('#settings-local-font').value=family;document.querySelector('#apply-system-font').click();const size=document.querySelector('#settings-font-size');size.value='17';size.dispatchEvent(new Event('input',{bubbles:true}));size.dispatchEvent(new Event('change',{bubbles:true}));},family);
        await until(async()=>{const value=(await state()).appearance;return value.fontFamily==='local'&&value.localFontFamily===family&&value.fontSize===17;},'chosen OS font saved');
        await execute(owner,()=>window.eyeOfZommOverlays.control('show-all'));
        const panels=await until(()=>{const panels=BrowserWindow.getAllWindows().filter(window=>/\/overlay(?:-map)?\.html\?panel=/.test(window.webContents.getURL()));return panels.length===4?panels:null;},'native panels');
        for(const window of [owner,...panels])await until(()=>execute(window,family=>document.documentElement.dataset.localFontFamily===family&&getComputedStyle(document.body).fontFamily.includes(family),family),'shared installed family');
        await execute(owner,()=>document.querySelector('#appearance-settings').scrollIntoView({block:'start'}));
        await execute(owner,()=>{document.querySelector('#settings-eq-root').textContent='Synthetic EverQuest folder';document.querySelector('#settings-log-path').textContent='Logs/eqlog_Font_Test.txt (synthetic)';});
        await capture(owner,'system-fonts');
        // Same-origin 3D controls inherit the local font without exposing font access.
        const viewer=await execute(owner,()=>{const frame=document.querySelector('#zone-viewer');return frame?.contentDocument?.documentElement?.dataset.localFontFamily;});
        assert.equal(viewer,family);
        // Actual DOM colors distinguish adjusted values from unchanged values.
        await until(()=>execute(owner,()=>Boolean(document.querySelector('#item-tier'))),'items');
        await execute(owner,()=>{document.querySelector('[data-view="items"]').click();const search=document.querySelector('#item-search');search.value='Synthetic Font Charm';search.dispatchEvent(new Event('input',{bubbles:true}));const tier=document.querySelector('#item-tier');tier.value='2';tier.dispatchEvent(new Event('input',{bubbles:true}));});
        await until(()=>execute(owner,()=>Boolean(document.querySelector('#item-list .stat.is-scaled strong'))),'changed item stats');
        const colors=await execute(owner,()=>[...document.querySelectorAll('#item-list .stat')].map(element=>({name:element.querySelector('span').textContent,changed:element.classList.contains('is-scaled'),color:getComputedStyle(element.querySelector('strong')).color})));
        assert(colors.some(entry=>entry.changed&&entry.color==='rgb(134, 220, 140)'));assert(colors.some(entry=>!entry.changed&&entry.color!=='rgb(134, 220, 140)'));
        await execute(owner,()=>{const target=document.querySelector('#item-list [data-item-title]');target.focus();target.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));});
        await until(()=>execute(owner,()=>document.querySelector('#item-tooltip')&&!document.querySelector('#item-tooltip').hidden),'item tooltip');
        assert.equal(await execute(owner,()=>getComputedStyle(document.querySelector('#item-tooltip .wiki-itembox-value.is-scaled')).color),'rgb(85, 255, 85)');
        assert.equal(await execute(owner,family=>getComputedStyle(document.querySelector('#item-tooltip .wiki-itembox')).fontFamily.includes(family),family),true,'Wiki-style tooltips preserve an explicit installed font');
        await capture(owner,'green-stats');
        const intel=panels.find(window=>/panel=intel$/.test(window.webContents.getURL()));
        await until(()=>execute(intel,()=>Boolean(document.querySelector('.item-stats .is-scaled'))),'Intel adjusted stats');
        assert.equal(await execute(intel,()=>getComputedStyle(document.querySelector('.item-stats .is-scaled')).color),'rgb(134, 220, 140)');
        await execute(intel,()=>{const target=document.querySelector('[data-item-hover]');target.focus();target.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));});
        await until(()=>execute(intel,()=>Boolean(document.querySelector('#intel-item-tooltip .wiki-itembox-value.is-scaled'))),'Intel adjusted tooltip');
        assert.equal(await execute(intel,()=>getComputedStyle(document.querySelector('#intel-item-tooltip .wiki-itembox-value.is-scaled')).color),'rgb(85, 255, 85)');
        await capture(intel,'green-intel');
        // Reselect then reload in the same process to verify the cached frontend path.
        await execute(owner,()=>document.querySelector('[data-view="settings"]').click());owner.webContents.reload();
        await until(()=>execute(owner,family=>document.documentElement.dataset.localFontFamily===family&&document.querySelector('#settings-local-font')?.value===family,family),'local font reload');
        console.log('EOZ_SYSTEM_FONTS='+JSON.stringify({ok:true,phase,installedFamilies:families.length,family,nativePanels:4,viewer:true,itemGreen:true,reload:true}));
    })().then(()=>app.quit()).catch(error=>{console.error(error.stack);app.exit(1);});});
    setTimeout(()=>{console.error('System font smoke exceeded 45 seconds');app.exit(2);},45000).unref();
    require(path.join(root,'desktop','main.cjs'));
}
try{
    const profile=join(temporary,'profile'),game=join(temporary,'game'),log=join(game,'Logs','eqlog_Font_Test.txt');
    await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});await mkdir(join(game,'Maps'));
    await writeFile(log,'[Thu Oct 22 01:00:00 2026] You have entered The Castle of Mistmoore.\n');
    await writeFile(join(game,'Maps','mistmoore.txt'),'L -100,-100,0,100,100,0,150,160,180\n');
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,logSelection:'manual'}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,version:'system-fonts-synthetic',sample:true,currentEra:'Classic'},zones:[{name:'Mistmoore Castle',viewerName:'Mistmoore Castle',aliases:['mistmoore','The Castle of Mistmoore']}],npcs:[{name:'Synthetic Keeper',wikiTitle:'Synthetic Keeper',zone:'Mistmoore Castle',avgLevel:26,loc:[70,60,0]}],items:[{name:'Synthetic Font Charm',wikiTitle:'Synthetic Font Charm',classes:['MNK'],slots:['NECK'],stats:{HP:12,STR:-3,WT:1,DELAY:20,UNKNOWN:0},era:'Classic',dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle'}]}],icons:{}}));
    const pkg=JSON.parse(await readFile(join(projectRoot,'package.json'),'utf8'));await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-system-font-fixture',version:pkg.version,main:'main.cjs'}));
    for(const phase of ['choose','restore']){
        await writeFile(join(temporary,'main.cjs'),`(${run.toString()})(${JSON.stringify({root,temporary,phase,screenshots})});`);
        const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const result=await new Promise((done,reject)=>{const child=spawn(electron,[temporary,'--disable-gpu','--mute-audio'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('exit',code=>done({code,output}));});
        assert.equal(result.code,0,result.output);assert.match(result.output,/EOZ_SYSTEM_FONTS=.*"ok":true/);console.log(result.output.match(/EOZ_SYSTEM_FONTS=.*/)[0]);
    }
}finally{assert.equal(dirname(temporary),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-system-fonts-'));await rm(temporary,{recursive:true,force:true});}
