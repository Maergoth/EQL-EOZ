import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import '../app/vendor/item-scaling-core.js';
import bundled from '../app/vendor/item-scaling-rules.js';
const {ItemScalingHost,RULES_URL,REFRESH_MS}=createRequire(import.meta.url)('../desktop/item-scaling-host.cjs');
const core=globalThis.EQLItemScalingCore,copy=value=>JSON.parse(JSON.stringify(value));
const directory=await mkdtemp(path.join(tmpdir(),'eoz-scaling-'));
let time=10000000,requests=0,response,requestOptions;
const remote=rules=>new Response(JSON.stringify({eqlitemscaling:{schemaVersion:1,engineVersion:1,revision:rules.revision,rules}}));
function adapter(){
    let engine=core.createEngine(bundled);
    return {getItemScalingRules:()=>engine.rules,applyItemScalingRules:rules=>{
        const next=core.createEngine(rules);
        if(next.revision<engine.revision)throw Error('Item rules cannot move backwards.');
        if(next.revision===engine.revision){if(JSON.stringify(next.rules)!==JSON.stringify(engine.rules))throw Error('Revision unchanged.');return false;}
        engine=next;return true;
    }};
}
const transport=async(url,options)=>{assert.equal(url,RULES_URL);requests++;requestOptions=options;return response;};
try {
    const file=path.join(directory,'rules.json'),scaling=adapter();
    const host=new ItemScalingHost({file,fetch:transport,now:()=>time,loadScaling:async()=>scaling});
    assert.equal((await host.initialize()).source,'bundled');
    const newer={...copy(bundled),revision:2,backstab:{divisor:10}};
    response=remote(newer);
    const [first,second]=await Promise.all([host.refresh(),host.refresh()]);
    assert.equal(requests,1,'concurrent refresh shares one bounded request');
    assert.equal(first.rules.revision,2);assert.equal(second.rules.revision,2);
    assert.equal(requestOptions.redirect,'error');assert.equal(first.source,'wiki');
    await host.refresh();assert.equal(requests,1,'renderer checks never poll the wiki');
    const restarted=new ItemScalingHost({file,fetch:transport,now:()=>time,loadScaling:async()=>adapter()});
    assert.equal((await restarted.initialize()).rules.revision,2,'last accepted rules work offline after restart');
    await restarted.refresh();assert.equal(requests,1,'saved check time prevents restart polling');
    time+=REFRESH_MS;
    response=new Response(JSON.stringify({eqlitemscaling:{schemaVersion:1,engineVersion:2,revision:3,rules:{...newer,revision:3}}}));
    assert.equal((await restarted.refresh()).rules.revision,2,'future algorithms retain last good snapshot');
    assert.match(restarted.status().error,/unsupported/);
    time+=REFRESH_MS;response=remote(bundled);
    assert.equal((await restarted.refresh()).rules.revision,2,'older endpoint cannot downgrade saved rules');
    time+=REFRESH_MS;response=remote({...newer,backstab:{divisor:5}});
    assert.equal((await restarted.refresh()).rules.backstab.divisor,10,'changed coefficients need a new revision');
    time+=REFRESH_MS;response=remote({...newer,revision:3,damage:{divisor:0}});
    assert.equal((await restarted.refresh()).rules.revision,2,'invalid rules cannot replace saved configuration');
    time+=REFRESH_MS;response=new Response('x'.repeat(17*1024));
    assert.equal((await restarted.refresh()).rules.revision,2,'oversized response is rejected');
    time+=REFRESH_MS;response=new Response('not-json');
    assert.equal((await restarted.refresh()).rules.revision,2,'corrupt response retains last good rules');
    const stored=JSON.parse(await readFile(file,'utf8'));stored.rules.damage.divisor=7;
    await writeFile(file,JSON.stringify(stored));
    const corrupted=new ItemScalingHost({file,fetch:transport,now:()=>time,loadScaling:async()=>adapter()});
    assert.equal((await corrupted.initialize()).rules.revision,1,'corrupt offline cache falls back to bundled rules');
    assert.match(corrupted.status().error,/bundled/);
    host.stop();restarted.stop();corrupted.stop();
    console.log('Shared item rules: bounded hourly refresh, restart/offline cache, version validation and no-downgrade checks passed.');
} finally {await rm(directory,{recursive:true,force:true});}
