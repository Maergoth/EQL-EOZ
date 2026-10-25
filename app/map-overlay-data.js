// Ordinary client map text only. The main renderer owns file access; native
// overlays receive geometry through the authenticated lazy data broker.
import {viewerArchiveIds} from './zone-identity.js';
const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
export function selectMapFamily(files, zone, shortName = '') {
    const requested=viewerArchiveIds(shortName||zone?.viewerId).map(key),aliases=[...new Set([...requested,...(zone?.aliases||[]),zone?.viewerName,zone?.name].map(key).filter(Boolean))];
    if(shortName&&zone?.aliases?.length&&!requested.some(id=>zone.aliases.some(alias=>key(alias)===id)))return null;
    const families = new Map();
    for (const file of files || []) {
        const path = String(file.path || '').replace(/\\/g, '/');
        const match = path.match(/^(.*\/)([^/]+?)(?:_([123]))?\.txt$/i);
        if (!match || !/(?:^|\/)maps(?:\/|$)/i.test(match[1])) continue;
        if(requested.length&&!requested.includes(key(match[2])))continue;
        const priority = aliases.indexOf(key(match[2]));
        if (priority < 0) continue;
        const directory = match[1].replace(/\/$/, '');
        const id = `${directory.toLowerCase()}|${key(match[2])}`;
        if (!families.has(id)) families.set(id, { directory, priority, layers:[], bytes:0 });
        const family = families.get(id);
        family.layers.push({ ...file, layer:Number(match[3] || 0), path }); family.bytes += Number(file.size) || 0;
    }
    const ordered = [...families.values()].sort((a,b) => (requested.length?a.priority-b.priority:0)||Number(/^maps$/i.test(b.directory)) - Number(/^maps$/i.test(a.directory)) ||
        Number(b.layers.some(file => file.layer === 0)) - Number(a.layers.some(file => file.layer === 0)) || a.priority-b.priority || a.directory.localeCompare(b.directory));
    if (!ordered.length) return null;
    const family = ordered[0]; family.layers.sort((a,b) => a.layer-b.layer);
    return family;
}

export function parseClientMap(text, layer = 0) {
    const lines = [], labels = [];
    if (typeof text !== 'string' || text.length > 16 * 1024 * 1024) throw new Error('This map file is too large to display.');
    for (const raw of text.split(/\r?\n/)) {
        const type = raw.trim()[0]?.toUpperCase();
        if (type !== 'L' && type !== 'P') continue;
        const fields = raw.trim().slice(1).trim().split(',').map(value => value.trim());
        if (type === 'L') {
            const values = fields.slice(0, 9).map(Number);
            if (values.length !== 9 || !values.every(Number.isFinite)) continue;
            if (values.slice(0,6).some(value => Math.abs(value) > 1e7)) continue;
            lines.push([...values.slice(0,6), ...values.slice(6).map(value => Math.max(0,Math.min(255,value))), layer]);
        } else {
            const values = fields.slice(0,7).map(Number);
            if (values.length !== 7 || !values.every(Number.isFinite)) continue;
            const label = fields.slice(7).join(',').replace(/_/g,' ').slice(0, 180);
            if (label) labels.push({ x:values[0],y:values[1],z:values[2],label,layer });
        }
        if (lines.length > 100000 || labels.length > 10000) throw new Error('This map exceeds the overlay display limit. Open Map Explorer for this zone.');
    }
    return { lines, labels };
}

export function createMapDataLoader({ getManifest, readText, resolveZone, getRootKey = () => '' }) {
    let rootKey = '', manifest = null, generation = 0;
    const cache = new Map();
    function invalidate() { generation++;manifest=null;cache.clear(); }
    return { async load(zoneName, shortName = '') {
        const currentRoot = getRootKey();
        if (currentRoot !== rootKey) { rootKey=currentRoot;invalidate(); }
        const owner = generation;
        const assertCurrent = () => {
            if (owner !== generation || getRootKey() !== currentRoot) throw new Error('The selected map folder changed while the map was loading. Retry this map.');
        };
        const record = resolveZone(zoneName);
        if (!record && !shortName) return { zone:zoneName, status:'unavailable', message:'This zone has no matching map identity.', lines:[], labels:[] };
        if (!manifest) {
            // A prior folder's slow scan must never replace the current folder's
            // manifest, even if another load has already completed in between.
            const scanned = await getManifest();
            assertCurrent();
            manifest = scanned;
        }
        assertCurrent();
        if (manifest.truncated) throw new Error('The local file inventory is incomplete. Open Map Explorer or choose the EverQuest installation folder.');
        const family = selectMapFamily(manifest.files, record || {name:zoneName}, shortName);
        if (!family) return { zone:zoneName, status:'missing', message:'No matching client map was found. Check your selected EverQuest folder and its Maps directory.', lines:[], labels:[] };
        const id = JSON.stringify([zoneName,currentRoot,family.layers.map(file => [file.path,file.lastModified,file.size])]);
        if (cache.has(id)) return cache.get(id);
        if (family.bytes > 32*1024*1024) throw new Error('The client map is too large for the overlay.');
        const lines=[],labels=[];
        for (const file of family.layers) {
            const contents = await readText(file.path);
            assertCurrent();
            const parsed = parseClientMap(contents,file.layer);
            lines.push(...parsed.lines); labels.push(...parsed.labels);
        }
        if (lines.length > 100000 || labels.length > 10000) throw new Error('The map exceeds the overlay display limit.');
        const data = { zone:zoneName, status:lines.length ? 'ready' : 'empty', sourceLabel:/^maps$/i.test(family.directory) ? 'Default maps' : family.directory.split('/').slice(1).join('/'),
            layers:family.layers.map(file => file.layer), lines, labels, message:lines.length ? '' : 'The matching map has no line geometry.' };
        if (new TextEncoder().encode(JSON.stringify(data)).length > 7*1024*1024) throw new Error('The map exceeds the overlay transfer limit.');
        cache.set(id,data); if (cache.size>3) cache.delete(cache.keys().next().value);
        return data;
    }, invalidate };
}
