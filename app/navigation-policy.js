export const MAX_NAVIGATION_CLIMB_Z = 6;
export const NAVIGATION_ELEVATION_EPSILON = 0.001;

/**
 * EQ coordinates call the vertical axis Z. The Three.js viewer calls the
 * same axis Y, so this policy accepts generic elevation values rather than
 * assuming either coordinate-system name.
 */
export function canTraverseElevation(fromElevation, toElevation, maxClimb = MAX_NAVIGATION_CLIMB_Z) {
    const from = Number(fromElevation);
    const to = Number(toElevation);
    const limit = Number(maxClimb);
    if (![from, to, limit].every(Number.isFinite) || limit < 0) return false;

    // Falling is a valid directed edge regardless of distance. The reverse
    // edge is still rejected when its rise exceeds the jump-height limit.
    return to - from <= limit + NAVIGATION_ELEVATION_EPSILON;
}

export function canUseDropSurface(fromElevation, candidateElevation, surfaces = []) {
    if (!canTraverseElevation(fromElevation, candidateElevation)) return false;
    if (candidateElevation >= fromElevation - MAX_NAVIGATION_CLIMB_Z) return true;

    // When stacked floors overlap, do not route through the upper floor to a
    // lower one. A long drop is exposed only when no reachable surface remains
    // near the player's current elevation at the destination sample.
    return !surfaces.some(surface => {
        const elevation = Number(surface?.y ?? surface?.z ?? surface);
        return Number.isFinite(elevation) &&
            elevation > candidateElevation + MAX_NAVIGATION_CLIMB_Z &&
            canTraverseElevation(fromElevation, elevation);
    });
}

export function configureViewerMovement(controller) {
    if (!controller) return;
    controller.maxStepUp = Math.min(Number(controller.maxStepUp) || MAX_NAVIGATION_CLIMB_Z, MAX_NAVIGATION_CLIMB_Z);
    controller.jumpHeight = MAX_NAVIGATION_CLIMB_Z;
    controller.jumpVelocity = Math.sqrt(2 * controller.gravity * controller.jumpHeight);
}

const navigationPolicy = Object.freeze({
    maxClimbZ:MAX_NAVIGATION_CLIMB_Z,
    canTraverseElevation,
    canUseDropSurface
});

export default navigationPolicy;
