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
    "nagafen's lair":"Nagafen's Lair (Sol B)"
}));

function cleanZoneName(value) {
    return String(value || '').replace(/\s+\d+\s+\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
}

export function viewerZoneName(value) {
    const cleaned = cleanZoneName(value);
    return gameZoneAliases.get(cleaned.toLowerCase()) || cleaned;
}

export function resolveZoneRecord(zones, value) {
    const original = cleanZoneName(value).toLowerCase();
    if (!original) return null;
    const canonical = viewerZoneName(value).toLowerCase();
    const exact = name => zones.find(zone => [zone.name, zone.viewerName, zone.wikiTitle, ...(zone.aliases || [])]
        .some(alias => cleanZoneName(alias).toLowerCase() === name));
    // Pack-specific aliases take precedence over the compatibility table.
    const record = exact(original) || exact(canonical);
    if (record) return record;
    const partial = zones.filter(zone => {
        const name = cleanZoneName(zone.name).toLowerCase();
        return name && (name.includes(original) || original.includes(name));
    });
    return partial.length === 1 ? partial[0] : null;
}
