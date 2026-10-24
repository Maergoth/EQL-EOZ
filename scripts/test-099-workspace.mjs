// One focused real-Chromium component check. All identities, screenshots,
// wiki replies and storage are synthetic; no game/profile/network is touched.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-099-workspace-'));
const at=process.argv.indexOf('--screenshots'),screenshots=at<0?null:resolve(process.argv[at+1]);
async function run({root,temporary,screenshots}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const html='<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app/styles.css"><link rel="stylesheet" href="/app/capture-workspace.css"><style>html,body{height:auto;min-height:100%;overflow:auto}body{display:block;padding:20px;font-family:Arial,sans-serif}.fixture-heading{color:var(--gold2)}.fixture-heading small{color:var(--muted)}#capture-settings{display:none}#character-workspace{display:none}.contribution-layout{grid-template-columns:220px minmax(0,1fr)}</style></head><body><h1 class="fixture-heading">Eye of Zomm <small>0.9.9 · Synthetic UI fixture</small></h1><section id="capture-settings"></section><section id="contribution-workspace"></section><section id="character-workspace"></section></body></html>';
    const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://fixture').pathname;if(name==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(!/^\/app\/[a-zA-Z0-9_./-]+\.(?:js|css|png|json)$/.test(name)){res.writeHead(404).end();return;}const target=path.resolve(root,'.'+name);if(!target.startsWith(path.join(root,'app')+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'application/json');res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`,errors=[];
    const window=new BrowserWindow({show:false,frame:false,useContentSize:true,width:1280,height:1000,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.on('render-process-gone',(_event,value)=>errors.push(value.reason));window.webContents.on('console-message',(_event,detail)=>{if(detail?.level==='error')errors.push(detail.message);});
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(origin+'/')&&!details.url.startsWith('data:')}));
    const execute=(fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
    const wait=async(fn,label)=>{const end=Date.now()+8000;while(Date.now()<end){if(await fn())return;await new Promise(done=>setTimeout(done,30));}throw Error('Timed out: '+label);};
    const click=selector=>execute(selector=>{const element=document.querySelector(selector);if(!element)throw Error('Missing '+selector);element.click();},selector);
    const shot=async(name,selector,{preserveHover=false}={})=>{if(!screenshots)return;await fs.mkdir(screenshots,{recursive:true});window.showInactive();if(!preserveHover)await execute(selector=>{document.activeElement?.blur();document.querySelector(selector)?.scrollIntoView({block:'start',behavior:'instant'});},selector);await new Promise(done=>setTimeout(done,180));await fs.writeFile(path.join(screenshots,name+'.png'),(await window.capturePage()).toPNG());window.hide();};
    try{
        await window.loadURL(origin+'/');
        await execute(async()=>{
            const {createContributionQueue}=await import('/app/contribution-queue.js'),{createCharacterModel}=await import('/app/character-model.js'),{createCharacterProfiles}=await import('/app/character-profiles.js'),{characterCatalogCard}=await import('/app/character-catalog.js'),{mountCaptureWorkspace}=await import('/app/capture-workspace.js');
            const map=new Map(),storage={getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};
            const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ZkAAAAASUVORK5CYII=';
            const pack={meta:{schemaVersion:3,version:'synthetic-099',sample:false,wikiEntitiesComplete:true},zones:[{name:'Synthetic Vale',wikiTitle:'Synthetic Vale'}],npcs:[{name:'A synthetic lich',wikiTitle:'A Synthetic Lich',zone:'Synthetic Vale'},{name:'A Synthetic Lich',wikiTitle:'A Synthetic Lich',zone:'Other Vale'}],wikiEntities:{items:['Synthetic Thorn'],npcs:['A Synthetic Lich'],zones:['Synthetic Vale'],titles:['Synthetic Thorn','Synthetic Vale']},items:[{name:'Synthetic Thorn',wikiTitle:'Synthetic Thorn',slots:['PRIMARY','SECONDARY'],classes:['ROG'],dropSources:[],stats:{HP:50,STR:5,DMG:12,DELAY:19},displayLines:['MAGIC ITEM LORE ITEM NO DROP','Effect: Synthetic Rampage (Combat, Casting Time: Instant) at Level 45','Class: ROG','Race: ALL','Skill: Piercing Atk Delay: 19']}],icons:{42:pixel}};
            pack.items.push({name:'Already Known Bracer',wikiTitle:'Already Known Bracer',dropSources:[{name:'A synthetic lich',zone:'Synthetic Vale',instance:'normal'}]});pack.wikiEntities.items.push('Already Known Bracer');pack.wikiEntities.titles.push('Already Known Bracer');
            const queue=createContributionQueue({storage,getPack:()=>pack});const mob=queue.add({kind:'npc',name:'A synthetic keeper',zone:'Synthetic Vale',fields:{knownLoot:['Synthetic Thorn','Redlinked Gem'],location:'120, -30, 40',respawnTime:'3h'}},true);const item=queue.add({kind:'item',name:'Synthetic Missing Blade',zone:'Synthetic Vale',fields:{tier:4,hp:42,str:9,effects:['Combat Effect: Synthetic Rampage (Req Level 45)'],slots:['PRIMARY'],classes:['WAR'],augmentSlots:5}},true);
            const source=queue.add({kind:'item',name:'Synthetic Thorn',zone:'Synthetic Vale',relations:[{type:'drop-source',name:'A synthetic lich',zone:'Synthetic Vale',item:'Synthetic Thorn',instance:'normal',evidence:'explicit-corpse'}]},true);
            const zoneReview=queue.add({kind:'zone',name:'Synthetic Vale',zone:'Synthetic Vale',instance:'normal',fields:{knownLoot:['Already Known Bracer','Synthetic Thorn']},relations:['Already Known Bracer','Synthetic Thorn'].map(item=>({type:'drop-source',name:'A synthetic lich',zone:'Synthetic Vale',item,instance:'normal',evidence:'explicit-corpse'})),evidence:{id:'synthetic-triggered-loot',kind:'game-log',capturedAt:new Date().toISOString(),input:{event:'loot'},evidence:{text:'Log loot: Synthetic Thorn in Synthetic Vale',logLine:'[Sat Oct 24 10:00:00 2026] You looted a Synthetic Thorn from a synthetic lich’s corpse. <not-markup>'}}},true);
            const profiles=createCharacterProfiles({storage}),model=createCharacterModel({storage:profiles.storage});model.setMetadata({name:'Synthetic Keeper',server:'Test Server',classes:['ROG'],level:50,race:'Human',aaCount:120});
            const added=model.intake({id:'synthetic-card-read',sessionId:'synthetic-session',source:'manual',at:Date.now(),item:characterCatalogCard(pack.items[0],{tier:0})});if(!added.ok)throw Error(added.error);model.assign(added.candidate.id,'primary');const second=model.duplicateCandidate(added.candidate.id);if(!second.ok)throw Error(second.error);model.assign(second.candidate.id,'secondary');model.setStatSnapshot('current',{confirmed:true,stats:{HP:4321,ATK_OFFENSE:379,ATK_ACCURACY:828},at:Date.now()});profiles.register(model.snapshot().metadata);
            window.fixture={pack,map,mobId:mob.id,itemId:item.id,prepareCalls:0,attachmentCalls:0,notices:[],selectedIcons:[],sourceId:source.id,zoneReviewId:zoneReview.id};
            const wiki={status:async()=>({authenticated:true,user:{id:1,name:'Synthetic Editor'},canEdit:true}),blueprints:async()=>({revision:123,eras:['Classic Era','Kunark Era']}),onStatus:()=>()=>{},matches:async input=>({matches:input.kind==='item'?[{title:'Synthetic Thorn'},{title:'Synthetic_Thorn'},{title:'synthetic thorn'}]:[{title:'A Synthetic Lich'},{title:'A Synthetic Lich'},{title:'A synthetic lich'}]}),preparePlan:async input=>{fixture.prepareCalls++;return{id:'synthetic-plan',expectedUser:{name:'Synthetic Editor'},blueprintRevision:123,matches:{matches:[],checkedAt:new Date().toISOString()},blockers:[],warnings:[],pages:[{id:'synthetic-page',title:input.candidate.title,operation:'create',status:'pending',beforeText:'',afterText:'Synthetic wiki preview'}]};},prepareAttachment:async()=>{fixture.attachmentCalls++;return{attachmentId:'synthetic-attachment',thumbnail:pixel,width:1,height:1,bytes:68};},discardAttachment:async()=>({ok:true}),iconCatalog:async()=>({algorithm:6,generation:'a'.repeat(24),total:1,page:0,pageSize:48,records:[{title:'File:Item_42.png',iconId:'42',aliases:[{title:'File:Item_42.png',iconId:'42'}],dataUrl:pixel}]}),iconMatch:async()=>({algorithm:6,generation:'a'.repeat(24),total:0,page:0,pageSize:48,records:[]})};
            fixture.workspace=mountCaptureWorkspace({document,storage,characterStorage:storage,contributionStorage:storage,capture:null,wiki,share:null,inventory:null,getPack:()=>pack,notify:message=>fixture.notices.push(message)});fixture.workspace.refresh();
        });
        await execute(()=>fixture.workspace.openContribution(fixture.zoneReviewId));
        assert.equal(await execute(()=>document.querySelector('[data-match-heading]').textContent),'Matched existing page','Canonical exact page matches are labeled directly');
        assert.equal(await execute(()=>[...document.querySelectorAll('[data-loot-status=recorded]')].some(row=>row.textContent.includes('Already Known Bracer')&&row.textContent.includes('Already recorded in cached wiki'))),true);
        assert.equal(await execute(()=>document.querySelector('.contribution-destinations').textContent.includes('Already Known Bracer')),false,'Already recorded loot is not a proposed addition');
        for(const title of ['Synthetic Vale','Synthetic Thorn','A synthetic lich'])assert.equal(await execute(title=>[...document.querySelectorAll('.contribution-destinations a')].some(link=>decodeURIComponent(new URL(link.href).pathname.slice(1))===title),title),true,'Specific missing relationship names destination '+title);
        assert.equal(await execute(()=>[...document.querySelectorAll('.contribution-row-select')].every(button=>!button.querySelector('a'))),true,'Queue selection does not nest external links in buttons');
        await shot('discovery-direct-match-destinations','.contribution-match-first');
        await execute(()=>{const input=document.querySelector('[name=title]');input.focus();document.querySelector('[data-live-matches-status]').textContent='Checked live wiki.';input.value='Synthetic Other Vale';input.dispatchEvent(new Event('input',{bubbles:true}));});
        assert.equal(await execute(()=>document.activeElement===document.querySelector('[name=title]')),true,'Destination refresh preserves typing focus');
        assert.equal(await execute(()=>document.querySelector('[data-live-matches-status]').textContent),'','Old live-check status cannot label a newly edited title');
        assert.equal(await execute(()=>document.querySelector('[data-match-heading]').textContent),'Potential existing pages');
        assert.equal(await execute(()=>document.querySelector('.contribution-destinations').textContent.includes('To Synthetic Other Vale')),true,'The proposed destination follows the current title');
        assert.equal(await execute(()=>document.querySelector('.contribution-row.is-active>.contribution-destination-hint').textContent.includes('To Synthetic Other Vale')),true,'The queue destination follows the current title');
        await execute(()=>{const input=document.querySelector('[name=title]');input.value='Synthetic Vale';input.dispatchEvent(new Event('input',{bubbles:true}));const raid=document.querySelector('[name=raid]');raid.checked=true;raid.dispatchEvent(new Event('input',{bubbles:true}));});
        assert.match(await execute(()=>document.querySelector('.contribution-destinations').textContent),/Raid Zone/,'Instance edits refresh the proposed scope');
        await execute(()=>{const raid=document.querySelector('[name=raid]');raid.checked=false;raid.dispatchEvent(new Event('input',{bubbles:true}));});

        await execute(()=>{document.querySelector('[data-contribution-evidence]').open=true;});
        assert.match(await execute(()=>document.querySelector('[data-triggering-log-line]').textContent),/You looted a Synthetic Thorn.*<not-markup>/);
        assert.equal(await execute(()=>document.querySelector('[data-triggering-log-line] not-markup')===null),true,'Trigger text is displayed literally, never interpreted as HTML');
        await shot('discovery-triggering-log-line','[data-contribution-evidence]');
        await execute(()=>fixture.workspace.openContribution(fixture.mobId));
        assert.equal(await execute(()=>document.querySelector('[data-prepare-contribution]').disabled),true);
        assert.equal(await execute(()=>document.querySelectorAll('[data-field-confirmed]').length),0);
        assert.equal(await execute(()=>getComputedStyle(document.querySelector('[data-field-key=knownLoot]')).display),'none');
        assert.equal(await execute(()=>document.querySelector('.contribution-match-first').compareDocumentPosition(document.querySelector('.contribution-fields'))&Node.DOCUMENT_POSITION_FOLLOWING),4);
        await execute(()=>{const checkbox=document.querySelector('[data-matches-reviewed]');checkbox.checked=true;checkbox.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await execute(()=>document.querySelector('[data-prepare-contribution]').disabled),false);
        await click('[data-loot-kind="common"]');assert.equal(await execute(()=>document.querySelector('[data-loot-kind="common"]').getAttribute('aria-pressed')),'true');
        await shot('contribution-matching-and-loot','.contribution-match-first');
        await shot('contribution-loot-controls','.contribution-loot');
        await execute(()=>fixture.workspace.openContribution(fixture.itemId));assert.equal(await execute(()=>document.querySelectorAll('[data-base-fraction],[data-base-reviewed],[data-base-modifiers]').length),0);assert.match(await execute(()=>document.querySelector('[data-base-note]').textContent),/tier 0/);
        await click('[data-contribution-file]');await wait(()=>execute(()=>fixture.attachmentCalls===1&&Boolean(document.querySelector('.contribution-image-drop img'))),'attached screenshot');await click('[data-icon-browse]');await wait(()=>execute(()=>document.querySelectorAll('[data-icon-select]').length===1),'full catalog controls');await click('[data-icon-select]');assert.equal(await execute(()=>document.querySelector('[data-field-key="iconId"] input').value),'42');
        await shot('contribution-screenshot-and-icon','.contribution-image');
        // Existing-page work presents the specific addition, never the full form.
        await execute(()=>fixture.workspace.openContribution(fixture.sourceId));
        assert.match(await execute(()=>document.querySelector('.contribution-change-summary').textContent),/monster.*loot|monster’s loot/);
        assert.equal(await execute(()=>document.querySelector('[data-additional-contribution]').open),false);
        assert.equal(await execute(()=>document.querySelector('[data-field-key="statLines"]').closest('[data-additional-contribution]')!==null),true);
        assert.equal(await execute(()=>document.querySelector('[data-item-base-review]')===null),true);
        assert.equal(await execute(()=>document.querySelector('[data-candidate-form]').checkValidity()),true,'Source update does not require a new spawn location');
        await click('[data-source-toggle="0"]');
        assert.equal(await execute(()=>document.querySelector('[data-source-toggle="0"]').getAttribute('aria-pressed')),'false');
        assert.doesNotMatch(await execute(()=>document.querySelector('.contribution-change-summary').textContent),/A synthetic lich \(Synthetic Vale\)/,'Excluded sources are absent from the promised additions');
        await click('[data-source-toggle="0"]');
        await execute(()=>{document.querySelector('[data-add-source-npc]').value='A SYNTHETIC LICH';document.querySelector('[data-add-source-zone]').value='Synthetic Vale';});
        await click('[data-add-source]');
        assert.equal(await execute(()=>document.querySelectorAll('[data-source-toggle]').length),1,'Manually adding a case variant reuses the same source');
        await click('[data-check-matches]');
        await wait(()=>execute(()=>document.querySelector('[data-potential-matches]').textContent.includes('Synthetic Thorn')),'live page matches');
        assert.equal(await execute(()=>document.querySelectorAll('[data-use-existing]').length),1,'Repeated/case-variant live titles share a destination card');
        assert.equal(await execute(()=>{const row=document.querySelector('.contribution-match-row'),title=row.querySelector('a').getBoundingClientRect(),button=row.querySelector('button').getBoundingClientRect();return button.top>=title.bottom;}),true,'Use this page sits below the title');
        await shot('contribution-targeted-source-update','.contribution-match-first');
        await execute(()=>{const node=document.querySelector('[data-gap-filter="missing-source"]');node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
        assert.equal(await execute(()=>Boolean(document.querySelector('[data-candidate-id="'+fixture.sourceId+'"]'))),false);
        await execute(()=>{const node=document.querySelector('[data-gap-filter="missing-source"]');node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));});
        assert.equal(await execute(()=>Boolean(document.querySelector('[data-candidate-id="'+fixture.sourceId+'"]'))),true);
        await shot('contribution-filtered-queue','.contribution-layout');
        await execute(()=>{document.getElementById('contribution-workspace').style.display='none';document.getElementById('character-workspace').style.display='grid';const button=document.querySelector('[data-edit-card]');button.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));});
        assert.equal(await execute(()=>document.querySelector('.character-item-tooltip').hidden),false);assert.match(await execute(()=>document.querySelector('.character-item-tooltip').textContent),/Synthetic Rampage/);
        const totalBefore=await execute(()=>document.querySelector('[data-character-stat-summary]').textContent);assert.match(totalBefore,/4[,]?321/);
        await execute(()=>{const slider=document.querySelector('.character-item-tooltip [data-card-tier]');slider.focus();slider.value='3';slider.dispatchEvent(new Event('input',{bubbles:true}));});
        assert.equal(await execute(()=>document.activeElement===document.querySelector('.character-item-tooltip [data-card-tier]')),true);assert.equal(await execute(()=>document.querySelector('.character-item-tooltip').hidden),false);assert.equal(await execute(()=>document.querySelector('[data-character-stat-summary]').textContent),totalBefore);assert.match(await execute(()=>document.querySelector('.character-item-tooltip [data-card-tier-value]').textContent),/\+3/);
        assert.equal(await execute(()=>document.querySelector('[data-edit-card] [data-item-tier]').textContent),'+3','Equipment icon badge changes with hovered slider');
        assert.equal(await execute(()=>document.querySelector('[data-card-tier-unknown]')===null),true);
        // A fleeting real pointer hover is ignored; a held hover opens after350ms.
        await execute(()=>{document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('[data-edit-card]').scrollIntoView({block:'center'});});
        // CDP drives Chromium's real hit testing/:hover independently of an OS
        // window being visible. CI's hidden Windows process and Linux Xvfb use
        // the same pointer path as screenshot mode; no synthetic DOM mouse event.
        window.webContents.debugger.attach('1.3');
        await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled',{enabled:true});
        const move=async point=>window.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
        await execute(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        await move({x:1,y:1});
        const pointer=await execute(()=>{const r=document.querySelectorAll('[data-edit-card]')[1].getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};});
        assert.equal(await execute(p=>document.elementFromPoint(p.x,p.y)?.closest('[data-edit-card]')?.dataset.editCard===document.querySelectorAll('[data-edit-card]')[1].dataset.editCard,pointer),true,'Settled pointer coordinates hit the intended item');
        await move(pointer);
        await new Promise(done=>setTimeout(done,100));
        assert.equal(await execute(()=>document.querySelector('.character-item-tooltip').hidden),true,'No tooltip during accidental hover');
        await wait(()=>execute(()=>!document.querySelector('.character-item-tooltip').hidden),'delayed held hover').catch(async error=>{console.error('Hover diagnostics',await execute(p=>({point:p,hit:document.elementFromPoint(p.x,p.y)?.outerHTML.slice(0,300),hover:[...document.querySelectorAll(':hover')].map(el=>el.tagName+'.'+el.className),scroll:scrollY,focused:document.hasFocus(),tooltipHidden:document.querySelector('.character-item-tooltip').hidden}),pointer));throw error;});
        // Switching icons cancels the first item's hide timer before its delayed show.
        const secondPointer=await execute(()=>{const r=document.querySelectorAll('[data-edit-card]')[0].getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),id:document.querySelectorAll('[data-edit-card]')[0].dataset.editCard};});
        await move(secondPointer);
        await wait(()=>execute(id=>!document.querySelector('.character-item-tooltip').hidden&&document.querySelector('[data-tooltip-card]').dataset.tooltipCard===id,secondPointer.id),'adjacent held item hover');
        await execute(()=>{document.dispatchEvent(new Event('scroll'));});
        assert.equal(await execute(()=>document.querySelector('.character-item-tooltip').hidden),true,'Page scrolling dismisses hover');
        await execute(()=>document.querySelector('[data-edit-card]').dispatchEvent(new FocusEvent('focusin',{bubbles:true})));
        await shot('character-hover-tier-and-proc','.character-sheet',{preserveHover:true});
        await execute(()=>{document.documentElement.style.setProperty('--ui-font-scale','1.53846');document.getElementById('character-workspace').style.display='none';document.getElementById('contribution-workspace').style.display='grid';fixture.workspace.openContribution(fixture.sourceId);});
        await shot('contribution-targeted-source-large-font','.contribution-match-first');
        assert.equal(await execute(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Large text fits the window');
        await execute(()=>{const node=document.querySelector('[data-gap-filter="new-npc"]');node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
        await click('[data-ignore-candidate]');
        assert.equal(await execute(()=>document.querySelector('[data-candidate-form] h2').textContent),'Synthetic Missing Blade','Ignoring an entry selects only from visible filtered work');
        assert.deepEqual(errors,[]);console.log('0.9.9 native workspace: targeted update fields, source summaries, match card layout/dedup, gap filters, real-pointer hover delay, immediate tier badge; matching-first gating, no field checkboxes, Common/Unique, short recovery, screenshot attachment, full Icon Finder, equipped hover tier focus and recorded-only totals passed.');
        await execute(()=>fixture.workspace.dispose());
    }finally{if(window.webContents.debugger.isAttached())window.webContents.debugger.detach();window.destroy();await new Promise(done=>server.close(done));app.quit();}
}
try{const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,screenshots})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});assert.equal(code,0);}
finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
