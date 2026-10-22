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
    const linux = process.platform === 'linux';
    const game = linux ? join(temporary,'compatdata','fixture','pfx','drive_c','EverQuest Legends') : join(temporary, 'synthetic-game');
    const logDirectory=linux?'logs':'Logs',mapDirectory=linux?'mApS':'Maps';
    const log = join(game, logDirectory, 'eqlog_Fixture_Test.txt');
    await mkdir(profile); await mkdir(join(game, logDirectory), { recursive:true }); await mkdir(join(game, mapDirectory)); await mkdir(screenshots, { recursive:true });
    await writeFile(join(game,mapDirectory,linux?'MiStMoOrE.TxT':'mistmoore.txt'),'L -100,-100,0,100,-100,0,150,160,180\nL 100,-100,0,100,100,0,150,160,180\nL 100,100,0,-100,100,0,150,160,180\nL -100,100,0,-100,-100,0,150,160,180\nP -20,-10,0,216,183,92,2,Synthetic_Keeper\n');
    await writeFile(join(game,mapDirectory,linux?'MISTMOORE_1.TXT':'mistmoore_1.txt'),'L -50,-50,50,50,50,50,200,100,110\n');
    await mkdir(join(profile, 'data'));
    // Keep the smoke independent of the ignored production bootstrap and
    // network access. This tiny presentation pack exists only in this profile.
    await writeFile(join(profile, 'data', 'eye-of-zomm-pack.json'), JSON.stringify({
        meta:{ schemaVersion:3, version:'native-overlay-synthetic', currentEra:'Classic', sample:true },
        zones:[{ name:'Mistmoore Castle', viewerName:'Mistmoore Castle', aliases:['mistmoore', 'The Castle of Mistmoore'] }],
        npcs:[...[false,true].map(raidInstance => ({name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance,avgLevel:26,levelMin:26,levelMax:26,era:'Classic',loc:raidInstance ? [30,20,50] : [10,20,0]})),{name:'Unknown Elevation Watcher',zone:'Mistmoore Castle',avgLevel:30,levelMin:30,levelMax:30,era:'Classic',loc:[60,40]}],
        items:[...Array.from({length:12},(_,index) => ({name:`Synthetic Charm ${index + 1}`,era:'Classic',classes:['MNK','SHM','BER'],slots:['NECK'],stats:{HP:index + 1},iconId:'fixture',dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false},...(index===0 ? [{name:'Unknown Elevation Watcher',zone:'Mistmoore Castle',raidInstance:false}] : [])]})),
            ...Array.from({length:2},(_,index) => ({name:`Raid Charm ${index + 1}`,era:'Classic',classes:['MNK','SHM','BER'],slots:['NECK'],stats:index ? {HP:51} : {HP:50,...Object.fromEntries(Array.from({length:23},(_,stat)=>[`FIXTURE_STAT_${stat}`,stat+1]))},displayLines:index ? [] : Array.from({length:12},(_,line)=>`Synthetic display line ${line+1}: detailed item restrictions for the scrollable stat-block fixture.`),notes:index ? '' : 'Synthetic long item note. '.repeat(45),iconId:'fixture',dropSources:[{name:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true}]})),
            {name:'Synthetic Wayfarer Ring',era:'Classic',classes:['MNK','SHM','BER'],slots:['FINGER'],stats:{HP:2},dropSources:[{name:'Unknown Elevation Watcher',zone:'Mistmoore Castle'}]},
            ...['Classic','Kunark','Velious'].map(era => ({name:`Era fixture ${era}`,era,classes:['MNK','SHM','BER'],slots:['FINGER'],stats:{HP:1},dropSources:[]}))],
        icons:{ fixture:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAATklEQVR4nGNgGAWjgObg6saw//gwTQwl2zJcGjkEpLFikiwixlBi5LBaQo5riVFHtAWkBN3gtIDiIKJ5JNMlmRJj0YDkarIMHQWjgCQAAOw009RU8GzvAAAAAElFTkSuQmCC' }
    }));
    // A nonempty initial tail establishes the cursor before live fixture lines
    // arrive; initial/backfill reads must not trigger transient timers/considers.
    await writeFile(log, `[${new Date().toISOString()}] Synthetic overlay smoke begins.\n`);
    await writeFile(join(profile, 'eye-of-zomm-config.json'), JSON.stringify({ eqRootPath:game, logPath:linux?'':log, logSelection:linux?'automatic':'manual' }));
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    await writeFile(join(temporary, 'package.json'), JSON.stringify({ name:'eoz-native-overlay-smoke', version:pkg.version, main:'main.cjs' }));
    const run = async ({ root, log, screenshots, fixtureUpdateVersion }) => {
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
        const showNativeInactive=BrowserWindow.prototype.showInactive;
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
            if(process.platform==='linux'&&process.env.DISPLAY)assert.equal(app.commandLine.getSwitchValue('ozone-platform'),'x11','Linux overlay smoke uses the production X11/XWayland preference');
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
            assert.equal(panels().parse.isResizable(), false);
            assert.equal(nativeCalls.get(panels().parse.id).filter(call => call[0] === 'setMovable').at(-1)[1],false);
            // Electron's Linux isMovable() always returns true; ordinary drag
            // locking there is enforced by the renderer's no-drag region.
            assert.equal(panels().parse.isMovable(),process.platform === 'linux');
            if(process.platform !== 'linux')assert.equal(panels().parse.isFocusable(),true);
            await until(async () => execute(panels().parse, () => document.querySelector('#overlay').classList.contains('is-locked')), 'locked drag CSS');
            assert.equal(await execute(panels().parse,()=>getComputedStyle(document.querySelector('#overlay-header')).webkitAppRegion),'no-drag');
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
            assert.equal(panels().parse.isResizable(), true); assert.equal(panels().parse.isMovable(), true);
            assert.equal(nativeCalls.get(panels().parse.id).filter(call => call[0] === 'setMovable').at(-1)[1],true);
            if(process.platform !== 'linux')assert.equal(panels().parse.isFocusable(),true);
            await until(async()=>execute(panels().parse,()=>getComputedStyle(document.querySelector('#overlay-header')).webkitAppRegion==='drag'),'unlocked native header drag region');
            assert.equal(nativeCalls.get(panels().parse.id).filter(call => call[0] === 'setIgnoreMouseEvents').at(-1)[1], false);
            const focusCalls = () => [...nativeCalls.values()].flat().filter(call => call[0] === 'focus').length;
            const beforeConsiderFocus = focusCalls();
            await append(['[26 MNK/SHM/BER] Fixture (Iksar) ZONE: The Castle of Mistmoore (mistmoore)', 'Your Location is 10, 20, 0', 'You slash a synthetic skeleton for 100 points of damage.', 'You healed Fixture for 50 hit points by Mend.', 'You gain a rune for 500 points of absorption.', 'Synthetic Keeper scowls at you (Lvl: 26)', 'a synthetic skeleton hits YOU for 27 points of damage.', 'a synthetic skeleton hit YOU for 10 points of fire damage by Test Flame.', 'You have taken 5 damage from Test Venom by a synthetic skeleton.']);
            await until(async () => (await state()).snapshot.session.parse.totalDamage === 100, 'first synthetic parse');
            await until(async () => execute(panels().parse, () => /Rune capacity granted[\s\S]*500/.test(document.querySelector('#parse-body').textContent)), 'Healing tab shows rune capacity granted');
            assert.equal((await state()).snapshot.session.parse.totalHealing,50,'Rune capacity remains separate from actual healing');
            await until(async () => (await state()).snapshot.session.intel?.focusedNpcId, 'consider selects existing Intel source');
            assert.equal((await state()).snapshot.session.intel.npcs[0]?.name, 'Synthetic Keeper', 'smoke uses its disposable synthetic pack, not an ignored production bootstrap');
            await until(async () => execute(panels().intel, () => document.querySelector('.npc-row.is-focused')?.textContent.includes('Synthetic Charm 12')), 'consider expands all twelve normal drops through the authenticated broker');
            assert.equal(focusCalls(),beforeConsiderFocus,'a consider scrolls the Intel list without activating any OS window');
            assert.equal(await execute(panels().intel, () => Boolean(document.querySelector('#overlay').dataset.focusSequence)),true);
            const variants = await execute(panels().intel, () => ({normal:document.querySelector('[data-intel-section="normal"]').textContent,raid:document.querySelector('[data-intel-section="raid"]').textContent}));
            assert.equal(await execute(panels().intel, () => document.querySelector('[data-intel-section]')?.dataset.intelSection),'raid','Raid Zone is the first Intel section');
            assert.match(variants.normal,/Synthetic Charm 12/); assert.doesNotMatch(variants.normal,/Raid Charm/);
            assert.match(variants.raid,/Raid Charm/); assert.doesNotMatch(variants.raid,/Synthetic Charm/);
            const intelPointerPath = await execute(panels().intel, () => {
                const summary=document.querySelector('[data-intel-section="raid"] .npc-summary'),name=summary.querySelector('.npc-name'),metadata=summary.querySelector('.npc-meta'),map=summary.querySelector('[data-npc-action="map"]'),outside=document.querySelector('.intel-controls');
                const point=(node,type,relatedTarget)=>node.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'mouse',relatedTarget}));
                const open=()=>getComputedStyle(summary.querySelector('.row-actions')).display!=='none';
                document.activeElement?.blur();point(summary,'pointerout',outside);
                // Hidden native windows exercise the actual delegated pointer
                // handlers without assuming foreground OS mouse delivery.
                point(metadata,'pointerover',outside);const metadataOnly=open();
                point(name,'pointerover',metadata);const nameEntered=open();
                point(name,'pointerout',metadata);point(metadata,'pointerover',name);const nameToMetadata=open();
                point(metadata,'pointerout',map);point(map,'pointerover',metadata);const metadataToAction=open();
                point(map,'pointerout',outside);const leftSummary=open();
                name.focus();const keyboardFocus=open();name.blur();const focusLeft=open();
                return{metadataOnly,nameEntered,nameToMetadata,metadataToAction,leftSummary,keyboardFocus,focusLeft};
            });
            assert.deepEqual(intelPointerPath,{metadataOnly:false,nameEntered:true,nameToMetadata:true,metadataToAction:true,leftSummary:false,keyboardFocus:true,focusLeft:false},'Only the actual NPC name arms pointer actions; its metadata/buttons retain them until the pointer leaves, and keyboard focus remains supported');
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
            assert(lastRowActions.focused&&lastRowActions.tabbable&&lastRowActions.visible&&lastRowActions.fits,'The last mob’s same-row Map action stays keyboard reachable inside the scroller at Largest text');
            assert.equal(lastRowActions.after,lastRowActions.before,'Revealing the last action group does not move Intel filters');
            await action('intel','font-scale',1);
            await execute(panels().intel, () => {const tier=document.querySelector('#intel-item-tier');tier.value='3';tier.dispatchEvent(new Event('input',{bubbles:true}));tier.dispatchEvent(new Event('change',{bubbles:true}));});
            await until(async () => (await state()).snapshot.session.intel.itemTier===3,'Intel item level commits to the one session owner');
            await execute(panels().intel, () => document.querySelector('[data-intel-section-toggle="raid"]').click());
            assert.equal(await execute(panels().intel, () => document.querySelector('#intel-section-raid').hidden),true,'Raid Zone header collapses its complete content');
            await execute(panels().intel, () => {const tier=document.querySelector('#intel-item-tier');tier.value='7';tier.dispatchEvent(new Event('input',{bubbles:true}));tier.dispatchEvent(new Event('change',{bubbles:true}));});
            await until(async () => (await state()).snapshot.session.intel.itemTier===7,'Tier 7 reproducer reaches the owner');
            await wait(1250);
            const raidDisclosure=await execute(panels().intel, () => {const button=document.querySelector('[data-intel-section-toggle="raid"]'),search=document.querySelector('#intel-search');search.value='Keeper';search.dispatchEvent(new Event('input'));return{hidden:document.querySelector('#intel-section-raid').hidden,expanded:button.getAttribute('aria-expanded'),label:button.textContent};});
            assert(raidDisclosure.hidden&&raidDisclosure.expanded==='false'&&raidDisclosure.label.includes('collapsed'),'Raid disclosure survives tier changes, heartbeats and search and visibly announces collapse');
            await screenshot(panels().intel,'intel-raid-collapsed');
            await execute(panels().intel, () => {const search=document.querySelector('#intel-search');search.value='';search.dispatchEvent(new Event('input'));document.querySelector('[data-intel-section-toggle="raid"]').click();});
            const intelWindow=panels().intel,intelOriginalBounds=intelWindow.getBounds();
            const inactiveFocus=await execute(intelWindow,()=>{
                const events=[],record=event=>events.push({type:event.type,action:event.target.dataset?.npcAction||'',trusted:event.isTrusted});
                for(const type of ['focus','focusin'])document.addEventListener(type,record,true);
                const name=document.querySelector('.npc-name');name.focus();const map=name.closest('.npc-summary').querySelector('[data-npc-action="map"]');map.focus();
                const result={hasFocus:document.hasFocus(),activeAction:document.activeElement?.dataset?.npcAction||'',events};
                map.blur();for(const type of ['focus','focusin'])document.removeEventListener(type,record,true);return result;
            });
            console.log('EOZ_INTEL_INACTIVE_FOCUS='+JSON.stringify(inactiveFocus));
            // activeElement alone is insufficient in a hidden native window:
            // native focus/focusin delivery requires an active document. Use
            // the same explicit isolated-window activation as the Map Tab test.
            showNativeInactive.call(intelWindow);intelWindow.focus();
            await until(async()=>execute(intelWindow,()=>document.hasFocus()),'Native Intel keyboard geometry uses the active CI document');
            for(const width of [260,520])for(const fontScale of [1,1.3]){
                intelWindow.setSize(width,intelOriginalBounds.height);await action('intel','font-scale',fontScale);
                await until(async()=>execute(intelWindow,fontScale=>Number(getComputedStyle(document.documentElement).getPropertyValue('--font-scale'))===fontScale,fontScale),'Intel text scale settles');
                const enabledActions=await execute(intelWindow,()=>{
                    const list=document.querySelector('#intel-body'),summary=list.querySelector('.npc-summary'),name=summary.querySelector('.npc-name'),actions=summary.querySelector('.row-actions'),outside=document.querySelector('.intel-controls');
                    document.activeElement?.blur();summary.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:outside}));
                    summary.scrollIntoView({block:'nearest',inline:'nearest'});
                    const measure=()=>({height:list.scrollHeight,summary:summary.getBoundingClientRect().toJSON(),heading:summary.querySelector('.npc-heading').getBoundingClientRect().toJSON(),drops:summary.nextElementSibling.getBoundingClientRect().toJSON()});
                    const before=measure();name.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));const after=measure(),bar=actions.getBoundingClientRect().toJSON();
                    name.focus();window.__intelGeometry={before,after,bar};
                    return[...actions.querySelectorAll('[data-npc-action]:not(:disabled)')].map(button=>button.dataset.npcAction);
                });
                for(const action of enabledActions){
                    intelWindow.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});intelWindow.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
                    await until(async()=>execute(intelWindow,action=>document.activeElement?.dataset?.npcAction===action,action),`Native Tab reaches ${action}`);
                }
                const geometry=await execute(intelWindow,()=>{
                    const map=document.activeElement,actions=map.closest('.row-actions');
                    return{...window.__intelGeometry,button:map.getBoundingClientRect().toJSON(),strip:actions.getBoundingClientRect().toJSON(),scroll:{scrollLeft:actions.scrollLeft,scrollWidth:actions.scrollWidth,clientWidth:actions.clientWidth,clientLeft:actions.clientLeft},hasFocus:document.hasFocus(),display:getComputedStyle(actions).display,position:getComputedStyle(actions).position,focused:map.dataset.npcAction==='map'};
                });
                for(const action of enabledActions.slice(0,-1).reverse()){
                    intelWindow.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab',modifiers:['shift']});intelWindow.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab',modifiers:['shift']});
                    await until(async()=>execute(intelWindow,action=>document.activeElement?.dataset?.npcAction===action,action),`Native Shift+Tab returns to ${action}`);
                }
                geometry.first=await execute(intelWindow,()=>document.activeElement.getBoundingClientRect().toJSON());
                const detail=JSON.stringify({width,fontScale,...geometry});
                assert(geometry.hasFocus,`Native keyboard geometry must receive real document focus: ${detail}`);
                assert.equal(geometry.position,'absolute',`Actions overlay the mob-name row: ${detail}`);
                assert.deepEqual(geometry.before,geometry.after,`Tier 7 hover never changes list height, mob geometry or drop position: ${detail}`);
                assert(geometry.bar.top>=geometry.after.heading.top-1&&geometry.bar.bottom<=geometry.after.heading.bottom+1,`Action strip stays inside the original name row: ${detail}`);
                assert(geometry.focused&&geometry.button.left>=geometry.strip.left-1&&geometry.button.right<=geometry.strip.right+1,`The last action scrolls horizontally into keyboard view at narrow widths: ${detail}`);
                assert(geometry.button.top>=geometry.strip.top&&geometry.button.bottom<=geometry.strip.bottom,`The final action has full vertical clearance without a scrollbar consuming its row: ${detail}`);
                assert(geometry.first.left>=geometry.strip.left&&geometry.first.right<=geometry.strip.right,`Returning keyboard focus to Details fully reveals the beginning of the same strip: ${detail}`);
            }
            intelWindow.setBounds(intelOriginalBounds);await action('intel','font-scale',1);
            const tooltipHover=await execute(intelWindow,async()=>{
                const list=document.querySelector('#intel-body');list.scrollTop=0;document.activeElement?.blur();
                const tooltip=document.querySelector('#intel-item-tooltip'),picture=list.querySelector('.item-icon-button'),name=picture.closest('.item-heading').querySelector('.item-name');
                const hover=target=>{const rect=target.getBoundingClientRect();target.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse',clientX:rect.left+2,clientY:rect.top+2}));const bounds=tooltip.getBoundingClientRect();return{visible:!tooltip.hidden,text:tooltip.textContent,fits:bounds.left>=0&&bounds.right<=innerWidth&&bounds.top>=0&&bounds.bottom<=innerHeight};};
                const icon=hover(picture);picture.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:name}));const text=hover(name);
                name.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:list}));tooltip.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,relatedTarget:list}));
                await new Promise(resolve=>setTimeout(resolve,220));const crossedGap=!tooltip.hidden;
                const overflow=getComputedStyle(tooltip).overflowY,scrollable=tooltip.scrollHeight>tooltip.clientHeight;
                tooltip.scrollTop=tooltip.scrollHeight;const scrolled=tooltip.scrollTop>0,note=tooltip.querySelector('.intel-tooltip-note').getBoundingClientRect(),box=tooltip.getBoundingClientRect(),endVisible=note.bottom<=box.bottom+1;
                tooltip.dispatchEvent(new PointerEvent('pointerout',{bubbles:true,relatedTarget:list}));await new Promise(resolve=>setTimeout(resolve,220));const leftHidden=tooltip.hidden;
                // Live snapshots can replace the row during the two dismissal
                // waits. Exercise keyboard input on the current rendered item.
                const keyboardName=list.querySelector('.item-name');
                keyboardName.focus();const keyboard=!tooltip.hidden&&document.activeElement===keyboardName;tooltip.scrollTop=0;keyboardName.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,key:'PageDown',cancelable:true}));const keyboardScrolled=tooltip.scrollTop>0;
                keyboardName.blur();await new Promise(resolve=>setTimeout(resolve,220));return{icon,text,crossedGap,overflow,scrollable,scrolled,endVisible,leftHidden,keyboard,keyboardScrolled,blurHidden:tooltip.hidden};
            });
            assert(tooltipHover.icon.visible&&tooltipHover.text.visible&&tooltipHover.icon.fits&&tooltipHover.text.fits&&tooltipHover.keyboard&&tooltipHover.leftHidden&&tooltipHover.blurHidden,`Both item pictures/names reveal bounded stat blocks and dismiss on exit: ${JSON.stringify(tooltipHover)}`);
            assert(tooltipHover.crossedGap&&tooltipHover.overflow==='auto'&&tooltipHover.scrollable&&tooltipHover.scrolled&&tooltipHover.endVisible&&tooltipHover.keyboardScrolled,`Tall real stat-block markup remains fully readable by mouse and keyboard inside the native viewport: ${JSON.stringify(tooltipHover)}`);
            assert.match(tooltipHover.text.text,/Tier 7[\s\S]*HP[\s\S]*\(/,'Tier-adjusted stat blocks include base values');
            await execute(intelWindow,()=>document.querySelector('.item-name').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse',clientX:70,clientY:150})));
            await action('intel','session:item-tier',{tier:0});
            await until(async()=>execute(intelWindow,()=>{const tooltip=document.querySelector('#intel-item-tooltip');return !tooltip.hidden&&tooltip.querySelector('.intel-tooltip-title>span')?.textContent==='Base';}),'An already hovered item stat block updates to the latest tier without a new hover');
            await screenshot(intelWindow,'intel-item-stats');
            await execute(intelWindow,()=>{document.querySelector('[data-intel-section-toggle="raid"]').click();});
            await action('map','session:select-npc',{npc:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:true});
            await until(async()=>execute(intelWindow,()=>!document.querySelector('#intel-section-raid').hidden&&Boolean(document.querySelector('[data-intel-section="raid"] .npc-row.is-focused'))),'Fresh mob focus reopens a collapsed Raid Zone');
            await action('map','session:select-npc',{npc:'Synthetic Keeper',zone:'Mistmoore Castle',raidInstance:false});
            await until(async()=>execute(intelWindow,()=>Boolean(document.querySelector('[data-intel-section="normal"] .npc-row.is-focused'))),'Restore normal fixture focus');
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
            intelWindow.hide();
            const mapData = await action('map','session:map-data',{zone:'Mistmoore Castle'});
            assert.equal(mapData.status,'ready'); assert.equal(mapData.lines.length,5); assert.equal(mapData.labels.length,1);
            await until(async () => execute(panels().map, () => document.querySelector('.native-map-note')?.textContent.includes('Default maps')),'native canvas draws local map layers');
            assert(await execute(panels().map, () => document.querySelector('canvas').width > 100 && document.querySelector('canvas').height > 100));
            assert.equal(await execute(panels().map, () => Boolean(document.querySelector('[data-map-action="fit"],[data-map-action="reload"]'))),false,'Reset replaces Fit and Reload');
            const mapWindow=panels().map,mapBoundsBeforeHeader=mapWindow.getBounds(),headerHoverCases=[];
            // A DOM focus-only test missed Windows' native drag-region hover
            // interception. Briefly show just this window without activation,
            // then require acknowledged, trusted Electron mouse input over the
            // actual zone title in both layout-lock states and window sizes.
            showNativeInactive.call(mapWindow);
            assert(mapWindow.isVisible(),'The header regression uses a real visible, nonactivating native Map window');
            await execute(mapWindow, () => {
                window.__eozHeaderPointer=[];
                window.__eozHeaderPointerListener=event=>window.__eozHeaderPointer.push({type:event.type,key:event.key||'',id:event.target.id,action:event.target.dataset?.mapAction||'',trusted:event.isTrusted});
                // Toolbar clicks intentionally stop bubbling. Observe native
                // delivery in capture phase without changing that behavior.
                for(const type of ['pointerover','click','keydown'])document.addEventListener(type,window.__eozHeaderPointerListener,true);
            });
            try{
                for(const width of [260,460])for(const locked of [false,true]){
                    await action('map','lock',false);mapWindow.setSize(width,mapBoundsBeforeHeader.height);await action('map','lock',locked);
                    await until(async () => execute(mapWindow,locked=>document.querySelector('#overlay').classList.contains('is-locked')===locked,locked),'Map layout lock reaches the native renderer');
                    assert.equal(nativeCalls.get(mapWindow.id).filter(call=>call[0]==='setMovable').at(-1)[1],!locked,'Layout lock reaches the native host');
                    assert.equal(mapWindow.isMovable(),process.platform==='linux'||!locked,'Electron Linux keeps its movable capability while the app locks its drag grip');
                    const outside=await execute(mapWindow,()=>{document.activeElement?.blur();const rect=document.querySelector('canvas').getBoundingClientRect();return{x:Math.round(rect.left+rect.width/2),y:Math.round(rect.bottom-30)};});
                    mapWindow.webContents.sendInputEvent({type:'mouseMove',...outside});
                    await until(async () => execute(mapWindow,()=>getComputedStyle(document.querySelector('.native-map-tools')).visibility==='hidden'),'Leaving the full header band collapses primary controls');
                    const titlePoint=await execute(mapWindow,()=>{window.__eozHeaderPointer=[];const rect=document.querySelector('#overlay-title').getBoundingClientRect();return{x:Math.round(rect.left+6),y:Math.round(rect.top+rect.height/2)};});
                    mapWindow.webContents.sendInputEvent({type:'mouseMove',...titlePoint});
                    await until(async () => execute(mapWindow,()=>window.__eozHeaderPointer.some(event=>event.id==='overlay-title'&&event.trusted)&&getComputedStyle(document.querySelector('.native-map-tools')).visibility==='visible'),`Trusted title hover reveals controls at ${width}px, locked=${locked}`);
                    const geometry=await execute(mapWindow,()=>{
                        const header=document.querySelector('#overlay-header'),title=document.querySelector('#overlay-title'),tools=document.querySelector('.native-map-tools'),grip=document.querySelector('.native-map-drag-grip'),menu=document.querySelector('.hover-menu');
                        const band=header.getBoundingClientRect(),name=title.getBoundingClientRect(),buttons=[...tools.querySelectorAll('button')].map(button=>({action:button.dataset.mapAction,...button.getBoundingClientRect().toJSON()}));
                        return{band:band.toJSON(),title:name.toJSON(),tools:tools.getBoundingClientRect().toJSON(),menu:menu.getBoundingClientRect().toJSON(),buttons,titleRegion:getComputedStyle(title).webkitAppRegion,headerRegion:getComputedStyle(header).webkitAppRegion,gripRegion:getComputedStyle(grip).webkitAppRegion,ack:window.__eozHeaderPointer};
                    });
                    const details=JSON.stringify({width,locked,...geometry});
                    assert(geometry.band.height>=36&&geometry.title.height>=36&&geometry.title.width>=28,`The full title band remains a usable hover target: ${details}`);
                    assert.equal(geometry.headerRegion,'no-drag',`Header hover must reach Chromium: ${details}`);assert.equal(geometry.titleRegion,'no-drag',`Zone title must not be a native drag region: ${details}`);
                    assert.equal(geometry.gripRegion,locked?'no-drag':'drag',`Only the unlocked grip owns native dragging: ${details}`);
                    assert(geometry.buttons.every(button=>button.top>=geometry.title.top&&button.bottom<=geometry.title.bottom&&button.right<=geometry.menu.left+1),`Title and every primary control share one unclipped row: ${details}`);
                    const last=geometry.buttons.at(-1),controlPoint={x:Math.round(last.left+last.width/2),y:Math.round(last.top+last.height/2)};
                    mapWindow.webContents.sendInputEvent({type:'mouseMove',...controlPoint});
                    await until(async () => execute(mapWindow,()=>window.__eozHeaderPointer.some(event=>event.action==='mode'&&event.trusted)&&getComputedStyle(document.querySelector('.native-map-tools')).visibility==='visible'),'Pointer can traverse from title to its same-row controls');
                    const follow=geometry.buttons.find(button=>button.action==='follow'),followPoint={x:Math.round(follow.left+follow.width/2),y:Math.round(follow.top+follow.height/2)};
                    mapWindow.webContents.sendInputEvent({type:'mouseMove',...followPoint});
                    const followBefore=await execute(mapWindow,()=>document.querySelector('[data-map-action="follow"]').getAttribute('aria-pressed'));
                    for(let click=0;click<2;click++){
                        mapWindow.webContents.sendInputEvent({type:'mouseDown',...followPoint,button:'left',clickCount:1});
                        mapWindow.webContents.sendInputEvent({type:'mouseUp',...followPoint,button:'left',clickCount:1});
                        const expectedFollow=click===0?String(followBefore!=='true'):followBefore;
                        let clickDiagnostic;
                        try{
                            await until(async () => {
                                clickDiagnostic=await execute(mapWindow,point=>{
                                    const button=document.querySelector('[data-map-action="follow"]'),target=document.elementFromPoint(point.x,point.y);
                                    return{events:window.__eozHeaderPointer,clicks:window.__eozHeaderPointer.filter(event=>event.type==='click'&&event.action==='follow'&&event.trusted).length,
                                        pressed:button.getAttribute('aria-pressed'),button:button.getBoundingClientRect().toJSON(),visibility:getComputedStyle(document.querySelector('.native-map-tools')).visibility,
                                        target:target?{tag:target.tagName,action:target.dataset?.mapAction||'',region:getComputedStyle(target).webkitAppRegion}:null};
                                },followPoint);
                                return clickDiagnostic.clicks>=click+1&&clickDiagnostic.pressed===expectedFollow;
                            },'Trusted primary control click toggles Follow without becoming a drag');
                        }catch(error){throw new Error(`${error.message}: ${JSON.stringify({width,locked,click:click+1,followPoint,expectedFollow,...clickDiagnostic})}`);}
                    }
                    mapWindow.webContents.sendInputEvent({type:'mouseMove',...outside});
                    assert.equal(await execute(mapWindow,()=>getComputedStyle(document.querySelector('.native-map-tools')).visibility),'visible','A short exit grace prevents accidental collapse while traversing controls');
                    await until(async () => execute(mapWindow,()=>getComputedStyle(document.querySelector('.native-map-tools')).visibility==='hidden'),'A mouse-clicked primary control does not pin the header after pointer exit');
                    headerHoverCases.push({width,locked,titleHover:true,sameRow:true,nativeDragGrip:true});
                }
                // This one keyboard case intentionally activates the isolated
                // CI window. Pointer cases above used showInactive throughout.
                mapWindow.focus();
                await execute(mapWindow,()=>{window.__eozBodyTabindex=document.body.getAttribute('tabindex');document.body.tabIndex=-1;document.body.focus();});
                mapWindow.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});mapWindow.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});
                await until(async () => execute(mapWindow,()=>window.__eozHeaderPointer.some(event=>event.type==='keydown'&&event.key==='Tab'&&event.trusted)&&document.activeElement.id==='overlay-header'&&document.activeElement.matches(':focus-visible')&&getComputedStyle(document.querySelector('.native-map-tools')).visibility==='visible'),'Real Tab focus reveals controls and retains them while the pointer is outside the header');
                await execute(mapWindow,()=>{if(window.__eozBodyTabindex===null)document.body.removeAttribute('tabindex');else document.body.setAttribute('tabindex',window.__eozBodyTabindex);delete window.__eozBodyTabindex;});
            }finally{
                await execute(mapWindow,()=>{for(const type of ['pointerover','click','keydown'])document.removeEventListener(type,window.__eozHeaderPointerListener,true);delete window.__eozHeaderPointerListener;delete window.__eozHeaderPointer;});
                await action('map','lock',false);mapWindow.setBounds(mapBoundsBeforeHeader);mapWindow.hide();
            }
            assert.equal(headerHoverCases.length,4,'Native header input covers narrow/normal windows, each locked and unlocked');
            await execute(panels().map, () => document.querySelector('#overlay-header').focus());
            await until(async () => execute(panels().map, () => getComputedStyle(document.querySelector('.native-map-tools')).visibility==='visible'),'Keyboard focus reveals the same-row native header controls');
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
            await until(async () => execute(panels().map,()=>getComputedStyle(document.querySelector('.native-map-tools')).visibility==='hidden'),'Keyboard departure closes the header before targeting map text');
            await wait(100); // Allow the Z row collapse to resize/repaint the real canvas before targeting its text.
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
            await execute(panels().intel, () => { document.querySelector('#intel-body').scrollTop = 0;const name=document.querySelector('[data-intel-section="raid"] .npc-name');name.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'})); });
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
            // Exercise main-window markup and real pointer dispatch as well as
            // the native Intel renderer: the Item picture used to have no
            // tooltip identity at all, and live redraws detached name targets.
            showNativeInactive.call(owner);owner.focus();
            await until(async()=>execute(owner,()=>document.hasFocus()),'Main pointer hover checks use the active CI document');
            await execute(owner,()=>{
                window.__mainItemPointer=[];
                for(const type of ['pointerover','pointermove'])document.addEventListener(type,event=>{
                    const target=event.target.closest?.('[data-item-title]');window.__mainItemPointer.push({type:event.type,name:target?.dataset.itemTitle||'',tag:event.target.tagName,id:event.target.id||'',trusted:event.isTrusted,x:event.clientX,y:event.clientY});
                    if(window.__mainItemPointer.length>40)window.__mainItemPointer.shift();
                },true);
                const search=document.querySelector('#item-search');search.value='Synthetic Charm 1';search.dispatchEvent(new Event('input'));
            });
            const mainHover = async (selector,expectedItem='') => {
                const target=await execute(owner,async selector=>{
                    const target=document.querySelector(selector);
                    if(!target)throw new Error(`Missing main item hover surface: ${selector}`);
                    document.activeElement?.blur();target.scrollIntoView({block:'center',inline:'nearest'});
                    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                    const rect=target.getBoundingClientRect(),identity=target.closest('[data-item-title]');window.__mainItemPointer=[];
                    return{x:Math.round(rect.left+Math.min(8,rect.width/2)),y:Math.round(rect.top+rect.height/2),name:identity.dataset.itemTitle,tag:target.tagName};
                },selector);
                if(expectedItem)assert.equal(target.name,expectedItem);
                try{
                    owner.webContents.sendInputEvent({type:'mouseMove',x:5,y:5});
                    // Acknowledge departure before entering; back-to-back native
                    // mouse moves can coalesce without a fresh pointerover.
                    await until(async()=>execute(owner,()=>window.__mainItemPointer.some(event=>event.trusted&&Math.abs(event.x-5)<=1&&Math.abs(event.y-5)<=1)),'Native pointer departure is delivered before entering the item');
                    owner.webContents.sendInputEvent({type:'mouseMove',x:target.x,y:target.y});
                    await until(async()=>execute(owner,name=>{const tooltip=document.querySelector('#item-tooltip');return !tooltip.hidden&&tooltip.querySelector('.itembox-title>span')?.textContent===name&&window.__mainItemPointer.some(event=>event.type==='pointerover'&&event.trusted&&event.name===name);},target.name),`Trusted main hover exposes stats from ${selector}`);
                }catch(error){
                    const diagnostic=await execute(owner,(selector,point)=>{
                        const describe=node=>node?{tag:node.tagName,id:node.id,className:node.className,name:node.closest?.('[data-item-title]')?.dataset.itemTitle||'',text:node.textContent?.slice(0,120),rect:node.getBoundingClientRect().toJSON()}:null;
                        const tooltip=document.querySelector('#item-tooltip');
                        return{hasFocus:document.hasFocus(),viewport:{width:innerWidth,height:innerHeight},activeView:document.querySelector('.view.is-active')?.dataset.viewPanel,activeElement:describe(document.activeElement),target:describe(document.querySelector(selector)),hit:describe(document.elementFromPoint(point.x,point.y)),events:window.__mainItemPointer,tooltip:{hidden:tooltip.hidden,display:getComputedStyle(tooltip).display,title:tooltip.querySelector('.itembox-title>span')?.textContent,text:tooltip.textContent.slice(0,350)},scroll:document.querySelector('.content').scrollTop};
                    },selector,target);
                    throw new Error(`${error.message}: ${JSON.stringify({selector,point:target,native:{visible:owner.isVisible(),focused:owner.isFocused(),bounds:owner.getContentBounds()},...diagnostic})}`);
                }
                return execute(owner,(selector,target)=>{
                    const tooltip=document.querySelector('#item-tooltip'),node=document.querySelector(selector),identity=node.closest('[data-item-title]');
                    return{...target,stats:tooltip.querySelectorAll('.tooltip-stat').length,description:identity.getAttribute('aria-describedby'),tabbable:identity.tabIndex>=0,href:identity.getAttribute('href')};
                },selector,target);
            };
            const mainItemName=await mainHover('#item-list h3[data-item-title]');
            const mainItemIcon=await mainHover('#item-list .item-card-icon img');
            assert.equal(mainItemName.name,mainItemIcon.name);assert(mainItemName.stats>0&&mainItemIcon.stats>0&&mainItemIcon.tabbable&&mainItemIcon.description==='item-tooltip','Main Item browser name and picture share keyboard-accessible stat hooks');
            await execute(owner,()=>{window.__retainedMainItem=document.querySelector('#item-list h3[data-item-title]');const search=document.querySelector('#item-search');search.dispatchEvent(new Event('input'));});
            assert.equal(await execute(owner,()=>window.__retainedMainItem===document.querySelector('#item-list h3[data-item-title]')),true,'Unchanged Item results retain their actual DOM targets across redraw requests');
            await append(['You gain a rune for 1 points of absorption.']);
            await until(async()=>(await state()).snapshot.session.parse.totalRuneCapacity===501,'Main item hover survives a real log-driven redraw');
            assert.equal(await execute(owner,()=>window.__retainedMainItem.isConnected&&!document.querySelector('#item-tooltip').hidden),true,'Live combat updates keep unchanged item name/icon tooltips attached');
            await execute(owner,()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));const target=document.querySelector('#item-list h3[data-item-title]'),rect=target.getBoundingClientRect();target.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+2,clientY:rect.top+2}));});
            assert.equal(await execute(owner,()=>document.querySelector('#item-tooltip').hidden),false,'Pointer movement restores the current item after an explicit dismissal without requiring a new enter');
            await execute(owner,()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));document.querySelector('[data-view="npcs"]').click();const search=document.querySelector('#npc-search');search.value='Synthetic Keeper';search.dispatchEvent(new Event('input'));});
            const mainNpcName=await mainHover('#npc-list .known-drops .known-drop-name');
            const mainNpcIcon=await mainHover('#npc-list .known-drops img.known-drop-icon');
            assert.equal(mainNpcName.name,mainNpcIcon.name);assert(mainNpcName.stats>0&&mainNpcIcon.stats>0&&/^https?:/.test(mainNpcName.href||''),'NPC loot names and pictures both expose real local stats while preserving their Wiki link');
            owner.focus();await until(async()=>execute(owner,()=>document.hasFocus()),'Main keyboard hover checks use the active CI document');
            await execute(owner,()=>{const target=document.querySelector('#npc-list .known-drops [data-item-title]');target.focus();});
            assert.equal(await execute(owner,()=>!document.querySelector('#item-tooltip').hidden&&document.activeElement.dataset.itemTitle===document.querySelector('#item-tooltip .itembox-title>span').textContent),true,'Main NPC loot remains available to keyboard focus');
            await append(['Unknown Elevation Watcher scowls at you (Lvl: 30)']);
            await until(async()=>{const intel=(await state()).snapshot.session.intel;return intel.npcs.some(npc=>npc.id===intel.focusedNpcId&&npc.name==='Unknown Elevation Watcher');},'Prepare a real observed NPC before testing changed-level redraws');
            await execute(owner,()=>{document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));const search=document.querySelector('#npc-search');search.value='';search.dispatchEvent(new Event('input'));});
            const duplicateSelector='#npc-list [data-item-tooltip-source*="unknown elevation watcher"] [data-item-title="Synthetic Charm 1"] .known-drop-name';
            const duplicateHover=await mainHover(duplicateSelector,'Synthetic Charm 1');
            await execute(owner,()=>{window.__oldDuplicate=document.querySelector('#npc-list [data-item-tooltip-source*="unknown elevation watcher"] [data-item-title="Synthetic Charm 1"]');});
            await append(['Unknown Elevation Watcher scowls at you (Lvl: 35)']);
            await until(async()=>execute(owner,()=>!window.__oldDuplicate.isConnected&&document.querySelector('#npc-list [data-item-tooltip-source*="unknown elevation watcher"] .pill-row').textContent.includes('Level 35')),'A real NPC consider changes its visible level and replaces the old loot markup');
            assert.equal(await execute(owner,point=>{const target=document.elementFromPoint(point.x,point.y)?.closest('[data-item-title]');return target?.dataset.itemTitle==='Synthetic Charm 1'&&!document.querySelector('#item-tooltip').hidden;},duplicateHover),true,'A changed NPC redraw keeps the tooltip tied to the actual duplicate under the pointer');
            await execute(owner,()=>{const search=document.querySelector('#npc-search');search.value='Synthetic Keeper';search.dispatchEvent(new Event('input'));});
            assert.equal(await execute(owner,()=>document.querySelector('#item-tooltip').hidden),true,'Removing the hovered NPC hides its tooltip even though another NPC still drops the same item');
            await execute(owner,()=>{const search=document.querySelector('#npc-search');search.value='';search.dispatchEvent(new Event('input'));const target=document.querySelector('#npc-list [data-item-tooltip-source*="unknown elevation watcher"] [data-item-title="Synthetic Charm 1"]');target.focus();window.__oldFocusedDrop=target;});
            await append(['Unknown Elevation Watcher scowls at you (Lvl: 36)']);
            await until(async()=>execute(owner,()=>!window.__oldFocusedDrop.isConnected&&document.querySelector('#npc-list [data-item-tooltip-source*="unknown elevation watcher"] .pill-row').textContent.includes('Level 36')),'A second real consider changes the NPC level and replaces the focused loot link');
            assert.equal(await execute(owner,()=>{const target=document.activeElement;return target?.dataset.itemTitle==='Synthetic Charm 1'&&target.closest('[data-item-tooltip-source]')?.dataset.itemTooltipSource.includes('unknown elevation watcher')&&!document.querySelector('#item-tooltip').hidden;}),true,'Keyboard focus restores the exact NPC occurrence instead of jumping to another copy of its drop');
            await screenshot(owner,'main-item-hover');
            await execute(owner,()=>{document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));document.querySelector('[data-view="items"]').click();const search=document.querySelector('#item-search');search.value='';search.dispatchEvent(new Event('input'));});
            owner.hide();
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
            await execute(owner, async fixtureUpdateVersion => {
                const { mountAppUpdates } = await import('/app-update-ui.js');
                window.__tourUpdatePresenter = mountAppUpdates({ bridge:{ getStatus:async () => ({
                    supported:true, status:'available', availableVersion:fixtureUpdateVersion,
                    releaseUrl:`https://github.com/Maergoth/EQL-EOZ/releases/tag/v${fixtureUpdateVersion}`
                }) } });
                await window.__tourUpdatePresenter.refresh();
                [...document.querySelectorAll('.settings-grid h2')].find(heading => heading.textContent === 'Fonts')
                    .closest('article').scrollIntoView({ block:'start' });
            },fixtureUpdateVersion);
            await screenshot(owner, 'workspace');
            await execute(owner, () => { window.__tourUpdatePresenter.dispose(); delete window.__tourUpdatePresenter; });
            await execute(owner, () => document.querySelector('[data-view="timers"]').click());
            await screenshot(owner, 'main-timers');
            for (const [name, window] of Object.entries(panels())) {
                if(name==='map'){
                    showNativeInactive.call(window);
                    const point=await execute(window,()=>{const rect=document.querySelector('#overlay-title').getBoundingClientRect();return{x:Math.round(rect.left+6),y:Math.round(rect.top+rect.height/2)};});
                    window.webContents.sendInputEvent({type:'mouseMove',...point});
                    await until(async () => execute(window,()=>getComputedStyle(document.querySelector('.native-map-tools')).visibility==='visible'),'Map tour capture shows the same-row header after actual title hover');
                }
                if(name==='intel')await execute(window, () => {document.querySelector('#intel-body').scrollTop=0;document.querySelector('[data-intel-section="raid"] .npc-name').dispatchEvent(new PointerEvent('pointerover',{bubbles:true,pointerType:'mouse'}));});
                await screenshot(window, name);
                if(name==='map')window.hide();
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
            const beforeSplit=after.snapshot.session;
            const deadlines=beforeSplit.timers.timers.map(({id,expiresAt})=>({id,expiresAt}));
            await execute(panels().parse,()=>{document.querySelector('[data-tab="session"]').click();document.querySelector('[data-new-session]').click();});
            await until(async()=>{const parse=(await state()).snapshot.session.parse;return parse.totalDamage===0&&parse.sessionNumber===beforeSplit.parse.sessionNumber+1;},'Native New session button splits the shared parse at the current log cursor');
            const split=(await state()).snapshot.session;
            assert.equal(split.parse.totalHealing,0);assert.equal(split.parse.totalRuneCapacity,0);assert.equal(split.parse.encounters.length,0);
            assert.equal(split.zone,beforeSplit.zone);assert.deepEqual(split.map.location,beforeSplit.map.location);
            assert.deepEqual(split.timers.timers.map(({id,expiresAt})=>({id,expiresAt})),deadlines,'Manual session splits preserve all running trigger IDs/deadlines');
            await append(['You slash a synthetic skeleton for 9 points of damage.']);
            await until(async()=>(await state()).snapshot.session.parse.totalDamage===9,'Only newly appended log lines enter the split session');
            return { ok:true, platform:process.platform, windowBackend:app.commandLine.getSwitchValue('ozone-platform'), windows:ids.length, damage:9, timers:split.timers.timers.length, sharedSession:true, inactiveFocus, screenshots };
        };
        let started = false;
        app.on('browser-window-created', () => { if (!started) { started = true; void inspect().then(result => { console.log('EOZ_NATIVE_OVERLAY_SMOKE=' + JSON.stringify(result)); app.exit(0); }).catch(error => { console.error(error.stack); app.exit(1); }); } });
        setTimeout(() => { console.error('Native overlay smoke exceeded 60 seconds.'); app.exit(2); }, 60000).unref();
        require(path.join(root, 'desktop/main.cjs'));
    };
    const fixtureVersionParts=pkg.version.split('.');fixtureVersionParts[2]=String(Number(fixtureVersionParts[2])+1);const fixtureUpdateVersion=fixtureVersionParts.join('.');
    await writeFile(join(temporary, 'main.cjs'), `const { app } = require('electron');\napp.setPath('userData', ${JSON.stringify(profile)});\n(${run.toString()})(${JSON.stringify({root, log, screenshots, fixtureUpdateVersion})}).catch(error => { console.error(error.stack); app.exit(1); });\n`);
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
