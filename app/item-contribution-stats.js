import {ITEM_RECOVERY_FIELDS,itemRecoveryLabel} from './item-base-review.js';

// One field registry for OCR, the form, and outgoing tier-zero statistics.
// Missing is not zero; only explicit finite numbers are serialized.
export const ITEM_CONTRIBUTION_STATS=Object.freeze([
    ...Object.entries(ITEM_RECOVERY_FIELDS).map(([field,key])=>({field,key,label:itemRecoveryLabel(key)})),
    ...Object.entries({requiredLevel:'Required Level',recommendedLevel:'Recommended Level',accuracy:'Accuracy',avoidance:'Avoidance',combatEffects:'Combat Effects',strikeThrough:'Strike Through',stunResist:'Stun Resist',damageShield:'Damage Shield',damageShieldMitigation:'Damage Shield Mitigation',dotShielding:'DoT Shielding',meleeShielding:'Melee Shielding',spellShielding:'Spell Shielding',velocity:'Velocity',primaryDps:'Primary DPS',secondaryDps:'Secondary DPS',rangedDps:'Ranged DPS'}).map(([field,label])=>({field,key:field,label}))
]);
export const ITEM_CONTRIBUTION_STAT_FIELDS=new Set(ITEM_CONTRIBUTION_STATS.map(stat=>stat.field));
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const labelKey=value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases=new Map(ITEM_CONTRIBUTION_STATS.flatMap(stat=>[stat.field,stat.key,stat.label].map(label=>[labelKey(label),stat.field])));
for(const [label,field]of Object.entries({Strength:'str',Stamina:'sta',Agility:'agi',Dexterity:'dex',Wisdom:'wis',Intelligence:'int',Charisma:'cha',Mana:'mana','Base Dmg':'damage',Damage:'damage','Backstab Damage':'backstabDamage','SV Corruption':'resistCorruption','Endurance Regen':'enduranceRegen','HP Regeneration':'hpRegen','Mana Regeneration':'manaRegen','Endurance Regeneration':'enduranceRegen'}))aliases.set(labelKey(label),field);
export function itemContributionLines(fields={}){
    const raw=fields.statLines?.value??fields.statsblock?.value;
    return (Array.isArray(raw)?raw:typeof raw==='string'?raw.split(/\r?\n|<br\s*\/?>/i):[]).filter(line=>typeof line==='string').slice(0,60);
}
export function itemContributionNumericLine(line){
    const match=String(line).match(/^\s*([^:=\r\n]{1,60})\s*[:=]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*%?\s*$/),field=match&&aliases.get(labelKey(match[1]));
    return field&&Number.isFinite(Number(match[2]))?{field,value:Number(match[2])}:null;
}
export function itemContributionStatSource(fields={}){
    const legacy={},retained=[],conflicts=[];
    for(const line of itemContributionLines(fields)){
        const parsed=itemContributionNumericLine(line),field=parsed?.field;
        if(!parsed){retained.push(line);continue;}
        const number=parsed.value;
        if(Object.hasOwn(legacy,field)&&legacy[field]!==number){conflicts.push(field);retained.push(line);continue;}
        legacy[field]=number;
    }
    const values={};
    for(const {field}of ITEM_CONTRIBUTION_STATS){
        const record=fields[field];
        if(record?.edited===true){if(finite(record.value))values[field]=record.value;}
        else if(fields.statLines?.edited===true&&fields.statLines?.structured!==true&&Object.hasOwn(legacy,field))values[field]=legacy[field];
        else if(finite(record?.value))values[field]=record.value;
        else if(Object.hasOwn(legacy,field))values[field]=legacy[field];
    }
    retained.push(...(Array.isArray(fields.savedItemStatText?.value)?fields.savedItemStatText.value.filter(line=>typeof line==='string'):[]));
    return {values,legacy,retained:[...new Set(retained)],conflicts};
}
export function itemContributionStatLines(values={},retained=[],fields={}){
    const text=[...retained];
    for(const [field,label]of [['races','Race'],['size','Size'],['skills','Skill']]){
        const record=fields[field],raw=Array.isArray(record?.value)?record.value.join(' '):record?.value;
        if(record?.edited===true)for(let index=text.length-1;index>=0;index--)if(text[index].toLowerCase().startsWith(label.toLowerCase()+':'))text.splice(index,1);
        if(record?.confirmed===true&&typeof raw==='string'&&raw.trim()&&!text.some(line=>line.toLowerCase().startsWith(label.toLowerCase()+':')))text.push(`${label}: ${raw.trim()}`);
    }
    return [...ITEM_CONTRIBUTION_STATS.flatMap(({field,label})=>finite(values[field])?[`${label}: ${values[field]}`]:[]),...text].slice(0,60);
}

// Presentation for reviewed outgoing wikicode only. Keep the saved observation
// and reverse-scaling text unchanged: they are part of the evidence fingerprint.
const wikiStatGroups=[
    ['slots'],['skills','delay'],['damage','ac','backstabDamage','damageBonus'],['range'],
    ['str','sta','int','wis','agi','dex','cha','hp','mana','endurance'],
    ['resistFire','resistDisease','resistCold','resistMagic','resistPoison','resistCorruption'],
    ['attack','hpRegen','manaRegen','haste','attackSpeed','enduranceRegen'],
    ['weight','size'],['classes'],['races']
];
const wikiStatLabels={slots:'Slot',skills:'Skill',delay:'Atk Delay',damage:'DMG',backstabDamage:'BACKSTAB',damageBonus:'DMG Bonus',range:'Range',mana:'MANA',endurance:'END',haste:'Haste',weight:'WT',classes:'Class',races:'Race',size:'Size'};
const wikiStatPosition=new Map(wikiStatGroups.flatMap((group,index)=>group.map((field,order)=>[field,{group:index,order}])));
const wikiNumericAliases=new Map([...aliases,...Object.entries({atkdelay:'delay',dmgbon:'damageBonus',backstab:'backstabDamage'})]);
const explicitFlags=/^(?:(?:MAGIC ITEM|LORE ITEM|LORE EQUIPPED|ATTUNABLE|NO TRADE|NO DROP|PLACEABLE|QUEST(?: ITEM)?|HEIRLOOM|FREE STORAGE|NO DESTROY|TEMPORARY|ARTIFACT|SUMMONED)\b[\s,]*)+$/i;
function wikiStatAtom(text){
    const identity=text.match(/^\s*(Slot|Skill|Class|Race|Size)\s*:\s*(\S.*?)\s*$/i);
    if(identity){const field={slot:'slots',skill:'skills',class:'classes',race:'races',size:'size'}[identity[1].toLowerCase()];return {field,text:`${wikiStatLabels[field]}: ${identity[2]}`};}
    const numeric=text.match(/^\s*([^:=\r\n]{1,60})\s*[:=]\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))(\s*%?)\s*$/);
    const field=numeric&&wikiNumericAliases.get(labelKey(numeric[1]));
    if(!field||!Number.isFinite(Number(numeric[2])))return null;
    const label=wikiStatLabels[field]||ITEM_CONTRIBUTION_STATS.find(stat=>stat.field===field)?.label;
    return {field,text:`${label}: ${numeric[2]}${numeric[3].includes('%')?'%':''}`};
}
export function itemContributionWikiStatLines(lines=[]){
    const rows=(Array.isArray(lines)?lines:[]).filter(line=>typeof line==='string'&&line.trim()).map(line=>{
        const parts=line.trim().split(/[ \t]{2,}/),atoms=parts.map(wikiStatAtom);
        return {line,atoms:atoms.every(Boolean)?atoms:null};
    });
    const counts=new Map();for(const row of rows)for(const atom of row.atoms||[])counts.set(atom.field,(counts.get(atom.field)||0)+1);
    const groups=new Map(),extra=[];
    const add=(key,order,text)=>{const group=groups.get(key)||[];group.push({order,text});groups.set(key,group);};
    for(const row of rows){
        // Duplicate or compound unsupported lines remain intact instead of
        // choosing a value, dropping a modifier, or interpreting contributor prose.
        if(!row.atoms||row.atoms.some(atom=>counts.get(atom.field)>1)){
            const priority=explicitFlags.test(row.line.trim())?-2:/^\s*(?:(?:Combat|Click|Worn|Focus|Proc)\s+)?Effect\s*:/i.test(row.line)?6.5:6.75;
            extra.push({priority,text:row.line});continue;
        }
        for(const atom of row.atoms){
            const position=wikiStatPosition.get(atom.field);
            // Itembox's default Backstab reads the entire standalone DMG row
            // as a number; another labelled value on that row breaks its expr.
            if(position)add(position.group===2?2+position.order/10:position.group,position.order,atom.text);
            else extra.push({priority:6.6,text:atom.text});
        }
    }
    const result=[...groups].map(([priority,values])=>({priority,text:values.sort((a,b)=>a.order-b.order).map(value=>value.text).join('  ')}));
    return [...result,...extra].sort((a,b)=>a.priority-b.priority).map(row=>row.text);
}
