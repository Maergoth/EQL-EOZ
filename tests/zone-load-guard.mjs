import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installZoneLoadGuard } from '../app/zone-load-guard.js';
import { selectViewerZoneOption } from '../app/viewer-zone-selection.js';

const records = ['first', 'second', 'third'].map(id => ({ id, format:'S3D' }));
function harness({ readyError = false } = {}) {
    const calls = [];
    const ready = [];
    const requested = [];
    let concurrent = 0;
    let maxConcurrent = 0;
    const app = {
        source:{}, selected:records[0], currentZoneRecord:records[0], currentZoneKey:'S3D:first',
        els:{ zoneSelect:{ value:'S3D:first' }, statusText:{ textContent:'' }, overlay:{ innerHTML:'', hidden:true } },
        selectedZoneRecord() { return this.selected; },
        clearNavigationGuide() { this.target = null; },
        resetLoadedZone() { this.scene = null; this.target = null; this.els.overlay.innerHTML = 'Preparing zone'; },
        setStatus(value) { this.els.statusText.textContent = value; },
        async loadSelectedZone() {
            const key = this.els.zoneSelect.value;
            const record = records.find(value => `S3D:${value.id}` === key);
            concurrent += 1;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await new Promise(resolve => calls.push({ key, finish:({ fail = false } = {}) => {
                concurrent -= 1;
                if (!fail) { this.scene = record.id; this.currentZoneRecord = record; this.currentZoneKey = key; }
                else { this.els.statusText.textContent = 'Synthetic parse failure'; this.els.overlay.innerHTML = 'Synthetic error'; }
                resolve();
            } }));
        }
    };
    const guard = installZoneLoadGuard(app, {
        onRequest(record) { requested.push(record.id); },
        onReady(record) { if (readyError) throw new Error('Synthetic scene acceptance failure'); ready.push(record.id); }
    });
    return { app, calls, ready, requested, guard, maxConcurrent:() => maxConcurrent };
}

// Every entry point, including the native toolbar's method, shares one loader.
{
    const h = harness();
    h.app.target = 'old target';
    const older = h.app.loadSelectedZone();
    assert.equal(h.app.currentZoneRecord, null, 'A pending load immediately invalidates old zone readiness');
    assert.equal(h.app.target, null);
    h.app.selected = records[1];
    const replaced = h.app.loadSelectedZone();
    h.app.selected = records[2];
    const latest = h.app.loadSelectedZone();
    assert.equal((await older).reason, 'superseded', 'Active superseded callers settle before the parser finishes');
    assert.equal((await replaced).reason, 'superseded');
    assert.equal(h.calls.length, 1);
    assert.equal(h.guard.isReady(), false);
    h.calls[0].finish();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].key, 'S3D:third', 'Only the newest queued load starts');
    assert.equal(h.app.currentZoneRecord, null, 'An old completed scene never advertises readiness');
    assert.equal(h.app.scene, null, 'A stale completed scene is discarded before the next load');
    assert.deepEqual(h.ready, []);
    h.calls[1].finish();
    assert.equal((await latest).ok, true);
    assert.equal(h.maxConcurrent(), 1);
    assert.equal(h.app.currentZoneRecord.id, 'third');
    assert.equal(h.guard.isReady(records[2]), true);
    assert.equal(h.guard.isReady(records[0]), false);
    assert.deepEqual(h.ready, ['third']);
}

// A swallowed parser error cannot inherit a previous zone's success/readiness.
{
    const h = harness();
    h.app.selected = records[1];
    const pending = h.app.loadSelectedZone();
    h.calls[0].finish({ fail:true });
    assert.equal((await pending).reason, 'load-failed');
    assert.equal(h.app.currentZoneRecord, null);
    assert.equal(h.app.currentZoneKey, '');
    assert.equal(h.guard.isReady(), false);
    assert.equal(h.app.els.statusText.textContent, 'Synthetic parse failure');
    assert.equal(h.app.els.overlay.innerHTML, 'Synthetic error');
    assert.deepEqual(h.ready, []);
}

// Shell sync and a view/toolbar request for the same in-flight zone share work.
{
    const h = harness();
    const first = h.app.loadSelectedZone();
    const duplicate = h.app.loadSelectedZone();
    assert.equal(duplicate, first);
    h.calls[0].finish();
    assert.equal((await first).ok, true);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.requested, ['first']);
}

// Switching source folders invalidates in-flight work even without a new load.
{
    const h = harness();
    const pending = h.app.loadSelectedZone();
    h.app.source = {};
    h.calls[0].finish();
    assert.equal((await pending).reason, 'superseded');
    assert.equal(h.app.currentZoneRecord, null);
    assert.deepEqual(h.ready, []);
}

{
    const h = harness({ readyError:true });
    const pending = h.app.loadSelectedZone();
    h.calls[0].finish();
    assert.equal((await pending).reason, 'load-failed', 'A throwing acceptance hook must settle its caller');
    assert.equal(h.app.currentZoneRecord, null);
    assert.equal(h.guard.isReady(), false);
}

console.log('Zone loader serialization, latest-request ownership, failed-load readiness, and source-change contracts passed.');

const options = [
    { value:'', textContent:'Choose zone…' },
    { value:'S3D:ecommons', textContent:'East Commonlands — ecommons (S3D)' },
    { value:'S3D:commons', textContent:'West Commonlands — commons (S3D)' },
    { value:'EQG:commons', textContent:'West Commonlands — commons (EQG)' },
    { value:'S3D:gukbottom', textContent:'Lower Guk — gukbottom (S3D)' },
    { value:'S3D:guktop', textContent:'Upper Guk — guktop (S3D)' },
    { value:'S3D:mistmoore', textContent:'Mistmoore Castle — mistmoore (S3D)' },
    { value:'S3D:gfaydark', textContent:'Greater Faydark / Kelethin — gfaydark (S3D)' }
];
for (const [name, expected] of [
    ['commons', 'S3D:commons'], ['ecommons', 'S3D:ecommons'], ['EQG:commons', 'EQG:commons'],
    ['guktop', 'S3D:guktop'], ['gukbottom', 'S3D:gukbottom'], ['West Commonlands', 'S3D:commons'],
    ['The Castle of Mistmoore', 'S3D:mistmoore'], ['Kelethin', 'S3D:gfaydark']
]) {
    assert.equal(selectViewerZoneOption(options, name)?.value, expected, `${name} must select the exact archive`);
}
for (const unknown of ['', 'Guk', 'unknown-zone', 'Choose zone…']) {
    assert.equal(selectViewerZoneOption(options, unknown), null, `${unknown} must not inherit an unrelated zone or placeholder`);
}
assert.equal(selectViewerZoneOption([
    { value:'S3D:one', textContent:'Shared Display — one (S3D)' },
    { value:'S3D:two', textContent:'Shared Display — two (S3D)' }
], 'Shared Display'), null, 'Ambiguous display aliases must be refused');
console.log('Viewer exact archive IDs, game aliases, format selection, and ambiguous/unknown rejection contracts passed.');

// Execute the actual wrapper method, not a copy of its acceptance conditions.
const wrapper = readFileSync(new URL('../app/zoneviewer/viewer.html', import.meta.url), 'utf8');
const from = wrapper.indexOf('    async loadZone(zoneName) {');
const to = wrapper.indexOf('    syncLocation(', from);
assert(from >= 0 && to > from);
for (const fail of [false, true]) {
    const select = { value:'S3D:ecommons', disabled:false, options, dispatchEvent() {} };
    const app = {
        source:{}, currentZoneRecord:{ id:'ecommons', format:'S3D' },
        els:{ zoneSelect:select, statusText:{ textContent:'Synthetic previous zone' } },
        selectedZoneRecord() { const [format,id] = select.value.split(':'); return { format,id }; },
        clearNavigationGuide() {}, resetLoadedZone() {}, setStatus() {},
        async loadSelectedZone() {
            if (fail) this.els.statusText.textContent = 'Synthetic archive load failed';
            else this.currentZoneRecord = this.selectedZoneRecord();
        }
    };
    const context = vm.createContext({ app, selectViewerZoneOption, overlayMode:false,
        Event:class {}, clearRareMobs() {}, collisionGeometryPromise:Promise.resolve(), loadedZoneIdentity:'',
        startCollisionGeometryExport() {}, root:{}, waitForZoneSelect:async () => select
    });
    context.zoneLoadGuard = installZoneLoadGuard(app);
    const api = vm.runInContext(`({${wrapper.slice(from,to)}})`, context);
    const result = await api.loadZone('commons');
    assert.equal(select.value, 'S3D:commons', 'Actual wrapper must distinguish commons from ecommons');
    assert.equal(result.ok, !fail);
    assert.equal(app.currentZoneRecord?.id ?? null, fail ? null : 'commons');
    if (fail) assert.equal(result.reason, 'load-failed', 'Failed new zone cannot reuse old readiness');
    assert.equal((await api.loadZone('unknown-zone')).reason, 'zone-not-found');
}
console.log('Actual wrapper exact-selection and failed-load acceptance contracts passed.');
