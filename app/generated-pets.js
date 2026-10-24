// Generated-name heuristic pinned to GetRandPetName, not an NPC type detector.
// https://github.com/EQEmu/EQEmu/blob/4aceae18b94ffaafc08e2b17bc41cd72c77f795d/zone/pets.cpp#L30-L62
// Do not broaden to custom pets, prefixes, short names or arbitrary syllables.
import { normalizeWikiIdentity } from './wiki-identity.js';
export const GENERATED_PET_SOURCE = '4aceae18b94ffaafc08e2b17bc41cd72c77f795d:zone/pets.cpp:GetRandPetName';
const generated = new Set();
for (const first of ['g','j','k','l','v','x','z']) for (const second of ['', 'ab','ar','as','eb','en','ib','ob','on']) for (const third of ['', 'an','ar','ek','ob']) for (const fourth of ['er','ab','n','tik']) {
    if (!second && !third && fourth !== 'tik' || third === 'ek' && fourth === 'tik' || first === 'l' && second === 'as' && !third && fourth === 'er') continue;
    generated.add(first + second + third + fourth);
}
export function isGeneratedPetName(name) { return generated.has(normalizeWikiIdentity(name)); }
export function classifyNpcEvidence(name, resolution = {}) {
    if (resolution.membership === 'present') return {eligible:true,reason:'known-npc',heuristic:false};
    if (resolution.membership === 'ambiguous') return {eligible:true,reason:'ambiguous-npc',heuristic:false};
    return isGeneratedPetName(name) ? {eligible:false,reason:'generated-pet',heuristic:true,source:GENERATED_PET_SOURCE} : {eligible:true,reason:'unclassified-npc',heuristic:false};
}
