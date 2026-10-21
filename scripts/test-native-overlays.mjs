import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real Electron/native-window smoke, with one normal application session and
// synthetic logs in a disposable profile. It never opens the actual EQ folder.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const electron = require('electron');
const temporary = await mkdtemp(join(tmpdir(), 'eoz-native-overlay-smoke-'));
const screenshotArgument = process.argv.indexOf('--screenshots');
const screenshots = screenshotArgument === -1 ? join(temporary, 'screenshots') : resolve(process.argv[screenshotArgument + 1] || '');
try {
    const profile = join(temporary, 'profile');
    const game = join(temporary, 'synthetic-game');
    const log = join(game, 'Logs', 'eqlog_Fixture_Test.txt');
    await mkdir(profile); await mkdir(join(game, 'Logs'), { recursive:true }); await mkdir(join(game, 'Maps')); await mkdir(screenshots, { recursive:true });
    await writeFile(join(game,'Maps','mistmoore.txt'),'L -100,-100,0,100,-100,0,150,160,180\nL 100,-100,0,100,100,0,150,160,180\nL 100,100,0,-100,100,0,150,160,180\nL -100,100,0,-100,-100,0,150,160,180\nP -20,-10,0,216,183,92,2,Synthetic_Keeper\n');
    await writeFile(join(game,'Maps','mistmoore_1.txt'),'L -50,-50,50,50,50,50,200,100,110\n');
    await mkdir(join(profile, 'data'));
    // Keep the smoke independent of the ignored production bootstrap and
    // network access. This tiny presentation pack exists only in this profile.
    await writeFile(join(profile, 'data', 'eye-of-zomm-pack.json'), JSON.stringify({
        meta:{ schemaVersion:3, version:'native-overlay-synthetic', currentEra:'Classic', sample:true },
        zones:[{ name:'Mistmoore Castle', viewerName:'Mistmoore Castle', aliases:['mistmoore', 'The Castle of Mistmoore'] }],
        npcs:[...[false,true].map(raidInstance => ({name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance,avgLevel:26,levelMin:26,levelMax:26,era:'Classic',loc:raidInstance ? [30,20,50] : [10,20,0]})),{name:'Unknown Elevation Watcher',zone:'Mistmoore Castle',avgLevel:30,levelMin:30,levelMax:30,era:'Classic',loc:[60,40]}],
        items:[...Array.from({length:12},(_,index) => ({name:`Synthetic Charm ${index + 1}`,era:'Classic',classes:['MNK','SHM','BER'],slots:['NECK'],stats:{HP:index + 1},iconId:'fixture',dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false}]})),
            ...Array.from({length:2},(_,index) => ({name:`Raid Charm ${index + 1}`,era:'Classic',classes:['MNK','SHM','BER'],slots:['NECK'],stats:{HP:50 + index},iconId:'fixture',dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true}]})),
            {name:'Synthetic Wayfarer Ring',era:'Classic',classes:['MNK','SHM','BER'],slots:['FINGER'],stats:{HP:2},dropSources:[{name:'Unknown Elevation Watcher',zone:'Mistmoore Castle'}]},
            ...['Classic','Kunark','Velious'].map(era => ({name:`Era fixture ${era}`,era,classes:['MNK','SHM','BER'],slots:['FINGER'],stats:{HP:1},dropSources:[]}))],
        icons:{ fixture:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATklEQVR4nGNgGAWjgObg6saw//gwTQwl2zJcGjkEpLFikiwixlBi5LBaQo5riVFHtAWkBN3gtIDiIKJ5JNMlmRJj0YDkarIMHQWjgCQAAOw009RU8GzvAAAAAElFTkSuQmCC' }
    }));
    // A nonempty initial tail establishes the cursor before live fixture lines
    // arrive; initial/backfill reads must not trigger transient timers/considers.
    await writeFile(log, `[${new Date().toISOString()}] Synthetic overlay smoke begins.\n`);
    await writeFile(join(profile, 'eye-of-zomm-config.json'), JSON.stringify({ eqRootPath:game, logPath:log, logSelection:'manual' }));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    await writeFile(join(temporary, 'package.json'), JSON.stringify({ name:'eoz-native-overlay-smoke', version:pkg.version, main:'main.cjs' }));
    const run = async ({ root, log, screenshots }) => {
        const electron = require('electron');
        const { app, BrowserWindow } = electron;
        const fs = require('node:fs/promises');
        const path = require('node:path');
        const Module = require('node:module');
        const assert = require('node:assert/strict');
        const nativeOptions = new Map();
        const nativeCalls = new Map();
        // Record the options passed to real BrowserWindows. The wrapper returns
        // native instances; no fake host/window is substituted in this smoke.
        function RecordedWindow(options) {
            const window = new BrowserWindow(options);
            nativeOptions.set(window.id, options); nativeCalls.set(window.id, []);
            window.webContents.on('console-message', (_event,...details) => {
                const message = typeof details[0] === 'object' ? details[0]?.message : details[1];
                if (/\/api\/info.*(?:connect-src|Refused to connect)/.test(message || '')) return;
                if (typeof details[0] === 'object' && ['error','warning'].includes(details[0]?.level)) console.error('[renderer]',message);
                else if (typeof details[0] === 'number' && details[0] >= 2) console.error('[renderer]',message);
            });
            window.webContents.on('preload-error',(_event,_path,error) => console.error('[preload]',error.message));
            for (const name of ['setIgnoreMouseEvents', 'setResizable', 'setMovable', 'setFocusable', 'focus']) {
                const original = window[name].bind(window);
                window[name] = (...args) => { nativeCalls.get(window.id).push([name, ...args]); return original(...args); };
            }
            return window;
        }
        Object.setPrototypeOf(RecordedWindow, BrowserWindow); RecordedWindow.prototype = BrowserWindow.prototype;
        const originalLoad = Module._load;
        Module._load = function(name, ...args) {
            if (name === 'electron') return { ...electron, BrowserWindow:RecordedWindow };
            return originalLoad.call(this, name, ...args);
        };
        // Keep test windows hidden. capturePage still paints the real renderer;
        // this does not test physical foreground-game compositing or focus.
        BrowserWindow.prototype.show = () => {};
        BrowserWindow.prototype.showInactive = () => {};
        global.fetch = async () => { throw new Error('External network disabled for synthetic smoke'); };
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (predicate, message, timeout = 6500) => {
            const end = Date.now() + timeout;
            while (Date.now() < end) { const result = await predicate(); if (result) return result; await wait(75); }
            throw new Error(`Timed out: ${message}`);
        };
        const execute = (window, fn, ...args) => window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
        let owner;
        const panels = () => Object.fromEntries(BrowserWindow.getAllWindows().filter(window => /\/overlay(?:-map)?\.html\?panel=/.test(window.webContents.getURL())).map(window => [new URL(window.webContents.getURL()).searchParams.get('panel'), window]));
        const state = () => execute(owner, () => window.eyeOfZommOverlays.getState());
        const control = (action, panel, value) => execute(owner, (action, panel, value) => window.eyeOfZommOverlays.control(action, panel, value), action, panel, value);
        const action = (panel, command, payload) => execute(panels()[panel], (command, payload) => window.eyeOfZommOverlay.action(command, payload), command, payload);
        const append = async texts => {
            const stamp = new Date().toString().replace(/ GMT.*$/, '');
            await fs.appendFile(log, texts.map(text => `[${stamp}] ${text}\n`).join(''));
        };
        const screenshot = async (window, name) => {
            // Hidden native windows may have a previous compositor frame even
            // though executeJavaScript already sees the current DOM.
            await execute(window, () => { const style = document.createElement('style'); style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'; document.head.append(style); });
            window.webContents.invalidate(); await wait(100);
            await window.capturePage(undefined, {stayHidden:true, stayAwake:true});
            await wait(100);
            const image = await window.capturePage(undefined, {stayHidden:true, stayAwake:true});
            assert(!image.isEmpty(), `${name} must render pixels`);
            await fs.writeFile(path.join(screenshots, `${name}.png`), image.toPNG());
        };
        const inspect = async () => {
            owner = await until(() => BrowserWindow.getAllWindows().find(window => /^http:\/\/127\.0\.0\.1:\d+\/$/.test(window.webContents.getURL())), 'main app');
            await until(async () => execute(owner, () => Boolean(window.eyeOfZommOverlays && document.querySelector('#bridge-status')?.textContent === 'Live log')), 'initial log poll');
            await until(async () => (await state()).sessionAvailable, 'first shared snapshot');
            await execute(owner, () => window.addEventListener('error',event => console.error(event.error?.stack || event.message)));
            await execute(owner, () => localStorage.setItem('eoz-smoke-owner-only', 'synthetic-owner-preference'));
            await control('show-all');
            await until(() => Object.keys(panels()).length === 4, 'four native overlays');
            assert.deepEqual(Object.keys(panels()).sort(),['intel','map','parse','timers']);
            for (const window of Object.values(panels())) await until(async () => execute(window, () => Boolean(document.querySelector('#panel-content')?.children.length)), 'overlay renderer');
            const ids = Object.values(panels()).map(window => window.id);
            assert.equal(new Set(ids).size, 4);
            const bounds = Object.values(panels()).map(window => window.getBounds());
            assert.equal(new Set(bounds.map(bounds => `${bounds.x},${bounds.y}`)).size, 4, 'independent saved positions');
            const emptyTimerLayout = await execute(panels().timers, () => {
                const panel = document.querySelector('#panel-content');
                return { scroll:panel.scrollHeight, height:panel.clientHeight };
            });
            assert(emptyTimerLayout.scroll <= emptyTimerLayout.height + 1, 'empty slim timer panel fits one waiting swing row without clipping');
            for (const window of Object.values(panels())) {
                const options = nativeOptions.get(window.id);
                assert.equal(options.frame, false); assert.equal(options.transparent, true); assert.equal(options.alwaysOnTop, true);
                assert.equal(options.webPreferences.sandbox, true); assert.equal(options.webPreferences.contextIsolation, true); assert.equal(options.webPreferences.nodeIntegration, false);
                assert(window.getNativeWindowHandle().length > 0, 'native window handle exists');
                assert.equal(window.isAlwaysOnTop(), true);
                const surface = await execute(window, async () => {
                    let fetchBlocked = false;
                    try { await fetch('/api/info'); } catch { fetchBlocked = true; }
                    return { singular:typeof window.eyeOfZommOverlay?.getState, main:typeof window.eyeOfZommOverlays, updater:typeof window.eyeOfZommUpdates, files:typeof window.require,
                        fetchBlocked, mainPreference:localStorage.getItem('eoz-smoke-owner-only') };
                });
                assert.deepEqual(surface, { singular:'function', main:'undefined', updater:'undefined', files:'undefined', fetchBlocked:true, mainPreference:null });
            }
            await action('parse', 'lock', true);
            assert.equal(panels().parse.isResizable(), false); assert.equal(panels().parse.isMovable(), false); assert.equal(panels().parse.isFocusable(), true);
            await until(async () => execute(panels().parse, () => document.querySelector('#overlay').classList.contains('is-locked')), 'locked drag CSS');
            await execute(panels().parse, () => document.querySelector('[data-tab="healing"]').click());
            assert.equal(await execute(panels().parse, () => document.querySelector('[data-tab="healing"]').getAttribute('aria-pressed')), 'true', 'tabs remain usable in locked layouts');
            await execute(panels().parse, () => document.querySelector('#panel-menu-button').click());
            assert.equal(await execute(panels().parse, () => document.querySelector('#panel-menu-button').getAttribute('aria-expanded')), 'true');
            await execute(panels().parse, () => document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'})));
            assert.equal(await execute(panels().parse, () => document.querySelector('#panel-menu-button').getAttribute('aria-expanded')), 'false');
            await action('parse', 'pass-through', true);
            assert(nativeCalls.get(panels().parse.id).some(call => call[0] === 'setIgnoreMouseEvents' && call[1] === true));
            await control('restore-mouse'); await control('unlock-all');
            assert.equal((await state()).panels.parse.passThrough, false);
            assert.equal(panels().parse.isResizable(), true); assert.equal(panels().parse.isMovable(), true); assert.equal(panels().parse.isFocusable(), true);
            assert.equal(nativeCalls.get(panels().parse.id).filter(call => call[0] === 'setIgnoreMouseEvents').at(-1)[1], false);
            const focusCalls = () => [...nativeCalls.values()].flat().filter(call => call[0] === 'focus').length;
            const beforeConsiderFocus = focusCalls();
            await append(['[26 MNK/SHM/BER] Fixture (Iksar) ZONE: The Castle of Mistmoore (mistmoore)', 'Your Location is 10, 20, 0', 'You slash a synthetic skeleton for 100 points of damage.', 'You healed Fixture for 50 hit points by Mend.', 'Synthetic Keeper scowls at you (Lvl: 26)', 'a synthetic skeleton hits YOU for 27 points of damage.', 'a synthetic skeleton hit YOU for 10 points of fire damage by Test Flame.', 'You have taken 5 damage from Test Venom by a synthetic skeleton.']);
            await until(async () => (await state()).snapshot.session.parse.totalDamage === 100, 'first synthetic parse');
            await until(async () => (await state()).snapshot.session.intel?.focusedNpcId, 'consider selects existing Intel source');
            assert.equal((await state()).snapshot.session.intel.npcs[0]?.name, 'Synthetic Keeper', 'smoke uses its disposable synthetic pack, not an ignored production bootstrap');
            await until(async () => execute(panels().intel, () => document.querySelector('.npc-row.is-focused')?.textContent.includes('Synthetic Charm 12')), 'consider expands all twelve normal drops through the authenticated broker');
            assert.equal(focusCalls(),beforeConsiderFocus,'a consider scrolls the Intel list without activating any OS window');
            assert.equal(await execute(panels().intel, () => Boolean(document.querySelector('#overlay').dataset.focusSequence)),true);
            const variants = await execute(panels().intel, () => ({normal:document.querySelector('[data-intel-section="normal"]').textContent,raid:document.querySelector('[data-intel-section="raid"]').textContent}));
            assert.equal(await execute(panels().intel, () => document.querySelector('[data-intel-section]')?.dataset.intelSection),'raid','Raid Zone is the first Intel section');
            assert.match(variants.normal,/Synthetic Charm 12/); assert.doesNotMatch(variants.normal,/Raid Charm/);
            assert.match(variants.raid,/Raid Charm/); assert.doesNotMatch(variants.raid,/Synthetic Charm/);
            const stickyIntel = await execute(panels().intel, () => {
                const list=document.querySelector('#intel-body'),controls=document.querySelector('.intel-controls'),tier=document.querySelector('#intel-item-tier'),filter=document.querySelector('#class-filter');
                const before=[controls,tier,filter].map(node=>node.getBoundingClientRect().top);
                list.scrollTop=list.scrollHeight;
                const after=[controls,tier,filter].map(node=>node.getBoundingClientRect().top);
                return{before,after,scroll:list.scrollTop,searchOutsideList:!list.contains(document.querySelector('#intel-search'))};
            });
            assert(stickyIntel.scroll>0&&stickyIntel.searchOutsideList,'The expanded mob list scrolls separately from its search and filters');
            assert.deepEqual(stickyIntel.after,stickyIntel.before,'Item level and My Class controls remain anchored while the mob list scrolls');
            await action('intel','font-scale',1.3);
            await until(async () => execute(panels().intel, () => getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim()==='1.3'),'Largest Intel text setting');
            const lastRowActions = await execute(panels().intel, () => {
                const list=document.querySelector('#intel-body'),controls=document.querySelector('.intel-controls'),row=[...list.querySelectorAll('.npc-row')].at(-1);
                const before=controls.getBoundingClientRect().top;
                row.querySelector('.npc-name').focus();
                const button=row.querySelector('[data-npc-action="map"]');button.focus();
                const rect=button.getBoundingClientRect(),viewport=list.getBoundingClientRect();
                return{before,after:controls.getBoundingClientRect().top,focused:document.activeElement===button,tabbable:button.tabIndex>=0,visible:getComputedStyle(button).display!=='none',fits:rect.top>=viewport.top-1&&rect.bottom<=viewport.bottom+1};
            });
            assert(lastRowActions.focused&&lastRowActions.tabbable&&lastRowActions.visible&&lastRowActions.fits,'The last mob’s wrapped Map action stays keyboard reachable inside the scroller at Largest text');
            assert.equal(lastRowActions.after,lastRowActions.before,'Revealing the last action group does not move Intel filters');
            await action('intel','font-scale',1);
            await execute(panels().intel, () => {const tier=document.querySelector('#intel-item-tier');tier.value='3';tier.dispatchEvent(new Event('input',{bubbles:true}));tier.dispatchEvent(new Event('change',{bubbles:true}));});
            await until(async () => (await state()).snapshot.session.intel.itemTier===3,'Intel item level commits to the one session owner');
            await execute(panels().intel, () => {const tier=document.querySelector('#intel-item-tier');tier.value='0';tier.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('#intel-body').scrollTop=0;});
            await until(async () => (await state()).snapshot.session.intel.itemTier===0,'Reset fixture item level to Base');
            const completeDrops = await action('intel','session:intel-drops',{npc:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false});
            assert.equal(completeDrops.total,12); assert.equal(completeDrops.items.length,12);
            const raidDrops = await action('intel','session:intel-drops',{npc:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true});
            assert.equal(raidDrops.total,2); assert(raidDrops.items.every(item => item.name.startsWith('Raid Charm')));
            await screenshot(panels().intel,'intel-expanded');
            await execute(panels().intel, () => document.querySelector('.npc-row.is-focused [data-intel-expand]').click());
            await wait(1250);
            assert.equal(await execute(panels().intel, () => document.querySelector('.npc-row.is-focused [data-intel-expand]').getAttribute('aria-expanded')),'false','manual Show Less survives repeated owner snapshots');
            await execute(panels().intel, () => document.querySelector('.npc-row.is-focused [data-intel-expand]').click());
            await until(async () => execute(panels().intel, () => document.querySelector('.npc-row.is-focused')?.textContent.includes('Synthetic Charm 12')), 'Show More reveals the complete cached list');
            await execute(panels().intel, () => {const input=document.querySelector('#intel-search');input.value='unmatched';input.dispatchEvent(new Event('input'));});
            assert.equal(await execute(panels().intel, () => document.querySelectorAll('.npc-row').length),0);
            await append(['Synthetic Keeper scowls at you (Lvl: 26)']);
            await until(async () => execute(panels().intel, () => document.querySelector('#intel-search').value === '' && Boolean(document.querySelector('.npc-row.is-focused'))),'new named consider reveals a target hidden by a local search');
            const mapData = await action('map','session:map-data',{zone:'Mistmoore Castle'});
            assert.equal(mapData.status,'ready'); assert.equal(mapData.lines.length,5); assert.equal(mapData.labels.length,1);
            await until(async () => execute(panels().map, () => document.querySelector('.native-map-note')?.textContent.includes('Default maps')),'native canvas draws local map layers');
            assert(await execute(panels().map, () => document.querySelector('canvas').width > 100 && document.querySelector('canvas').height > 100));
            assert.equal(await execute(panels().map, () => Boolean(document.querySelector('[data-map-action="fit"],[data-map-action="reload"]'))),false,'Reset replaces Fit and Reload');
            panels().map.webContents.sendInputEvent({type:'mouseMove',x:150,y:200});
            await execute(panels().map, () => document.activeElement?.blur());
            await until(async () => execute(panels().map, () => getComputedStyle(document.querySelector('.native-map-tools')).maxHeight==='0px'),'Viewing the map canvas keeps header controls collapsed');
            await execute(panels().map, () => document.querySelector('#overlay-header').focus());
            await until(async () => execute(panels().map, () => document.querySelector('.native-map-tools').getBoundingClientRect().height>30),'Keyboard focus reveals the native header controls');
            assert.equal(await execute(panels().map, () => document.querySelector('#overlay-header').tabIndex),0,'Collapsed header retains a keyboard reachable handle');
            const slice = await execute(panels().map, () => {
                const z=document.querySelector('[data-map-z]'),tolerance=document.querySelector('[data-map-tolerance]'),context=document.querySelector('canvas').getContext('2d'),arc=context.arc;
                const initialPlayerZ=Number(z.value);let count=0;context.arc=function(...args){count++;return arc.apply(this,args);};
                tolerance.value='10';tolerance.dispatchEvent(new Event('change',{bubbles:true}));
                z.value='25';count=0;z.dispatchEvent(new Event('input',{bubbles:true}));const betweenFloors=count;
                z.value='0';count=0;z.dispatchEvent(new Event('input',{bubbles:true}));const zeroFloor=count;
                z.value='50';count=0;z.dispatchEvent(new Event('input',{bubbles:true}));const upperFloor=count;
                context.arc=arc;
                return{min:Number(z.min),max:Number(z.max),initialPlayerZ,betweenFloors,zeroFloor,upperFloor,oldSelector:Boolean(document.querySelector('[data-map-floors]'))};
            });
            assert(slice.min<=0&&slice.max>=50&&!slice.oldSelector,'Z slider derives its bounds from line/NPC/player elevations');
            assert.equal(slice.initialPlayerZ,0,'Initial floor slice uses the logged player Z');
            assert.equal(slice.betweenFloors,2,'Unknown-Z NPC and player remain visible between known floors');
            assert.equal(slice.zeroFloor,3,'Explicit zero-Z NPC is visible only inside its band');assert.equal(slice.upperFloor,3,'Upper-floor NPC uses the selected elevation tolerance');
            await wait(1250);
            assert.deepEqual(await execute(panels().map,()=>({z:Number(document.querySelector('[data-map-z]').value),tolerance:Number(document.querySelector('[data-map-tolerance]').value)})),{z:50,tolerance:10},'Heartbeat snapshots preserve the selected Z and tolerance');
            await execute(panels().map, () => document.querySelector('[data-map-action="zoom-in"]').click());
            await execute(panels().map, () => document.activeElement?.blur());
            await wait(100); // Allow header collapse to resize/repaint the real canvas before targeting its text.
            const labelHit = await execute(panels().map, () => {
                const canvas=document.querySelector('canvas'),context=canvas.getContext('2d'),texts=[],markers=[];
                const fillText=context.fillText,arc=context.arc;
                // Observe the actual paint, independently of the accessibility
                // button's bounds: a decluttered marker is not a text fixture.
                context.fillText=function(text,x,y,...rest){texts.push({text,x,y,width:context.measureText(text).width});return fillText.call(this,text,x,y,...rest);};
                context.arc=function(x,y,radius,...rest){markers.push({x,y,radius});return arc.call(this,x,y,radius,...rest);};
                try{document.querySelector('[data-map-z]').dispatchEvent(new Event('input',{bubbles:true}));}
                finally{context.fillText=fillText;context.arc=arc;}
                const button=[...document.querySelectorAll('.native-map-npc-link')].find(node=>node.getAttribute('aria-label').includes('Synthetic Keeper · Raid Zone'));
                const names=texts.filter(entry=>entry.text==='Synthetic Keeper'),paint=names[0],rect=canvas.getBoundingClientRect();
                const diagnostic={texts,markers,canvas:rect.toJSON(),button:button?{id:button.dataset.mapNpc,rect:button.getBoundingClientRect().toJSON()}:null,headerExpanded:document.querySelector('.native-map-tools').getBoundingClientRect().height};
                if(names.length!==1||!button)return{...diagnostic,valid:false,reason:'Expected exactly one painted raid name and its destination button'};
                const point={x:paint.x+paint.width-2,y:paint.y+6},client={x:rect.left+point.x,y:rect.top+point.y};
                const markerDistance=Math.min(...markers.map(marker=>Math.hypot(marker.x-point.x,marker.y-point.y)));
                const element=document.elementFromPoint(client.x,client.y);
                const valid=paint.width>40&&markerDistance>12&&element===canvas;
                if(valid){
                    const event=type=>new PointerEvent(type,{clientX:client.x,clientY:client.y,pointerId:1,pointerType:'mouse',isPrimary:true,bubbles:true});
                    // Hidden native windows do not promise OS input delivery.
                    // Dispatch through the real renderer handlers. DOM events
                    // have no active native pointer to capture; capture is
                    // unrelated to this stationary name selection.
                    canvas.dispatchEvent(event('pointermove'));
                    const capture=canvas.setPointerCapture;
                    try{canvas.setPointerCapture=()=>{};canvas.dispatchEvent(event('pointerdown'));canvas.dispatchEvent(event('pointerup'));}
                    finally{canvas.setPointerCapture=capture;}
                }
                return{...diagnostic,valid,point,client,markerDistance,cursor:getComputedStyle(canvas).cursor,inlineCursor:canvas.style.cursor,element:element?{tag:element.tagName,className:element.className}:null,id:button.dataset.mapNpc};
            });
            assert(labelHit.valid&&labelHit.cursor==='pointer',`Actual placed NPC name text advertises its click target: ${JSON.stringify(labelHit)}`);
            await until(async () => (await state()).snapshot.session.map.selectedNpcId===labelHit.id,'Canvas name click selects the exact painted raid source id');
            await until(async () => execute(panels().intel, () => Boolean(document.querySelector('[data-intel-section="raid"] .npc-row.is-focused'))),'map selection focuses the raid variant in Intel');
            const accessibleTarget=await execute(panels().map, () => {const button=[...document.querySelectorAll('.native-map-npc-link')].find(node=>node.getAttribute('aria-label').startsWith('Unknown Elevation Watcher'));button.focus();const focusable=document.activeElement===button&&button.tabIndex>=0&&button.type==='button';button.click();return focusable;});
            assert(accessibleTarget,'Unknown-height destinations remain reachable as actual keyboard focusable buttons');
            await until(async () => (await state()).snapshot.session.map.selectedNpcName==='Unknown Elevation Watcher','Accessible destination activation selects unknown-height NPCs');
            await execute(panels().map, () => {const button=[...document.querySelectorAll('.native-map-npc-link')].find(node=>node.getAttribute('aria-label').includes('Synthetic Keeper · Raid Zone'));button.focus();button.click();});
            await until(async () => {const session=(await state()).snapshot.session;return session.map.selectedNpcName==='Synthetic Keeper'&&session.intel.npcs.find(npc=>npc.id===session.map.selectedNpcId)?.raidInstance;},'Accessible name button preserves the exact raid source');
            await execute(panels().map, () => {const z=document.querySelector('[data-map-z]');z.value='0';z.dispatchEvent(new Event('input',{bubbles:true}));});
            const loggedPositionBeforeFocus=(await state()).snapshot.session.map.location;
            await execute(panels().intel, () => document.querySelector('[data-intel-section="raid"] [data-npc-action="map"]').click());
            await until(async () => execute(panels().map, () => document.querySelector('[data-map-action="mode"]').textContent==='First Person'),'Intel Map requests the real native first-person mode');
            assert.equal(await execute(panels().map, () => Number(document.querySelector('[data-map-z]').value)),50,'A known-height NPC focus recenters a previously unrelated Z slice');
            assert.deepEqual((await state()).snapshot.session.map.location,loggedPositionBeforeFocus,'NPC map focus never overwrites the logged player position');
            await execute(panels().map, () => document.querySelector('[data-map-action="reset"]').click());
            await wait(1250);
            assert.deepEqual(await execute(panels().map, () => ({mode:document.querySelector('[data-map-action="mode"]').textContent,follow:document.querySelector('[data-map-action="follow"]').getAttribute('aria-pressed'),z:Number(document.querySelector('[data-map-z]').value),tolerance:Number(document.querySelector('[data-map-tolerance]').value),iframes:document.querySelectorAll('.native-map-3d-stage iframe').length})),{mode:'Map',follow:'true',z:0,tolerance:25,iframes:0},'Reset restores default Map/follow/slice and releases the lazy 3D viewer without replaying old focus');
            const modes = await execute(panels().map, () => {const button=document.querySelector('[data-map-action="mode"]'),labels=[];for(let index=0;index<3;index++){button.click();labels.push(button.textContent);}return{labels,iframes:document.querySelectorAll('.native-map-3d-stage iframe').length};});
            assert.deepEqual(modes,{labels:['Top 3D','First Person','Map'],iframes:0},'Native view cycles create/release the 3D controller; its full geometry fixture is a separate smoke');
            await execute(panels().intel, () => { document.querySelector('#intel-body').scrollTop = 0;document.querySelector('[data-intel-section="raid"] .npc-name').focus(); });
            await screenshot(panels().intel,'intel-raid');
            const beforeKillSequence=(await state()).snapshot.session.intel.focusSequence;
            const beforeKillFocus=focusCalls();
            await append(['You have slain Synthetic Keeper!']);
            await until(async () => (await state()).snapshot.session.intel.focusSequence > beforeKillSequence,'a named kill refreshes Intel attention and selection');
            await until(async () => execute(panels().intel,sequence => Number(document.querySelector('#overlay').dataset.focusSequence) > sequence,beforeKillSequence),'a named kill triggers the reduced-motion-aware visual cue');
            assert.equal(focusCalls(),beforeKillFocus,'named kill attention does not steal OS focus');
            await until(async () => execute(panels().intel, () => [...document.querySelectorAll('img.item-icon')].some(image => image.complete && image.naturalWidth > 0)), 'dataset icons remain available with restrictive overlay CSP');
            const sessionId = (await state()).snapshot.sessionId;
            await execute(owner, () => document.querySelector('[data-view="timers"]').click());
            await execute(owner, () => {
                const form = document.querySelector('#timer-settings [data-timer-editor]');
                for (const [name,value] of Object.entries({label:'Synthetic pulse',type:'text',trigger:'^SYNTHETIC PULSE (?P<who>[A-Za-z]+) (?P<seconds>[0-9]+)$',match:'regex',displayLabel:'Pulse {who}',durationSeconds:'90'})) {
                    form.elements.namedItem(name).value = value; form.elements.namedItem(name).dispatchEvent(new Event('input',{bubbles:true}));
                }
                document.querySelector('#timer-settings [data-test-line]').value = 'SYNTHETIC PULSE Keeper 90';
                document.querySelector('#timer-settings [data-timer-action="test"]').click();
            });
            await until(async () => execute(owner, () => document.querySelector('#timer-settings [data-test-result]').textContent.includes('who=Keeper')), 'isolated regex test preview supports PNUT named captures');
            await execute(owner, () => { document.querySelector('.content').scrollTop = 85; });
            await screenshot(owner, 'timers-editor');
            const draft = await execute(owner, () => document.querySelector('#timer-settings [data-timer-editor]').elements.namedItem('label').value);
            await new Promise(resolve => setTimeout(resolve, 1250));
            assert.equal(await execute(owner, () => document.querySelector('#timer-settings [data-timer-editor]').elements.namedItem('label').value), draft, 'main editor draft survives session heartbeat');
            await execute(owner, () => document.querySelector('#timer-settings [data-timer-editor]').requestSubmit());
            await until(async () => (await state()).snapshot.session.timers.definitions.length === 1, 'saved trigger in main app');
            await append(['SYNTHETIC PULSE Keeper 90', 'You crush a synthetic skeleton for 25 points of damage.']);
            await until(async () => (await state()).snapshot.session.parse.totalDamage === 125 && (await state()).snapshot.session.timers.timers.length === 1, 'timer and parse consume one shared log');
            assert.equal((await state()).snapshot.session.timers.timers[0].label,'Pulse Keeper','live regex capture is substituted into the timer label');
            await execute(owner, () => document.querySelector('#timer-settings [data-timer-tab="running"]').click());
            await execute(owner, () => {
                const form = document.querySelector('#timer-settings [data-quick-timer]');
                form.elements.namedItem('label').value = 'Manual fixture'; form.elements.namedItem('durationSeconds').value = '120'; form.requestSubmit();
            });
            await until(async () => (await state()).snapshot.session.timers.timers.length === 2, 'manual timer from main editor');
            const timerId = (await state()).snapshot.session.timers.timers.find(timer => timer.label === 'Manual fixture').id;
            await execute(owner, id => document.querySelector(`#timer-settings [data-timer-action="pause"][data-timer-id="${id}"]`).click(), timerId);
            await until(async () => (await state()).snapshot.session.timers.timers.find(timer => timer.id === timerId)?.status === 'paused', 'paused timer in main app');
            await execute(owner, id => document.querySelector(`#timer-settings [data-timer-action="resume"][data-timer-id="${id}"]`).click(), timerId);
            await until(async () => (await state()).snapshot.session.timers.timers.find(timer => timer.id === timerId)?.status === 'running', 'resumed timer in main app');
            await execute(owner, () => { document.querySelector('#timer-settings [data-timer-tab="swing"]').click(); const input = document.querySelector('#timer-settings [data-swing-delay]'); input.value = '25'; input.dispatchEvent(new Event('change', {bubbles:true})); });
            await until(async () => (await state()).snapshot.session.timers.swing.delayTenths === 25, 'swing delay edited in main app');
            await execute(owner, () => document.querySelector('#timer-settings [data-timer-action="reset-swing"]').click());
            await append(['You slash a synthetic skeleton for 5 points of damage.']);
            await until(async () => (await state()).snapshot.session.timers.swing.intervalMs === 2500, 'weapon delay swing seed');
            assert.equal((await state()).snapshot.session.parse.totalTaken, 42, 'incoming melee, spell and dot damage share Taken');
            await execute(owner, () => {
                document.querySelector('[data-view="items"]').click();
                const search=document.querySelector('#item-search');search.value='Era fixture';search.dispatchEvent(new Event('input'));
                const zone=document.querySelector('#item-current-zone');zone.checked=false;zone.dispatchEvent(new Event('change'));
                const era=document.querySelector('#era-select');era.value='Classic';era.dispatchEvent(new Event('change'));
            });
            const classicItems=await execute(owner, () => [...document.querySelectorAll('#item-list .data-card h3')].map(item=>item.textContent));
            assert.deepEqual(classicItems,['Era fixture Classic']);
            await execute(owner, () => {const era=document.querySelector('#era-select');era.value='Velious';era.dispatchEvent(new Event('change'));});
            const veliousItems=await execute(owner, () => [...document.querySelectorAll('#item-list .data-card h3')].map(item=>item.textContent));
            assert.deepEqual(veliousItems.slice().sort(),['Era fixture Classic','Era fixture Kunark','Era fixture Velious']);
            await execute(owner, () => {document.querySelector('[data-view="overview"]').click();document.querySelector('[data-view="items"]').click();});
            assert.equal(await execute(owner, () => document.querySelector('#era-select').value),'Velious','Era selection persists across full view rendering');
            assert.equal(await execute(owner, () => document.querySelectorAll('#item-list .data-card').length),3);
            assert.equal(await execute(owner, () => [...document.querySelectorAll('[data-map-mode]')].every(element=>Boolean(element.closest('[data-view-panel="map"]')))),true,'First/Top/Map controls belong only to the main Map page');
            await execute(owner, () => {const search=document.querySelector('#item-search');search.value='';search.dispatchEvent(new Event('input'));const era=document.querySelector('#era-select');era.value='Classic';era.dispatchEvent(new Event('change'));});
            for (const window of Object.values(panels())) assert.equal(await execute(window, () => Boolean(document.querySelector('form, #swing-delay, #timer-form'))), false, 'floating panels contain no timer forms or settings');
            const tabs = await execute(panels().parse, () => [...document.querySelectorAll('[data-tab]')].map(button => button.textContent.trim()));
            assert.deepEqual(tabs, ['Overview', 'Damage', 'Healing', 'Taken', 'Session']);
            await execute(panels().parse, () => document.querySelector('[data-tab="taken"]').click());
            await until(async () => execute(panels().parse, () => document.querySelector('#parse-body').textContent.includes('42')), 'Taken tab shows recorded incoming damage');
            await screenshot(panels().parse, 'taken');
            await execute(panels().parse, () => document.querySelector('[data-tab="overview"]').click());
            await screenshot(panels().parse, 'overview');
            await execute(panels().parse, () => document.querySelector('[data-tab="session"]').click());
            await screenshot(panels().parse, 'session');
            await execute(panels().parse, () => document.querySelector('[data-tab="damage"]').click());
            await execute(panels().parse, () => { const select = document.querySelector('#encounter-scope'); select.value = 'session'; select.dispatchEvent(new Event('change')); });
            await until(async () => execute(panels().parse, () => document.querySelector('#encounter-stats').textContent.includes('130') && document.querySelector('#parse-body').textContent.includes('105')), 'parse panel mirrors owner');
            const meterLayout = await execute(panels().parse, () => {
                const table = document.querySelector('.meter-table').getBoundingClientRect();
                const first = document.querySelector('.meter-table tbody tr td').getBoundingClientRect();
                const cells = [...document.querySelectorAll('.meter-table tbody tr:first-child td')].map(cell => cell.getBoundingClientRect());
                return { offset:first.left-table.left, nameWidth:first.width, tableWidth:table.width, overflow:cells.some(cell => cell.right > table.right+1) };
            });
            assert(meterLayout.offset < 5 && meterLayout.nameWidth > meterLayout.tableWidth * .35 && !meterLayout.overflow, 'meter names have a real first column without phantom cells or clipped numeric columns');
            await until(async () => execute(panels().timers, () => document.querySelector('#swing-body').textContent.includes('2.5s')), 'swing renderer reflects seed');
            await execute(owner, () => { document.querySelector('[data-view="settings"]').click(); document.querySelector('#overlay-controller').scrollIntoView({block:'center'}); });
            assert.equal(await execute(owner, () => document.querySelector('[data-view-panel="settings"]').classList.contains('is-active')), true);
            await screenshot(owner, 'main-controller');
            // Tour/README media uses the real update presenter with a clearly
            // synthetic metadata offer. No download or installer is invoked.
            await execute(owner, async () => {
                const { mountAppUpdates } = await import('/app-update-ui.js');
                window.__tourUpdatePresenter = mountAppUpdates({ bridge:{ getStatus:async () => ({
                    supported:true, status:'available', availableVersion:'0.8.6',
                    releaseUrl:'https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.6'
                }) } });
                await window.__tourUpdatePresenter.refresh();
                [...document.querySelectorAll('.settings-grid h2')].find(heading => heading.textContent === 'Window')
                    .closest('article').scrollIntoView({ block:'start' });
            });
            await screenshot(owner, 'workspace');
            await execute(owner, () => { window.__tourUpdatePresenter.dispose(); delete window.__tourUpdatePresenter; });
            await execute(owner, () => document.querySelector('[data-view="timers"]').click());
            await screenshot(owner, 'main-timers');
            for (const [name, window] of Object.entries(panels())) {
                if(name==='map')await execute(window, () => document.querySelector('#overlay-header').focus());
                if(name==='intel')await execute(window, () => {document.querySelector('#intel-body').scrollTop=0;document.querySelector('[data-intel-section="raid"] .npc-name').focus();});
                await screenshot(window, name);
            }
            assert(panels().timers.getBounds().height <= 120, 'timer native window fits compact display rows');
            const parseId = panels().parse.id;
            await panels().parse.webContents.reload();
            await until(async () => execute(panels().parse, () => Boolean(document.querySelector('#encounter-stats')?.textContent.includes('130'))).catch(() => false), 'reload same panel');
            assert.equal(panels().parse.id, parseId);
            assert.equal((await state()).snapshot.session.parse.totalDamage, 130, 'panel reload cannot reset or double-count');
            panels().intel.destroy();
            await control('show', 'intel');
            await until(async () => panels().intel && execute(panels().intel, () => Boolean(document.querySelector('#intel-body'))).catch(() => false), 'recreate destroyed panel');
            assert.equal((await state()).snapshot.sessionId, sessionId);
            owner.close();
            assert.equal(owner.isDestroyed(), false, 'closing main app with visible overlays keeps the one session owner');
            assert.equal(owner.isVisible(), false);
            const before = (await state()).snapshot.session.timers.timers[0].remainingMs;
            await append(['You slash a synthetic skeleton for 10 points of damage.', 'SYNTHETIC PULSE Keeper 90']);
            await until(async () => (await state()).snapshot.session.parse.totalDamage === 140, 'hidden owner continues log parsing');
            const after = await state();
            assert.equal(after.snapshot.sessionId, sessionId);
            assert.equal(after.snapshot.session.timers.timers.filter(timer => timer.label === 'Pulse Keeper').length, 1, 'repeated regex trigger replaces instead of duplicating');
            assert(after.snapshot.session.timers.timers.find(timer => timer.label === 'Manual fixture').remainingMs < 120000, 'hidden owner timers continue');
            assert(before > 0);
            return { ok:true, windows:ids.length, damage:after.snapshot.session.parse.totalDamage, timers:after.snapshot.session.timers.timers.length, sharedSession:true, screenshots };
        };
        let started = false;
        app.on('browser-window-created', () => { if (!started) { started = true; void inspect().then(result => { console.log('EOZ_NATIVE_OVERLAY_SMOKE=' + JSON.stringify(result)); app.exit(0); }).catch(error => { console.error(error.stack); app.exit(1); }); } });
        setTimeout(() => { console.error('Native overlay smoke exceeded 45 seconds.'); app.exit(2); }, 45000).unref();
        require(path.join(root, 'desktop/main.cjs'));
    };
    await writeFile(join(temporary, 'main.cjs'), `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(profile)});\n(${run.toString()})(${JSON.stringify({root, log, screenshots})}).catch(error => { console.error(error.stack); app.exit(1); });\n`);
    const result = await new Promise((resolve, reject) => {
        const child = spawn(electron, [temporary, '--disable-gpu', '--mute-audio'], { windowsHide:true, stdio:['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
        child.once('error', reject); child.once('exit', code => resolve({code, output}));
    });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /EOZ_NATIVE_OVERLAY_SMOKE=.*"ok":true/);
    console.log(result.output.match(/EOZ_NATIVE_OVERLAY_SMOKE=.*/)[0]);
    console.log('Actual Electron native overlay smoke passed: four isolated windows, CSP/API and storage isolation, layout lock/mouse recovery, shared log and timers, reload/recreate, hidden owner. Physical game compositing and OS scaling are not tested.');
} finally {
    if (dirname(temporary) !== resolve(tmpdir()) || !basename(temporary).startsWith('eoz-native-overlay-smoke-')) throw new Error('Unexpected native-overlay smoke cleanup path');
    await rm(temporary, { recursive:true, force:true });
}
