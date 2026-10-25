// Real sandboxed Chromium renderer, actual parser/compaction/overlay modules,
// synthetic log lines only. This does not open a game or write wiki pages.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(),'eoz-combatant-overview-'));
const argument = process.argv.indexOf('--screenshots');
const screenshots = argument < 0 ? null : resolve(process.argv[argument + 1]);
async function run({root,temporary,screenshots}) {
    const {app,BrowserWindow} = require('electron'), fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile')); app.disableHardwareAcceleration(); await app.whenReady();
    const html = (await fs.readFile(path.join(root,'app/overlay.html'),'utf8')).replace('<script type="module" src="./overlay.js"></script>','');
    const server = http.createServer(async(req,res) => {
        try {
            const name = new URL(req.url,'http://fixture').pathname;
            if (name === '/app/overlay.html') { res.setHeader('Content-Type','text/html'); res.end(html); return; }
            if (!/^\/app\/[a-zA-Z0-9_./-]+\.(?:js|css|json|png)$/.test(name)) { res.writeHead(404).end(); return; }
            const target = path.resolve(root,'.'+name);
            if (!target.startsWith(path.join(root,'app')+path.sep)) {res.writeHead(403).end();return;}
            res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'application/json');res.end(await fs.readFile(target));
        } catch { res.writeHead(404).end(); }
    });
    await new Promise(done => server.listen(0,'127.0.0.1',done));
    const origin = `http://127.0.0.1:${server.address().port}`, errors = [];
    const window = new BrowserWindow({show:false,frame:false,useContentSize:true,width:650,height:640,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.on('console-message',detail => { if (detail.level === 'error') errors.push(detail.message); });
    window.webContents.on('render-process-gone',(_event,value) => errors.push(value.reason));
    window.webContents.session.webRequest.onBeforeRequest((details,done) => done({cancel:!details.url.startsWith(origin+'/')&&!details.url.startsWith('data:')}));
    const execute = async(fn,...args) => {
        const result = await window.webContents.executeJavaScript(`(async()=>{try{return{ok:true,value:await (${fn.toString()})(...${JSON.stringify(args)})};}catch(error){return{ok:false,error:String(error?.stack||error)}}})()`);
        if (!result.ok) throw Error(result.error); return result.value;
    };
    const capture = async name => { if (screenshots) { await new Promise(done=>setTimeout(done,100));await fs.mkdir(screenshots,{recursive:true}); await fs.writeFile(path.join(screenshots,name+'.png'),(await window.capturePage()).toPNG()); } };
    try {
        await window.loadURL(origin+'/app/overlay.html?panel=parse');
        await execute(async() => {
            const {EQLogParser} = await import('/app/parser.js'), {compactParseSnapshot} = await import('/app/overlay-session.js');
            const parser = new EQLogParser(), at = Date.now() - 60000;
            parser.setCharacterFromFilename('eqlog_Synthetic_example.txt');
            const add = (second,body) => parser.parse(`[${new Date(at + second*1000).toISOString()}] ${body}`);
            ['You hit a synthetic keeper for 120 points of damage.', 'Ally hits a synthetic keeper for 80 points of damage.', 'a synthetic keeper punches YOU for 30 points of damage.', 'a synthetic keeper hits Ally for 10 points of damage.', 'Ally healed Synthetic for 20 hit points by Synthetic Heal.', 'You healed Yourself for 15 hit points by Mend.', "Ally's pet hits a synthetic keeper for 40 points of damage.", 'You have gained an ability point! You now have 3 ability points.', 'You healed herself over time for 55 hit points by Synthetic Recovery.', 'Ally healed himself over time for 25 hit points by Synthetic Recovery (Critical)', 'You gain a rune for 1,000 points of absorption.'].forEach((body,index) => add(index,body));
            ['You healed Synthetic for 4 hit points.', 'You have taken 7 damage from Synthetic Unknown Rot.', 'a synthetic keeper has taken 3 damage by Synthetic Unknown Rot.', 'a distant synthetic target has taken 2 damage by Synthetic Unknown Rot.', "a synthetic keeper is burned by Synthetic's flames for 6 points of non-melee damage.", 'Ally reaves a synthetic keeper for 5 points of damage.'].forEach(body=>add(10,body));
            add(30,'You hit a synthetic shaman for 50 points of damage.'); add(31,'a synthetic shaman hits YOU for 5 points of damage.');
            window.fixture = {parser,compactParseSnapshot,add};
            fixture.state = {preferences:{visible:true,locked:true,fontScale:1,backgroundOpacity:1},sessionAvailable:true,snapshot:{session:{parse:compactParseSnapshot(parser.snapshot())}}};
            window.eyeOfZommOverlay = {getState:async()=>fixture.state,onState:callback=>{fixture.push=callback;return()=>{};},action:async()=>({})};
            await import('/app/overlay.js'); await new Promise(done=>setTimeout(done,30));
            const select = document.querySelector('#encounter-scope'); select.value='session';select.dispatchEvent(new Event('change',{bubbles:true}));
            document.querySelector('[data-tab="overview"]').click();
        });
        const names = await execute(() => [...document.querySelectorAll('.overview-table .meter-label')].map(node=>node.textContent));
        for (const name of ['Synthetic','Ally','a synthetic keeper',"Ally's pet",'a synthetic shaman']) assert(names.includes(name),name);
        assert(!names.some(name=>/^(?:himself|herself|itself|themselves|yourself)(?: over time)?$| over time$|Critical/.test(name)),'HoT recipient modifiers never become native Overview rows');
        assert.deepEqual(await execute(()=>{const parse=fixture.state.snapshot.session.parse;return {own:parse.totalHealing,ally:parse.combatants.find(row=>row.name==='Ally').healing,runes:parse.totalRuneCapacity,damage:parse.totalDamage,taken:parse.totalTaken,unknownDamage:parse.combatants.find(row=>row.name==='Unknown attacker').damage};}),{own:74,ally:45,runes:1000,damage:176,taken:42,unknownDamage:12},'Actual parser→transport→native renderer retains direct/tick/bare healing, shield-wearer credit, unknown-source damage and separate rune capacity');
        assert.doesNotMatch(await execute(()=>document.querySelector('#parse-body').textContent),/Logged combatants only; pets keep their own names\.|Other combatant rates use|Your DPS keeps its existing outgoing-damage clock/,'Routine captions stay out of native Whole-session Overview');
        assert.equal(await execute(() => document.querySelector('.overview-table').getAttribute('aria-label')),'Logged combatants overview');
        await capture('whole-session-combatants');
        await execute(() => { document.querySelector('[data-tab="damage"]').click(); const details=[...document.querySelectorAll('.combatant-details')].find(node=>node.querySelector('.combatant-name').textContent==='Ally');details.open=true; });
        assert.match(await execute(() => [...document.querySelectorAll('.combatant-details')].find(node=>node.open).textContent),/Ally[\s\S]*hits/);
        // A new live snapshot must not collapse an expanded combatant.
        await execute(() => {[...document.querySelectorAll('.combatant-details')].find(node=>node.querySelector('.combatant-name').textContent==='Ally').querySelector('summary').focus();fixture.add(32,'Ally hits a synthetic shaman for 5 points of damage.');fixture.state.snapshot.session.parse=fixture.compactParseSnapshot(fixture.parser.snapshot());fixture.push(fixture.state);});
        assert.equal(await execute(() => [...document.querySelectorAll('.combatant-details')].find(node=>node.querySelector('.combatant-name').textContent==='Ally').open),true);
        assert.equal(await execute(() => document.activeElement.closest('.combatant-details')?.querySelector('.combatant-name').textContent),'Ally','A live update preserves disclosure keyboard focus');
        await capture('combatant-damage-dropdown');
        await execute(() => {const select=document.querySelector('#encounter-scope');select.value=fixture.state.snapshot.session.parse.encounters.find(encounter=>encounter.name==='a synthetic keeper').id;select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-tab="overview"]').click();});
        assert.equal(await execute(() => [...document.querySelectorAll('.overview-table .meter-label')].some(node=>node.textContent==='a synthetic shaman')),false);
        await capture('individual-encounter-combatants');
        for (const tab of ['healing','taken']) {
            await execute(tab => {document.querySelector(`[data-tab="${tab}"]`).click();document.querySelector('.combatant-details').open=true;},tab);
            assert(await execute(() => document.querySelector('.combatant-details[open] .meter-table')!==null));
            if(tab==='healing')assert.match(await execute(()=>document.querySelector('#parse-body').textContent),/Rune capacity granted[\s\S]*1,000[\s\S]*Excluded from healing and HPS/,'The useful rune-capacity explanation remains visible');
            await capture('combatant-'+tab+'-dropdown');
        }
        await execute(() => document.querySelector('[data-tab="session"]').click());
        assert.match(await execute(() => document.querySelector('#parse-body').textContent),/AA Gained1/);
        await capture('session-aa-gained');
        // Narrow native window still scrolls and keeps keyboard disclosure.
        window.setContentSize(360,550);
        await execute(() => {document.querySelector('[data-tab="damage"]').click();const summary=document.querySelector('.combatant-details>summary');summary.focus();});
        window.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});
        await new Promise(done=>setTimeout(done,50));
        assert.equal(await execute(() => document.activeElement.tagName),'SUMMARY');
        assert.equal(await execute(() => document.activeElement.parentElement.open),true,'Space expands the focused combatant');
        window.setContentSize(650,640);
        await execute(async()=>{
            const {EQLogParser}=await import('/app/parser.js'),realNow=Date.now;
            const live=fixture.live={parser:new EQLogParser(),realNow,clock:realNow()};Date.now=()=>live.clock;
            live.parser.setCharacterFromFilename('eqlog_Synthetic_example.txt');live.parser.startNewSession(live.clock);
            live.add=(delay,body)=>{live.clock+=delay*1000;return live.parser.parse(`[${new Date(live.clock).toISOString()}] ${body}`);};
            live.publish=()=>{fixture.state.snapshot.session.parse=fixture.compactParseSnapshot(live.parser.snapshot());fixture.push(fixture.state);};
            live.add(0,'You hit a synthetic sentry for 100 points of damage.');live.add(2,'You hit a synthetic sentry for 50 points of damage.');live.publish();live.firstId=fixture.state.snapshot.session.parse.encounters[0].id;
            const selector=document.querySelector('#encounter-scope');selector.value='live';selector.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-tab="damage"]').click();
            const details=document.querySelector('.combatant-details');details.open=true;details.querySelector('summary').focus();live.summary=details.querySelector('summary');
        });
        assert.match(await execute(()=>document.querySelector('#encounter-scope').selectedOptions[0].textContent),/a synthetic sentry · Live$/);
        await capture('live-active-encounter');
        const held=await execute(()=>{fixture.live.clock+=20000;fixture.live.publish();return{scope:document.querySelector('#encounter-scope').value,label:document.querySelector('#encounter-scope').selectedOptions[0].textContent,header:document.querySelector('#encounter-stats').textContent,ended:document.querySelector('.ended')?.textContent,open:document.querySelector('.combatant-details').open,focus:document.activeElement===fixture.live.summary};});
        assert.equal(held.scope,'live');assert.match(held.label,/Live \(ended\)/);assert.equal(held.ended,'ended');assert.equal(held.open,true);assert.equal(held.focus,true);assert.match(held.header,/75/);
        const idle=await execute(()=>{fixture.live.clock+=600000;fixture.live.publish();return{header:document.querySelector('#encounter-stats').textContent,body:document.querySelector('#parse-body').textContent};});
        assert.equal(idle.header,held.header);assert.doesNotMatch(idle.body,/Waiting for combat/);await capture('live-held-ended-encounter');
        const next=await execute(()=>{fixture.live.add(5,'You hit a synthetic scout for 40 points of damage.');fixture.live.add(2,'You hit a synthetic scout for 60 points of damage.');fixture.live.publish();return{scope:document.querySelector('#encounter-scope').value,label:document.querySelector('#encounter-scope').selectedOptions[0].textContent,header:document.querySelector('#encounter-stats').textContent,ended:Boolean(document.querySelector('.ended')),open:document.querySelector('.combatant-details').open,focus:document.activeElement.id};});
        assert.equal(next.scope,'live');assert.match(next.label,/a synthetic scout · Live$/);assert.equal(next.ended,false);assert.equal(next.open,false);assert.equal(next.focus,'encounter-scope');assert.match(next.header,/50/);await capture('live-next-encounter');
        await execute(()=>{document.querySelector('[data-tab="overview"]').click();const selector=document.querySelector('#encounter-scope');selector.value=fixture.live.firstId;selector.dispatchEvent(new Event('change',{bubbles:true}));fixture.live.publish();});
        assert.equal(await execute(()=>document.querySelector('#encounter-scope').value),await execute(()=>fixture.live.firstId));assert.match(await execute(()=>document.querySelector('#parse-body').textContent),/a synthetic sentry/);
        await execute(()=>{const selector=document.querySelector('#encounter-scope');selector.value='session';selector.dispatchEvent(new Event('change',{bubbles:true}));fixture.live.publish();Date.now=fixture.live.realNow;});
        assert.equal(await execute(()=>document.querySelector('#encounter-scope').value),'session');
        await execute(async()=>{
            const {EQLogParser}=await import('/app/parser.js'),parser=new EQLogParser(),start=Date.now()-10000;
            parser.setCharacterFromFilename('eqlog_Synthetic_example.txt');
            const add=(second,text)=>parser.parse(`[${new Date(start+second*1000).toISOString()}] ${text}`);
            add(0,'You begin casting Synthetic Rot.');add(0,"Ally's pet begins casting Synthetic Rot.");
            const first=add(1,'a synthetic north target has taken 11 damage by Synthetic Rot.');
            const second=add(2,'a synthetic south target has taken 13 damage by Synthetic Rot.');
            add(3,'a synthetic north target has taken 7 damage by Synthetic Rot.');
            add(4,'Other begins casting Synthetic Rot.');
            const overlap=add(5,'a synthetic south target has taken 3 damage by Synthetic Rot.');
            const explicit=add(6,'a synthetic south target has taken 5 damage from Synthetic Rot by Other.');
            add(7,'a synthetic south target has taken 2 damage by Synthetic Rot.');
            fixture.fifo={first,second,overlap,explicit,observed:parser.snapshot().observed.length};
            fixture.state.snapshot.session.parse=fixture.compactParseSnapshot(parser.snapshot());fixture.push(fixture.state);
            const selector=document.querySelector('#encounter-scope');selector.value='session';selector.dispatchEvent(new Event('change',{bubbles:true}));
            document.querySelector('[data-tab="overview"]').click();
        });
        assert.deepEqual(await execute(()=>{
            const parse=fixture.state.snapshot.session.parse;return {own:parse.totalDamage,pet:parse.combatants.find(row=>row.name==="Ally's pet").damage,
                other:parse.combatants.find(row=>row.name==='Other').damage,unknown:parse.combatants.find(row=>row.name==='Unknown attacker').damage,
                observed:fixture.fifo.observed,first:fixture.fifo.first.actorAttribution,petActor:fixture.fifo.second.actor,ambiguous:fixture.fifo.overlap.actorKnown,explicit:fixture.fifo.explicit.actorAttribution??null,
                retained:parse.recentEvents.filter(event=>event.actorAttribution==='cast-order').length};
        }),{own:18,pet:13,other:5,unknown:5,observed:0,first:'cast-order',petActor:"Ally's pet",ambiguous:false,explicit:null,retained:3},'Actual parser/compaction/native UI carries FIFO credits, explicit authority, ambiguous Unknown and provenance without wiki observations');
        const fifoNames=await execute(()=>[...document.querySelectorAll('.overview-table .meter-label')].map(node=>node.textContent));
        for(const name of ['Synthetic',"Ally's pet",'Other','Unknown attacker'])assert(fifoNames.includes(name),`${name}: ${JSON.stringify(fifoNames)}`);
        assert(!fifoNames.includes('Ally'),'Inferred pet damage cannot merge into its owner');
        await capture('dot-cast-order-native-overview');
        assert.deepEqual(errors,[]);
        console.log('Native combatant overview: actual parser and compact snapshot reach whole-session/individual Overview, Damage/Healing/Taken disclosures, AA and keyboard controls; Live holds ended encounters with frozen rates and focus, then follows the next fight. FIFO DoTs retain own/pet credits and provenance, explicit named authority, ambiguous Unknown and no wiki observations.');
    } finally { window.destroy(); await new Promise(done=>server.close(done));app.quit(); }
}
try {
    const entry = join(temporary,'main.cjs'); await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,screenshots})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1)});`);
    const require = createRequire(import.meta.url), electron=require('electron'), env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
    const code = await new Promise((done,reject) => {const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});assert.equal(code,0);
} finally { assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100}); }
