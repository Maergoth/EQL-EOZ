import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
const {InventoryFileHost,inventoryFileName,decodeInventoryText,MAX_INVENTORY_BYTES}=createRequire(import.meta.url)('../desktop/inventory-file-host.cjs');
const root=await fs.mkdtemp(join(tmpdir(),'eoz-inventory-file-')),game=join(root,'game'),outside=join(root,'explicit-file'),origin='http://127.0.0.1:53147',channel='eye-of-zomm:inventory-file';
await fs.mkdir(game);await fs.mkdir(outside);
const text='Location\tName\tID\tCount\tSlots\r\nHead\tEmpty\t0\t0\t0\r\nGeneral1\tSynthetic Ring+4\t101\t1\t1\r\n\r\nKeyRing\tName\tID\r\nMount\tSynthetic Mount\t202\r\n',target=join(game,'fixture_rivervale-inventory.txt');
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return{resolve,promise};};
function fixture({io=fs,config=async()=>({eqRootPath:game}),dialog=async()=>({canceled:true,filePaths:[]})}={}){
  const handlers=new Map(),calls=[],main={isDestroyed:()=>false,webContents:{mainFrame:{url:origin+'/'}}};
  const electron={ipcMain:{handle:(name,callback)=>handlers.set(name,callback),removeHandler:name=>handlers.delete(name)},dialog:{async showOpenDialog(owner,options){assert.equal(owner,main);calls.push(options);return dialog();}}};
  const host=new InventoryFileHost({electron,origin,getMainWindow:()=>main,readConfig:config,fsImpl:io}),event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
  return{host,event,handlers,main,calls,read:value=>host.handle(event,'read',{name:'Fixture',server:'Rivervale',...value})};
}
try{
  assert.equal(inventoryFileName('Fixture','Rivervale'),'Fixture_Rivervale-Inventory.txt');
  for(const value of ['../Escape','C:\\private','Hidden:stream','Trailing.',' leading','bad\0name','..','',null])assert.throws(()=>inventoryFileName(value,'Rivervale'));
  const utf8=Buffer.from(text),le=Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]),be=Buffer.from(le);be.swap16();
  for(const bytes of [utf8,Buffer.concat([Buffer.from([239,187,191]),utf8]),le,be])assert.equal(decodeInventoryText(bytes),text);
  for(const bytes of [Buffer.alloc(0),Buffer.from([255]),Buffer.from([255,254,1]),Buffer.from('x\0binary'),Buffer.alloc(MAX_INVENTORY_BYTES+1)])assert.throws(()=>decodeInventoryText(bytes));
  await fs.writeFile(target,utf8);
  const f=fixture();
  try{
    assert.equal(f.handlers.has(channel),true);
    for(const event of [{sender:{},senderFrame:f.event.senderFrame},{sender:f.event.sender,senderFrame:{url:origin+'/'}},{sender:f.event.sender,senderFrame:{url:origin+'/overlay.html'}}])await assert.rejects(f.host.handle(event,'read',{}),/main app/);
    await assert.rejects(f.host.handle(f.event,'delete',{}),/Unknown/);
    const found=await f.read();assert.equal(found.ok,true);assert.equal(found.text,text);assert.equal(found.file.name,basename(target));assert.equal(found.file.bytes,utf8.length);assert.equal(found.file.sha256,createHash('sha256').update(utf8).digest('hex'));assert.equal(found.file.modifiedAt,Math.trunc((await fs.stat(target)).mtimeMs));assert.equal(f.calls.length,0,'automatic lookup never opens a native dialog');assert.deepEqual(Object.keys(found.file).sort(),['bytes','modifiedAt','name','sha256']);assert.equal(JSON.stringify(found).includes(game),false,'no renderer filesystem paths are returned');
    assert.deepEqual(await f.read({name:'Missing'}),{ok:false,notFound:true});
    for(const value of [{path:target},{eqRootPath:outside},{chooseFile:'yes'},{name:'../Fixture'},{server:'../../Other'}]){const result=await f.read(value);assert.equal(result.ok,false);assert.equal(typeof result.error,'string');assert.equal(JSON.stringify(result).includes(root),false);}
    assert.deepEqual(await f.read({chooseFile:true}),{ok:false,cancelled:true});assert.equal(f.calls.length,1);assert.equal(f.calls[0].defaultPath,join(game,'Fixture_Rivervale-Inventory.txt'));
  }finally{f.host.dispose();assert.equal(f.handlers.size,0);}
  const selected=join(outside,'manual-inventory.txt');
  for(const bytes of [le,be]){
    await fs.writeFile(selected,bytes);const f=fixture({dialog:async()=>({canceled:false,filePaths:[selected]})});
    try{const result=await f.read({chooseFile:true});assert.equal(result.ok,true);assert.equal(result.text,text);assert.equal(result.file.bytes,bytes.length);assert.equal(result.file.sha256,createHash('sha256').update(bytes).digest('hex'));}finally{f.host.dispose();}
  }
  {
    const huge=join(outside,'huge.txt');await fs.writeFile(huge,'x');await fs.truncate(huge,MAX_INVENTORY_BYTES+1);const f=fixture({dialog:async()=>({canceled:false,filePaths:[huge]})});
    try{assert.equal((await f.read({chooseFile:true})).ok,false);}finally{f.host.dispose();}
  }
  {
    let opens=0;const io={...fs,async lstat(file,options){const stat=await fs.lstat(file,options);return file===target?{...stat,isFile:()=>false,isSymbolicLink:()=>true}:stat;},async open(){opens++;throw Error('A linked file must never be opened.');}};
    const f=fixture({io,dialog:async()=>({canceled:false,filePaths:[target]})});try{assert.equal((await f.read({chooseFile:true})).ok,false);assert.equal(opens,0);}finally{f.host.dispose();}
  }
  {
    let changed=false;const io={...fs,async open(...args){const handle=await fs.open(...args);return new Proxy(handle,{get(object,key){if(key==='read')return async(...readArgs)=>{if(!changed){changed=true;await fs.appendFile(target,'changed');}return object.read(...readArgs);};const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});}};
    const f=fixture({io});try{const result=await f.read();assert.equal(result.ok,false);assert.match(result.error,/changed while/);}finally{f.host.dispose();await fs.writeFile(target,utf8);}
  }
  {
    let changed=false;const io={...fs,async open(...args){const handle=await fs.open(...args);return new Proxy(handle,{get(object,key){if(key==='read')return async(...readArgs)=>{if(!changed){changed=true;await fs.rename(target,target+'.retired');await fs.writeFile(target,utf8);}return object.read(...readArgs);};const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;}});}};
    const f=fixture({io});try{assert.equal((await f.read()).ok,false);}finally{f.host.dispose();}
  }
  {
    const held=deferred();let opens=0;const f=fixture({config:()=>held.promise,io:{...fs,async open(...args){opens++;return fs.open(...args);}}});
    const result=f.read();f.host.dispose();held.resolve({eqRootPath:game});assert.equal((await result).ok,false);assert.equal(opens,0,'disposed callers cannot finish reading a file after config awaits');
  }
  {
    const held=deferred();let opens=0;const f=fixture({dialog:()=>held.promise,io:{...fs,async open(...args){opens++;return fs.open(...args);}}});
    try{const pending=f.read({chooseFile:true});while(!f.calls.length)await new Promise(resolve=>setImmediate(resolve));assert.equal((await f.read()).ok,false,'only one read/picker may be pending');f.main.webContents.mainFrame.url='https://example.test/';held.resolve({canceled:false,filePaths:[target]});assert.equal((await pending).ok,false);assert.equal(opens,0,'navigation after the native picker opens revokes filesystem access');}finally{f.host.dispose();}
  }
  {
    const linked=join(root,'linked-game');await fs.symlink(game,linked,process.platform==='win32'?'junction':'dir');const f=fixture({config:async()=>({eqRootPath:linked})});
    try{const result=await f.read();assert.equal(result.ok,false);assert.match(result.error,/linked folders/);}finally{f.host.dispose();}
    const f2=fixture({dialog:async()=>({canceled:false,filePaths:[join(linked,basename(target))]})});try{assert.equal((await f2.read({chooseFile:true})).ok,false);}finally{f2.host.dispose();}
  }
  {
    const f=fixture({io:{...fs,opendir:async()=>({async *[Symbol.asyncIterator](){for(const name of ['fixture_rivervale-inventory.txt','Fixture_Rivervale-Inventory.txt'])yield{name,isFile:()=>true,isSymbolicLink:()=>false};}})}});
    try{assert.match((await f.read()).error,/More than one/);}finally{f.host.dispose();}
  }
  console.log('Inventory file host: trusted-main IPC, configured case-insensitive lookup, explicit picker, bounded UTF-8/UTF-16, raw-byte provenance, linked-folder denial, stable descriptor/path checks and navigation/dispose races passed.');
}finally{
  assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('eoz-inventory-file-'));await fs.rm(root,{recursive:true,force:true});
}
