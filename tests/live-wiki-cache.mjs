import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {LiveWikiCache,FILE_NAME,FRESH_MS,RETENTION_MS,MAX_SOURCE}=require('../desktop/live-wiki-cache.cjs');
let now=Date.parse('2026-10-25T12:00:00.000Z');
const page=(title='Keeper',revision=10,extra={})=>({title,namespace:0,revision,content:'{{Namedmobpage|name='+title+'|zone=[[Vale]]|known_loot=None|common_loot=?}}',categories:['Vale'],fetchedAt:new Date(now).toISOString(),source:'public-wiki',origin:'https://eqlwiki.com',...extra});
const dirs=[];
async function directory(){const dir=await mkdtemp(path.join(os.tmpdir(),'eoz-public-cache-'));dirs.push(dir);return dir;}
try{
    {
        const stateDir=await directory(),events=[],cache=new LiveWikiCache({stateDir,now:()=>now,onChange:value=>events.push(value)});
        assert.deepEqual((await cache.snapshot({})).entries,[]);
        const saved=await cache.put(page(),{aliases:['Keeper alias']});assert(saved);assert.match(saved.sha256,/^[a-f0-9]{64}$/);assert.equal(events.length,1);
        cache.dispose();const restarted=new LiveWikiCache({stateDir,now:()=>now});
        assert.equal((await restarted.read('Keeper alias',{})).title,'Keeper');
        assert.equal((await restarted.read('keeper',{})).title,'Keeper','Only first-letter case normalization is shared');
        assert.equal(await restarted.read('KEEPER',{}),null,'A different internal case cannot borrow public proof');
        assert.equal((await restarted.snapshot({wikiEntities:{titles:['Keeper']},meta:{version:'later'}})).entries.length,1,'Generic membership and manifest age are not catch-up proof');
        assert.equal((await restarted.snapshot({items:[{wikiTitle:'Keeper',revisionId:9}]})).entries.length,1);
        assert.equal((await restarted.snapshot({wikiRelationshipCoverage:{Keeper:{wikiTitle:'Keeper',revisionId:10}}})).entries.length,0,'Equal canonical source revision evicts');
        assert.equal(await restarted.read('Keeper alias',{}),null);assert.deepEqual(await readdir(stateDir),[FILE_NAME],'Atomic writes leave no temporary files');restarted.dispose();
    }
    {
        const cache=new LiveWikiCache({now:()=>now}),original=now;await cache.put(page());
        now+=FRESH_MS;assert.equal(await cache.read('Keeper',{}),null,'Proof expires at24h');assert.equal((await cache.snapshot({})).entries.length,1,'Stale positive context remains available until catch-up');
        now=original+RETENTION_MS;assert.equal((await cache.snapshot({})).entries.length,0,'Positive context also has a bounded maximum age');now=original;cache.dispose();
        const rollback=new LiveWikiCache({now:()=>now});await rollback.put(page('Future',10,{fetchedAt:new Date(now+300000).toISOString()}));assert.equal(await rollback.read('Future',{}),null,'Clock rollback cannot manufacture fresh source proof');assert.equal((await rollback.snapshot({})).entries.length,1);rollback.dispose();
    }
    {
        const cache=new LiveWikiCache({now:()=>now});
        for(const extra of [{namespace:1},{source:'account-session'},{origin:'https://evil.example'},{title:'User:Private'},{revision:0},{revision:1.5},{content:'x'.repeat(MAX_SOURCE+1)},{categories:['Category:Vale']},{fetchedAt:'not-a-date'},{fetchedAt:new Date(now+300001).toISOString()},{content:null}])assert.equal(await cache.put(page('Keeper',10,extra)),null);
        assert.equal(await cache.put({...page(),cookie:'secret'}),null,'Unexpected raw API/account properties are rejected');
        assert.equal(await cache.put(page(),{aliases:['Template:Private']}),null);assert.equal((await cache.snapshot({})).entries.length,0);
        const colon=await cache.put(page('Staff of Elemental Mastery: Water'));assert(colon,'Actual mainspace colon titles remain valid');cache.dispose();
    }
    {
        const stateDir=await directory(),cache=new LiveWikiCache({stateDir,now:()=>now});await cache.put(page());cache.dispose();
        const file=path.join(stateDir,FILE_NAME),saved=JSON.parse(await readFile(file,'utf8'));saved.entries[0].categories=['Different zone'];const tampered=JSON.stringify(saved);await writeFile(file,tampered);
        const changed=new LiveWikiCache({stateDir,now:()=>now});assert.equal(await changed.read('Keeper',{}),null);assert.equal((await changed.snapshot({})).blocked,true,'Hash binds category proof as well as raw source');
        await changed.put(page('Fresh public page'));assert.equal(await readFile(file,'utf8'),tampered,'A corrupt existing file is preserved');changed.dispose();
    }
    {
        const cache=new LiveWikiCache({now:()=>now,maxEntries:2});await cache.put(page('One'));now++;await cache.put(page('Two'));now++;await cache.put(page('Three'));
        assert.deepEqual((await cache.snapshot({})).entries.map(entry=>entry.title),['Two','Three']);assert.equal(await cache.read('One',{}),null);
        assert.equal(await cache.invalidate('Two'),true);assert.equal(await cache.invalidate('Two'),false);cache.dispose();
        const small=new LiveWikiCache({now:()=>now,maxBytes:1200});await small.put(page('One',10,{content:'x'.repeat(700)}));await small.put(page('Two',10,{content:'y'.repeat(700)}));assert.equal((await small.snapshot({})).entries.length,1,'Capacity is serialized bytes, not content alone');small.dispose();
    }
    {
        const stateDir=await directory(),cache=new LiveWikiCache({stateDir,now:()=>now});await Promise.all(Array.from({length:25},(_,i)=>cache.put(page('Public '+i))));assert.equal((await cache.snapshot({})).entries.length,25);
        const fresh=new LiveWikiCache({stateDir,now:()=>now});assert.equal((await fresh.snapshot({})).entries.length,25,'Concurrent writes serialize into one coherent ledger');fresh.dispose();cache.dispose();
    }
    {
        const cache=new LiveWikiCache({now:()=>now});await cache.put(page('One'),{aliases:['Shared alias']});await cache.put(page('Two'),{aliases:['Shared alias']});assert.equal((await cache.read('Shared alias',{})).title,'One','Alias collision cannot replace another cached page');
        await cache.put(page('Shared alias'));assert.equal((await cache.read('Shared alias',{})).title,'Shared alias','A canonical title outranks an old redirect mapping');
        await cache.put(page('One',9));assert.equal((await cache.read('One',{})).revision,10,'Late reads cannot regress source revision');cache.dispose();assert.equal(await cache.read('One',{}),null);
    }
}finally{for(const dir of dirs)await rm(dir,{recursive:true,force:true});}
console.log('Live public wiki cache: restart, exact identities, hash-bound source, catch-up, freshness/retention, aliases, invalidation, corruption, capacity and atomic concurrency passed.');
