// Export the existing vector artwork through the same Chromium renderer as the app.
import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const source='app/assets/eye-of-zomm.svg',sizes=[16,20,24,32,40,48,64,128,256,512];
const temporary=await mkdtemp(join(tmpdir(),'eoz-app-icons-'));
async function render({source,temporary,sizes}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
    app.setPath('userData',path.join(temporary,'profile'));app.disableHardwareAcceleration();await app.whenReady();
    const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    try{
        await window.loadURL('data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">');
        for(const size of sizes){
            const png=await window.webContents.executeJavaScript(`(async()=>{
                const size=${size},svg=${JSON.stringify(source)}.replace('<svg ','<svg width="'+size+'" height="'+size+'" ');
                const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(svg);await image.decode();
                const canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.getContext('2d').drawImage(image,0,0,size,size);
                return canvas.toDataURL('image/png').split(',')[1];
            })()`);
            await fs.writeFile(path.join(temporary,`${size}.png`),Buffer.from(png,'base64'));
        }
    }finally{window.destroy();app.quit();}
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
    const svg=await readFile(join(root,source),'utf8');
    if(!svg.startsWith('<svg ')||/href=|<script/i.test(svg))throw Error('Only the standalone local eye vector can be exported.');
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${render.toString()})(${JSON.stringify({source:svg,temporary,sizes})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry],{env,windowsHide:true,stdio:'inherit',timeout:30000});child.once('error',reject);child.once('exit',done);});
    if(code!==0)throw Error('Chromium icon export failed.');
    const frames=await Promise.all(sizes.slice(0,-1).map(async size=>({size,png:await readFile(join(temporary,`${size}.png`))})));
    const header=Buffer.alloc(6+frames.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);
    let offset=header.length;
    for(const [index,{size,png}]of frames.entries()){
        const at=6+index*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(png.length,at+8);header.writeUInt32LE(offset,at+12);offset+=png.length;
    }
    const png=await readFile(join(temporary,'512.png')),ico=Buffer.concat([header,...frames.map(frame=>frame.png)]);
    const outputs={'build/icon.png':png,'build/icon.ico':ico,'app/assets/eye-of-zomm.png':png};
    for(const [name,bytes]of Object.entries(outputs)){await mkdir(dirname(join(root,name)),{recursive:true});await writeFile(join(root,name),bytes);}
    await writeFile(join(root,'build/app-icons.json'),JSON.stringify({schemaVersion:1,source,sourceSha256:hash(svg),icoSizes:frames.map(frame=>frame.size),files:Object.fromEntries(Object.entries(outputs).map(([name,bytes])=>[name,hash(bytes)]))},null,2)+'\n');
    console.log('Exported transparent eye icons: Windows 16–256px ICO, Linux/runtime 512px PNG.');
}finally{
    if(dirname(resolve(temporary))!==resolve(tmpdir()))throw Error('Unexpected icon export cleanup path.');
    await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
