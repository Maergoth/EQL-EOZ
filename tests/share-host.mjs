import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require=createRequire(import.meta.url),{ShareHost,validatePng}=require('../desktop/share-host.cjs');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ZkAAAAASUVORK5CYII=';
assert.equal(validatePng(png).length,68);
const huge=Buffer.from(png.slice(22),'base64');huge.writeUInt32BE(9000,16);
assert.throws(()=>validatePng(`data:image/png;base64,${huge.toString('base64')}`),/dimensions/);
for(const invalid of ['',png.replace('image/png','image/svg+xml'),png+'!'])assert.throws(()=>validatePng(invalid));
const folder=await mkdtemp(join(tmpdir(),'eoz-share-host-')),target=join(folder,'snapshot.png');
let handler,decoded=0,clipboardWrites=0,saveTarget=target;
const main={isDestroyed:()=>false,webContents:{mainFrame:{url:'http://127.0.0.1:1/'}}};
const event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
const electron={ipcMain:{handle:(_channel,fn)=>{handler=fn;},removeHandler:()=>{}},nativeImage:{createFromBuffer:()=>{decoded++;return{isEmpty:()=>false};}},clipboard:{writeImage:()=>clipboardWrites++,writeText:()=>clipboardWrites++},dialog:{showSaveDialog:async()=>({filePath:saveTarget,canceled:false})}};
const host=new ShareHost({electron,origin:'http://127.0.0.1:1',getMainWindow:()=>main});
try{
    await assert.rejects(()=>handler({...event,senderFrame:{url:'http://127.0.0.1:1/'}},'copy-png',png),/unavailable/);
    await assert.rejects(()=>handler(event,'copy-png',`data:image/png;base64,${huge.toString('base64')}`),/dimensions/);assert.equal(decoded,0,'Reject oversized raster headers before native decoding');
    assert.equal((await handler(event,'copy-png',png)).ok,true);assert.equal(clipboardWrites,1);
    await handler(event,'save-png',png);assert.deepEqual(await readFile(target),validatePng(png));
    saveTarget=join(folder,'snapshot');await assert.rejects(()=>handler(event,'save-png',png),/ending in .png/);
    await handler(event,'copy-text','{{Itempage\n'+ 'x'.repeat(1000)+'\n}}');assert.equal(clipboardWrites,2,'Reviewed wikicode can exceed the old waypoint clipboard limit');
    await assert.rejects(()=>handler(event,'copy-text','x'.repeat(300001)),/too large/);
}finally{host.dispose();await rm(folder,{recursive:true,force:true});}
console.log('Snapshot sharing: exact sender, bounded PNG predecode, clipboard, save and reviewed wikicode passed.');
