import {mkdtemp,writeFile,rm,mkdir,copyFile,cp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
import {hoverFixtureHtml} from '../tests/fixtures/screen-read/hover-layout.mjs';
import {drawModernOcrFixture} from '../tests/fixtures/screen-read/modern-layout.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-native-capture-'));
const packagedIndex=process.argv.indexOf('--packaged-root'),packagedRoot=packagedIndex>=0?resolve(process.argv[packagedIndex+1]):null;
const scaleIndex=process.argv.indexOf('--scale-factor'),scaleFactor=scaleIndex<0?null:Number(process.argv[scaleIndex+1]);
if(scaleFactor!==null&&![1,1.5].includes(scaleFactor))throw Error('--scale-factor must be 1 or 1.5');
async function run({root,temporary,packagedRoot,hoverHtml,baselineHtml,scaleFactor}){
    const {app,BrowserWindow}=require('electron'),electron=require('electron'),http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
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
    const game=new BrowserWindow({width:1000,height:760,show:false,title:'EverQuest Synthetic Capture Fixture',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    const text='Item Name: Synthetic Test Blade +3\nDescription\nSynthetic Test Blade +3\nNo Trade\nClass: WAR / PAL\nRace: ALL\nSlot: PRIMARY / SECONDARY\nTier 3 / 10\nAC 12\nHP 45\nMana 20\nSTR 8\nDMG 9 Delay 24\nWeight 2.5\nRequired Level 15\nModified';
    await game.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><title>EverQuest Synthetic Capture Fixture</title><body style="background:white;color:black;margin:24px"><pre style="font:28px/38px Arial">'+text+'</pre>'));
    game.showInactive();
    let resolveObservation;const observation=new Promise(done=>{resolveObservation=done;});
    const ocr=new (require(path.join(sourceRoot,'desktop','ocr-service.cjs')).OcrService)({packaged:Boolean(packagedRoot),resourcesPath:packagedRoot?path.dirname(packagedRoot):process.resourcesPath});
    const recognize=ocr.recognize.bind(ocr),ocrTimes=[],ocrReads=[],records=[],admissions=[],stages=[];let gateNext=false,releaseGate,gateStarted,captureStages=false,frameRate=null,renderGeometry=null;
    ocr.recognize=async(...args)=>{if(gateNext){gateNext=false;await new Promise(resolve=>{releaseGate=resolve;gateStarted?.();});}const started=Date.now();try{const read=await recognize(...args);if(captureStages){ocrReads.push({layout:args[1]?.layout||'sparse',size:electron.nativeImage.createFromBuffer(args[0]).getSize(),text:read.text?.slice(0,600),words:read.words?.slice(0,12)});if(ocrReads.length>12)ocrReads.shift();}return read;}finally{ocrTimes.push(Date.now()-started);}};
    const host=new CaptureHost({electron,ocr,origin,getMainWindow:()=>main,onObservation:value=>{records.push(value);resolveObservation(value);}});
    // A synthetic two-color strip outside the tooltip acknowledges the pixels
    // that crossed the actual native stream. It is never supplied to OCR as a
    // name/result, and a previous frame's heartbeat cannot satisfy a new stage.
    function pixelStage(png){const image=electron.nativeImage.createFromBuffer(Buffer.from(png)),{width,height}=image.getSize(),pixels=image.toBitmap({scaleFactor:1});for(let y=0;y<Math.min(height,300);y+=2){let stage=0,first=0,second=0,gap=0;for(let x=0;x<Math.min(width,300);x++){const offset=(y*width+x)*4,value=pixels[offset],flat=Math.abs(value-pixels[offset+1])<=2&&Math.abs(value-pixels[offset+2])<=2,next=flat?(Math.abs(value-61)<=2?1:Math.abs(value-109)<=2?2:Math.abs(value-157)<=2?3:0):0;if(!second&&next&&(!stage||next===stage)){stage=next;first++;continue;}if(stage&&first>=16&&flat&&Math.abs(value-(231-[0,61,109,157][stage]))<=2){if(++second>=16)return stage;}else if(stage&&first>=16&&!second&&gap<4){gap++;}else{stage=next;first=next?1:0;second=0;gap=0;}}}return null;}
    const submitFrame=host.submitFrame.bind(host);host.submitFrame=value=>{const result=submitFrame(value);if(result.accepted||result.sceneAccepted)admissions.push({capturedAt:value.capturedAt,admittedAt:Date.now(),generation:host.generation,owner:value.owner,sessionId:value.sessionId,sourceId:value.sourceId,selection:value.selectionKind,sceneOnly:!result.accepted,itemRegion:value.itemRegion?{...value.itemRegion}:null,width:value.width,height:value.height,hash:crypto.createHash('sha256').update(value.bytes).digest('hex'),stage:captureStages?pixelStage(value.bytes):null});return result;};
    const diagnostics=()=>({status:host.getStatus(),geometry:{native:game.getBounds(),content:game.getContentBounds(),requestedScaleFactor:scaleFactor,renderer:renderGeometry},actualFrameRate:frameRate,stages,cadence:admissions.slice(-20),ocrReads,items:records.filter(record=>record.subject.kind==='item').map(record=>({name:record.subject.name,owner:record.owner,sessionId:record.sessionId,sourceId:record.input?.sourceId,generation:record.input?.captureGeneration,capturedAt:record.capturedAt,frameId:record.input?.frameId,selection:record.input?.captureSelection,ocrPasses:record.input?.ocrPasses,evidence:record.evidence?.text?.slice(0,1800)})).slice(-8)});
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async(predicate,label,timeout=20000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await wait(40);}throw Error(`${label}: ${JSON.stringify(diagnostics())}`);};
    const commit=()=>game.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const previousClipboard={text:electron.clipboard.readText(),html:electron.clipboard.readHTML(),rtf:electron.clipboard.readRTF()};
    const previousImage=electron.clipboard.readImage();if(!previousImage.isEmpty())previousClipboard.image=previousImage;
    const watchdog=setTimeout(()=>{console.error('Native capture watchdog:',JSON.stringify(diagnostics()));app.exit(1);},60000);
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
        await host.pause();await game.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(hoverHtml));game.showInactive();await commit();
        renderGeometry=await game.webContents.executeJavaScript('({innerWidth,innerHeight,devicePixelRatio,canvas:document.querySelector("canvas").getBoundingClientRect().toJSON()})');
        if(renderGeometry.innerWidth<960||renderGeometry.innerHeight<652)throw Error(`The full-size synthetic tooltip canvas must fit the actual viewport: ${JSON.stringify(diagnostics())}`);
        const firstDrawAt=await game.webContents.executeJavaScript('window.fixtureDrawAt');captureStages=true;
        gateNext=true;const held=new Promise(resolve=>{gateStarted=resolve;});await host.resume();await Promise.race([held,wait(5000).then(()=>{throw Error('The hover source did not reach its first real OCR job.');})]);
        const hoverGeneration=host.generation,names=['Copperleaf Coat +4','Synthetic Needle +3','Synthetic Amber Band +2'];
        frameRate=await host.captureWindow.webContents.executeJavaScript('document.querySelector("video").srcObject.getVideoTracks()[0].getSettings().frameRate');
        await until(()=>admissions.some(frame=>frame.generation===hoverGeneration&&frame.stage===1),'Initial committed tooltip pixels did not cross the native stream',1500);
        const firstAdmission=admissions.find(frame=>frame.generation===hoverGeneration&&frame.stage===1);stages.push({...firstAdmission,drawAt:firstDrawAt,drawToAdmissionMs:firstAdmission.admittedAt-firstDrawAt});
        for(const stage of [2,3]){
            const drawnAt=await game.webContents.executeJavaScript(`window.drawStage(${JSON.stringify({name:names[stage-1],weapon:stage===2})},${stage})`);await commit();
            stages.at(-1).visibleForMs=drawnAt-stages.at(-1).drawAt;
            // The frame's timestamp measures sampling. IPC/PNG delivery on a
            // busy runner may arrive later and must not masquerade as a missed
            // source frame. Retain a strict 500ms changed-pixel capture bound,
            // with a separate bounded wait for its native acknowledgment.
            await until(()=>admissions.some(frame=>frame.generation===hoverGeneration&&frame.stage===stage&&frame.capturedAt>=drawnAt),`Tooltip ${stage} pixels did not reach native admission`,5000);
            const admitted=admissions.find(frame=>frame.generation===hoverGeneration&&frame.stage===stage&&frame.capturedAt>=drawnAt);stages.push({...admitted,drawAt:drawnAt,drawToAdmissionMs:admitted.admittedAt-drawnAt});await wait(700);
            if(admitted.capturedAt-drawnAt>500)throw Error(`Tooltip ${stage} changed pixels were not sampled within500ms: ${JSON.stringify(diagnostics())}`);
        }
        await until(()=>host.getStatus().queuedFrames>=2,'Brief hover frames were not retained while OCR was held',5000);
        // Remove the final tooltip before draining OCR. A later heartbeat must
        // not substitute for a brief item already acknowledged in the queue.
        const hiddenAt=await game.webContents.executeJavaScript('(()=>{const at=Date.now(),canvas=document.querySelector("canvas"),context=canvas.getContext("2d");context.fillStyle="#23343d";context.fillRect(0,0,canvas.width,canvas.height);return at;})()');await commit();
        const releasedAt=Date.now();stages.at(-1).visibleForMs=hiddenAt-stages.at(-1).drawAt;releaseGate();releaseGate=null;
        // Semantic dedup may keep another admitted PNG of the same visible
        // item. Require its exact acknowledged bytes/time/context within this
        // stage's exposure, rather than requiring the first admitted variant.
        const queuedRecord=(name,stage)=>records.find(record=>record.subject.name===name&&record.owner===stage.owner&&record.sessionId===stage.sessionId&&record.input?.sourceId===stage.sourceId&&record.input?.captureGeneration===stage.generation&&admissions.some(frame=>frame.stage===stage.stage&&frame.owner===stage.owner&&frame.sessionId===stage.sessionId&&frame.sourceId===stage.sourceId&&frame.generation===stage.generation&&frame.capturedAt>=stage.drawAt&&frame.capturedAt<stage.drawAt+stage.visibleForMs&&frame.capturedAt<releasedAt&&frame.hash===record.input?.frameId&&frame.capturedAt===Date.parse(record.capturedAt)));
        await until(()=>names.every((name,index)=>queuedRecord(name,stages[index])),'Real OCR did not recover all queued hover identities with an exact acknowledged PNG, original timestamp and context inside each visible stage');
        const hoverRecords=names.map((name,index)=>queuedRecord(name,stages[index]));
        for(const record of hoverRecords){if(record.owner!=='character'||record.sessionId!=='native-synthetic'||record.input.sourceId!==source.id||Date.parse(record.capturedAt)>=releasedAt)throw Error(`Queued hover evidence lost its original source/session/time provenance: ${JSON.stringify({expected:{owner:'character',sessionId:'native-synthetic',sourceId:source.id,generation:hoverGeneration,capturedBefore:releasedAt},records:hoverRecords.map(item=>({name:item.subject.name,owner:item.owner,sessionId:item.sessionId,sourceId:item.input?.sourceId,generation:item.input?.captureGeneration,capturedAt:Date.parse(item.capturedAt),frameId:item.input?.frameId,selection:item.input?.captureSelection})),...diagnostics()})}`);}
        const cadence=admissions.filter(frame=>frame.generation===hoverGeneration&&frame.capturedAt<releasedAt).map(frame=>frame.capturedAt);
        if(cadence.length<3)throw Error('The actual native stream did not admit three brief tooltip frames.');
        captureStages=false;const devicePixelRatio=await game.webContents.executeJavaScript('devicePixelRatio');
        console.log('EOZ_TRANSIENT_CAPTURE='+JSON.stringify({ok:true,tooltips:3,realWindowStream:true,offlineOcr:true,heldFirstRead:true,queuedBeforeRelease:cadence.length,originalCaptureTime:true,ownerAndGeneration:true,requestedFrameRate:8,actualFrameRate:frameRate,requestedScaleFactor:scaleFactor,devicePixelRatio,stages,maximumChangedTooltipDrawToCaptureMs:500,nativeAcknowledgmentTimeoutMs:5000,maximumPngRate:4,maximumQueuedFrames:12,maximumQueuedBytes:48*1024*1024,ocrCalls:ocrTimes.length,ocrMeanMs:Math.round(ocrTimes.reduce((sum,value)=>sum+value,0)/ocrTimes.length),ocrMaxMs:Math.max(...ocrTimes)}));
        await host.pause();await game.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(baselineHtml));await commit();
        await host.resume();const baselineGeneration=host.generation;
        await until(()=>records.some(record=>record.subject.kind==='character'&&record.input?.captureGeneration===baselineGeneration),'Initial NoEquipment stat frame was not recognized');const phaseCutoff=Date.now();
        // A retained pre-cutoff frame can spend seven seconds in Windows IPC,
        // then finish OCR before the three-second hash TTL starts. Allow that
        // measured serial cycle plus the genuinely post-cutoff read; never
        // substitute delivery/completion time for the original capture time.
        await until(()=>records.some(record=>record.subject.kind==='character'&&record.input?.captureGeneration===baselineGeneration&&Date.parse(record.capturedAt)>phaseCutoff),'Unchanged NoEquipment pixels did not refresh after the phase cutoff',20000);
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
    // A Windows runner may expose only 655 CSS pixels after its native frame.
    // The tallest tooltip ends at 650, plus its 1.5px stroke; retain every pixel
    // while omitting the unused eight-pixel scene margin.
    // Native capture may defer static-window updates. Supply the small, regular
    // non-item damage that moving game scenery provides, without changing OCR.
    const hoverHtml=hoverFixtureHtml({x:300,y:20,width:960,height:652}).replace('</script>',`let damageTick=0;setInterval(()=>{const c=document.querySelector('canvas').getContext('2d');c.fillStyle='rgb('+(80+damageTick++%80)+',35,120)';c.fillRect(120,80,16,16);},125);const draw=window.drawFixture;window.drawStage=(options,stage)=>{window.fixtureDrawAt=Date.now();draw({...options,x:300,y:20,width:960,height:652});const c=document.querySelector('canvas').getContext('2d'),gray=[61,109,157][stage-1];c.fillStyle='rgb('+gray+','+gray+','+gray+')';c.fillRect(20,0,20,40);const other=231-gray;c.fillStyle='rgb('+other+','+other+','+other+')';c.fillRect(40,0,20,40);return window.fixtureDrawAt;};window.drawStage({},1);</script>`);
    const baselineHtml=`<!doctype html><title>EverQuest Synthetic Hover Fixture</title><style>body{margin:0;background:#080e18}canvas{width:720px;height:675px}</style><body><script>const original=(${drawModernOcrFixture.toString()})(document),canvas=document.createElement('canvas');canvas.width=960;canvas.height=900;canvas.getContext('2d').drawImage(original,1600,0,960,900,0,0,960,900);document.body.append(canvas);</script>`;
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,packagedRoot:isolatedPackage,hoverHtml,baselineHtml,scaleFactor})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_PATH;
    const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry,...(scaleFactor===null?[]:[`--force-device-scale-factor=${scaleFactor}`])],{cwd:temporary,env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});
    if(code!==0)throw new Error(`Native capture verification failed (${code}).`);
}finally{if(dirname(resolve(temporary))!==resolve(tmpdir())||!basename(temporary).startsWith('eoz-native-capture-'))throw Error('Unsafe capture fixture cleanup path.');await rm(temporary,{recursive:true,force:true});}
