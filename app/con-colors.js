export const CON_ORDER = ['gray', 'green', 'blue', 'white', 'yellow', 'red'];

/*
 * EverQuest Legends con model.
 *
 * White / yellow / red are the classic relative-level rules:
 *   same level = white, +1/+2 = yellow, +3+ = red.
 *
 * For lower-level NPCs, classic EQ widens the blue range as the player
 * levels. The 0.75 threshold below reproduces the documented classic blue
 * floor from level 14 onward; levels 1-13 use the documented fixed ranges.
 *
 * Legends exposes both green and gray/trivial presentation. Exact Legends
 * green->gray cutoffs are not currently present in the supplied log, so the
 * lower cutoff uses the familiar ~0.66 challenge threshold. Keeping these
 * rules isolated here makes future calibration a one-file change.
 */

function eqThresholdRound(value) {
    // Classic /consider references describe .50 as rounding down, while
    // values above .50 round up. Integer level products make this stable.
    return Math.floor(Number(value) + 0.49);
}

export function blueFloorForPlayerLevel(playerLevel) {
    const player = Math.max(1, Math.floor(Number(playerLevel) || 0));
    if (!player) return 0;
    if (player <= 12) return Math.max(1, player - 3);
    if (player === 13) return 9;
    return Math.max(1, eqThresholdRound(player * 0.75));
}

export function greenFloorForPlayerLevel(playerLevel) {
    const player = Math.max(1, Math.floor(Number(playerLevel) || 0));
    if (!player) return 0;
    const blueFloor = blueFloorForPlayerLevel(player);
    // Keep a distinct green band immediately below blue. Below this is gray.
    return Math.max(1, Math.min(blueFloor - 1, eqThresholdRound(player * 0.66)));
}

export function conForLevel(mobLevel, playerLevel) {
    const mob = Math.round(Number(mobLevel));
    const player = Math.round(Number(playerLevel));
    if (!Number.isFinite(mob) || mob <= 0 || !Number.isFinite(player) || player <= 0) {
        return { key: 'unknown', label: 'Unknown', delta: null };
    }

    const delta = mob - player;

    if (delta >= 3) return { key: 'red', label: 'Red', delta };
    if (delta >= 1) return { key: 'yellow', label: 'Yellow', delta };
    if (delta === 0) return { key: 'white', label: 'White', delta };

    const blueFloor = blueFloorForPlayerLevel(player);
    if (mob >= blueFloor) return { key: 'blue', label: 'Blue', delta };

    const greenFloor = greenFloorForPlayerLevel(player);
    if (mob >= greenFloor) return { key: 'green', label: 'Green', delta };

    return { key: 'gray', label: 'Gray', delta };
}
