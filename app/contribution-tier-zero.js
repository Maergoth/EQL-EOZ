// An independent tier-zero observation can confirm an inference only after an
// explicit review. Old inferred fields/text are never silently relabelled.
import { ITEM_RECOVERY_FIELDS, itemRecoveryFingerprint, itemRecoverySource, itemRecoveryLabel, isItemNumericStatLine } from './item-base-review.js';
import { normalizeWikiIdentity, itemBaseIdentity } from './wiki-identity.js';
import { parseItemStatBlock } from './screen-read-parser.js';
export const TIER_ZERO_VERIFICATION_CATEGORY='Tier 0 verification needed';
export const TIER_ZERO_CATEGORY_MARKER='<!-- EoZ: tier-zero verification category -->';
// These two exact app-authored warnings are the only prose cleared when an
// independent reviewed tier-zero reading replaces recovered base statistics.
export const tierZeroRecoveryNoteMatches=source=>[...String(source||'').matchAll(/These stats are reverse calculated from a tier\s+(?:10|[0-9])\s+item\.\s*Please confirm with a tier 0 item and remove this message\.?|Base statistics were proposed by reversing a reviewed tier\s+(?:10|[0-9])\s+examine at\s+\d+\/\d+\s+progress, excluding augments and other modifiers\.\s*Rounding choices were reviewed; this is an inference, not a base-item capture\./gi)];
export function requiresTierZeroVerification(candidate={}){
    if(candidate.kind!=='item'||validateTierZeroVerification(candidate).ok)return false;
    const tier=Number(candidate.baseRecovery?.tier??candidate.fields?.tier?.value);
    return Boolean(candidate.baseRecovery)||Number.isInteger(tier)&&tier>0&&tier<=10;
}
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const viewFingerprint=candidate=>JSON.stringify([itemRecoveryFingerprint(candidate),candidate.baseRecovery||null,candidate.fields?.statLines?.value??null,candidate.title]);
const proofFingerprint=candidate=>{const source=itemRecoverySource(candidate);return JSON.stringify([candidate.kind,normalizeWikiIdentity(itemBaseIdentity(candidate.name).name),normalizeWikiIdentity(candidate.title),source.tier,source.fraction,Object.entries(source.observed).sort(([a],[b])=>a.localeCompare(b)),...['modified','augmented','augmentNames'].map(key=>candidate.fields?.[key]?.value??null),candidate.fields?.statLines?.value??null]);};
function textMatchesEvidence(candidate,evidence){
    const value=candidate.fields?.statLines?.value,lines=Array.isArray(value)?value:typeof value==='string'?value.split(/\r?\n/):[];
    if(!lines.length||lines.length>60||lines.some(line=>typeof line!=='string')||lines.join('\n').length>8192)return {ok:false,reason:'Review the bounded tier-zero statistic text before confirming.'};
    const parsed=parseItemStatBlock(lines.join('\n'));
    if(parsed.conflicts.length)return {ok:false,reason:'The proposed base statistic text contains conflicting written values.'};
    for(const line of lines){if(isItemNumericStatLine(line)&&/[+-]?\d/.test(line)&&!parseItemStatBlock(line).fields.some(field=>finite(field.value)))return {ok:false,reason:'A numeric line has no supported tier-zero evidence. Review or omit that line.'};}
    for(const field of parsed.fields.filter(field=>finite(field.value))){
        const actual=evidence.numericFields?.[field.key]??evidence.observed?.[ITEM_RECOVERY_FIELDS[field.key]];
        if(!finite(actual)||field.value!==actual)return {ok:false,reason:`The proposed ${field.key} text does not match this tier-zero reading.`};
    }
    return {ok:true};
}
export function collectTierZeroEvidence(candidate,observation,{now=Date.now(),freshnessMs=600000}={}){
    if(candidate.kind!=='item'||!observation?.id||!['ocr','manual','screen-read'].includes(observation.kind)||observation.owner==='character')return false;
    if(!candidate.baseRecovery&&!candidate.reasons?.includes('tier0-verification'))return false;
    if(normalizeWikiIdentity(itemBaseIdentity(observation.subject?.name).name)!==normalizeWikiIdentity(itemBaseIdentity(candidate.name).name))return false;
    const at=Date.parse(observation.capturedAt),fields=Object.fromEntries((Array.isArray(observation.fields)?observation.fields:[]).slice(0,80).map(field=>[field.key,field.value]));
    const tier=fields.tier??itemBaseIdentity(observation.subject?.name).tier;
    if(tier!==0||!Number.isFinite(at)||now-at>freshnessMs||at-now>2000)return false;
    const observed=Object.fromEntries(Object.entries(ITEM_RECOVERY_FIELDS).filter(([field])=>finite(fields[field])).map(([field,key])=>[key,fields[field]]));
    if(!Object.keys(observed).length)return false;
    const evidence={schemaVersion:1,id:String(observation.id).slice(0,240),capturedAt:new Date(at).toISOString(),observedName:String(observation.subject.name).slice(0,240),observed,
        modifiersPresent:fields.modified===true||fields.augmented===true||Array.isArray(fields.augmentNames)&&fields.augmentNames.length>0,
        numericFields:Object.fromEntries(Object.entries(fields).filter(([key,value])=>/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(key)&&finite(value)).slice(0,80)),
        source:{kind:String(observation.kind||'screen-read').slice(0,40),sessionId:String(observation.sessionId||'').slice(0,100),generation:Number.isSafeInteger(observation.input?.generation)?observation.input.generation:null},
        candidateFingerprint:viewFingerprint(candidate)};
    candidate.tierZeroEvidence??=[];
    if(candidate.tierZeroEvidence.some(value=>value.id===evidence.id))return false;
    candidate.tierZeroEvidence=[...candidate.tierZeroEvidence,evidence].slice(-3);return true;
}
export function tierZeroVerificationPreview(candidate,{evidenceId,now=Date.now(),freshnessMs=600000}={}){
    if(!candidate||candidate.kind!=='item')return {ok:false,reason:'Choose an item contribution.'};
    const evidence=(candidate.tierZeroEvidence||[]).findLast(value=>!evidenceId||value.id===evidenceId);
    if(!evidence)return {ok:false,reason:'Read a current tier-zero item before confirming its base statistics.'};
    const at=Date.parse(evidence.capturedAt);
    if(!Number.isFinite(at)||now-at>freshnessMs||at-now>2000)return {ok:false,reason:'The tier-zero evidence is stale. Read the base item again.'};
    if(evidence.candidateFingerprint!==viewFingerprint(candidate))return {ok:false,reason:'This draft changed after the tier-zero reading. Read it again before confirmation.'};
    if(evidence.modifiersPresent)return {ok:false,reason:'The tier-zero reading contains a known augment or modifier.'};
    const choices=candidate.baseRecovery?.choices||{},missing=[],conflicts=[];
    for(const [key,expected]of Object.entries(choices).slice(0,40)){
        if(!finite(evidence.observed[key]))missing.push(key);
        else if(evidence.observed[key]!==expected)conflicts.push({key,expected,observed:evidence.observed[key]});
    }
    if(!missing.length&&!conflicts.length){const text=textMatchesEvidence(candidate,evidence);if(!text.ok)return {...text,evidence:structuredClone(evidence),missing,conflicts};}
    return {ok:missing.length===0&&conflicts.length===0,evidence:structuredClone(evidence),missing,conflicts,
        reason:conflicts.length?'The observed base statistics disagree with the inferred proposals. Review the corrected values first.':missing.length?'Some inferred statistics were not visible in this base reading. Read them before confirmation.':'Review this tier-zero reading and confirm it excludes augments and other modifiers.'};
}
export function confirmTierZeroVerification(candidate,{evidenceId,reviewed=false,modifiersExcluded=false,now=Date.now()}={}){
    if(reviewed!==true||modifiersExcluded!==true)throw Error('Confirm the base reading excludes augments and other modifiers.');
    const preview=tierZeroVerificationPreview(candidate,{evidenceId,now});if(!preview.ok)throw Error(preview.reason);
    const evidence=preview.evidence,fields=structuredClone(candidate.fields||{});
    // Existing contributor text, including unsupported omitted numbers, must
    // still pass the normal full wiki diff review. Do not overwrite it here.
    fields.tier={value:0,confirmed:true};fields.fraction={value:0,confirmed:true};
    fields.modified={value:false,confirmed:true};fields.augmented={value:false,confirmed:true};fields.augmentNames={value:[],confirmed:true};
    for(const [field,observed]of Object.entries(evidence.numericFields||{}))if(!['tier','fraction','quantity'].includes(field)&&finite(observed)){
        if((fields[field]?.edited||fields[field]?.confirmed)&&finite(fields[field]?.value)&&fields[field].value!==observed)throw Error(`Review the edited ${itemRecoveryLabel(ITEM_RECOVERY_FIELDS[field]||field)} value before confirming this reading.`);
        fields[field]={value:observed,confirmed:true};
    }
    return {fields,baseRecovery:null,baseRecoveryHistory:[...(candidate.baseRecoveryHistory||[]),...(candidate.baseRecovery?[structuredClone(candidate.baseRecovery)]:[])].slice(-3),
        baseVerification:{schemaVersion:1,evidenceId:evidence.id,capturedAt:evidence.capturedAt,reviewedAt:new Date(now).toISOString(),modifiersExcluded:true,observed:structuredClone(evidence.observed),numericFields:structuredClone(evidence.numericFields||{}),sourceFingerprint:proofFingerprint({...candidate,fields,baseRecovery:null})}};
}
export function validateTierZeroVerification(candidate){
    const proof=candidate?.baseVerification;
    if(!proof||proof.schemaVersion!==1||proof.modifiersExcluded!==true||!proof.evidenceId||!Number.isFinite(Date.parse(proof.capturedAt))||!Number.isFinite(Date.parse(proof.reviewedAt)))return {ok:false,reason:'Read and accept an unmodified tier-zero item before removing its recovery warning.'};
    if(candidate.fields?.tier?.value!==0||candidate.baseRecovery||candidate.fields?.modified?.value===true||candidate.fields?.augmented?.value===true||candidate.fields?.augmentNames?.value?.length)return {ok:false,reason:'The accepted base reading no longer matches an unmodified tier-zero item.'};
    if(proof.sourceFingerprint!==proofFingerprint(candidate))return {ok:false,reason:'The accepted tier-zero source or statistic text changed. Read and confirm it again.'};
    for(const [field,key]of Object.entries(ITEM_RECOVERY_FIELDS))if(finite(proof.observed?.[key])&&candidate.fields?.[field]?.value!==proof.observed[key])return {ok:false,reason:'The accepted base values changed. Read and confirm them again.'};
    for(const [field,observed]of Object.entries(proof.numericFields||{}))if(!['tier','fraction','quantity'].includes(field)&&candidate.fields?.[field]?.value!==observed)return {ok:false,reason:'An accepted item statistic changed. Read and confirm it again.'};
    return textMatchesEvidence(candidate,proof);
}
