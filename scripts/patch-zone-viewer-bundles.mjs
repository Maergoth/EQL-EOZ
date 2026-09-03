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
    const cell = Ie(distance / 35, 5, 14);
    const deadline = performance.now() + Math.min(35000, af);
    const attempts = [
        { cell, margin:Math.max(45, distance * .28), maxStates:18000, progressStart:.03, progressEnd:.36 },
        { cell:Math.min(18, cell * 1.35), margin:Math.max(100, distance * .58), maxStates:42000, progressStart:.36, progressEnd:.68 },
        { cell:Math.min(22, cell * 1.7), margin:Math.max(220, distance), maxStates:hx, progressStart:.68, progressEnd:.86 }
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

const viewerPath = `${root}/app/zoneviewer/ZoneViewerApp.js`;
let viewer = readFileSync(viewerPath, 'utf8');
const miniMapSource = drawMiniMap.toString().replace(/^function /, '');
const navSource = findNavigationPath.toString().replace(/^async function /, 'async ');
viewer = replaceMethod(viewer, ['drawMiniMap(){', 'drawMiniMap() {'], 'clearMapLabels(){', miniMapSource);
viewer = replaceMethod(viewer, ['async findNavigationPath(e,t,n){', 'async findNavigationPath(start, goal, token) {'], 'async findNavigationPathAttempt(', navSource);
viewer = viewer.replace('fh="v13"', 'fh="v14"');
if (!viewer.includes('fh="v14"')) throw new Error('Unable to bump the parsed-zone cache version.');
writeFileSync(viewerPath, viewer);

const workerPath = `${root}/app/zoneviewer/zone-parser.worker.js`;
let worker = readFileSync(workerPath, 'utf8');
if (!worker.includes('let i=[];this.images=i;this.shaderMap={}')) {
    worker = worker.replace('let i=[];this.shaderMap={}', 'let i=[];this.images=i;this.shaderMap={}');
}
const oldMaterialName = 'let[a]=i.name.toLowerCase().split(/_mdf/i);/m\\d+/.test(a)&&i.bitmapInfo?.reference&&(a=i.bitmapInfo.reference.bitmapNames[0].name);';
const newMaterialName = 'let[a]=i.name.toLowerCase().split(/_mdf/i);i.bitmapInfo?.reference?.bitmapNames?.[0]?.name&&(a=i.bitmapInfo.reference.bitmapNames[0].name);';
if (!worker.includes(newMaterialName)) worker = worker.replace(oldMaterialName, newMaterialName);
if (!worker.includes('let i=[];this.images=i;this.shaderMap={}') || !worker.includes(newMaterialName)) {
    throw new Error('Unable to install the S3D texture fixes.');
}
writeFileSync(workerPath, worker);

console.log('Zone Viewer coordinate display, minimap, nav graph, and S3D texture patches applied.');
