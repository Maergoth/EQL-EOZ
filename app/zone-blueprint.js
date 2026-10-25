// The live Help:Contents blueprint owns the page layout. This module validates
// its supported contract and fills reviewed values; it never invents a layout.
export const ZONE_BLUEPRINT_VERSION = 1;
export const ZONE_OVERVIEW_TOKEN_FIELDS = Object.freeze({
    LEVEL_RANGE:'levelRange', MIN_PLAYER_LEVEL:'minPlayerLevel', MONSTER_TYPES:'monsterTypes',
    NOTABLE_NPCS:'notableNPCs', COMMON_LOOT:'knownLoot', UNIQUE_ITEMS:'uniqueItems',
    RELATED_QUESTS:'relatedQuests', ADJACENT_ZONES:'adjacentZones', WHO_NAME:'whoName',
    RESPAWN_TIME:'respawnTime', SUCCOR:'succor', ZEM:'zem', MAP_IMAGE:'mapFilename', MAP_NOTES:'mapNotes'
});
export const ZONE_BLUEPRINT_TOKENS = Object.freeze([
    'ERA','ZONE_NAME','OVERVIEW','RAID_AVAILABILITY','DYNAMIC_ZONE_LIST',
    ...Object.keys(ZONE_OVERVIEW_TOKEN_FIELDS),'RAID_OVERVIEW',
    ...Object.keys(ZONE_OVERVIEW_TOKEN_FIELDS).map(key=>'RAID_'+key)
]);
const BEGIN='<!-- EQL-ZONE-RAID:BEGIN -->', END='<!-- EQL-ZONE-RAID:END -->';
const occurrences=(source,text)=>source.split(text).length-1;
export function inspectZoneCreationBlueprint(source){
    if(typeof source!=='string'||source.length>64000)throw Error('The unified Zone blueprint is unavailable or too large.');
    source=source.replace(/\r\n?/g,'\n');
    if(occurrences(source,'<!-- EQL-ZONE-BLUEPRINT:1 -->')!==1||/EQL-ZONE-BLUEPRINT:(?!1\s*-->)/.test(source))throw Error('The current Zone blueprint needs the unified version 1 layout. Refresh the wiki blueprints before creating a zone.');
    if(occurrences(source,BEGIN)!==1||occurrences(source,END)!==1)throw Error('The Zone blueprint has an unsupported optional raid block.');
    const start=source.indexOf(BEGIN),end=source.indexOf(END);
    if(start>=end)throw Error('The Zone blueprint raid block is out of order.');
    const normal=source.slice(0,start),raid=source.slice(start+BEGIN.length,end),tail=source.slice(end+END.length);
    if(!/^== Map ==$/m.test(normal)||!/^= Raid Instance =$/m.test(raid)||!/^== Raid Map ==$/m.test(raid)||/^= [^=].* =$/m.test(normal+tail)||/^={1,2}[^\n]+={1,2}$/m.test(tail))throw Error('Keep the normal overview and Map first, with the optional Raid Instance and Raid Map last.');
    if((normal.match(/class=["']zoneTopTable["']/g)||[]).length!==1||(raid.match(/class=["']zoneTopTable["']/g)||[]).length!==1)throw Error('The unified Zone blueprint needs one overview table per instance.');
    const tokens=[...source.matchAll(/@@([A-Z][A-Z0-9_]*)@@/g)].map(match=>match[1]);
    if(tokens.some(token=>!ZONE_BLUEPRINT_TOKENS.includes(token))||ZONE_BLUEPRINT_TOKENS.some(token=>!tokens.includes(token)))throw Error('The unified Zone blueprint fields changed. Review the current wiki layout before creating a zone.');
    if(occurrences(normal,'@@DYNAMIC_ZONE_LIST@@')!==1||raid.includes('@@DYNAMIC_ZONE_LIST@@'))throw Error('The general dynamic zone list cannot be presented as a filtered raid population.');
    return {source,normal,raid,tail};
}
export function fillZoneCreationBlueprint(source,{raidAvailability,values}={}){
    if(!['yes','no','unknown'].includes(raidAvailability))throw Error('Answer whether this zone has a raid instance, or explicitly choose Unknown.');
    const parts=inspectZoneCreationBlueprint(source),selected=parts.normal+(raidAvailability==='yes'?parts.raid:'')+parts.tail;
    const text=selected.replace(/@@([A-Z][A-Z0-9_]*)@@/g,(_match,key)=>{
        if(!Object.hasOwn(values||{},key)||typeof values[key]!=='string')throw Error('The zone preview is missing a reviewed blueprint field: '+key+'.');
        return values[key];
    });
    if(/@@[A-Z][A-Z0-9_]*@@/.test(text))throw Error('Replace unsupported zone blueprint placeholders before publication.');
    return text.trim()+'\n';
}
