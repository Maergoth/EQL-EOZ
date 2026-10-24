// Shared typed, local-only identity. Presence is positive evidence; only a
// complete non-sample catalog can establish absence. No fuzzy/article matching.
const clean = value => String(value ?? '').slice(0, 512).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
export function normalizeWikiIdentity(value) {
    return clean(value).replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, entity => ({'&nbsp;':' ', '&amp;':'&', '&quot;':'"', '&apos;':"'", '&lt;':'<', '&gt;':'>'}[entity.toLowerCase()]))
        .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, number) => {
            const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
            return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
        }).normalize('NFKC').replace(/_/g, ' ').replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
}
export function itemBaseIdentity(value) {
    const name = clean(value), match = name.match(/^(.+?)\s*\+(10|[0-9])(?:\s*(\(Exaltation\)))?$/i);
    return match && match[1].trim() ? {name:match[1].trim() + (match[3] ? ` ${match[3]}` : ''), tier:Number(match[2])} : {name, tier:null};
}
export const wikiEntityKind = kind => kind === 'monster' ? 'npc' : kind;
export const wikiIdentityKey = (kind, name) => `${wikiEntityKind(kind)}|${normalizeWikiIdentity(wikiEntityKind(kind) === 'item' ? itemBaseIdentity(name).name : name)}`;

export function createWikiResolver(pack = {}) {
    const entities = pack.wikiEntities || {}, complete = pack.meta?.wikiEntitiesComplete === true && pack.meta?.sample !== true && ['items','npcs','titles'].every(key => Array.isArray(entities[key]));
    const types = new Map(), generic = new Map();
    const insert = (index, record) => {
        const title = clean(typeof record === 'string' ? record : record?.wikiTitle || record?.title || record?.name);
        if (!title) return;
        const titleKey = normalizeWikiIdentity(title), names = typeof record === 'string' ? [record] : [record?.name, record?.title, record?.wikiTitle, ...(Array.isArray(record?.aliases) ? record.aliases : [])];
        for (const name of names) {
            const key = normalizeWikiIdentity(name); if (!key) continue;
            let byTitle = index.get(key); if (!byTitle) index.set(key, byTitle = new Map());
            const existing = byTitle.get(titleKey);
            // Case-only distinct canonical spellings are unsafe when the cache
            // actually contains two records/pages; do not pick by array order.
            const identity = existing && existing.title !== title ? `${titleKey}\u0000${title}` : titleKey;
            const entry = byTitle.get(identity) || {title, records:[]};
            if (record && typeof record === 'object' && !entry.records.includes(record)) entry.records.push(record);
            byTitle.set(identity, entry);
        }
    };
    for (const record of Array.isArray(entities.titles) ? entities.titles : []) insert(generic, record);
    for (const kind of ['item','npc','zone']) {
        const index = new Map(), list = kind === 'item' ? pack.items : kind === 'npc' ? pack.npcs : pack.zones, typed = kind === 'item' ? entities.items : kind === 'npc' ? entities.npcs : [];
        // Rich typed records define canonical aliases before flat membership.
        for (const record of [...(Array.isArray(list) ? list : []), ...(Array.isArray(typed) ? typed : [])]) insert(index, record);
        types.set(kind,index);
    }
    function resolve(rawKind, rawName) {
        const kind = wikiEntityKind(rawKind), observedName = clean(rawName), name = kind === 'item' ? itemBaseIdentity(observedName).name : observedName, normalized = normalizeWikiIdentity(name), key = `${kind}|${normalized}`, index = types.get(kind);
        if (!index || !normalized) return {kind,key,name,observedName,membership:'unknown',canonicalTitle:null,record:null,records:[],candidates:[],complete};
        const typed = index.get(normalized), candidates = [...(typed || generic.get(normalized) || new Map()).values()];
        // A flat positive name which is already an alias of a rich record is
        // membership metadata, not a competing page. Other collisions remain.
        const rich = candidates.filter(entry => entry.records.length);
        const selected = rich.length === 1 && candidates.every(entry => entry === rich[0] || normalizeWikiIdentity(entry.title) === normalized) ? rich : candidates;
        const membership = selected.length > 1 ? 'ambiguous' : selected.length === 1 ? 'present' : complete ? 'missing' : 'unknown';
        const chosen = membership === 'present' ? selected[0] : null, records = chosen?.records || [];
        return {kind,key,name,observedName,membership,canonicalTitle:chosen?.title || null,record:records[0] || null,records,candidates:selected.map(entry => entry.title),complete};
    }
    return {complete,resolve,has:(kind,name) => resolve(kind,name).membership === 'present'};
}
