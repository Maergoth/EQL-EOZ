import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TimerEngine } from '../app/timer-engine.js';
import { mountTimerSettings, timerDefinitionFromFields, renderSavedTimerDefinitions, renderActiveTimerSettings } from '../app/timer-settings.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
class Element {
    value = ''; checked = false; disabled = false; hidden = false; textContent = ''; innerHTML = ''; dataset = {};
    listeners = new Map();
    addEventListener(name, callback) { const list = this.listeners.get(name) || []; list.push(callback); this.listeners.set(name, list); }
    removeEventListener(name, callback) { this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== callback)); }
    async fire(name, target = this) { for (const callback of this.listeners.get(name) || []) await callback({ target, preventDefault() {} }); }
    closest(selector) { return selector === '[data-timer-action]' && this.dataset.timerAction ? this : null; }
    focus() { this.focused = true; }
}
function form(names) {
    const result = new Element();
    result.fields = Object.fromEntries(names.map(name => [name, new Element()]));
    result.elements = { namedItem:name => result.fields[name] };
    return result;
}
function fixture({ session, engine = new TimerEngine({ now:() => 100000 }) } = {}) {
    const root = new Element();
    const editor = form(['label', 'type', 'durationSeconds', 'zone', 'trigger', 'match', 'overlap', 'repeat', 'enabled']);
    const quick = form(['label', 'durationSeconds', 'repeat']);
    const kill = form(['durationSeconds']);
    const selectors = ['data-timer-status', 'data-editor-title', 'data-save-definition', 'data-trigger-field', 'data-match-field', 'data-trigger-title', 'data-editor-help',
        'data-active-timers', 'data-saved-timers', 'data-last-kill', 'data-swing-enabled', 'data-swing-delay', 'data-swing-summary', 'data-start-spawn'];
    const elements = Object.fromEntries(selectors.map(name => [`[${name}]`, new Element()]));
    elements['[data-timer-editor]'] = editor; elements['[data-quick-timer]'] = quick; elements['[data-kill-timer]'] = kill;
    root.querySelector = selector => elements[selector];
    root.querySelectorAll = () => [...Object.values(elements), ...Object.values(editor.fields), ...Object.values(quick.fields), ...Object.values(kill.fields)];
    const listeners = new Set(), calls = [];
    const api = session ?? {
        getTimers:() => engine.snapshot(),
        commandTimer(action, payload) { calls.push({ action, payload }); const snapshot = engine.command(action, payload); for (const callback of listeners) callback(snapshot); return snapshot; },
        onTimers(callback) { listeners.add(callback); return () => listeners.delete(callback); }
    };
    const controller = mountTimerSettings({ root, session:api });
    return { root, editor, quick, kill, elements, controller, engine, calls, listeners,
        async click(action, id, definition = false) { const target = new Element(); target.dataset = { timerAction:action, ...(id ? { [definition ? 'definitionId' : 'timerId']:id } : {}) }; await root.fire('click', target); await flush(); },
        emit() { for (const callback of listeners) callback(engine.snapshot()); }
    };
}

assert.deepEqual(timerDefinitionFromFields({ label:'Text', type:'text', durationSeconds:'30', trigger:' Ready ', match:'equals', overlap:'ignore', zone:' Test ' }, 'saved-1'),
    { id:'saved-1', label:'Text', type:'text', durationSeconds:30, repeat:false, enabled:true, trigger:'Ready', npc:'', match:'equals', overlap:'ignore', zone:'Test' });
assert.equal(timerDefinitionFromFields({ label:'Kill', type:'spawn', trigger:'a rat', durationSeconds:60 }).npc, 'a rat');
assert.throws(() => timerDefinitionFromFields({ label:'', durationSeconds:60 }), /name/);
assert.throws(() => timerDefinitionFromFields({ label:'Long', durationSeconds:604801 }), /duration/);
assert.throws(() => timerDefinitionFromFields({ label:'Missing', type:'text', durationSeconds:60 }), /log text/);
assert.throws(() => timerDefinitionFromFields({ label:'Missing', type:'spawn', durationSeconds:60 }), /target name/);
const escaped = renderSavedTimerDefinitions([{ id:'"><script>', label:'<img onerror=bad>', type:'text', durationSeconds:10, trigger:'<bad>', zone:'<zone>' }]);
assert.ok(!escaped.includes('<script>'));
assert.ok(!escaped.includes('<img onerror'));
assert.match(escaped, /&lt;img/);
assert.match(renderActiveTimerSettings([{ id:'1', label:'Other', remainingMs:3000, status:'paused', visible:false, zone:'Elsewhere' }]), /counting in another zone/);

const app = fixture();
await flush();
assert.equal(app.elements['[data-start-spawn]'].disabled, true);
assert.equal(app.editor.fields.type.value, 'manual');
app.editor.fields.label.value = 'Manual reminder';
app.editor.fields.durationSeconds.value = '30';
app.editor.fields.repeat.checked = true;
await app.editor.fire('submit');
assert.equal(app.engine.snapshot().definitions.length, 1);
const manualId = app.engine.snapshot().definitions[0].id;
assert.equal(app.engine.snapshot().definitions[0].repeat, true);
assert.equal(app.editor.fields.label.value, '', 'successful save clears the new-definition draft');
assert.match(app.elements['[data-timer-status]'].textContent, /saved/);
await app.click('edit', manualId, true);
assert.equal(app.editor.fields.label.value, 'Manual reminder');
app.editor.fields.label.value = 'Unsaved edited name';
app.emit();
assert.equal(app.editor.fields.label.value, 'Unsaved edited name', 'timer updates never replace an editor draft');
app.editor.fields.durationSeconds.value = '45';
app.editor.fields.overlap.value = 'add';
app.editor.fields.enabled.checked = false;
await app.editor.fire('submit');
assert.equal(app.engine.snapshot().definitions.length, 1, 'edit preserves the definition ID rather than duplicating it');
assert.equal(app.engine.snapshot().definitions[0].label, 'Unsaved edited name');
assert.equal(app.engine.snapshot().definitions[0].durationSeconds, 45);
assert.equal(app.engine.snapshot().definitions[0].enabled, false);
assert.equal(app.engine.snapshot().definitions[0].overlap, 'add');
await app.click('start', manualId, true);
assert.equal(app.engine.snapshot().timers.length, 1);
const timerId = app.engine.snapshot().timers[0].id;
await app.click('pause', timerId);
assert.equal(app.engine.snapshot().timers[0].status, 'paused');
await app.click('resume', timerId);
assert.equal(app.engine.snapshot().timers[0].status, 'running');
await app.click('reset', timerId);
assert.equal(app.engine.snapshot().timers[0].remainingMs, 45000);
await app.click('delete', timerId);
assert.equal(app.engine.snapshot().timers.length, 0);

app.editor.fields.type.value = 'text';
await app.root.fire('change', app.editor.fields.type);
assert.equal(app.elements['[data-trigger-field]'].hidden, false);
assert.equal(app.elements['[data-match-field]'].hidden, false);
app.editor.fields.label.value = 'Literal trigger';
app.editor.fields.trigger.value = 'Ready now!';
app.editor.fields.durationSeconds.value = '20';
app.editor.fields.match.value = 'equals';
app.editor.fields.overlap.value = 'ignore';
app.editor.fields.zone.value = 'Elsewhere';
await app.editor.fire('submit');
const textDefinition = app.engine.snapshot().definitions.find(item => item.type === 'text');
assert.equal(textDefinition.match, 'equals');
assert.equal(textDefinition.overlap, 'ignore');
assert.equal(textDefinition.zone, 'Elsewhere');
await app.click('start', textDefinition.id, true);
assert.match(app.elements['[data-timer-status]'].textContent, /limited to Elsewhere/, 'owner errors are visible in the main editor');
assert.equal(app.elements['[data-timer-status]'].dataset.error, 'true');
assert.equal(app.engine.snapshot().timers.length, 0);

app.quick.fields.label.value = 'Quick countdown';
app.quick.fields.durationSeconds.value = '10';
app.quick.fields.repeat.checked = true;
await app.quick.fire('submit');
assert.equal(app.engine.snapshot().timers[0].label, 'Quick countdown');
assert.equal(app.engine.snapshot().timers[0].repeat, true);
assert.equal(app.engine.snapshot().definitions.length, 2, 'quick countdown does not create an extra saved trigger');
app.engine.consume({ type:'kill', victim:'a synthetic rat', at:97000 }, { live:true, zone:'Test', logId:'synthetic' });
app.emit();
assert.equal(app.elements['[data-start-spawn]'].disabled, false);
assert.match(app.elements['[data-last-kill]'].textContent, /synthetic rat/);
app.kill.fields.durationSeconds.value = '60';
await app.kill.fire('submit');
const spawn = app.engine.snapshot().timers.find(item => item.source === 'spawn');
assert.equal(spawn.remainingMs, 57000, 'main editor starts the one-time reminder from its logged kill timestamp');
app.elements['[data-swing-enabled]'].checked = false;
await app.root.fire('change', app.elements['[data-swing-enabled]']); await flush();
assert.equal(app.engine.snapshot().swing.enabled, false);
app.elements['[data-swing-delay]'].value = '36';
await app.root.fire('change', app.elements['[data-swing-delay]']); await flush();
assert.equal(app.engine.snapshot().swing.delayTenths, 36);
app.elements['[data-swing-delay]'].value = '-1';
await app.root.fire('change', app.elements['[data-swing-delay]']); await flush();
assert.match(app.elements['[data-timer-status]'].textContent, /Weapon delay/);
await app.click('reset-swing');
assert.equal(app.calls.at(-1).action, 'reset-swing');
await app.click('edit', manualId, true);
await app.click('remove-definition', manualId, true);
assert.equal(app.engine.snapshot().definitions.some(item => item.id === manualId), false);
assert.equal(app.editor.fields.label.value, '', 'deleting the selected definition ends its edit session');
await app.click('cancel-all');
assert.equal(app.engine.snapshot().timers.length, 0);
app.controller.dispose(); app.controller.dispose();
assert.equal(app.listeners.size, 0);
const finalCalls = app.calls.length;
await app.click('reset-swing');
assert.equal(app.calls.length, finalCalls, 'disposed editor removes command listeners');

const failed = fixture({ session:{ getTimers:async () => { throw new Error('closed'); }, commandTimer() {} } });
await flush();
assert.equal(failed.editor.fields.label.disabled, true);
assert.match(failed.elements['[data-timer-status]'].textContent, /unavailable/);
failed.controller.dispose();
const source = readFileSync(new URL('../app/timer-settings.js', import.meta.url), 'utf8');
assert.ok(!/new TimerEngine|new EQLogParser|setInterval\(/.test(source), 'main timer editor shares the owner session and creates no parser/engine/clock');
assert.match(source, /Retain existing/);
assert.match(source, /Add another/);
console.log('Timer settings: complete main-app editing, draft retention, countdown controls, literal/zone/overlap options, kill reminders, swing controls and visible errors passed.');
