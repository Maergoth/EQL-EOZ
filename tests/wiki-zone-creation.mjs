import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {WikiClient,normalizeWikiSubmissionText}=createRequire(import.meta.url)('../desktop/wiki-client.cjs');
const zoneSubsection=await readFile(new URL('./fixtures/zone-page-blueprint.wiki',import.meta.url),'utf8');
let help='== Items ==\n=== Item Page Blueprint ===\n<pre>{{Itempage|itemname=|statsblock=}}</pre>\n== NPCs ==\n=== NPC Page Blueprint ===\n<pre>{{Namedmobpage|name=}}</pre>\n== Zones ==\n'+zoneSubsection;
let helpRevision=700,revision=800,loseResponseFor=null,imageOverride=null,catalogReads=0;
const stateDir=await mkdtemp(join(tmpdir(),'eoz-zone-create-'));
const pages=new Map([['Template:Classic Era',{text:'Synthetic era',revision:10,pageId:10}]]),files=new Set(['Normal Map.PNG','Raid Map.jpg']),requests=[],writes=[],ignored=new Set();
const key=name=>String(name).replace(/_/g,' '),hash=text=>createHash('sha256').update(text).digest('hex');
const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
const fetchImpl=async(url,init={})=>{
    const params=init.method==='POST'?new URLSearchParams(init.body):new URL(url).searchParams,request=Object.fromEntries(params);requests.push(request);
    if(params.get('action')==='query'&&params.get('meta')==='userinfo')return reply({query:{userinfo:{id:7,name:'Synthetic Editor',rights:['edit','createpage','upload']}}});
    if(params.get('action')==='query'&&params.get('meta')==='tokens')return reply({query:{tokens:{csrftoken:'SYNTHETIC-TOKEN'}}});
    if(params.get('action')==='query'&&params.get('list'))return reply({query:{[params.get('list')]:[],searchinfo:{totalhits:0}}});
    if(params.get('action')==='query'&&params.get('prop')==='imageinfo'){
        const title=key(params.get('titles')),filename=title.replace(/^File:/,'');
        return reply({query:{pages:[imageOverride|| (files.has(filename)?{ns:6,title,imageinfo:[{url:'https://example.invalid/synthetic-map.png'}]}:{ns:6,title,missing:true})]}});
    }
    if(params.get('action')==='query')return reply({curtimestamp:'2026-10-25T12:00:00Z',query:{pages:(params.get('titles')||'').split('|').map(raw=>{
        const title=key(raw),page=title==='Help:Contents'?{text:help,revision:helpRevision,pageId:1}:pages.get(title),ns=title.startsWith('Template:')?10:title==='Help:Contents'?12:0;
        return page?{title,ns,pageid:page.pageId,revisions:[{revid:page.revision,timestamp:'2026-10-25T11:00:00Z',slots:{main:{content:page.text}}}]}:{title,ns,missing:true};
    })}});
    if(params.get('action')==='edit'){
        assert.equal(params.get('assertuser'),'Synthetic Editor');assert.equal(params.get('token'),'SYNTHETIC-TOKEN');writes.push(request);
        const title=params.get('title'),before=pages.get(title);assert(!params.has('createonly')||!before,'fixture must not overwrite an existing creation');
        pages.set(title,{text:normalizeWikiSubmissionText(params.get('text')),revision:++revision,pageId:before?.pageId||revision+1000});
        if(loseResponseFor===title){loseResponseFor=null;throw Error('Synthetic connection loss after applied save');}
        return reply({edit:{result:'Success',newrevid:revision,pageid:pages.get(title).pageId}});
    }
    throw Error('Unsupported synthetic request: '+JSON.stringify(request));
};
const catalog={meta:{sample:false,wikiEntitiesComplete:true,wikiRelationshipCoverageVersion:1,lootSourceCountsVersion:2},wikiEntities:{items:[],npcs:[],zones:[],titles:[]},items:[],npcs:[],zones:[]};
const makeClient=()=>new WikiClient({origin:'http://127.0.0.1:19999',allowLoopbackDevelopment:true,fetchImpl,stateDir,getItemCatalog:async()=>{catalogReads++;return catalog;},isContributionIgnored:async({kind,name})=>ignored.has(kind+'|'+name)});
const reviewed=value=>({value,confirmed:true}),candidate=(name,availability='unknown',fields={})=>({kind:'zone',name,era:'Classic Era',instance:'normal',fields:{raidAvailability:reviewed(availability),...fields}});
const prepare=(client,name,availability='unknown',fields={},extra={})=>client.preparePlan({candidate:candidate(name,availability,fields),matchesReviewed:true,...extra});
const imageReads=()=>requests.filter(request=>request.prop==='imageinfo');
try{
    const client=makeClient();
    const blank=await prepare(client,'Blank Map Vale','no');assert.deepEqual(blank.blockers,[]);assert.deepEqual(blank.zoneCreation,{schemaVersion:1,raidAvailability:'no',mapFiles:{}});assert.equal(imageReads().length,0,'blank map fields make no imageinfo request');
    assert.equal(blank.pages.length,1);assert.match(blank.pages[0].afterText,/Map needed/);assert.equal((await client.submitPlan({planId:blank.id,reviewDigest:blank.reviewDigest})).status,'submitted');assert.equal(imageReads().length,0);assert.equal(writes.at(-1).createonly,'1');
    const maps=await prepare(client,'Mapped Vale','yes',{mapFilename:reviewed('Normal_Map.PNG'),raidMapFilename:reviewed('Raid Map.jpg'),notableNPCs:reviewed(['Normal Guardian']),raidNotableNPCs:reviewed(['Raid Guardian'])});
    assert.deepEqual(maps.blockers,[]);assert.deepEqual(maps.zoneCreation.mapFiles,{normal:'Normal_Map.PNG',raid:'Raid Map.jpg'});assert.match(maps.pages[0].afterText,/File:Normal_Map\.PNG/);assert.equal(imageReads().length,2,'one query validates each reviewed map while MediaWiki normalizes underscores');
    assert.deepEqual(maps.notableChoices.map(choice=>[choice.npcTitle,choice.instance]),[['Normal Guardian','normal'],['Raid Guardian','raid']]);
    const beforeMapWrites=writes.length;files.delete('Raid Map.jpg');await assert.rejects(client.submitPlan({planId:maps.id,reviewDigest:maps.reviewDigest}),/unavailable|no longer available/);assert.equal(writes.length,beforeMapWrites,'map deletion after Preview blocks every pending article write');files.add('Raid Map.jpg');
    assert.equal((await client.submitPlan({planId:maps.id,reviewDigest:maps.reviewDigest})).status,'submitted');assert(imageReads().length>=6,'native retry rechecks image availability');
    const missing=await prepare(client,'Missing Image Vale','no',{mapFilename:reviewed('Missing.png')});assert(missing.blockers.some(message=>/unavailable/.test(message)));await assert.rejects(client.submitPlan({planId:missing.id,reviewDigest:missing.reviewDigest}),/unavailable/);
    imageOverride={ns:0,title:'File:Normal Map.PNG',imageinfo:[{url:'https://example.invalid'}]};const wrongNamespace=await prepare(client,'Wrong Namespace Map Vale','no',{mapFilename:reviewed('Normal Map.PNG')});assert(wrongNamespace.blockers.some(message=>/unavailable/.test(message)));imageOverride=null;
    imageOverride={ns:6,title:'File:Other Map.PNG',imageinfo:[{url:'https://example.invalid'}]};const wrongFile=await prepare(client,'Wrong Returned Map Vale','no',{mapFilename:reviewed('Normal Map.PNG')});assert(wrongFile.blockers.some(message=>/unavailable|requested|reviewed|match/.test(message)),'an unrelated returned file cannot prove the reviewed filename exists');imageOverride=null;
    const unanswered=await client.preparePlan({candidate:{...candidate('Unanswered Vale'),fields:{}},matchesReviewed:true});assert(unanswered.blockers.some(message=>/raid instance/.test(message)));
    const unknown=await prepare(client,'Unknown Raid Vale','unknown',{raidMapFilename:reviewed('Hidden Raid.png'),raidNotableNPCs:reviewed(['Hidden Raid Guardian'])});assert.deepEqual(unknown.blockers,[]);assert.doesNotMatch(unknown.pages[0].afterText,/Hidden|= Raid Instance =/);assert.deepEqual(unknown.zoneCreation.mapFiles,{});
    const legacyHelp=help;help=help.replace(zoneSubsection,'=== Zone Page Blueprint ===\n<pre>{| class="zoneTopTable"\n|}</pre>');helpRevision++;
    const old=await prepare(client,'Unsupported Blueprint Vale','no');assert(old.blockers.some(message=>/unified/.test(message)));help=legacyHelp;helpRevision++;
    const editable=await prepare(client,'Edited Vale','no');
    for(const editedText of [editable.pages[0].afterText.replace('== Map ==','== Omitted Map =='),editable.pages[0].afterText.replace('[[Category:Zones]]',''),editable.pages[0].afterText+'\n[[Category:Zones]]',editable.pages[0].afterText+'\n= Raid Instance =\n{| class="zoneTopTable"\n|}',editable.pages[0].afterText.replace("''Map needed.''",'[[File:Normal Map.PNG]]')]){
        const malformed=await prepare(client,'Edited Vale','no',{}, {editedText});assert(malformed.blockers.length>0,'source editor cannot discard the reviewed zone layout or borrow an unreviewed map');
    }
    const bound=await prepare(client,'Digest Bound Vale','yes'),stored=client.plans.get(bound.id);stored.zoneCreation.raidAvailability='no';const beforeDigestRequests=requests.length;await assert.rejects(client.submitPlan({planId:bound.id,reviewDigest:bound.reviewDigest}),/changed/);assert.equal(requests.length,beforeDigestRequests,'raid metadata is included in the digest, before network');stored.zoneCreation.raidAvailability='yes';
    const legacy=await prepare(client,'Legacy Saved Vale','no'),legacyStored=client.plans.get(legacy.id);delete legacyStored.zoneCreation;legacyStored.reviewDigest=client.digest(legacyStored);await client.persist();const beforeLegacyWrites=writes.length;await assert.rejects(makeClient().submitPlan({planId:legacy.id,reviewDigest:legacyStored.reviewDigest}),/predates.*unified/);assert.equal(writes.length,beforeLegacyWrites);
    const malformedRetry=await prepare(client,'Malformed Saved Vale','no'),malformedStored=client.plans.get(malformedRetry.id);malformedStored.pages[0].afterText=malformedStored.pages[0].afterText.replace('[[Category:Zones]]','');malformedStored.pages[0].afterHash=hash(malformedStored.pages[0].afterText);malformedStored.reviewDigest=client.digest(malformedStored);await client.persist();const beforeMalformedWrites=writes.length;await assert.rejects(makeClient().submitPlan({planId:malformedRetry.id,reviewDigest:malformedStored.reviewDigest}),/Zones category|zone.*review|unified/i,'saved metadata still requires the zone layout when its Category is missing');assert.equal(writes.length,beforeMalformedWrites);
    const lost=await prepare(client,'Unknown Save Vale','yes',{notableNPCs:reviewed(['Later Ignored Guardian'])});loseResponseFor='Unknown Save Vale';const uncertain=await client.submitPlan({planId:lost.id,reviewDigest:lost.reviewDigest});assert.equal(uncertain.pages[0].status,'unknown');ignored.add('npc|Later Ignored Guardian');
    const reconciled=await makeClient().submitPlan({planId:lost.id,reviewDigest:lost.reviewDigest});assert.equal(reconciled.status,'submitted');assert.equal(reconciled.pages[0].result.reconciled,true);assert.equal(writes.filter(write=>write.title==='Unknown Save Vale').length,1,'already applied exact text reconciles before new ignore policy and is never repeated');

    // The native callback is authoritative before catalog/account/HTTP on a
    // fresh capture or explicit NPC/item target, independently of renderer state.
    const item={kind:'item',name:'Ignored Relic',fields:{statLines:reviewed(['HP: 1'])}},npc={kind:'npc',name:'Ignored Guardian',zone:'Synthetic Vale',instance:'normal',fields:{location:reviewed('1, 2, 3')}};
    ignored.add('item|Ignored Relic');ignored.add('npc|Ignored Guardian');let before=requests.length,beforeCatalog=catalogReads;
    await assert.rejects(client.prepareCapturedItem(item),/permanently ignored/);assert.equal(requests.length,before);
    await assert.rejects(client.preparePlan({candidate:item,matchesReviewed:true}),/permanently ignored/);assert.equal(requests.length,before);
    await assert.rejects(client.preparePlan({candidate:npc,matchesReviewed:true}),/permanently ignored/);assert.equal(requests.length,before);
    await assert.rejects(prepare(client,'Ignored Population Vale','no',{notableNPCs:reviewed(['Ignored Guardian'])}),/permanently ignored/);assert.equal(requests.length,before);
    await assert.rejects(client.preparePlan({candidate:{...item,name:'Unrelated New Relic',sources:[{npc:'Ignored Guardian',zone:'Synthetic Vale',instance:'normal',confirmed:true}]},matchesReviewed:true}),/permanently ignored/);assert.equal(requests.length,before);
    assert.equal(catalogReads,beforeCatalog,'native ignored captures/primary and confirmed related targets stop before even reading the catalog');
    const retryItem={...item,name:'Ignore After Preview Relic'},retry=await client.preparePlan({candidate:retryItem,matchesReviewed:true});assert.deepEqual(retry.blockers,[]);ignored.add('item|Ignore After Preview Relic');const beforeRetry=writes.length;
    await assert.rejects(makeClient().submitPlan({planId:retry.id,reviewDigest:retry.reviewDigest}),/permanently ignored/);assert.equal(writes.length,beforeRetry,'persisted pending plans cannot bypass a newly saved ignore');assert(client.plans.has(retry.id),'ignore leaves the review/receipt available');
    ignored.clear();
    console.log('Native zone creation: live shared blueprint, explicit raid answer, map placeholders/existence and retry checks, source-editor guards, digest binding, saved-plan reconciliation and authoritative ignores pass.');
}finally{await rm(stateDir,{recursive:true,force:true});}
