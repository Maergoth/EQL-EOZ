import assert from 'node:assert/strict';
import { validateRouteGeometry, validateRouteGeometryAsync, projectRouteToGeometry } from '../app/route-validation.js';
import { runRecastRoute } from '../app/recast-route-engine.js';

function fixture(height, options = {}) {
    const positions = [], indices = [];
    const triangle = (a, b, c) => {
        const base = positions.length / 3;
        positions.push(...a, ...b, ...c);
        indices.push(base, base + 1, base + 2);
    };
    const floor = (left, right, y) => {
        triangle([left,y,-10], [left,y,10], [right,y,-10]);
        triangle([right,y,-10], [left,y,10], [right,y,10]);
    };
    const wall = (x, bottom, top) => {
        triangle([x,bottom,-10], [x,bottom,10], [x,top,-10]);
        triangle([x,top,-10], [x,bottom,10], [x,top,10]);
    };
    floor(-15, options.lowerContinues ? 15 : 0, 0);
    if (options.diamondCap) {
        triangle([-.04,height,0], [0,height,10], [15,height,0]);
        triangle([15,height,0], [0,height,-10], [-.04,height,0]);
    } else if (options.cap !== false) floor(options.overhang ? -15 : options.lip || 0, 15, height);
    wall(0, options.floating ? height - .1 : 0, height);
    if (options.ceiling !== undefined) {
        // A thin ceiling crossing the step must still block the complete body.
        triangle([-.1,options.ceiling,-10], [.1,options.ceiling,-10], [-.1,options.ceiling,10]);
        triangle([.1,options.ceiling,-10], [.1,options.ceiling,10], [-.1,options.ceiling,10]);
    }
    if (options.tallWall) wall(3, height, height + 10);
    if (options.uncappedWall) wall(-1, 0, height);
    const geometry = { positions:new Float32Array(positions), indices:new Uint32Array(indices), offMeshConnections:[] };
    const path = [{ x:-8,y:0,z:0 }, { x:0,y:0,z:0 }, { x:0,y:height,z:0 }, { x:8,y:height,z:0 }];
    return { geometry, start:path[0], goal:path.at(-1), path };
}

for (const height of [1, 6]) {
    const f = fixture(height);
    for (const path of [f.path, [...f.path].reverse()]) {
        const validation = validateRouteGeometry(f, path);
        assert.equal(validation.valid, true, `${height}-unit supported capped step passes in either direction: ${validation.violations}`);
        assert.equal((await validateRouteGeometryAsync(f, path)).valid, true,
            'Cooperative validation retains whole-route step proof for approach segments');
    }
    const offCenter = f.path.map(point => ({ ...point, z:.5 }));
    assert.equal(validateRouteGeometry(f, offCenter).valid, true,
        'The full body may touch the coplanar shared-edge sibling that the center probe misses');
    assert.equal((await validateRouteGeometryAsync(f, offCenter)).valid, true);
    for (const [start, goal] of [[f.start, f.goal], [f.goal, f.start]]) {
        const projected = projectRouteToGeometry(f, [start, goal]);
        const projectedValidation = validateRouteGeometry(f, projected);
        assert.equal(projectedValidation.valid, true, `${height}-unit ${start.y < goal.y ? 'up' : 'down'} projection retains both landing heights: ${projectedValidation.violations}`);
        const result = await runRecastRoute({ ...f, start, goal });
        assert.equal(result.ok, true, `${height}-unit step reaches the exact requested goal: ${result.reason}`);
        assert.equal(validateRouteGeometry(f, result.path).valid, true);
        assert.deepEqual(result.path[0], start);
        assert.deepEqual(result.path.at(-1), goal);
    }
    // A legal step nearby must not make an overlapping endpoint valid by itself.
    assert.equal(validateRouteGeometry(f, [f.path[1], f.path[1]]).valid, false);
}

for (const [name, f] of [
    ['excessive rise', fixture(6.1)],
    ['floating cap', fixture(1, { floating:true })],
    ['unsupported upper landing', fixture(1, { cap:false })],
    ['overlapping floors', fixture(1, { overhang:true })],
    ['thin ceiling over legal step', fixture(1, { ceiling:3 })],
    ['tall wall after step', fixture(1, { tallWall:true })],
    ['uncapped parallel low wall before genuine step', fixture(1, { uncappedWall:true })]
]) {
    assert.equal(validateRouteGeometry(f, f.path).valid, false, `${name} cannot use the capped-step exception`);
}

{
    const f = fixture(1);
    // Declaring an upward move between two floors without crossing the adjacent
    // landings cannot borrow a different step's clearance.
    const vertical = [{ x:4,y:0,z:0 }, { x:4,y:1,z:0 }];
    assert.equal(validateRouteGeometry(f, vertical).valid, false);
    assert.equal((await validateRouteGeometryAsync(f, f.path, { shouldCancel:() => true })).valid, false,
        'Step preparation does not override cancellation');
}

{
    const f = fixture(1, { lowerContinues:true });
    const intrusion = [f.start, { x:1,y:0,z:0 }, { x:-1,y:0,z:0 }, ...f.path.slice(1)];
    assert.equal(validateRouteGeometry(f, intrusion).valid, false,
        'An earlier excursion under the cap cannot borrow a later legitimate step');
    assert.equal((await validateRouteGeometryAsync(f, intrusion)).valid, false,
        'Cooperative segment validation preserves the actual step occurrence');
    const throughCap = [f.start, { x:1,y:0,z:0 }, { x:0,y:0,z:0 }, ...f.path.slice(2)];
    assert.equal(validateRouteGeometry(f, throughCap).valid, false, 'A route cannot pass through a cap and return to its riser');
}

assert.doesNotThrow(() => {
    const invalid = validateRouteGeometry({ geometry:{ positions:new Float32Array(9) } }, fixture(1).path);
    assert.equal(invalid.valid, false, 'Missing indices fail closed for a step-shaped route');
});

{
    const f = fixture(1, { lip:-.04 });
    const path = [{ x:-.001,y:0,z:0 }, { x:.001,y:1,z:0 }, f.goal];
    assert.equal(validateRouteGeometry(f, path).valid, false, 'A small cap overhang cannot hide between the landing probes');
    assert.equal((await validateRouteGeometryAsync(f, path)).valid, false);
}

{
    const f = fixture(1, { diamondCap:true });
    const path = [{ x:-.001,y:0,z:0 }, { x:.001,y:1,z:0 }, f.goal];
    assert.equal(validateRouteGeometry(f, path).valid, false, 'An internal triangle seam is still inside an overhanging cap');
    assert.equal((await validateRouteGeometryAsync(f, path)).valid, false);
}

{
    const positions = [], indices = [];
    const triangle = (a,b,c) => { const i = positions.length / 3; positions.push(...a,...b,...c); indices.push(i,i+1,i+2); };
    const floor = (left,right,y) => { triangle([left,y,-10],[left,y,10],[right,y,-10]); triangle([right,y,-10],[left,y,10],[right,y,10]); };
    floor(-15,0,0);
    const path = [{ x:-8,y:0,z:0 }, { x:0,y:0,z:0 }];
    for (let step = 0; step < 4; step += 1) {
        triangle([step,step,-10],[step,step,10],[step,step+1,-10]);
        triangle([step,step+1,-10],[step,step,10],[step,step+1,10]);
        floor(step, step === 3 ? 15 : step+1, step+1);
        path.push({ x:step,y:step+1,z:0 });
        if (step < 3) path.push({ x:step+1,y:step+1,z:0 });
    }
    path.push({ x:8,y:4,z:0 });
    const geometry = { positions:new Float32Array(positions), indices:new Uint32Array(indices), offMeshConnections:[] };
    for (const points of [path, [...path].reverse()]) {
        const request = { geometry, start:points[0], goal:points.at(-1) };
        const validation = validateRouteGeometry(request, points);
        assert.equal(validation.valid, true, `The body may overlap a contiguous supported flight of low risers: ${validation.violations}`);
        assert.equal((await validateRouteGeometryAsync(request, points)).valid, true);
        const result = await runRecastRoute(request);
        assert.equal(result.ok, true, `A full supported stair flight reaches its exact goal: ${result.reason}`);
        assert.deepEqual(result.path.at(-1), request.goal);
    }
}

console.log('Supported capped +1/+6 steps pass in both directions; floating caps, overlap, ceilings, tall walls and cancellation remain guarded.');
