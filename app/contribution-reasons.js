import { normalizeWikiIdentity as key, itemBaseIdentity } from './wiki-identity.js';
import { classifyNpcEvidence } from './generated-pets.js';
import { skipAutomaticSourceBackfill,skipBroadAutomaticSourceBackfill } from './automatic-source-policy.js';
import { cachedContributionCoverage } from './contribution-coverage.js';
const same = (resolver, kind, a, b) => {
    const first=resolver.resolve(kind,a),second=resolver.resolve(kind,b);
    if(first.membership==='ambiguous'||second.membership==='ambiguous')return false;
    return key(first.canonicalTitle||first.name)===key(second.canonicalTitle||second.name);
};
const instance = value => ['normal','raid'].includes(value?.instance || value?.instanceType) ? value.instance || value.instanceType : typeof value?.raidInstance==='boolean' ? value.raidInstance?'raid':'normal' : 'unknown';
const instanceMatches=(observed,cached)=>instance(observed)==='unknown'||instance(cached)==='unknown'||instance(observed)===instance(cached);
// Reuse the gap classifier's identity/instance rules when describing the
// destination delta; observed history is not automatically a missing fact.
export const contributionSameIdentity=same;
export const contributionInstanceMatches=instanceMatches;
export const contributionNpcIncludesZone=(resolver,record,zone,observed={})=>instanceMatches(observed,record)&&(record.zoneScope==='various'||record.zone&&same(resolver,'zone',record.zone,zone)||instance(observed)!=='raid'&&instance(record)!=='raid'&&Array.isArray(record.categoryZones)&&record.categoryZones.some(value=>same(resolver,'zone',value,zone)));
// An empty exported zone is not evidence that the authored page lacks it.
// Older catalogs could omit zones outside the curated map registry entirely.
export function contributionNpcZoneStatus(resolver,records,zone,observed={}){
    if(records.some(record=>contributionNpcIncludesZone(resolver,record,zone,observed)))return 'recorded';
    if(!records.length||records.some(record=>instanceMatches(observed,record)&&!record.zone&&!record.zoneScope&&!(Array.isArray(record.categoryZones)&&record.categoryZones.length)))return 'unknown';
    return 'missing';
}
export function hasInferredBase(record={}) {
    return record.baseStatsInferred===true || record.baseRecovery?.inferred===true ||
        /These stats are reverse calculated from a tier (?:10|[0-9]) item\. Please confirm with a tier 0 item and remove this message/i.test(String(record.notes||'')) ||
        /Base statistics were proposed by reversing a reviewed tier\b/i.test(String(record.notes||'')) && /this is an inference, not a base-item capture/i.test(String(record.notes||''));
}
export function contributionReasons(candidate, resolver, {pack}={}) {
    const resolved=resolver.resolve(candidate.kind,candidate.name),reasons=[];
    if(candidate.kind==='npc'){const classification=classifyNpcEvidence(candidate.name,resolved);if(!classification.eligible)return {resolved,reasons,excluded:classification.reason};}
    if(resolved.membership==='missing')reasons.push('missing-page');
    if(resolved.membership==='unknown')reasons.push('catalog-unknown');
    if(resolved.membership==='ambiguous')reasons.push('identity-review');
    const records=resolved.records||[],relations=candidate.relations||[],fields=candidate.fields||{};
    const sourceMissing=(item,npc,zone,observed)=>{
        const coverage=cachedContributionCoverage(pack||{},{item,npc,zone,instance:observed.instance},{resolver});
        if(coverage.state==='covered')return false;
        if(candidate.manual!==true&&(skipAutomaticSourceBackfill(pack,item,{resolver})||skipBroadAutomaticSourceBackfill(pack,item,{coverage,resolver})))return false;
        // New monsters keep their discovery task; an item source is not an
        // authorization to publish a redlink or create a monster implicitly.
        if(candidate.manual!==true&&resolver.resolve('npc',npc).membership!=='present')return false;
        return true;
    };
    if(candidate.kind==='item') {
        const explicit=relations.filter(r=>r.type==='drop-source'&&r.evidence==='explicit-corpse'&&r.name&&r.zone&&classifyNpcEvidence(r.name,resolver.resolve('npc',r.name)).eligible);
        if(resolved.membership==='present'&&explicit.length&&records.some(record=>Array.isArray(record.dropSources))&&!skipAutomaticSourceBackfill(pack,candidate.name,{resolver,manual:candidate.manual===true})) {
            if(explicit.some(relation=>sourceMissing(candidate.name,relation.name,relation.zone,relation)))reasons.push('missing-source');
        }
        if(candidate.baseRecovery || records.some(hasInferredBase) || !candidate.baseVerification&&candidate.tierZeroEvidence?.length)reasons.push('tier0-verification');
    }
    if(resolved.membership==='present'&&candidate.kind==='npc') {
        const zones=relations.filter(r=>r.type==='mob-zone'&&r.zone&&['kill','consider','explicit-corpse'].includes(r.evidence));
        if(zones.length&&records.length&&zones.some(relation=>contributionNpcZoneStatus(resolver,records,relation.zone,relation)==='missing'))reasons.push('missing-population');
        const loot=Array.isArray(fields.knownLoot?.value)?fields.knownLoot.value:[];
        if(candidate.manual===true&&loot.some(name=>{
            const item=resolver.resolve('item',itemBaseIdentity(name).name);
            if(item.membership!=='present'||!item.records.some(record=>Array.isArray(record.dropSources)))return false;
            return sourceMissing(name,candidate.name,candidate.zone,candidate);
        }))reasons.push('missing-source');
    }
    if(resolved.membership==='present'&&candidate.kind==='zone') {
        const population=relations.filter(r=>r.type==='zone-population'&&r.name&&r.zone);
        if(population.some(relation=>{
            const npc=resolver.resolve('npc',relation.name);
            return npc.membership==='missing'||contributionNpcZoneStatus(resolver,npc.records,candidate.name,relation)==='missing';
        }))reasons.push('missing-population');
        // A bare acquired-in-zone event is not a source claim. Require the
        // accompanying corpse/source association before proposing zone loot.
        if(candidate.manual===true&&relations.some(relation=>relation.type==='drop-source'&&relation.evidence==='explicit-corpse'&&relation.zone&&relation.item&&(()=>{
            const item=resolver.resolve('item',relation.item);
            return (item.membership==='missing'||item.records.some(record=>Array.isArray(record.dropSources)))&&sourceMissing(relation.item,relation.name,candidate.name,relation);
        })()))reasons.push('missing-source');
    }
    return {resolved,reasons:[...new Set(reasons)],excluded:null};
}
