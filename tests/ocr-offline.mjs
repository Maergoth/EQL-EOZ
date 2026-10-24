import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import {join,resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
import {parseScreenRead} from '../app/screen-read-parser.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),{OcrService}=createRequire(import.meta.url)('../desktop/ocr-service.cjs');
const deny=join(root,'tests','fixtures','deny-network.cjs');
const cases=[{label:'source dependencies',options:{}},{label:'assembled packaged runtime',options:{runtimeRoot:join(root,'.generated','ocr-runtime'),workerPath:join(root,'.generated','ocr-runtime','ocr-worker.cjs')}}];
for(const test of cases){
    const service=new OcrService({...test.options,workerExecArgv:['--require',deny]});
    try{
        const result=await service.recognize(await readFile(join(root,'tests','fixtures','screen-read','item.png')));
        const [item]=parseScreenRead({...result,owner:'contribution'}),fields=Object.fromEntries(item.fields.map(field=>[field.key,field.value]));
        assert.equal(item.subject.name,'Synthetic Test Blade +3');assert.equal(fields.ac,12);assert.equal(fields.hp,45);assert.equal(fields.tier,3);
        assert.equal(fields.requiredLevel,15);assert.equal(fields.delay,24);assert.ok(result.words.length>20,'actual word geometry must be returned');
        await assert.rejects(service.recognize(await readFile(join(root,'tests','fixtures','screen-read','item.png')),{layout:'untrusted'}),/layout/);
        const blockResult=await service.recognize(await readFile(join(root,'tests','fixtures','screen-read','item.png')),{layout:'block'});
        assert.equal(parseScreenRead({...blockResult,owner:'contribution'})[0].subject.name,'Synthetic Test Blade +3','bounded block layout uses the same offline worker');
        assert.deepEqual(parseScreenRead({...result,owner:'character'}),[],'Item screen reading belongs to Contribute, never Character capture');
        const characterResult=await service.recognize(await readFile(join(root,'tests','fixtures','screen-read','character.png')));
        const characterRecords=parseScreenRead({...characterResult,owner:'character',characterOnly:true}),character=characterRecords.find(entry=>entry.subject.kind==='character');assert.ok(character);assert.equal(characterRecords.length,1);
        const stats=Object.fromEntries(character.fields.map(field=>[field.key,field.value]));assert.equal(stats.hpCurrent,330);assert.equal(stats.hpMaximum,398);assert.equal(stats.str,90);
        console.log(`Offline OCR ${test.label}: item name/tier/AC/HP/level/delay and character current/max/STR recognized; worker reused.`);
    }finally{await service.stop();}
}
const generated=join(root,'.generated','ocr-runtime'),manifest=JSON.parse(await readFile(join(generated,'asset-manifest.json'),'utf8'));
for(const file of manifest.files){const bytes=await readFile(join(generated,...file.path.split('/')));assert.equal(bytes.length,file.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);}
assert.equal(manifest.packages['tesseract.js'],'7.0.0');assert.equal(manifest.packages['tesseract.js-core'],'7.0.0');
console.log(`Offline OCR asset manifest: ${manifest.files.length} file sizes/digests match the assembled runtime.`);
