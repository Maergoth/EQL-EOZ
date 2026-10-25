// Generated-name heuristic pinned to GetRandPetName, not an NPC type detector.
// https://github.com/EQEmu/EQEmu/blob/4aceae18b94ffaafc08e2b17bc41cd72c77f795d/zone/pets.cpp#L30-L62
// Do not broaden the generated-name heuristic to prefixes or arbitrary syllables.
import { normalizeWikiIdentity } from './wiki-identity.js';
export const GENERATED_PET_SOURCE = '4aceae18b94ffaafc08e2b17bc41cd72c77f795d:zone/pets.cpp:GetRandPetName';
const generated = new Set();
for (const first of ['g','j','k','l','v','x','z']) for (const second of ['', 'ab','ar','as','eb','en','ib','ob','on']) for (const third of ['', 'an','ar','ek','ob']) for (const fourth of ['er','ab','n','tik']) {
    if (!second && !third && fourth !== 'tik' || third === 'ek' && fourth === 'tik' || first === 'l' && second === 'as' && !third && fourth === 'er') continue;
    generated.add(first + second + third + fourth);
}
export function isGeneratedPetName(name) { return generated.has(normalizeWikiIdentity(name)); }
export function isOwnedPetName(name){
    const label=normalizeWikiIdentity(name).replace(/[.!?,;:]+$/,'').replace(/^(?:the )?corpse of /,'').replace(/(?:'s corpse| \(corpse\))$/,'').trim();
    // NPC-controlled pets can be labelled "a loathling lich pet" without a
    // possessive owner. Only the final whole token identifies this explicit
    // label; petal, carpet, Pet Rock and pet-prefixed monster names stay intact.
    return /^[\p{L}\p{N}][\p{L}\p{N}' .-]{0,183} pet$/u.test(label);
}
export function classifyNpcEvidence(name, resolution = {}) {
    // An explicit pet label identifies a pet even if a stale local catalog
    // contains the same display name. The classification contains no owner identity.
    if(isOwnedPetName(name))return {eligible:false,reason:'owned-pet',heuristic:false};
    if (resolution.membership === 'present') return {eligible:true,reason:'known-npc',heuristic:false};
    if (resolution.membership === 'ambiguous') return {eligible:true,reason:'ambiguous-npc',heuristic:false};
    return isGeneratedPetName(name) ? {eligible:false,reason:'generated-pet',heuristic:true,source:GENERATED_PET_SOURCE} : {eligible:true,reason:'unclassified-npc',heuristic:false};
}
