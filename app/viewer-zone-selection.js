import { viewerZoneName,viewerArchiveIds } from './zone-identity.js';

function normalized(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function uniqueZone(entries) {
    if (!entries.length || new Set(entries.map(entry => normalized(entry.id))).size !== 1) return null;
    return entries.find(entry => entry.format === 'S3D')?.option || entries[0].option;
}

/** Match archive identity before display text; ambiguous names never select a zone. */
export function selectViewerZoneOption(options, value) {
    const wanted = normalized(value);
    if (!wanted) return null;
    const canonical = normalized(viewerZoneName(value));
    const entries = Array.from(options || []).flatMap(option => {
        const match = String(option.value || '').match(/^(S3D|EQG):([^:]+)$/i);
        if (!match || option.disabled) return [];
        const [, format, id] = match;
        // The viewer renders "Display Name — shortname (FORMAT)". Strip only
        // that known suffix so names such as "Neriak - Commons" stay intact.
        const suffix = ` ${id} (${format})`;
        let label = String(option.textContent || '').trim();
        if (normalized(label).endsWith(normalized(suffix))) {
            label = label.slice(0, -suffix.length).replace(/\s+[—–-]\s*$/, '').trim();
        }
        const names = [label, ...label.split(/\s+\/\s+/)].map(name => normalized(viewerZoneName(name)));
        return [{ option, format:format.toUpperCase(), id, names }];
    });
    const fullIdentity = entries.find(entry => normalized(entry.option.value) === wanted);
    if (fullIdentity) return fullIdentity.option;
    const byId = uniqueZone(entries.filter(entry => normalized(entry.id) === wanted || normalized(entry.id) === canonical));
    if (byId) return byId;
    const equivalents=viewerArchiveIds(wanted).slice(1);
    for(const id of equivalents){const equivalent=uniqueZone(entries.filter(entry=>normalized(entry.id)===id));if(equivalent)return equivalent;}
    return uniqueZone(entries.filter(entry => entry.names.includes(wanted) || entry.names.includes(canonical)));
}
