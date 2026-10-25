// Pure catalog membership and local suppression. This module never contacts the
// wiki and never treats a partial/old dataset as evidence that an article is missing.
import { createWikiResolver, normalizeWikiIdentity, wikiIdentityKey, itemBaseIdentity } from './wiki-identity.js';
import { classifyNpcEvidence } from './generated-pets.js';
const IGNORE_KEY = 'eql-eye-of-zomm-wiki-discovery-ignored-v1';
const MAX_PENDING = 20, MAX_IGNORED = 2000, MAX_SEEN = 4000;
const clean = value => String(value ?? '').slice(0, 512).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const hash = value => { let result = 2166136261; for (const char of value) { result ^= char.charCodeAt(0); result = Math.imul(result, 16777619); } return (result >>> 0).toString(36); };

export function wikiEntityKey(value) {
    return normalizeWikiIdentity(value);
}

function namesInto(target, source) {
    for (const record of Array.isArray(source) ? source : []) {
        const values = typeof record === 'string' ? [record] : [record?.name, record?.title, record?.wikiTitle, ...(Array.isArray(record?.aliases) ? record.aliases : [])];
        for (const value of values) { const key = wikiEntityKey(value); if (key) target.add(key); }
    }
}

export function buildWikiEntityCatalog(pack = {}) {
    const items = new Set(), monsters = new Set(), titles = new Set();
    const entities = pack.wikiEntities || {};
    namesInto(items, entities.items); namesInto(monsters, entities.npcs); namesInto(titles, entities.titles);
    // These records can establish presence even in older packs. Their absence
    // cannot establish that a wiki page is missing.
    namesInto(items, pack.items); namesInto(monsters, pack.npcs);
    const resolver=createWikiResolver(pack),complete=resolver.complete;
    return { complete, items, monsters, titles,
        resolve:resolver.resolve,has:resolver.has };
}

export function createWikiDiscovery({ getPack = () => ({}), storage = globalThis.localStorage, now = Date.now,
    onMissing = () => {}, onWarning = () => {}, getSuppression = () => null, onIgnore = () => {}, freshnessMs = 10000, cooldownMs = 300000 } = {}) {
    const ignored = new Set(), legacyIgnored = new Set(), seen = new Set(), pending = new Map(), cooldowns = new Map(), watermarks = new Map();
    let cachedPack, cachedEntities, cachedVersion, cachedComplete, catalog = buildWikiEntityCatalog(), sequence = 0, warned = false;
    try {
        const raw = storage?.getItem(IGNORE_KEY);
        if (raw && raw.length <= 1024 * 1024) {
            const saved = JSON.parse(raw);
            const load=(entries,target)=>{for(const key of (Array.isArray(entries)?entries:[]).slice(-MAX_IGNORED))if(typeof key==='string'&&/^(?:item|monster)\|/.test(key)&&key.length<=520){const separator=key.indexOf('|'),kind=key.slice(0,separator),name=key.slice(separator+1);target.add(`${kind}|${kind==='item'?wikiIdentityKey(kind,name).slice(5):normalizeWikiIdentity(name)}`);}};
            load(saved?.ignored,saved?.schemaVersion===2?ignored:legacyIgnored);load(saved?.legacyIgnored,legacyIgnored);
            while(ignored.size+legacyIgnored.size>MAX_IGNORED)legacyIgnored.delete(legacyIgnored.values().next().value);
        }
    } catch { /* Invalid local suppression data must not stop log following. */ }
    function currentCatalog() {
        let pack;
        try { pack = getPack() || {}; } catch { return buildWikiEntityCatalog(); }
        const version = pack.meta?.manifestVersion || pack.meta?.version || '';
        const complete = pack.meta?.wikiEntitiesComplete === true && pack.meta?.sample !== true;
        if (pack !== cachedPack || pack.wikiEntities !== cachedEntities || version !== cachedVersion || complete !== cachedComplete) {
            cachedPack = pack; cachedEntities = pack.wikiEntities; cachedVersion = version; cachedComplete = complete; catalog = buildWikiEntityCatalog(pack);
        }
        return catalog;
    }
    function remember(set, key, limit) { set.add(key); if (set.size > limit) set.delete(set.values().next().value); }
    function consume(event, context = {}) {
        // Considers and nearby casting are not evidence of an NPC death.
        // Ignore them before advancing the live-log replay watermark.
        if (context.live !== true || !event || !['kill','loot'].includes(event.type)) return null;
        const at = event.at ?? context.at, current = now();
        if (!finite(at) || !finite(current) || current - at > freshnessMs || at - current > 2000) return null;
        const source = clean(context.logId || 'current');
        const previous = watermarks.get(source);
        if (finite(previous) && at < previous) return null;
        watermarks.set(source, Math.max(previous ?? -Infinity, at));
        if (watermarks.size > 8) watermarks.delete(watermarks.keys().next().value);
        let kind, value;
        if (event.type === 'kill') { kind = 'monster'; value = event.victim; }
        else if (event.type === 'loot') { kind = 'item'; value = event.item; }
        else return null;
        const name = clean(value).slice(0, 240), canonical = wikiIdentityKey(kind,name).split('|').slice(1).join('|');
        if (!canonical) return null;
        const players = new Set(['you','yourself',...(Array.isArray(context.playerNames)?context.playerNames.slice(0,200):[]).map(normalizeWikiIdentity)]);
        if (kind === 'monster' && (event.isPlayer === true || event.victimIsPlayer === true || event.targetType === 'player' || event.isPet === true || players.has(normalizeWikiIdentity(name)))) return null;
        const index = currentCatalog(), key = `${kind}|${canonical}`,resolved=index.resolve(kind,name);
        let suppressed=false;try{suppressed=getSuppression(kind,name,{zone:context.zone||event.zone||'',purpose:'missing-page'})?.suppressed===true;}catch{/* Local state failure never proves an entity missing. */return null;}
        // Old Ignore keys erased grammatical articles. Preserve only that
        // historical suppression; never use it to establish page identity.
        const legacyName=normalizeWikiIdentity(kind==='item'?itemBaseIdentity(name).name:name).replace(/[.!]+$/,'').replace(/^(?:a|an|the)\s+/,'');
        if (resolved.membership!=='missing' || suppressed || kind==='monster'&&!classifyNpcEvidence(name,resolved).eligible || ignored.has(key) || legacyIgnored.has(`${kind}|${legacyName}`) || seen.has(key)) return null;
        if (current - (cooldowns.get(key) ?? -Infinity) < cooldownMs || pending.size >= MAX_PENDING) return null;
        const id = `wiki-${kind}-${hash(key)}-${++sequence}`;
        const prompt = { id, kind, name, zone:clean(context.zone || event.zone).slice(0, 160),...(event.type==='kill'?{hint:'Saved in Contribute. Record the monster’s spawn /loc there, then review its loot and zone.'}:{}) };
        pending.set(id, { key, prompt }); remember(seen, key, MAX_SEEN); cooldowns.set(key, current);
        if (cooldowns.size > MAX_SEEN) cooldowns.delete(cooldowns.keys().next().value);
        const failed = () => {
            pending.delete(id); seen.delete(key); cooldowns.delete(key);
            try { onWarning('The wiki discovery prompt could not open. It can be suggested again when encountered.'); } catch { /* A warning must not stop log parsing. */ }
        };
        try {
            const delivery = onMissing({ ...prompt });
            if (delivery && typeof delivery.then === 'function') Promise.resolve(delivery).then(result => { if (result?.error) failed(); }, failed);
        } catch { failed(); return null; }
        return { ...prompt };
    }
    function ignore(id) {
        const item = pending.get(id); if (!item) return false;
        remember(ignored, item.key, MAX_IGNORED); pending.delete(id);
        while(ignored.size+legacyIgnored.size>MAX_IGNORED)legacyIgnored.delete(legacyIgnored.values().next().value);
        try{onIgnore(item.prompt.kind,item.prompt.name,{zone:item.prompt.zone,purpose:'missing-page'});}catch{/* Keep the local Ignore even if the shared store is unavailable. */}
        try { storage?.setItem(IGNORE_KEY, JSON.stringify({ schemaVersion:2, ignored:[...ignored],legacyIgnored:[...legacyIgnored] })); }
        catch { if (!warned) { warned = true; try { onWarning('Ignored wiki suggestions could not be saved on this PC.'); } catch { /* Keep in-memory Ignore working. */ } } }
        return true;
    }
    return { consume, ignore, dismiss(id) { return pending.delete(id); },
        snapshot() { return { complete:currentCatalog().complete, pending:[...pending.values()].map(item => ({ ...item.prompt })), ignoredCount:ignored.size+legacyIgnored.size }; } };
}
