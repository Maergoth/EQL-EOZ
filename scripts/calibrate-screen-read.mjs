// Private calibration helper. It saves text/results only to an explicit output;
// never copies the player's screenshot into the repository or test fixtures.
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
const option=name=>{const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;};
if(!option('--image')||!option('--output'))throw new Error('Pass --image PRIVATE.png --output PRIVATE-results.json.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-ocr-calibration-'));
async function run({root,temporary,imagePath,outputPath,crop}){
    const {app,nativeImage}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const {OcrService}=require(path.join(root,'desktop','ocr-service.cjs')),{validateCapturePng}=require(path.join(root,'desktop','capture-image.cjs'));
    const {parseScreenRead}=await import(pathToFileURL(path.join(root,'app','screen-read-parser.js')).href);
    const bytes=await fs.readFile(imagePath);validateCapturePng(bytes);const image=nativeImage.createFromBuffer(bytes),size=image.getSize();
    const service=new OcrService(),runs=[];
    try{for(const scale of [1,2,3]){
        if(size.width*size.height*scale*scale>16*1024*1024)continue;
        const start=Date.now(),result=await service.recognize(scale===1?bytes:image.resize({width:size.width*scale,height:size.height*scale,quality:'best'}).toPNG());
        const observations=parseScreenRead({...result,owner:'character',sessionId:'private-calibration',input:{sourceSize:size,scale}});
        runs.push({scale,elapsedMs:Date.now()-start,confidence:result.confidence,text:result.text,words:result.words,observations});
        console.log(`Private calibration ${scale}x: ${observations.length} proposed blocks, mean OCR confidence ${result.confidence.toFixed(1)}.`);
    }
    if(crop){
        const [x,y,width,height]=crop.split(',').map(Number);
        if(![x,y,width,height].every(Number.isInteger)||x<0||y<0||width<1||height<1||x+width>size.width||y+height>size.height)throw Error('Invalid private calibration crop.');
        const region={x,y,width,height};
        for(const scale of [2,3,4])for(const preprocessing of ['color','inverted','high-contrast']){
            let prepared=image.crop(region).resize({width:width*scale,height:height*scale,quality:'best'});
            if(preprocessing!=='color'){
                const bitmap=prepared.toBitmap({scaleFactor:1});
                for(let index=0;index<bitmap.length;index+=4){const value=Math.max(bitmap[index],bitmap[index+1],bitmap[index+2]);
                    const gray=preprocessing==='high-contrast'?(value>95?0:255):255-value;bitmap[index]=bitmap[index+1]=bitmap[index+2]=gray;bitmap[index+3]=255;}
                prepared=nativeImage.createFromBitmap(bitmap,{width:width*scale,height:height*scale,scaleFactor:1});
            }
            for(const layout of ['sparse','block']){
                const start=Date.now(),result=await service.recognize(prepared.toPNG(),{layout});
                const observations=parseScreenRead({...result,owner:'character',sessionId:'private-calibration',input:{sourceSize:size,region,scale,preprocessing,layout}});
                runs.push({region,scale,preprocessing,layout,elapsedMs:Date.now()-start,confidence:result.confidence,text:result.text,words:result.words,observations});
                console.log(`Private crop ${scale}x ${preprocessing}/${layout}: ${observations.length} proposed blocks, mean OCR confidence ${result.confidence.toFixed(1)}.`);
            }
        }
    }}finally{await service.stop();}
    await fs.mkdir(path.dirname(outputPath),{recursive:true,mode:0o700});
    await fs.writeFile(outputPath,JSON.stringify({schema:1,engine:'tesseract.js 7.0.0',sourceSize:size,runs},null,2),{mode:0o600});
    app.exit(0);
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${run.toString()})(${JSON.stringify({root,temporary,imagePath:resolve(option('--image')),outputPath:resolve(option('--output')),crop:option('--crop')})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(electron,[entry],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});
    if(code!==0)throw new Error(`Private calibration failed (${code}).`);
}finally{await rm(temporary,{recursive:true,force:true});}
