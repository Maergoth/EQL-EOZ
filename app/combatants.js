// Combatant totals are accumulated at intake, before any display-event limits.
// Names describe the log, without guessing NPC/player status or pet ownership.
const metrics = ['damage', 'healing', 'taken'];
const finite = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const label = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
const OTHER = 'Other combatants (grouped)';
export const COMBATANT_LIMIT = 256;
const ABILITY_LIMIT = 32;
export const createCombatants = () => ({ rows:[], startedAt:null, lastAt:null });
const blank = name => ({ name, damage:0, healing:0, taken:0, damageHits:0, healingHits:0, takenHits:0, breakdowns:{ damage:[], healing:[], taken:[] } });
function rowFor(state, name) {
    name = label(name) || 'Unknown combatant';
    let row = state.rows.find(row => row.name.toLowerCase() === name.toLowerCase());
    if (!row) {
        if (state.rows.length >= COMBATANT_LIMIT) name = OTHER;
        row = state.rows.find(row => row.name === name);
        if (!row) state.rows.push(row = blank(name));
    }
    return row;
}
function add(row, metric, value, name) {
    row[metric] += value; row[`${metric}Hits`]++;
    const rows = row.breakdowns[metric];
    name = label(name) || (metric === 'taken' ? 'Unknown attacker' : 'Unknown ability');
    let ability = rows.find(row => row.name === name);
    if (!ability) {
        if (rows.length >= ABILITY_LIMIT) name = metric === 'taken' ? 'Other attackers' : 'Other abilities';
        ability = rows.find(row => row.name === name);
        if (!ability) rows.push(ability = { name, total:0, count:0 });
    }
    ability.total += value; ability.count++;
}
export function accumulateCombatants(state, event, character = 'You') {
    const self = label(character) || 'You';
    const resolve = name => /^you(?:rself)?$/i.test(label(name)) ? self : label(name);
    let actor, recipient, metric;
    if (event.type === 'damage') { actor = self; recipient = resolve(event.victim); metric = 'damage'; }
    else if (event.type === 'taken') { actor = resolve(event.attacker) || 'Unknown attacker'; recipient = resolve(event.target) || self; metric = 'damage'; }
    else if (event.type === 'heal') { actor = self; recipient = resolve(event.target); metric = 'healing'; }
    else if (event.type === 'combatant-damage' || event.type === 'combatant-heal') {
        actor = resolve(event.actor) || 'Unknown combatant'; recipient = resolve(event.target);
        if (/^(?:itself|himself|herself|themselves)$/i.test(recipient)) recipient = actor;
        metric = event.type === 'combatant-heal' ? 'healing' : 'damage';
    } else if (event.type === 'kill') { if (event.victim) rowFor(state, resolve(event.victim)); return; }
    else return;
    const value = finite(event.amount);
    const at = finite(event.at);
    if (state.startedAt === null) state.startedAt = at;
    state.lastAt = Math.max(state.lastAt ?? at, at);
    add(rowFor(state, actor), metric, value, event.source || event.kind);
    if (recipient) {
        const target = rowFor(state, recipient);
        if (metric === 'damage') add(target, 'taken', value, actor);
    }
}
export function combatantSnapshot(state, { seconds, character, selfSeconds } = {}) {
    seconds ??= state.startedAt === null ? 0 : Math.max(1, (state.lastAt - state.startedAt) / 1000);
    const rows = state.rows.map(row => ({ ...row,
        dps:character && row.name.toLowerCase() === character.toLowerCase() && Number.isFinite(selfSeconds) ? selfSeconds ? row.damage / selfSeconds : 0 : seconds ? row.damage / seconds : 0,
        hps:seconds ? row.healing / seconds : 0, dtps:seconds ? row.taken / seconds : 0,
        breakdowns:Object.fromEntries(metrics.map(key => [key, row.breakdowns[key].map(ability => ({...ability}))]))
    }));
    return { seconds, rows };
}

// Transport fitting may group rows, but never discard their totals/counts.
export function compactCombatants(source, limit = COMBATANT_LIMIT, abilityLimit = ABILITY_LIMIT) {
    if (!Array.isArray(source)) return [];
    const rows = source.map(value => {
        const row = blank(label(value.name) || 'Unknown combatant');
        for (const key of [...metrics, ...metrics.map(key => `${key}Hits`), 'dps', 'hps', 'dtps']) row[key] = finite(value[key]);
        for (const metric of metrics) row.breakdowns[metric] = (value.breakdowns?.[metric] || []).map(ability => ({ name:label(ability.name) || 'Unknown ability', total:finite(ability.total), count:finite(ability.count) }));
        return row;
    }).sort((a,b) => b.damage - a.damage || b.taken - a.taken || b.healing - a.healing || a.name.localeCompare(b.name));
    if (rows.length > limit) {
        const other = blank(OTHER);
        for (const row of rows.splice(Math.max(0, limit - 1))) {
            for (const key of [...metrics, ...metrics.map(key => `${key}Hits`), 'dps', 'hps', 'dtps']) other[key] = finite(other[key]) + row[key];
            for (const metric of metrics) other.breakdowns[metric].push(...row.breakdowns[metric]);
        }
        rows.push(other);
    }
    for (const row of rows) for (const metric of metrics) {
        const grouped = new Map();
        for (const ability of row.breakdowns[metric]) {
            const prior = grouped.get(ability.name) || { name:ability.name, total:0, count:0 };
            prior.total += ability.total; prior.count += ability.count; grouped.set(ability.name, prior);
        }
        const abilities = [...grouped.values()].sort((a,b) => b.total - a.total);
        if (abilities.length > abilityLimit) {
            const rest = abilities.splice(Math.max(0, abilityLimit - 1));
            abilities.push({ name:metric === 'taken' ? 'Other attackers' : 'Other abilities', total:rest.reduce((n,row) => n + row.total,0), count:rest.reduce((n,row) => n + row.count,0) });
        }
        row.breakdowns[metric] = abilities;
    }
    return rows;
}
