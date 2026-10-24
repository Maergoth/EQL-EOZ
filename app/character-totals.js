// Shared inspect presentation of the single reviewed equipped-stat reading.
import { characterStatLabel } from './character-model.js';

export function characterTotalGroups(totals={}) {
    const computed=totals.computed||{},observed=totals.current?.stats||totals.observed?.stats||{},present=key=>Object.hasOwn(observed,key)||Number.isFinite(computed[key]?.value);
    const components=(keys,fallback)=>keys.some(present)?keys:[fallback];
    const resources=['HP','MP','END'].map(key=>present(`${key}_MAXIMUM`)?`${key}_MAXIMUM`:key);
    const speed=present('ATTACK_SPEED')?'ATTACK_SPEED':'HASTE';
    const groups=[['Character vitals',[
        ...resources,...components(['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION'],'AC'),
        ...components(['ATK_OFFENSE','ATK_ACCURACY'],'ATK'),speed,
        ...['VELOCITY','HP_REGEN','MANA_REGEN','END_REGEN','PRIMARY_DPS','SECONDARY_DPS','RANGED_DPS'].filter(present)
    ]],['Stats and resists',['STR','STA','INT','WIS','AGI','DEX','CHA','SV_MAGIC','SV_FIRE','SV_COLD','SV_DISEASE','SV_POISON','SV_CORRUPTION',
        ...['ACCURACY','AVOIDANCE','COMBAT_EFFECTS','STRIKETHROUGH','STUN_RESIST','DAMAGE_SHIELD','DAMAGE_SHIELD_MITIGATION','DOT_SHIELDING','MELEE_SHIELDING','SPELL_SHIELDING'].filter(present)]]];
    return groups.map(([label,keys])=>({label,rows:keys.map(key=>{
        const record=computed[key],resource=key.replace(/_MAXIMUM$/,''),name=resource==='MP'?'Mana':resource==='END'?'Endurance':resource==='HP'?'HP':key==='HASTE'?'Haste %':characterStatLabel(key);
        return {key,label:name,value:Number.isFinite(record?.value)?record.value:null,complete:record?.complete===true,
            caveats:[...(record?.caveats||['Current equipped statistic has not been read and reviewed.'])]};
    })}));
}
