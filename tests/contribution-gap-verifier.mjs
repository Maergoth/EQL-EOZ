import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url);
const {ContributionGapVerifier}=require('../desktop/contribution-gap-verifier.cjs');
const {LiveWikiCache,FRESH_MS}=require('../desktop/live-wiki-cache.cjs');
const pack=()=>({meta:{version:'fixture-1',wikiEntitiesComplete:true,lootSourceCountsVersion:2},wikiEntities:{items:['Relic'],npcs:['Keeper'],titles:['Relic','Keeper','Vale','Elsewhere']},items:[{name:'Relic',wikiTitle:'Relic',dropSources:[],lootSourceCount:1,lootSourceCountComplete:true,lootSourceNpcs:['Other Keeper']}],npcs:[{name:'Keeper',wikiTitle:'Keeper',zone:'Elsewhere',instanceType:'normal'}],zones:[{name:'Vale',wikiTitle:'Vale'},{name:'Elsewhere',wikiTitle:'Elsewhere'}],lootSourceCounts:{Relic:{lootSourceCount:1,lootSourceCountComplete:true,lootSourceNpcs:['Other Keeper']}}});
const npc=(zone='[[Elsewhere]]',loot='None')=>'{{Namedmobpage|name=Keeper|zone='+zone+'|known_loot='+loot+'|common_loot=?}}';
const item=(sources='')=>'{{Itempage|itemname=Relic|statsblock=HP: 5|dropsfrom='+sources+'}}';
const data=(title,content,categories=[])=>({query:{pages:[{pageid:1,ns:0,title,revisions:[{revid:10,slots:{main:{contentmodel:'wikitext',content}}}],categories:categories.map(name=>({title:'Category:'+name}))}]}});
const absent=title=>({query:{pages:[{ns:0,title,missing:true}]}});
function fixture(pages,{catalog=pack(),...options}={}){
    const calls=[];const verifier=new ContributionGapVerifier({getPack:async()=>catalog,fetchImpl:async(url,init)=>{
        const u=new URL(url);assert.equal(u.origin,'https://eqlwiki.com');assert.equal(u.pathname,'/api.php');assert.equal(init.credentials,'omit');assert.equal(init.useSessionCookies,false);assert.equal(init.redirect,'error');assert(!('Cookie' in (init.headers||{})));assert(!u.searchParams.has('assert'));
        const title=u.searchParams.get('titles');calls.push(title);const value=pages[title]??absent(title);return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(value)};
    },...options});return {verifier,calls,catalog};
}
const pop=(name='Keeper',zone='Vale',instance='normal')=>({kind:'npc',name,zone,instance,reasons:['missing-population'],relations:[{type:'mob-zone',npc:name,zone,instance,evidence:'kill'}]});
const drop=(npcName='Keeper')=>({kind:'item',name:'Relic',zone:'Vale',instance:'normal',reasons:['missing-source'],relations:[{type:'drop-source',npc:npcName,item:'Relic',zone:'Vale',instance:'normal',evidence:'explicit-corpse'}]});

{
    const f=fixture({'Fresh monster':absent('Fresh monster')});
    const result=await f.verifier.check({...pop('Fresh monster'),reasons:['missing-page']});
    assert.equal(result.state,'missing');assert.deepEqual(result.reasons,['missing-page']);assert.equal(result.confirmedRelations.length,1);assert.equal(result.canonicalTitle,'Fresh monster');assert(!JSON.stringify(result).includes('content'));f.verifier.dispose();
}
{
    const f=fixture({Keeper:data('Keeper',npc('[[Vale]]')),Vale:data('Vale','A public zone')});
    assert.equal((await f.verifier.check(pop())).state,'covered','A live literal zone suppresses a stale snapshot gap');
    assert.deepEqual(f.calls,['Keeper','Vale']);f.verifier.dispose();
}
{
    const f=fixture({Keeper:data('Keeper',npc('?'),['Vale']),Vale:data('Vale','A public zone')});
    assert.equal((await f.verifier.check(pop())).state,'covered','Current category membership covers normal population');f.verifier.dispose();
    const v=fixture({Keeper:data('Keeper',npc('Various')),Vale:data('Vale','A public zone')});assert.equal((await v.verifier.check(pop())).state,'covered');v.verifier.dispose();
    const r=fixture({Keeper:data('Keeper',npc('[[Vale]]'),['Vale']),Vale:data('Vale','A public zone')});assert.equal((await r.verifier.check(pop('Keeper','Vale','raid'))).state,'unknown','Normal categories cannot prove raid membership or absence');r.verifier.dispose();
}
{
    const f=fixture({Keeper:data('Keeper',npc()),Vale:data('Vale','Zone'),Elsewhere:data('Elsewhere','Zone')});
    const result=await f.verifier.check(pop());assert.equal(result.state,'missing');assert.deepEqual(result.reasons,['missing-population']);assert.equal(result.confirmedRelations.length,1);f.verifier.dispose();
    const unknown=fixture({Keeper:data('Keeper',npc('Many distant places')),Vale:data('Vale','Zone')});assert.equal((await unknown.verifier.check(pop())).state,'unknown');unknown.verifier.dispose();
    const protectedField=fixture({Keeper:data('Keeper',npc('<nowiki>[[Vale]]</nowiki>')),Vale:data('Vale','Zone')});assert.equal((await protectedField.verifier.check(pop())).state,'unknown','Protected affected source cannot become an empty-field absence');protectedField.verifier.dispose();
    const group=fixture({Keeper:data('Keeper',npc('[[Various Zones]]')),Vale:data('Vale','Zone'),'Various Zones':data('Various Zones','A broad region list')});assert.equal((await group.verifier.check(pop())).state,'unknown','A generic linked page cannot establish current-zone absence');group.verifier.dispose();
}
{
    const catalog=pack();catalog.npcs[0].zone='Vale';
    const f=fixture({}, {catalog});assert.equal((await f.verifier.check(pop())).state,'covered');assert.equal(f.calls.length,0,'Positive cached population makes no HTTP request');f.verifier.dispose();
    const sourceCatalog=pack();sourceCatalog.items[0].dropSources=[{name:'Keeper',zone:'Vale',instance:'normal'}];const s=fixture({}, {catalog:sourceCatalog});assert.equal((await s.verifier.check(drop())).state,'covered');assert.equal(s.calls.length,0);s.verifier.dispose();
}
{
    const f=fixture({Relic:data('Relic',item('[[Vale]]\n* [[Keeper]]')),Keeper:data('Keeper',npc())});assert.equal((await f.verifier.check(drop())).state,'covered','Either live authored side covers a relation');f.verifier.dispose();
    const n=fixture({Relic:data('Relic',item()),Keeper:data('Keeper',npc('[[Vale]]','{{:Relic}}'))});assert.equal((await n.verifier.check(drop())).state,'covered');n.verifier.dispose();
    const missing=fixture({Relic:data('Relic',item()),Keeper:data('Keeper',npc('[[Vale]]'))});const result=await missing.verifier.check(drop());assert.equal(result.state,'missing');assert.deepEqual(result.reasons,['missing-source']);assert.equal(result.confirmedRelations.length,1);missing.verifier.dispose();
}
{
    const f=fixture({Relic:data('Relic',item()),Keeper:data('Keeper',npc('[[Vale]]','{{:Changing set}}')),'Changing set':data('Changing set','{{Gear Set|Relic}}')});
    assert.equal((await f.verifier.check(drop())).state,'unknown','A live collection cannot borrow a stale absence from the snapshot');f.verifier.dispose();
    const broad=fixture({Relic:data('Relic',item('Various Zones\n* Many types of skeletons')),Keeper:data('Keeper',npc())});assert.equal((await broad.verifier.check(drop())).state,'unknown');broad.verifier.dispose();
    const invalid=fixture({Relic:data('Relic',item()),Keeper:data('Keeper',npc())});assert.equal((await invalid.verifier.check({...drop(),relations:[{...drop().relations[0],evidence:'chat'}]})).state,'unknown','Unproven corpse associations are not absence evidence');invalid.verifier.dispose();
}
{
    const f=fixture({Alias:{query:{redirects:[{from:'Alias',to:'Missing target'}],pages:[{ns:0,title:'Missing target',missing:true}]}}},{catalog:{}});
    assert.equal((await f.verifier.check({kind:'item',name:'Alias',reasons:['missing-page'],relations:[]})).state,'covered','A public redirect remains present even if its target is absent');f.verifier.dispose();
    const mismatch=fixture({Alias:{query:{pages:[{ns:0,title:'Another page',missing:true}]}}},{catalog:{}});assert.equal((await mismatch.verifier.check({kind:'item',name:'Alias',reasons:['missing-page']})).state,'unknown');mismatch.verifier.dispose();
}
{
    const marker='These stats are reverse calculated from a tier 5 item. Please confirm with a tier 0 item and remove this message';
    const f=fixture({Relic:data('Relic','{{Itempage|itemname=Relic|notes='+marker+'|dropsfrom=}}')});const result=await f.verifier.check({kind:'item',name:'Relic',reasons:['tier0-verification'],relations:[]});assert.deepEqual(result.reasons,['tier0-verification']);f.verifier.dispose();
    const fixed=fixture({Relic:data('Relic','{{Itempage|itemname=Relic|notes=Verified|dropsfrom=}}')});assert.equal((await fixed.verifier.check({kind:'item',name:'Relic',reasons:['tier0-verification']})).state,'covered');fixed.verifier.dispose();
}
{
    let now=1000;const f=fixture({'New relic':absent('New relic')},{catalog:{},now:()=>now});const p={kind:'item',name:'New relic',reasons:['missing-page']};await f.verifier.check(p);await f.verifier.check(p);assert.equal(f.calls.length,1);now+=60001;await f.verifier.check(p);assert.equal(f.calls.length,2,'Confirmed absence expires');f.verifier.clear();await f.verifier.check(p);assert.equal(f.calls.length,3,'Source generation clear discards verdicts');f.verifier.dispose();
}
{
    let release;const fetchImpl=()=>new Promise(resolve=>{release=()=>resolve({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(absent('New relic'))});});
    const v=new ContributionGapVerifier({getPack:async()=>({}),fetchImpl});const pending=v.check({kind:'item',name:'New relic',reasons:['missing-page']});while(!release)await new Promise(resolve=>setTimeout(resolve,0));v.clear();assert.equal((await pending).state,'unknown','Late public absence cannot survive a source epoch change');release();v.dispose();
    const timed=new ContributionGapVerifier({getPack:async()=>({}),fetchImpl:()=>new Promise(()=>{}),timeoutMs:5});assert.equal((await timed.check({kind:'item',name:'New relic',reasons:['missing-page']})).state,'unknown','Noncooperative fetch still has a deadline');timed.dispose();
}
{
    const f=fixture({}, {catalog:{}});assert.equal((await f.verifier.check({kind:'item',name:'User:Private',reasons:['missing-page']})).state,'unknown');assert.equal(f.calls.length,0);f.verifier.dispose();
    const v=new ContributionGapVerifier({getPack:async()=>({}),fetchImpl:async()=>({ok:true,headers:{get:()=>3*1024*1024},text:async()=>{throw Error('Must not read oversized body');}})});assert.equal((await v.check({kind:'item',name:'Relic',reasons:['missing-page']})).state,'unknown');v.dispose();
}
{
    const f=fixture({Relic:data('Relic',item()),Keeper:data('Keeper',npc())});
    assert.equal((await f.verifier.check({...drop(),relations:[{...drop().relations[0],item:'Foreign relic'}]})).state,'unknown','A foreign item fact cannot certify the selected item gap');f.verifier.dispose();
    const catalog=pack(),s=fixture({'New relic':absent('New relic')},{catalog});const p={kind:'item',name:'New relic',reasons:['missing-page']};await s.verifier.check(p);catalog.meta.version='fixture-2';await s.verifier.check(p);assert.equal(s.calls.length,2,'Dataset versions separate cached live verdicts');s.verifier.dispose();
    let current={};const changed=new ContributionGapVerifier({getPack:async()=>current,fetchImpl:async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(absent('New relic'))})});assert.equal((await changed.check(p)).state,'missing');current={items:[{name:'New relic',wikiTitle:'New relic'}]};assert.equal((await changed.check(p)).state,'covered','Same-version snapshot replacement cannot reuse an obsolete missing verdict');changed.dispose();
}
{
    let started=0;const v=new ContributionGapVerifier({getPack:async()=>({}),fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>{started++;signal.addEventListener('abort',()=>reject(Error('Aborted')),{once:true});})});
    const checks=Array.from({length:25},(_,i)=>v.check({kind:'item',name:'New relic '+i,reasons:['missing-page']}));
    while(started<2)await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(v.active,2);assert.equal(v.pending.size,20);assert.equal(started,2,'Only two anonymous requests may run concurrently');
    assert((await Promise.all(checks.slice(20))).every(r=>r.state==='unknown'),'Excess pending work cannot expose an unchecked gap');v.clear();assert((await Promise.all(checks)).every(r=>r.state==='unknown'));v.dispose();
}
{
    const stateDir=await mkdtemp(path.join(os.tmpdir(),'eoz-gap-public-cache-'));let now=Date.parse('2026-10-25T12:00:00.000Z');
    try{
        const cache=new LiveWikiCache({stateDir,now:()=>now}),f=fixture({Relic:data('Relic',item('[[Vale]]\n* [[Keeper]]')),Keeper:data('Keeper',npc('[[Vale]]'))},{liveCache:cache,now:()=>now});
        const first=await f.verifier.check(drop());assert.equal(first.state,'covered');assert.equal(f.calls.length,2);assert(first.proofs.every(proof=>proof.source==='live-wiki'&&proof.fetchedAt));
        f.verifier.dispose();cache.dispose();
        const restarted=new LiveWikiCache({stateDir,now:()=>now}),g=fixture({}, {liveCache:restarted,now:()=>now});
        const reused=await g.verifier.check(drop());assert.equal(reused.state,'covered');assert.equal(g.calls.length,0,'A restart reuses both authored source pages without HTTP');assert.equal(reused.proofs.length,2);assert(reused.proofs.every(proof=>proof.source==='live-cache'&&proof.fetchedAt===first.proofs[0].fetchedAt));assert(!JSON.stringify(reused).includes('statsblock'),'Native proof metadata never includes raw source');
        g.verifier.clear();await restarted.invalidate('Relic');await g.verifier.check(drop());assert.deepEqual(g.calls,['Relic'],'Invalidation forces only the changed exact source to refresh');g.verifier.dispose();
        now+=FRESH_MS;const stale=fixture({}, {liveCache:restarted,now:()=>now,fetchImpl:async()=>{throw Error('Offline');}});assert.equal((await stale.verifier.check(drop())).state,'unknown','Expired positive context cannot prove a current source absence while offline');assert.equal((await restarted.snapshot({})).entries.length,1,'Expired proof stays retained as positive context');stale.verifier.dispose();
        const caught=await restarted.snapshot({npcs:[{wikiTitle:'Keeper',revisionId:10}]});assert.equal(caught.entries.length,0);restarted.dispose();
    }finally{await rm(stateDir,{recursive:true,force:true});}
}
{
    let now=Date.parse('2026-10-25T12:00:00.000Z');const cache=new LiveWikiCache({now:()=>now});
    const saved=(title,content,categories=[])=>({title,namespace:0,revision:10,content,categories,fetchedAt:new Date(now-300000).toISOString(),source:'public-wiki',origin:'https://eqlwiki.com'});
    await cache.put(saved('Keeper',npc()));await cache.put(saved('Vale','Zone',['Zones']));await cache.put(saved('Elsewhere','Zone',['Zones']));
    const f=fixture({Keeper:data('Keeper',npc('[[Vale]]')),Vale:data('Vale','Zone',['Zones']),Elsewhere:data('Elsewhere','Zone',['Zones'])},{now:()=>now,liveCache:cache});
    assert.equal((await f.verifier.check(pop())).state,'covered','Yesterday\'s population absence must refresh before any missing task appears');assert(f.calls.includes('Keeper'));f.verifier.dispose();
    await cache.invalidate('Keeper');await cache.put(saved('Relic',item()));await cache.put(saved('Keeper',npc('[[Vale]]')));
    const source=fixture({Relic:data('Relic',item()),Keeper:data('Keeper',npc('[[Vale]]','{{:Relic}}'))},{now:()=>now,liveCache:cache});assert.equal((await source.verifier.check(drop())).state,'covered','Yesterday\'s missing source cannot be stamped checkedAt now');assert.deepEqual(source.calls,['Relic','Keeper']);source.verifier.dispose();
    const marker='These stats are reverse calculated from a tier 5 item. Please confirm with a tier 0 item and remove this message';
    await cache.invalidate('Relic');await cache.put(saved('Relic','{{Itempage|itemname=Relic|notes='+marker+'|dropsfrom=}}'));
    const tier=fixture({Relic:data('Relic','{{Itempage|itemname=Relic|notes=Verified|dropsfrom=}}')},{now:()=>now,liveCache:cache});assert.equal((await tier.verifier.check({kind:'item',name:'Relic',reasons:['tier0-verification']})).state,'covered');assert.deepEqual(tier.calls,['Relic']);tier.verifier.dispose();cache.dispose();
    const short=new LiveWikiCache({now:()=>now});await short.put({...saved('Relic','{{Itempage|itemname=Relic|notes='+marker+'|dropsfrom=}}'),fetchedAt:new Date(now-55000).toISOString()});
    const recent=fixture({Relic:data('Relic','{{Itempage|itemname=Relic|notes=Verified|dropsfrom=}}')},{now:()=>now,liveCache:short}),request={kind:'item',name:'Relic',reasons:['tier0-verification']};
    const result=await recent.verifier.check(request);assert.equal(result.state,'missing');assert.equal(Date.parse(result.checkedAt),now-55000,'Confirmed missing age uses actual source retrieval');assert.equal(recent.calls.length,0);
    now+=5001;assert.equal((await recent.verifier.check(request)).state,'covered','Short negative memo expires at original source age, without another60s extension');assert.equal(recent.calls.length,1);recent.verifier.dispose();short.dispose();
    const rollback=new LiveWikiCache({now:()=>now});await rollback.put({...saved('Relic','{{Itempage|itemname=Relic|notes='+marker+'|dropsfrom=}}'),fetchedAt:new Date(now+300000).toISOString()});
    const future=fixture({Relic:data('Relic','{{Itempage|itemname=Relic|notes=Verified|dropsfrom=}}')},{now:()=>now,liveCache:rollback});assert.equal((await future.verifier.check(request)).state,'covered','Future-dated source cannot prove absence after clock rollback');assert.equal(future.calls.length,1);future.verifier.dispose();rollback.dispose();
}
{
    const cache=new LiveWikiCache(),f=fixture({'Unknown relic':absent('Unknown relic')},{catalog:{},liveCache:cache});
    assert.equal((await f.verifier.check({kind:'item',name:'Unknown relic',reasons:['missing-page']})).state,'missing');assert.deepEqual((await cache.snapshot({})).entries,[],'Missing pages are never persisted');f.verifier.dispose();cache.dispose();
    const aliases=new LiveWikiCache(),redirect=fixture({Alias:{query:{redirects:[{from:'Alias',to:'Real relic'}],pages:data('Real relic',item()).query.pages}}},{catalog:{},liveCache:aliases});
    assert.equal((await redirect.verifier.check({kind:'item',name:'Alias',reasons:['missing-page']})).state,'covered');redirect.verifier.dispose();
    const again=fixture({}, {catalog:{},liveCache:aliases});assert.equal((await again.verifier.check({kind:'item',name:'Alias',reasons:['missing-page']})).canonicalTitle,'Real relic');assert.equal(again.calls.length,0,'Only validated API redirect aliases reuse the canonical public source');again.verifier.dispose();aliases.dispose();
}
{
    const {WikiHost,CHANNEL}=require('../desktop/wiki-host.cjs'),handlers=new Map(),main={isDestroyed:()=>false,webContents:{mainFrame:{url:'http://127.0.0.1:4321/'}}};
    let checks=0,closed=0,fail=false,ignored=false;
    const verifier={check:async input=>{checks++;if(fail)throw Error('Synthetic failure');return {state:'missing',reasons:['missing-page'],confirmedRelations:[],canonicalTitle:input.name,checkedAt:new Date().toISOString()};},dispose(){closed++;}};
    const session={setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},on(){},removeListener(){}};
    const host=new WikiHost({electron:{session:{fromPartition:()=>session},ipcMain:{handle:(channel,fn)=>handlers.set(channel,fn),removeHandler:channel=>handlers.delete(channel)}},origin:'http://127.0.0.1:4321',getMainWindow:()=>main,client:{load(){throw Error('Gap verification cannot load account state');}},discoveryVerifier:verifier,isContributionIgnored:async()=>ignored});
    const invoke=handlers.get(CHANNEL),event={sender:main.webContents,senderFrame:main.webContents.mainFrame},request={kind:'npc',name:'Fresh keeper',reasons:['missing-page'],relations:[]};
    for(const patch of [{sender:{}},{senderFrame:{url:main.webContents.mainFrame.url}},{senderFrame:{url:'http://127.0.0.1:4321/overlay.html'}}])await assert.rejects(invoke({...event,...patch},'verify-discovery',request),/main app/);
    assert.equal(checks,0);assert.equal((await invoke(event,'verify-discovery',request)).state,'missing');assert.equal(checks,1);
    ignored=true;assert.equal((await invoke(event,'verify-discovery',request)).state,'covered');assert.equal(checks,1,'An ignored entity bypasses public lookup');
    ignored=false;fail=true;assert.equal((await invoke(event,'verify-discovery',request)).state,'unknown','Native verifier failures stay hidden');
    host.dispose();assert.equal(closed,1);assert(!handlers.has(CHANNEL));await assert.rejects(invoke(event,'verify-discovery',request),/main app/);
    const exposed={},calls=[];vm.runInNewContext(readFileSync(new URL('../desktop/preload.cjs',import.meta.url),'utf8'),{require:()=>({contextBridge:{exposeInMainWorld:(key,value)=>exposed[key]=value},ipcRenderer:{invoke:(...args)=>calls.push(args),on(){},removeListener(){}}})});
    exposed.eyeOfZommWiki.verifyDiscovery(request);assert.deepEqual(calls.at(-1),[CHANNEL,'verify-discovery',request]);
}
console.log('Contribution gap verifier: public absence, scoped positives, redirects, exact facts, stale-set uncertainty, caches, bounded failures and source epochs passed.');
