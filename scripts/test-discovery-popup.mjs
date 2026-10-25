import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('../',import.meta.url)),temporary=await mkdtemp(join(tmpdir(),'eoz-discovery-popup-'));
const flag=process.argv.indexOf('--screenshots'),output=flag<0?null:resolve(process.argv[flag+1]);
async function run({root,profile,output}){
 const {app,BrowserWindow,ipcMain,screen}=require('electron'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
 app.setPath('userData',profile);app.disableHardwareAcceleration();await app.whenReady();
 const resources=new Map([['/discovery-notices.html','text/html'],['/discovery-notices.js','text/javascript'],['/discovery-notices.css','text/css'],['/wiki-discovery-ui.js','text/javascript']]);
 const server=http.createServer((request,response)=>{if(request.url==='/'){response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Synthetic notice owner</title><h1>Synthetic notice owner</h1>');return;}const type=resources.get(request.url);if(!type){response.writeHead(404);response.end();return;}void fs.readFile(path.join(root,'app',request.url.slice(1))).then(bytes=>{response.setHeader('Content-Type',type);response.end(bytes);}).catch(()=>{response.writeHead(500);response.end();});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 let captures=0,lookups=0,mainFocus=0;const main=new BrowserWindow({show:false,width:800,height:600,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const originalFocus=main.focus.bind(main);main.focus=()=>{mainFocus++;originalFocus();};
 const {DiscoveryHost}=require(path.join(root,'desktop/discovery-host.cjs'));
 const host=new DiscoveryHost({electron:{BrowserWindow,ipcMain,screen,desktopCapturer:{getSources(){captures++;throw Error('No desktop capture allowed in this informational fixture.');}}},origin,getMainWindow:()=>main,itemExistence:{async check(){lookups++;return{status:'missing',source:'live'};},clear(){},dispose(){}}});
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const until=async(predicate,label,timeout=5000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{const value=await predicate();if(value)return value;}catch{}await wait(50);}throw Error('Timed out: '+label);};
 const execute=(window,fn,...args)=>window.webContents.executeJavaScript(`(${fn.toString()})(...${JSON.stringify(args)})`);
 try{
  await main.loadURL(origin+'/');const focused=BrowserWindow.getFocusedWindow();
  await execute(main,async()=>{await window.eyeOfZommDiscovery.show({id:'synthetic-linked',kind:'item',purpose:'item-link',name:'Synthetic Missing Blade'});await window.eyeOfZommDiscovery.show({id:'synthetic-second',kind:'item',purpose:'item-link',name:'Another Synthetic Relic'});});
  const popup=host.notices.window;assert(popup);await until(()=>execute(popup,()=>document.querySelectorAll('.wiki-discovery-card').length===2),'two standalone cards');
  await until(async()=>Math.abs(popup.getBounds().height-await execute(popup,()=>Math.ceil(document.querySelector('main').scrollHeight+4)))<=2,'measured stack height');
  assert.equal(mainFocus,0,'A notice never focuses main');assert.equal(BrowserWindow.getFocusedWindow(),focused,'Showing notices preserves foreground app focus');assert.equal(captures,0);assert.equal(lookups,2);
  assert.equal(BrowserWindow.getAllWindows().length,2,'Timers is disabled and no Timers window was opened');
  assert(BrowserWindow.getAllWindows().every(window=>!window.webContents.getURL().includes('panel=timers')));
  const bounds=popup.getBounds(),work=screen.getDisplayMatching(main.getBounds()).workArea;
  // Windows fractional display scaling can round native bounds by one DIP.
  assert(Math.abs(bounds.x-(work.x+work.width-bounds.width-12))<=2);assert(Math.abs(bounds.y-(work.y+work.height-bounds.height-12))<=2);assert(bounds.height<=work.height-22);assert(popup.isAlwaysOnTop());
  if(output){await fs.mkdir(output,{recursive:true});let image,lastCaptureError;for(let attempt=0;attempt<4;attempt++){await execute(popup,()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await wait(100);try{image=await popup.capturePage(undefined,{stayHidden:true,stayAwake:true});if(!image.isEmpty())break;}catch(error){lastCaptureError=error;}}if(!image||image.isEmpty())throw lastCaptureError||Error('The native popup produced an empty capture.');await fs.writeFile(path.join(output,'discovery-popup.png'),image.toPNG());}
  await execute(popup,()=>document.querySelector('[data-discovery-id="synthetic-second"] [data-discovery-command="ignore"]').click());
  await until(()=>host.noticeState().length===1,'Ignore removes one card');assert.equal(mainFocus,0);assert.equal(captures,0);
  await assert.rejects(execute(popup,()=>window.eyeOfZommDiscoveryNotices.action('capture-status',{id:'synthetic-linked',status:'captured'})),/unavailable/);
  await execute(popup,()=>document.querySelector('[data-discovery-command="contribute"]').click());await until(()=>host.noticeState()[0]?.captureState==='waiting','explicit Contribute');assert.equal(mainFocus,1);assert.equal(captures,0,'The notice itself never captures before the main contribution workflow');
  const request=host.noticeState()[0].captureRequest,completedAt=Date.now();await execute(main,request=>window.eyeOfZommDiscovery.action('capture-status',{id:'synthetic-linked',purpose:'item-link',captureRequest:request,status:'captured',matchedName:'Synthetic Missing Blade +5'}),request);
  await until(()=>execute(popup,()=>Boolean(document.querySelector('.is-complete'))),'green capture receipt');await wait(1100);assert.equal(host.noticeState().length,1,'Completion survives the former subsecond expiry');await until(()=>host.noticeState().length===0,'completion expires after 15 seconds',20000);const completionLifetimeMs=Date.now()-completedAt;assert(completionLifetimeMs>=14500);assert(!popup.isVisible());
  const receipt={verifiedAt:new Date().toISOString(),nativeWindow:true,isolatedSyntheticProfile:true,timersWindows:0,foregroundPreservedOnNotice:true,mainFocusOnlyAfterContribute:true,noAutomaticCapture:true,bounds,workArea:work,stackedCards:2,ignore:true,contribute:true,completionExpiry:true,completionLifetimeMs,exactNoticeFrame:true};
  if(output)await fs.writeFile(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
 }finally{host.dispose();if(!main.isDestroyed())main.destroy();await new Promise(resolve=>server.close(resolve));}
 app.exit(0);
}
try{
 await mkdir(join(temporary,'profile'),{recursive:true});
 await writeFile(join(temporary,'package.json'),JSON.stringify({name:'eoz-native-discovery-fixture',version:'1.0.0',main:'main.cjs'}));
 await writeFile(join(temporary,'main.cjs'),`(${run.toString()})(${JSON.stringify({root,profile:join(temporary,'profile'),output})}).catch(error=>{console.error(error);require('electron').app.exit(1);});`);
 const executable=process.env.EOZ_TEST_ELECTRON_BINARY||require('electron'),child=spawn(executable,[temporary],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(stdout)console.log(stdout.trim());if(code!==0&&stderr)console.error(stderr.trim());assert.equal(code,0,'Isolated native discovery-popup fixture failed');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-discovery-popup-'));await rm(temporary,{recursive:true,force:true});}
