// Keep the ordered source gate below Windows cmd's command-length ceiling.
// Every child is Node with explicit arguments; no shell or command splitting.
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const commands=JSON.parse(await readFile(new URL('./source-test-commands.json',import.meta.url),'utf8'));
if(!Array.isArray(commands)||!commands.length||commands.some(args=>!Array.isArray(args)||!args.length||args.some(value=>typeof value!=='string'||!value||/[\u0000\r\n]/.test(value))))throw Error('Invalid source-test command list.');
for(const [index,args] of commands.entries()){
    console.log(`Source gate ${index+1}/${commands.length}: node ${args.join(' ')}`);
    const code=await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:'inherit',shell:false,windowsHide:true});
        child.once('error',reject);child.once('exit',(status,signal)=>{if(signal)console.error(`Source gate stopped by ${signal}.`);resolve(status??1);});
    });
    if(code!==0)process.exit(code);
}
console.log(`All ${commands.length} ordered source gates passed.`);
