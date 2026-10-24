// Shared inspect presentation. Baselines and individual gear sums stay private
// calculation inputs; only equipped totals belong in a character inspect view.
import { characterStatLabel } from './character-model.js';

export function characterTotalGroups(totals={}) {
    const computed=totals.computed||{},base=totals.base?.stats||{},present=key=>Object.hasOwn(base,key)||Number.isFinite(computed[key]?.baseValue)||Number.isFinite(computed[key]?.value);
    const components=(keys,fallback)=>keys.some(present)?keys:[fallback];
    const resources=['HP','MP','END'].map(key=>present(`${key}_MAXIMUM`)?`${key}_MAXIMUM`:key);
    const speed=present('ATTACK_SPEED')?'ATTACK_SPEED':'HASTE';
    const groups=[['Character vitals',[
        ...resources,...components(['AC_MITIGATION','AC_MITIGATION_SOFTCAP','AC_EVASION'],'AC'),
        ...components(['ATK_OFFENSE','ATK_ACCURACY'],'ATK'),speed,
        ...['VELOCITY','HP_REGEN','MANA_REGEN','END_REGEN','PRIMARY_DPS','SECONDARY_DPS','RANGED_DPS'].filter(present)
    ]],['Stats and resists',['STR','STA','INT','WIS','AGI','DEX','CHA','SV_MAGIC','SV_FIRE','SV_COLD','SV_DISEASE','SV_POISON','SV_CORRUPTION']]];
    return groups.map(([label,keys])=>({label,rows:keys.map(key=>{
        const record=computed[key],resource=key.replace(/_MAXIMUM$/,''),name=resource==='MP'?'Mana':resource==='END'?'Endurance':resource==='HP'?'HP':key==='HASTE'?'Haste %':characterStatLabel(key);
        return {key,label:name,value:Number.isFinite(record?.value)?record.value:null,complete:record?.complete===true,
            caveats:[...(record?.caveats||['No Equipment baseline has not been captured.'])]};
    })}));
}
