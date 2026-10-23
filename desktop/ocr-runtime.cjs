'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createRequire}=require('node:module');
const MAX_MANIFEST_BYTES=1024*1024,MAX_FILES=1000,MAX_FILE_BYTES=64*1024*1024,MAX_TOTAL_BYTES=512*1024*1024;
function validateOcrRuntime(runtimeRoot){
    const root=fs.realpathSync(runtimeRoot),rootInfo=fs.lstatSync(runtimeRoot);
    if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink())throw new Error('The OCR runtime must be a physical directory.');
    const contained=target=>{const relative=path.relative(root,target);return relative!==''&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative);};
    function physicalFile(relative){
        if(typeof relative!=='string'||!relative||/[\\:\x00-\x1f]/.test(relative)||relative.split('/').some(part=>!part||part==='.'||part==='..'))throw new Error('Invalid OCR manifest path.');
        let current=root;const parts=relative.split('/');
        for(const [index,part]of parts.entries()){
            current=path.join(current,part);const stat=fs.lstatSync(current);
            if(stat.isSymbolicLink()||!(index===parts.length-1?stat.isFile():stat.isDirectory()))throw new Error(`OCR runtime path must be physical: ${relative}`);
        }
        if(!contained(fs.realpathSync(current)))throw new Error(`OCR runtime path escaped its directory: ${relative}`);
        return current;
    }
    const manifestPath=physicalFile('asset-manifest.json');
    if(fs.statSync(manifestPath).size>MAX_MANIFEST_BYTES)throw new Error('The OCR manifest is too large.');
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    if(manifest.schema!==1||!Array.isArray(manifest.files)||!manifest.files.length||manifest.files.length>MAX_FILES||!manifest.packages||typeof manifest.packages!=='object'||Array.isArray(manifest.packages))throw new Error('The OCR manifest is invalid.');
    const names=new Set();let total=0;
    for(const entry of manifest.files){
        if(!entry||!Number.isSafeInteger(entry.bytes)||entry.bytes<0||entry.bytes>MAX_FILE_BYTES||!/^[a-f0-9]{64}$/.test(entry.sha256||''))throw new Error('The OCR manifest contains an invalid file record.');
        const file=physicalFile(entry.path),key=entry.path.toLowerCase();
        if(names.has(key))throw new Error('The OCR manifest contains duplicate file paths.');names.add(key);
        const stat=fs.statSync(file);total+=stat.size;
        if(stat.size!==entry.bytes||total>MAX_TOTAL_BYTES)throw new Error(`OCR runtime file size differs: ${entry.path}`);
        if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==entry.sha256)throw new Error(`OCR runtime file digest differs: ${entry.path}`);
    }
    for(const name of ['package.json','ocr-worker.cjs'])if(!names.has(name))throw new Error(`OCR runtime manifest omits ${name}.`);
    const loader=createRequire(path.join(root,'package.json')),packages=Object.entries(manifest.packages);
    if(!packages.length||packages.length>100)throw new Error('The OCR manifest package list is invalid.');
    for(const [name,version]of packages){
        if(!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)||typeof version!=='string')throw new Error('The OCR manifest package identity is invalid.');
        const packagePath=`node_modules/${name}/package.json`,physical=physicalFile(packagePath);
        const pkg=JSON.parse(fs.readFileSync(physical,'utf8'));
        if(!names.has(packagePath.toLowerCase())||pkg.version!==version)throw new Error(`OCR runtime package version differs: ${name}`);
        if(typeof pkg.main==='string'&&!contained(path.resolve(path.dirname(physical),pkg.main)))throw new Error(`OCR package resolved outside its physical runtime: ${name}`);
        for(const request of [name,`${name}/package.json`]){
            const resolved=fs.realpathSync(loader.resolve(request));
            if(!contained(resolved)||!names.has(path.relative(root,resolved).split(path.sep).join('/').toLowerCase()))throw new Error(`OCR package resolved outside its physical runtime: ${name}`);
        }
    }
    return {root,files:manifest.files.length,bytes:total,packages:packages.length};
}
module.exports={validateOcrRuntime};
