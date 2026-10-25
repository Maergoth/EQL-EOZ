import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {SCALING_SOURCE_FILES,loadItemScalingSnapshot,writeItemScalingSnapshot,checkItemScalingSnapshot} from '../scripts/sync-item-scaling.mjs';
const {load:parse}=createRequire(import.meta.url)('js-yaml');
const root=new URL('../',import.meta.url),source=new URL('app/vendor/',root);
const files=Object.fromEntries(await Promise.all(SCALING_SOURCE_FILES.map(async name=>[name,await readFile(new URL(name,source))])));
const rules=JSON.parse(files['item-scaling-rules.json']),changed={...rules,revision:rules.revision+1,range:{perTier:20}};
const commit='a'.repeat(40),calls=[];
const fetchImpl=async(url,options)=>{
    calls.push(url);assert.equal(options.redirect,'error');
    if (url==='https://api.github.com/repos/Maergoth/EQLWiki/git/ref/heads/main') return new Response(JSON.stringify({object:{type:'commit',sha:commit}}));
    const name=url.split('/').at(-1);
    assert.equal(url,`https://raw.githubusercontent.com/Maergoth/EQLWiki/${commit}/extensions/ItemLevelSlider/${name}`,'All source reads stay on the once-resolved immutable wiki commit');
    return new Response(name==='item-scaling-rules.json'?JSON.stringify(changed):files[name]);
};
const directory=await mkdtemp(path.join(tmpdir(),'eoz-release-formulas-'));
try {
    const snapshot=await loadItemScalingSnapshot({fetchImpl});
    assert.equal(calls.length,4,'One branch read and three source files for an entire release');
    assert.equal(snapshot.record.commit,commit);assert.equal(snapshot.rules.range.perTier,20);
    await writeItemScalingSnapshot(snapshot,directory);
    const checked=await checkItemScalingSnapshot(directory);
    assert.equal(checked.rules.revision,changed.revision,'Release preparation replaces stale bundled rules');
    const receipt=await readFile(path.join(directory,'item-scaling-source.json'),'utf8');
    await writeItemScalingSnapshot(snapshot,directory);
    assert.equal(await readFile(path.join(directory,'item-scaling-source.json'),'utf8'),receipt,'Snapshot/provenance generation is deterministic');
    await writeFile(path.join(directory,'item-scaling-core.js'),'changed');
    await assert.rejects(checkItemScalingSnapshot(directory),/changed/,'A changed source file blocks packaging');
    await assert.rejects(loadItemScalingSnapshot({fetchImpl:async()=>new Response('{}')}),/commit/);
    await assert.rejects(loadItemScalingSnapshot({ref:'not-a-commit',fetchImpl}),/exact full/);
    await assert.rejects(loadItemScalingSnapshot({ref:commit,fetchImpl:async()=>new Response('',{status:404})}),/HTTP 404/);
    await assert.rejects(loadItemScalingSnapshot({ref:commit,fetchImpl:async()=>new Response('x'.repeat(65537))}),/large/);
} finally {await rm(directory,{recursive:true,force:true});}

const workflow=async name=>parse(await readFile(new URL(`.github/workflows/${name}.yml`,root),'utf8'));
const release=await workflow('release');
const prepare=release.jobs['prepare-bootstrap'].steps;
assert.equal(prepare.filter(step=>step.run?.includes('sync-item-scaling.mjs --from-wiki-main')).length,1,'The release coordinator resolves the source once');
const shared=prepare.find(step=>step.uses?.startsWith('actions/upload-artifact')&&step.with?.path==='app/vendor/item-scaling-*');
assert(shared);
for (const [job,file]of [['release-windows','build-windows'],['release-linux','build-linux']]) {
    assert.equal(release.jobs[job].with.item_scaling_artifact,shared.with.name,'Both platform builds receive the same fixed source artifact');
    const platform=await workflow(file),steps=platform.jobs.build.steps;
    assert(platform.on.workflow_call.inputs.item_scaling_artifact);
    const download=steps.findIndex(step=>step.with?.name==='${{ inputs.item_scaling_artifact }}');
    assert(download>=0&&download<steps.findIndex(step=>step.run==='npm test'),'The common source snapshot is installed before source tests/package verification');
}
for (const job of [release.jobs['prepare-bootstrap'],release.jobs.publish])for(const step of job.steps)assert(step.run||step.uses,'Every release step performs an operation');
assert(release.jobs.publish.steps.some(step=>step.with?.name===shared.with.name),'Release notes consume the same formula source receipt');
const publisher=release.jobs.publish.steps.find(step=>step.run?.includes('gh release upload')).run;
assert(publisher.includes('Refusing to repair a draft with different wiki formulas.')&&publisher.indexOf('Refusing to repair a draft with different wiki formulas.')<publisher.indexOf('gh release upload'),'A repair cannot replace draft binaries with another wiki formula snapshot');
for (const file of ['app/app.js','desktop/main.cjs'])assert.doesNotMatch(await readFile(new URL(file,root),'utf8'),/ItemScalingHost|installDesktopItemRules|eqlitemscaling/,'Installed apps have no formula network checks');
console.log('Release formula sync: one immutable upstream snapshot, updated bundles, hashes, shared Windows/Linux artifact and no runtime refresh passed.');
