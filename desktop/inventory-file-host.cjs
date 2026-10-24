'use strict';
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const CHANNEL='eye-of-zomm:inventory-file',MAX_INVENTORY_BYTES=2*1024*1024,MAX_DIRECTORY_ENTRIES=50000;
class InventoryReadError extends Error {}
function inventoryFileName(name,server){
    const part=value=>typeof value==='string'&&value.length<=80&&Buffer.byteLength(value,'utf8')<=240&&/^[\p{L}\p{N}][\p{L}\p{N} _'-]*$/u.test(value)&&value===value.trim();
    if(!part(name)||!part(server))throw new InventoryReadError('Enter a valid character name and server before reading the inventory export.');
    return `${name}_${server}-Inventory.txt`;
}
function decodeInventoryText(bytes){
    if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>MAX_INVENTORY_BYTES)throw new InventoryReadError('The inventory export must be a nonempty text file no larger than 2 MiB.');
    let encoding='utf-8',offset=0;
    if(bytes[0]===255&&bytes[1]===254){encoding='utf-16le';offset=2;}
    else if(bytes[0]===254&&bytes[1]===255){encoding='utf-16be';offset=2;}
    try{
        const text=new TextDecoder(encoding,{fatal:true}).decode(bytes.subarray(offset));
        if(!text||text.includes('\0'))throw Error('Invalid text');
        return text;
    }catch{throw new InventoryReadError('The inventory export must use UTF-8 or BOM-marked UTF-16 text.');}
}
async function normalDirectories(directory,io){
    for(let current=path.resolve(directory);;current=path.dirname(current)){
        const stat=await io.lstat(current);
        if(!stat.isDirectory()||stat.isSymbolicLink())throw new InventoryReadError('Inventory exports cannot be read through linked folders. Choose the original file.');
        if(path.dirname(current)===current)break;
    }
}
const sameFile=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
async function readStableFile(target,io){
    const name=path.basename(target);
    if(!path.isAbsolute(target)||!name||name.length>255||/[\x00-\x1f\x7f]/.test(name)||!name.toLowerCase().endsWith('.txt'))throw new InventoryReadError('Choose a text inventory export.');
    await normalDirectories(path.dirname(target),io);
    const before=await io.lstat(target,{bigint:true});
    if(!before.isFile()||before.isSymbolicLink()||before.size<1n||before.size>BigInt(MAX_INVENTORY_BYTES))throw new InventoryReadError('Choose a regular inventory text file no larger than 2 MiB; linked files are not accepted.');
    const handle=await io.open(target,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
    try{
        const opened=await handle.stat({bigint:true});if(!opened.isFile()||!sameFile(before,opened))throw new InventoryReadError('The inventory export changed while it was being opened. Run /outputfile inventory, then try again.');
        const bytes=Buffer.alloc(Number(opened.size)+1);let length=0;
        while(length<bytes.length){const read=await handle.read(bytes,length,bytes.length-length,null);if(!read.bytesRead)break;length+=read.bytesRead;}
        const after=await handle.stat({bigint:true}),current=await io.lstat(target,{bigint:true});await normalDirectories(path.dirname(target),io);
        if(length!==Number(opened.size)||!current.isFile()||current.isSymbolicLink()||!sameFile(opened,after)||!sameFile(after,current))throw new InventoryReadError('The inventory export changed while it was being read. Run /outputfile inventory, then try again.');
        const raw=bytes.subarray(0,length),text=decodeInventoryText(raw);
        return {ok:true,file:{name:path.basename(target),bytes:length,modifiedAt:Number(current.mtimeMs),sha256:createHash('sha256').update(raw).digest('hex')},text};
    }finally{await handle.close();}
}
class InventoryFileHost{
    constructor({electron,origin,getMainWindow,readConfig,fsImpl=fsp}={}){
        const url=new URL(origin);if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.origin!==origin)throw Error('Inventory reading requires the local app origin.');
        this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;this.readConfig=readConfig;this.fs=fsImpl;this.disposed=false;this.busy=false;
        electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
    }
    isMain(event){const main=this.getMainWindow();return Boolean(!this.disposed&&main&&!main.isDestroyed()&&event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);}
    async handle(event,action,value){
        if(!this.isMain(event))throw Error('Inventory files are available only in the main app.');
        if(action!=='read')throw Error('Unknown inventory-file action.');
        if(this.busy)return {ok:false,error:'An inventory export is already being read. Try again shortly.'};
        this.busy=true;
        try{
            if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['name','server','chooseFile'].includes(key))||value.chooseFile!==undefined&&typeof value.chooseFile!=='boolean')throw new InventoryReadError('Invalid inventory export request.');
            const expected=inventoryFileName(value.name,value.server),config=await this.readConfig();
            if(!this.isMain(event))throw new InventoryReadError('The app changed before the inventory export could be read.');
            let target;
            if(value.chooseFile===true){
                const choice=await this.electron.dialog.showOpenDialog(this.getMainWindow(),{title:'Choose /outputfile inventory export',properties:['openFile'],filters:[{name:'Inventory text export',extensions:['txt']}],...(typeof config?.eqRootPath==='string'&&path.isAbsolute(config.eqRootPath)?{defaultPath:path.join(config.eqRootPath,expected)}:{})});
                if(!this.isMain(event))throw new InventoryReadError('The app changed before the inventory export could be read.');
                if(choice.canceled||!choice.filePaths?.length)return {ok:false,cancelled:true};
                if(choice.filePaths.length!==1||typeof choice.filePaths[0]!=='string')throw new InventoryReadError('Choose one inventory text export.');
                target=choice.filePaths[0];
            }else{
                if(typeof config?.eqRootPath!=='string'||!path.isAbsolute(config.eqRootPath))return {ok:false,notFound:true};
                const root=path.resolve(config.eqRootPath);await normalDirectories(root,this.fs);let match=null,count=0;
                for await(const entry of await this.fs.opendir(root)){
                    if(++count>MAX_DIRECTORY_ENTRIES)throw new InventoryReadError('The EverQuest folder contains too many files to search automatically. Choose the inventory export.');
                    if(entry.name.toLowerCase()!==expected.toLowerCase())continue;
                    if(match)throw new InventoryReadError('More than one matching inventory filename was found. Choose the correct export.');
                    if(!entry.isFile()||entry.isSymbolicLink())throw new InventoryReadError('The matching inventory export must be an original regular file.');
                    match=entry.name;
                }
                if(!match)return {ok:false,notFound:true};target=path.join(root,match);
            }
            if(!this.isMain(event))throw new InventoryReadError('The app changed before the inventory export could be read.');
            const result=await readStableFile(target,this.fs);
            if(!this.isMain(event))throw new InventoryReadError('The app changed before the inventory export could be read.');
            return result;
        }catch(error){return {ok:false,error:error instanceof InventoryReadError?error.message:'The inventory export could not be read. Run /outputfile inventory, or choose its text file and try again.'};}
        finally{this.busy=false;}
    }
    dispose(){this.disposed=true;this.electron.ipcMain.removeHandler(CHANNEL);}
}
module.exports={InventoryFileHost,inventoryFileName,decodeInventoryText,MAX_INVENTORY_BYTES};
