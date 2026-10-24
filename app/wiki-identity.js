// Shared typed, local-only identity. Presence is positive evidence; only a
// complete non-sample catalog can establish absence. No fuzzy/article matching.
const clean = value => String(value ?? '').slice(0, 512).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
const titleText = value => clean(value).replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, entity => ({'&nbsp;':' ', '&amp;':'&', '&quot;':'"', '&apos;':"'", '&lt;':'<', '&gt;':'>'}[entity.toLowerCase()]))
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, number) => {
        const code = number[0].toLowerCase() === 'x' ? parseInt(number.slice(1), 16) : Number(number);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
    }).normalize('NFKC').replace(/_/g, ' ').replace(/[\u2018\u2019`]/g, "'").replace(/\s+/g, ' ').trim();
export const normalizeWikiIdentity = value => titleText(value).toLowerCase();
// Lookup ignores case, but an actual MediaWiki title keeps case after its first
// character. Separate canonical pages must never be merged by a folded lookup.
export function wikiPageTitleKey(value) {
    const title=clean(value).normalize('NFKC').replace(/_/g,' ').replace(/\s+/g,' ').trim(),characters=[...title];
    return characters.length ? characters[0].toUpperCase()+characters.slice(1).join('') : '';
}
export function itemBaseIdentity(value) {
    const name = clean(value), match = name.match(/^(.+?)\s*\+(10|[0-9])(?:\s*(\(Exaltation\)))?$/i);
    return match && match[1].trim() ? {name:match[1].trim() + (match[3] ? ` ${match[3]}` : ''), tier:Number(match[2])} : {name, tier:null};
}
export const itemExaltationBaseIdentity = value => itemBaseIdentity(value).name.replace(/\s*\(Exaltation\)$/i,'').trim();
// Inventory exports can decorate container names (Backpack*). These aliases
// establish presence only when their exact base is known; unknown names stay
// intact and a distinct decorated wiki article always takes precedence.
export const itemExportBaseIdentity = value => itemExaltationBaseIdentity(value).replace(/\s*\*$/u,'').trim();
export const wikiEntityKind = kind => kind === 'monster' ? 'npc' : kind;
export const wikiIdentityKey = (kind, name) => `${wikiEntityKind(kind)}|${normalizeWikiIdentity(wikiEntityKind(kind) === 'item' ? itemBaseIdentity(name).name : name)}`;

export function createWikiResolver(pack = {}) {
    const entities = pack.wikiEntities || {}, complete = pack.meta?.wikiEntitiesComplete === true && pack.meta?.sample !== true && ['items','npcs','titles'].every(key => Array.isArray(entities[key]));
    const types = new Map(), generic = new Map();
    const insert = (index, record, canonicalTitle=null) => {
        const title = clean(canonicalTitle || (typeof record === 'string' ? record : record?.wikiTitle || record?.title || record?.name));
        if (!title) return;
        const titleKey = wikiPageTitleKey(title), names = typeof record === 'string' ? [record,title] : [record?.name, record?.title, record?.wikiTitle, title, ...(Array.isArray(record?.aliases) ? record.aliases : [])];
        for (const name of names) {
            const key = normalizeWikiIdentity(name); if (!key) continue;
            let byTitle = index.get(key); if (!byTitle) index.set(key, byTitle = new Map());
            const entry = byTitle.get(titleKey) || {title, records:[]};
            if (record && typeof record === 'object' && !entry.records.includes(record)) entry.records.push(record);
            byTitle.set(titleKey, entry);
        }
    };
    // Flat lists include redirects and display-name spellings and are deduped
    // case-insensitively by the exporter. They establish presence, not proof
    // of a competing canonical page. Rich explicit wikiTitle records do that.
    for (const record of Array.isArray(entities.titles) ? entities.titles : []) insert(generic, record);
    const canonicalFor = record => {
        const explicit=clean(record?.wikiTitle||record?.title),name=explicit||clean(record?.name||record),known=generic.get(normalizeWikiIdentity(name));
        const samePage=known?.get(wikiPageTitleKey(name));
        return samePage?.title || (!explicit&&known?.size===1?[...known.values()][0].title:name);
    };
    for (const kind of ['item','npc','zone']) {
        const index = new Map(), list = kind === 'item' ? pack.items : kind === 'npc' ? pack.npcs : pack.zones, typed = kind === 'item' ? entities.items : kind === 'npc' ? entities.npcs : [];
        for (const record of Array.isArray(list) ? list : []) insert(index, record,canonicalFor(record));
        for (const record of Array.isArray(typed) ? typed : []) {
            if(record&&typeof record==='object'){insert(index,record,canonicalFor(record));continue;}
            const key=normalizeWikiIdentity(record),known=generic.get(key),existing=index.get(key);
            if(existing?.size)continue;
            if(known?.size){for(const entry of known.values())insert(index,record,entry.title);}
            else insert(index,record);
            // Existing rich aliases already establish membership. A flat label
            // is metadata, not an independently identified competing article.
        }
        types.set(kind,index);
    }
    function direct(kind,name,observedName) {
        const normalized=normalizeWikiIdentity(name),key=`${kind}|${normalized}`,index=types.get(kind);
        if (!index || !normalized) return {kind,key,name,observedName,membership:'unknown',canonicalTitle:null,record:null,records:[],candidates:[],complete};
        const candidates=new Map();
        for(const entry of (index.get(normalized)||generic.get(normalized)||new Map()).values()){
            const titleKey=wikiPageTitleKey(entry.title),prior=candidates.get(titleKey);
            if(!prior)candidates.set(titleKey,{title:entry.title,records:[...entry.records]});
            else for(const record of entry.records)if(!prior.records.includes(record))prior.records.push(record);
        }
        const selected=[...candidates.values()],membership=selected.length>1?'ambiguous':selected.length===1?'present':complete?'missing':'unknown';
        const chosen=membership==='present'?selected[0]:null,records=chosen?.records||[];
        return {kind,key,name,observedName,membership,canonicalTitle:chosen?.title||null,record:records[0]||null,records,candidates:selected.map(entry=>entry.title),complete};
    }
    function resolve(rawKind,rawName,{itemAliases=true}={}) {
        const kind=wikiEntityKind(rawKind),observedName=clean(rawName),name=kind==='item'?itemBaseIdentity(observedName).name:observedName,result=direct(kind,name,observedName);
        if(kind!=='item'||!itemAliases||!['missing','unknown'].includes(result.membership))return result;
        const base=itemExportBaseIdentity(name);if(!base||base===name)return result;
        const alias=direct(kind,base,observedName);
        return ['present','ambiguous'].includes(alias.membership)?{...alias,...(/\(Exaltation\)$/i.test(name)?{exaltationAlias:true}:{exportNameAlias:true})}:result;
    }
    return {complete,resolve,has:(kind,name) => resolve(kind,name).membership === 'present'};
}
