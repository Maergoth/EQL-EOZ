// Actual parser -> discovery/queue -> native host -> dedicated popup, using
// synthetic chat and an isolated profile. No game or external wiki requests.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-chat-boundaries-'));
const argument=process.argv.indexOf('--screenshots'),screenshots=argument<0?null:resolve(process.argv[argument+1]);
async function run({root,temporary,screenshots}){
    const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const server=http.createServer(async(request,response)=>{
        try{
            const name=new URL(request.url,'http://fixture').pathname;
            if(name==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><meta charset="utf-8"><title>Synthetic chat boundary owner</title>');return;}
            const relative=name.startsWith('/app/')?name.slice(1):'app'+name;
            if(!/^app\/[\w./-]+\.(?:js|css|html|json)$/.test(relative)){response.writeHead(404).end();return;}
            const target=path.resolve(root,relative);if(!target.startsWith(path.join(root,'app')+path.sep)){response.writeHead(403).end();return;}
            response.setHeader('Content-Type',relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':'application/json');response.end(await fs.readFile(target));
        }catch{response.writeHead(404).end();}
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const main=new BrowserWindow({show:false,width:700,height:500,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
    main.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(origin+'/')&&!details.url.startsWith('data:')}));
    const {DiscoveryHost}=require(path.join(root,'desktop/discovery-host.cjs')),proofs=[];
    const nativeElectron={...electron,BrowserWindow:class extends BrowserWindow{showInactive(){}}};
    const host=new DiscoveryHost({electron:nativeElectron,origin,getMainWindow:()=>main,itemExistence:{async check(value){proofs.push(value.name);return{status:'missing',source:'synthetic-live-proof'};},clear(){},dispose(){}}});
    const execute=async(fn,...args)=>{
        const result=await main.webContents.executeJavaScript(`(async()=>{try{return{ok:true,value:await (${fn.toString()})(...${JSON.stringify(args)})};}catch(error){return{ok:false,error:String(error.stack)}}})()`);
        if(!result.ok)throw Error(result.error);return result.value;
    };
    try{
        await main.loadURL(origin+'/');
        const result=await execute(async()=>{
            const {EQLogParser}=await import('/app/parser.js'),{createWikiDiscovery}=await import('/app/wiki-discovery.js'),{createContributionQueue}=await import('/app/contribution-queue.js');
            const name='Signet Ring of Lord Everling',pack={meta:{sample:false,wikiEntitiesComplete:true},wikiEntities:{items:[name],npcs:[],titles:[name]},items:[{name}],npcs:[],zones:[]};
            const parser=new EQLogParser({getPack:()=>pack}),queue=createContributionQueue({storage:null,getPack:()=>pack}),pending=[],prompts=[];
            const discovery=createWikiDiscovery({storage:null,getPack:()=>pack,verifyItem:()=>({status:'missing'}),onMissing:prompt=>{prompts.push(prompt.name);pending.push(window.eyeOfZommDiscovery.show(prompt));}});
            let cursor=0;const consume=payload=>{const at=Date.now(),event=parser.parse(`[${new Date(at).toISOString()}] Syntheticplayer tells General:1, '${payload}'`),context={live:true,at,cursor:++cursor,logId:'synthetic-source'};if(event){queue.consumeLog(event,context);discovery.consume(event,context);}return event;};
            const known=consume('Then '+name+' +3');consume('Earlier I linked: '+name+' +3');consume('Then Unbounded Unknown Relic +3');
            if(prompts.length||queue.snapshot().length)throw Error('Prose generated a false discovery');
            const unknown='Synthetic Uncatalogued Relic +3',body='0'+(123).toString(16).padStart(5,'0')+'0'.repeat(50);
            const encoded=consume('Then '+String.fromCharCode(18)+body+unknown+String.fromCharCode(18));
            consume('Try [Synthetic Bounded Charm +4], please.');await Promise.all(pending);
            return{known:known.items,encoded:encoded.items,prompts,rows:queue.snapshot().map(row=>row.name)};
        });
        assert.deepEqual(result.known,['Signet Ring of Lord Everling +3']);assert.deepEqual(result.encoded,['Synthetic Uncatalogued Relic +3']);
        assert.deepEqual(result.prompts,['Synthetic Uncatalogued Relic','Synthetic Bounded Charm']);assert.deepEqual(result.rows,result.prompts);assert.deepEqual(proofs,result.prompts,'Only bounded genuine missing identities reach native proof');
        const popup=host.notices.window;assert(popup);
        const deadline=Date.now()+5000;let names=[];
        do{names=await popup.webContents.executeJavaScript("[...document.querySelectorAll('.wiki-discovery-name')].map(node=>node.textContent)");if(names.length===2)break;await new Promise(done=>setTimeout(done,20));}while(Date.now()<deadline);
        assert.deepEqual(names,result.prompts);assert(!names.some(name=>name.startsWith('Then ')));
        if(screenshots){await fs.mkdir(screenshots,{recursive:true});await new Promise(done=>setTimeout(done,100));await fs.writeFile(path.join(screenshots,'bounded-chat-discoveries.png'),(await popup.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG());}
        console.log('Native chat boundaries: actual parser/catalog prevents prose identities and traffic; genuine unknown link and explicit bounded mention pass queue/native proof into correctly named dedicated popup cards.');
    }finally{host.dispose();main.destroy();await new Promise(done=>server.close(done));app.quit();}
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,screenshots})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1)});`);
    const require=createRequire(import.meta.url),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(require('electron'),[entry],{env,stdio:'inherit',windowsHide:true,timeout:30000});child.once('error',reject);child.once('exit',done);});assert.equal(code,0);
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
