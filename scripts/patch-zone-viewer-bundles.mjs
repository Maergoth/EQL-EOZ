import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function replaceMethod(source, startTokens, endToken, replacement) {
    const tokens = Array.isArray(startTokens) ? startTokens : [startTokens];
    const matches = tokens.map(token => ({ token, index:source.indexOf(token) })).filter(match => match.index >= 0);
    const selected = matches.sort((a, b) => a.index - b.index)[0];
    const start = selected?.index ?? -1;
    const end = source.indexOf(endToken, start);
    if (start < 0 || end < 0) throw new Error(`Unable to locate ${tokens.join(' or ')}`);
    return source.slice(0, start) + replacement + source.slice(end);
}

function drawMiniMap() {
    const panel = this.els?.miniMap;
    const canvas = this.els?.miniMapCanvas;
    const context = this.miniMapContext;
    if (!panel || !canvas || !context || !this.miniMapVisible || !this.mapData?.lines?.length) {
        this.clearMiniMap();
        return;
    }

    const width = Math.max(160, panel.clientWidth || 260);
    const height = Math.max(130, (panel.clientHeight || 220) - 24);
    const pixelRatio = Math.min(2, Math.max(1, devicePixelRatio || 1));
    const bitmapWidth = Math.round(width * pixelRatio);
    const bitmapHeight = Math.round(height * pixelRatio);
    if (canvas.width !== bitmapWidth || canvas.height !== bitmapHeight) {
        canvas.width = bitmapWidth;
        canvas.height = bitmapHeight;
    }
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(7, 14, 22, .94)';
    context.fillRect(0, 0, width, height);

    const bounds = this.mapContentBounds?.isEmpty?.() === false ? this.mapContentBounds : this.mapBounds;
    const size = bounds.getSize(new A());
    const center = bounds.getCenter(new A());
    const pose = this.lastFirstPersonPose;
    const focus = pose?.position?.clone?.() || center;
    const zoneRadius = Math.max(size.x, size.z, 1) * .5;
    const visibleRadius = Math.min(Math.max(250, Ie(zoneRadius * .22, 350, 1500)), Math.max(250, zoneRadius));
    const padding = 10;
    const scale = Math.min((width - padding * 2) / (visibleRadius * 2), (height - padding * 2) / (visibleRadius * 2));

    // In First Person, rotate the local map so the direction inferred from
    // consecutive /loc samples is always at the top of the minimap.
    const headingUp = this.mode === 'first' && pose?.forward?.lengthSq?.() > .0001;
    const forward = headingUp ? pose.forward.clone().setY(0).normalize() : null;
    const toCanvas = point => {
        const dx = point.x - focus.x;
        const dz = point.z - focus.z;
        if (!forward) return { x:width * .5 + dx * scale, y:height * .5 + dz * scale };
        const rightX = -forward.z;
        const rightZ = forward.x;
        return {
            x:width * .5 + (dx * rightX + dz * rightZ) * scale,
            y:height * .5 - (dx * forward.x + dz * forward.z) * scale
        };
    };

    context.save();
    context.beginPath();
    context.rect(padding, padding, width - padding * 2, height - padding * 2);
    context.clip();
    context.lineCap = 'round';
    for (const line of this.mapData.lines) {
        if (line.layer === 2) continue;
        const from = toCanvas(this.eqMapToThree(line.x1, line.y1, line.z1));
        const to = toCanvas(this.eqMapToThree(line.x2, line.y2, line.z2));
        if ((from.x < -20 && to.x < -20) || (from.x > width + 20 && to.x > width + 20) ||
            (from.y < -20 && to.y < -20) || (from.y > height + 20 && to.y > height + 20)) continue;
        const luminance = .2126 * line.r + .7152 * line.g + .0722 * line.b;
        context.strokeStyle = luminance < 40 ? 'rgba(218, 230, 240, .78)' : `rgba(${line.r}, ${line.g}, ${line.b}, .88)`;
        context.lineWidth = line.layer === 0 ? 1.15 : 1;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
    }

    if (this.navigationPath?.length > 1) {
        context.strokeStyle = '#f1c85b';
        context.lineWidth = 2.5;
        context.shadowColor = 'rgba(241, 200, 91, .8)';
        context.shadowBlur = 5;
        context.beginPath();
        this.navigationPath.forEach((point, index) => {
            const screen = toCanvas(point);
            if (index) context.lineTo(screen.x, screen.y);
            else context.moveTo(screen.x, screen.y);
        });
        context.stroke();
        context.shadowBlur = 0;
    }

    // Keep the useful labels and drop the noisy generic map annotations.
    const named = (this.namedMobLabels || [])
        .map(label => ({ label, screen:toCanvas(label.position), distance:Math.hypot(label.position.x - focus.x, label.position.z - focus.z) }))
        .filter(entry => entry.screen.x >= padding && entry.screen.x <= width - padding && entry.screen.y >= padding && entry.screen.y <= height - padding)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 18);
    context.font = '600 10px system-ui, sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    for (const entry of named) {
        context.beginPath();
        context.arc(entry.screen.x, entry.screen.y, 2.6, 0, Math.PI * 2);
        context.fillStyle = '#f1c85b';
        context.fill();
        context.lineWidth = 3;
        context.strokeStyle = 'rgba(7, 14, 22, .95)';
        context.strokeText(entry.label.title, entry.screen.x + 6, entry.screen.y);
        context.fillStyle = '#f7e7a7';
        context.fillText(entry.label.title, entry.screen.x + 6, entry.screen.y);
    }
    context.restore();

    if (pose) {
        const player = toCanvas(pose.position);
        const direction = headingUp ? -Math.PI / 2 : Math.atan2(
            toCanvas(pose.position.clone().addScaledVector(pose.forward, 100)).y - player.y,
            toCanvas(pose.position.clone().addScaledVector(pose.forward, 100)).x - player.x
        );
        context.save();
        context.translate(player.x, player.y);
        context.rotate(direction + Math.PI / 2);
        context.shadowColor = 'rgba(255, 24, 24, .98)';
        context.shadowBlur = 11;
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(0, -13);
        context.lineTo(8, 8);
        context.lineTo(0, 5);
        context.lineTo(-8, 8);
        context.closePath();
        context.fillStyle = 'rgba(255, 30, 30, .98)';
        context.fill();
        context.shadowBlur = 3;
        context.lineWidth = 1.5;
        context.strokeStyle = '#fff';
        context.stroke();
        context.restore();
    }
    context.strokeStyle = 'rgba(143, 190, 226, .7)';
    context.lineWidth = 1;
    context.strokeRect(.5, .5, width - 1, height - 1);
}

async function findNavigationPath(start, goal, token) {
    const distance = Math.hypot(goal.x - start.x, goal.z - start.z);
    const report = (progress, message) => {
        if (token === this.navigationBuildToken) this.setStatus(`${message} You can keep moving.`, Ie(progress, .01, .98));
    };
    if (distance < .01) return [start.clone(), goal.clone()];

    // Build a height-aware walkable graph directly from rendered collision
    // surfaces. Unlike the old line-map worker this retains floors, ramps,
    // drops, walls, and the player's configured movement limits.
    // Corridors and stairs in classic indoor zones are too narrow for the
    // previous 14-unit cells. Keep the graph fine enough to honor a six-unit
    // climb limit, then broaden the search area over successive passes.
    const cell = Ie(distance / 120, 3.5, 6);
    const deadline = performance.now() + Math.min(42000, af);
    const attempts = [
        { cell, margin:Math.max(55, distance * .22), maxStates:24000, progressStart:.03, progressEnd:.36 },
        { cell:Math.min(7, cell * 1.25), margin:Math.max(120, distance * .55), maxStates:50000, progressStart:.36, progressEnd:.68 },
        { cell:Math.min(9, cell * 1.5), margin:Math.max(240, distance * 1.1), maxStates:hx, progressStart:.68, progressEnd:.86 }
    ];
    for (let index = 0; index < attempts.length; index++) {
        if (token !== this.navigationBuildToken || performance.now() >= deadline) return null;
        report(attempts[index].progressStart, `Building walkable-mesh route · pass ${index + 1}/${attempts.length}…`);
        const route = await this.findNavigationPathAttempt(
            start, goal, attempts[index], token, deadline, report, index + 1, attempts.length
        );
        if (route?.length) return route;
    }

    // Retain the inexpensive 2D map-line planner as a last-resort hint, then
    // project and validate every waypoint against actual zone geometry.
    try {
        report(.87, 'Trying local-map route fallback…');
        if (await this.prepareNavigationWorkerMap(token) && token === this.navigationBuildToken) {
            const candidate = await this.requestNavigationWorkerRoute(start, goal, token);
            if (candidate && token === this.navigationBuildToken) {
                const route = await this.projectWorkerNavigationPath(candidate, start, goal, token);
                if (route?.length) return route;
            }
        }
    } catch (error) {
        console.warn('[EQLZoneViewer] Local-map route fallback failed.', error);
    }
    return null;
}

function navigationCanTraverseElevation(fromElevation, toElevation) {
    const policy = globalThis.EyeOfZommNavigationPolicy;
    if (policy?.canTraverseElevation) {
        return policy.canTraverseElevation(fromElevation, toElevation);
    }
    return Number(toElevation) - Number(fromElevation) <= 6.001;
}

function navigationCanUseSurface(fromElevation, candidateElevation, surfaces = []) {
    const policy = globalThis.EyeOfZommNavigationPolicy;
    if (policy?.canUseDropSurface) {
        return policy.canUseDropSurface(fromElevation, candidateElevation, surfaces);
    }
    if (!this.navigationCanTraverseElevation(fromElevation, candidateElevation)) return false;
    if (candidateElevation >= fromElevation - 6) return true;
    return !surfaces.some(surface => {
        const elevation = Number(surface?.y ?? surface);
        return Number.isFinite(elevation) && elevation > candidateElevation + 6 &&
            this.navigationCanTraverseElevation(fromElevation, elevation);
    });
}

function navigationProjectedSurface(x, z, expectedElevation, previousPoint, surfaceCache, direction = null) {
    const cacheKey = `${Math.round(x * 4) / 4}:${Math.round(z * 4) / 4}`;
    const surfaces = this.navigationSurfacesAt(x, z, cacheKey, surfaceCache);
    if (!surfaces.length) return null;

    let best = null;
    for (const surface of surfaces) {
        const point = new A(surface.x, surface.y, surface.z);
        if (previousPoint) {
            if (!this.navigationCanUseSurface(previousPoint.y, point.y, surfaces) ||
                this.navigationSegmentBlocked(previousPoint, point)) continue;
        }
        const elevationCost = Math.abs(point.y - expectedElevation) * 2.4;
        const slopeCost = (1 - surface.normalY) * 18;
        const reverseCost = direction && previousPoint
            ? Math.max(0, -point.clone().sub(previousPoint).setY(0).normalize().dot(direction)) * 20
            : 0;
        const cost = elevationCost + slopeCost + reverseCost;
        if (!best || cost < best.cost) best = { point, cost };
    }
    return best?.point || null;
}

async function findNavigationPathAttempt(start, goal, attempt, token, deadline, report, pass, passCount) {
    const cell = attempt.cell;
    const minX = Math.max(this.currentBounds.min.x - cell, Math.min(start.x, goal.x) - attempt.margin);
    const maxX = Math.min(this.currentBounds.max.x + cell, Math.max(start.x, goal.x) + attempt.margin);
    const minZ = Math.max(this.currentBounds.min.z - cell, Math.min(start.z, goal.z) - attempt.margin);
    const maxZ = Math.min(this.currentBounds.max.z + cell, Math.max(start.z, goal.z) + attempt.margin);
    const width = Math.max(2, Math.floor((maxX - minX) / cell) + 1);
    const height = Math.max(2, Math.floor((maxZ - minZ) / cell) + 1);
    if (width * height > hx) return null;

    const toGrid = point => ({
        ix:Ie(Math.round((point.x - minX) / cell), 0, width - 1),
        iz:Ie(Math.round((point.z - minZ) / cell), 0, height - 1)
    });
    const gridPoint = (ix, iz) => ({ x:minX + ix * cell, z:minZ + iz * cell });
    const elevationBucket = elevation => Math.round(elevation / Math.max(2, cell * .25));
    const stateKey = (ix, iz, elevation) => `${ix}:${iz}:${elevationBucket(elevation)}`;
    const segmentKey = (from, to) => {
        const round = value => Math.round(value * .2);
        return `${round(from.x)},${round(from.y)},${round(from.z)}>${round(to.x)},${round(to.y)},${round(to.z)}`;
    };

    const surfaceCache = new Map();
    const segmentCache = new Map();
    const startGrid = toGrid(start);
    const goalGrid = toGrid(goal);
    const goalSurfaces = this.navigationSurfacesAt(goal.x, goal.z, 'goal', surfaceCache);
    const blocked = (from, to) => {
        const key = segmentKey(from, to);
        if (segmentCache.has(key)) return segmentCache.get(key);
        const value = this.navigationSegmentBlocked(from, to);
        if (segmentCache.size < 40000) segmentCache.set(key, value);
        return value;
    };

    const open = new nl();
    const scores = new Map();
    const parents = new Map();
    const nodes = new Map();
    const firstKey = stateKey(startGrid.ix, startGrid.iz, start.y);
    const first = {
        ix:startGrid.ix,
        iz:startGrid.iz,
        point:new A(start.x, start.y, start.z),
        key:firstKey,
        score:0
    };
    scores.set(firstKey, 0);
    nodes.set(firstKey, first);
    open.push(first, 0);

    const directions = [
        [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
        [1, 1, Math.SQRT2], [1, -1, Math.SQRT2],
        [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
    ];
    let foundKey = null;
    let expanded = 0;
    let lastYield = performance.now();
    const yieldIfNeeded = async force => {
        const now = performance.now();
        if (!force && now - lastYield < of) return true;
        const fraction = Math.min(1, expanded / Math.max(1, attempt.maxStates));
        const progress = attempt.progressStart + (attempt.progressEnd - attempt.progressStart) * fraction;
        report(progress, `Finding path · pass ${pass}/${passCount} · ${expanded.toLocaleString()} nodes checked…`);
        await Zr();
        lastYield = performance.now();
        return token === this.navigationBuildToken && lastYield < deadline;
    };

    while (open.size && expanded++ < attempt.maxStates) {
        if (token !== this.navigationBuildToken || performance.now() >= deadline || !await yieldIfNeeded(false)) return null;
        const current = open.pop();
        const currentScore = scores.get(current.key);
        if (currentScore === undefined || Math.abs(currentScore - current.score) > .0001) continue;

        const adjacentToGoal = Math.max(
            Math.abs(current.ix - goalGrid.ix),
            Math.abs(current.iz - goalGrid.iz)
        ) <= 1;
        const goalCandidates = goalSurfaces.length ? goalSurfaces : [{ y:goal.y }];
        if (adjacentToGoal &&
            this.navigationCanUseSurface(current.point.y, goal.y, goalCandidates) &&
            !blocked(current.point, goal)) {
            foundKey = current.key;
            break;
        }

        for (const [dx, dz, distanceScale] of directions) {
            const ix = current.ix + dx;
            const iz = current.iz + dz;
            if (ix < 0 || ix >= width || iz < 0 || iz >= height) continue;

            const sample = gridPoint(ix, iz);
            const surfaces = this.navigationSurfacesAt(sample.x, sample.z, `${ix}:${iz}`, surfaceCache);
            if (!await yieldIfNeeded(false)) return null;
            if (!surfaces.length) continue;

            const candidates = surfaces
                .filter(surface => this.navigationCanUseSurface(current.point.y, surface.y, surfaces))
                .sort((left, right) => Math.abs(left.y - current.point.y) - Math.abs(right.y - current.point.y))
                .slice(0, ux);

            for (const surface of candidates) {
                const next = new A(surface.x, surface.y, surface.z);
                if (blocked(current.point, next)) continue;
                if (!await yieldIfNeeded(false)) return null;

                const rise = surface.y - current.point.y;
                const key = stateKey(ix, iz, surface.y);
                const travelDistance = Math.hypot(cell * distanceScale, rise);
                const slopeCost = (1 - surface.normalY) * cell * 1.8;
                const jumpCost = rise > 1.5 ? 4 + rise * .75 : 0;
                const score = currentScore + travelDistance + slopeCost + jumpCost;
                if (scores.has(key) && scores.get(key) <= score) continue;

                const node = { ix, iz, point:next, key, score };
                scores.set(key, score);
                nodes.set(key, node);
                parents.set(key, current.key);
                const horizontal = Math.hypot(goal.x - next.x, goal.z - next.z);
                const remainingClimb = Math.max(0, goal.y - next.y);
                open.push(node, score + Math.hypot(horizontal, remainingClimb));
            }
        }
    }

    await yieldIfNeeded(true);
    if (!foundKey) return null;

    const path = [goal.clone()];
    let key = foundKey;
    while (key) {
        const node = nodes.get(key);
        if (node) path.push(node.point.clone());
        if (key === firstKey) break;
        key = parents.get(key);
    }
    path.push(start.clone());
    path.reverse();
    return this.simplifyNavigationPath(path);
}

const viewerPath = `${root}/app/zoneviewer/ZoneViewerApp.js`;
let viewer = readFileSync(viewerPath, 'utf8');

// Match the game's default map-folder selection unless a future explicit
// user preference says otherwise. Previously the largest custom map family
// silently won, so the app could draw a different file set than the client.
viewer = viewer.replace(
    'let h=l.layers.has(0)?1:0;return(c.layers.has(0)?1:0)-h||l.priority-c.priority||c.bytes-l.bytes||l.directory.localeCompare(c.directory)',
    'let h=l.layers.has(0)?1:0,u=/^maps$/i.test(l.directory)?1:0,d=/^maps$/i.test(c.directory)?1:0;return(c.layers.has(0)?1:0)-h||d-u||l.priority-c.priority||c.bytes-l.bytes||l.directory.localeCompare(c.directory)'
);
if (!viewer.includes('u=/^maps$/i.test(l.directory)?1:0,d=/^maps$/i.test(c.directory)?1:0')) {
    throw new Error('Unable to install default map-family preference.');
}

// Client maps store -worldX,-worldY,Z. The viewer's original map adapter
// places that in the decoded WLD scene's (-worldY,Z,worldX) basis.
viewer = viewer.replace(
    'xt=Object.freeze({swap:!1,sx:-1,sz:-1})',
    'xt=Object.freeze({swap:!0,sx:1,sz:-1})'
);
viewer = viewer.replace(
    'chooseMapTransform(){return{...xt}}eqMapToThree(e,t,n){return dh(e,t,n)}',
    'chooseMapTransform(){return{...xt}}eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}eqMapToThree(e,t,n){return dh(e,t,n)}'
);
viewer = viewer.replace(
    'eqWorldToThree(e,t,n){return new A(Tt(t),Tt(n),Tt(e))}',
    'eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}'
);
viewer = viewer.replace(
    'eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}eqMapToThree(e,t,n){return dh(e,t,n)}threeToEq(e){return Yx(e)}',
    'eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}eqMapToThree(e,t,n){return dh(e,t,n)}threeToWorld(e){return{x:e.z,y:-e.x,z:e.y}}threeToEq(e){return this.threeToWorld(e)}'
);
viewer = viewer.replace(
    'threeToEq(e){return this.mapFileVisible?Yx(e):this.threeToWorld(e)}',
    'threeToEq(e){return this.threeToWorld(e)}'
);
viewer = viewer.replace(
    'threeToWorld(e){return{x:e.z,y:e.x,z:e.y}}',
    'threeToWorld(e){return{x:e.z,y:-e.x,z:e.y}}'
);
viewer = viewer.replaceAll(
    'this.els.coord.textContent="X \\u2014  Y \\u2014  Z \\u2014"',
    'this.els.coord.textContent="/loc \\u2014, \\u2014, \\u2014"'
);
viewer = viewer.replaceAll(
    'this.els.coord.textContent=`X ${i.x.toFixed(2)}   Y ${i.y.toFixed(2)}   Z ${i.z.toFixed(2)}`',
    'this.els.coord.textContent=`/loc ${i.y.toFixed(2)}, ${i.x.toFixed(2)}, ${i.z.toFixed(2)}`'
);
viewer = viewer.replaceAll(
    'this.els.coord.textContent=`X ${u.x.toFixed(2)}   Y ${u.y.toFixed(2)}   Z ${u.z.toFixed(2)}`',
    'this.els.coord.textContent=`/loc ${u.y.toFixed(2)}, ${u.x.toFixed(2)}, ${u.z.toFixed(2)}`'
);
viewer = viewer.replaceAll(
    'this.els.coord.textContent=`X ${a.x.toFixed(2)}   Y ${a.y.toFixed(2)}   Z ${a.z.toFixed(2)}`',
    'this.els.coord.textContent=`/loc ${a.y.toFixed(2)}, ${a.x.toFixed(2)}, ${a.z.toFixed(2)}`'
);
if (!viewer.includes('xt=Object.freeze({swap:!0,sx:1,sz:-1})') ||
    !viewer.includes('eqWorldToThree(e,t,n){return new A(-Tt(t),Tt(n),Tt(e))}') ||
    !viewer.includes('threeToWorld(e){return{x:e.z,y:-e.x,z:e.y}}') ||
    !viewer.includes('threeToEq(e){return this.threeToWorld(e)}') ||
    !viewer.includes('this.els.coord.textContent=`/loc ${i.y.toFixed(2)}, ${i.x.toFixed(2)}, ${i.z.toFixed(2)}`')) {
    throw new Error('Unable to install distinct EQ world and client-map transforms.');
}
viewer = viewer.replace(
    'e.userData.eqlOriginalMap=i,e.map=this.els.textures.checked?i:null',
    'e.userData.eqlOriginalMap=i,e.userData.eqlLocalTexturePath=t.path,e.map=this.els.textures.checked?i:null'
);
if (!viewer.includes('e.userData.eqlLocalTexturePath=t.path')) {
    throw new Error('Unable to install resolved local-texture diagnostics.');
}
const miniMapSource = drawMiniMap.toString().replace(/^function /, '');
const navSource = findNavigationPath.toString().replace(/^async function /, 'async ');
const elevationSource = navigationCanTraverseElevation.toString().replace(/^function /, '');
const surfaceSource = navigationCanUseSurface.toString().replace(/^function /, '');
const projectedSource = navigationProjectedSurface.toString().replace(/^function /, '');
const attemptSource = findNavigationPathAttempt.toString().replace(/^async function /, 'async ');
// Repair the single bad boundary emitted by the first v15 patch draft before
// applying the corrected method replacement. This is intentionally idempotent.
viewer = viewer.replace(
    '}simplifyNavigationPath(Ee)}simplifyNavigationPath(e){',
    '}simplifyNavigationPath(e){'
);
viewer = replaceMethod(viewer, ['drawMiniMap(){', 'drawMiniMap() {'], 'clearMapLabels(){', miniMapSource);
viewer = replaceMethod(viewer, ['async findNavigationPath(e,t,n){', 'async findNavigationPath(start, goal, token) {'], 'async findNavigationPathAttempt(', navSource);
viewer = replaceMethod(
    viewer,
    ['async findNavigationPathAttempt(e,t,n,i,s,a,o,l){', 'async findNavigationPathAttempt(start, goal, attempt, token, deadline, report, pass, passCount) {'],
    'simplifyNavigationPath(e){',
    attemptSource
);

if (viewer.includes('navigationCanTraverseElevation(fromElevation, toElevation) {')) {
    viewer = replaceMethod(viewer, 'navigationCanTraverseElevation(fromElevation, toElevation) {', 'navigationCanUseSurface(', elevationSource);
    viewer = replaceMethod(viewer, 'navigationCanUseSurface(fromElevation, candidateElevation, surfaces = []) {', 'navigationProjectedSurface(', surfaceSource);
} else {
    const marker = ['navigationProjectedSurface(e,t,n,i,s,a=null){', 'navigationProjectedSurface(x, z, expectedElevation, previousPoint, surfaceCache, direction = null) {']
        .find(token => viewer.includes(token));
    if (!marker) throw new Error('Unable to locate the navigation surface projector.');
    viewer = viewer.replace(marker, `${elevationSource}${surfaceSource}${marker}`);
}
viewer = replaceMethod(
    viewer,
    ['navigationProjectedSurface(e,t,n,i,s,a=null){', 'navigationProjectedSurface(x, z, expectedElevation, previousPoint, surfaceCache, direction = null) {'],
    'navigationRepairStep(',
    projectedSource
);

const projectedRouteFinish = 'p>this.fp.jumpHeight+1.5||p<-this.fp.maxDrop-2';
const directedRouteFinish = '!this.navigationCanTraverseElevation(m.y,n.y)';
if (viewer.includes(projectedRouteFinish)) viewer = viewer.replace(projectedRouteFinish, directedRouteFinish);
if (!viewer.includes(directedRouteFinish)) throw new Error('Unable to install directed movement rules in the projected route fallback.');

const fastRouteStep = 'L>this.fp.jumpHeight+.75||L<-this.fp.maxDrop';
const directedFastRouteStep = '!this.navigationCanTraverseElevation(R.y,T.y)';
if (viewer.includes(fastRouteStep)) viewer = viewer.replace(fastRouteStep, directedFastRouteStep);
if (!viewer.includes(directedFastRouteStep)) throw new Error('Unable to install directed movement rules in the fast route validator.');

// Keep the legacy map-worker fallback on the same movement model as the
// geometry-derived graph. configureViewerMovement normally supplies this
// value, but the fallback must remain safe if the controller is unavailable.
viewer = viewer.replace('jumpHeight:this.fp?.jumpHeight||10', 'jumpHeight:this.fp?.jumpHeight||6');
if (!viewer.includes('jumpHeight:this.fp?.jumpHeight||6')) {
    throw new Error('Unable to cap the background route worker at a six-unit climb.');
}
viewer = viewer.replace(
    'Pathfinding uses the same 10-unit jump limit as Grounded mode.',
    'Pathfinding uses the same six-unit upward step limit as Grounded mode; exposed downward drops are allowed.'
);
if (!viewer.includes('same six-unit upward step limit as Grounded mode')) {
    throw new Error('Unable to update the navigation movement help.');
}

// Preserve the floor encoded by map labels. Adding 24–35 units before the
// downward ray caused stacked dungeons (notably Befallen) to select the floor
// above the label. findGroundPointAt already allows the configured step-up
// tolerance, so the label elevation itself is the correct ceiling.
viewer = viewer.replace(
    'this.findGroundPointAt(f.x,f.z,f.y+24)||f',
    'this.findGroundPointAt(f.x,f.z,f.y)||f'
);
viewer = viewer.replace(
    'this.findGroundPointAt(o.x,o.z,o.y+35)||o.clone()',
    'this.findGroundPointAt(o.x,o.z,o.y)||o.clone()'
);
for (const required of [
    'this.findGroundPointAt(f.x,f.z,f.y)||f',
    'this.findGroundPointAt(o.x,o.z,o.y)||o.clone()'
]) {
    if (!viewer.includes(required)) throw new Error(`Unable to install floor-aware map grounding: ${required}`);
}

viewer = viewer.replace(/fh="v(?:13|14|15)"/, 'fh="v16"');
if (!viewer.includes('fh="v16"')) throw new Error('Unable to bump the parsed-zone cache version.');
writeFileSync(viewerPath, viewer);

const workerPath = `${root}/app/zoneviewer/zone-parser.worker.js`;
let worker = readFileSync(workerPath, 'utf8');
if (!worker.includes('let i=[];this.images=i;this.shaderMap={}')) {
    worker = worker.replace('let i=[];this.shaderMap={}', 'let i=[];this.images=i;this.shaderMap={}');
}
const materialNameVariants = [
    'let[a]=i.name.toLowerCase().split(/_mdf/i);/m\\d+/.test(a)&&i.bitmapInfo?.reference&&(a=i.bitmapInfo.reference.bitmapNames[0].name);',
    'let[a]=i.name.toLowerCase().split(/_mdf/i);i.bitmapInfo?.reference?.bitmapNames?.[0]?.name&&(a=i.bitmapInfo.reference.bitmapNames[0].name);'
];
const normalizedMaterialName = 'let[a]=i.name.toLowerCase().split(/_mdf/i);i.bitmapInfo?.reference?.bitmapNames?.[0]?.fileName&&(a=i.bitmapInfo.reference.bitmapNames[0].fileName.toLowerCase().replace(/\\.(?:bmp|dds)$/i,""));';
for (const variant of materialNameVariants) {
    if (worker.includes(variant)) worker = worker.replace(variant, normalizedMaterialName);
}
const animatedName = 'i.bitmapInfo?.reference?.flags?.isAnimated&&(a=i.bitmapInfo.reference.bitmapNames[0].name,o.setName(a),f={...f,animationDelay:i.bitmapInfo.reference.animationDelayMs,frames:i.bitmapInfo.reference.bitmapNames.map(x=>x.name.toLowerCase())});';
const normalizedAnimatedName = 'i.bitmapInfo?.reference?.flags?.isAnimated&&(a=i.bitmapInfo.reference.bitmapNames[0].fileName.toLowerCase().replace(/\\.(?:bmp|dds)$/i,""),o.setName(a),f={...f,animationDelay:i.bitmapInfo.reference.animationDelayMs,frames:i.bitmapInfo.reference.bitmapNames.map(x=>x.fileName.toLowerCase())});';
if (worker.includes(animatedName)) worker = worker.replace(animatedName, normalizedAnimatedName);
const imageLookup = 'A.name?.replace(".dds","")?.replace(".bmp","")?.toLowerCase()===a.toLowerCase()';
const normalizedImageLookup = 'A.name?.toLowerCase().replace(/\\.(?:dds|bmp)$/i,"")===a.toLowerCase().replace(/\\.(?:dds|bmp)$/i,"")';
if (worker.includes(imageLookup)) worker = worker.replace(imageLookup, normalizedImageLookup);
if (!worker.includes('let i=[];this.images=i;this.shaderMap={}') ||
    !worker.includes(normalizedMaterialName) ||
    !worker.includes(normalizedAnimatedName) ||
    !worker.includes(normalizedImageLookup)) {
    throw new Error('Unable to install the S3D texture fixes.');
}
writeFileSync(workerPath, worker);

console.log('Zone Viewer coordinate display, minimap, directed nav graph, and S3D texture patches applied.');
