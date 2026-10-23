// Exercise the actual Electron session and hardened login window against a
// disposable loopback wiki fixture. No external network or production writes.
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),electron=require('electron');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'eoz-native-wiki-'));
try{
    const exitCode=await new Promise((resolve,reject)=>{
        const child=spawn(electron,[fileURLToPath(new URL('./wiki-auth-fixture.cjs',import.meta.url)),`--eoz-fixture-profile=${profile}`],{stdio:'inherit',windowsHide:true,env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'}});
        const timeout=setTimeout(()=>{child.kill();reject(new Error('The native wiki fixture exceeded 60 seconds.'));},60000);
        child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',code=>{clearTimeout(timeout);resolve(code??1);});
    });
    if(exitCode!==0)throw new Error(`The native wiki fixture failed with exit code ${exitCode}.`);
}finally{if(path.dirname(profile)!==path.resolve(os.tmpdir())||!path.basename(profile).startsWith('eoz-native-wiki-'))throw Error('Refusing to remove a fixture profile outside its temporary namespace.');await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
