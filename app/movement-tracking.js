function finiteLocation(location) {
    if (!location) return null;
    const x = Number(location.x);
    const y = Number(location.y);
    const z = Number(location.z);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
}

function planarDistance(left, right) {
    return Math.hypot(right.x - left.x, right.y - left.y);
}

/**
 * Turns noisy, repeated /loc output into a stable movement heading. The
 * newest accepted steps are weighted most heavily so turns respond quickly,
 * while duplicate lines and sub-unit coordinate jitter retain the last known
 * facing instead of spinning the map marker.
 */
export class LocationHeadingTracker {
    constructor(options = {}) {
        this.minStep = Number(options.minStep) || 0.75;
        this.teleportDistance = Number(options.teleportDistance) || 800;
        this.maxSamples = Math.max(2, Number(options.maxSamples) || 6);
        this.maxAgeMs = Math.max(250, Number(options.maxAgeMs) || 3200);
        this.reset();
    }

    reset() {
        this.samples = [];
        this.lastLocation = null;
        this.heading = null;
    }

    push(location, timestamp = Date.now()) {
        const current = finiteLocation(location);
        if (!current) return { ok:false, moved:false, heading:this.heading, location:null, distance:0 };
        const time = Number.isFinite(Number(timestamp)) ? Number(timestamp) : Date.now();
        const previous = this.lastLocation;
        const distance = previous ? planarDistance(previous, current) : 0;
        this.lastLocation = current;

        if (!previous) {
            this.samples = [{ ...current, time }];
            return { ok:true, moved:false, heading:this.heading, location:current, distance:0 };
        }

        if (distance >= this.teleportDistance) {
            this.samples = [{ ...current, time }];
            return { ok:true, moved:false, teleported:true, heading:this.heading, location:current, distance };
        }

        if (distance < this.minStep) {
            return { ok:true, moved:false, heading:this.heading, location:current, distance };
        }

        this.samples.push({ ...current, time });
        this.samples = this.samples
            .filter(sample => time - sample.time <= this.maxAgeMs)
            .slice(-this.maxSamples);

        let dx = 0;
        let dy = 0;
        let weightTotal = 0;
        for (let index = 1; index < this.samples.length; index += 1) {
            const from = this.samples[index - 1];
            const to = this.samples[index];
            const step = planarDistance(from, to);
            if (step < this.minStep || step >= this.teleportDistance) continue;
            const recencyWeight = index * index;
            dx += ((to.x - from.x) / step) * recencyWeight;
            dy += ((to.y - from.y) / step) * recencyWeight;
            weightTotal += recencyWeight;
        }
        const length = Math.hypot(dx, dy);
        if (weightTotal && length > 0.05) this.heading = { x:dx / length, y:dy / length };

        return { ok:true, moved:true, heading:this.heading, location:current, distance };
    }
}

export function locationPollDelay({ mapVisible = false, routeActive = false } = {}) {
    if (routeActive) return 180;
    return mapVisible ? 250 : 650;
}
