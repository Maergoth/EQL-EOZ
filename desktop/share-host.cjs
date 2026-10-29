'use strict';

const fsp = require('node:fs/promises');
const path = require('node:path');
const CHANNEL = 'eye-of-zomm:share';
const MAX_PNG_BYTES = 12 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137,80,78,71,13,10,26,10]);

function validatePng(value) {
    if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,') || value.length > MAX_PNG_BYTES * 1.34 + 30) throw Error('Choose a PNG snapshot smaller than 12 MB.');
    const encoded=value.slice(22);
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length%4) throw Error('Invalid PNG snapshot.');
    const bytes=Buffer.from(encoded,'base64');
    if (bytes.length>MAX_PNG_BYTES || bytes.length<33 || !bytes.subarray(0,8).equals(PNG_SIGNATURE) || bytes.readUInt32BE(8)!==13 || bytes.toString('ascii',12,16)!=='IHDR') throw Error('Invalid PNG snapshot.');
    const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
    if (!width || !height || width>8192 || height>8192 || width*height>15_000_000) throw Error('Snapshot dimensions are too large.');
    return bytes;
}

class ShareHost {
    constructor({electron,origin,getMainWindow,featureLease=()=>()=>true}) {
        Object.assign(this,{electron,origin,getMainWindow,featureLease});
        electron.ipcMain.handle(CHANNEL,(event,action,value)=>this.handle(event,action,value));
    }
    authorized(event) {
        const window=this.getMainWindow();
        return Boolean(window&&!window.isDestroyed()&&event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame&&event.senderFrame?.url===`${this.origin}/`);
    }
    async handle(event,action,value) {
        if (!this.authorized(event)) throw Error('Snapshot sharing is unavailable.');
        const current=this.featureLease(action==='copy-text'?'contributions':'character');if(!current())throw Error('This feature is disabled in Settings.');
        if (action==='copy-text') {
            if (typeof value!=='string'||!value||value.length>300000) throw Error('Wikicode is empty or too large.');
            this.electron.clipboard.writeText(value);return{ok:true};
        }
        if (!['copy-png','save-png'].includes(action)) throw Error('Unknown sharing request.');
        const bytes=validatePng(value),image=this.electron.nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw Error('The PNG snapshot could not be decoded.');
        if (action==='copy-png') {this.electron.clipboard.writeImage(image);return{ok:true};}
        const result=await this.electron.dialog.showSaveDialog(this.getMainWindow(),{title:'Save character snapshot',defaultPath:`Eye-of-Zomm-character-${new Date().toISOString().slice(0,10)}.png`,filters:[{name:'PNG image',extensions:['png']}],properties:['showOverwriteConfirmation']});
        if(!current())throw Error('The snapshot action was canceled.');
        if (result.canceled||!result.filePath) return{ok:false,canceled:true};
        if(path.extname(result.filePath).toLowerCase()!=='.png')throw Error('Choose a filename ending in .png so the save dialog can confirm any overwrite.');
        const target=result.filePath;
        await fsp.writeFile(target,bytes);return{ok:true};
    }
    dispose(){this.electron.ipcMain.removeHandler(CHANNEL);}
}
module.exports={ShareHost,validatePng,MAX_PNG_BYTES};
