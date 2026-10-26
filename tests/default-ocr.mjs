// Real offline Tesseract worker -> capture reader -> production parser, over
// generated Default-style pixels only. Parser-guard replays are explicitly
// separate from those real OCR observations. No game capture is performed.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temporary=await mkdtemp(join(tmpdir(),'eoz-default-ocr-'));
const diagnosticIndex=process.argv.indexOf('--diagnostics'),diagnostics=diagnosticIndex<0?null:resolve(process.argv[diagnosticIndex+1]);
async function verify({root,temporary,diagnostics}){
    const {app,BrowserWindow,nativeImage}=require('electron'),path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
    app.setPath('userData',path.join(temporary,'profile'));app.on('window-all-closed',()=>{});await app.whenReady();
    const deny=path.join(root,'tests/fixtures/deny-network.cjs');require(deny);
    const {OcrService}=require(path.join(root,'desktop/ocr-service.cjs')),{recognizeCaptureImage}=require(path.join(root,'desktop/capture-reader.cjs'));
    const {parseScreenRead,parseItemStatBlock}=await import(pathToFileURL(path.join(root,'app/screen-read-parser.js')).href),{drawDefaultOcrFixture}=await import(pathToFileURL(path.join(root,'tests/fixtures/screen-read/default-layout.mjs')).href);
    const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    win.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:/^https?:/.test(details.url)}));await win.loadURL('data:text/html,<title>Synthetic Default OCR</title>');
    const hashes=async()=>Object.fromEntries(await Promise.all(['app/screen-read-parser.js','desktop/capture-reader.cjs','desktop/capture-image.cjs','tests/fixtures/screen-read/default-layout.mjs','tests/default-ocr.mjs'].map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(root,name))).digest('hex')]))),sourceHashes=await hashes();
    const proofs=[],failures=[],fields=record=>Object.fromEntries(record.fields.map(field=>[field.key,field.value]));
    // These are the independently drawn ring Strength cell's source-pixel
    // bounds, not a search for any convenient 9 elsewhere in the item.
    function ringStrengthWords(read,scale){
        const captures=[{pass:'scene',passIndex:null,words:read.result.words||[]},...(read.result.refinements||[]).map((pass,index)=>({pass:pass.role,passIndex:index,words:pass.words||[]})).filter(pass=>pass.pass==='item-stats')];
        return captures.flatMap(pass=>pass.words.flatMap((word,index)=>{
            if(!word.bbox||!/^[-+]?[\d,]+(?:\.\d+)?(?:[\/|][-+]?[\d,]+(?:\.\d+)?)*[%+]?$/.test(String(word.text).trim()))return [];
            const x=((word.bbox.x0+word.bbox.x1)/2/read.input.scale+read.input.region.x)/scale,y=((word.bbox.y0+word.bbox.y1)/2/read.input.scale+read.input.region.y)/scale;
            return x>=1576&&x<=1620&&y>=440&&y<=468?[{pass:pass.pass,passIndex:pass.passIndex,index,word}]:[];
        }));
    }
    function confidenceOnlyReplay(result,selected,confidence){
        const replay=structuredClone(result);
        for(const {passIndex,index,word}of selected){const target=passIndex===null?replay.words[index]:replay.refinements[passIndex].words[index];target.confidence=confidence;assert.deepEqual(target,{...word,confidence},'Only the existing observed word confidence changes');}
        return replay;
    }
    function guardedRingStrengthUnknown(read,ring,scale){
        if(scale!==1||fields(ring).str!==undefined)return null;
        const observed=ringStrengthWords(read,scale),written=parseItemStatBlock(fields(ring).rawStatBlock||'');
        if(!observed.length||observed.length>3||observed.some(({word})=>String(word.text).trim()!=='9'||!Number.isFinite(Number(word.confidence))||Number(word.confidence)>=85)||written.conflicts.includes('str')||written.fields.find(field=>field.key==='str')?.value!==9)return null;
        const replay=confidenceOnlyReplay(read.result,observed,85),restored=parseScreenRead({...replay,input:read.input,owner:'contribution',sessionId:'synthetic-confidence-only-replay'}).find(record=>record.subject.kind==='item'&&record.subject.name==='Synthetic Cloud Band +4');
        if(!restored||fields(restored).str!==9)return null;
        return {subject:'ring',key:'str',expected:9,reason:'The actual ring Strength 9 is below the parser\'s 85-confidence guard; changing only that confidence restores the written 9.',confidenceThreshold:85,confidenceOnlyReplay:9,observations:observed.map(({pass,word})=>({pass,text:word.text,confidence:word.confidence,bbox:word.bbox}))};
    }
    function ringStrengthDiagnostic(read,ring,scale){
        const observed=ringStrengthWords(read,scale),written=parseItemStatBlock(fields(ring).rawStatBlock||'');
        return {expected:9,actual:fields(ring).str??null,scale,observationCount:observed.length,observations:observed.slice(0,3).map(({pass,word})=>({pass,text:word.text,confidence:word.confidence,bbox:word.bbox})),writtenStrength:written.fields.find(field=>field.key==='str')?.value??null,writtenConflicts:written.conflicts};
    }
    const expected={hpCurrent:337,hpMaximum:901,manaCurrent:225,manaMaximum:703,enduranceCurrent:119,enduranceMaximum:509,acMitigation:407,acMitigationSoftcap:374,acEvasion:500,attackOffense:379,attackAccuracy:691,str:111,sta:112,int:113,wis:114,agi:115,dex:116,cha:117,resistMagic:31,resistFire:32,resistCold:33,resistDisease:34,resistPoison:35,resistCorruption:36};
    try{
        for(const packaged of [false,true]){
            const runtimeRoot=path.join(root,'.generated/ocr-runtime'),ocr=new OcrService({...(packaged?{runtimeRoot,workerPath:path.join(runtimeRoot,'ocr-worker.cjs')}:{}),workerExecArgv:['--require',deny]});
            try{for(const scale of packaged?[1]:[1,1.5]){
                const url=await win.webContents.executeJavaScript(`(${drawDefaultOcrFixture.toString()})(document,${JSON.stringify({scale})}).toDataURL('image/png')`),image=nativeImage.createFromDataURL(url),label=`${packaged?'assembled':'source'}-${scale}`,started=performance.now();
                const read=await recognizeCaptureImage({ocr,image,nativeImage}),records=parseScreenRead({...read.result,input:read.input,owner:'contribution',sessionId:'synthetic-default-'+label});
                const currentRead=await recognizeCaptureImage({ocr,image,nativeImage,characterOnly:true}),currentRecords=parseScreenRead({...currentRead.result,input:currentRead.input,owner:'character',sessionId:'synthetic-default-current-'+label});
                const proof={label,scale,size:image.getSize(),elapsedMs:Math.round(performance.now()-started),unreadFields:[],read,records,currentRead,currentRecords};proofs.push(proof);
                const exact=(actual,expected,field)=>{if(actual!==expected)failures.push({label,field,expected,actual:actual===undefined?null:actual,unread:actual===undefined});};
                if(diagnostics){await fs.mkdir(diagnostics,{recursive:true});await fs.writeFile(path.join(diagnostics,label+'.png'),image.toPNG());await fs.writeFile(path.join(diagnostics,label+'.json'),JSON.stringify(proof,null,2));}
                assert.equal(currentRecords.length,1,`Default character-only result; ${currentRead.result.text}`);assert.equal(currentRecords[0].subject.kind,'character');
                assert.equal(currentRecords[0].input.uiLayout,'default');const current=fields(currentRecords[0]);
                const smallFontUnread={acEvasion:'The final AC separator/number is not reliably recognized as a literal component; no leading digit is stripped.'};
                let exactCoreFields=0;
                for(const [key,value]of Object.entries(expected)){
                    if(current[key]===undefined&&scale===1&&Object.hasOwn(smallFontUnread,key)){proof.unreadFields.push({subject:'character',key,expected:value,reason:smallFontUnread[key]});continue;}
                    exact(current[key],value,`character.${key}`);if(current[key]===value)exactCoreFields++;
                }
                proof.coreQuality={expected:24,exact:exactCoreFields,unknown:Object.keys(expected).filter(key=>current[key]===undefined).length,wrong:Object.entries(expected).filter(([key,value])=>current[key]!==undefined&&current[key]!==value).length};if(exactCoreFields<(scale===1?23:24))failures.push({label,field:'core-quality',expected:scale===1?23:24,actual:exactCoreFields});
                assert.equal(current.attack,undefined);assert.equal(current.ac,undefined,'The component triplet is not a made-up AC total');
                for(const key of ['healAmount','spellDamage','clairvoyance','luck','backstabDamage','damage','damageBonus','delay','weight'])assert.equal(current[key],undefined,`${label}: unsupported spell/skill mods and neighboring item fields stay separate`);
                for(const [key,value]of Object.entries({attackSpeed:150,hpRegen:11,manaRegen:13,enduranceRegen:17,accuracy:4,avoidance:6,combatEffects:8,damageShield:2,damageShieldMitigation:5,dotShielding:3,meleeShielding:4,spellShielding:6,strikeThrough:7,stunResist:9})){if(current[key]===undefined)proof.unreadFields.push({subject:'character',key,expected:value});else exact(current[key],value,`character.${key}`);}
                assert.doesNotMatch(currentRecords[0].evidence.text,/Synthetic Basalt|Synthetic Cloud|9999|888|777/,'Only the located stats panel supplies Character evidence');
                assert.match(currentRecords[0].evidence.text,/Spell Mods/);assert.match(currentRecords[0].evidence.text,/Skill Damage Mod/,'The lower right sections remain evidence, not invented ordinary stats');
                assert.deepEqual(currentRead.input.ocrPasses.map(pass=>pass.role),['scene','character-stats'],'Character mode never refines item panes');
                const items=records.filter(record=>record.subject.kind==='item'),byName=new Map(items.map(item=>[item.subject.name,item]));
                assert.equal(items.length,2,`${label}: independent Default Description panes`);
                const weapon=byName.get('Synthetic Basalt Needle +6'),ring=byName.get('Synthetic Cloud Band +4');assert(weapon&&ring,`${label}: exact item identities ${[...byName.keys()]}`);
                const w=fields(weapon),r=fields(ring);for(const [key,value]of Object.entries({tier:6,hp:83,damage:19,delay:19,backstabDamage:15}))exact(w[key],value,`weapon.${key}`);for(const [key,value]of Object.entries({ac:28,hp:9,tier:4}))exact(r[key],value,`ring.${key}`);
                if(r.str===undefined){proof.ringStrengthDiagnostic=ringStrengthDiagnostic(read,ring,scale);console.log('Default missing ring Strength diagnostic '+JSON.stringify({label,...proof.ringStrengthDiagnostic}));}
                const unreadRing=guardedRingStrengthUnknown(read,ring,scale);
                if(unreadRing){proof.unreadFields.push(unreadRing);console.log('Default ring Strength confidence proof '+JSON.stringify({label,...unreadRing}));}else exact(r.str,9,'ring.str');
                if(!packaged&&scale===1&&r.str===9){
                    // Exercise the narrow exception even on a platform whose
                    // real OCR clears the threshold. Text/boxes/pixels stay
                    // unchanged; this is a parser guard check, not an OCR read.
                    const observed=ringStrengthWords(read,scale);assert(observed.length&&observed.every(({word})=>String(word.text).trim()==='9'));
                    const weak={...read,result:confidenceOnlyReplay(read.result,observed,84)},withheld=parseScreenRead({...weak.result,input:weak.input,owner:'contribution'}).find(record=>record.subject.name===ring.subject.name);
                    assert.equal(fields(withheld).str,undefined);assert(guardedRingStrengthUnknown(weak,withheld,scale));assert.equal(guardedRingStrengthUnknown(weak,withheld,1.5),null,'The enlarged variant cannot use the exception');
                    assert.equal(guardedRingStrengthUnknown(read,withheld,scale),null,'An already reliable digit cannot justify a missing field');
                    // Adversarial helper inputs are not presented as OCR reads.
                    const absent=structuredClone(weak),competing=structuredClone(weak);
                    for(const capture of [{passIndex:null,words:absent.result.words},...(absent.result.refinements||[]).map((pass,index)=>({passIndex:index,words:pass.words||[]}))]){
                        const indexes=new Set(observed.filter(word=>word.passIndex===capture.passIndex).map(word=>word.index)),remaining=capture.words.filter((_word,index)=>!indexes.has(index));if(capture.passIndex===null)absent.result.words=remaining;else absent.result.refinements[capture.passIndex].words=remaining;
                    }
                    const first=observed[0],competingWord=first.passIndex===null?competing.result.words[first.index]:competing.result.refinements[first.passIndex].words[first.index];competingWord.text='8';
                    assert.equal(guardedRingStrengthUnknown(absent,withheld,scale),null,'Missing OCR words cannot justify an unknown allowance');assert.equal(guardedRingStrengthUnknown(competing,withheld,scale),null,'A competing digit cannot justify the exception');
                    proof.confidenceGuardSelfCheck={onlyConfidenceChanged:true,actualValue:9,loweredConfidence:84,withheldValue:null,restoredAt85:9,missingWordRejected:true,competingDigitRejected:true,reliableDigitRejected:true};
                }
                for(const [key,value,reason]of [['str',11,'Small-font 11 can be read as low-confidence 1; the unsafe digit must stay unknown.'],['damageBonus',9,'The small bonus glyph is absent from scene OCR; the attribute refinement does not invent it.']]){
                    if(w[key]===undefined)proof.unreadFields.push({subject:'weapon',key,expected:value,reason});else exact(w[key],value,`weapon.${key}`);
                }
                assert.equal(w.hpCurrent,undefined);assert.equal(r.acMitigation,undefined);
                for(const [name,values]of [['weapon',w],['ring',r]])assert(Object.values(values).filter(value=>typeof value==='number').length>=8,`${label}: ${name} needs at least eight correctly read numeric fields`);
                assert(read.input.ocrPasses.length<=3);assert(currentRead.input.ocrPasses.length<=2);assert(records.every(record=>record.fields.length<=100&&record.evidence.text.length<=16384));
                if(diagnostics)await fs.writeFile(path.join(diagnostics,label+'.json'),JSON.stringify(proof,null,2));
                console.log(`Default synthetic pixel OCR ${label}: ${exactCoreFields}/24 exact core fields, ${proof.coreQuality.unknown} unknown, ${proof.coreQuality.wrong} wrong; ${proof.unreadFields.length} explicitly recorded unread fields.`);
            }}finally{await ocr.stop();}
        }
        // The normal item-only case receives the existing item refinement
        // budget. Those same Description panes stay quiet in Character mode.
        const url=await win.webContents.executeJavaScript(`(${drawDefaultOcrFixture.toString()})(document,{character:false}).toDataURL('image/png')`),image=nativeImage.createFromDataURL(url),ocr=new OcrService({workerExecArgv:['--require',deny]});
        try{
            const read=await recognizeCaptureImage({ocr,image,nativeImage}),records=parseScreenRead({...read.result,input:read.input,owner:'contribution'}),items=records.filter(record=>record.subject.kind==='item');assert.equal(items.length,2);
            const weapon=items.find(record=>record.subject.name==='Synthetic Basalt Needle +6'),ring=items.find(record=>record.subject.name==='Synthetic Cloud Band +4');assert(weapon&&ring);const w=fields(weapon),r=fields(ring),unreadFields=[];
            const ringDiagnostic=r.str===undefined?ringStrengthDiagnostic(read,ring,1):null;if(ringDiagnostic)console.log('Default missing ring Strength diagnostic '+JSON.stringify({label:'source-item-only',...ringDiagnostic}));
            for(const [subject,values,expectedStats]of [['weapon',w,{tier:6,hp:83,damage:19,delay:19,backstabDamage:15,str:11,damageBonus:9}],['ring',r,{ac:28,hp:9,tier:4,str:9}]]){
                for(const [key,value]of Object.entries(expectedStats)){
                        if(subject==='ring'&&key==='str'&&values[key]===undefined){const proof=guardedRingStrengthUnknown(read,ring,1);if(proof){unreadFields.push(proof);console.log('Default ring Strength confidence proof '+JSON.stringify({label:'source-item-only',...proof}));continue;}}
                    if(values[key]===undefined&&subject==='weapon'&&['str','damageBonus'].includes(key)){unreadFields.push({subject,key,expected:value,reason:'The original small-font glyph is not reliably read; no digit is inferred.'});continue;}
                    if(values[key]!==value)failures.push({label:'source-item-only',field:subject+'.'+key,expected:value,actual:values[key]??null,unread:values[key]===undefined});
                }
                assert(Object.values(values).filter(value=>typeof value==='number').length>=8,'Item-only panels need at least eight numeric readings');
            }
            const current=await recognizeCaptureImage({ocr,image,nativeImage,characterOnly:true});assert.deepEqual(parseScreenRead({...current.result,input:current.input,owner:'character'}),[]);
            const proof={label:'source-item-only',scale:1,size:image.getSize(),unreadFields,read,records,characterRead:current,...(ringDiagnostic?{ringStrengthDiagnostic:ringDiagnostic}:{})};proofs.push(proof);
            if(diagnostics){await fs.writeFile(path.join(diagnostics,'source-item-only.png'),image.toPNG());await fs.writeFile(path.join(diagnostics,'source-item-only.json'),JSON.stringify(proof,null,2));}
            console.log(`Default item-only OCR: independent Description items; ${unreadFields.length} explicitly recorded unread fields, no Character proposal.`);
        }finally{await ocr.stop();}
        assert.deepEqual(await hashes(),sourceHashes,'The production parser, capture pipeline and fixture stay fixed during the OCR matrix');
        if(diagnostics)await fs.writeFile(path.join(diagnostics,'receipt.json'),JSON.stringify({ok:failures.length===0,syntheticOnly:true,actualOfflineWorker:true,sourceHashes,sourceStable:true,variants:proofs.map(({label,scale,size,elapsedMs,coreQuality,unreadFields,confidenceGuardSelfCheck,ringStrengthDiagnostic})=>({label,scale,size,elapsedMs,coreQuality,unreadFields,confidenceGuardSelfCheck,ringStrengthDiagnostic})),failures,networkDenied:true},null,2));
        assert.deepEqual(failures,[],'Every numeric expectation, confidence-safe unknown allowance and quality floor must hold');
    }finally{win.destroy();app.quit();}
}
try{
    const entry=join(temporary,'main.cjs');await writeFile(entry,`(${verify.toString()})(${JSON.stringify({root,temporary,diagnostics})}).catch(error=>{console.error(error.stack);require('electron').app.exit(1);});`);
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const code=await new Promise((done,reject)=>{const child=spawn(createRequire(import.meta.url)('electron'),[entry],{env,stdio:'inherit',windowsHide:true,timeout:95000});child.once('error',reject);child.once('exit',done);});assert.equal(code,0,'Actual offline Default pixel OCR gate passes');
}finally{assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert(basename(temporary).startsWith('eoz-default-ocr-'));await rm(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
