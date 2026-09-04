function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

/**
 * EverQuest writes /loc as Y, X, Z. Eye of Zomm keeps runtime positions in
 * world X, Y, Z so distance, heading, routing, and the decoded zone agree.
 */
export function loggedLocationToWorld(logY, logX, z, heading = null) {
    const worldX = finite(logX);
    const worldY = finite(logY);
    return {
        x:worldX,
        y:worldY,
        z:finite(z),
        logX:worldX,
        logY:worldY,
        heading:heading === null || heading === undefined ? null : finite(heading)
    };
}

/** Wiki NPC locations preserve the game's displayed Y, X, Z order. */
export function wikiLocationToWorld(location) {
    if (!Array.isArray(location) || location.length < 2) return null;
    const logY = Number(location[0]);
    const logX = Number(location[1]);
    if (!Number.isFinite(logY) || !Number.isFinite(logX)) return null;
    const world = [logX, logY];
    if (location.length >= 3 && Number.isFinite(Number(location[2]))) world.push(Number(location[2]));
    return world;
}

/** The classic client map format negates world X/Y without swapping them. */
export function worldToClientMap({ x, y, z = 0 }) {
    return { x:-finite(x), y:-finite(y), z:finite(z) };
}

/** The decoded WLD scene uses viewer (-world Y, world Z, world X). */
export function worldToViewer({ x, y, z = 0 }) {
    return { x:-finite(y), y:finite(z), z:finite(x) };
}

export function clientMapToViewer({ x, y, z = 0 }) {
    return { x:finite(y), y:finite(z), z:-finite(x) };
}

/**
 * Format a canonical world position exactly as EverQuest displays `/loc`:
 * Y, X, Z. Keeping this at the coordinate boundary prevents internal axes
 * from leaking into player-facing labels.
 */
export function formatWorldLocationForPlayer(location, digits = 2) {
    const worldX = Number(location?.x);
    const worldY = Number(location?.y);
    const worldZ = Number(location?.z);
    if (![worldX, worldY, worldZ].every(Number.isFinite)) return '';
    const precision = Math.max(0, Math.min(6, Math.trunc(Number(digits) || 0)));
    return `/loc ${worldY.toFixed(precision)}, ${worldX.toFixed(precision)}, ${worldZ.toFixed(precision)}`;
}

/**
 * EverQuest Legends labels the two planar values in its Map window in the
 * same order printed by /loc. Keep this adapter separate from canonical world
 * X/Y so the map HUD can match the game without changing routing math.
 */
export function worldToGameMapReadout(location) {
    const worldX = Number(location?.x);
    const worldY = Number(location?.y);
    const worldZ = Number(location?.z);
    if (![worldX, worldY, worldZ].every(Number.isFinite)) return null;
    return { x:worldY, y:worldX, z:worldZ };
}

export function formatWorldLocationForGameMap(location, digits = 2) {
    const map = worldToGameMapReadout(location);
    if (!map) return '';
    const precision = Math.max(0, Math.min(6, Math.trunc(Number(digits) || 0)));
    return `X ${map.x.toFixed(precision)}  Y ${map.y.toFixed(precision)}  Z ${map.z.toFixed(precision)}`;
}

function commandCoordinate(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Object.is(number, -0) ? '0' : String(number);
}

/** Convert canonical world X/Y/Z back to the Y/X/Z order accepted in game. */
export function waypointCommandForWorldLocation(location) {
    const values = Array.isArray(location)
        ? [location[1], location[0], location.length >= 3 ? location[2] : undefined]
        : [location?.y, location?.x, location?.z];
    const required = values.slice(0, 2).map(commandCoordinate);
    if (required.some(value => value === null)) return '';
    const optionalZ = commandCoordinate(values[2]);
    return `/waypoint ${[...required, ...(optionalZ === null ? [] : [optionalZ])].join(' ')}`;
}
