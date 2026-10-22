// Maintainer helper: renders only synthetic test content into committed fixtures.
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-ocr-fixture-'));
const output=join(root,'tests','fixtures','screen-read');await mkdir(output,{recursive:true});
async function render({output,profile}){
    const {app,BrowserWindow}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
    app.setPath('userData',profile);app.disableHardwareAcceleration();await app.whenReady();
    const window=new BrowserWindow({width:1050,height:800,show:false,backgroundColor:'#ffffff',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
    const cases={
        item:'Item Name: Synthetic Test Blade +3\nDescription\nSynthetic Test Blade +3\nNo Trade\nClass: WAR / PAL\nRace: ALL\nSlot: PRIMARY / SECONDARY\nTier 3 / 10\nAC 12\nHP 45\nMana 20\nSTR 8\nDMG 9 Delay 24\nWeight 2.5\nRequired Level 15\nModified\nWorn Effect: Synthetic Haste',
        character:'Character Stats\nInventory\nHP 330/398\nMana 296/296\nEndurance 169/169\nAC 30/350\nStrength 90\nStamina 105\nAgility 90\nDexterity 70\nWisdom 85\nIntelligence 80\nCharisma 65\nSV Poison 15\nSV Magic 25\nHP Regen 3\nMana Regen 6'
    };
    for(const [name,text] of Object.entries(cases)){
        await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><html><body style="background:white;color:black;margin:24px"><pre style="font:28px/38px Arial,sans-serif;white-space:pre">'+text+'</pre></body></html>'));
        await window.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        await fs.writeFile(path.join(output,`${name}.png`),(await window.webContents.capturePage()).toPNG());
    }
    window.destroy();app.exit(0);
}
try{
    const script=join(temporary,'main.cjs');await writeFile(script,`(${render.toString()})(${JSON.stringify({output,profile:join(temporary,'profile')})}).catch(error=>{console.error(error);require('electron').app.exit(1);});`);
    const electron=createRequire(import.meta.url)('electron'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const code=await new Promise((done,reject)=>{const child=spawn(electron,[script],{env,stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',done);});
    if(code!==0)throw new Error(`Synthetic fixture rendering failed (${code}).`);
    console.log('Rendered two synthetic OCR fixtures with an isolated Electron profile.');
}finally{await rm(temporary,{recursive:true,force:true});}
