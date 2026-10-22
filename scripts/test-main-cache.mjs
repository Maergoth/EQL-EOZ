import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import http from 'node:http';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import asar from '@electron/asar';

// A real Chromium disk-cache regression across process restarts. The optional
// installed ASAR is read only; every browser profile and write is disposable.
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),electron=require('electron');
const argument=name=>{const index=process.argv.indexOf(name);return index<0?null:process.argv[index+1];};
const installed=argument('--installed-asar')?resolve(argument('--installed-asar')):null;
const temporary=await mkdtemp(join(tmpdir(),'eoz-main-cache-'));
let server,phase='previous',hits=[];
try {
    const installedText=relative=>asar.extractFile(installed,relative).toString('utf8');
    const freshHtml=installed ? installedText('app/index.html') : await readFile(join(root,'app/index.html'),'utf8');
    const oldPolicy=installed ? installedText('desktop/main.cjs').match(/sendBuffer\(req, res, 200, mimeType\(target\), body, app\.isPackaged \? '([^']+)'/)?.[1] : 'public, max-age=3600';
    assert.equal(oldPolicy,'public, max-age=3600','The optional source must be the affected original released server.');
    assert(freshHtml.includes('id="appearance-settings"'),'Fresh wrapper contains the shipped Fonts controls.');
    const oldHtml='<!doctype html><html><head><link rel="stylesheet" href="/styles.css"></head><body><h1>Previous version synthetic cache fixture</h1><article id="previous-settings">Timers · Map &amp; intel · no Fonts</article><script src="/app.js"></script></body></html>';
    server=http.createServer((req,res)=>{
        hits.push({phase,path:req.url});
        const pathname=new URL(req.url,'http://fixture').pathname;
        const body=pathname==='/'||pathname==='/index.html' ? phase==='previous'?oldHtml:freshHtml
            : pathname==='/styles.css' ? `#previous-settings{color:${phase==='previous'?'rgb(1, 2, 3)':'rgb(4, 5, 6)'}}`
            : pathname==='/app.js' ? `document.documentElement.dataset.cacheCode='${phase}';` : '';
        res.writeHead(200,{'Cache-Control':oldPolicy,'Content-Type':pathname.endsWith('.css')?'text/css':pathname.endsWith('.js')?'text/javascript':'text/html'});res.end(body);
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port,origin=`http://127.0.0.1:${port}`;
    const profile=join(temporary,'profile'),game=join(temporary,'synthetic-game'),log=join(game,'Logs','eqlog_Fixture_Test.txt');
    await mkdir(join(game,'Logs'),{recursive:true});await mkdir(join(game,'Maps'));await mkdir(join(profile,'data'),{recursive:true});
    await writeFile(log,'[Thu Oct 22 01:00:00 2026] Synthetic cache regression.\n');
    await writeFile(join(profile,'eye-of-zomm-config.json'),JSON.stringify({eqRootPath:game,logPath:log,logSelection:'manual',frontendCacheVersion:'previous-synthetic-version'}));
    await writeFile(join(profile,'data','eye-of-zomm-pack.json'),JSON.stringify({meta:{schemaVersion:3,version:'cache-synthetic',sample:true},zones:[],items:[],npcs:[]}));
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-cache-regression',version:pkg.version,main:'main.cjs'}));
    const run=async(source,input)=>{
        await writeFile(join(temporary,'main.cjs'),`const {app}=require('electron');app.setPath('userData',${JSON.stringify(profile)});(${source.toString()})(${JSON.stringify(input)}).catch(error=>{console.error(error.stack||String(error));app.exit(1);});`);
        const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
        const result=await new Promise((resolve,reject)=>{const child=spawn(electron,[temporary,'--disable-gpu','--mute-audio'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('error',reject);child.on('exit',code=>resolve({code,output}));});
        assert.equal(result.code,0,result.output);const match=result.output.match(/EOZ_CACHE_RESULT=(.+)/);assert(match,result.output);return JSON.parse(match[1]);
    };
    const browser=async({origin})=>{
        const {app,BrowserWindow,session}=require('electron');await app.whenReady();
        const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
        session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith(origin+'/')}));
        await window.loadURL(origin+'/');
        const result=await window.webContents.executeJavaScript(`({fonts:Boolean(document.querySelector('#appearance-settings')),previous:Boolean(document.querySelector('#previous-settings')),code:document.documentElement.dataset.cacheCode})`);
        // Let Chromium's cache backend finish pending disk entries before exit.
        await new Promise(resolve=>setTimeout(resolve,1000));session.defaultSession.flushStorageData();
        console.log('EOZ_CACHE_RESULT='+JSON.stringify(result));window.destroy();app.quit();
    };
    assert.equal((await run(browser,{origin})).fonts,false);
    phase='fresh-installed';hits=[];
    assert((await(await fetch(origin+'/index.html')).text()).includes('id="appearance-settings"'));
    const stale=await run(browser,{origin});
    assert.equal(stale.fonts,false,'An ordinary restart reproduces the stale Fonts wrapper under the original cache policy.');
    assert.equal(stale.code,'previous','Unversioned JS can also survive the upgrade in disk cache.');
    assert(!hits.some(hit=>hit.path==='/'),'Chromium reused the old root HTML rather than requesting the fresh server.');
    await new Promise(resolve=>server.close(resolve));server=null;

    const application=async({root,port,version,expectedClear})=>{
        const electron=require('electron'),{app,BrowserWindow}=electron,http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
        let clearCount=0;const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const until=async(predicate,label)=>{const end=Date.now()+15000;while(Date.now()<end){const value=await predicate();if(value)return value;await wait(60);}throw Error(`Timed out: ${label}`);};
        BrowserWindow.prototype.show=()=>{};BrowserWindow.prototype.showInactive=()=>{};
        global.fetch=async()=>{throw Error('External network disabled in cache regression');};
        // Bind the real server to the origin warmed above without using or
        // stopping the user's live default-port server.
        const create=http.createServer;http.createServer=function(...args){const server=create.apply(this,args),listen=server.listen;server.listen=function(...values){if(values[0]===53147)values[0]=port;return listen.apply(this,values);};return server;};
        app.on('ready',()=>{const clear=electron.session.defaultSession.clearCache.bind(electron.session.defaultSession);electron.session.defaultSession.clearCache=async()=>{clearCount++;return clear();};});
        let inspected=false;app.on('browser-window-created',()=>{if(inspected)return;inspected=true;
            (async()=>{
                const owner=await until(()=>BrowserWindow.getAllWindows().find(window=>window.webContents.getURL()===`http://127.0.0.1:${port}/`),'real main window');
                const result=await until(()=>owner.webContents.executeJavaScript(`(()=>{const button=document.querySelector('[data-view="settings"]');if(!button||!window.eyeOfZommWindow)return false;button.click();const fonts=document.querySelector('#appearance-settings');if(!fonts)return false;fonts.scrollIntoView({block:'start'});const content=document.querySelector('.content'),controls=['settings-font-family','settings-font-size','reset-appearance'].map(id=>{const el=document.getElementById(id);if(!el)return null;const r=el.getBoundingClientRect(),c=content.getBoundingClientRect();return {id,visible:r.width>0&&r.height>0&&r.left>=c.left&&r.right<=c.right+1&&r.top>=c.top&&r.bottom<=c.bottom+1};});return{fonts:true,controls,title:document.title};})()`).catch(()=>false),'fresh Fonts controls after upgrade');
                assert.equal(clearCount,expectedClear,'Version marker clears the old cache once, then persists.');assert(result.controls.every(control=>control?.visible),JSON.stringify(result));
                const config=JSON.parse(await require('node:fs/promises').readFile(path.join(app.getPath('userData'),'eye-of-zomm-config.json'),'utf8'));assert.equal(config.frontendCacheVersion,version);
                const headers={};for(const asset of ['/','/app.js','/styles.css','/appearance.js']){const response=await electron.net.fetch(`http://127.0.0.1:${port}${asset}`,{bypassCustomProtocolHandlers:true});headers[asset]=response.headers.get('cache-control');assert.equal(headers[asset],'no-store');}
                console.log('EOZ_CACHE_RESULT='+JSON.stringify({...result,clearCount,headers,actualMain:true}));app.exit(0);
            })().catch(error=>{console.error(error.stack);app.exit(1);});});
        setTimeout(()=>{console.error('Cache application smoke exceeded 30 seconds');app.exit(2);},30000).unref();
        require(path.join(root,'desktop/main.cjs'));
    };
    const upgraded=await run(application,{root,port,version:pkg.version,expectedClear:1});
    const restarted=await run(application,{root,port,version:pkg.version,expectedClear:0});
    console.log('EOZ_MAIN_CACHE_SMOKE='+JSON.stringify({ok:true,originalInstalledAsarReadOnly:Boolean(installed),staleOriginalPolicyReproduced:true,staleCode:stale.code,upgrade:upgraded,restart:restarted,disposableProfile:true,installedAppModified:false}));
} finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-main-cache-'));
    await rm(temporary,{recursive:true,force:true});
}
