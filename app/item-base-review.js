import { recoverItemBaseStats, isItemBaseCandidate } from './item-base-recovery.js';

export const ITEM_RECOVERY_FIELDS = Object.freeze({ac:'AC',hp:'HP',mana:'MP',endurance:'END',str:'STR',sta:'STA',agi:'AGI',dex:'DEX',wis:'WIS',int:'INT',cha:'CHA',resistPoison:'SV_POISON',resistMagic:'SV_MAGIC',resistDisease:'SV_DISEASE',resistFire:'SV_FIRE',resistCold:'SV_COLD',resistCorruption:'SV_CORRUPTION',hpRegen:'HP_REGEN',manaRegen:'MANA_REGEN',enduranceRegen:'END_REGEN',attackSpeed:'ATTACK_SPEED',weight:'WT',damage:'DMG',damageBonus:'DMG_BONUS',delay:'DELAY',attack:'ATK'});
const LABELS={MP:'Mana',END:'Endurance',WT:'Weight',DMG:'DMG',DMG_BONUS:'Damage Bonus',DELAY:'Delay',ATK:'Attack',ATTACK_SPEED:'Attack Speed',HP_REGEN:'HP Regen',MANA_REGEN:'Mana Regen',END_REGEN:'End Regen',SV_POISON:'SV Poison',SV_MAGIC:'SV Magic',SV_DISEASE:'SV Disease',SV_FIRE:'SV Fire',SV_COLD:'SV Cold',SV_CORRUPTION:'SV Void'};
export const itemRecoveryLabel=key=>LABELS[key]||key;
const numeric=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const value=(candidate,key)=>candidate.fields?.[key]?.value;
const linesOf=field=>Array.isArray(field?.value)?field.value.filter(line=>typeof line==='string').slice(0,60):typeof field?.value==='string'?field.value.split(/\r?\n/).slice(0,60):[];
const rawStatLabels=[...Object.keys(ITEM_RECOVERY_FIELDS),...Object.values(ITEM_RECOVERY_FIELDS),...Object.values(LABELS),'Base Dmg','Strength','Stamina','Agility','Dexterity','Wisdom','Intelligence','Charisma','HP Regeneration','Mana Regeneration','Endurance Regeneration'];
const statLabels=new Set(rawStatLabels.map(label=>label.toLowerCase().replace(/[^a-z0-9]/g,'')));
const statPrefix=new RegExp(`^\\s*(?:${rawStatLabels.slice().sort((a,b)=>b.length-a.length).map(label=>label.replace(/[ _.-]+/g,'[ _.-]*')).join('|')})\\s*[:=]?\\s*[+-]?(?:\\d|\\?)`,'i');
const numericLine=line=>{const match=line.trim().match(/^([^:=\r\n]{1,60})[:=]\s*(.*)$/);return statPrefix.test(line)||!!match&&(statLabels.has(match[1].toLowerCase().replace(/[^a-z0-9]/g,''))||/^[+-]?\d|^\?/.test(match[2]));};
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
    const calculation={tier,fraction,augmentStatus:options.modifiersExcluded===true?'excluded':'unknown'};
    return {...recoverItemBaseStats(source.observed,calculation),observed:source.observed,options:calculation};
}
export function createItemBaseReview(candidate,{tier,fraction,choices={},modifiersExcluded=false,reviewed=false}={}){
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
    return {baseRecovery:validated,fields:{...candidate.fields,statLines:{value:[...itemBaseReviewLines(validated),...retained].slice(0,60),confirmed:false,edited:true}}};
}
export function validateItemBaseReview(candidate={}){
    const review=candidate.baseRecovery;if(!review)return {ok:false,reason:'No reviewed base-stat recovery.'};
    try{
        if(review.schemaVersion!==1||review.sourceFingerprint!==itemRecoveryFingerprint(candidate))throw Error('The observed item changed. Review its base-stat recovery again.');
        if(candidate.fields?.statLines?.confirmed!==true)throw Error('Verify the recovered base stat text before preparing a wiki contribution.');
        const validated=createItemBaseReview(candidate,review),expected=itemBaseReviewLines(validated),actual=linesOf(candidate.fields?.statLines).map(line=>line.trim());
        if(!expected.every(line=>actual.includes(line))||actual.filter(numericLine).length!==expected.length)throw Error('The proposed stat text changed. Reapply and verify the selected base values.');
        const source=itemRecoverySource(candidate),omitted=Object.keys(source.observed).filter(key=>!Object.hasOwn(validated.choices,key));
        return {ok:true,review:validated,omitted,note:`Base statistics were proposed by reversing a reviewed tier ${validated.tier} examine at ${validated.fraction}/${2**validated.tier} progress, excluding augments and other modifiers. Rounding choices were reviewed; this is an inference, not a base-item capture.`,warnings:omitted.length?[`Unresolved base statistics were omitted: ${omitted.map(itemRecoveryLabel).join(', ')}.`]:[]};
    }catch(error){return {ok:false,reason:error.message};}
}
export function characterContributionFields(card={}){
    const reverse=Object.fromEntries(Object.entries(ITEM_RECOVERY_FIELDS).map(([field,key])=>[key,field]));
    return {tier:card.tier,fraction:card.fraction,augmented:card.augmentStatus!=='none',slots:card.slots||[],...Object.fromEntries(Object.entries(card.observedStats||{}).flatMap(([key,stat])=>reverse[key]&&numeric(stat)!==null?[[reverse[key],stat]]:[])),statLines:Object.entries(card.observedStats||{}).map(([key,stat])=>`${key}: ${stat??'?'}`)};
}
