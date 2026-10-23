import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,basename,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),{validateOcrRuntime}=require('../desktop/ocr-runtime.cjs'),{OcrService}=require('../desktop/ocr-service.cjs');
const temporary=await mkdtemp(join(tmpdir(),'eoz-ocr-runtime-')),runtime=join(temporary,'repository','dist','app','resources','ocr-runtime');
const files={'package.json':'{"private":true}', 'ocr-worker.cjs':'// Synthetic worker.\n','node_modules/synthetic-ocr/package.json':'{"name":"synthetic-ocr","version":"1.2.3","main":"index.js"}', 'node_modules/synthetic-ocr/index.js':'module.exports = {};\n','node_modules/synthetic-ocr/model.bin':Buffer.from([1,2,3,4])};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
let manifest;
async function reset(){
    await mkdir(runtime,{recursive:true});
    for(const [name,bytes]of Object.entries(files)){await mkdir(dirname(join(runtime,name)),{recursive:true});await writeFile(join(runtime,name),bytes);}
    manifest={schema:1,packages:{'synthetic-ocr':'1.2.3'},files:Object.entries(files).map(([path,content])=>{const bytes=Buffer.from(content);return {path,bytes:bytes.length,sha256:digest(bytes)};})};
    await writeManifest();
}
const writeManifest=()=>writeFile(join(runtime,'asset-manifest.json'),JSON.stringify(manifest));
async function removeFixtureDirectory(target){const part=relative(temporary,resolve(target));assert.ok(part&&part!=='..'&&!part.startsWith(`..${process.platform==='win32'?'\\':'/'}`)&&!isAbsolute(part));await rm(target,{recursive:true});}
try{
    await reset();assert.equal(validateOcrRuntime(runtime).files,5);
    // This is the exact old failure: missing external resources cannot be
    // satisfied by a developer dependency farther up the repository tree.
    const parentModule=join(temporary,'repository','node_modules','synthetic-ocr');await mkdir(parentModule,{recursive:true});
    await writeFile(join(parentModule,'package.json'),files['node_modules/synthetic-ocr/package.json']);await writeFile(join(parentModule,'index.js'),files['node_modules/synthetic-ocr/index.js']);
    await removeFixtureDirectory(join(runtime,'node_modules'));
    const fallback=execFileSync(process.execPath,['-e','process.stdout.write(require("node:module").createRequire(process.argv[1]).resolve("synthetic-ocr"))',join(runtime,'package.json')],{encoding:'utf8'});
    assert.ok(fallback.startsWith(parentModule),'a fresh worker demonstrates normal Node fallback');
    assert.throws(()=>validateOcrRuntime(runtime),/ENOENT/);
    const service=new OcrService({packaged:true,resourcesPath:dirname(runtime)});await assert.rejects(service.initialize(),/bundled OCR runtime is incomplete/);assert.equal(service.worker,null);
    await reset();await writeFile(join(runtime,'node_modules/synthetic-ocr/model.bin'),Buffer.from([1,2,3,5]));assert.throws(()=>validateOcrRuntime(runtime),/digest differs/);
    await reset();manifest.files[0].bytes++;await writeManifest();assert.throws(()=>validateOcrRuntime(runtime),/size differs/);
    await reset();manifest.files.push({...manifest.files[0],path:'../escape'});await writeManifest();assert.throws(()=>validateOcrRuntime(runtime),/Invalid OCR manifest path/);
    await reset();manifest.files.push({...manifest.files[0]});await writeManifest();assert.throws(()=>validateOcrRuntime(runtime),/duplicate/);
    await reset();manifest.files[0].bytes=Number.MAX_SAFE_INTEGER;await writeManifest();assert.throws(()=>validateOcrRuntime(runtime),/invalid file record/);
    await reset();const outside=join(temporary,'repository','dist','app','outside.js');await writeFile(outside,'module.exports = {};');
    const packageFile='node_modules/synthetic-ocr/package.json',escaped=JSON.stringify({name:'synthetic-ocr',version:'1.2.3',main:'../../../../outside.js'});await writeFile(join(runtime,packageFile),escaped);
    const row=manifest.files.find(file=>file.path===packageFile);row.bytes=Buffer.byteLength(escaped);row.sha256=digest(escaped);await writeManifest();assert.throws(()=>validateOcrRuntime(runtime),/resolved outside/);
    await reset();await removeFixtureDirectory(join(runtime,'node_modules/synthetic-ocr'));await symlink(parentModule,join(runtime,'node_modules/synthetic-ocr'),'junction');assert.throws(()=>validateOcrRuntime(runtime),/must be physical/);
}finally{
    assert.equal(dirname(resolve(temporary)),resolve(tmpdir()));assert.ok(basename(temporary).startsWith('eoz-ocr-runtime-'));
    await rm(temporary,{recursive:true,force:true});
}
const generated=new URL('../.generated/ocr-runtime',import.meta.url);const report=validateOcrRuntime(generated);
assert.ok(report.files>=200);assert.ok(report.packages>=3);
const generatedManifest=JSON.parse(await readFile(new URL('asset-manifest.json',generated.href+'/'),'utf8'));
assert.equal(generatedManifest.files.some(file=>['.gitkeep','.DS_Store'].includes(file.path.split('/').at(-1))),false,'the manifest omits only packager-discarded non-runtime placeholders');
console.log(`Physical OCR runtime: ${report.files} generated files match SHA/size; missing files, repo fallback, corruption, traversal and escaping package entries are rejected.`);
