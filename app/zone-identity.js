// Exact game display names that differ from the wiki/viewer catalog. Keep this
// explicit: broad word removal can merge distinct historical zone versions.
const gameZoneAliases = new Map(Object.entries({
    'the castle of mistmoore':'Mistmoore Castle',
    'the northern desert of ro':'North Ro',
    'northern desert of ro':'North Ro',
    'north ro':'North Ro',
    'the southern desert of ro':'South Ro',
    'southern desert of ro':'South Ro',
    'south ro':'South Ro',
    'the oasis of marr':'Oasis of Marr',
    'oasis of marr':'Oasis of Marr',
    'the plane of sky':'Plane of Sky',
    'plane of sky':'Plane of Sky',
    'new sebilis expedition':'New Sebilis Expedition',
    "nagafen's lair":"Nagafen's Lair (Sol B)",
    'kerraridge':'Kerra Island',
    'oceanoftears':'Ocean of Tears',
    'newsebexp':'New Sebilis Expedition'
}));

function cleanZoneName(value) {
    return String(value || '').replace(/\s+\d+\s+\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}
// Exact archive equivalences already present in the pinned viewer's client
// file alias table. Prefer the requested ID whenever its archive is present.
const archiveGroups=[['kerra','kerraridge'],['sky','airplane'],['oot','oceanoftears'],['newsebilis','newsebexp'],['westkarana','qey2hh1'],['northro','nro'],['southro','sro']];
export function viewerArchiveIds(value){const id=cleanZoneName(value).toLowerCase(),group=archiveGroups.find(group=>group.includes(id));return id?[id,...(group||[]).filter(other=>other!==id)]:[];}

export function viewerZoneName(value) {
    const cleaned = cleanZoneName(value);
    return gameZoneAliases.get(cleaned.toLowerCase()) || cleaned;
}

export function resolveZoneRecord(zones, value, {allowPartial=true}={}) {
    const original = cleanZoneName(value).toLowerCase();
    if (!original) return null;
    const canonical = viewerZoneName(value).toLowerCase();
    const exact = name => zones.find(zone => [zone.name, zone.viewerName, zone.wikiTitle, ...(zone.aliases || [])]
        .some(alias => cleanZoneName(alias).toLowerCase() === name));
    // Pack-specific aliases take precedence over the compatibility table.
    const record = exact(original) || exact(canonical);
    if (record) return record;
    if(!allowPartial)return null;
    const partial = zones.filter(zone => {
        const name = cleanZoneName(zone.name).toLowerCase();
        return name && (name.includes(original) || original.includes(name));
    });
    return partial.length === 1 ? partial[0] : null;
}

// A /who line supplies both a readable zone name and a client short name.
// Prefer a verified catalog identity, retaining the readable name when a new
// zone's archive ID has not reached the catalog yet.
export function loggedZoneName(zones,value,shortName='') {
    const record=(shortName&&resolveZoneRecord(zones,shortName,{allowPartial:false}))||resolveZoneRecord(zones,value,{allowPartial:false});
    return record?.name||cleanZoneName(value)||cleanZoneName(shortName);
}

// A /who short name identifies the actual client archive. Retain it instead
// of replacing it with a display label shared by multiple historical maps.
// The small optional viewerId is an explicit catalog preference for display-
// only zone lines; it never overrides a verified alternate short name.
export function viewerZoneTarget(zones,value,shortName='') {
    const record=resolveZoneRecord(zones,value);
    if(!record)return shortName?'':viewerZoneName(value);
    const aliases=(record.aliases||[]).map(alias=>cleanZoneName(alias).toLowerCase());
    const owners=alias=>zones.filter(zone=>[zone.name,zone.viewerName,zone.wikiTitle,...(zone.aliases||[])].some(value=>cleanZoneName(value).toLowerCase()===alias));
    const verified=id=>{const direct=owners(id);return /^[a-z0-9][a-z0-9_]*$/.test(id)&&(direct.length===0||direct.length===1&&direct[0]===record)&&viewerArchiveIds(id).some(alias=>aliases.includes(alias)&&owners(alias).length===1&&owners(alias)[0]===record);};
    if(shortName){const id=cleanZoneName(shortName).toLowerCase();return verified(id)?id:'';}
    const observed=cleanZoneName(value).toLowerCase();if(owners(observed).length>1)return '';if(verified(observed))return observed;
    const preferred=String(record.viewerId||'').toLowerCase();if(verified(preferred))return preferred;
    const group=archiveGroups.find(group=>group.some(id=>aliases.includes(id)));if(group&&verified(group[0]))return group[0];
    // Public categorized zones added by the producer have no invented viewer
    // metadata. Their one unambiguous literal /who alias identifies the archive;
    // the viewer still checks the actual local file and zone header before use.
    if(!record.viewerName){
        const ids=[...new Set(aliases.filter(verified))];
        if(ids.length===1)return ids[0];
        if(aliases.some(id=>/^[a-z0-9][a-z0-9_]*$/.test(id)))return '';
    }
    return record.viewerName||record.name||viewerZoneName(value);
}
