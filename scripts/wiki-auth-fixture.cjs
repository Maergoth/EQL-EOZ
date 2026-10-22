'use strict';
const assert=require('node:assert/strict');
const http=require('node:http');
const crypto=require('node:crypto');
const path=require('node:path');
const {app,BrowserWindow,session,ipcMain,nativeImage}=require('electron');
const {WikiHost}=require('../desktop/wiki-host.cjs');
const profile=process.argv.find(value=>value.startsWith('--eoz-fixture-profile='))?.slice('--eoz-fixture-profile='.length);
if(!profile||!path.isAbsolute(profile))throw new Error('An isolated native wiki fixture profile is required.');
app.setPath('userData',profile);
app.commandLine.appendSwitch('disable-gpu');
const requests=[],pages=new Map(),files=new Map(),blueprint='== Items ==\n=== Item Page Blueprint ===\n<pre>{{Itempage|itemname=|statsblock=}}</pre>';
let server,main,host,expectedImage;
const handler=async(req,res)=>{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/') {res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Trusted local main fixture</title><body>Main fixture</body>');return;}
    if(url.pathname==='/index.php') {res.writeHead(200,{'Content-Type':'text/html','Set-Cookie':'eozFixtureLogin=verified; Path=/; HttpOnly; SameSite=Lax'});res.end('<!doctype html><title>Synthetic wiki login</title><body id="wiki-login">Synthetic signed-in wiki account</body>');return;}
    if(url.pathname!=='/api.php'){res.writeHead(404);res.end();return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks),authenticated=req.headers.cookie?.includes('eozFixtureLogin=verified');
    if(req.headers['content-type']?.startsWith('multipart/form-data')){
        const text=body.toString('latin1'),field=name=>text.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
        assert.ok(authenticated);assert.equal(field('action'),'upload');assert.equal(field('assertuser'),'Native Fixture Editor');assert.equal(field('token'),'NATIVE-FIXTURE-TOKEN');assert.equal(field('ignorewarnings'),undefined);assert.ok(body.includes(expectedImage),'Native session.fetch sends exact PNG bytes in multipart');
        files.set(field('filename'),{sha1:crypto.createHash('sha1').update(expectedImage).digest('hex'),user:'Native Fixture Editor'});requests.push({action:'upload',method:'POST',authenticated:true});
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({upload:{result:'Success',imageinfo:{url:'http://fixture/synthetic.png'}}}));return;
    }
    const params=req.method==='POST'?new URLSearchParams(body.toString()):url.searchParams;
    requests.push({action:params.get('action'),method:req.method,authenticated:req.headers.cookie?.includes('eozFixtureLogin=verified')===true});
    const json=value=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(params.get('meta')==='userinfo'){json({query:{userinfo:authenticated?{id:11,name:'Native Fixture Editor',rights:['edit','createpage','upload']}:{id:0,name:'Anonymous',anon:true}}});return;}
    if(params.get('meta')==='tokens'){assert.ok(authenticated);assert.equal(params.get('assertuser'),'Native Fixture Editor');json({query:{tokens:{csrftoken:'NATIVE-FIXTURE-TOKEN'}}});return;}
    if(params.get('list')){json({query:{[params.get('list')]:[]}});return;}
    if(params.get('prop')==='imageinfo'){const filename=params.get('titles').replace(/^File:/,'');json({query:{pages:[files.has(filename)?{title:`File:${filename}`,imageinfo:[files.get(filename)]}:{title:`File:${filename}`,missing:true}]}});return;}
    if(params.get('action')==='query'){
        json({curtimestamp:'2026-10-22T12:00:00Z',query:{pages:params.get('titles').split('|').map(title=>title==='Help:Contents'?{title,pageid:1,ns:12,revisions:[{revid:77,timestamp:'2026-10-22T00:00:00Z',slots:{main:{content:blueprint}}}]}:title==='Template:Classic Era'?{title,pageid:3,ns:10}:pages.has(title)?{title,pageid:2,ns:0,revisions:[{revid:88,timestamp:'2026-10-22T12:00:00Z',slots:{main:{content:pages.get(title)}}}]}:{title,ns:0,missing:true})}});return;
    }
    if(params.get('action')==='edit'){
        assert.ok(authenticated);assert.equal(params.get('token'),'NATIVE-FIXTURE-TOKEN');assert.equal(params.get('assertuser'),'Native Fixture Editor');assert.equal(params.get('createonly'),'1');pages.set(params.get('title'),params.get('text'));json({edit:{result:'Success',newrevid:88,pageid:2}});return;
    }
    json({error:{code:'fixture-unsupported',info:'Unsupported fixture request'}});
};
async function run(){
    await app.whenReady();server=http.createServer((req,res)=>handler(req,res).catch(error=>{res.writeHead(500);res.end(error.stack);}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
    main=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});await main.loadURL(`${origin}/`);
    const event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
    host=new WikiHost({electron:{app,BrowserWindow,session,ipcMain,nativeImage},origin,getMainWindow:()=>main,stateDir:path.join(profile,'plans'),version:'fixture',devWikiOrigin:origin,allowLoopbackDevelopment:true,onStatus:()=>{}});
    assert.equal((await host.handle(event,'status')).authenticated,false);
    host.handle(event,'login');const login=host.loginWindow;
    if(login.webContents.isLoadingMainFrame())await new Promise(resolve=>login.webContents.once('did-finish-load',resolve));
    const security=await login.webContents.executeJavaScript('({require:typeof require,process:typeof process,windowBridge:typeof window.eyeOfZommWindow,wikiBridge:typeof window.eyeOfZommWiki,content:document.body.textContent})');
    assert.deepEqual(security,{require:'undefined',process:'undefined',windowBridge:'undefined',wikiBridge:'undefined',content:'Synthetic signed-in wiki account'});
    const preferences=login.webContents.getLastWebPreferences();assert.equal(preferences.nodeIntegration,false);assert.equal(preferences.contextIsolation,true);assert.equal(preferences.sandbox,true);assert.equal(preferences.webSecurity,true);assert.ok(!preferences.preload);
    assert.equal((await host.handle(event,'status')).user.name,'Native Fixture Editor');
    await assert.rejects(host.handle({sender:login.webContents,senderFrame:login.webContents.mainFrame},'status'),/main app/);
    await assert.rejects(host.handle({sender:main.webContents,senderFrame:{url:`${origin}/`}},'status'),/main app/);
    const plan=await host.handle(event,'prepare-plan',{candidate:{kind:'item',name:'Native Fixture Shield',era:'Classic Era',fields:{statLines:{value:['Slot: SECONDARY','AC: 5'],confirmed:true}}},matchesReviewed:true});assert.deepEqual(plan.blockers,[]);
    const result=await host.handle(event,'submit-plan',{planId:plan.id,reviewDigest:plan.reviewDigest});assert.equal(result.status,'submitted');assert.match(pages.get('Native Fixture Shield'),/Itempage/);assert.equal(requests.filter(request=>request.method==='POST'&&request.action==='edit'&&request.authenticated).length,1);
    expectedImage=nativeImage.createFromBitmap(Buffer.from([0,0,255,255]),{width:1,height:1}).toPNG();
    const uploaded=await host.handle(event,'upload-character',{png:new Uint8Array(expectedImage),characterName:'Native Fixture',caption:'A synthetic fixture image.',confirmed:true});assert.equal(uploaded.upload,'applied');assert.equal(uploaded.talk,'applied');assert.equal(requests.filter(request=>request.action==='upload').length,1);assert.match(pages.get('User_talk:Native Fixture Editor'),/File:EoZ Native Fixture/);
    // Real page navigation initiated by fixture JS must not escape the wiki
    // origin. No external connection is needed for this blocked attempt.
    let blocked=false;login.webContents.once('will-navigate',event=>{blocked=event.defaultPrevented;});
    await login.webContents.executeJavaScript("location.href='https://invalid.example/eoz-auth-fixture'").catch(()=>{});
    await new Promise(resolve=>setTimeout(resolve,150));assert.equal(blocked,true);assert.equal(new URL(login.webContents.getURL()).origin,origin);
    await host.handle(event,'logout');assert.equal((await host.handle(event,'status')).authenticated,false);assert.equal((await session.fromPartition('eye-of-zomm-wiki-development').cookies.get({url:origin})).length,0);
    console.log('Native Electron wiki fixture: dedicated HttpOnly login cookies, session.fetch CSRF/create-only write, exact multipart PNG upload and own-talk edit, no remote preload/Node/IPC, navigation isolation and logout passed.');
}
run().then(()=>finish(0),error=>{console.error(error.stack||error);finish(1);});
async function finish(code){try{host?.dispose();main?.destroy();server?.closeAllConnections();if(server)await new Promise(resolve=>server.close(resolve));}finally{app.exit(code);}}
