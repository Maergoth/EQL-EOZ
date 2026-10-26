import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {JSDOM} from 'jsdom';
import {normalizeCharacterScreenshotFile,defaultCharacterScreenshotFile} from '../app/character-screenshot.js';
import {mountCharacterScreenshotPicker} from '../app/character-screenshot-picker.js';
import {normalizeCharacterWikiSheet,serializeCharacterWikiSheet,patchCharacterWikiSheet} from '../app/character-wiki-sheet.js';
const require=createRequire(import.meta.url),{decodeCharacterScreenshot,MAX_SOURCE_BYTES}=require('../desktop/character-screenshot-image.cjs'),{CharacterScreenshots}=require('../desktop/character-screenshots.cjs'),{validatePNG}=require('../desktop/wiki-client.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
assert.equal(defaultCharacterScreenshotFile('User:Synthetic Owner/Subpage',{name:'Keeper',server:'Test'}),'File:Character Synthetic Owner/Subpage - Keeper (Test).png');
for(const value of ['https://example.test/a.png','data:image/png;base64,x','File:Media:a.png','../a.png','/a.png','C:\\a.png','a|b.png','a{{x}}.png','a#b.png','a\nb.png','x'.repeat(241)+'.png','a.svg'])assert.throws(()=>normalizeCharacterScreenshotFile(value),undefined,value);
assert.equal(normalizeCharacterScreenshotFile('An_image (2).JPG'),'File:An_image (2).JPG');
const sheet={schemaVersion:1,metadata:{name:'Keeper',server:'Test',level:50,race:'Human',classes:['WAR','CLR'],aaCount:0},totals:{},equipment:[]},key='a'.repeat(64);
assert.equal(normalizeCharacterWikiSheet({...sheet,screenshotFile:'File:Portrait.png'}).screenshotFile,'File:Portrait.png');assert.match(serializeCharacterWikiSheet({...sheet,screenshotFile:'File:Portrait_one.png'}),/\|screenshot=Portrait&#95;one.png/);
const ordinary=serializeCharacterWikiSheet(sheet),withPhoto=patchCharacterWikiSheet('',key,serializeCharacterWikiSheet({...sheet,screenshotFile:'File:Manual_one.png'}),{metadata:sheet.metadata}).text;
assert.match(patchCharacterWikiSheet(withPhoto,key,ordinary,{metadata:sheet.metadata}).text,/\|screenshot=Manual&#95;one.png/);
for(const caption of ['<!-- {{ | screenshot=Wrong.png -->','<nowiki>{{ | screenshot=Wrong.png</nowiki>','<pre>{{ | screenshot=Wrong.png</pre>'])assert.match(patchCharacterWikiSheet(withPhoto.replace('|screenshot=','|caption='+caption+'\n|screenshot='),key,ordinary,{metadata:sheet.metadata}).text,/\|screenshot=Manual&#95;one.png/,'literal/comment braces never hide the real top-level manual image');
assert.match(patchCharacterWikiSheet(withPhoto,key,serializeCharacterWikiSheet({...sheet,screenshotFile:'New.png'}),{metadata:sheet.metadata}).text,/\|screenshot=New.png/);
assert.doesNotMatch(patchCharacterWikiSheet('',key,ordinary,{metadata:sheet.metadata}).text,/screenshot=/);
assert.throws(()=>patchCharacterWikiSheet(withPhoto.replace('Manual&#95;one.png','https://evil.test/a.png'),key,ordinary,{metadata:sheet.metadata}),/filename/);
assert.throws(()=>patchCharacterWikiSheet(withPhoto.replace('|screenshot=','|screenshot=Other.png\n|screenshot='),key,ordinary,{metadata:sheet.metadata}),/Duplicate/);
// Native codec tests inspect independent byte headers and actual BMP pixels.
let decoded=0,pixels=null;const image={isEmpty:()=>false,getSize:()=>({width:1,height:1}),toPNG:()=>png};const nativeImage={createFromBuffer:()=>{decoded++;return image;},createFromBitmap:(bytes,size)=>{pixels=Buffer.from(bytes);assert.equal(size.width,1);return image;}};
assert.deepEqual(decodeCharacterScreenshot(png,nativeImage).png,png);assert.equal(decoded,1);
const oversized=Buffer.from(png);oversized.writeUInt32BE(100000,16);assert.throws(()=>decodeCharacterScreenshot(oversized,nativeImage),/megapixels/);assert.equal(decoded,1,'dimensions rejected before decode');
assert.throws(()=>decodeCharacterScreenshot(Buffer.alloc(MAX_SOURCE_BYTES+1),nativeImage),/48 MiB/);
function bmp(bits=24,height=1){const bytes=Buffer.alloc(58);bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(54,10);bytes.writeUInt32LE(40,14);bytes.writeInt32LE(1,18);bytes.writeInt32LE(height,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(bits,28);bytes.set([3,5,7,0],54);return bytes;}
for(const [bits,height]of [[24,1],[24,-1],[32,1]]){decodeCharacterScreenshot(bmp(bits,height),nativeImage);assert.deepEqual([...pixels],[3,5,7,255]);}
for(const change of [bytes=>bytes.writeUInt32LE(1,30),bytes=>bytes.writeUInt16LE(8,28),bytes=>bytes.writeUInt32LE(20,10),bytes=>bytes.writeInt32LE(100000,18),bytes=>bytes.writeInt32LE(-2147483648,22),bytes=>bytes.writeUInt32LE(500,2)]){const bytes=bmp();change(bytes);assert.throws(()=>decodeCharacterScreenshot(bytes,nativeImage));}
const jpeg=Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,0,0,255,217]);assert.deepEqual(decodeCharacterScreenshot(jpeg,nativeImage).png,png,'JPEG is re-encoded, never uploaded as original metadata-bearing bytes');
const badJpeg=Buffer.from(jpeg);badJpeg.writeUInt16BE(60000,7);assert.throws(()=>decodeCharacterScreenshot(badJpeg,nativeImage));
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'eoz-photo-unit-'));
try{const store=new CharacterScreenshots({stateDir:temporary,validate:validatePNG}),first=await store.prepare(key,png,{width:1,height:1});assert(!JSON.stringify(first).includes('base64'));const reopened=new CharacterScreenshots({stateDir:temporary,validate:validatePNG});assert.deepEqual((await reopened.get(key,first)).bytes,png);await assert.rejects(reopened.get(key,{...first,sha256:'b'.repeat(64)}),/changed/);await assert.rejects(reopened.remove(key,'stale_id'),/changed/);
const previous=reopened.persist;reopened.persist=async()=>{throw Error('Synthetic quota');};await assert.rejects(reopened.prepare(key,png,{width:1,height:1}),/quota/);assert.equal((await reopened.get(key)).record.attachmentId,first.attachmentId,'failed replacement retains old private selection');reopened.persist=previous;
await fs.writeFile(path.join(temporary,'character-screenshots',first.attachmentId+'.png'),'changed');await assert.rejects(reopened.get(key),/PNG|screenshot|bytes/);await fs.writeFile(path.join(temporary,'character-screenshots',first.attachmentId+'.png'),png);await reopened.remove(key,first.attachmentId);assert.equal(await reopened.get(key),null);
await fs.writeFile(path.join(temporary,'character-screenshots','index.json'),'{bad');await assert.rejects(new CharacterScreenshots({stateDir:temporary,validate:validatePNG}).get(key),/Existing files remain/);
const memory=new CharacterScreenshots({validate:validatePNG});for(let at=0;at<20;at++)await memory.prepare(at.toString(16).padStart(64,'0'),png,{width:1,height:1});await assert.rejects(memory.prepare('f'.repeat(64),png,{width:1,height:1}),/full/);assert(await memory.prepare('0'.repeat(64),png,{width:1,height:1}),'replacement works at selection capacity');
}finally{await fs.rm(temporary,{recursive:true,force:true});}
// Mounted browser behavior: private selection, account confirmation and stale
// chooser responses; no capture/OCR dependency or public write API is supplied.
const dom=new JSDOM('<section id="picker"></section>'),root=dom.window.document.querySelector('section');let context='profile-A',selection=null,reviewCalls=0,selectedCalls=0,release;const photo={attachmentId:'opaque_photo',sha256:'a'.repeat(64),thumbnail:'data:image/png;base64,'+png.toString('base64')},account={user:{id:1,name:'Synthetic Owner'}};
const api={characterScreenshot:async()=>({selection}),prepareCharacterScreenshot:async({source})=>{assert(['file','clipboard'].includes(source));selectedCalls++;return {selection:photo};},reviewCharacterScreenshot:async()=>{reviewCalls++;return {reviewId:'review_'+reviewCalls,user:{...account.user},filename:'Character Synthetic Owner - Keeper (Test).png',collision:true};},removeCharacterScreenshot:async()=>{selection=null;return {removed:true};}};
const picker=mountCharacterScreenshotPicker({root,api,getContextKey:()=>context}),settle=async()=>{for(let at=0;at<20;at++)await new Promise(resolve=>setTimeout(resolve,0));};
await picker.open(sheet.metadata);assert.deepEqual(await picker.forShare(account),{ready:true,reviewId:null});root.querySelector('[data-photo-select]').click();await settle();assert.equal(selectedCalls,1);assert.match(root.textContent,/nothing will be overwritten/);assert.equal((await picker.forShare(account)).ready,true);account.user={id:2,name:'Other Owner'};assert.equal((await picker.forShare(account)).ready,false,'account change displays new review before consent');assert.equal((await picker.forShare(account)).ready,true);
root.querySelector('[data-photo-remove]').click();await settle();assert.match(root.textContent,/current wiki image.*will stay/);assert.equal((await picker.forShare(account)).reviewId,null);
api.prepareCharacterScreenshot=()=>new Promise(resolve=>{release=resolve;});root.querySelector('[data-photo-paste]').click();context='profile-B';picker.close();release({selection:photo});await settle();assert.equal(root.querySelector('img').hasAttribute('src'),false,'old profile chooser cannot restore a closed/new profile review');picker.dispose();dom.window.close();
console.log('Character screenshots: safe local File identities, preserve/replace, bounded PNG/JPEG/BMP, private atomic restart/quota and mounted optional/account/stale review passed.');
