import {editorEscape as e} from './contribution-editor.js';

const groups=Object.freeze([
    {title:'Levels and creatures',fields:[
        ['levelRange','Creature level range','20–35'],
        ['minPlayerLevel','Minimum player level','20','number'],
        ['monsterTypes','Creature types','Undead, elementals']
    ]},
    {title:'People and connections',fields:[
        ['notableNPCs','Notable NPCs','A named guardian\nThe ancient keeper','list'],
        ['relatedQuests','Related quests','A quest title','list'],
        ['adjacentZones','Connected zones','A neighboring zone','list']
    ]},
    {title:'Travel and timing',fields:[
        ['whoName','Zone name in /who','The Forgotten Vale'],
        ['respawnTime','Respawn time','20 minutes'],
        ['succor','Succor location (Y, X, Z)','-60, 325, 120'],
        ['zem','Zone experience modifier','100','number']
    ]},
    {title:'Map',fields:[
        ['mapFilename','Uploaded map filename','Forgotten_Vale_Map.png'],
        ['mapNotes','Map notes','Entrances, routes, or landmarks to show on the map.','text']
    ]}
]);
const raidKey=key=>'raid'+key[0].toUpperCase()+key.slice(1);
const normalKeys=groups.flatMap(group=>group.fields.map(([key])=>key));
export const ZONE_CREATION_FIELD_KEYS=Object.freeze(['raidAvailability',...normalKeys,'knownNPCs','raidOverview',...normalKeys.map(raidKey)]);
const listKeys=new Set(groups.flatMap(group=>group.fields.filter(([, , ,type])=>type==='list').map(([key])=>key)).flatMap(key=>[key,raidKey(key)]));
listKeys.add('knownNPCs');

export function zoneCreationFields(fields={}){
    const result={...fields};
    for(const key of ZONE_CREATION_FIELD_KEYS)if(!result[key])result[key]={value:listKeys.has(key)?[]:'',confirmed:false};
    return result;
}
function fieldMarkup(key,label,example,type,fields){
    const field=fields[key]||{value:listKeys.has(key)?[]:''},array=listKeys.has(key),value=array?(Array.isArray(field.value)?field.value:[]).join('\n'):field.value??'',original=e(JSON.stringify({value:field.value,confirmed:field.confirmed===true}));
    const multiline=array||type==='text',control=multiline?`<textarea data-field-value ${array?'data-array="true" data-lines="true"':''} rows="3" maxlength="12000" placeholder="${e(example)}">${e(value)}</textarea>`:`<input data-field-value ${type==='number'?'type="number" data-type="number" min="0" step="any"':'type="text"'} maxlength="512" value="${e(value)}" placeholder="${e(example)}">`;
    return `<label class="contribution-field ${multiline?'zone-creation-wide':''}" data-field-key="${key}" data-original-field="${original}"><span>${e(label)}</span>${control}${array?'<small class="settings-helper">One page title per line.</small>':''}</label>`;
}
function detailGroups(fields,raid=false){
    return groups.map(group=>`<fieldset><legend>${e(group.title)}</legend><div class="zone-creation-fields">${group.fields.map(([key,label,example,type])=>fieldMarkup(raid?raidKey(key):key,label,example,type,fields)).join('')}</div></fieldset>`).join('');
}
export function zoneCreationMarkup(candidate,fields=zoneCreationFields(candidate.fields)){
    const availability=fields.raidAvailability,value=['yes','no','unknown'].includes(availability.value)?availability.value:'',original=e(JSON.stringify({value:availability.value,confirmed:availability.confirmed===true}));
    return `<section class="zone-creation" data-zone-creation><h3>Zone details</h3><label class="contribution-field zone-raid-question" data-field-key="raidAvailability" data-original-field="${original}"><span>Does this zone have a raid instance?</span><select data-field-value data-zone-raid-availability required><option value="" ${!value?'selected':''}>Choose an answer</option><option value="yes" ${value==='yes'?'selected':''}>Yes</option><option value="no" ${value==='no'?'selected':''}>No</option><option value="unknown" ${value==='unknown'?'selected':''}>Unknown</option></select></label><section class="zone-creation-normal"><h3>Normal zone</h3><label>Overview<textarea name="playerText" rows="4" maxlength="12000" placeholder="Describe the zone, its creatures, and how to reach it.">${e(candidate.playerText)}</textarea></label><details data-zone-normal-optional><summary>Optional normal-zone details</summary>${detailGroups(fields)}<fieldset><legend>Other monsters</legend><p class="settings-helper">List ordinary monsters here. Use Notable NPCs above for specific notable encounters.</p>${fieldMarkup('knownNPCs','Other monsters in this zone','A wandering guard\nA valley wolf','list',fields)}</fieldset></details></section><section data-zone-raid-details ${value==='yes'?'':'hidden'}><h3>Raid instance</h3>${fieldMarkup('raidOverview','Raid overview','Describe how this raid instance differs from the normal zone.','text',fields)}<details data-zone-raid-optional><summary>Optional raid-instance details</summary>${detailGroups(fields,true)}</details></section></section>`;
}
export function updateZoneCreationVisibility(form){
    const select=form.querySelector('[data-zone-raid-availability]'),section=form.querySelector('[data-zone-raid-details]');
    if(select&&section)section.hidden=select.value!=='yes';
}
