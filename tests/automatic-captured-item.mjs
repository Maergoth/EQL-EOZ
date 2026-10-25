import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {parseScreenRead} from '../app/screen-read-parser.js';
const require=createRequire(import.meta.url),{WikiClient}=require('../desktop/wiki-client.cjs'),{WikiHost}=require('../desktop/wiki-host.cjs');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const blueprints='== Items ==\n=== Item Page Blueprint ===\n<pre>{{Itempage|itemname=|statsblock=}}</pre>\n== Spells ==\n=== Spell Page Blueprint ===\n<pre>{{Spellpage|spellname=|items_with_effect=}}</pre>';
const stateDir=await fs.mkdtemp(path.join(os.tmpdir(),'eoz-captured-item-')),hosts=[];
let sequence=0;
function fixture({name='Synthetic New Helm',tier=0,effects=[],catalog=[]}={}){
    const proof={token:'native-proof',observationId:'native-observation',frameId:'native-frame',sessionId:'native-session',generation:3,sourceId:'window:game',capturedAt:'2026-10-25T00:00:00Z'};
    const observation=parseScreenRead({text:`Item: ${name}${tier?' +'+tier:''}\nHP: 147\nWeight: 1.1\nSlot: HEAD\nClass: WAR\n5 empty slots${effects.length?'\n'+effects.join('\n'):''}`,confidence:95,owner:'contribution',sessionId:proof.sessionId,capturedAt:proof.capturedAt})[0];
    observation.id=proof.observationId;
    const pages=new Map([['Help:Contents',{text:blueprints,id:1,revision:1}],['Template:Classic Era',{text:'Synthetic era',id:2,revision:2}]]),files=new Map(),calls=[];
    const f={proof,observation,pages,calls,valid:true,user:{id:7,name:'Synthetic Editor'},rights:['edit','createpage','upload'],search:[],prefix:[],queryPatch:null,beforeQuery:null,unknownWrite:false,catalog};
    const fetchImpl=async(url,init)=>{
        if(init.body instanceof FormData){
            const form=init.body;calls.push({action:'upload',user:form.get('assertuser'),comment:form.get('comment')});
            const bytes=Buffer.from(await form.get('file').arrayBuffer());files.set(form.get('filename'),{sha1:crypto.createHash('sha1').update(bytes).digest('hex'),user:f.user.name});
            return Response.json({upload:{result:'Success'}});
        }
        const p=init.method==='POST'?new URLSearchParams(init.body):new URL(url).searchParams,action=p.get('action');
        calls.push(Object.fromEntries(p));if(f.beforeQuery)await f.beforeQuery(p);
        if(action==='query'&&p.get('meta')==='userinfo')return Response.json({query:{userinfo:{...f.user,rights:f.rights}}});
        if(action==='query'&&p.get('meta')==='tokens')return Response.json({query:{tokens:{csrftoken:'SYNTHETIC-CSRF'}}});
        if(action==='query'&&p.get('list')){const key=p.get('list'),list=key==='search'?f.search:f.prefix,payload={query:{[key]:list,...(key==='search'?{searchinfo:{totalhits:list.length}}:{})}};return Response.json(f.queryPatch?.(payload,p)||payload);}
        if(action==='query'&&p.get('prop')==='imageinfo'){const name=p.get('titles').slice(5);return Response.json({query:{pages:[files.has(name)?{imageinfo:[files.get(name)]}:{missing:true}]}});}
        if(action==='query'){
            const payload={curtimestamp:'2026-10-25T00:00:00Z',query:{pages:p.get('titles').split('|').map(title=>{const page=pages.get(title);return page?{title,ns:title.startsWith('Template:')?10:0,pageid:page.id,revisions:[{revid:page.revision,timestamp:'2026-10-25T00:00:00Z',slots:{main:{content:page.text}}}]}:{title,ns:0,missing:true};})}};
            return Response.json(f.queryPatch?.(payload,p)||payload);
        }
        if(action==='edit'){
            assert.equal(p.get('assert'),'user');assert.equal(p.get('assertuser'),f.user.name);assert.equal(p.get('token'),'SYNTHETIC-CSRF');
            const title=p.get('title');if(p.get('createonly')==='1'&&pages.has(title))return Response.json({error:{code:'articleexists',info:'Already exists'}});
            pages.set(title,{text:p.get('text'),id:300,revision:301});if(f.unknownWrite)throw Error('Synthetic lost acknowledgement');
            return Response.json({edit:{result:'Success',newrevid:301,pageid:300}});
        }
        throw Error('Unexpected synthetic request '+action);
    };
    const client=new WikiClient({fetchImpl,stateDir:path.join(stateDir,String(++sequence))}),session={setPermissionRequestHandler(){},setPermissionCheckHandler(){},setDevicePermissionHandler(){},on(){},removeListener(){}};
    const image={isEmpty:()=>false,getSize:()=>({width:1,height:1}),resize(){return this;},toDataURL:()=>''};
    const host=new WikiHost({electron:{session:{fromPartition:()=>session},ipcMain:{handle(){},removeHandler(){}},nativeImage:{createFromBuffer:()=>image}},origin:'http://127.0.0.1:9999',getMainWindow:()=>null,client,onCaptureEvidence:async value=>{assert.deepEqual(value,proof);if(!f.valid)throw Error('Stale native proof');return{proof,png,observation:structuredClone(observation)};},onItemCatalog:()=>({meta:{wikiEntitiesComplete:true},wikiEntities:{items:f.catalog}})});
    hosts.push(host);Object.assign(f,{host,client,candidate:{id:'candidate_'+sequence,kind:'item',name,fields:{hp:{value:999999,confirmed:true},statLines:{value:['HP: 999999'],confirmed:true}},playerText:'Renderer supplied prose must not publish.',sources:[{npc:'Forged Guardian',zone:'Forged Zone',confirmed:true}]}});
    f.prepare=()=>host.prepareCapturedItem({candidate:f.candidate,captureEvidence:proof});f.submit=plan=>host.submitCapturedItem({planId:plan.id,reviewDigest:plan.reviewDigest});f.writes=()=>calls.filter(call=>['edit','upload'].includes(call.action));return f;
}
try{
    let f=fixture({tier:3});let result=await f.prepare();assert.equal(result.ok,true,result.reason);let plan=result.plan;
    assert.equal(plan.pages.length,1);assert.equal(plan.pages[0].operation,'create');assert.match(plan.pages[0].afterText,/HP: 106/);assert.match(plan.pages[0].afterText,/reverse calculated from a tier 3 item/);assert.doesNotMatch(plan.pages[0].afterText,/999999|Forged|Renderer supplied|WT:|Weight:/);assert.equal(f.observation.fields.find(field=>field.key==='hp').value,147,'Native observed values remain evidence');assert.equal(f.writes().length,0,'Prepare is local/read-only');
    result=await f.submit(plan);assert.equal(result.ok,true,result.reason);assert.equal(result.plan.status,'submitted');assert.match(result.pageUrl,/Synthetic_New_Helm$/);assert.equal(f.writes().filter(call=>call.action==='edit').length,1);assert.equal(f.writes()[0].comment,'Eye of Zomm captured item screenshot');assert.equal(f.writes().at(-1).summary,'Eye of Zomm captured item contribution');assert.equal(f.writes().at(-1).createonly,'1');assert.equal(f.writes().at(-1).assertuser,'Synthetic Editor');assert.equal((await f.prepare()).ok,false,'A saved attempt prevents repeat automatic writes');assert.equal((await f.submit(plan)).ok,false,'A consumed binding cannot be replayed');
    for(const mutate of [f=>{f.candidate.name='Different Item';},f=>{f.observation.kind='manual';},f=>{f.observation.owner='character';},f=>{f.observation.evidence.text+='\nConflicting OCR values left unknown: hp';},f=>{f.observation.fields.find(v=>v.key==='hp').confidence=undefined;},f=>{f.observation.fields.push({key:'augmented',value:true,confidence:95});},f=>{f.observation.fields=f.observation.fields.filter(v=>v.key!=='hp');},f=>{f.valid=false;},f=>{f.candidate.intent='update';}]){f=fixture();mutate(f);result=await f.prepare();assert.equal(result.ok,false);assert.equal(f.writes().length,0);}
    for(const patch of [payload=>({...payload,warnings:{query:'Synthetic warning'}}),payload=>({...payload,continue:{sroffset:12}}),payload=>{if(payload.query.search)payload.query.searchinfo.totalhits=50;return payload;},payload=>{if(payload.query.search)payload.query.search=Array.from({length:12},(_,n)=>({ns:0,pageid:n+1,title:'Other '+n}));return payload;},payload=>{if(payload.query.pages)payload.query.pages=[];return payload;}]){f=fixture();f.queryPatch=patch;result=await f.prepare();assert.equal(result.ok,false);assert.equal(f.writes().length,0);}
    f=fixture({name:'Earthshaker'});f.search=[{ns:0,pageid:90,title:'Farthshaker'}];result=await f.prepare();assert.equal(result.ok,false);assert.match(result.reason,/similar/);assert.equal(f.writes().length,0,'First-letter fuzzy names do not bypass duplicate review');
    f=fixture({name:'Earthshaker',catalog:['Farthshaker']});result=await f.prepare();assert.equal(result.ok,false);assert.equal(f.writes().length,0,'The complete local catalog also blocks first-letter typos');
    f=fixture({effects:['Effect: Synthetic Missing Spell (Combat, Casting Time: Instant)']});result=await f.prepare();assert.equal(result.ok,false);assert.match(result.reason,/spell page/);assert.equal(f.writes().length,0,'Missing effects never create related spell pages automatically');
    f=fixture({effects:['Effect: Synthetic Existing Spell (Combat, Casting Time: Instant) at Level 45']});f.pages.set('Synthetic Existing Spell',{id:30,revision:31,text:'{{Spellpage|spellname=Synthetic Existing Spell}}'});result=await f.prepare();assert.equal(result.ok,true,result.reason);assert.equal(result.plan.pages.length,1);assert.match(result.plan.pages[0].afterText,/Effect: \[\[Synthetic Existing Spell\]\].*Combat.*Instant.*Level 45/);
    for(const stop of ['cancel','stale','account']){f=fixture();plan=(await f.prepare()).plan;if(stop==='cancel')f.host.capturedItemPlans.delete(plan.id);if(stop==='stale')f.valid=false;if(stop==='account')f.user={id:8,name:'Other Editor'};result=await f.submit(plan);assert.equal(result.ok,false);assert.equal(f.writes().length,0);}
    f=fixture();plan=(await f.prepare()).plan;f.beforeQuery=p=>{if(p.get('meta')==='tokens')f.host.capturedItemPlans.delete(plan.id);};result=await f.submit(plan);assert.equal(result.ok,false);assert.equal(f.writes().length,0,'Cancel during token lookup is checked immediately before upload');
    f=fixture();plan=(await f.prepare()).plan;f.beforeQuery=p=>{if(p.get('prop')==='info|revisions'&&p.get('titles')==='Synthetic New Helm')f.pages.set('Synthetic New Helm',{id:91,revision:92,text:plan.pages[0].afterText});};result=await f.submit(plan);assert.equal(result.ok,false);assert.equal(f.writes().filter(call=>call.action==='edit').length,0,'An identical competing article is not claimed as this attempt');
    f=fixture();plan=(await f.prepare()).plan;f.unknownWrite=true;result=await f.submit(plan);assert.equal(result.ok,false);assert.equal(result.plan.pages[0].status,'unknown');assert.equal(f.writes().filter(call=>call.action==='edit').length,1);assert.equal((await f.submit(plan)).ok,false);const reloaded=new WikiClient({fetchImpl:f.client.fetch,stateDir:f.client.stateDir});const saved=await reloaded.getPlan(plan.id);assert(saved.automaticItem);f.unknownWrite=false;assert.equal((await reloaded.submitPlan({planId:saved.id,reviewDigest:saved.reviewDigest})).status,'submitted');assert.equal(f.writes().filter(call=>call.action==='edit').length,1,'Only explicit manual retry reconciles an uncertain prior write');
    console.log('Captured item native gate: immutable OCR/tier bases, exact-frame screenshot, strict duplicates/catalog, account and cancellation checks, one attributed create, effects and uncertain retry passed.');
}finally{for(const host of hosts)host.dispose();assert.equal(path.dirname(stateDir),path.resolve(os.tmpdir()));await fs.rm(stateDir,{recursive:true,force:true});}
