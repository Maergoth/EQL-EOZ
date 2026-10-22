import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-native-capture-'));
const packagedIndex=process.argv.indexOf('--packaged-root'),packagedRoot=packagedIndex>=0?resolve(process.argv[packagedIndex+1]):null;
async function run({root,temporary,packagedRoot}){
    const {app,BrowserWindow}=require('electron'),electron=require('electron'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const sourceRoot=packagedRoot||root,{CaptureHost}=require(path.join(sourceRoot,'desktop','capture-host.cjs'));
    const server=http.createServer(async(request,response)=>{
        const name=request.url==='/'?null:request.url?.slice(1);
        if(!name){response.end('<!doctype html><title>Eye of Zomm test control</title>');return;}
        if(!['capture-source.html','capture-source.js'].includes(name)){response.writeHead(404).end();return;}
        response.setHeader('Content-Type',name.endsWith('.html')?'text/html':'text/javascript');response.end(await fs.readFile(path.join(sourceRoot,'app',name)));
    });
    await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
    const main=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});await main.loadURL(`${origin}/`);
    const game=new BrowserWindow({width:1000,height:760,show:false,title:'EverQuest Synthetic Capture Fixture',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    const text='Item Name: Synthetic Test Blade +3\nDescription\nSynthetic Test Blade +3\nNo Trade\nClass: WAR / PAL\nRace: ALL\nSlot: PRIMARY / SECONDARY\nTier 3 / 10\nAC 12\nHP 45\nMana 20\nSTR 8\nDMG 9 Delay 24\nWeight 2.5\nRequired Level 15\nModified';
    await game.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><title>EverQuest Synthetic Capture Fixture</title><body style="background:white;color:black;margin:24px"><pre style="font:28px/38px Arial">'+text+'</pre>'));
    game.showInactive();
    let resolveObservation;const observation=new Promise(done=>{resolveObservation=done;});
    const ocr=packagedRoot?new (require(path.join(sourceRoot,'desktop','ocr-service.cjs')).OcrService)({packaged:true,resourcesPath:path.dirname(packagedRoot)}):undefined;
    const host=new CaptureHost({electron,ocr,origin,getMainWindow:()=>main,onObservation:resolveObservation});
    const previousClipboard={text:electron.clipboard.readText(),html:electron.clipboard.readHTML(),rtf:electron.clipboard.readRTF()};
    const previousImage=electron.clipboard.readImage();if(!previousImage.isEmpty())previousClipboard.image=previousImage;
    const watchdog=setTimeout(()=>{console.error('Native capture watchdog:',JSON.stringify(host.getStatus()));app.exit(1);},35000);
    try{
        const sources=await host.listSources(),source=sources.find(source=>source.name==='EverQuest Synthetic Capture Fixture');
        if(!source)throw new Error('The synthetic native source could not be enumerated.');
        console.log('Synthetic capture source selected.');
        await host.start({mode:'character',sourceId:source.id,sessionId:'native-synthetic'});
        const record=await Promise.race([observation,new Promise((_,reject)=>setTimeout(()=>reject(new Error(`Native capture timed out: ${JSON.stringify(host.getStatus())}`)),25000))]);
        if(record.subject.name!=='Synthetic Test Blade +3'||record.owner!=='character')throw new Error('Unexpected native OCR observation.');
        await host.captureScreenshot({sourceId:source.id});
        if(electron.clipboard.readImage().isEmpty())throw new Error('The synthetic screenshot was not copied.');
        await host.stop({mode:'character'});
        if(host.captureWindow||host.ocr.worker||host.owner)throw new Error('Capture Stop retained a source or OCR worker.');
        const history=await host.journal.read();if(history.records.length<1)throw new Error('Native observation was not journaled.');
        console.log(`Native ${packagedRoot?'packaged ASAR':'source'} persistent capture -> local OCR -> character observation -> private journal -> clipboard -> Stop passed.`);
    }finally{clearTimeout(watchdog);await host.dispose();electron.clipboard.write(previousClipboard);game.destroy();main.destroy();await new Promise(done=>server.close(done));}
    app.exit(0);
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,packagedRoot})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});
    if(code!==0)throw new Error(`Native capture verification failed (${code}).`);
}finally{await rm(temporary,{recursive:true,force:true});}
