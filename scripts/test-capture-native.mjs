import {mkdtemp,writeFile,rm,mkdir,copyFile,cp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
import {hoverFixtureHtml} from '../tests/fixtures/screen-read/hover-layout.mjs';
import {drawModernOcrFixture} from '../tests/fixtures/screen-read/modern-layout.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-native-capture-'));
const packagedIndex=process.argv.indexOf('--packaged-root'),packagedRoot=packagedIndex>=0?resolve(process.argv[packagedIndex+1]):null;
async function run({root,temporary,packagedRoot,hoverHtml,baselineHtml}){
    const {app,BrowserWindow}=require('electron'),electron=require('electron'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    if(packagedRoot){const {validateOcrRuntime}=require(path.join(packagedRoot,'desktop','ocr-runtime.cjs'));validateOcrRuntime(path.join(path.dirname(packagedRoot),'ocr-runtime'));}
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
    const ocr=new (require(path.join(sourceRoot,'desktop','ocr-service.cjs')).OcrService)({packaged:Boolean(packagedRoot),resourcesPath:packagedRoot?path.dirname(packagedRoot):process.resourcesPath});
    const recognize=ocr.recognize.bind(ocr),ocrTimes=[],records=[],admissions=[];let gateNext=false,releaseGate,gateStarted;
    ocr.recognize=async(...args)=>{if(gateNext){gateNext=false;await new Promise(resolve=>{releaseGate=resolve;gateStarted?.();});}const started=Date.now();try{return await recognize(...args);}finally{ocrTimes.push(Date.now()-started);}};
    const host=new CaptureHost({electron,ocr,origin,getMainWindow:()=>main,onObservation:value=>{records.push(value);resolveObservation(value);}});
    const submitFrame=host.submitFrame.bind(host);host.submitFrame=value=>{const result=submitFrame(value);if(result.accepted)admissions.push({capturedAt:value.capturedAt,generation:host.generation});return result;};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async(predicate,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await wait(40);}throw Error(`${label}: ${JSON.stringify(host.getStatus())}`);};
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
        const preview=host.preview();
        if(!preview.dataUrl.startsWith('data:image/png;base64,')||preview.sourceSize.width<100||!host.getStatus().hasPreview)throw new Error('Current-frame calibration preview is unavailable.');
        const nextObservation=new Promise(done=>{resolveObservation=done;});
        await host.setRegion({region:{x:.01,y:.01,width:.98,height:.98},referenceSize:preview.sourceSize,sourceId:preview.sourceId,sessionId:preview.sessionId});
        const cropped=await Promise.race([nextObservation,new Promise((_,reject)=>setTimeout(()=>reject(Error('Calibrated native OCR timed out.')),15000))]);
        if(cropped.subject.name!=='Synthetic Test Blade +3'||cropped.input.region.x<1||cropped.input.region.width>=cropped.input.sourceSize.width)throw new Error('Calibrated native capture did not preserve crop provenance.');
        await host.setRegion({region:null,sourceId:preview.sourceId,sessionId:preview.sessionId});
        await host.captureScreenshot({sourceId:source.id});
        if(electron.clipboard.readImage().isEmpty())throw new Error('The synthetic screenshot was not copied.');
        // Hold the first real OCR invocation while the authorized native stream
        // sees three short-lived hover tooltips. No pixel fixture is sent by IPC.
        await host.pause();await game.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(hoverHtml));
        gateNext=true;const held=new Promise(resolve=>{gateStarted=resolve;});await host.resume();await Promise.race([held,wait(5000).then(()=>{throw Error('The hover source did not reach its first real OCR job.');})]);
        const hoverGeneration=host.generation,names=['Copperleaf Coat +4','Synthetic Needle +3','Synthetic Amber Band +2'];
        await game.webContents.executeJavaScript(`window.drawFixture(${JSON.stringify({name:names[1],weapon:true})})`);await wait(700);
        await game.webContents.executeJavaScript(`window.drawFixture(${JSON.stringify({name:names[2],weapon:false})})`);await wait(700);
        await until(()=>host.getStatus().queuedFrames>=2,'Brief hover frames were not retained while OCR was held',5000);
        const releasedAt=Date.now();releaseGate();releaseGate=null;
        await until(()=>names.every(name=>records.some(record=>record.subject.name===name&&record.input?.captureGeneration===hoverGeneration)),'Real OCR did not recover all queued hover identities');
        const hoverRecords=names.map(name=>records.find(record=>record.subject.name===name&&record.input?.captureGeneration===hoverGeneration));
        for(const record of hoverRecords){if(record.owner!=='character'||record.sessionId!=='native-synthetic'||record.input.sourceId!==source.id||Date.parse(record.capturedAt)>=releasedAt)throw Error('Queued hover evidence lost its original source/session/time provenance.');}
        const cadence=admissions.filter(frame=>frame.generation===hoverGeneration&&frame.capturedAt<releasedAt).map(frame=>frame.capturedAt);
        if(cadence.length<3)throw Error('The actual native stream did not admit three brief tooltip frames.');
        const frameRate=await host.captureWindow.webContents.executeJavaScript('document.querySelector("video").srcObject.getVideoTracks()[0].getSettings().frameRate');
        console.log('EOZ_TRANSIENT_CAPTURE='+JSON.stringify({ok:true,tooltips:3,realWindowStream:true,offlineOcr:true,heldFirstRead:true,queuedBeforeRelease:cadence.length,originalCaptureTime:true,ownerAndGeneration:true,requestedFrameRate:8,actualFrameRate:frameRate,maximumPngRate:4,maximumQueuedFrames:12,maximumQueuedBytes:48*1024*1024,ocrCalls:ocrTimes.length,ocrMeanMs:Math.round(ocrTimes.reduce((sum,value)=>sum+value,0)/ocrTimes.length),ocrMaxMs:Math.max(...ocrTimes)}));
        await host.pause();await game.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(baselineHtml));
        await host.resume();const baselineGeneration=host.generation;
        await until(()=>records.some(record=>record.subject.kind==='character'&&record.input?.captureGeneration===baselineGeneration),'Initial NoEquipment stat frame was not recognized');const phaseCutoff=Date.now();
        await until(()=>records.some(record=>record.subject.kind==='character'&&record.input?.captureGeneration===baselineGeneration&&Date.parse(record.capturedAt)>phaseCutoff),'Unchanged NoEquipment pixels did not refresh after the phase cutoff',10000);
        const freshBase=records.find(record=>record.subject.kind==='character'&&record.input?.captureGeneration===baselineGeneration&&Date.parse(record.capturedAt)>phaseCutoff);
        if(freshBase.input.sourceId!==source.id||freshBase.fields.find(field=>field.key==='hpMaximum')?.value!==901)throw Error('Refreshed baseline lost its source or observed maximum.');
        console.log('EOZ_UNCHANGED_BASELINE='+JSON.stringify({ok:true,realWindowStream:true,samePixels:true,freshCaptureAfterPhase:true,ownerAndGeneration:true,screenDedupMs:3000}));
        await host.stop({mode:'character'});
        if(host.captureWindow||host.ocr.worker||host.owner)throw new Error('Capture Stop retained a source or OCR worker.');
        const history=await host.journal.read();if(history.records.length<1)throw new Error('Native observation was not journaled.');
        console.log(`Native ${packagedRoot?'packaged ASAR':'source'} persistent capture -> local OCR -> calibration preview/region -> character observation -> private journal -> clipboard -> Stop passed.`);
    }finally{releaseGate?.();clearTimeout(watchdog);await host.dispose();electron.clipboard.write(previousClipboard);game.destroy();main.destroy();await new Promise(done=>server.close(done));}
    app.exit(0);
}
try{
    let isolatedPackage=packagedRoot;
    if(packagedRoot){
        const resources=join(temporary,'isolated-package','resources');await mkdir(resources,{recursive:true});
        isolatedPackage=join(resources,'app.asar');await copyFile(packagedRoot,isolatedPackage);
        await cp(join(dirname(packagedRoot),'ocr-runtime'),join(resources,'ocr-runtime'),{recursive:true,errorOnExist:true,force:false});
        const fromRepo=relative(root,resources);if(!isAbsolute(fromRepo)&&fromRepo!== '..'&&!fromRepo.startsWith(`..${process.platform==='win32'?'\\':'/'}`))throw Error('Packaged OCR fixture must be isolated from repository node_modules.');
    }
    const hoverHtml=hoverFixtureHtml().replace('canvas{display:block}','canvas{display:block;width:960px;height:540px}');
    const baselineHtml=`<!doctype html><title>EverQuest Synthetic Hover Fixture</title><style>body{margin:0;background:#080e18}canvas{width:720px;height:675px}</style><body><script>const original=(${drawModernOcrFixture.toString()})(document),canvas=document.createElement('canvas');canvas.width=960;canvas.height=900;canvas.getContext('2d').drawImage(original,1600,0,960,900,0,0,960,900);document.body.append(canvas);</script>`;
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,packagedRoot:isolatedPackage,hoverHtml,baselineHtml})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_PATH;
    const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry],{cwd:temporary,env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});
    if(code!==0)throw new Error(`Native capture verification failed (${code}).`);
}finally{if(dirname(resolve(temporary))!==resolve(tmpdir())||!basename(temporary).startsWith('eoz-native-capture-'))throw Error('Unsafe capture fixture cleanup path.');await rm(temporary,{recursive:true,force:true});}
