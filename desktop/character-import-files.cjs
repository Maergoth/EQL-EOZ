'use strict';
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const {inventoryFileName}=require('./inventory-file-host.cjs');
const {LIMITS,failure}=require('./character-repository-contract.cjs');
async function directories(directory){for(let current=path.resolve(directory);;current=path.dirname(current)){const stat=await fsp.lstat(current);if(!stat.isDirectory()||stat.isSymbolicLink())throw failure('unsafe-file','Choose the original game export, outside linked folders.');if(path.dirname(current)===current)break;}}
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function locate({electron,window,config,metadata,kind,choose=false,isCurrent}){
    const inventoryName=inventoryFileName(metadata.name,metadata.server),expected=kind==='inventory'?inventoryName:inventoryName.replace(/-Inventory\.txt$/,'-Achievements.txt');
    let target=null;
    if(!choose&&typeof config?.eqRootPath==='string'&&path.isAbsolute(config.eqRootPath)){
        await directories(config.eqRootPath);let count=0;
        for await(const entry of await fsp.opendir(config.eqRootPath)){
            if(!isCurrent())throw failure('cancelled','Import canceled.');
            if(++count>50000){target=null;break;}
            if(entry.name.toLowerCase()!==expected.toLowerCase())continue;
            if(target)throw failure('ambiguous-file','Choose the exact game export; more than one matching filename was found.');
            if(!entry.isFile()||entry.isSymbolicLink())throw failure('unsafe-file','The game export must be an original regular text file.');target=path.join(config.eqRootPath,entry.name);
        }
    }
    if(!target){
        if(!isCurrent())throw failure('cancelled','Import canceled.');
        const picked=await electron.dialog.showOpenDialog(window,{title:`Choose /outputfile ${kind} export`,properties:['openFile'],filters:[{name:'Game text export',extensions:['txt']}],...(typeof config?.eqRootPath==='string'&&path.isAbsolute(config.eqRootPath)?{defaultPath:path.join(config.eqRootPath,expected)}:{})});
        if(!isCurrent()||picked.canceled)throw failure('cancelled','Import canceled.');if(picked.filePaths?.length!==1||!path.isAbsolute(picked.filePaths[0]))throw failure('invalid-file','Choose one original game text export.');target=picked.filePaths[0];
    }
    return target;
}
async function streamExport({target,backupDirectory,jobId,kind,isCurrent,onChunk,onProgress}){
    if(!path.isAbsolute(target)||!path.basename(target).toLowerCase().endsWith('.txt'))throw failure('invalid-file','Choose an original game text export.');
    await directories(path.dirname(target));const before=await fsp.lstat(target,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.size<1n||before.size>BigInt(Number.MAX_SAFE_INTEGER))throw failure('unsafe-file','The export must be a nonempty original regular text file.');
    const handle=await fsp.open(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));let backupHandle,backupPath,success=false;
    try{
        const opened=await handle.stat({bigint:true});if(!same(before,opened))throw failure('source-changed','The export changed while opening. Run the game export again.');
        await fsp.mkdir(backupDirectory,{recursive:true,mode:0o700});const backupStat=await fsp.lstat(backupDirectory);if(!backupStat.isDirectory()||backupStat.isSymbolicLink())throw failure('unsafe-file','The private import backup directory is unavailable.');
        backupPath=path.join(backupDirectory,`${jobId}.${kind}.txt`);backupHandle=await fsp.open(backupPath,'wx+',0o600);
        const buffer=Buffer.alloc(LIMITS.chunkBytes),hash=createHash('sha256');let decoder=null,length=0;
        for(;;){
            if(!isCurrent())throw failure('cancelled','Import canceled.');
            const available=Math.min(buffer.length,Number(opened.size)-length+1);if(available<=0)throw failure('source-changed','The export grew during import. Run the game export again.');
            const read=await handle.read(buffer,0,available,null);if(!read.bytesRead)break;length+=read.bytesRead;
            if(length>Number(opened.size))throw failure('source-changed','The export changed during import.');const bytes=buffer.subarray(0,read.bytesRead);hash.update(bytes);let written=0;while(written<bytes.length){const result=await backupHandle.write(bytes,written,bytes.length-written,null);if(!result.bytesWritten)throw failure('backup-failed','The private export backup could not be completed.');written+=result.bytesWritten;}
            if(!decoder){let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';decoder=new TextDecoder(encoding,{fatal:true});}
            let text;try{text=decoder.decode(bytes,{stream:true});}catch{throw failure('invalid-encoding','The export must use UTF-8 or BOM-marked UTF-16.');}if(text.includes('\0'))throw failure('invalid-encoding','The export contains invalid text.');
            if(!isCurrent())throw failure('cancelled','Import canceled.');if(text)await onChunk(text);onProgress({phase:kind,bytesRead:length,totalBytes:Number(opened.size)});
        }
        let tail;try{tail=decoder.decode();}catch{throw failure('invalid-encoding','The export ended inside a text character.');}if(tail)await onChunk(tail);
        const after=await handle.stat({bigint:true}),current=await fsp.lstat(target,{bigint:true});await directories(path.dirname(target));
        if(!isCurrent())throw failure('cancelled','Import canceled.');if(length!==Number(opened.size)||!current.isFile()||current.isSymbolicLink()||!same(opened,after)||!same(after,current))throw failure('source-changed','The export changed during import. Run both exports again; the saved inventory was kept.');
        await backupHandle.sync();const digest=hash.digest('hex'),verified=createHash('sha256');let position=0;while(position<length){if(!isCurrent())throw failure('cancelled','Import canceled.');const read=await backupHandle.read(buffer,0,Math.min(buffer.length,length-position),position);if(!read.bytesRead)throw failure('backup-failed','The private export backup is incomplete.');verified.update(buffer.subarray(0,read.bytesRead));position+=read.bytesRead;}if((await backupHandle.stat()).size!==length||verified.digest('hex')!==digest)throw failure('backup-failed','The private export backup did not match the source.');success=true;
        return {name:path.basename(target),bytes:length,modifiedAt:Number(current.mtimeMs),sha256:digest,backupName:path.basename(backupPath),backupVerified:true};
    }finally{await handle.close();if(backupHandle)await backupHandle.close();if(!success&&backupPath)await fsp.rm(backupPath,{force:true}).catch(()=>{});}
}
module.exports={locate,streamExport};
