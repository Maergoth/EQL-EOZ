import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename} from 'node:path';
const {AchievementFileHost,achievementFileName,decodeAchievementText,MAX_ACHIEVEMENT_BYTES}=createRequire(import.meta.url)('../desktop/achievement-file-host.cjs');
const root=await fs.mkdtemp(join(tmpdir(),'eoz-achievement-file-')),game=join(root,'game'),outside=join(root,'chosen'),origin='http://127.0.0.1:53147',channel='eye-of-zomm:achievement-file';
await fs.mkdir(game);await fs.mkdir(outside);
const text='Synthetic: Journeys\r\nI\tTower visit\r\nI\t\tVisit the tower.\t0/1\r\n',target=join(game,'fixture_realm-achievements.txt');
function fixture({dialog=async()=>({canceled:true,filePaths:[]}),config=async()=>({eqRootPath:game})}={}){
    const handlers=new Map(),calls=[],main={isDestroyed:()=>false,webContents:{mainFrame:{url:origin+'/'}}};
    const electron={ipcMain:{handle:(name,callback)=>handlers.set(name,callback),removeHandler:name=>handlers.delete(name)},dialog:{async showOpenDialog(owner,options){assert.equal(owner,main);calls.push(options);return dialog();}}};
    const host=new AchievementFileHost({electron,origin,getMainWindow:()=>main,readConfig:config}),event={sender:main.webContents,senderFrame:main.webContents.mainFrame};
    return {host,event,main,handlers,calls,read:value=>host.handle(event,'read',{name:'Fixture',server:'Realm',...value})};
}
try{
    assert.equal(achievementFileName('Fixture','Realm'),'Fixture_Realm-Achievements.txt');
    for(const value of ['../Escape','C:\\private','Hidden:stream',' leading','bad\0name','',null])assert.throws(()=>achievementFileName(value,'Realm'));
    const utf8=Buffer.from(text),le=Buffer.concat([Buffer.from([255,254]),Buffer.from(text,'utf16le')]),be=Buffer.from(le);be.swap16();
    for(const bytes of [utf8,Buffer.concat([Buffer.from([239,187,191]),utf8]),le,be])assert.equal(decodeAchievementText(bytes),text);
    for(const bytes of [Buffer.alloc(0),Buffer.from([255]),Buffer.from('x\0binary'),Buffer.alloc(MAX_ACHIEVEMENT_BYTES+1)])assert.throws(()=>decodeAchievementText(bytes));
    await fs.writeFile(target,utf8);await fs.writeFile(join(game,'Other_Realm-Achievements.txt'),'Another character');
    const f=fixture();
    try{
        assert(f.handlers.has(channel));
        for(const event of [{sender:{},senderFrame:f.event.senderFrame},{sender:f.event.sender,senderFrame:{url:origin+'/'}},{sender:f.event.sender,senderFrame:{url:origin+'/overlay.html'}}])await assert.rejects(f.host.handle(event,'read',{}),/main app/);
        await assert.rejects(f.host.handle(f.event,'write',{}),/Unknown/);
        const found=await f.read();assert.equal(found.ok,true);assert.equal(found.text,text);assert.equal(found.file.name,basename(target));assert.equal(found.file.sha256,createHash('sha256').update(utf8).digest('hex'));assert.equal(found.file.bytes,utf8.length);assert.equal(f.calls.length,0,'Import finds the matching character file without opening a picker');
        assert.deepEqual(Object.keys(found.file).sort(),['bytes','modifiedAt','name','sha256']);assert.equal(JSON.stringify(found).includes(root),false);
        const newer=text.replace('0/1','1/1');await fs.writeFile(target,newer);assert.equal((await f.read()).text,newer,'A later import rereads the current file instead of cached export text');
        assert.deepEqual(await f.read({name:'Missing'}),{ok:false,notFound:true});
        for(const value of [{path:target},{eqRootPath:outside},{chooseFile:'yes'},{name:'../Fixture'}]){const result=await f.read(value);assert.equal(result.ok,false);assert.match(result.error,/achievement/i);assert.equal(JSON.stringify(result).includes(root),false);}
        assert.deepEqual(await f.read({chooseFile:true}),{ok:false,cancelled:true});assert.equal(f.calls[0].title,'Choose /outputfile achievements export');assert.equal(f.calls[0].defaultPath,join(game,'Fixture_Realm-Achievements.txt'));
    }finally{f.host.dispose();assert.equal(f.handlers.size,0);}
    const selected=join(outside,'explicit-achievements.txt');await fs.writeFile(selected,le);
    const explicit=fixture({dialog:async()=>({canceled:false,filePaths:[selected]})});
    try{const result=await explicit.read({chooseFile:true});assert.equal(result.ok,true);assert.equal(result.text,text);assert.equal(result.file.bytes,le.length);}finally{explicit.host.dispose();}
    const wrongOrigin=fixture();try{wrongOrigin.main.webContents.mainFrame.url='https://example.test/';await assert.rejects(wrongOrigin.read(),/main app/);}finally{wrongOrigin.host.dispose();}
    console.log('Achievement file host: independent trusted-main channel, character-specific current file lookup, UTF-8/UTF-16, private byte provenance and explicit picker fallback passed; shared stable-read security uses the inventory host suite.');
}finally{
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));assert.ok(basename(root).startsWith('eoz-achievement-file-'));await fs.rm(root,{recursive:true,force:true});
}
