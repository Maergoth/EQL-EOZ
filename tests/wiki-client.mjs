import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{WikiClient,wikiOrigin,validatePNG,normalizeWikiSubmissionText}=require('../desktop/wiki-client.cjs');
assert.equal(normalizeWikiSubmissionText(' \tTop\r\n  keep \rLine\0value\t \r\n\v\0'),' \tTop\n  keep \nLinevalue');
for(const character of ['\f','\u00a0','\u2003'])assert.equal(normalizeWikiSubmissionText(`Text\n${character}`),`Text\n${character}`,'PHP rtrim must not become JavaScript trimEnd');
assert.equal(normalizeWikiSubmissionText('AC:  5\nHP: 10'),'AC:  5\nHP: 10','internal source whitespace remains significant');
// Independent fixture equivalent of installed TextContent normalization and
// Parser's NUL removal. Do not store raw POST text as the previous fixture did.
const saveWikiText=text=>text.split('\0').join('').replace(/[\x00\x09\x0a\x0b\x0d\x20]+$/,'').split('\r\n').join('\n').split('\r').join('\n');
assert.equal(wikiOrigin(),'https://eqlwiki.com');assert.throws(()=>wikiOrigin('https://attacker.example'));assert.throws(()=>wikiOrigin('http://127.0.0.1:1234'));assert.throws(()=>wikiOrigin('http://127.0.0.1:1234/other',true));assert.equal(wikiOrigin('http://127.0.0.1:1234',true),'http://127.0.0.1:1234');
const source='== Items ==\n=== Item Page Blueprint ===\n<pre>{{Itempage|itemname=|statsblock=}}</pre>\n== NPCs ==\n=== NPC Page Blueprint ===\n<pre>{{Namedmobpage|name=}}</pre>';
const pages=new Map([['Help:Contents',{text:source,revision:100,pageId:1}],['Template:Classic Era',{text:'Synthetic era template',revision:50,pageId:50}],['a synthetic guardian',{text:'{{Namedmobpage\n|name=a synthetic guardian\n|known_loot=\n* None\n|description=Existing player prose.\n}}\n[[Category:Synthetic Vale]]',revision:101,pageId:2}]]);
const writes=[],files=new Map();let currentUser={id:7,name:'Fixture Editor'},counter=200,failTitle=null,unknownTitle=null,revision=100,cookieSeen=false,uploadCount=0,talkFail=false;
const server=http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://fixture'),chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
    let params=req.method==='POST'?new URLSearchParams(body.toString()):url.searchParams;
    const json=value=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    if(req.headers['content-type']?.startsWith('multipart/form-data')){
        const text=body.toString('latin1'),field=name=>text.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
        assert.equal(field('action'),'upload');assert.equal(field('assertuser'),currentUser.name);assert.equal(field('ignorewarnings'),undefined);assert.ok(req.headers.cookie?.includes('fixture=loggedin'));
        const filename=field('filename'),blobStart=body.indexOf(Buffer.from('Content-Type: image/png\r\n\r\n'))+'Content-Type: image/png\r\n\r\n'.length,blobEnd=body.indexOf(Buffer.from('\r\n--'),blobStart),bytes=body.subarray(blobStart,blobEnd);
        files.set(filename,{sha1:crypto.createHash('sha1').update(bytes).digest('hex'),user:currentUser.name});uploadCount++;return json({upload:{result:'Success',imageinfo:{url:'http://fixture/image.png'}}});
    }
    const action=params.get('action');
    if(action==='query'&&params.get('meta')==='userinfo'){cookieSeen=req.headers.cookie==='fixture=loggedin';return json({query:{userinfo:currentUser?{...currentUser,rights:['edit','createpage','upload']}:{id:0,name:'Anonymous',anon:true}}});}
    if(action==='query'&&params.get('meta')==='tokens'){assert.equal(params.get('assertuser'),currentUser.name);return json({query:{tokens:{csrftoken:'FIXTURE-TOKEN'}}});}
    if(action==='query'&&params.get('list'))return json({query:{[params.get('list')]:[]}});
    if(action==='query'&&params.get('prop')==='imageinfo'){const filename=params.get('titles').replace(/^File:/,'');return json({query:{pages:[files.has(filename)?{title:`File:${filename}`,imageinfo:[files.get(filename)]}:{title:`File:${filename}`,missing:true}]}});}
    if(action==='query'){
        const result=params.get('titles').split('|').map(title=>{if(title==='lowercase guard')return{title:'Lowercase guard',ns:0,missing:true};const page=pages.get(title);return page?{title,ns:title.startsWith('User_talk:')?3:title.startsWith('Template:')?10:0,pageid:page.pageId,revisions:[{revid:title==='Help:Contents'?revision:page.revision,timestamp:'2026-10-22T00:00:00Z',slots:{main:{content:page.text}}}]}:{title,ns:0,missing:true};});return json({curtimestamp:'2026-10-22T01:00:00Z',query:{pages:result}});
    }
    if(action==='edit'){
        assert.equal(params.get('token'),'FIXTURE-TOKEN');assert.equal(params.get('assert'),'user');assert.equal(params.get('assertuser'),currentUser.name);writes.push(Object.fromEntries(params));const title=params.get('title'),page=pages.get(title);
        if(title===failTitle || (talkFail&&title.startsWith('User_talk:')))return json({error:{code:'permissiondenied',info:'Fixture account is not permitted.'}});
        if(params.has('createonly')&&page)return json({error:{code:'articleexists',info:'Already exists'}});
        if(params.has('baserevid')&&Number(params.get('baserevid'))!==page?.revision)return json({error:{code:'editconflict',info:'Changed'}});
        const submitted=params.get('text').replace('{{subst:Synthetic Fixture Macro}}','Expanded synthetic fixture text');
        pages.set(title,{text:saveWikiText(params.get('section')==='new'?(page?.text||'')+'\n'+submitted:submitted),revision:++counter,pageId:page?.pageId||counter+1000});
        if(title===unknownTitle){unknownTitle=null;req.socket.destroy();return;}
        return json({edit:{result:'Success',newrevid:counter,pageid:page?.pageId||counter+1000}});
    }
    return json({error:{code:'unsupported',info:'Unsupported fixture request'}});
}catch(error){res.writeHead(500);res.end(String(error.stack));}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`,stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'eoz-wiki-test-'));
const fetchWithCookie=(url,init)=>fetch(url,{...init,headers:{...init.headers,Cookie:'fixture=loggedin'}});
const makeClient=()=>new WikiClient({origin,allowLoopbackDevelopment:true,fetchImpl:fetchWithCookie,stateDir});
const candidate=name=>({kind:'item',name,era:'Classic Era',zone:'Synthetic Vale',instance:'normal',fields:{statLines:{value:['Slot: SECONDARY','AC: 5'],confirmed:true}},sources:[{npc:'a synthetic guardian',zone:'Synthetic Vale',confirmed:true,sourceEvidence:'explicit-corpse'}]});
try{
    const client=makeClient();assert.equal((await client.status()).user.name,'Fixture Editor');assert.equal(cookieSeen,true);
    const anonymous=await client.preparePlan({candidate:candidate('Synthetic Item'),matchesReviewed:false});assert.ok(anonymous.blockers.some(value=>value.includes('potential matches')));await assert.rejects(client.submitPlan({planId:anonymous.id,reviewDigest:anonymous.reviewDigest}),/potential matches/);
    const plan=await client.preparePlan({candidate:candidate('Synthetic Item'),matchesReviewed:true,relatedPages:[{title:'a synthetic guardian',role:'npc-loot',itemTitle:'Synthetic Item',zoneTitle:'Synthetic Vale'}]});assert.equal(plan.pages.length,2);assert.deepEqual(plan.blockers,[]);assert.equal(JSON.stringify(plan).includes('FIXTURE-TOKEN'),false);
    const concurrent=makeClient();assert.ok((await Promise.all(Array.from({length:6},()=>concurrent.getPlan(plan.id)))).every(value=>value.id===plan.id));
    const badEra=await client.preparePlan({candidate:{...candidate('Bad Era Item'),era:'ClassicEra'},matchesReviewed:true});assert.ok(badEra.blockers.some(message=>message.includes('selected era template does not exist')));
    const canonical=await client.preparePlan({candidate:candidate('lowercase guard'),matchesReviewed:true});assert.equal(canonical.pages[0].title,'Lowercase guard');assert.match(canonical.pages[0].afterText,/\|itemname = Lowercase guard/);
    currentUser={id:8,name:'Other Editor'};await assert.rejects(client.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest}),/account changed/);currentUser={id:7,name:'Fixture Editor'};
    revision=102;await assert.rejects(client.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest}),/blueprints changed/);revision=100;
    failTitle='a synthetic guardian';const partial=await client.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest});assert.equal(partial.status,'partial');assert.equal(partial.pages[0].status,'applied');assert.equal(partial.pages[1].status,'failed');assert.equal(writes[0].createonly,'1');
    failTitle=null;const restored=makeClient(),completed=await restored.submitPlan({planId:plan.id,reviewDigest:plan.reviewDigest});assert.equal(completed.status,'submitted');assert.equal(writes.filter(write=>write.title==='Synthetic Item').length,1);assert.ok(writes.find(write=>write.title==='a synthetic guardian'&&write.baserevid==='101'));
    const conflict=await restored.preparePlan({candidate:candidate('Conflict Item'),matchesReviewed:true,relatedPages:[{title:'a synthetic guardian',role:'npc-loot',itemTitle:'Conflict Item',zoneTitle:'Synthetic Vale'}]});pages.get('a synthetic guardian').revision++;pages.get('a synthetic guardian').text+='\nHuman concurrent edit.';const conflicted=await restored.submitPlan({planId:conflict.id,reviewDigest:conflict.reviewDigest});assert.equal(conflicted.status,'partial');assert.equal(conflicted.pages[1].result.code,'editconflict');assert.match(pages.get('a synthetic guardian').text,/Human concurrent edit/);
    const unknown=await restored.preparePlan({candidate:candidate('Unknown Item'),matchesReviewed:true,relatedPages:[{title:'a synthetic guardian',role:'npc-loot',itemTitle:'Unknown Item',zoneTitle:'Synthetic Vale'}]});
    assert.equal(unknown.pages[0].afterText.endsWith('\n'),false,'the reviewed/submitted source uses MediaWiki canonical line endings and final trim');
    const guardianWrites=writes.filter(write=>write.title==='a synthetic guardian').length;
    unknownTitle='Unknown Item';assert.equal((await restored.submitPlan({planId:unknown.id,reviewDigest:unknown.reviewDigest})).pages[0].status,'unknown');
    assert.equal(writes.filter(write=>write.title==='a synthetic guardian').length,guardianWrites,'a lost primary response pauses related writes');
    const resumed=await makeClient().submitPlan({planId:unknown.id,reviewDigest:unknown.reviewDigest});
    assert.equal(resumed.status,'submitted');assert.equal(resumed.pages[0].result.reconciled,true);
    assert.equal(writes.filter(write=>write.title==='Unknown Item').length,1,'restart must not repeat an already applied creation');
    assert.equal(writes.filter(write=>write.title==='a synthetic guardian').length,guardianWrites+1,'restart finishes the remaining reciprocal edit exactly once');
    // Previously persisted drafts keep their original review digest, but their
    // expected submitted text must use the same normalization on retry.
    const legacy=await restored.preparePlan({candidate:candidate('Legacy Unknown Item'),matchesReviewed:true});
    const legacyPlan=restored.plans.get(legacy.id);legacyPlan.pages[0].afterText+='\r\n\t\0';legacyPlan.pages[0].afterHash=crypto.createHash('sha256').update(legacyPlan.pages[0].afterText).digest('hex');legacyPlan.reviewDigest=restored.digest(legacyPlan);await restored.persist();
    unknownTitle='Legacy Unknown Item';assert.equal((await restored.submitPlan({planId:legacy.id,reviewDigest:legacyPlan.reviewDigest})).pages[0].status,'unknown');
    assert.equal((await makeClient().submitPlan({planId:legacy.id,reviewDigest:legacyPlan.reviewDigest})).status,'submitted');assert.equal(writes.filter(write=>write.title==='Legacy Unknown Item').length,1);
    const transformed=await restored.preparePlan({candidate:candidate('Transformed Item'),matchesReviewed:true,editedText:'{{Classic Era}}\n<onlyinclude>{{Itempage|itemname=Transformed Item|statsblock=AC: 5|notes={{subst:Synthetic Fixture Macro}}}}</onlyinclude>\n'});
    unknownTitle='Transformed Item';assert.equal((await restored.submitPlan({planId:transformed.id,reviewDigest:transformed.reviewDigest})).pages[0].status,'unknown');
    const transformedRetry=await restored.submitPlan({planId:transformed.id,reviewDigest:transformed.reviewDigest});assert.equal(transformedRetry.pages[0].result.code,'editconflict');assert.equal(writes.filter(write=>write.title==='Transformed Item').length,1,'unmodeled PST substitutions stay a strict manual-review conflict');
    const race=await restored.preparePlan({candidate:candidate('Raced Item'),matchesReviewed:true});pages.set('Raced Item',{text:'Someone else created this.',revision:500,pageId:500});const raced=await restored.submitPlan({planId:race.id,reviewDigest:race.reviewDigest});assert.equal(raced.pages[0].result.code,'editconflict');assert.equal(writes.filter(write=>write.title==='Raced Item').length,0);
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');assert.equal(validatePNG(png).readUInt32BE(16),1);assert.throws(()=>validatePNG(Buffer.from('not a png')));const oversized=Buffer.from(png);oversized.writeUInt32BE(9000,16);assert.throws(()=>validatePNG(oversized),/dimensions/);
    await assert.rejects(restored.uploadCharacter({png,characterName:'Fixture',confirmed:false}),/confirm/);
    talkFail=true;const upload=await restored.uploadCharacter({png,characterName:'Fixture',caption:'Synthetic character snapshot',confirmed:true});assert.equal(upload.upload,'applied');assert.equal(upload.talk,'unknown');assert.equal(upload.error.code,'permissiondenied');assert.equal(uploadCount,1);
    talkFail=false;const uploaded=await restored.uploadCharacter({png,characterName:'Fixture',caption:'Synthetic character snapshot',confirmed:true,snapshotId:upload.snapshotId});assert.equal(uploaded.talk,'applied');assert.equal(uploadCount,1);assert.match(pages.get('User_talk:Fixture Editor').text,/~~~~/);assert.equal(writes.filter(write=>write.title==='User_talk:Fixture Editor'&&write.section==='new').length,2);
    const idempotent=await restored.uploadCharacter({png,characterName:'Fixture',confirmed:true,snapshotId:upload.snapshotId});assert.equal(idempotent.talk,'applied');assert.equal(uploadCount,1);
    const reopened=await makeClient().uploadCharacter({png,characterName:'Fixture',confirmed:true});assert.equal(reopened.snapshotId,upload.snapshotId);assert.equal(reopened.reused,true);assert.equal(reopened.talk,'applied');assert.equal(uploadCount,1);assert.match(reopened.talkPageUrl,/User_talk:Fixture%20Editor/);
    const saved=await fs.readFile(path.join(stateDir,'wiki-contribution-plans.json'),'utf8');assert.doesNotMatch(saved,/FIXTURE-TOKEN|fixture=loggedin|"png":/);
    console.log('Wiki client local HTTP fixture: guarded creation, account/revision conflicts, partial restart, unknown write reconciliation, PNG validation, upload/talk retry and private persistence passed.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));assert.equal(path.dirname(stateDir),path.resolve(os.tmpdir()));assert.ok(path.basename(stateDir).startsWith('eoz-wiki-test-'));await fs.rm(stateDir,{recursive:true,force:true});}
