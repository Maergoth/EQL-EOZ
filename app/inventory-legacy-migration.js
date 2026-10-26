// Lossless schema-1 extraction for the one-time native inventory migration.
// This deliberately does not invoke Character normalizers or their old slices.
// The host owns private source backups, stable source hashes and transactions.
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const parse=(value,label)=>{
    if(typeof value==='string'){try{return JSON.parse(value);}catch{throw Error(`The legacy ${label} is not valid JSON; no migration was activated.`);}}
    return value;
};
const kinds=Object.freeze({candidate:'candidates','candidate-id':'candidateIds',keyring:'keyring',rejected:'rejectedItems'});

/** raw is one complete model object or its original JSON string. flow remains
 * byte-for-byte the supplied walkthrough string/object; callers preserve the
 * enclosing roster's unknown fields separately. Records are lazy references:
 * serialize/store each one before advancing; do not collect all in a new list.
 */
export function decomposeLegacyProfile(raw,{profileId,flow=null}={}){
    if(typeof profileId!=='string'||!profileId||profileId.length>160)throw Error('A stable legacy profile ID is required.');
    const model=parse(raw,'character model');
    if(model===null||model===undefined)return {profileId,core:model??null,flow,counts:{candidates:0,candidateIds:0,keyring:0,rejectedItems:0},records:function*(){}};
    if(!object(model)||model.schemaVersion!==1)throw Error('An unsupported legacy character model cannot be migrated without its original data.');
    if(own(model,'candidates')&&!Array.isArray(model.candidates))throw Error('The legacy candidate list is malformed; no migration was activated.');
    const sourceExport=object(model.inventoryExport)?model.inventoryExport:null;
    for(const key of ['candidateIds','keyring','rejectedItems'])if(sourceExport&&own(sourceExport,key)&&!Array.isArray(sourceExport[key]))throw Error('The legacy inventory export lists are malformed; no migration was activated.');
    const core={...model},counts={candidates:model.candidates?.length||0,candidateIds:sourceExport?.candidateIds?.length||0,keyring:sourceExport?.keyring?.length||0,rejectedItems:sourceExport?.rejectedItems?.length||0};
    if(own(model,'candidates'))core.candidates=[];
    if(sourceExport){
        core.inventoryExport={...sourceExport};
        for(const key of ['candidateIds','keyring','rejectedItems'])if(own(sourceExport,key))core.inventoryExport[key]=[];
    }
    function* records(){
        for(let ordinal=0;ordinal<(model.candidates?.length||0);ordinal++)yield {kind:'candidate',ordinal,value:model.candidates[ordinal]};
        for(const [kind,key]of Object.entries(kinds)){
            if(kind==='candidate')continue;
            const list=sourceExport?.[key];
            for(let ordinal=0;ordinal<(list?.length||0);ordinal++)yield {kind,ordinal,value:list[ordinal]};
        }
    }
    return {profileId,core,flow,counts,records};
}

/** A roster is authoritative for its registered profiles and unregistered
 * draft. Preserve its outer fields and the independent active mirror as raw
 * migration metadata; never import that mirror as a second physical profile.
 * No roster/model schema field or arbitrary record is silently discarded.
 */
export function decomposeLegacyRoster(raw,{fallbackModel=null,fallbackFlow=null,draftId='draft'}={}){
    const roster=parse(raw,'profile roster');
    if(roster===null||roster===undefined){
        const draft=decomposeLegacyProfile(fallbackModel,{profileId:draftId,flow:fallbackFlow});
        return {roster:null,activeMirror:{model:fallbackModel,flow:fallbackFlow},profiles:function*(){yield {id:draftId,name:'',server:'',draft:true,...draft};}};
    }
    if(!object(roster)||roster.schemaVersion!==1||!Array.isArray(roster.profiles)||roster.draft!==undefined&&!object(roster.draft))throw Error('The legacy profile roster is malformed; no migration was activated.');
    const ids=new Set([draftId]);
    for(const profile of roster.profiles){
        if(!object(profile)||typeof profile.id!=='string'||!profile.id||profile.id.length>160||ids.has(profile.id))throw Error('The legacy profile roster has ambiguous profile IDs; no migration was activated.');
        ids.add(profile.id);
    }
    function* profiles(){
        const draft=roster.draft||{};
        yield {...draft,id:draftId,name:'',server:'',draft:true,legacyMetadata:draft,...decomposeLegacyProfile(draft.model,{profileId:draftId,flow:draft.walkthrough??null})};
        for(const profile of roster.profiles)yield {...profile,draft:false,legacyMetadata:profile,...decomposeLegacyProfile(profile.model,{profileId:profile.id,flow:profile.walkthrough??null})};
    }
    return {roster,activeMirror:{model:fallbackModel,flow:fallbackFlow},profiles};
}

/** Native schema-1 character-storage.json envelope adapter. Other keys (for
 * example contribution drafts) and unknown outer fields remain exact values.
 * The host saves the original bytes separately before using this extraction.
 */
export function decomposeLegacyCharacterStorage(raw){
    const envelope=parse(raw,'storage envelope');
    if(!object(envelope)||envelope.schemaVersion!==1||!object(envelope.values))throw Error('The legacy Character storage envelope is malformed; no migration was activated.');
    const modelKey='eql-eye-of-zomm-character-v1',flowKey='eql-eye-of-zomm-character-walkthrough-v1',rosterKey='eql-eye-of-zomm-character-profiles-v1';
    const decomposition=decomposeLegacyRoster(envelope.values[rosterKey],{fallbackModel:envelope.values[modelKey]??null,fallbackFlow:envelope.values[flowKey]??null});
    const outerFields={...envelope,values:{...envelope.values}};
    for(const key of [modelKey,flowKey,rosterKey])delete outerFields.values[key];
    const sourceFields={};for(const key of [modelKey,flowKey,rosterKey])if(own(envelope.values,key))sourceFields[key]=envelope.values[key];
    return {...decomposition,outerFields,sourceFields,activeProfileId:decomposition.roster?.activeId??null,profileCount:(decomposition.roster?.profiles.length||0)+1};
}

/** Reconstruction is for migration verification/recovery only. It requires
 * contiguous per-kind ordinals, preserving duplicates/order/unknown fields.
 */
export function reconstructLegacyProfile(core,records,{counts}={}){
    if(core===null||core===undefined){for(const unused of records)throw Error('An empty legacy model cannot contain records.');return core??null;}
    const model={...core},exported=object(core.inventoryExport)?{...core.inventoryExport}:null;
    if(own(core,'candidates'))model.candidates=[];
    if(exported){model.inventoryExport=exported;for(const key of ['candidateIds','keyring','rejectedItems'])if(own(exported,key))exported[key]=[];}
    for(const record of records){
        const key=kinds[record?.kind],target=record?.kind==='candidate'?model:exported;
        if(!key||!target||!Array.isArray(target[key])||record.ordinal!==target[key].length)throw Error('Legacy migration records are incomplete or out of order.');
        target[key].push(record.value);
    }
    if(counts)for(const [kind,key]of Object.entries(kinds)){
        const target=kind==='candidate'?model:exported;
        if((target?.[key]?.length||0)!==counts[key])throw Error('Legacy migration record counts do not match.');
    }
    return model;
}

/** Hash each serialized record separately so proof generation has bounded
 * scratch space. The injected async SHA-256 callback receives Uint8Array and
 * returns a hex string. Rolling framed digests bind kind, ordinal and value;
 * sourceBytesSha256 must separately be recorded from the unchanged legacy file.
 */
export async function legacyInventoryProof(decomposed,{hashBytes}={}){
    const digest=hashBytes|| (async bytes=>{
        if(!globalThis.crypto?.subtle)throw Error('SHA-256 is required for migration verification.');
        const result=await globalThis.crypto.subtle.digest('SHA-256',bytes);
        return Array.from(new Uint8Array(result),byte=>byte.toString(16).padStart(2,'0')).join('');
    });
    const encode=new TextEncoder();
    const hash=async text=>{
        const value=await digest(encode.encode(text));
        if(typeof value!=='string'||!/^[a-f0-9]{64}$/iu.test(value))throw Error('Migration SHA-256 proof is invalid.');
        return value.toLowerCase();
    };
    let chain=await hash(JSON.stringify({profileId:decomposed.profileId,core:decomposed.core,flow:decomposed.flow})),recordCount=0,recordBytes=0;
    const counts={candidates:0,candidateIds:0,keyring:0,rejectedItems:0};
    for(const record of decomposed.records()){
        const key=kinds[record.kind];if(!key||record.ordinal!==counts[key]++)throw Error('Legacy migration record order is invalid.');
        const json=JSON.stringify(record),bytes=encode.encode(json);
        recordCount++;recordBytes+=bytes.length;
        chain=await hash(JSON.stringify([chain,record.kind,record.ordinal,await hash(json)]));
    }
    for(const [key,count]of Object.entries(counts))if(count!==decomposed.counts[key])throw Error('Legacy migration record counts do not match.');
    return {schemaVersion:1,profileId:decomposed.profileId,counts,recordCount,recordBytes,sha256:chain};
}
