import { findPotentialMatches } from './contribution-model.js';
import { CONTRIBUTION_QUEUE_KEY, CONTRIBUTION_QUEUE_BYTES, contributionSourceToken, contributionLogLine, logContributionObservation } from './contribution-evidence.js';
import { createWikiResolver, normalizeWikiIdentity as contributionNameKey, itemBaseIdentity as itemIdentity, itemExaltationBaseIdentity, wikiIdentityKey, wikiEntityKind } from './wiki-identity.js';
import { contributionReasons } from './contribution-reasons.js';
import { classifyNpcEvidence } from './generated-pets.js';
import { collectTierZeroEvidence, tierZeroVerificationPreview, confirmTierZeroVerification } from './contribution-tier-zero.js';
import { automaticSourceReceiptKey } from './automatic-source-results.js';

const KEY=CONTRIBUTION_QUEUE_KEY;
const clean=(value,max=240)=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g,' ').trim().slice(0,max);
const candidateKey=(kind,name,zone='')=>`${kind}|${contributionNameKey(kind==='item'?itemIdentity(name).name:name)}|${kind==='item'?'':contributionNameKey(zone)}`;
export function createContributionQueue({storage=globalThis.localStorage,getPack=()=>({}),isIgnored=()=>false,onWarning=()=>{},now=Date.now,autoReconcile=true}={}){
    let candidates=[],archive=[],automaticSourceReceipts=[],automaticSourceDecisions=[],sequence=0,cursor=0,catalogCache=null,lastReconciled=null,lastLog=null,armed=null,readBlocked=false,migrated=false;const ignored=new Set(),seenLogIds=new Set(),registry=new Map();
    const pack=()=>{try{return getPack()||{};}catch{return {};}};
    const entityIgnored=(kind,name)=>['npc','item'].includes(wikiEntityKind(kind))&&isIgnored({kind:wikiEntityKind(kind),name})===true;
    function resolver(){const current=pack(),version=current.meta?.manifestVersion||current.meta?.version||'',entities=current.wikiEntities,complete=`${current.meta?.wikiEntitiesComplete===true}:${current.meta?.sample===true}`;if(catalogCache?.pack!==current||catalogCache.entities!==entities||catalogCache.version!==version||catalogCache.complete!==complete||catalogCache.items!==current.items||catalogCache.npcs!==current.npcs||catalogCache.zones!==current.zones)catalogCache={pack:current,entities,version,complete,items:current.items,npcs:current.npcs,zones:current.zones,resolver:createWikiResolver(current)};return catalogCache.resolver;}
    const canonicalKey=(kind,name,zone='')=>{const resolved=resolver().resolve(kind,name);return candidateKey(kind,resolved.canonicalTitle||name,zone);};
    const spawnEligible=candidate=>candidate?.kind==='npc'&&[candidate.name,candidate.title||candidate.name].every(name=>classifyNpcEvidence(name,resolver().resolve('npc',name)).eligible);
    const protectedDraft=candidate=>Boolean(candidate.planId||candidate.baseRecovery||candidate.baseVerification||candidate.attachment||candidate.manual===true||candidate.spawnRequest?.status==='captured'||candidate.matchesReviewed===true||candidate.reviewed===true||candidate.submittedAt||!['needs-review',''].includes(candidate.status||'')||candidate.playerText||candidate.title&&contributionNameKey(candidate.title)!==contributionNameKey(candidate.name)||Object.values(candidate.fields||{}).some(field=>field?.confirmed===true||field?.edited===true)||[...(candidate.sources||[]),...(candidate.relations||[])].some(relation=>relation?.confirmed===true||relation?.type==='spawn-location'));
    const passivePopulation=relation=>['mob-zone','zone-population'].includes(relation?.type)&&relation.evidence==='consider';
    function passiveFacts(candidate){
        const relations=candidate.relations||[],evidence=candidate.evidence||[];
        if(protectedDraft(candidate)||!relations.some(passivePopulation)||evidence.some(entry=>entry.kind!=='game-log'))return null;
        if(candidate.kind==='npc'&&!(candidate.sources||[]).length&&relations.every(passivePopulation)&&evidence.every(entry=>entry.event==='consider'||!entry.event&&/^Log consider:/i.test(entry.text||''))&&Object.keys(candidate.fields||{}).every(key=>['name','level'].includes(key)))return {archive:true};
        if(candidate.kind!=='zone')return null;
        const retained=relations.filter(relation=>!passivePopulation(relation));
        const removedNames=new Set(relations.filter(passivePopulation).map(relation=>contributionNameKey(relation.name)).filter(name=>!retained.some(relation=>['mob-zone','zone-population'].includes(relation.type)&&contributionNameKey(relation.name)===name)));
        const fields=structuredClone(candidate.fields||{}),population=fields.knownNPCs;
        if(Array.isArray(population?.value)){
            population.value=population.value.filter(name=>!removedNames.has(contributionNameKey(name)));
            if(!population.value.length)delete fields.knownNPCs;
        }
        return {archive:false,relations:retained,fields};
    }
    const fieldValue=value=>Array.isArray(value)?value.slice(0,200).map(item=>typeof item==='string'?clean(item,512):typeof item==='number'&&Number.isFinite(item)?item:typeof item==='boolean'?item:null).filter(item=>item!==null):typeof value==='string'?clean(value,16000):typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'||value===null?value:null;
    const validField=key=>/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)&&!['constructor','prototype','__proto__'].includes(key);
    function attachmentValue(value){if(value===null)return null;const thumbnail=typeof value?.thumbnail==='string'&&/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]*={0,2}$/.test(value.thumbnail)&&value.thumbnail.length<=200000?value.thumbnail:null;if(!value||typeof value.attachmentId!=='string'||!value.attachmentId.trim()||value.attachmentId.length>240||!Number.isSafeInteger(value.width)||!Number.isSafeInteger(value.height)||value.width<1||value.height<1||value.width*value.height>16777216||!Number.isSafeInteger(value.bytes)||value.bytes<1||value.bytes>16*1024*1024)throw Error('Review a bounded screenshot attachment.');return {attachmentId:clean(value.attachmentId),thumbnail,width:value.width,height:value.height,bytes:value.bytes,caption:clean(value.caption,1000),license:clean(value.license,200)};}
    try{const raw=storage?.getItem(KEY);if(raw){
        if(typeof raw!=='string'||new TextEncoder().encode(raw).length>CONTRIBUTION_QUEUE_BYTES)throw Error('Queue too large');
        const saved=JSON.parse(raw);if(saved.schemaVersion!==1||!Array.isArray(saved.candidates)||saved.candidates.length>200||saved.candidates.some(c=>!c||!['item','npc','zone'].includes(c.kind)||typeof c.id!=='string'||typeof c.name!=='string'))throw Error('Unsupported queue');
        candidates=saved.candidates.map(candidate=>{
            const key=canonicalKey(candidate.kind,candidate.name,candidate.zone),aliases=[...(candidate.aliasKeys||[]),...(candidate.key&&candidate.key!==key?[candidate.key]:[])];
            const loaded={...candidate,key,aliasKeys:[...new Set(aliases)].slice(-8),fields:candidate.fields&&typeof candidate.fields==='object'?candidate.fields:{},sources:Array.isArray(candidate.sources)?candidate.sources:[],relations:Array.isArray(candidate.relations)?candidate.relations.slice(-100):[],evidence:Array.isArray(candidate.evidence)?candidate.evidence:[]};
            const identity=itemIdentity(candidate.name),reviewed=Boolean(candidate.planId||candidate.baseRecovery||candidate.matchesReviewed===true||candidate.reviewed===true||candidate.submittedAt||Object.values(loaded.fields).some(field=>field?.confirmed===true||field?.edited===true)||[...loaded.sources,...loaded.relations].some(relation=>relation?.confirmed===true));
            if(candidate.kind==='item'&&identity.tier!==null&&candidate.title===candidate.name&&(!candidate.status||candidate.status==='needs-review')&&!reviewed){
                loaded.name=identity.name;loaded.title=identity.name;
                if(!Object.hasOwn(loaded.fields,'tier'))loaded.fields={...loaded.fields,tier:{value:identity.tier,confirmed:false}};
                const id=`draft-name-migration-${contributionSourceToken(candidate.name)}`;
                if(!loaded.evidence.some(entry=>entry.id===id))loaded.evidence=[...loaded.evidence,{id,at:new Date(now()).toISOString(),kind:'draft-migration',text:`Original unreviewed draft name: ${candidate.name}\nControlled base title: ${identity.name}\nObserved tier decoration: +${identity.tier}`,confidence:0}].slice(-6);
                migrated=true;
            }
            return loaded;
        });sequence=Number(saved.sequence)||0;cursor=Number(saved.cursor)||0;
        if(saved.archive!==undefined&&(!Array.isArray(saved.archive)||saved.archive.length>200))throw Error('Unsupported archive');
        if((saved.archive||[]).some(candidate=>!candidate||!['item','npc','zone'].includes(candidate.kind)||typeof candidate.id!=='string'||typeof candidate.name!=='string'))throw Error('Unsupported archived candidate');
        archive=saved.archive||[];
        const validRelationKey=key=>{
            if(typeof key!=='string'||key.length>1000)return false;
            try{const values=JSON.parse(key);return Array.isArray(values)&&values.length===4&&values.slice(0,3).every(value=>typeof value==='string'&&value.length>0&&value.length<=240)&&['normal','raid'].includes(values[3]);}catch{return false;}
        };
        automaticSourceReceipts=(Array.isArray(saved.automaticSourceReceipts)?saved.automaticSourceReceipts:[]).slice(-500).filter(validRelationKey);
        automaticSourceDecisions=(Array.isArray(saved.automaticSourceDecisions)?saved.automaticSourceDecisions:[]).slice(-500).filter(entry=>validRelationKey(entry?.key)&&['covered','routine'].includes(entry.decision));
        for(const key of (Array.isArray(saved.ignored)?saved.ignored:[]).slice(-2000))if(typeof key==='string'&&key.length<800)ignored.add(key);
        for(const id of (Array.isArray(saved.seenLogIds)?saved.seenLogIds:[]).slice(-2000))if(typeof id==='string'&&id.length<=240)seenLogIds.add(id);
        for(const entry of (Array.isArray(saved.registry)?saved.registry:[]).slice(-2000))if(entry&&typeof entry.key==='string'&&entry.key.length<800&&['queued','submitted','partial','ignored','notified'].includes(entry.state))registry.set(entry.key,entry);
    }}catch{readBlocked=true;onWarning('The saved contribution queue could not be read and was preserved. Recover it before saving new drafts.');}
    function save(){if(readBlocked)return false;try{const value=JSON.stringify({schemaVersion:1,sequence,cursor,candidates,archive,automaticSourceReceipts,automaticSourceDecisions,registry:[...registry.values()].slice(-2000),ignored:[...ignored].slice(-2000),seenLogIds:[...seenLogIds].slice(-2000)});if(new TextEncoder().encode(value).length>CONTRIBUTION_QUEUE_BYTES)throw Error('Queue too large');storage?.setItem(KEY,value);return true;}catch{onWarning('Contributions remain in memory because their saved queue is full or unavailable. Review or remove drafts before closing Eye of Zomm.');return false;}}
    function rememberState(kind,name,state,purpose='missing-page',zone=''){const resolved=resolver().resolve(kind,name),key=`${wikiIdentityKey(kind,resolved.canonicalTitle||name)}|${purpose}|${purpose==='spawn-location'?contributionNameKey(zone):''}`,prior=registry.get(key);if(prior?.state==='submitted'&&['queued','partial'].includes(state))return;registry.delete(key);registry.set(key,{key,state,at:new Date(now()).toISOString()});while(registry.size>2000)registry.delete(registry.keys().next().value);}
    function suppression(rawKind,name,{zone='',purpose='missing-page'}={}){const kind=wikiEntityKind(rawKind),key=canonicalKey(kind,name,zone),resolved=resolver().resolve(kind,name),entityKey=wikiIdentityKey(kind,resolved.canonicalTitle||name),entry=registry.get(`${entityKey}|${purpose}|${purpose==='spawn-location'?contributionNameKey(zone):''}`),candidate=candidates.find(value=>value.kind===kind&&(value.key===key||value.aliasKeys?.includes(key)||wikiIdentityKey(kind,resolver().resolve(kind,value.name).canonicalTitle||value.name)===entityKey&&(kind==='item'||!zone||contributionNameKey(value.zone)===contributionNameKey(zone))));
        if(entityIgnored(kind,name))return {suppressed:true,reason:'ignored',permanent:true,candidateId:candidate?.id||null};
        const ignoredMatch=[...ignored].some(value=>value===key||value.startsWith(`${kind}|`)&&canonicalKey(kind,value.split('|')[1],kind==='item'?'':value.split('|')[2])===key);
        const sameEntity=value=>value.kind===kind&&wikiIdentityKey(kind,resolver().resolve(kind,value.name).canonicalTitle||value.name)===entityKey;
        const general=registry.get(`${entityKey}|missing-page|`),submitted=candidate?.status==='submitted'||general?.state==='submitted'||entry?.state==='submitted'||candidates.some(value=>value.status==='submitted'&&sameEntity(value)),ignoredState=general?.state==='ignored'||entry?.state==='ignored',queued=purpose==='spawn-location'?Boolean(candidate?.spawnRequest)||candidates.some(value=>value.spawnRequest&&sameEntity(value)):Boolean(candidate)||general?.state==='queued'||general?.state==='partial';
        return {suppressed:ignoredMatch||ignoredState||submitted||queued||Boolean(entry),reason:ignoredMatch||ignoredState?'ignored':submitted?'submitted':queued?'queued':entry?.state||null,candidateId:candidate?.id||null};}
    for(const candidate of candidates){const key=`${wikiIdentityKey(candidate.kind,resolver().resolve(candidate.kind,candidate.name).canonicalTitle||candidate.name)}|missing-page|`;if(!registry.has(key)){rememberState(candidate.kind,candidate.name,candidate.status==='submitted'?'submitted':candidate.status==='partial'?'partial':'queued');migrated=true;}}
    if(migrated&&!readBlocked)save();
    function rememberRelation(candidate,relation,observation){
        if(!relation||!['mob-zone','zone-population','zone-loot','drop-source','spawn-location'].includes(relation.type))return;
        const name=clean(relation.name),zone=clean(relation.zone);if(!name||!zone)return;
        const evidence=clean(relation.evidence,40),location=relation.type==='spawn-location'?relation.location:undefined;
        const item=relation.type==='drop-source'?itemIdentity(relation.item||observation?.subject?.kind==='item'&&observation.subject.name||'').name:'';
        const instance=['normal','raid'].includes(relation.instance)?relation.instance:'unknown';
        const normalized={type:relation.type,name,zone,instance,evidence,confirmed:false,...(item?{item}:{}),...(location?{location}: {})};
        const key=JSON.stringify([normalized.type,contributionNameKey(name),contributionNameKey(zone),instance,evidence,item,location]);
        candidate.relations??=[];let existing=candidate.relations.find(value=>JSON.stringify([value.type,contributionNameKey(value.name),contributionNameKey(value.zone),value.instance||'unknown',value.evidence,value.item||'',value.location])===key);
        const id=clean(relation.eventId||observation?.id),at=clean(relation.at||observation?.capturedAt,50);
        if(!existing){if(candidate.relations.length>=100){const index=candidate.relations.findIndex(value=>value.confirmed!==true);if(index<0)return;candidate.relations.splice(index,1);}existing={...normalized,firstAt:at,lastAt:at,evidenceIds:[]};candidate.relations.push(existing);}
        if(at){if(!existing.firstAt||at<existing.firstAt)existing.firstAt=at;if(!existing.lastAt||at>existing.lastAt)existing.lastAt=at;}
        existing.evidenceIds=Array.isArray(existing.evidenceIds)?existing.evidenceIds:[];
        if(id&&!existing.evidenceIds.includes(id))existing.evidenceIds=[...existing.evidenceIds,id].slice(-8);
    }
    function add({kind,name,zone='',instance='unknown',fields={},evidence=null,relations=[]},force=false){
        name=clean(name);if(!['item','npc','zone'].includes(kind)||!name)return null;
        const observedName=name,identity=kind==='item'?itemIdentity(name):{name,tier:null};name=identity.name;
        if(entityIgnored(kind,name))return null;
        if(identity.tier!==null){fields={...fields,...(!Object.hasOwn(fields,'tier')?{tier:identity.tier}:{})};if(!evidence)evidence={id:`item-name-${contributionSourceToken(observedName)}`,kind:'observed-name',capturedAt:new Date(now()).toISOString(),evidence:{text:`Observed item name: ${observedName}\nExact base identity: ${name}\nObserved tier decoration: +${identity.tier}`}};}
        const resolved=resolver().resolve(kind,name),key=canonicalKey(kind,name,zone),legacyKey=`${kind}|${contributionNameKey(observedName)}|${contributionNameKey(zone)}`;
        const present=resolved.membership;
        const matchingIgnores=[...ignored].filter(value=>value===key||value.startsWith(`${kind}|`)&&canonicalKey(kind,value.split('|')[1],kind==='item'?'':value.split('|')[2])===key);
        if(matchingIgnores.length&&!force)return null;if(force)for(const value of matchingIgnores)ignored.delete(value);
        let candidate=candidates.find(c=>c.key===key||c.aliasKeys?.includes(key));
        if(!force&&!candidate&&['submitted','ignored'].includes(suppression(kind,name,{zone}).reason))return null;
        const classified=contributionReasons({...candidate,kind,name,zone,instance,...(force?{manual:true}:{}),fields:{...candidate?.fields,...Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,{value}]))},relations:[...(candidate?.relations||[]),...relations]},resolver(),{pack:pack()});
        if(classified.excluded==='owned-pet'||classified.excluded&&!force)return null;
        if(present==='present'&&!classified.reasons.length&&!force&&!candidate)return null;
        if(!candidate){if(candidates.length>=200){onWarning('The contribution queue is full. Review or remove a draft to save another discovery.');return null;}candidate={id:`contribution-${++sequence}`,key,aliasKeys:[],kind,name:resolved.canonicalTitle||name,title:resolved.canonicalTitle||name,zone:clean(zone),instance:['normal','raid'].includes(instance)?instance:'unknown',era:'',playerText:'',fields:{},sources:[],relations:[],evidence:[],status:'needs-review',membership:present};candidates.push(candidate);}
        if(force)candidate.manual=true;
        if(kind==='item'){if(!candidate.zone&&zone)candidate.zone=clean(zone);if(legacyKey!==key)candidate.aliasKeys=[...new Set([...(candidate.aliasKeys||[]),legacyKey])].slice(-8);}
        candidate.membership=present;candidate.canonicalTitle=resolved.canonicalTitle;candidate.revisionId=resolved.record?.revisionId||null;candidate.reasons=classified.reasons.length?classified.reasons:force?['manual-review']:[];if(candidate.intent===undefined||!protectedDraft(candidate))candidate.intent=present==='present'?'update':present==='missing'?'create':'review';
        for(const [key,raw] of Object.entries(fields||{}).slice(0,80)){if(!validField(key))continue;let value=fieldValue(raw);
            if(candidate.fields[key]?.edited===true)continue;
            if(['knownLoot','knownNPCs'].includes(key)&&Array.isArray(value)){const previous=Array.isArray(candidate.fields[key]?.value)?candidate.fields[key].value:[],combined=[...new Map([...previous,...value].map(item=>[contributionNameKey(item),item])).values()].slice(0,100);if(JSON.stringify(combined)!==JSON.stringify(previous))candidate.fields[key]={...candidate.fields[key],value:combined,confirmed:false};}
            else if(!candidate.fields[key]?.confirmed&&!(key==='level'&&candidate.fields[key]?.edited===true))candidate.fields[key]={...candidate.fields[key],value,confirmed:false};}
        if(evidence?.levelEvidence&&Object.hasOwn(fields,'level')&&candidate.fields.level?.confirmed!==true&&candidate.fields.level?.edited!==true)candidate.fields.level={...candidate.fields.level,source:'same-zone-consider',provenance:structuredClone(evidence.levelEvidence)};
        if(evidence&&!candidate.evidence.some(e=>e.id===evidence.id)){const text=evidence.evidence?.text||(evidence.kind==='game-log'?`Observed ${clean(evidence.subject?.kind)}: ${clean(evidence.subject?.name)}${(Array.isArray(evidence.relations)?evidence.relations:[]).filter(relation=>relation.type==='drop-source').map(relation=>`\nReported source: ${clean(relation.name)} in ${clean(relation.zone)} (${clean(relation.evidence)})`).join('')}`:'');candidate.evidence.push({id:clean(evidence.id),at:clean(evidence.capturedAt),kind:clean(evidence.kind),text:clean(text,6000),...(evidence.kind==='game-log'?{event:clean(evidence.input?.event,40),logLine:contributionLogLine(evidence.evidence?.logLine)}:{}),confidence:Math.min(100,Number(evidence.confidence??evidence.fields?.[0]?.confidence)||0)});const logProof=candidate.evidence.findLast(entry=>entry.kind==='game-log');candidate.evidence=candidate.evidence.slice(-6);if(logProof&&!candidate.evidence.some(entry=>entry.kind==='game-log'))candidate.evidence=[logProof,...candidate.evidence.slice(-5)];}
        for(const relation of (Array.isArray(relations)?relations:[]).filter(r=>r?.type==='drop-source'))if(!candidate.sources.some(s=>contributionNameKey(s.npc)===contributionNameKey(relation.name)&&contributionNameKey(s.zone)===contributionNameKey(relation.zone)&&s.sourceEvidence===relation.evidence&&(s.instance||'unknown')===(relation.instance||'unknown')))candidate.sources.push({npc:clean(relation.name),zone:clean(relation.zone),instance:relation.instance||'unknown',confirmed:false,sourceEvidence:clean(relation.evidence)});
        for(const relation of (Array.isArray(relations)?relations:[]).slice(0,100))rememberRelation(candidate,relation,evidence);
        if(kind==='item'&&evidence)collectTierZeroEvidence(candidate,evidence,{now:now()});
        if(candidate.tierZeroEvidence?.length&&!candidate.baseVerification)candidate.reasons=[...new Set([...candidate.reasons,'tier0-verification'])];
        rememberState(kind,candidate.name,candidate.status==='submitted'?'submitted':candidate.status==='partial'?'partial':'queued');
        save();return structuredClone(candidate);
    }
    function consume(observation){
        cursor=Math.max(cursor,Number(observation?.sequence)||0);
        const kind=observation?.subject?.kind==='monster'?'npc':observation?.subject?.kind;
        if(observation?.owner==='character'||!['item','npc','zone'].includes(kind)){save();return null;}
        if(entityIgnored(kind,observation.subject.name)){save();return null;}
        if(['ocr','manual','screen-read'].includes(observation.kind)){
            // Images can enrich an existing item, never manufacture discovery
            // identities, monster/zone tasks or loot-source relationships.
            const key=canonicalKey('item',observation.subject.name);
            if(kind!=='item'||!candidates.some(candidate=>candidate.kind==='item'&&(candidate.key===key||candidate.aliasKeys?.includes(key)))){save();return null;}
            observation={...observation,input:{...observation.input,zone:''},relations:[],fields:(observation.fields||[]).filter(field=>!['knownNPCs','knownLoot'].includes(field.key))};
        }
        // Persisted journal replay follows the same rule as fresh parsing.
        // Considers still drive Intel, but never create verification work.
        if(observation.kind==='game-log'&&(observation.input?.event==='consider'||kind==='npc'&&observation.input?.event!=='kill')){save();return null;}
        if(kind==='npc'&&!classifyNpcEvidence(observation.subject.name,resolver().resolve(kind,observation.subject.name)).eligible){save();return null;}
        const fields=Object.fromEntries((observation.fields||[]).filter(f=>f.key!=='name').map(f=>[f.key,f.value]));
        if(Array.isArray(fields.knownNPCs))fields.knownNPCs=fields.knownNPCs.filter(name=>!entityIgnored('npc',name)&&classifyNpcEvidence(name,resolver().resolve('npc',name)).eligible);
        if(Array.isArray(fields.knownLoot))fields.knownLoot=fields.knownLoot.filter(name=>!entityIgnored('item',name));
        const itemName=kind==='item'?itemIdentity(observation.subject.name).name:null;
        const zone=observation.input?.zone||'',instance=observation.input?.instance||'unknown',relations=[...(observation.relations||[])].filter(relation=>relation.type==='zone-loot'?!entityIgnored('item',relation.name):!['drop-source','mob-zone','zone-population'].includes(relation.type)||!entityIgnored('npc',relation.name)&&classifyNpcEvidence(relation.name,resolver().resolve('npc',relation.name)).eligible).map(relation=>relation.type==='zone-loot'?{...relation,name:itemIdentity(relation.name).name}:relation);
        // Older game-log journal records predate explicit relationship entries.
        // Replay the same observed associations, without promoting them to facts.
        if(observation.kind==='game-log'&&zone){
            if(kind==='npc'){for(const type of ['mob-zone','zone-population'])if(!relations.some(value=>value.type===type))relations.push({type,name:observation.subject.name,zone,evidence:observation.input?.event||'observed'});}
            if(kind==='item'&&!relations.some(value=>value.type==='zone-loot'))relations.push({type:'zone-loot',name:itemName,zone,evidence:'loot'});
        }
        const result=add({kind,name:observation.subject.name,zone,instance,fields,evidence:observation,relations});
        let relatedCandidate=null;
        if(kind==='item')for(const relation of relations.filter(relation=>relation.type==='drop-source'&&relation.evidence==='explicit-corpse'&&relation.name&&relation.zone)){
            const npcRelations=[{type:'mob-zone',name:relation.name,zone:relation.zone,instance,evidence:'explicit-corpse'},{type:'zone-population',name:relation.name,zone:relation.zone,instance,evidence:'explicit-corpse'}];
            const proposal=add({kind:'npc',name:relation.name,zone:relation.zone,instance,fields:{knownLoot:[itemName]},evidence:observation,relations:npcRelations});
            if(proposal)relatedCandidate=proposal;
        }
        if(zone){
            const population=relations.filter(value=>value.type==='zone-population').map(value=>value.name),loot=relations.filter(value=>value.type==='zone-loot').map(value=>value.name);
            const zoneFields={...(population.length?{knownNPCs:population}:{}),...(loot.length?{knownLoot:loot}:{})};
            if(kind!=='zone'&&(population.length||loot.length)){const proposal=add({kind:'zone',name:zone,zone,instance,fields:zoneFields,evidence:observation,relations});if(proposal)relatedCandidate??=proposal;}
        }
        save();return result||relatedCandidate;
    }
    function consumeLog(event,context={}){
        if(event?.type==='kill'&&entityIgnored('npc',event.victim)||['loot','item-link'].includes(event?.type)&&entityIgnored('item',itemExaltationBaseIdentity(event.item)))return {candidate:null,prompt:null,locationCaptured:null};
        if(event?.type==='item-links'){
            const linked=[];
            for(const item of (Array.isArray(event.items)?event.items:[]).slice(0,8))if(typeof item==='string'&&item.length<=230){
                const result=consumeLog({...event,type:'item-link',item},context);
                if(result.candidate&&!linked.some(candidate=>candidate.id===result.candidate.id))linked.push(result.candidate);
            }
            return {candidate:linked[0]||null,candidates:linked,prompt:null,locationCaptured:null};
        }
        if(event?.type==='item-link'&&(typeof event.item!=='string'||resolver().resolve('item',itemExaltationBaseIdentity(event.item)).membership!=='missing'))return {candidate:null,prompt:null,locationCaptured:null};
        const observation=logContributionObservation(event,context,{now:now()});
        if(!observation)return {candidate:null,prompt:null,locationCaptured:null};
        const at=Date.parse(observation.capturedAt),source=observation.input.logId,zone=event.type==='item-link'?clean(context.zone):observation.input.zone;
        if(armed&&(!spawnEligible(candidates.find(candidate=>candidate.id===armed.candidateId))||armed.source!==source||contributionNameKey(armed.zone)!==contributionNameKey(zone)||!armed.persistent&&now()>armed.expiresAt))armed=null;
        if(lastLog?.source===source&&at<lastLog.at)return {candidate:null,prompt:null,locationCaptured:null};
        lastLog={source,zone,at,cursor:observation.input.cursor};
        if(seenLogIds.has(observation.id))return {candidate:null,prompt:null,locationCaptured:null};
        seenLogIds.add(observation.id);while(seenLogIds.size>2000)seenLogIds.delete(seenLogIds.values().next().value);
        if(event.type==='location'){
            const pending=armed;
            const afterBoundary=pending&&at>=Math.floor(pending.armedAt/1000)*1000&&(Number.isSafeInteger(pending.cursor)&&Number.isSafeInteger(observation.input.cursor)?observation.input.cursor>pending.cursor:at>=pending.armedAt);
            const candidate=pending&&candidates.find(value=>value.id===pending.candidateId&&value.kind==='npc'&&contributionNameKey(value.zone)===contributionNameKey(zone));
            if(!candidate||!afterBoundary){save();return {candidate:null,prompt:null,locationCaptured:null};}
            armed=null;const location=observation.location,display=[location.y,location.x,location.z].join(', ');
            const evidence={...observation,subject:{kind:'monster',name:candidate.name},evidence:{text:`Player requested the next /loc for ${candidate.name} in ${zone}: ${display}. Spawn location still requires review.`,logLine:observation.evidence.logLine}};
            const updated=add({kind:'npc',name:candidate.name,zone,fields:{location:display},evidence,relations:[{type:'spawn-location',name:candidate.name,zone,evidence:'player-requested-next-loc',location,eventId:observation.id,at:observation.capturedAt}]});
            candidate.spawnRequest={...candidate.spawnRequest,status:'captured',capturedAt:observation.capturedAt,evidenceId:observation.id};save();
            return {candidate:updated?structuredClone(candidate):null,prompt:null,locationCaptured:{candidateId:candidate.id,name:candidate.name,zone,location,display}};
        }
        const candidate=consume(observation);let prompt=null;
        if(event.type==='kill'&&classifyNpcEvidence(observation.subject.name,resolver().resolve('npc',observation.subject.name)).eligible){
            const target=candidates.find(value=>value.kind==='npc'&&value.key===canonicalKey('npc',observation.subject.name,zone));
            if(target&&zone&&!target.spawnRequest&&target.fields.location?.confirmed!==true&&target.membership==='missing'&&!suppression('npc',target.name,{zone,purpose:'spawn-location'}).suppressed){
                target.spawnRequest={status:'requested',requestedAt:observation.capturedAt,evidenceId:observation.id};const result=armSpawnLocation(target.id);if(result.ok){prompt={candidateId:target.id,name:target.name,zone,spawnEvidenceId:observation.id,armed:true,expiresAt:result.expiresAt,...(target.fields.notable?.confirmed===true&&typeof target.fields.notable.value==='boolean'?{notable:target.fields.notable.value}:{})};rememberState('npc',target.name,'notified','spawn-location',zone);}save();
            }
        }
        return {candidate:prompt?structuredClone(candidates.find(value=>value.id===prompt.candidateId)):candidate,prompt,locationCaptured:null};
    }
    function armSpawnLocation(candidateId,{persistent=false}={}){const candidate=candidates.find(value=>value.id===candidateId&&value.kind==='npc');if(candidate&&!spawnEligible(candidate))return {ok:false,error:'Pets do not have wiki spawn locations.'};if(!candidate||!lastLog?.zone||contributionNameKey(candidate.zone)!==contributionNameKey(lastLog.zone))return {ok:false,error:'Return to the monster’s zone before recording its spawn location.'};const armedAt=now();armed={candidateId,source:lastLog.source,zone:lastLog.zone,cursor:lastLog.cursor,armedAt,expiresAt:persistent===true?null:armedAt+300000,...(persistent===true?{persistent:true}:{})};return {ok:true,candidateId,name:candidate.name,zone:candidate.zone,expiresAt:armed.expiresAt,...(persistent===true?{persistent:true}:{})};}
    function reconcile({apply=false}={}){
        if(apply&&readBlocked)return {version:1,applied:false,changed:false,rows:[],active:candidates.length,archived:archive.length,blocked:true,persisted:false,error:'The preserved queue must be recovered before reconciliation.'};
        const rows=[],seen=new Map(),before=apply?{candidates:structuredClone(candidates),archive:structuredClone(archive),armed:structuredClone(armed)}:null;let changed=false;
        for(const candidate of [...candidates]){
            const passive=passiveFacts(candidate),reviewCandidate=passive&&!passive.archive?{...candidate,fields:passive.fields,relations:passive.relations}:candidate;
            const classification=contributionReasons(reviewCandidate,resolver(),{pack:pack()}),resolved=classification.resolved,key=canonicalKey(candidate.kind,candidate.name,candidate.zone),protectedWork=protectedDraft(candidate),prior=seen.get(key),realGap=classification.reasons.some(reason=>['missing-source','missing-population','tier0-verification','identity-review'].includes(reason)),conflict=prior&&Object.entries(candidate.fields||{}).some(([field,value])=>prior.fields?.[field]&&!['knownLoot','knownNPCs'].includes(field)&&JSON.stringify(prior.fields[field].value)!==JSON.stringify(value.value)),duplicate=prior&&!protectedWork&&!protectedDraft(prior)&&!realGap&&!conflict;
            if(!prior)seen.set(key,candidate);
            const obsolete=passive?.archive?'passive-monster-observation':classification.excluded||(resolved.membership==='present'&&!classification.reasons.length?'known-complete':duplicate?'duplicate':null);
            const reason=protectedWork?'protected-work':prior&&conflict?'duplicate-conflict':obsolete||(passive?'passive-monster-observation':classification.reasons[0]||'unresolved'),action=obsolete&&!protectedWork&&archive.length<200?'archive':passive&&!passive.archive&&archive.length<200?'prune-passive-observations':'keep';
            rows.push({id:candidate.id,name:candidate.name,kind:candidate.kind,classification:reason,reasons:classification.reasons,action,canonicalTitle:resolved.canonicalTitle,membership:resolved.membership,...(prior?{duplicateOf:prior.id}:{})});
            if(!apply)continue;
            if(action==='archive'){
                if(obsolete==='duplicate'){
                    for(const [field,value]of Object.entries(candidate.fields||{})){if(!prior.fields[field])prior.fields[field]=structuredClone(value);else if(['knownLoot','knownNPCs'].includes(field))prior.fields[field].value=[...new Set([...(prior.fields[field].value||[]),...(value.value||[])])].slice(0,100);}
                    prior.aliasKeys=[...new Set([...(prior.aliasKeys||[]),candidate.key,...(candidate.aliasKeys||[])])].slice(-8);
                    for(const field of ['sources','relations','evidence'])prior[field]=[...new Map([...(prior[field]||[]),...(candidate[field]||[])].map(value=>[field==='evidence'?value.id:JSON.stringify(value),value])).values()].slice(field==='evidence'?-6:-100);
                }
                archive.push({...structuredClone(candidate),archive:{version:1,reason:obsolete,at:new Date(now()).toISOString()}});candidates=candidates.filter(value=>value.id!==candidate.id);if(armed?.candidateId===candidate.id)armed=null;changed=true;
            }else{
                if(action==='prune-passive-observations'){
                    archive.push({...structuredClone(candidate),archive:{version:1,reason:'passive-monster-observation',at:new Date(now()).toISOString()}});
                    candidate.fields=passive.fields;candidate.relations=passive.relations;changed=true;
                }
                const knownTarget=resolved.membership==='present'&&[resolved.canonicalTitle,candidate.name].some(title=>contributionNameKey(title)===contributionNameKey(candidate.title||candidate.name));
                const patch={membership:resolved.membership,canonicalTitle:resolved.canonicalTitle,revisionId:resolved.record?.revisionId||null,reasons:classification.reasons,...(knownTarget?{intent:'update'}:protectedWork||candidate.matchesReviewed===true?{}:{intent:resolved.membership==='present'?'update':resolved.membership==='missing'?'create':'review'})};
                if(Object.entries(patch).some(([key,value])=>JSON.stringify(candidate[key])!==JSON.stringify(value))){Object.assign(candidate,patch);changed=true;}
            }
        }
        const persisted=!changed||save();if(apply&&!persisted){candidates=before.candidates;archive=before.archive;armed=before.armed;}
        return {version:1,applied:apply&&persisted,changed:changed&&persisted,rows,active:candidates.length,archived:archive.length,blocked:readBlocked,persisted,...(!persisted?{error:'Reconciliation could not be saved; the active queue was retained.'}:{})};
    }
    function ensureReconciled(){const current=resolver();if(autoReconcile&&lastReconciled!==current){lastReconciled=current;return reconcile({apply:true});}return null;}
    ensureReconciled();
    return{
        snapshot:()=>{ensureReconciled();return structuredClone(candidates);},cursor:()=>cursor,archived:()=>structuredClone(archive),reconcile,suppression,refreshCatalog:ensureReconciled,
        sourceReceiptKeys:()=>[...automaticSourceReceipts],
        sourceDecisionKeys:()=>{const version=String(pack().meta?.version||pack().meta?.manifestVersion||'');return[...new Set([...automaticSourceReceipts,...automaticSourceDecisions.filter(entry=>String(entry.datasetVersion||'')===version).map(entry=>entry.key)])];},
        recordAutomaticSourceDecision(result){
            if(readBlocked||result?.schemaVersion!==1||result.status!=='quiet'||!['covered','routine'].includes(result.decision))return false;
            const key=automaticSourceReceiptKey(result,{resolver:resolver()});if(!key)return false;
            const before=automaticSourceDecisions;
            const proofs=(Array.isArray(result.proofs)?result.proofs:[]).slice(0,8).map(proof=>({wikiTitle:clean(proof.wikiTitle),revisionId:Number.isSafeInteger(proof.revisionId)&&proof.revisionId>0?proof.revisionId:null,field:clean(proof.field,80),...(proof.setTitle?{setTitle:clean(proof.setTitle)}:{})}));
            automaticSourceDecisions=[...before.filter(entry=>entry.key!==key),{key,decision:result.decision,reason:clean(result.reason,120),datasetVersion:clean(result.datasetVersion,120),proofs,at:new Date(now()).toISOString()}].slice(-500);
            if(!save()){automaticSourceDecisions=before;return false;}return true;
        },
        recordAutomaticSourceReceipt(result){
            if(result?.status!=='submitted')return false;
            const key=automaticSourceReceiptKey(result,{resolver:resolver()});if(!key)return false;
            automaticSourceReceipts=[...automaticSourceReceipts.filter(value=>value!==key),key].slice(-500);save();return true;
        },
        spawnStatus(){if(armed&&(!spawnEligible(candidates.find(candidate=>candidate.id===armed.candidateId))||!armed.persistent&&now()>armed.expiresAt))armed=null;return armed?{...armed}:null;},
        tierZeroReview(id,options={}){return tierZeroVerificationPreview(candidates.find(value=>value.id===id),{...options,now:now()});},
        confirmTierZero(id,options={}){const candidate=candidates.find(value=>value.id===id);if(!candidate)throw Error('This contribution no longer exists.');const patch=confirmTierZeroVerification(candidate,{...options,now:now()});Object.assign(candidate,patch);candidate.planId=null;candidate.status='needs-review';candidate.reasons=contributionReasons(candidate,resolver(),{pack:pack()}).reasons;save();return structuredClone(candidate);},
        add,consume,consumeLog,
        sourceItemHints(candidate){
            if(candidate?.kind!=='npc'||!candidate.zone||!['normal','raid'].includes(candidate.instance))return [];
            const names=new Set([candidate.name,candidate.title].filter(Boolean).map(name=>contributionNameKey(resolver().resolve('npc',name).canonicalTitle||name))),zone=contributionNameKey(candidate.zone),titles=new Map();
            for(const item of [...candidates,...archive]){
                if(item.kind!=='item')continue;
                const matches=(Array.isArray(item.sources)?item.sources:[]).slice(0,30).some(source=>source?.npc&&source.zone&&names.has(contributionNameKey(resolver().resolve('npc',source.npc).canonicalTitle||source.npc))&&contributionNameKey(source.zone)===zone&&source.instance===candidate.instance&&(source.confirmed===true||source.edited!==true&&source.sourceEvidence==='explicit-corpse'));
                if(matches){const title=clean(item.title||item.name,230);if(title)titles.set(contributionNameKey(title),title);}
                if(titles.size>=100)break;
            }
            // Hints bridge indexing delays; the host must verify the published
            // item source before adding any loot to a reviewed monster plan.
            return [...titles.values()];
        },
        armSpawnLocation,
        setNpcNotable(request={}){
            const candidate=candidates.find(value=>value.id===request.candidateId&&value.kind==='npc');
            const current=candidate?.fields.notable?.confirmed===true&&typeof candidate.fields.notable.value==='boolean'?candidate.fields.notable.value:null;
            const fail=error=>({ok:false,error,...(current!==null?{notable:current}:{})});
            if(readBlocked)return fail('The preserved contribution queue must be recovered before saving this choice.');
            if(typeof request.notable!=='boolean'||!candidate||!spawnEligible(candidate)||request.id!=='spawn-'+candidate.id||!request.spawnEvidenceId||request.spawnEvidenceId!==candidate.spawnRequest?.evidenceId||contributionNameKey(request.name)!==contributionNameKey(candidate.name)||contributionNameKey(request.zone)!==contributionNameKey(candidate.zone))return fail('This notable choice no longer matches its monster draft.');
            if(candidate.planId||['submitted','partial'].includes(candidate.status))return fail('Open this draft in Contribute to revise its saved review.');
            if((typeof request.previousNotable==='boolean'?request.previousNotable:null)!==current)return fail('The notable choice changed in Contribute. Review the current draft.');
            const before={fields:candidate.fields,status:candidate.status,matchesReviewed:candidate.matchesReviewed};
            candidate.fields={...candidate.fields,notable:{value:request.notable,confirmed:true,edited:true,source:'player'}};candidate.status='needs-review';candidate.matchesReviewed=false;
            if(!save()){Object.assign(candidate,before);return fail('The notable choice could not be saved. Review it in Contribute.');}
            return{ok:true,notable:request.notable,candidate:structuredClone(candidate)};
        },
        cancelSpawnLocation(){armed=null;},
        update(id,patch){const candidate=candidates.find(c=>c.id===id);if(!candidate)return null;const attachment=Object.hasOwn(patch,'attachment')?attachmentValue(patch.attachment):undefined;const priorKey=candidate.key,priorTitle=contributionNameKey(candidate.title);for(const key of ['name','title','zone','instance','era','playerText','fields','sources','relations','status','matchesReviewed','planId','baseRecovery'])if(Object.hasOwn(patch,key))candidate[key]=structuredClone(patch[key]);if(Object.hasOwn(patch,'intent')&&['create','update','review'].includes(patch.intent))candidate.intent=patch.intent;
            if(Object.hasOwn(patch,'attachment'))candidate.attachment=attachment;
            candidate.key=canonicalKey(candidate.kind,candidate.name,candidate.zone);if(priorKey!==candidate.key)candidate.aliasKeys=[...new Set([...(candidate.aliasKeys||[]),priorKey])].slice(-8);if(armed?.candidateId===id&&(priorKey!==candidate.key||priorTitle!==contributionNameKey(candidate.title)))armed=null;rememberState(candidate.kind,candidate.name,candidate.status==='submitted'?'submitted':candidate.status==='partial'?'partial':'queued');save();return structuredClone(candidate);},
        remove(id){const candidate=candidates.find(c=>c.id===id);if(candidate){for(const key of [candidate.key,...(candidate.aliasKeys||[])])ignored.add(key);rememberState(candidate.kind,candidate.name,'ignored');rememberState(candidate.kind,candidate.name,'ignored','spawn-location',candidate.zone);}while(ignored.size>2000)ignored.delete(ignored.values().next().value);candidates=candidates.filter(c=>c.id!==id);if(armed?.candidateId===id)armed=null;save();},
        suppress(kind,name,{zone='',purpose='missing-page',state='ignored'}={}){rememberState(wikiEntityKind(kind),name,state,purpose,zone);save();},
        matches(candidate){const current=pack(),entries=candidate.kind==='item'?current.items:candidate.kind==='npc'?current.npcs:current.zones;return findPotentialMatches(candidate.title||candidate.name,entries||[]);}
    };
}
