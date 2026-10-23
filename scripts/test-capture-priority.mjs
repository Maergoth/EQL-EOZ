import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {drawHoverFixture} from '../tests/fixtures/screen-read/hover-layout.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-capture-priority-'));
const imageIndex=process.argv.indexOf('--private-image'),privateImage=imageIndex<0?null:resolve(process.argv[imageIndex+1]);
const backgroundIndex=process.argv.indexOf('--private-background'),privateBackground=backgroundIndex<0?null:resolve(process.argv[backgroundIndex+1]);assert(!(privateImage&&privateBackground));
const diagnosticsIndex=process.argv.indexOf('--diagnostics'),diagnostics=diagnosticsIndex<0?null:resolve(process.argv[diagnosticsIndex+1]);
const modeIndex=process.argv.indexOf('--mode'),mode=modeIndex<0?'both':process.argv[modeIndex+1];assert(['both','native','pixels'].includes(mode));
async function run({root,temporary,draw,privateImage,privateBackground,diagnostics,mode}){
 const electron=require('electron'),{app,BrowserWindow}=electron,fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),assert=require('node:assert/strict');
 app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();app.commandLine.appendSwitch('force-device-scale-factor','1');app.on('window-all-closed',()=>{});await app.whenReady();
 const {CaptureHost}=require(path.join(root,'desktop/capture-host.cjs')),{OcrService}=require(path.join(root,'desktop/ocr-service.cjs'));
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),until=async(fn,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await wait(30);}throw Error(label);};
 const names=['Priority Copper Coat +4','Priority Needle +3','Priority Amber Band +2'];let pixelMode=false,sourcePrefix='';
 // Present each complete tooltip/marker with one blit to a persistent canvas,
 // as a game presents a frame. The8Hz scenery ticks never reset its bitmap.
 const fixtureCode=`const canvas=document.createElement('canvas'),stageBuffer=document.createElement('canvas');document.body.append(canvas);
 let options={name:${JSON.stringify(names[0])},x:300,y:2,width:960,height:652},tick=0,changed=true;const draw=${draw};
 function render(){
  if(changed){
   draw(stageBuffer,options);const stage=${JSON.stringify(names)}.indexOf(options.name)+1,gray=[61,109,157][stage-1],buffer=stageBuffer.getContext('2d');
   buffer.fillStyle='rgb('+gray+','+gray+','+gray+')';buffer.fillRect(options.x+20,options.y+100,16,8);buffer.fillStyle='rgb('+(231-gray)+','+(231-gray)+','+(231-gray)+')';buffer.fillRect(options.x+36,options.y+100,16,8);
   if(options.hidden){buffer.fillStyle='#23343d';buffer.fillRect(options.x-5,options.y-5,570,650);}
   if(canvas.width!==stageBuffer.width||canvas.height!==stageBuffer.height){canvas.width=stageBuffer.width;canvas.height=stageBuffer.height;}
   canvas.getContext('2d').drawImage(stageBuffer,0,0);changed=false;
  }
  const c=canvas.getContext('2d');c.fillStyle='rgb('+ (80+tick++%80)+',35,120)';c.fillRect(0,0,options.x-4,options.height);c.fillRect(options.x+565,0,options.width-options.x-565,options.height);
 }
 window.priorityProducerState=()=>({at:Date.now(),...options,tick});window.drawPriority=async value=>{options={...options,...value};changed=true;render();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));};render();setInterval(render,125);`;
 function installWorkerFixture(delayMs){
  // Identify the actual immutable bitmap BEFORE its ownership transfers. The
  // request id, rather than call order or current producer state, owns the delay.
  const originalPost=Worker.prototype.postMessage,message=Object.getOwnPropertyDescriptor(Worker.prototype,'onmessage'),workers=new WeakMap();let workerNumber=0;
  if(!message?.set)throw Error('The real Worker message setter is unavailable.');
  window.priorityPngDelay={stage:null,kind:'worker-reply'};
  const state=worker=>{let value=workers.get(worker);if(!value){value={worker:++workerNumber,requests:new Map()};workers.set(worker,value);}return value;};
  function bitmapStage(bitmap,width,height){
   const large=width>2000,x=large?3020:320,y=large?1296:90,w=40,h=large?20:120;if(x+w>width||y+h>height)return null;
   const crop=new OffscreenCanvas(w,h);try{const context=crop.getContext('2d');context.drawImage(bitmap,x,y,w,h,0,0,w,h);const pixels=context.getImageData(0,0,w,h).data;
    const gray=(at,value)=>Math.abs(pixels[at]-value)<=3&&Math.abs(pixels[at+1]-value)<=3&&Math.abs(pixels[at+2]-value)<=3;
    for(let stage=1;stage<=3;stage++)for(let row=0;row<h;row++)for(let left=0;left<w-16;left++){let first=0,second=0,gap=0;const value=[61,109,157][stage-1];for(let col=left;col<w;col++){const at=(row*w+col)*4;if(!second&&gray(at,value))first++;else if(first>=8&&gray(at,231-value)){if(++second>=8)return stage;}else if(first>=8&&!second&&gap++<4)continue;else break;}}
    return null;
   }finally{crop.width=crop.height=1;}
  }
  Worker.prototype.postMessage=function(value,...args){
   const current=state(this);if(value?.bitmap){const stage=bitmapStage(value.bitmap,value.width,value.height),entry={worker:current.worker,id:value.id,stage,width:value.width,height:value.height,selectedAt:Date.now(),delay:stage===2&&window.priorityPngDelay.stage===null?delayMs:0};
    current.requests.set(value.id,entry);if(current.requests.size>16)current.requests.delete(current.requests.keys().next().value);
    if(entry.delay)window.priorityPngDelay={kind:'worker-reply',stage:2,worker:entry.worker,id:entry.id,selectedAt:entry.selectedAt,width:entry.width,height:entry.height};
    window.priorityTraceWorkerEvent?.({kind:'worker-invoke',at:Date.now(),...entry});
   }return originalPost.call(this,value,...args);
  };
  Object.defineProperty(Worker.prototype,'onmessage',{...message,set(handler){
   if(typeof handler!=='function'){message.set.call(this,handler);return;}const worker=this;
   message.set.call(worker,function(event){const current=state(worker),entry=current.requests.get(event.data?.id),receivedAt=Date.now();window.priorityTraceWorkerEvent?.({kind:'worker-reply',at:receivedAt,worker:current.worker,id:event.data?.id,stage:entry?.stage??null,ok:event.data?.ok,bytes:event.data?.bytes?.byteLength??null});if(entry?.delay)window.priorityPngDelay.workerReplyAt=receivedAt;
    const deliver=()=>{current.requests.delete(event.data?.id);window.priorityTraceWorkerEvent?.({kind:'worker-source-callback',at:Date.now(),worker:current.worker,id:event.data?.id,stage:entry?.stage??null});if(entry?.delay)window.priorityPngDelay.releasedAt=Date.now();handler.call(worker,event);};
    if(entry?.delay&&event.data?.ok===true)setTimeout(deliver,entry.delay);else deliver();
   });
  }});
 }
 function installPriorityTrace(){
  // Synthetic fixture only. Inspect the SAME frozen image as the real detector;
  // retain one small crop per stage, with PNG serialization deferred to failure.
  const trace={samples:0,stages:[],recent:[],events:[],eventCounts:{}},crops=new Map();let rawBands=null;
  const originalVisualPanes=visualPanes;
  const event=value=>{trace.eventCounts[value.kind]=(trace.eventCounts[value.kind]||0)+1;if(trace.events.length<36)trace.events.push(value);};
  window.priorityRawBands=value=>{rawBands=value;};
  const producer=()=>window.priorityProducerState?.()||null;
  const videoState=()=>{const element=document.querySelector('video');return element?{width:element.videoWidth,height:element.videoHeight,currentTime:element.currentTime,readyState:element.readyState,settings:element.srcObject?.getVideoTracks()[0]?.getSettings()}:null;};
  const rawState=()=>({at:Date.now(),encoding,pendingBytes,pending:snapshots.map(snapshot=>({capturedAt:snapshot.frame.capturedAt,generation:snapshot.frame.captureGeneration,owner:snapshot.frame.owner,sessionId:snapshot.frame.sessionId,sourceId:snapshot.frame.sourceId,kind:snapshot.frame.selectionKind,visualKey:snapshot.frame.visualKey,region:snapshot.frame.itemRegion,rawBytes:snapshot.rawBytes}))});
  window.priorityTraceWorkerEvent=value=>event({...value,raw:rawState()});
  function markerStage(image){
   const large=image.width>2000,x=large?3020:320,y=large?1296:90,width=40,height=large?20:120;
   if(x+width>image.width||y+height>image.height)return null;
   const pixels=image.getContext('2d').getImageData(x,y,width,height).data;
   const gray=(at,value)=>Math.abs(pixels[at]-value)<=3&&Math.abs(pixels[at+1]-value)<=3&&Math.abs(pixels[at+2]-value)<=3;
   for(let stage=1;stage<=3;stage++)for(let row=0;row<height;row++)for(let left=0;left<width-16;left++){
    let first=0,second=0,gap=0;const value=[61,109,157][stage-1];
    for(let col=left;col<width;col++){const at=(row*width+col)*4;if(!second&&gray(at,value))first++;else if(first>=8&&gray(at,231-value)){if(++second>=8)return stage;}else if(first>=8&&!second&&gap++<4)continue;else break;}
   }return null;
  }
  function paneCrop(image){
   const x=image.width>2000?2990:290,y=image.width>2000?1190:0,width=Math.min(580,image.width-x),height=Math.min(680,image.height-y);
   if(width<=0||height<=0)return null;
   const crop=document.createElement('canvas');crop.width=width;crop.height=height;crop.getContext('2d',{alpha:false}).drawImage(image,x,y,width,height,0,0,width,height);return{canvas:crop,region:{x,y,width,height}};
  }
  const regionsFor=image=>originalVisualPanes(image).slice(0,4).map(region=>({region:{...region},visualKey:pixelKey(fingerprint(image,region))}));
  visualPanes=function(image){
   const enteredAt=Date.now(),regions=originalVisualPanes(image),detectorMs=Date.now()-enteredAt,probeAt=Date.now(),stage=markerStage(image);trace.samples++;
   if(stage&&!crops.has(stage)){
    const crop=paneCrop(image);if(crop)crops.set(stage,crop);
    const entry={stage,firstSeenAt:enteredAt,width:image.width,height:image.height,detectorMs,rawBands,regions:regions.slice(0,4).map(region=>({region:{...region},visualKey:pixelKey(fingerprint(image,region))})),producer:producer(),video:videoState(),before:rawState()};
    trace.stages.push(entry);queueMicrotask(()=>{entry.after=rawState();});
   }
   trace.recent.push({at:enteredAt,stage,detectorMs,probeMs:Date.now()-probeAt,regions:regions.slice(0,4).map(region=>({...region})),videoTime:videoState()?.currentTime,producer:producer(),raw:rawState()});if(trace.recent.length>8)trace.recent.shift();
   return regions;
  };
  function encodeCrop(tag,crop){
   if(!crop)return null;let image=crop.canvas,temporary=null,base64=image.toDataURL('image/png').split(',')[1];
   try{for(let attempt=0;base64.length>48000&&attempt<4;attempt++){const scale=.8**(attempt+1);if(!temporary)temporary=document.createElement('canvas');temporary.width=Math.max(1,Math.round(crop.canvas.width*scale));temporary.height=Math.max(1,Math.round(crop.canvas.height*scale));temporary.getContext('2d').drawImage(crop.canvas,0,0,temporary.width,temporary.height);image=temporary;base64=image.toDataURL('image/png').split(',')[1];}
    return{tag,region:crop.region,width:image.width,height:image.height,...(base64.length<=48000?{base64}:{omitted:true,encodedCharacters:base64.length})};
   }finally{if(temporary)temporary.width=temporary.height=1;}
  }
  window.priorityTraceFailure=()=>{
   const result={trace,producer:producer(),video:videoState(),raw:rawState(),delayedPng:window.priorityPngDelay||null,crops:[]};
   try{for(const [stage,crop]of crops)result.crops.push(encodeCrop(`frozen-${stage}`,crop));
    const element=document.querySelector('video');if(element?.readyState>=2&&element.videoWidth&&element.videoHeight){const current=document.createElement('canvas'),scale=Math.min(1,4096/element.videoWidth,2160/element.videoHeight);current.width=Math.max(1,Math.round(element.videoWidth*scale));current.height=Math.max(1,Math.round(element.videoHeight*scale));let crop;
     try{current.getContext('2d',{alpha:false}).drawImage(element,0,0,current.width,current.height);result.currentVideo={stage:markerStage(current),regions:regionsFor(current),rawBands};crop=paneCrop(current);result.crops.push(encodeCrop('current-video',crop));}finally{current.width=current.height=1;if(crop)crop.canvas.width=crop.canvas.height=1;}}
    if(typeof canvas!=='undefined'){const crop=paneCrop(canvas);try{result.currentProducer={stage:markerStage(canvas)};result.crops.push(encodeCrop('current-producer',crop));}finally{if(crop)crop.canvas.width=crop.canvas.height=1;}}
    return result;
   }finally{for(const crop of crops.values())crop.canvas.width=crop.canvas.height=1;crops.clear();}
  };
  window.addEventListener('pagehide',()=>{for(const crop of crops.values())crop.canvas.width=crop.canvas.height=1;crops.clear();},{once:true});
 }
 let renderFixture=fixtureCode;if(privateBackground){renderFixture=renderFixture.replace("const c=canvas.getContext('2d');","const c=canvas.getContext('2d');if(window.priorityPhoto){const layer=document.createElement('canvas');layer.width=560;layer.height=650;layer.getContext('2d').drawImage(canvas,options.x,options.y,560,650,0,0,560,650);c.drawImage(window.priorityPhoto,-tick%12,0,options.width+12,options.height);c.drawImage(window.priorityPhoto,2200,1100,700,800,2980,1180,700,800);c.drawImage(layer,options.x,options.y);}");renderFixture=renderFixture.replace('c.fillRect(0,0,options.x-4,options.height);c.fillRect(options.x+565,0,options.width-options.x-565,options.height);','if(!window.priorityPhoto){c.fillRect(0,0,options.x-4,options.height);c.fillRect(options.x+565,0,options.width-options.x-565,options.height);}');}
 const server=http.createServer(async(req,res)=>{try{if(req.url==='/'){res.end('<title>Eye of Zomm private priority owner</title>');return;}if(req.url==='/private-frame'&&(privateImage||privateBackground)){res.setHeader('Content-Type','image/png');res.end(await fs.readFile(privateImage||privateBackground));return;}const name=req.url.slice(1);if(!['capture-source.html','capture-source.js','capture-png.worker.js'].includes(name)){res.writeHead(404).end();return;}res.setHeader('Content-Type',name.endsWith('.html')?'text/html':'text/javascript');let text=await fs.readFile(path.join(root,'app',name),'utf8');if(name==='capture-source.js'&&!privateImage&&!privateBackground){const marker='    const black=(x,y)=>';assert(text.includes(marker),'The synthetic raw-band diagnostic hook must match the real detector.');text=text.replace(marker,'    window.priorityRawBands?.({width,height,total:bands.length,bands:[...bands].sort((a,b)=>b.count-a.count).slice(0,24).map(b=>({x:b.x,right:b.right,y:b.y,last:b.last,height:b.last-b.y+1,count:b.count,eligible:b.last-b.y>=3&&b.last-b.y<=28&&b.count>=35}))});\n'+marker);}res.end(name==='capture-source.js'?sourcePrefix+text:text);}catch{res.writeHead(500).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,main=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});await main.loadURL(origin+'/');
 try{for(const selected of privateImage?['private-pixels']:privateBackground?['private-background-pixels']:mode==='both'?['native','pixels']:[mode]){
  pixelMode=selected!=='native';const records=[],admissions=[],stages=[],ocr=new OcrService();let release,firstRead=false,savedAt;
  const gate=new Promise(resolve=>release=resolve),recognize=ocr.recognize.bind(ocr);ocr.recognize=async(...args)=>{if(!firstRead){firstRead=true;savedAt=Date.now();if(!privateImage)await gate;}return recognize(...args);};
  const journal={sequence:0,async initialize(){},async append(record){return{...record,sequence:++this.sequence,recordedAt:new Date().toISOString()};},async close(){}};
  const host=new CaptureHost({electron,origin,getMainWindow:()=>main,journal,ocr,onObservation:record=>records.push(record)});
  const game=new BrowserWindow({show:false,width:1000,height:720,title:'EverQuest Synthetic Priority Fixture',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  await game.loadURL('data:text/html,'+encodeURIComponent('<title>EverQuest Synthetic Priority Fixture</title><style>body{margin:0;overflow:hidden}</style><body><script>'+fixtureCode+'<'+ '/script>'));game.showInactive();
  const encodeDelayMs=privateImage||privateBackground?0:2500;
  const encodePrelude=encodeDelayMs?`(${installWorkerFixture.toString()})(${encodeDelayMs});`:'';
  const tracePrelude=!privateImage&&!privateBackground?`(${installPriorityTrace.toString()})();`:'';
  sourcePrefix=tracePrelude+encodePrelude+(pixelMode?(privateImage?`const fixtureCanvas=document.createElement('canvas');const ready=fetch('/private-frame').then(r=>r.blob()).then(createImageBitmap).then(image=>{fixtureCanvas.width=image.width;fixtureCanvas.height=image.height;fixtureCanvas.getContext('2d').drawImage(image,0,0);});navigator.mediaDevices.getDisplayMedia=async()=>{await ready;return fixtureCanvas.captureStream(8);};`:`${privateBackground?"const photoReady=fetch('/private-frame').then(r=>r.blob()).then(createImageBitmap).then(image=>window.priorityPhoto=image);":''}${renderFixture}window.drawPriority({width:3840,height:2100,x:3000,y:1200});navigator.mediaDevices.getDisplayMedia=async()=>{${privateBackground?'await photoReady;await window.drawPriority({});':''}return canvas.captureStream(8);};`):'');
  const marker=value=>{if(!value.itemRegion)return null;const image=electron.nativeImage.createFromBuffer(Buffer.from(value.bytes)),pixels=image.toBitmap({scaleFactor:1}),r=value.itemRegion,left=Math.max(0,Math.floor(r.x*value.width)),right=Math.min(value.width,Math.ceil((r.x+r.width)*value.width)),top=Math.max(0,Math.floor(r.y*value.height)),bottom=Math.min(value.height,top+220),grayAt=(x,y,gray)=>{const p=(y*value.width+x)*4;return Math.abs(pixels[p]-gray)<=3&&Math.abs(pixels[p+1]-gray)<=3&&Math.abs(pixels[p+2]-gray)<=3;};for(let y=top;y<bottom;y++)for(let x=left;x<right-20;x++)for(let stage=1;stage<=3;stage++){const gray=[61,109,157][stage-1];if(!grayAt(x,y,gray))continue;let a=0,b=0,gap=0;for(let at=x;at<Math.min(right,x+40);at++){if(grayAt(at,y,gray)&&!b)a++;else if(a>=8&&grayAt(at,y,231-gray))b++;else if(a>=8&&!b&&gap++<4)continue;else break;if(b>=8)return stage;}}return null;};
  let lastPng;const submit=host.submitFrame.bind(host);host.submitFrame=value=>{const result=submit(value);if(result.accepted||result.sceneAccepted){if(diagnostics)lastPng=Buffer.from(value.bytes);admissions.push({kind:value.selectionKind,sceneOnly:!result.accepted,stage:privateImage?null:marker(value),hash:crypto.createHash('sha256').update(value.bytes).digest('hex'),capturedAt:value.capturedAt,admittedAt:Date.now(),sourceTiming:value.sourceTiming,generation:host.generation,width:value.width,height:value.height});}return result;};
  try{
   const choices=await host.listSources(),source=choices.find(s=>s.name==='EverQuest Synthetic Priority Fixture');assert(source);const startedAt=Date.now();await host.start({mode:'character',sourceId:source.id,sessionId:`priority-${selected}`});
   if(privateImage){await until(()=>records.some(r=>r.subject.kind==='item'),'Actual saved native pixels did not produce an automatic-ROI item',30000);const item=records.find(r=>r.subject.kind==='item');assert.equal(item.input.captureSelection,'visual-item');assert.equal(item.input.sourceSize.width,3840);assert.equal(item.input.sourceSize.height,2100);assert.equal(item.fields.find(f=>f.key==='hp')?.value,75);assert.equal(item.fields.find(f=>f.key==='damage')?.value,18);if(diagnostics){await fs.mkdir(diagnostics,{recursive:true});await fs.writeFile(path.join(diagnostics,'automatic-item-records.json'),JSON.stringify({startedAt,exportedAt:Date.now(),status:host.getStatus(),records,admissions,sourcePixels:'Explicitly supplied saved native PNG; replayed through canvas MediaStream, not a new game action.'},null,2));}console.log('EOZ_PRIORITY_PRIVATE_PIXELS='+JSON.stringify({ok:true,sourceSize:item.input.sourceSize,region:item.input.region,selection:item.input.captureSelection,items:records.filter(r=>r.subject.kind==='item').length,sourceAndGeneration:item.input.sourceId===source.id&&item.input.captureGeneration===host.generation,metrics:host.getStatus().captureDiagnostics}));continue;}
   await until(()=>firstRead&&admissions.some(a=>a.stage===1),'Initial tooltip was not detected and admitted');const generation=host.generation;stages.push({...admissions.find(a=>a.stage===1),drawnAt:startedAt});
   for(let index=1;index<3;index++){
    const drawnAt=Date.now(),options={name:names[index],weapon:index===1};stages.at(-1).visibleUntil=drawnAt;await (pixelMode?host.captureWindow:game).webContents.executeJavaScript(`window.drawPriority(${JSON.stringify(options)})`);await wait(2000);stages.push({stage:index+1,drawnAt,visibleUntil:Date.now()});
   }
   await (pixelMode?host.captureWindow:game).webContents.executeJavaScript(`window.drawPriority({hidden:true})`);
   // PNG encoding and main-process admission may finish after a tooltip closes.
   // This wait never extends its exposure or changes the original capture time.
   await until(()=>stages.every(stage=>admissions.some(a=>a.stage===stage.stage&&a.capturedAt>=stage.drawnAt&&a.capturedAt<=stage.visibleUntil)),'Not all fixed-exposure tooltip snapshots reached admission within5seconds',5000);
   for(const stage of stages){const admitted=admissions.find(a=>a.stage===stage.stage&&a.capturedAt>=stage.drawnAt&&a.capturedAt<=stage.visibleUntil);assert(admitted,`Stage${stage.stage} was not captured during its actual visible interval`);Object.assign(stage,admitted,{drawToCaptureMs:admitted.capturedAt-stage.drawnAt,drawToAdmissionMs:admitted.admittedAt-stage.drawnAt,visibleMs:stage.visibleUntil-stage.drawnAt});if(stage.stage>1)assert(stage.drawToCaptureMs<=2000,'Changed tooltip acquisition must occur within its fixed2second exposure');}
   let delayedPng=null;if(encodeDelayMs){delayedPng=await host.captureWindow.webContents.executeJavaScript('window.priorityPngDelay');assert.equal(delayedPng?.stage,2,'The frozen B-marker bitmap, rather than an A heartbeat, must receive the worker reply delay');assert(Number.isSafeInteger(delayedPng.id)&&delayedPng.worker>0,'The delayed reply must identify one real worker request');assert(delayedPng.selectedAt>=stages[1].capturedAt&&delayedPng.releasedAt<=stages[1].admittedAt,'The recorded delay must belong to the exact first admitted B image');assert(delayedPng.releasedAt-delayedPng.workerReplyAt>=encodeDelayMs,'The B reply remains held for the full delay after real worker PNG completion');assert(stages[1].sourceTiming.encodeMs>=encodeDelayMs,'The second tooltip exercises a deliberately slow worker reply');assert(stages[2].capturedAt<stages[1].admittedAt,'C must be snapshotted while B still occupies the only encoder');}
   await wait(Math.max(0,10000-(Date.now()-savedAt)));assert.equal(host.getStatus().overflowFrames,0);
   // Native compositors may deliver several distinct pixel variants of one
   // tooltip. Require both original B/C images, rather than exactly two jobs.
   const pendingItems=host.pending.filter(frame=>frame.kind==='visual-item');
   for(const stage of stages.slice(1))assert(pendingItems.some(frame=>frame.hash===stage.hash&&frame.capturedAt===stage.capturedAt),'The exact admitted B/C image and original capture time must survive while OCR is held');
   for(const frame of pendingItems){
    assert(admissions.some(admission=>admission.kind==='visual-item'&&!admission.sceneOnly&&admission.hash===frame.hash&&admission.capturedAt===frame.capturedAt&&stages.some(stage=>stage.stage===admission.stage&&admission.capturedAt>=stage.drawnAt&&admission.capturedAt<=stage.visibleUntil)),'Every retained native variant must match marked pixels from an actual stage exposure');
    assert.equal(frame.generation,generation);assert.equal(frame.sourceId,source.id);assert.equal(frame.sessionId,`priority-${selected}`);assert.equal(frame.owner,'character');
   }
   assert(host.pending.filter(frame=>frame.kind==='scene').length<=1);assert(host.getStatus().queuedFrames<=12);assert(host.getStatus().queuedBytes<=48*1024*1024);const retainedVisualVariants=pendingItems.length,releasedAt=Date.now();release();
   await until(()=>names.every(name=>records.some(r=>r.subject.name===name)),'Not all3 admitted tooltips survived the real serial OCR',30000);
   for(const name of names){const item=records.find(r=>r.subject.name===name),stage=stages[names.indexOf(name)];assert.equal(item.input.captureSelection,'visual-item');assert.equal(item.input.captureGeneration,generation);assert.equal(item.input.sourceId,source.id);assert.equal(item.sessionId,`priority-${selected}`);assert(admissions.some(admission=>admission.stage===stage.stage&&admission.hash===item.input.frameId&&admission.capturedAt===Date.parse(item.capturedAt)&&admission.capturedAt>=stage.drawnAt&&admission.capturedAt<=stage.visibleUntil),'Each named OCR result must retain an exact marked image acquired during that tooltip exposure');}
   const size=admissions[0];if(pixelMode){assert.equal(size.width,3840);assert.equal(size.height,2100);}const report={ok:true,mode:selected,realNativeWindowStream:!pixelMode,pixelStream:pixelMode,privatePhotographicBackground:Boolean(privateBackground),actualSourceSize:{width:size.width,height:size.height},tooltips:3,backgroundAnimation:true,retainedVisualVariants,delayedTooltipBWorkerReplyMs:encodeDelayMs,delayedWorkerReply:delayedPng,heldFirstOcrMs:releasedAt-savedAt,changedStageExposureMs:2000,maximumPostHideAdmissionWaitMs:5000,stages,queue:host.getStatus().queuedFrames,bytes:host.getStatus().queuedBytes,metrics:host.getStatus().captureDiagnostics};if(diagnostics){await fs.mkdir(diagnostics,{recursive:true});await fs.writeFile(path.join(diagnostics,`${selected}-passed.json`),JSON.stringify(report,null,2));}console.log('EOZ_CAPTURE_PRIORITY='+JSON.stringify(report));
  }catch(error){if(diagnostics&&lastPng){await fs.mkdir(diagnostics,{recursive:true});await fs.writeFile(path.join(diagnostics,`${selected}-failure.png`),lastPng);}
   if(!privateImage&&!privateBackground&&host.captureWindow){let timer;try{const failure=await Promise.race([host.captureWindow.webContents.executeJavaScript('window.priorityTraceFailure?.()'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Priority failure trace timed out.')),4000);})]);if(failure){const {crops,...metadata}=failure;for(const crop of crops.filter(Boolean))console.error('EOZ_PRIORITY_PANE_PNG='+JSON.stringify(crop));console.error('EOZ_PRIORITY_TRACE='+JSON.stringify(metadata));}}catch(traceError){console.error('EOZ_PRIORITY_TRACE_ERROR='+String(traceError?.message||traceError));}finally{clearTimeout(timer);}}
   console.error('EOZ_PRIORITY_FAILURE='+JSON.stringify({mode:selected,status:host.getStatus(),admissions:admissions.slice(-15),subjects:privateImage?records.map(r=>r.subject.kind):records.map(r=>r.subject.name)}));
   throw error;}
  finally{release();await host.stop();await host.dispose();game.destroy();sourcePrefix='';}
 }}finally{main.destroy();await new Promise(resolve=>server.close(resolve));}
}
try{const entry=join(temporary,'main.cjs');await writeFile(entry,`const app=require('electron').app;const fail=e=>{try{console.error(String(e?.stack||e))}finally{app.exit(1)}};process.stdout.on('error',()=>app.exit(1));process.stderr.on('error',()=>app.exit(1));process.on('uncaughtException',fail);process.on('unhandledRejection',fail);setTimeout(()=>app.exit(2),110000).unref();(${run.toString()})(${JSON.stringify({root,temporary,draw:drawHoverFixture.toString(),privateImage,privateBackground,diagnostics,mode})}).then(()=>app.exit(0),e=>{console.error(e.stack);app.exit(1);});`);const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry],{env,stdio:'inherit',windowsHide:true,timeout:115000});child.once('error',reject);child.once('exit',done);});assert.equal(code,0,'Actual source priority capture passes');}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-capture-priority-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
