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

export function itemHasZoneSource(item, zone, normalizeZone = defaultZoneKey) {
    if (!zone) return false;
    const wanted = normalizeZone(zone);
    return (item?.dropSources || []).some(source => normalizeZone(source?.zone) === wanted);
}

export function itemHasClassStats(item) {
    return Object.entries(item?.stats || {}).some(([stat, value]) =>
        String(stat).toUpperCase() !== 'WT' && Number.isFinite(Number(value)) && Number(value) !== 0
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
