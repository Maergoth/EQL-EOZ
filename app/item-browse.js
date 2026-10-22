function defaultZoneKey(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/^the\s+/, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function defaultNamedSource(value) {
    const name = String(value || '').trim();
    return Boolean(name && !/^(?:a|an|some)\s+/i.test(name) && !/^the\s+[a-z]/.test(name));
}

const PLAYABLE_CLASSES = new Set([
    'WAR','CLR','PAL','RNG','SHD','DRU','MNK','BRD',
    'ROG','SHM','NEC','WIZ','MAG','ENC','BST','BER'
]);

export function itemMatchesClasses(item, selectedClasses = []) {
    const selected = selectedClasses.map(value => String(value).trim().toUpperCase())
        .filter(code => PLAYABLE_CLASSES.has(code));
    if (!selected.length) return true;
    const classes = (item?.classes || []).map(value => String(value).trim().toUpperCase());
    if (classes.includes('NONE')) return false;
    if (classes.includes('ALL')) {
        // Older schema-v3 packs exported ALL plus the excluded codes as if
        // every class were allowed. Repair only that signature; an explicit
        // allowed-class list from a newer exporter remains authoritative.
        const exclusionLine = (item?.displayLines || []).find(line => /^\s*Class:\s*ALL\s+EXCEPT\b/i.test(line));
        if (!exclusionLine) return true;
        const tail = exclusionLine.replace(/^\s*Class:\s*ALL\s+EXCEPT\b/i, '').toUpperCase();
        const excluded = new Set((tail.match(/\b[A-Z]{3}\b/g) || []).filter(code => PLAYABLE_CLASSES.has(code)));
        return selected.some(code => !excluded.has(code));
    }
    const allowed = classes.filter(code => PLAYABLE_CLASSES.has(code));
    return !allowed.length || selected.some(code => allowed.includes(code));
}

export function itemHasZoneSource(item, zone, normalizeZone = defaultZoneKey) {
    if (!zone) return false;
    const wanted = normalizeZone(zone);
    return (item?.dropSources || []).some(source => normalizeZone(source?.zone) === wanted);
}

export function itemHasClassStats(item) {
    if (Object.entries(item?.stats || {}).some(([stat, value]) =>
        String(stat).toUpperCase() !== 'WT' && Number.isFinite(Number(value)) && Number(value) !== 0
    )) return true;
    // Useful equipment can grant a click/worn effect without numeric stats
    // (for example a charged wand). Keep these in My Class; a weight-only
    // quest item or an effect on food/potions is not equippable gear.
    const hasSlot = (item?.slots || []).some(slot =>
        /^(?:EAR|HEAD|FACE|NECK|SHOULDERS|ARMS|BACK|WRIST|RANGE|HANDS|PRIMARY|SECONDARY|FINGER|CHEST|LEGS|WAIST|FEET|AMMO|CHARM|POWER SOURCE)$/i.test(String(slot).trim())
    );
    if (!hasSlot) return false;
    return (item?.displayLines || []).some(line =>
        /^\s*Focus Effect:\s*\S/i.test(line) ||
        (/^\s*Effect:\s*\S/i.test(line) && /\b(?:Must Equip|Can Equip|Worn|Combat)\b/i.test(line))
    );
}

export function scoreItemForBrowse(item, options = {}) {
    const zone = options.zone || '';
    const normalizeZone = options.normalizeZone || defaultZoneKey;
    const isNamedSource = options.isNamedSource || defaultNamedSource;
    const slots = (item?.slots || []).map(slot => String(slot).toUpperCase());
    const statKeys = Object.keys(item?.stats || {}).map(stat => String(stat).toUpperCase());
    const wantedZone = zone ? normalizeZone(zone) : '';
    const zoneSources = (item?.dropSources || []).filter(source => wantedZone && normalizeZone(source?.zone) === wantedZone);
    const copy = `${item?.name || ''} ${(item?.displayLines || []).join(' ')}`.toLowerCase();
    let score = 0;
    if (zoneSources.length) score += 1000;
    if (slots.length) score += 180;
    if (statKeys.some(stat => stat !== 'WT')) score += 120;
    if (zoneSources.some(source => isNamedSource(source?.name))) score += 60;
    if ((item?.classes || []).length && !(item?.classes || []).includes('ALL')) score += 25;
    if (!slots.length && !statKeys.some(stat => stat !== 'WT')) score -= 80;
    if (/\b(?:dose|potion|elixir|distillate|charges?:|drink|food)\b/.test(copy)) score -= 140;
    return score;
}
