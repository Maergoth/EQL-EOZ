export const CON_ORDER = ['gray', 'green', 'light-blue', 'blue', 'white', 'yellow', 'red'];

/*
 * Modern EverQuest consider bands, matching the server-side con-level rules:
 * equal = white, +1..+3 = yellow, and +4 or more = red. Lower-level bands
 * widen as the player levels and, above level 20, include light blue between
 * blue and green. Reference: EQEmu's modern (UseOldConSystem=false)
 * Mob::GetLevelCon implementation in zone/mob_ai.cpp.
 */

export function grayCeilingForPlayerLevel(playerLevel) {
    const player = Math.max(1, Math.floor(Number(playerLevel) || 0));
    if (player <= 15) return player - 6;
    return player - Math.floor((player + 5) / 3);
}

export function greenCeilingForPlayerLevel(playerLevel) {
    const player = Math.max(1, Math.floor(Number(playerLevel) || 0));
    if (player <= 15) return grayCeilingForPlayerLevel(player);
    return player - Math.floor((player + 7) / 4);
}

export function conForLevel(mobLevel, playerLevel) {
    const mob = Math.round(Number(mobLevel));
    const player = Math.round(Number(playerLevel));
    if (!Number.isFinite(mob) || mob <= 0 || !Number.isFinite(player) || player <= 0) {
        return { key: 'unknown', label: 'Unknown', delta: null };
    }

    const delta = mob - player;

    if (delta >= 4) return { key: 'red', label: 'Red', delta };
    if (delta >= 1) return { key: 'yellow', label: 'Yellow', delta };
    if (delta === 0) return { key: 'white', label: 'White', delta };

    if (mob <= grayCeilingForPlayerLevel(player)) return { key: 'gray', label: 'Gray', delta };
    if (player > 15 && mob <= greenCeilingForPlayerLevel(player)) return { key: 'green', label: 'Green', delta };
    if (player > 20 && delta <= -6) return { key: 'light-blue', label: 'Light blue', delta };
    return { key: 'blue', label: 'Blue', delta };
}
