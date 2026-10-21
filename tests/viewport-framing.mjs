import assert from 'node:assert/strict';
import { deferHiddenViewportFit } from '../app/viewport-framing.js';

const viewport = { clientWidth:0, clientHeight:0 };
let fits = 0, resizes = 0, centers = 0;
const app = {
    els:{ viewport }, mode:'top', mapFileVisible:false,
    setMode(mode) { this.mode = mode; },
    setGameMapVisible(visible) { this.mapFileVisible = visible; },
    resetTopView() { fits += 1; },
    resize() { resizes += 1; }
};
const framing = deferHiddenViewportFit(app, () => { centers += 1; });
app.resetTopView();
framing.resize();
assert.equal(fits, 0, 'A hidden viewport cannot establish the initial camera fit');
viewport.clientWidth = 1000; viewport.clientHeight = 500;
framing.resize();
assert.equal(fits, 1, 'First visible resize fits at the actual aspect ratio');
assert.equal(centers, 1, 'First visible fit restores the player center');
framing.resize();
assert.equal(fits, 1, 'Later resizes preserve user zoom');
viewport.clientWidth = 0;
app.resetTopView();
app.mode = 'first';
viewport.clientWidth = 1000;
framing.resize();
assert.equal(fits, 1, 'Revealing First must not replace the active camera with Top');
app.setMode('top');
assert.equal(fits, 2, 'Entering Top later uses the visible dimensions');
framing.resize();
assert.equal(fits, 2, 'The explicit visible fit consumes pending work');
viewport.clientHeight = 0;
app.resetTopView();
viewport.clientHeight = 500;
app.mode = 'first'; app.mapFileVisible = true;
framing.resize();
assert.equal(fits, 3, 'Map Overlay consumes a deferred fit even if its underlying mode was First');
assert.equal(centers, 3);
assert.equal(resizes, 6);
console.log('Hidden/visible viewport framing, camera-mode preservation, and zoom continuity passed.');
