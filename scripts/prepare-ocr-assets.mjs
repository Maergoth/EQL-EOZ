import { readFile, mkdir, readdir, copyFile, writeFile, rm, lstat, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'), output=join(root,'.generated','ocr-runtime');
const require=createRequire(join(root,'package.json')), copied=new Map();
const expected={'tesseract.js':'7.0.0','tesseract.js-core':'7.0.0','@tesseract.js-data/eng':'1.0.0'};
async function copyTree(from,to){
    await mkdir(to,{recursive:true});
    for(const entry of await readdir(from,{withFileTypes:true})){
        if(entry.name==='node_modules'||entry.name==='.git')continue;
        if(entry.isSymbolicLink())throw new Error('OCR runtime packages must not contain symlinks.');
        if(entry.isDirectory())await copyTree(join(from,entry.name),join(to,entry.name));
        else if(entry.isFile())await copyFile(join(from,entry.name),join(to,entry.name));
    }
}
async function include(name,fromRequire=require){
    const source=dirname(fromRequire.resolve(`${name}/package.json`));
    const pkg=JSON.parse(await readFile(join(source,'package.json'),'utf8'));
    if(expected[name]&&pkg.version!==expected[name])throw new Error(`Unexpected OCR runtime version: ${name}`);
    if(copied.has(name)){
        if(copied.get(name)!==pkg.version)throw new Error(`OCR runtime needs conflicting ${name} versions.`);
        return;
    }
    copied.set(name,pkg.version);await copyTree(source,join(output,'node_modules',...name.split('/')));
    const scopedRequire=createRequire(join(source,'package.json'));
    for(const dependency of Object.keys(pkg.dependencies||{}))await include(dependency,scopedRequire);
}
// Delete only this generated directory after resolving/checking its ancestors.
await mkdir(dirname(output),{recursive:true});
const generatedReal=await realpath(dirname(output)),rootReal=await realpath(root);
if(generatedReal!==join(rootReal,'.generated'))throw new Error('OCR output must remain inside this checkout.');
const previous=await lstat(output).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
if(previous?.isSymbolicLink()||(previous&&!previous.isDirectory()))throw new Error('Unsafe OCR output directory.');
if(previous)await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of Object.keys(expected))await include(name);
await copyFile(join(root,'desktop','ocr-worker.cjs'),join(output,'ocr-worker.cjs'));
await copyFile(join(root,'THIRD_PARTY','OCR','APACHE-2.0.txt'),join(output,'APACHE-2.0.txt'));
await copyFile(join(root,'THIRD_PARTY','OCR','README.md'),join(output,'THIRD_PARTY_NOTICES.md'));
await writeFile(join(output,'package.json'),JSON.stringify({private:true,type:'commonjs',dependencies:expected},null,2));
const files=[];
async function inspect(directory){
    for(const entry of await readdir(directory,{withFileTypes:true})){
        const target=join(directory,entry.name);
        if(entry.isDirectory())await inspect(target);
        else if(entry.isFile()&&entry.name!=='asset-manifest.json'){
            const bytes=await readFile(target);files.push({path:relative(output,target).replace(/\\/g,'/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
        }
    }
}
await inspect(output);files.sort((a,b)=>a.path.localeCompare(b.path));
await writeFile(join(output,'asset-manifest.json'),JSON.stringify({schema:1,packages:Object.fromEntries([...copied].sort()),files},null,2));
console.log(`Prepared offline OCR runtime: ${copied.size} packages, ${files.length} verified files.`);
