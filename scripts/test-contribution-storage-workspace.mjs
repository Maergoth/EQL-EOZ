// Actual sandboxed Chromium component with synthetic drafts and wiki/storage
// APIs. This never opens the installed profile or sends a public wiki request.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-contribution-storage-')),require=createRequire(import.meta.url);
const screenshotIndex=process.argv.indexOf('--screenshot'),screenshot=screenshotIndex<0?null:resolve(process.argv[screenshotIndex+1]);
async function run({root,temporary,screenshot}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const html='<!doctype html><link rel="stylesheet" href="/app/styles.css"><link rel="stylesheet" href="/app/capture-workspace.css"><section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace" hidden></div><div id="capture-settings" hidden></div>';
    const server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://fixture').pathname;if(pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(!/^\/app\/[a-zA-Z0-9_./-]+\.(?:js|css|json|png)$/.test(pathname)){res.writeHead(404).end();return;}const target=path.resolve(root,'.'+pathname);if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.png')?'image/png':'application/json');res.end(await fs.readFile(target));}catch{res.writeHead(404).end();}});
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const window=new BrowserWindow({show:false,width:1250,height:950,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:!details.url.startsWith(origin+'/')&&!details.url.startsWith('data:')}));
    const watchdog=setTimeout(()=>{console.error('Contribution storage component exceeded 45 seconds');app.exit(1);},45000);
    try{
        await window.loadURL(origin+'/');
        const result=await window.webContents.executeJavaScript(`(async()=>{
            const {mountCaptureWorkspace}=await import('/app/capture-workspace.js');
            const {CONTRIBUTION_QUEUE_KEY,CONTRIBUTION_AUTOMATIC_DRAFTS}=await import('/app/contribution-evidence.js');
            const pack={meta:{schemaVersion:3,version:'release-queue-synthetic',wikiEntitiesComplete:true},items:[],npcs:[],zones:[],wikiEntities:{items:[],npcs:[],zones:[],titles:[]}};
            const candidate=(id,name,patch={})=>({id,kind:'item',name,title:name,zone:'',instance:'unknown',fields:{},sources:[],relations:[],evidence:[],status:'needs-review',...patch});
            const authored=candidate('authored','Synthetic Contributor Relic',{manual:true,playerText:'Keep this item note and my unfinished review.'});
            const candidates=[authored,...Array.from({length:CONTRIBUTION_AUTOMATIC_DRAFTS-1},(_,n)=>candidate('old-'+n,'Synthetic Older Relic '+n,{evidence:[{id:'synthetic-log-'+n,kind:'game-log',event:'item-link',at:new Date(Date.now()-100000+n).toISOString(),text:'Synthetic linked-item observation'}]}))];
            const values=new Map([[CONTRIBUTION_QUEUE_KEY,JSON.stringify({schemaVersion:1,sequence:2000,candidates,archive:[]})]]),calls={prepare:0,submit:0};
            const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
            const wiki={status:async()=>({authenticated:false}),onStatus:()=>()=>{},blueprints:async()=>({eras:['Classic Era']}),matches:async()=>({matches:[]}),preparePlan:async()=>{calls.prepare++;throw Error('No fixture publication');},submitPlan:async()=>{calls.submit++;throw Error('No fixture publication');}};
            const workspace=mountCaptureWorkspace({document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,share:null,inventory:null,getPack:()=>pack,notify:()=>{}});
            await new Promise(done=>setTimeout(done,100));workspace.openContribution(authored.id);
            const at=Date.now();workspace.consumeLog({type:'item-link',item:'Synthetic Newly Discovered Relic'},{live:true,at,cursor:1,logId:'synthetic-release-log',zone:''});
            await new Promise(done=>setTimeout(done,100));workspace.refresh();
            await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
            const saved=JSON.parse(values.get(CONTRIBUTION_QUEUE_KEY)),status=document.querySelector('[data-contribution-storage-status]');
            if(saved.candidates.length!==CONTRIBUTION_AUTOMATIC_DRAFTS||saved.candidates.some(row=>row.id==='old-0')||!saved.candidates.some(row=>row.name==='Synthetic Newly Discovered Relic'))throw Error('Automatic discovery replacement failed');
            if(saved.candidates.find(row=>row.id===authored.id)?.playerText!==authored.playerText)throw Error('Authored review was not preserved');
            if(!/Made room by removing 1 older, unedited discovery/.test(status.textContent)||status.dataset.contributionStorageState!=='saved')throw Error('The actual cleanup status was not shown: '+status.textContent);
            if(document.querySelector('[data-candidate-form] h2')?.textContent!==authored.name)throw Error('The unfinished review was replaced');
            if(calls.prepare||calls.submit)throw Error('Local processing attempted publication');
            window.syntheticContributionWorkspace=workspace;
            return {active:saved.candidates.length,removedUntouched:1,authoredReviewPreserved:true,message:status.textContent,calls};
        })()`);
        assert.equal(result.removedUntouched,1);assert.equal(result.authoredReviewPreserved,true);
        if(screenshot){await fs.mkdir(path.dirname(screenshot),{recursive:true});await fs.writeFile(screenshot,(await window.capturePage()).toPNG());}
        console.log(JSON.stringify({nativeWindow:true,isolatedProfile:true,externalRequests:false,syntheticStorage:true,...result}));
    }finally{clearTimeout(watchdog);window.destroy();await new Promise(done=>server.close(done));}
    app.exit(0);
}
try{
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-contribution-storage-fixture',version:'1.0.0',main:'main.cjs'}));
    await writeFile(join(temporary,'main.cjs'),`(${run.toString()})(${JSON.stringify({root,temporary,screenshot})}).catch(error=>{console.error(error);require('electron').app.exit(1);});`);
    const child=spawn(process.env.EOZ_TEST_ELECTRON_BINARY||require('electron'),[temporary],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
    const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done);});if(stdout)console.log(stdout.trim());if(code!==0&&stderr)console.error(stderr.trim());assert.equal(code,0,'Contribution storage component fixture failed');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-contribution-storage-'));await rm(temporary,{recursive:true,force:true});}
