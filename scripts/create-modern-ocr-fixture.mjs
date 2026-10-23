// Maintainer-only generator: standard canvas and synthetic literals exclusively.
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';import {tmpdir} from 'node:os';import {join,resolve,dirname,basename} from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
import {drawModernOcrFixture} from '../tests/fixtures/screen-read/modern-layout.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-modern-fixture-')),output=join(root,'tests','fixtures','screen-read','modern-layout.png');
async function render({output,profile,draw}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises');app.setPath('userData',profile);setTimeout(()=>{console.error('Modern fixture generation exceeded its 55-second runtime limit.');app.exit(1);},55000).unref();await app.whenReady();
    const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    window.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:/^https?:/.test(details.url)}));
    try{await window.loadURL('data:text/html,<!doctype html><title>Synthetic Modern fixture generator</title>');const image=await window.webContents.executeJavaScript(`(${draw})(document).toDataURL('image/png')`);await fs.writeFile(output,Buffer.from(image.slice(image.indexOf(',')+1),'base64'));}finally{window.destroy();app.quit();}
}
try{
    await mkdir(dirname(output),{recursive:true});const entry=join(temporary,'main.cjs');await writeFile(entry,`(${render.toString()})(${JSON.stringify({output,profile:join(temporary,'profile'),draw:drawModernOcrFixture.toString()})}).catch(error=>{console.error(error);require('electron').app.exit(1);});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry],{env,stdio:'inherit',windowsHide:true,timeout:60000});child.once('error',reject);child.once('exit',done);});if(code!==0)throw Error(`Synthetic Modern fixture generation failed (${code}).`);
    console.log('Created canvas-only synthetic Modern OCR fixture (2560 × 1100).');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert.ok(basename(temporary).startsWith('eoz-modern-fixture-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
