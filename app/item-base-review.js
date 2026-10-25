import { recoverItemBaseStats, isItemBaseCandidate } from './item-base-recovery.js';

export const ITEM_RECOVERY_FIELDS = Object.freeze({ac:'AC',hp:'HP',mana:'MP',endurance:'END',str:'STR',sta:'STA',agi:'AGI',dex:'DEX',wis:'WIS',int:'INT',cha:'CHA',resistPoison:'SV_POISON',resistMagic:'SV_MAGIC',resistDisease:'SV_DISEASE',resistFire:'SV_FIRE',resistCold:'SV_COLD',resistCorruption:'SV_CORRUPTION',hpRegen:'HP_REGEN',manaRegen:'MANA_REGEN',enduranceRegen:'END_REGEN',attackSpeed:'ATTACK_SPEED',haste:'HASTE',weight:'WT',damage:'DMG',damageBonus:'DMG_BONUS',delay:'DELAY',range:'RANGE',attack:'ATK'});
const LABELS={MP:'Mana',END:'Endurance',WT:'Weight',DMG:'DMG',DMG_BONUS:'Damage Bonus',DELAY:'Delay',ATK:'Attack',ATTACK_SPEED:'Attack Speed',HP_REGEN:'HP Regen',MANA_REGEN:'Mana Regen',END_REGEN:'End Regen',SV_POISON:'SV Poison',SV_MAGIC:'SV Magic',SV_DISEASE:'SV Disease',SV_FIRE:'SV Fire',SV_COLD:'SV Cold',SV_CORRUPTION:'SV Void'};
export const itemRecoveryLabel=key=>LABELS[key]||key;
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const value=(candidate,key)=>candidate.fields?.[key]?.value;
const linesOf=field=>Array.isArray(field?.value)?field.value.filter(line=>typeof line==='string').slice(0,60):typeof field?.value==='string'?field.value.split(/\r?\n/).slice(0,60):[];
const rawStatLabels=[...Object.keys(ITEM_RECOVERY_FIELDS),...Object.values(ITEM_RECOVERY_FIELDS),...Object.values(LABELS),'Base Dmg','Strength','Stamina','Agility','Dexterity','Wisdom','Intelligence','Charisma','HP Regeneration','Mana Regeneration','Endurance Regeneration'];
const statLabels=new Set(rawStatLabels.map(label=>label.toLowerCase().replace(/[^a-z0-9]/g,'')));
const statPrefix=new RegExp(`^\\s*(?:${rawStatLabels.slice().sort((a,b)=>b.length-a.length).map(label=>label.replace(/[ _.-]+/g,'[ _.-]*')).join('|')})\\s*[:=]?\\s*[+-]?(?:\\d|\\?)`,'i');
const numericLine=line=>{const match=line.trim().match(/^([^:=\r\n]{1,60})[:=]\s*(.*)$/);return statPrefix.test(line)||!!match&&(statLabels.has(match[1].toLowerCase().replace(/[^a-z0-9]/g,''))||/^[+-]?\d|^\?/.test(match[2]));};
export const isItemNumericStatLine = numericLine;
export function itemRecoverySource(candidate={}){
    const observed=Object.fromEntries(Object.entries(ITEM_RECOVERY_FIELDS).flatMap(([field,key])=>numeric(value(candidate,field))===null?[]:[[key,value(candidate,field)]]));
    return {observed,tier:numeric(value(candidate,'tier')),fraction:numeric(value(candidate,'fraction'))};
}
export function itemRecoveryFingerprint(candidate={}){
    const source=itemRecoverySource(candidate);
    return JSON.stringify([candidate.kind,candidate.name,source.tier,source.fraction,Object.entries(source.observed).sort(([a],[b])=>a.localeCompare(b)),...['modified','augmented','augmentNames'].map(key=>value(candidate,key)??null)]);
}
export function itemBaseReviewPreview(candidate={},options={}){
    const source=itemRecoverySource(candidate),tier=options.tier===undefined?source.tier:options.tier,fraction=options.fraction===undefined?source.fraction:options.fraction;
    if(options.reviewMode==='provisional')return provisionalPreview(candidate,source,{tier,fraction});
    const calculation={tier,fraction,augmentStatus:options.modifiersExcluded===true?'excluded':'unknown'};
    return {...recoverItemBaseStats(source.observed,calculation),observed:source.observed,options:calculation};
}
function provisionalPreview(candidate,source,{tier,fraction}){
    const knownModifiers=value(candidate,'modified')===true||value(candidate,'augmented')===true||Array.isArray(value(candidate,'augmentNames'))&&value(candidate,'augmentNames').length>0;
    const validTier=Number.isInteger(tier)&&tier>=0&&tier<=10,validFraction=fraction===null||fraction===undefined||Number.isInteger(fraction)&&fraction>=0&&fraction<2**tier&&(tier!==10||fraction===0);
    const fractions=validTier&&validFraction?(fraction===null||fraction===undefined?Array.from({length:tier===10?1:2**tier},(_,index)=>index):[fraction]):[];
    const calculation={tier,fraction:fraction??null,augmentStatus:'assumed-unverified',reviewMode:'provisional'};
    if(!fractions.length||knownModifiers){const preview=recoverItemBaseStats(source.observed,{tier,fraction:null,augmentStatus:'unknown'});for(const result of Object.values(preview.fields))if(result.status!=='unsupported')Object.assign(result,{status:'unknown',value:null,candidates:[],ranges:[],candidateCount:0,reason:knownModifiers?'known-augment-or-modifier-present':!validTier?'unknown-or-invalid-tier':'unknown-or-invalid-fraction'});return {...preview,observed:source.observed,options:calculation,blockedReason:knownModifiers?'known-augment-or-modifier-present':!validTier?'unknown-or-invalid-tier':'unknown-or-invalid-fraction'};}
    // Enumerate the finite legal progress grid, never choose zero for unknown
    // progress. At tier 9 there are 512 states; capped tier 10 has only zero.
    const previews=fractions.map(progress=>recoverItemBaseStats(source.observed,{tier,fraction:progress,augmentStatus:'excluded'})),fields={};
    for(const key of Object.keys(previews[0].fields)){
        const results=previews.map(preview=>preview.fields[key]),first=results[0];
        if(first.status==='unsupported'||results.some(result=>result.reason==='weight-rounding-contract-not-equivalent')){fields[key]={...first,provenance:{...first.provenance,fraction:fraction??null,augmentStatus:'assumed-unverified'}};continue;}
        const ranges=[];
        for(const range of results.filter(result=>['exact','range'].includes(result.status)).flatMap(result=>result.ranges).sort((a,b)=>a.min-b.min)){
            const prior=ranges.at(-1);if(prior&&range.step===prior.step&&range.min<=prior.max+prior.step){prior.max=Math.max(prior.max,range.max);prior.clipped||=range.clipped;prior.count=Math.round((prior.max-prior.min)/prior.step)+1;}
            else ranges.push({...range});
        }
        const candidateCount=ranges.reduce((count,range)=>count+range.count,0),candidates=[];
        for(const range of ranges)for(let current=range.min;current<=range.max&&candidates.length<16;current+=range.step)candidates.push(current);
        const exact=candidateCount===1&&!ranges.some(range=>range.clipped);
        fields[key]={...first,status:candidateCount?exact?'exact':'range':'unknown',value:exact?candidates[0]:null,ranges,candidateCount,candidates,sampleTruncated:candidateCount>16,
            reason:candidateCount?'provisional-forward-roundtrip-across-progress':first.reason,provenance:{...first.provenance,fraction:fraction??null,augmentStatus:'assumed-unverified',fractionStates:fractions.length,limits:[...(first.provenance?.limits||[]),'modifiers are unknown; this is an unverified scaling hypothesis, not recovered fact']}};
    }
    const keys=Object.keys(fields).filter(key=>['exact','range'].includes(fields[key].status));
    // Prefer the lower base values while keeping every proposal compatible
    // with one legal progress state. Independent minima can contradict one
    // another, so compare complete candidate vectors in displayed stat order.
    let defaultChoices=null;
    for(const preview of previews){
        if(!keys.every(key=>['exact','range'].includes(preview.fields[key].status)))continue;
        const choices=Object.fromEntries(keys.map(key=>[key,preview.fields[key].ranges[0].min]));
        const firstDifference=defaultChoices?keys.find(key=>choices[key]!==defaultChoices[key]):null;
        if(!defaultChoices||firstDifference&&choices[firstDifference]<defaultChoices[firstDifference])defaultChoices=choices;
    }
    return {fields,observed:source.observed,options:calculation,defaultChoices:defaultChoices||{},autoPublish:false,provenance:{reviewMode:'provisional',fractionStates:fractions.length,modifiersExcluded:null}};
}
export function itemBaseReviewChoices(preview={},fixed={}){
    let choices={...(preview.defaultChoices||{})};
    if(!Object.keys(choices).length||preview.blockedReason){
        if(Object.keys(fixed).length)throw Error('Review the edited base statistics before using unsupported or modified values.');
        return {};
    }
    if(Object.keys(fixed).length){
        const keys=Object.keys(choices),fractions=preview.options.fraction===null?Array.from({length:preview.options.tier===10?1:2**preview.options.tier},(_,index)=>index):[preview.options.fraction];
        let preferred=null;
        for(const fraction of fractions){
            const options={tier:preview.options.tier,fraction,augmentStatus:'excluded'},calculation=recoverItemBaseStats(preview.observed,options);
            if(!Object.entries(fixed).every(([key,base])=>key==='SV_CORRUPTION'&&base===0||isItemBaseCandidate(key,base,preview.observed[key],options)))continue;
            if(!keys.every(key=>['exact','range'].includes(calculation.fields[key]?.status)))continue;
            const next=Object.fromEntries(keys.map(key=>[key,Object.hasOwn(fixed,key)?fixed[key]:calculation.fields[key].ranges[0].min]));
            const difference=preferred?keys.find(key=>next[key]!==preferred[key]):null;
            if(!preferred||difference&&next[difference]<preferred[difference])preferred=next;
        }
        if(!preferred)throw Error('Review the edited base statistics: they must be supported values from one possible item progress state.');
        choices={...preferred,...fixed};
    }
    // Void on tiered gear includes contextual gains; zero is the editable base
    // default requested by the contributor flow, not an exact recovered value.
    return {...choices,SV_CORRUPTION:0};
}
const baseLabelKey=label=>String(label).toLowerCase().replace(/[^a-z0-9]/g,'');
const BASE_LABEL_KEYS=Object.fromEntries([
    ...Object.entries(ITEM_RECOVERY_FIELDS).flatMap(([field,key])=>[[field,key],[key,key],[itemRecoveryLabel(key),key]]),
    ...Object.entries({Strength:'STR',Stamina:'STA',Agility:'AGI',Dexterity:'DEX',Wisdom:'WIS',Intelligence:'INT',Charisma:'CHA','Base Dmg':'DMG','HP Regeneration':'HP_REGEN','Mana Regeneration':'MANA_REGEN','Endurance Regeneration':'END_REGEN'})
].map(([label,key])=>[baseLabelKey(label),key]));
export function itemBaseReviewInitialChoices(candidate,preview){
    if(candidate.baseRecovery||candidate.fields?.statLines?.edited!==true)return itemBaseReviewChoices(preview);
    const fixed={};
    for(const line of linesOf(candidate.fields.statLines).filter(numericLine)){
        const match=line.match(/^\s*([^:=\r\n]{1,60})[:=]\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/),key=match&&BASE_LABEL_KEYS[baseLabelKey(match[1])];
        if(!key||Object.hasOwn(fixed,key))throw Error('Review the edited base statistics. Use one STAT: number line for each supported base value.');
        fixed[key]=Number(match[2]);
    }
    if(!Object.keys(fixed).length)throw Error('Review the editable base values before replacing manually edited stat text.');
    return itemBaseReviewChoices(preview,fixed);
}
export function proposeItemBaseReview(candidate={}){
    const tier=itemRecoverySource(candidate).tier;
    if(candidate.baseRecovery||!Number.isInteger(tier)||tier<=0||tier>10)return null;
    const options={tier,fraction:null,reviewMode:'provisional'},preview=itemBaseReviewPreview(candidate,options),choices=itemBaseReviewInitialChoices(candidate,preview);
    if(!Object.keys(choices).length)return null;
    try{return applyItemBaseReview(candidate,createItemBaseReview(candidate,{...options,choices,reviewed:true}));}catch{return null;}
}
export function createItemBaseReview(candidate,{tier,fraction,choices={},modifiersExcluded=false,reviewed=false,reviewMode}={}){
    if(reviewMode==='provisional'){
        if(reviewed!==true)throw Error('Review the proposed base values before using them.');
        const preview=itemBaseReviewPreview(candidate,{tier,fraction,reviewMode}),selected={};
        if(preview.blockedReason)throw Error('Review the observed tier and remove known Exaltation or modified values before proposing base statistics.');
        for(const [key,base]of Object.entries(choices).slice(0,40)){
            const result=preview.fields?.[key];
            if(!(key==='SV_CORRUPTION'&&base===0)&&(!result||!['exact','range'].includes(result.status)||numeric(base)===null||!result.ranges.some(range=>base>=range.min&&base<=range.max&&Math.abs((base-range.min)/range.step-Math.round((base-range.min)/range.step))<1e-7)))throw Error(`Review a supported base value for ${itemRecoveryLabel(key)}.`);
            selected[key]=base;
        }
        if(!Object.keys(selected).length)throw Error('Choose at least one supported base statistic. Unresolved values stay omitted.');
        const fractions=preview.options.fraction===null?Array.from({length:preview.options.tier===10?1:2**preview.options.tier},(_,index)=>index):[preview.options.fraction];
        if(!fractions.some(progress=>Object.entries(selected).every(([key,base])=>key==='SV_CORRUPTION'&&base===0||isItemBaseCandidate(key,base,preview.observed[key],{tier:preview.options.tier,fraction:progress,augmentStatus:'excluded'}))))throw Error('The selected base values do not match one possible item progress state. Review the choices together.');
        return {schemaVersion:2,reviewMode:'provisional',sourceFingerprint:itemRecoveryFingerprint(candidate),tier:preview.options.tier,fraction:preview.options.fraction,modifiersExcluded:null,reviewed:true,choices:selected};
    }
    if(reviewed!==true||modifiersExcluded!==true)throw Error('Review the observed values and confirm they exclude augments and other modifiers.');
    const preview=itemBaseReviewPreview(candidate,{tier,fraction,modifiersExcluded}),selected={};
    for(const [key,base]of Object.entries(choices).slice(0,40)){
        const result=preview.fields?.[key];
        if(!result||!['exact','range'].includes(result.status)||numeric(base)===null||!isItemBaseCandidate(key,base,preview.observed[key],preview.options))throw Error(`Review a supported base value for ${itemRecoveryLabel(key)}.`);
        selected[key]=base;
    }
    if(!Object.keys(selected).length)throw Error('Choose at least one supported base statistic. Unresolved values stay omitted.');
    return {schemaVersion:1,sourceFingerprint:itemRecoveryFingerprint(candidate),tier:preview.options.tier,fraction:preview.options.fraction,modifiersExcluded:true,reviewed:true,choices:selected};
}
export function itemBaseReviewLines(review){return Object.entries(review.choices||{}).map(([key,base])=>`${itemRecoveryLabel(key)}: ${base}`);}
export function applyItemBaseReview(candidate,review){
    const validated=createItemBaseReview(candidate,review);
    // Preserve contributor prose/identity lines; replace numeric observed lines
    // with reviewed base proposals. Unsupported numbers are not copied as bases.
    const retained=linesOf(candidate.fields?.statLines).filter(line=>!numericLine(line));
    for(const [field,label]of [['slots','Slot'],['classes','Class'],['races','Race'],['size','Size']]){
        const wrapped=candidate.fields?.[field];if(!wrapped?.confirmed)continue;
        const raw=Array.isArray(wrapped.value)?wrapped.value.join(', '):wrapped.value;
        if(typeof raw==='string'&&raw.trim()&&!retained.some(line=>line.toLowerCase().startsWith(label.toLowerCase()+':')))retained.push(`${label}: ${raw.trim()}`);
    }
    return {baseRecovery:validated,fields:{...candidate.fields,statLines:{value:[...itemBaseReviewLines(validated),...retained].slice(0,60),confirmed:validated.reviewMode==='provisional',edited:true}}};
}
export function validateItemBaseReview(candidate={}){
    const review=candidate.baseRecovery;if(!review)return {ok:false,reason:'No reviewed base-stat recovery.'};
    try{
        if(![1,2].includes(review.schemaVersion)||review.schemaVersion===2&&review.reviewMode!=='provisional'||review.sourceFingerprint!==itemRecoveryFingerprint(candidate))throw Error('The observed item changed. Review its base-stat recovery again.');
        if(candidate.fields?.statLines?.confirmed!==true)throw Error('Verify the recovered base stat text before preparing a wiki contribution.');
        const validated=createItemBaseReview(candidate,review),expected=itemBaseReviewLines(validated),actual=linesOf(candidate.fields?.statLines).map(line=>line.trim());
        if(!expected.every(line=>actual.includes(line))||actual.filter(numericLine).length!==expected.length)throw Error('The proposed stat text changed. Reapply and verify the selected base values.');
        const source=itemRecoverySource(candidate),omitted=Object.keys(source.observed).filter(key=>!Object.hasOwn(validated.choices,key));
        return {ok:true,review:validated,omitted,note:validated.schemaVersion===2?`These stats are reverse calculated from a tier ${validated.tier} item. Please confirm with a tier 0 item and remove this message`:`Base statistics were proposed by reversing a reviewed tier ${validated.tier} examine at ${validated.fraction}/${2**validated.tier} progress, excluding augments and other modifiers. Rounding choices were reviewed; this is an inference, not a base-item capture.`,warnings:omitted.length?[`Unresolved base statistics were omitted: ${omitted.map(itemRecoveryLabel).join(', ')}.`]:[]};
    }catch(error){return {ok:false,reason:error.message};}
}
export function characterContributionFields(card={}){
    const reverse=Object.fromEntries(Object.entries(ITEM_RECOVERY_FIELDS).map(([field,key])=>[key,field]));
    return {tier:card.tier,fraction:card.fraction,augmented:card.augmentStatus!=='none',slots:card.slots||[],...Object.fromEntries(Object.entries(card.observedStats||{}).flatMap(([key,stat])=>reverse[key]&&numeric(stat)!==null?[[reverse[key],stat]]:[])),statLines:Object.entries(card.observedStats||{}).map(([key,stat])=>`${key}: ${stat??'?'}`)};
}
