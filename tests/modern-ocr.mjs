// Real pinned offline OCR over generated pixels, not injected OCR word objects.
// Uses an isolated Electron profile/nativeImage; never captures a screen/window.
import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve,dirname,basename} from 'node:path';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-modern-ocr-'));
const diagnosticIndex=process.argv.indexOf('--diagnostics'),diagnostics=diagnosticIndex<0?null:resolve(process.argv[diagnosticIndex+1]);
async function verify({root,profile,diagnostics}){
    const {app,nativeImage}=require('electron'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');app.setPath('userData',profile);setTimeout(()=>{console.error('Modern synthetic OCR exceeded its 55-second runtime limit.');app.exit(1);},55000).unref();await app.whenReady();
    const deny=path.join(root,'tests','fixtures','deny-network.cjs');require(deny);
    const {OcrService}=require(path.join(root,'desktop','ocr-service.cjs')),{recognizeCaptureImage}=require(path.join(root,'desktop','capture-reader.cjs'));
    const {parseScreenRead}=await import(pathToFileURL(path.join(root,'app','screen-read-parser.js')).href),{createCharacterModel}=await import(pathToFileURL(path.join(root,'app','character-model.js')).href);
    const image=nativeImage.createFromPath(path.join(root,'tests','fixtures','screen-read','modern-layout.png'));assert.deepEqual(image.getSize(),{width:2560,height:1100});
    for(const packaged of [false,true]){
        const runtimeRoot=path.join(root,'.generated','ocr-runtime'),ocr=new OcrService({...(packaged?{runtimeRoot,workerPath:path.join(runtimeRoot,'ocr-worker.cjs')}:{}),workerExecArgv:['--require',deny]});
        try{
            const read=await recognizeCaptureImage({ocr,image,nativeImage});
            const records=parseScreenRead({...read.result,owner:'character',sessionId:'synthetic-modern-pixels',input:read.input});
            if(diagnostics){const fs=require('node:fs/promises');await fs.mkdir(diagnostics,{recursive:true});await fs.writeFile(path.join(diagnostics,packaged?'modern-assembled.json':'modern-source.json'),JSON.stringify({read,records},null,2));}
            const fields=record=>Object.fromEntries(record.fields.map(field=>[field.key,field.value]));
            const items=records.filter(record=>record.subject.kind==='item'),character=records.find(record=>record.subject.kind==='character');
            assert.equal(items.length,2,`Two independent item panes; actual OCR text: ${read.result.text}`);
            const byName=new Map(items.map(item=>[item.subject.name,item]));
            const boots=byName.get('Synthetic Ember Boots +3'),blade=byName.get('Synthetic Quartz Blade +6');assert.ok(boots&&blade,`Actual item names: ${JSON.stringify([...byName.keys()])}`);
            const b=fields(boots),w=fields(blade);assert.equal(b.ac,31);assert.equal(b.hp,147);assert.deepEqual(b.slots,['Feet']);assert.equal(b.tier,3);assert.equal(b.fraction,5);assert.equal(b.fractionMaximum,8);
            assert.equal(w.ac,29);assert.equal(w.hp,83);assert.deepEqual(w.slots,['Primary']);assert.equal(w.tier,6);assert.equal(w.fraction,18);assert.equal(w.fractionMaximum,64);assert.equal(w.damage,13);assert.equal(w.damageBonus,17);assert.equal(w.delay,31);assert.equal(w.attackSpeed,18);
            assert.equal(b.modified,undefined);assert.equal(w.modified,undefined,'An unchecked Modified label is not an observed state');
            assert.ok(character,'Inventory on the right is independent of examine panes');const c=fields(character);
            for(const [key,value]of Object.entries({hpCurrent:337,hpMaximum:901,manaCurrent:225,manaMaximum:703,enduranceCurrent:119,enduranceMaximum:509,str:111,sta:112,agi:113,dex:114,wis:115,int:116,cha:117,resistPoison:31,resistMagic:32,resistDisease:33,resistFire:34,resistCold:35,resistCorruption:36}))assert.equal(c[key],value,`Modern character field ${key}`);
            assert.equal(c.attack,undefined,'The bare Attack pair is not an inferred total');assert.equal(c.attackMelee,undefined);assert.equal(c.attackRanged,undefined);
            assert.ok(c.hpRegen===undefined||c.hpRegen===11,'A regen digit must match its pixels or remain unknown');
            assert.equal(w.str,undefined,'Inventory/other-item Strength cannot bleed into the weapon');assert.equal(b.hpCurrent,undefined,'Inventory resource labels cannot bleed into item values');
            assert(records.length<=4&&records.every(record=>record.fields.length<=100&&record.evidence.text.length<=16384));assert(read.input.ocrPasses.length<=3,'Bounded scene plus refinement passes');
            const model=createCharacterModel({storage:null});for(const [item,slot]of [[boots,'feet'],[blade,'primary']]){const result=model.intake(item);assert.equal(result.ok,true);assert.equal(model.assign(result.candidate.id,slot).ok,true);assert.equal(result.candidate.fraction,fields(item).fraction);}
            console.log(`Modern synthetic pixel OCR ${packaged?'assembled runtime':'source dependencies'}: two names, split item stats, slots/progress, right-hand Inventory current/max/attributes/resists, no field bleed and usable Character cards passed.`);
        }finally{await ocr.stop();}
    }
    app.quit();
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${verify.toString()})(${JSON.stringify({root,profile:join(temporary,'profile'),diagnostics})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry],{env,stdio:'inherit',windowsHide:true,timeout:60000});child.once('error',reject);child.once('exit',done);});assert.equal(code,0,'Actual offline Modern pixel OCR gate passes');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert.ok(basename(temporary).startsWith('eoz-modern-ocr-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
