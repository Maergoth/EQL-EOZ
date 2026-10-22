import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Real main renderer, embedded viewer marker messages and item tooltip path.
// Only synthetic log/catalog/map/profile files are read; clipboard and external
// browser actions are intercepted in memory. This never opens a live game.
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),electron=require('electron');
const temporary=await mkdtemp(join(tmpdir(),'eoz-map-loot-'));
const screenshotIndex=process.argv.indexOf('--screenshots'),screenshots=screenshotIndex<0?join(temporary,'screenshots'):resolve(process.argv[screenshotIndex+1]||'');
try {
    const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),log=join(game,'Logs','eqlog_Fixture_Test.txt');
    await mkdir(join(profile,'data'),{recursive:true});await mkdir(join(game,'Logs'),{recursive:true});await mkdir(join(game,'Maps'));await mkdir(screenshots,{recursive:true});
    await writeFile(log,'[Thu Oct 22 01:00:00 2026] Synthetic map loot starts.\n');
    await writeFile(join(game,'Maps','mistmoore.txt'),'L -100,-100,0,100,100,0,150,160,180\n');
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,logSelection:'manual'}));
    const icon='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATklEQVR4nGNgGAWjgObg6saw//gwTQwl2zJcGjkEpLFikiwixlBi5LBaQo5riVFHtAWkBN3gtIDiIKJ5JNMlmRJj0YDkarIMHQWjgCQAAOw009RU8GzvAAAAAElFTkSuQmCC';
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({
        meta:{schemaVersion:3,version:'map-loot-synthetic',sample:true,currentEra:'Classic'},icons:{fixture:icon},
        zones:[{name:'Mistmoore Castle',viewerName:'Mistmoore Castle',aliases:['mistmoore','The Castle of Mistmoore']},{name:'Befallen',viewerName:'Befallen',aliases:['befallen']}],
        npcs:[{name:'Synthetic Keeper',wikiTitle:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false,avgLevel:26,loc:[10,20,0],era:'Classic'},
            {name:'Synthetic Keeper',wikiTitle:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true,avgLevel:60,loc:[30,40,0],era:'Classic'},
            {name:'Synthetic Keeper',zone:'Befallen',raidInstance:false,avgLevel:30,loc:[50,60,0],era:'Classic'}],
        items:[...Array.from({length:8},(_,index)=>({name:`Synthetic normal item ${index+1}`,wikiTitle:`Synthetic normal item ${index+1}`,iconId:'fixture',classes:[index%2?'WAR':'MNK'],slots:['FINGER'],era:'Classic',stats:{HP:100,STR:5,AC:8,DMG:10,RANGE:20},dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false}]})),
            {name:'Synthetic raid-only prize',wikiTitle:'Synthetic raid-only prize',classes:['WAR'],slots:['PRIMARY'],stats:{HP:999},dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true}]},
            {name:'Synthetic other-zone prize',slots:['HEAD'],stats:{HP:666},dropSources:[{name:'Synthetic Keeper',zone:'Befallen',raidInstance:false}]}]
    }));
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-map-loot-smoke',version:pkg.version,main:'main.cjs'}));
    const run=async({root,log,screenshots})=>{
        const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs/promises'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
        const clipboard=[],external=[],issues=[],load=Module._load;
        Module._load=function(name,...args){if(name==='electron')return{...electron,clipboard:{...electron.clipboard,writeText:value=>clipboard.push(value)},shell:{...electron.shell,openExternal:async value=>{external.push(value);return '';}}};return load.call(this,name,...args);};
        BrowserWindow.prototype.show=()=>{};BrowserWindow.prototype.showInactive=()=>{};global.fetch=async()=>{throw Error('External network disabled for map loot fixture');};
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const until=async(fn,label)=>{const end=Date.now()+12000;while(Date.now()<end){try{const result=await fn();if(result)return result;}catch{}await wait(60);}throw Error(`Timed out: ${label}`);};
        const execute=(window,fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        let owner;
        const pane=()=>execute(owner,()=>{const pane=document.querySelector('#map-loot-pane');return{hidden:pane.hidden,names:[...pane.querySelectorAll('.map-loot-item h3')].map(el=>el.textContent),text:pane.textContent,routeHidden:document.querySelector('#clear-route').hidden};});
        const append=text=>fs.appendFile(log,`[${new Date().toString().replace(/ GMT.*$/,'')}] ${text}\n`);
        const clickMarker=async raid=>execute(owner,raid=>{
            const viewer=document.querySelector('#zone-viewer').contentWindow,app=viewer.eqlZoneViewer,api=viewer.eqlEyeOfZommViewer;
            app.currentZoneRecord={id:'synthetic-map-loot',name:'Mistmoore Castle',format:'map'};
            app.currentBounds.min.set(-100,-10,-100);app.currentBounds.max.set(100,10,100);app.mapBounds.copy(app.currentBounds);app.mapContentBounds.copy(app.currentBounds);
            app.mapData={lines:[{x1:-100,y1:0,z1:-100,x2:100,y2:0,z2:100,r:216,g:183,b:92,layer:0}]};app.els.overlay.hidden=true;
            const result=api.setRareMobs([{id:'synthetic-normal',name:'Synthetic Keeper',raidInstance:false,loc:[10,20,0],dropCount:8,classDropCount:4},{id:'synthetic-raid',name:'Synthetic Keeper',raidInstance:true,loc:[30,40,0],dropCount:1,classDropCount:0}]);
            if(result.count!==2)throw Error('Real viewer did not create both instance markers.');
            const button=[...viewer.document.querySelectorAll('.eoz-rare-marker')].find(button=>button.title.includes(raid?'· Raid Zone':'· Normal Zone'));
            if(!button)throw Error('Requested real viewer marker is missing.');button.click();return{count:result.count,title:button.title};
        },raid);
        const capture=async name=>{owner.webContents.invalidate();await owner.capturePage(undefined,{stayHidden:true,stayAwake:true});await wait(80);await fs.writeFile(path.join(screenshots,`${name}.png`),(await owner.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());};
        const inspect=async()=>{
            owner=await until(()=>BrowserWindow.getAllWindows().find(window=>/^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())),'main window');
            await until(()=>execute(owner,()=>document.querySelector('#bridge-status')?.textContent==='Live log'),'synthetic log cursor');
            await append('[60 MNK/SHM] Fixture (Human) ZONE: The Castle of Mistmoore (mistmoore)');
            await until(()=>execute(owner,async()=>((await window.eyeOfZommOverlays.getState()).snapshot?.session?.zone==='Mistmoore Castle')),'logged fixture zone');
            await execute(owner,()=>document.querySelector('[data-view="map"]').click());
            await until(()=>execute(owner,()=>Boolean(document.querySelector('#zone-viewer').contentWindow?.eqlEyeOfZommViewer?.setRareMobs)),'actual viewer bridge');
            owner.setContentSize(1200,850);await clickMarker(false);
            await until(async()=>(await pane()).names.length===8,'all eight normal drops');
            let current=await pane();assert(current.routeHidden,'Selecting a marker must not start a route');assert(current.text.includes('NORMAL ZONE'));assert(!current.text.includes('raid-only')&&!current.text.includes('other-zone'));
            assert(current.names.includes('Synthetic normal item 8'),'More than six drops are kept');
            assert.equal(await execute(owner,()=>document.querySelectorAll('#map-loot-pane .pill').length),16,'Items outside the current classes remain listed');
            await execute(owner,()=>{const tier=document.querySelector('[data-map-loot-tier]');tier.value='7';tier.dispatchEvent(new Event('input',{bubbles:true}));tier.dispatchEvent(new Event('change',{bubbles:true}));});
            assert.equal(await execute(owner,()=>document.querySelector('#map-loot-pane .map-loot-item .stat strong').textContent),'170','Pane uses the existing tier scaling');
            await execute(owner,()=>{const target=document.querySelector('#map-loot-pane .item-hover');target.focus();target.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));});
            await until(()=>execute(owner,()=>!document.querySelector('#item-tooltip').hidden),'keyboard item tooltip');
            const tooltip=await execute(owner,()=>document.querySelector('#item-tooltip').textContent);
            if(!/Tier 7/.test(tooltip)||!/170/.test(tooltip))issues.push('Tooltip and pane must use the same selected tier: expected Tier 7 / HP170.');
            await capture('map-loot-normal-tier7');
            await execute(owner,()=>document.querySelector('[data-map-loot-waypoint]').click());await until(()=>clipboard.length===1,'explicit local waypoint copy');assert.equal(clipboard[0],'/waypoint 10 20 0','Wiki location retains its player-facing Y/X/Z command order');
            await execute(owner,()=>{const links=[...document.querySelectorAll('#map-loot-pane a')];links.find(link=>link.textContent==='Monster wiki').click();links.find(link=>link.textContent==='Item wiki').click();});
            await until(()=>external.length===2,'explicit wiki link dispatch');assert(external.every(url=>url.startsWith('https://eqlwiki.com/')));
            await clickMarker(true);await until(async()=>(await pane()).names.length===1,'raid instance exact loot');
            current=await pane();assert.deepEqual(current.names,['Synthetic raid-only prize']);assert(current.text.includes('RAID ZONE'));assert(current.routeHidden,'Raid marker selection also avoids auto-routing');
            await execute(owner,()=>{const sibling=document.createElement('iframe');sibling.id='synthetic-sibling';sibling.srcdoc='<script>parent.postMessage({type:"eoz-rare-mob-selected",name:"Synthetic Keeper",raidInstance:false},parent.location.origin)<\/script>';document.body.appendChild(sibling);});
            await wait(120);assert.deepEqual((await pane()).names,['Synthetic raid-only prize'],'A same-origin sibling frame cannot impersonate the map viewer');
            await clickMarker(false);await until(async()=>(await pane()).names.length===8,'normal loot restored');
            await execute(owner,()=>{document.querySelector('[data-view="settings"]').click();const family=document.querySelector('#settings-font-family');family.value='verdana';family.dispatchEvent(new Event('change',{bubbles:true}));const input=document.querySelector('#settings-font-size');input.value='20';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-view="map"]').click();});
            owner.setContentSize(1024,768);await wait(100);
            const geometry=await execute(owner,()=>{const pane=document.querySelector('#map-loot-pane');const last=pane.querySelector('.map-loot-item:last-child a');last.scrollIntoView({block:'end'});last.focus();const rect=last.getBoundingClientRect(),panel=pane.getBoundingClientRect();return{window:innerWidth,paneWidth:pane.clientWidth,paneScrollWidth:pane.scrollWidth,paneBounds:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom},last:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},count:pane.querySelectorAll('.map-loot-item').length};});
            assert(geometry.paneScrollWidth<=geometry.paneWidth+1,'Loot pane must not overflow horizontally at 1024px / 20px');assert(geometry.paneBounds.right<=geometry.window+1);assert(geometry.last.bottom<=geometry.paneBounds.bottom+1&&geometry.last.top>=geometry.paneBounds.top,'The eighth drop is keyboard reachable inside the scroll pane');assert.equal(geometry.count,8);
            await capture('map-loot-large-font-last-drop');
            await execute(owner,()=>document.querySelector('[data-map-loot-route]').click());
            await until(()=>execute(owner,()=>!document.querySelector('#clear-route').hidden),'explicit route action');
            assert.match(await execute(owner,()=>document.querySelector('#route-status').textContent),/loc|position/i,'Explicit route waits for a logged position rather than inventing one');
            await execute(owner,()=>document.querySelector('[data-close-map-loot]').click());assert((await pane()).hidden,'Close hides the pane');
            await clickMarker(false);await until(async()=>!(await pane()).hidden,'pane can reopen');
            await append('You have entered Befallen.');await until(async()=>(await pane()).hidden,'zone change clears stale selection');
            console.log('EOZ_MAP_LOOT_SMOKE='+JSON.stringify({ok:issues.length===0,issues,realViewerMessages:true,normalDrops:8,raidDrops:1,tier:7,tooltip:issues.length===0,siblingRejected:true,noAutoRoute:true,explicitActions:true,zoneCleared:true,geometry,screenshots}));assert.deepEqual(issues,[]);app.exit(0);
        };
        let started=false;app.on('browser-window-created',()=>{if(started)return;started=true;void inspect().catch(error=>{console.error(error.stack);app.exit(1);});});
        setTimeout(()=>{console.error('Map loot smoke exceeded 45 seconds');app.exit(2);},45000).unref();require(path.join(root,'desktop/main.cjs'));
    };
    await writeFile(join(temporary,'main.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});(${run.toString()})(${JSON.stringify({root,log,screenshots})});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const result=await new Promise((resolve,reject)=>{const child=spawn(electron,[temporary,'--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('exit',code=>resolve({code,output}));});
    assert.equal(result.code,0,result.output);assert.match(result.output,/EOZ_MAP_LOOT_SMOKE=.*"ok":true/);console.log(result.output.match(/EOZ_MAP_LOOT_SMOKE=.*/)[0]);
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-map-loot-'));await rm(temporary,{recursive:true,force:true});}
