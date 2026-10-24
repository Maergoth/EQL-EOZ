'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const PROFILE_STORAGE_KEY='eql-eye-of-zomm-character-profiles-v1';
const CONTRIBUTION_STORAGE_KEY='eql-eye-of-zomm-contributions-v1';
const CHARACTER_STORAGE_KEYS=Object.freeze(['eql-eye-of-zomm-character-v1','eql-eye-of-zomm-character-walkthrough-v1',PROFILE_STORAGE_KEY,CONTRIBUTION_STORAGE_KEY]);
const MAX_VALUE_BYTES=1500000,MAX_ROSTER_BYTES=8000000,MAX_CONTRIBUTION_BYTES=1800000;
// Inner values are JSON strings. Any one-byte character can require six bytes
// when escaped in the fixed outer envelope; allow every bounded key at once.
const MAX_FILE_BYTES=(MAX_VALUE_BYTES*2+MAX_ROSTER_BYTES+MAX_CONTRIBUTION_BYTES)*6+4096;
const CHANNEL='eye-of-zomm:character-storage';
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
function checkedValues(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid Character storage values.');
    for(const [key,text]of Object.entries(value)){
        const limit=key===PROFILE_STORAGE_KEY?MAX_ROSTER_BYTES:key===CONTRIBUTION_STORAGE_KEY?MAX_CONTRIBUTION_BYTES:MAX_VALUE_BYTES;
        if(!CHARACTER_STORAGE_KEYS.includes(key)||text!==null&&(typeof text!=='string'||Buffer.byteLength(text,'utf8')>limit))throw Error('Invalid Character storage entry.');
    }
    return Object.fromEntries(Object.entries(value));
}

/** Port-independent private Character/contribution drafts. One atomic write and one
 * coalesced current state bound pending work; no browser origin or remote page
 * can choose a filename. A corrupt existing file is preserved and write-blocked.
 */
class CharacterStorage {
    constructor({directory,electron,origin,getMainWindow,warn=()=>{}}={}){
        if(typeof directory!=='string'||!path.isAbsolute(directory))throw Error('A private Character storage directory is required.');
        this.directory=directory;this.file=path.join(directory,'eye-of-zomm-character-storage.json');this.electron=electron;this.origin=origin;this.getMainWindow=getMainWindow;
        this.warn=warn;this.values={};this.error=null;this.initialized=false;this.initializing=null;this.revision=0;this.savedRevision=0;this.drain=null;
        this.accepting=true;this.registered=false;
    }
    async initialize(){
        if(this.initialized)return this.read();
        if(this.initializing)return this.initializing;
        this.initializing=(async()=>{
            await fsp.mkdir(this.directory,{recursive:true});
            let stat;
            try{stat=await fsp.lstat(this.file);}catch(error){if(error.code!=='ENOENT')this.failRead();}
            if(stat){
                try{
                    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>MAX_FILE_BYTES)throw Error('Unsafe Character storage file.');
                    const raw=await fsp.readFile(this.file,'utf8'),value=JSON.parse(raw);
                    if(!value||value.schemaVersion!==1||Object.keys(value).some(key=>!['schemaVersion','values'].includes(key)))throw Error('Invalid Character storage schema.');
                    this.values=checkedValues(value.values);
                }catch{
                    this.failRead();
                    // Keep the original untouched. A bounded regular file also
                    // gets an independent private recovery copy when possible.
                    if(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=MAX_FILE_BYTES){
                        const recovery=path.join(this.directory,'eye-of-zomm-character-storage.recovery.json');
                        try{await fsp.copyFile(this.file,recovery,fs.constants.COPYFILE_EXCL);await fsp.chmod(recovery,0o600);}catch{/* Original is still preserved. */}
                    }
                }
            }
            this.initialized=true;
            if(this.electron?.ipcMain){
                this.electron.ipcMain.handle(CHANNEL,(event,action,value)=>{
                    const main=this.getMainWindow?.();
                    if(!main||main.isDestroyed()||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||event.senderFrame?.url!==`${this.origin}/`)throw Error('Character storage request is unavailable.');
                    if(action==='read')return this.read();
                    if(action==='write')return this.write(value);
                    if(action==='flush')return this.flush();
                    throw Error('Unknown Character storage request.');
                });this.registered=true;
            }
            return this.read();
        })();return this.initializing;
    }
    failRead(){this.error='Saved Character data could not be read. The existing file was preserved; new edits are kept locally until recovery.';this.warn(this.error);}
    read(){return {values:{...this.values},error:this.error};}
    async write(input){
        if(!this.initialized||!this.accepting)throw Error('Character storage is unavailable.');
        if(this.error)throw Error(this.error);
        if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==2||!own(input,'key')||!own(input,'value'))throw Error('Invalid Character storage write.');
        const {key,value}=input;checkedValues({[key]:value});
        // A present null is a deletion tombstone: legacy browser storage must
        // never resurrect data deliberately removed from this file.
        this.values={...this.values,[key]:value};this.revision++;
        return this.flush();
    }
    async flush(){
        if(this.error)throw Error(this.error);
        if(this.drain)return this.drain;
        if(this.savedRevision===this.revision)return {ok:true};
        this.drain=(async()=>{
            while(this.savedRevision!==this.revision){
                const revision=this.revision,values={...this.values},temporary=`${this.file}.tmp-${process.pid}-${randomUUID()}`;
                try{
                    const current=await fsp.lstat(this.file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
                    if(current&&(!current.isFile()||current.isSymbolicLink()))throw Error('Unsafe Character storage destination.');
                    const handle=await fsp.open(temporary,'wx',0o600);
                    try{await handle.writeFile(JSON.stringify({schemaVersion:1,values}),'utf8');await handle.sync();}finally{await handle.close();}
                    await fsp.rename(temporary,this.file);this.savedRevision=revision;
                }catch(error){
                    await fsp.rm(temporary,{force:true}).catch(()=>{});
                    this.warn('Character data could not be saved to its private file. Keep Eye of Zomm open and retry saving.');
                    throw Error('Character data could not be saved to its private file.',{cause:error});
                }
            }
            return {ok:true};
        })().finally(()=>{this.drain=null;});return this.drain;
    }
    async close(){this.accepting=false;try{return await this.flush();}finally{if(this.registered){this.electron.ipcMain.removeHandler(CHANNEL);this.registered=false;}}}
}
module.exports={CharacterStorage,CHARACTER_STORAGE_KEYS,MAX_VALUE_BYTES,MAX_ROSTER_BYTES,MAX_CONTRIBUTION_BYTES,MAX_FILE_BYTES,CHANNEL};
