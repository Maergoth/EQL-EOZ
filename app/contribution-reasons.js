import { normalizeWikiIdentity as key, itemBaseIdentity } from './wiki-identity.js';
import { classifyNpcEvidence } from './generated-pets.js';
const same = (resolver, kind, a, b) => {
    const first=resolver.resolve(kind,a),second=resolver.resolve(kind,b);
    if(first.membership==='ambiguous'||second.membership==='ambiguous')return false;
    return key(first.canonicalTitle||first.name)===key(second.canonicalTitle||second.name);
};
const instance = value => ['normal','raid'].includes(value?.instance || value?.instanceType) ? value.instance || value.instanceType : typeof value?.raidInstance==='boolean' ? value.raidInstance?'raid':'normal' : 'unknown';
const instanceMatches=(observed,cached)=>instance(observed)==='unknown'||instance(cached)==='unknown'||instance(observed)===instance(cached);
export function hasInferredBase(record={}) {
    return record.baseStatsInferred===true || record.baseRecovery?.inferred===true ||
        /These stats are reverse calculated from a tier (?:10|[0-9]) item\. Please confirm with a tier 0 item and remove this message/i.test(String(record.notes||'')) ||
        /Base statistics were proposed by reversing a reviewed tier\b/i.test(String(record.notes||'')) && /this is an inference, not a base-item capture/i.test(String(record.notes||''));
}
export function contributionReasons(candidate, resolver) {
    const resolved=resolver.resolve(candidate.kind,candidate.name),reasons=[];
    if(candidate.kind==='npc'){const classification=classifyNpcEvidence(candidate.name,resolved);if(!classification.eligible)return {resolved,reasons,excluded:classification.reason};}
    if(resolved.membership==='missing')reasons.push('missing-page');
    if(resolved.membership==='unknown')reasons.push('catalog-unknown');
    if(resolved.membership==='ambiguous')reasons.push('identity-review');
    const records=resolved.records||[],relations=candidate.relations||[],fields=candidate.fields||{};
    if(candidate.kind==='item') {
        const explicit=relations.filter(r=>r.type==='drop-source'&&r.evidence==='explicit-corpse'&&r.name&&r.zone&&classifyNpcEvidence(r.name,resolver.resolve('npc',r.name)).eligible);
        if(resolved.membership==='present'&&explicit.length&&records.some(record=>Array.isArray(record.dropSources))) {
            const sources=records.flatMap(record=>record.dropSources||[]);
            if(explicit.some(relation=>!sources.some(source=>same(resolver,'npc',source.name,relation.name)&&same(resolver,'zone',source.zone,relation.zone)&&instanceMatches(relation,source))))reasons.push('missing-source');
        }
        if(candidate.baseRecovery || records.some(hasInferredBase) || !candidate.baseVerification&&candidate.tierZeroEvidence?.length)reasons.push('tier0-verification');
    }
    if(resolved.membership==='present'&&candidate.kind==='npc') {
        const zones=relations.filter(r=>r.type==='mob-zone'&&r.zone&&['kill','consider','explicit-corpse'].includes(r.evidence));
        if(zones.length&&records.length&&zones.some(relation=>!records.some(record=>record.zone&&same(resolver,'zone',record.zone,relation.zone)&&instanceMatches(relation,record))))reasons.push('missing-population');
        const loot=Array.isArray(fields.knownLoot?.value)?fields.knownLoot.value:[];
        if(loot.some(name=>{
            const item=resolver.resolve('item',itemBaseIdentity(name).name);
            if(item.membership!=='present'||!item.records.some(record=>Array.isArray(record.dropSources)))return false;
            return !item.records.flatMap(record=>record.dropSources||[]).some(source=>same(resolver,'npc',source.name,candidate.name)&&same(resolver,'zone',source.zone,candidate.zone)&&instanceMatches(candidate,source));
        }))reasons.push('missing-source');
    }
    if(resolved.membership==='present'&&candidate.kind==='zone') {
        const population=relations.filter(r=>r.type==='zone-population'&&r.name&&r.zone);
        if(population.some(relation=>{
            const npc=resolver.resolve('npc',relation.name);
            return npc.membership==='missing'||npc.records.length&&!npc.records.some(record=>same(resolver,'zone',record.zone,candidate.name)&&instanceMatches(relation,record));
        }))reasons.push('missing-population');
        // A bare acquired-in-zone event is not a source claim. Require the
        // accompanying corpse/source association before proposing zone loot.
        if(relations.some(relation=>relation.type==='drop-source'&&relation.evidence==='explicit-corpse'&&relation.zone&&relation.item&&(()=>{
            const item=resolver.resolve('item',relation.item);
            return item.membership==='missing'||item.records.some(record=>Array.isArray(record.dropSources))&&!item.records.flatMap(record=>record.dropSources||[]).some(source=>same(resolver,'zone',source.zone,candidate.name)&&same(resolver,'npc',source.name,relation.name)&&instanceMatches(relation,source));
        })()))reasons.push('missing-source');
    }
    return {resolved,reasons:[...new Set(reasons)],excluded:null};
}
