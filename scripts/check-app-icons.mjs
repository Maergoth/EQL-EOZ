import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),read=name=>readFile(new URL(name,root));
const manifest=JSON.parse(await read('build/app-icons.json'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.schemaVersion,1);assert.equal(manifest.source,'app/assets/eye-of-zomm.svg');
assert.equal(sha(await read(manifest.source)),manifest.sourceSha256,'Regenerate icons when the vector changes.');
const expected=['build/icon.png','build/icon.ico','app/assets/eye-of-zomm.png'];
assert.deepEqual(Object.keys(manifest.files).sort(),expected.sort());
for(const [file,checksum]of Object.entries(manifest.files))assert.equal(sha(await read(file)),checksum,file+' differs from the reviewed icon export.');
const pngSize=bytes=>{assert(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));assert.equal(bytes.toString('ascii',12,16),'IHDR');assert.equal(bytes[25],6,'Icon must retain an alpha channel.');return[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];};
const png=await read('build/icon.png');assert.deepEqual(pngSize(png),[512,512]);assert(png.equals(await read('app/assets/eye-of-zomm.png')));
const ico=await read('build/icon.ico');assert.equal(ico.readUInt16LE(0),0);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),manifest.icoSizes.length);
assert.deepEqual(manifest.icoSizes,[16,20,24,32,40,48,64,128,256]);
let end=6+16*manifest.icoSizes.length;
for(const [index,size]of manifest.icoSizes.entries()){
    const at=6+16*index,offset=ico.readUInt32LE(at+12),length=ico.readUInt32LE(at+8);
    assert.equal(ico[at]||256,size);assert.equal(ico[at+1]||256,size);assert.equal(ico.readUInt16LE(at+6),32);assert.equal(offset,end);end=offset+length;assert(end<=ico.length);assert.deepEqual(pngSize(ico.subarray(offset,end)),[size,size]);
}
assert.equal(end,ico.length);
const pkg=JSON.parse(await read('package.json'));assert.equal(pkg.build.win.icon,'build/icon.ico');assert.equal(pkg.build.linux.icon,'build/icon.png');
console.log('Native eye assets passed: vector provenance, exact PNG/ICO bytes, alpha and nine Windows sizes.');
