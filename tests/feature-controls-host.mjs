import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as registry from '../app/feature-registry.js';

const { FeatureControls, CHANNEL } = createRequire(import.meta.url)('../desktop/feature-controls.cjs');
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const clone = value => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }

equal(CHANNEL, 'eye-of-zomm:features');
equal(registry.FEATURE_IDS, ['map', 'npcIntel', 'items', 'drops', 'combat', 'triggers', 'contributions', 'character', 'overlays', 'screenReading', 'dropObservations']);

// A missing availability preference keeps the application usable. Only literal
// false in saved known keys disables; consent lives outside this host entirely.
{
    const writes = [], applies = [], events = [];
    const host = new FeatureControls({ registry, persist: async value => writes.push(clone(value)), apply: async (...args) => applies.push(args), onChanged: value => events.push(clone(value)) });
    equal(host.snapshot(), { schemaVersion: 1, revision: 0, features: Object.fromEntries(registry.FEATURE_IDS.map(id => [id, true])) });
    const exposed = host.snapshot(); exposed.features.map = false;
    check(host.enabled('map'), 'A renderer cannot mutate native availability through its snapshot.');
    equal([writes.length, applies.length, events.length], [0, 0, 0], 'Loading defaults has no side effects.');
    const saved = new FeatureControls({ registry, initial: { map: false, combat: 0, character: null, screenReading: 'false', unknownFeature: false } });
    check(!saved.enabled('map') && saved.enabled('combat') && saved.enabled('character') && saved.enabled('screenReading'), 'Malformed historical values cannot silently disable a known component.');
    equal(Object.keys(saved.snapshot().features), registry.FEATURE_IDS, 'Unknown historical settings are not executable feature IDs.');
    check(!host.enabled('unknownFeature') && !host.lease('unknownFeature')(), 'Unknown nonempty feature IDs deny availability and work leases.');
    assert.throws(() => host.assert('unknownFeature'), /disabled/); checks++;
    check(host.enabled(null), 'The explicit null core context remains available.');
    await host.set({ map: true });
    equal([host.snapshot().revision, writes.length, applies.length, events.length], [0, 0, 0, 0], 'An unchanged value does not stop work or rewrite preferences.');
}

// The trusted handler is the native permission boundary for Settings IPC.
{
    const trusted = {}, stranger = {}, writes = [];
    const host = new FeatureControls({ registry, allowed: event => event === trusted, persist: async value => writes.push(value) });
    await assert.rejects(host.handle(stranger, 'get-state'), /only in the main app/); checks++;
    await assert.rejects(host.handle(stranger, 'set', { character: false }), /only in the main app/); checks++;
    await assert.rejects(host.handle(trusted, 'unknown'), /Unknown feature/); checks++;
    for (const value of [null, undefined, [], {}, false, { map: 'false' }, { map: 0 }, { map: null }, { unknownFeature: true }, { map: false, unknownFeature: false }, JSON.parse('{"__proto__":false}')]) {
        await assert.rejects(host.handle(trusted, 'set', value), /valid feature/); checks++;
    }
    equal([host.snapshot().revision, writes.length], [0, 0], 'Invalid/untrusted requests do not change state or persist.');
    const state = await host.handle(trusted, 'set', { character: false, screenReading: false });
    equal([state.revision, state.features.character, state.features.screenReading], [1, false, false]);
    await assert.rejects(async () => host.assert('character'), /disabled/); checks++;
    equal(await host.handle(trusted, 'get-state'), state);
    equal(Object.keys(writes[0]).sort(), [...registry.FEATURE_IDS].sort(), 'Persistence contains availability flags only, no capture permission or observation consent.');
}

// Disable revokes existing work before either asynchronous application or disk
// acknowledgment. A later enable does not make the old work current again.
{
    const applied = deferred(), allowApply = deferred(), persisting = deferred(), allowPersist = deferred();
    const events = [], writes = [], stopped = [];
    let host;
    host = new FeatureControls({ registry,
        apply: async (next, previous, changed) => {
            equal([next.features.map, previous.features.map, changed], [false, true, ['map']]);
            check(!host.enabled('map') && !lease(), 'Native work is denied before the first stop await.');
            stopped.push(...changed); applied.resolve(); await allowApply.promise;
        },
        persist: async value => { writes.push(clone(value)); persisting.resolve(); await allowPersist.promise; },
        onChanged: value => events.push(clone(value))
    });
    const lease = host.lease('map'), change = host.set({ map: false });
    await applied.promise;
    equal([writes.length, events.length, host.snapshot().revision], [0, 0, 1], 'No durable success is emitted while stop work is pending.');
    allowApply.resolve(); await persisting.promise;
    check(!lease(), 'Unacknowledged persistence cannot revive the revoked request.');
    equal(events.length, 0);
    allowPersist.resolve(); const result = await change;
    equal([result.revision, result.features.map, stopped, events.length], [1, false, ['map'], 1]);
    host.apply = async () => {};
    await host.set({ map: true });
    check(host.enabled('map') && !lease(), 'Disable/re-enable never revalidates an earlier epoch.');
    check(host.lease('map')(), 'Fresh explicit work can acquire a new lease after enable.');
}

// Serialized patches compose against acknowledged native state instead of a
// stale full renderer snapshot, and every result remains its own immutable ACK.
{
    const entered = deferred(), release = deferred(), applied = [], persisted = [], events = [];
    const host = new FeatureControls({ registry,
        apply: async (next, before, changed) => { applied.push({ next: clone(next), before: clone(before), changed: [...changed] }); if (applied.length === 1) { entered.resolve(); await release.promise; } },
        persist: async value => persisted.push(clone(value)), onChanged: state => events.push(clone(state))
    });
    const first = host.set({ combat: false }); await entered.promise;
    const second = host.set({ triggers: false });
    equal(applied.length, 1, 'A second change waits for the first lifecycle/commit operation.');
    release.resolve(); const [a, b] = await Promise.all([first, second]);
    equal([a.revision, a.features.combat, a.features.triggers], [1, false, true]);
    equal([b.revision, b.features.combat, b.features.triggers], [2, false, false]);
    equal(applied[1].before, a, 'The second lifecycle observes the actual preceding ACK.');
    equal(persisted, events.map(value => value.features));
    const restarted = new FeatureControls({ registry, initial: persisted.at(-1) });
    equal(restarted.snapshot().features, b.features, 'A new native host restores the saved availability without altering other feature defaults.');
    equal(restarted.snapshot().revision, 0, 'Runtime revisions are a session sequence, not invented persisted acknowledgments.');
}

// Apply/save failures restore the prior preference, publish no false success,
// and keep revoked leases dead. Restoration is not an automatic worker restart.
for (const failAt of ['apply', 'persist']) {
    const events = [], calls = [], disk = [], before = { map: true, character: false };
    const host = new FeatureControls({ registry, initial: before,
        apply: async (next, previous, changed) => { calls.push({ next: clone(next), previous: clone(previous), changed: [...changed] }); if (failAt === 'apply') throw Error('stop failed'); },
        persist: async value => { if (failAt === 'persist') throw Error('disk full'); disk.push(clone(value)); },
        onChanged: value => events.push(clone(value))
    });
    const lease = host.lease('map');
    await assert.rejects(host.set({ map: false }), failAt === 'apply' ? /stop failed/ : /disk full/); checks++;
    equal([host.snapshot().revision, host.enabled('map'), host.enabled('character'), calls.length, disk.length, events.length], [2, true, false, 1, 0, 1]);
    equal(events[0], host.snapshot(), 'Failure emits restored availability with a newer revision.');
    check(!lease(), 'A failed disable cannot resurrect work admitted before it.');
    host.apply = async () => {}; host.persist = async value => disk.push(clone(value));
    const recovered = await host.set({ items: false });
    equal([recovered.revision, recovered.features.map, recovered.features.character, recovered.features.items, disk.length], [3, true, false, false, 1], 'A failed task does not poison later serialized settings changes.');
}

// A delayed owner is a synthetic stand-in for post-await native work. This
// verifies the lease contract only, not any specific capture/wiki integration.
{
    const work = deferred(), host = new FeatureControls({ registry });
    let committed = 0;
    const current = host.lease('contributions');
    const pending = (async () => { await work.promise; if (!current()) return 'discarded'; committed++; return 'committed'; })();
    await host.set({ contributions: false }); await host.set({ contributions: true }); work.resolve();
    equal([await pending, committed], ['discarded', 0], 'A late result cannot cross a disable/re-enable boundary.');
    const disabled = new FeatureControls({ registry, initial: { screenReading: false } });
    const prior = disabled.lease('screenReading'); check(!prior());
    await disabled.set({ screenReading: true });
    check(!prior(), 'A lease created while disabled is not a stored resume intent.');
}

// Local buffered data drains before availability/epoch revocation. The release
// callback belongs to the same serialized operation, including its cleanup.
{
    const preparing = deferred(), allowPrepare = deferred(), releasing = deferred(), allowRelease = deferred();
    const prepared = [], applied = [], persisted = [], released = [];
    let host;
    host = new FeatureControls({ registry,
        prepare: async (next, before, changed) => {
            prepared.push({ next: clone(next), before: clone(before), changed: [...changed] });
            if (prepared.length === 1) { preparing.resolve(); await allowPrepare.promise; }
            return async () => {
                released.push(host.snapshot());
                if (released.length === 1) { releasing.resolve(); await allowRelease.promise; }
            };
        },
        apply: async (...args) => applied.push(args), persist: async value => persisted.push(clone(value))
    });
    const lease = host.lease('dropObservations');
    const first = host.set({ dropObservations: false }); await preparing.promise;
    const second = host.set({ items: false });
    equal([host.snapshot().revision, host.enabled('dropObservations'), lease(), applied.length, persisted.length, prepared.length], [0, true, true, 0, 0, 1], 'Preparation keeps accepted data writable and earlier leases valid; competing changes wait.');
    equal(prepared[0].changed, ['dropObservations']);
    equal([prepared[0].next.features.dropObservations, prepared[0].before.features.dropObservations], [false, true]);
    allowPrepare.resolve(); await releasing.promise;
    equal([host.enabled('dropObservations'), lease(), persisted.length, prepared.length], [false, false, 1, 1], 'Revocation and persistence happen after prepare, and the next patch waits for release.');
    allowRelease.resolve(); const [a, b] = await Promise.all([first, second]);
    equal([a.revision, a.features.dropObservations, a.features.items], [1, false, true]);
    equal([b.revision, b.features.dropObservations, b.features.items], [2, false, false]);
    equal(prepared[1].before, a, 'A later preparation observes the preceding completed change.');
    equal(released.length, 2, 'Each completed preparation releases once.');
}
{
    let applied = 0, persisted = 0, emitted = 0;
    const host = new FeatureControls({ registry, prepare: async () => { throw Error('pending observations could not be saved'); }, apply: async () => applied++, persist: async () => persisted++, onChanged: () => emitted++ });
    const before = host.snapshot(), lease = host.lease('dropObservations');
    await assert.rejects(host.set({ dropObservations: false }), /pending observations/); checks++;
    equal(host.snapshot(), before, 'A failed drain does not claim a feature change or advance its revision.');
    check(lease(), 'A failed preflight does not revoke the still-enabled feature.');
    equal([applied, persisted, emitted], [0, 0, 0], 'A failed drain performs no availability lifecycle, save or notification.');
}
for (const failAt of ['apply', 'persist']) {
    const releases = [];
    let host;
    host = new FeatureControls({ registry,
        prepare: async () => () => { releases.push(host.snapshot()); },
        apply: async () => { if (failAt === 'apply') throw Error('apply failed after drain'); },
        persist: async () => { if (failAt === 'persist') throw Error('save failed after drain'); }
    });
    await assert.rejects(host.set({ dropObservations: false }), failAt === 'apply' ? /apply failed/ : /save failed/); checks++;
    equal(releases, [host.snapshot()], 'Prepared work is released exactly once after availability rollback.');
    equal([host.snapshot().revision, host.enabled('dropObservations')], [2, true]);
}

console.log(`Feature controls native host: ${checks} synthetic assertions passed (defaults, trust, serialization, revocation, failure/restart; no Electron/native work).`);
