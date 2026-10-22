// PNUT-style list/editor in the complete app. The native Triggers panel only
// presents this shared session; no parser, clock or engine is created here.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const duration = milliseconds => { const total = Math.ceil(Math.max(0, Number(milliseconds) || 0) / 1000); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`; };
const ACTIONS = '<option value="none">Nothing</option><option value="sound">Built-in sound</option><option value="speak">Speak text</option>';
const SOUNDS = ['Chime', 'Tick', 'Bell', 'Alert', 'Falling'].map(name => `<option>${name}</option>`).join('');
const EXTRA = ['displayLabel', 'cooldownSeconds', 'notificationSeconds', 'warningSeconds', 'lowSeconds', 'color', 'warningColor', 'lowColor', 'action', 'sound', 'speech', 'volume', 'warningAction', 'warningSound', 'warningSpeech', 'endAction', 'endSound', 'endSpeech'];
const DEFAULTS = { label:'', type:'text', durationSeconds:30, trigger:'', zone:'', match:'contains', overlap:'replace', enabled:true, repeat:false,
    timerEnabled:true, ignorePunctuation:false, displayLabel:'', cooldownSeconds:0, notificationSeconds:4, warningSeconds:0, lowSeconds:5,
    color:'#55b79a', warningColor:'#d8b75c', lowColor:'#dc6867', action:'none', sound:'Chime', speech:'{label}', volume:80,
    warningAction:'none', warningSound:'Tick', warningSpeech:'{label} soon', endAction:'none', endSound:'Bell', endSpeech:'{label}' };

export function timerDefinitionFromFields(fields, id = '') {
    const label = String(fields.label || '').trim(), durationSeconds = Number(fields.durationSeconds);
    const type = ['manual', 'text', 'spawn'].includes(fields.type) ? fields.type : 'manual';
    const trigger = String(fields.trigger || '').trim();
    if (!label) throw new Error('Enter a trigger name.');
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 604800) throw new Error('Choose a duration between 1 second and 7 days.');
    if (type !== 'manual' && !trigger) throw new Error(type === 'spawn' ? 'Enter the exact logged target name.' : 'Enter the log text or regular expression.');
    if (trigger.length > 2048) throw new Error('Expressions are limited to 2048 characters.');
    const result = { ...(id ? { id } : {}), label, type, durationSeconds, repeat:Boolean(fields.repeat), enabled:fields.enabled !== false,
        trigger:type === 'text' ? trigger : '', npc:type === 'spawn' ? trigger : '',
        match:['contains', 'starts', 'equals', 'regex'].includes(fields.match) ? fields.match : 'contains',
        overlap:['replace', 'ignore', 'add'].includes(fields.overlap) ? fields.overlap : 'replace', zone:String(fields.zone || '').trim() };
    for (const key of EXTRA) if (fields[key] !== undefined) result[key] = fields[key];
    for (const key of ['timerEnabled', 'ignorePunctuation']) if (fields[key] !== undefined) result[key] = Boolean(fields[key]);
    return result;
}

export function renderSavedTimerDefinitions(definitions = [], selected = '', search = '') {
    const needle = String(search).trim().toLowerCase();
    const visible = definitions.filter(item => `${item.label} ${item.trigger || item.npc || ''}`.toLowerCase().includes(needle));
    return visible.length ? visible.map(item => `<div class="trigger-list-row ${item.id === selected ? 'is-selected' : ''}"><input type="checkbox" data-toggle-definition="${escapeHtml(item.id)}" aria-label="Enable ${escapeHtml(item.label)}" ${item.enabled !== false ? 'checked' : ''}><button type="button" data-timer-action="edit" data-definition-id="${escapeHtml(item.id)}" aria-pressed="${item.id === selected}"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.trigger || item.npc || 'Manual trigger')}${item.error ? ' · needs review' : ''}</small></button></div>`).join('') : '<p class="timer-note">No matching triggers. Choose New to add one.</p>';
}
export function renderActiveTimerSettings(timers = []) {
    return timers.length ? timers.map(item => `<div class="timer-settings-row"><div><strong>${escapeHtml(item.label)} <span class="timer-settings-time">${duration(item.remainingMs)}</span></strong><small>${escapeHtml(item.status)}${item.repeat ? ' · repeating' : ''}${item.zone ? ` · ${escapeHtml(item.zone)}` : ''}${item.visible === false ? ' · counting in another zone' : ''}${item.source === 'spawn' ? ' · personal respawn estimate' : ''}</small></div><div class="timer-row-actions">${item.status === 'ended' ? '' : `<button type="button" data-timer-action="${item.status === 'paused' ? 'resume' : 'pause'}" data-timer-id="${escapeHtml(item.id)}">${item.status === 'paused' ? 'Resume' : 'Pause'}</button>`}<button type="button" data-timer-action="reset" data-timer-id="${escapeHtml(item.id)}">${item.status === 'ended' ? 'Start again' : 'Reset'}</button><button type="button" data-timer-action="delete" data-timer-id="${escapeHtml(item.id)}">Dismiss</button></div></div>`).join('') : '<p class="timer-note">No active countdowns.</p>';
}
const fieldMarkup = (label, name, extra = '') => `<label class="timer-stacked">${label}<input name="${name}" ${extra}></label>`;
const audioMarkup = (prefix, title) => `<fieldset class="cue-editor"><legend>${title}</legend><div class="timer-form-grid"><label class="timer-stacked">Do<select name="${prefix}Action">${ACTIONS}</select></label><label class="timer-stacked">Sound<select name="${prefix}Sound">${SOUNDS}</select></label><label class="timer-stacked timer-wide">Say<input name="${prefix}Speech" maxlength="240"></label></div></fieldset>`;

export function mountTimerSettings({ root = globalThis.document?.getElementById('timer-settings'), session } = {}) {
    if (!root) return { render() {}, dispose() {} };
    root.innerHTML = `<style>
        #timer-settings [hidden]{display:none!important}#timer-settings .timer-note,#timer-settings small{font-size:calc(11px * var(--ui-font-scale,1));line-height:1.5;color:#9ba8b8}#timer-settings small{display:block;overflow-wrap:anywhere}#timer-settings h3{color:#e8d48f;font-size:calc(13px * var(--ui-font-scale,1));margin:0 0 12px}#timer-settings button{font:inherit;font-size:calc(11px * var(--ui-font-scale,1));color:#e8d48f;background:#172435;border:1px solid #43516a;border-radius:5px;padding:7px 10px;cursor:pointer}#timer-settings button:disabled{opacity:.45;cursor:default}#timer-settings button:focus-visible,#timer-settings input:focus-visible,#timer-settings select:focus-visible,#timer-settings textarea:focus-visible{outline:2px solid #d8b75c;outline-offset:2px}#timer-settings .timer-tabbar,#timer-settings .timer-row-actions{display:flex;gap:6px;flex-wrap:wrap}#timer-settings .timer-tabbar{border-bottom:1px solid #33445b;padding-bottom:12px;margin-bottom:16px}#timer-settings [aria-selected=true],#timer-settings .is-selected{background:#2b342e;border-color:#9d884b}#timer-settings .trigger-workspace{display:grid;grid-template-columns:minmax(190px,30%) minmax(0,1fr);gap:18px;align-items:start}#timer-settings .trigger-sidebar{position:sticky;top:12px;border:1px solid #33445b;border-radius:7px;padding:10px;background:#101a27}#timer-settings .trigger-list{max-height:510px;overflow:auto;margin:10px 0}#timer-settings .trigger-list-row{display:flex;align-items:center;gap:7px;border:1px solid transparent;border-radius:4px;padding:5px}#timer-settings .trigger-list-row button{display:block;text-align:left;min-width:0;flex:1;border:0;background:transparent;padding:4px}#timer-settings .trigger-list-row small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}#timer-settings .trigger-editor-section{padding:14px;border:1px solid #33445b;border-radius:7px;margin-bottom:12px;background:#0e1825}#timer-settings .timer-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin:10px 0}#timer-settings label{font-size:calc(11px * var(--ui-font-scale,1));color:#bac5d1;display:flex;gap:6px;align-items:center}#timer-settings label.timer-stacked{flex-direction:column;align-items:stretch;gap:5px}#timer-settings input:not([type=checkbox]),#timer-settings select,#timer-settings textarea{min-width:0;width:100%;box-sizing:border-box;padding:7px;border:1px solid #33465c;border-radius:5px;background:#0a1421;color:#ecedee;font:inherit}#timer-settings input[type=checkbox]{accent-color:#d8b75c}#timer-settings textarea{resize:vertical}#timer-settings .timer-wide{grid-column:1/-1}#timer-settings .timer-settings-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #ffffff13;padding:10px 0}#timer-settings .timer-settings-time{font-variant-numeric:tabular-nums;color:#f1e2b0;margin-left:8px}#timer-settings [data-timer-status]{min-height:1.5em;color:#e8d48f;font-size:calc(12px * var(--ui-font-scale,1))}#timer-settings [data-error=true]{color:#f39c96}#timer-settings .timer-preview{white-space:pre-wrap;overflow-wrap:anywhere;font-size:calc(12px * var(--ui-font-scale,1));color:#c8dbc8;padding:9px;background:#08131d;min-height:1.5em;border-radius:4px}#timer-settings .cue-editor{border:1px solid #33445b;border-radius:5px;padding:9px;margin:10px 0}#timer-settings legend,#timer-settings summary{color:#d8c78b;font-size:calc(12px * var(--ui-font-scale,1))}#timer-settings details{margin:12px 0}#timer-settings details>summary{cursor:pointer;padding:7px 0}@media(max-width:760px){#timer-settings .trigger-workspace{grid-template-columns:1fr}#timer-settings .trigger-sidebar{position:static}#timer-settings .trigger-list{max-height:180px}#timer-settings .timer-form-grid{grid-template-columns:1fr}#timer-settings .timer-settings-row{align-items:flex-start;flex-direction:column}}
        </style><h2>Triggers</h2><p class="timer-note">Build log triggers and countdowns here; the floating Triggers panel stays a compact display.</p><p data-timer-status role="status" aria-live="polite"></p>
        <nav class="timer-tabbar" aria-label="Trigger tools"><button type="button" data-timer-tab="triggers" aria-selected="true">Triggers</button><button type="button" data-timer-tab="running" aria-selected="false">Running countdowns</button><button type="button" data-timer-tab="swing" aria-selected="false">Swing</button></nav>
        <div data-timer-pane="triggers"><div class="trigger-workspace"><aside class="trigger-sidebar"><input data-trigger-search type="search" placeholder="Search triggers…" aria-label="Search triggers"><div class="trigger-list" data-saved-timers></div><div class="timer-row-actions"><button type="button" data-timer-action="new">New</button><button type="button" data-timer-action="duplicate">Duplicate</button><button type="button" data-timer-action="remove-selected">Delete</button></div></aside>
        <form data-timer-editor><div class="timer-row-actions"><strong data-editor-title>New trigger</strong><button type="submit" data-save-definition>Save trigger</button><button type="button" data-timer-action="fire-selected">Fire now</button><label><input name="enabled" type="checkbox" checked> Enabled</label></div>
        <section class="trigger-editor-section"><h3>When the chat says</h3><div class="timer-form-grid">${fieldMarkup('Name', 'label', 'maxlength="80" required placeholder="Name in the trigger list"')}<label class="timer-stacked">Type<select name="type"><option value="text">Log text trigger</option><option value="manual">Manual trigger / countdown</option><option value="spawn">Logged kill / respawn reminder</option></select></label><label class="timer-stacked timer-wide" data-trigger-field><span data-trigger-title>Text</span><textarea name="trigger" rows="2" maxlength="2048" placeholder="begins casting Mesmerize"></textarea></label><label class="timer-stacked" data-match-field>Match<select name="match"><option value="contains">Contains</option><option value="starts">Starts with</option><option value="equals">Whole line</option><option value="regex">Regular expression</option></select></label><label><input name="ignorePunctuation" type="checkbox"> Ignore punctuation in literal text</label>${fieldMarkup('Zone (optional)', 'zone', 'maxlength="120" placeholder="Current zone name"')}</div><p class="timer-note" data-editor-help></p><label class="timer-stacked">Test line<textarea data-test-line rows="2" maxlength="8192" placeholder="Paste a log line to test without starting anything"></textarea></label><div class="timer-row-actions"><button type="button" data-timer-action="test">Test match</button></div><div class="timer-preview" data-test-result role="status" aria-live="polite">Paste a line and choose Test match.</div></section>
        <section class="trigger-editor-section"><h3>Then</h3><div class="timer-form-grid">${fieldMarkup('Display label', 'displayLabel', 'maxlength="240" placeholder="Default: trigger name. Captures: {name}, {line}, {match}, {damage}"')}<label class="timer-stacked">Do<select name="action">${ACTIONS}</select></label><label class="timer-stacked">Sound<select name="sound">${SOUNDS}</select></label>${fieldMarkup('Say', 'speech', 'maxlength="240"')}${fieldMarkup('Quiet for (seconds)', 'cooldownSeconds', 'type="number" min="0" max="600" step="0.1"')}${fieldMarkup('Volume (0–100)', 'volume', 'type="number" min="0" max="100"')}${fieldMarkup('Notification length (without countdown)', 'notificationSeconds', 'type="number" min="1" max="60"')}</div><p class="timer-note">Without a countdown, a matched trigger shows a brief label. Regular expressions can capture values for labels and speech: <code>(?&lt;damage&gt;\\d+)</code> or PNUT’s <code>(?P&lt;damage&gt;\\d+)</code>, then <code>{damage}</code>. Nothing types into the game.</p></section>
        <section class="trigger-editor-section"><h3><label><input name="timerEnabled" type="checkbox" checked> Start a timer</label></h3><div data-timer-options><div class="timer-form-grid">${fieldMarkup('Length (seconds)', 'durationSeconds', 'type="number" min="1" max="604800" step="1" required')}<label class="timer-stacked">If already running<select name="overlap"><option value="replace">Replace</option><option value="ignore">Retain existing</option><option value="add">Add another</option></select></label><label><input name="repeat" type="checkbox"> Repeat countdown</label></div><details><summary>Warning, end alerts & colors</summary><div class="timer-form-grid">${fieldMarkup('Warn before end (seconds)', 'warningSeconds', 'type="number" min="0" max="604800"')}${fieldMarkup('Low duration (seconds)', 'lowSeconds', 'type="number" min="0" max="604800"')}${fieldMarkup('Normal color', 'color', 'type="color"')}${fieldMarkup('Warning color', 'warningColor', 'type="color"')}${fieldMarkup('Low / ended color', 'lowColor', 'type="color"')}</div>${audioMarkup('warning', 'Warning alert')}${audioMarkup('end', 'End alert')}</details></div></section></form></div></div>
        <div data-timer-pane="running" hidden><h3>Running countdowns</h3><div data-active-timers></div><button type="button" data-timer-action="cancel-all">Dismiss all countdowns</button><details><summary>Start a one-time countdown</summary><form data-quick-timer><div class="timer-form-grid">${fieldMarkup('Name', 'label', 'maxlength="80" required')}${fieldMarkup('Duration (seconds)', 'durationSeconds', 'type="number" min="1" max="604800" value="60" required')}<label><input name="repeat" type="checkbox"> Repeat</label></div><button type="submit">Start now</button></form></details><details><summary>Reminder from last logged kill</summary><p class="timer-note" data-last-kill>No live kill has been read yet.</p><form data-kill-timer>${fieldMarkup('Reminder duration (seconds)', 'durationSeconds', 'type="number" min="1" max="604800" value="60" required')}<button type="submit" data-start-spawn>Start respawn reminder</button></form><p class="timer-note">Starts at the kill’s logged time using your chosen duration. The actual respawn period is unknown.</p></details></div>
        <div data-timer-pane="swing" hidden><h3>Observed swing</h3><div class="timer-form-grid"><label><input data-swing-enabled type="checkbox"> Show swing estimate</label><label class="timer-stacked">Weapon delay (tenths)<input data-swing-delay type="number" min="0" max="200" step="1" value="0"></label></div><p class="timer-note" data-swing-summary></p><p class="timer-note">Off by default. Enable this only if you want EoZ's estimate alongside the game's swing timer. 0 learns automatically; 36 seeds 3.6 seconds after a real swing. Your hits and misses inform one round estimate with one-second log precision. Larger slowdowns can remain ambiguous.</p><button type="button" data-timer-action="reset-swing">Relearn swing</button></div>`;
    const $ = selector => root.querySelector(selector), editor = $('[data-timer-editor]'), quick = $('[data-quick-timer]'), killForm = $('[data-kill-timer]');
    const field = name => editor.elements.namedItem(name);
    let state = { definitions:[], timers:[], swing:{} }, selected = '', disposed = false, busy = false, dirty = false, generation = 0, revision = 0, previewSequence = 0, unsubscribe;
    let available = Boolean(session?.getTimers && session?.commandTimer);
    const status = (message, error = false) => { $('[data-timer-status]').textContent = message; $('[data-timer-status]').dataset.error = String(error); };
    function replace(element, html) { if (element.innerHTML !== html) element.innerHTML = html; }
    function updateType() {
        const type = field('type').value, regex = field('match').value === 'regex';
        $('[data-trigger-field]').hidden = type === 'manual'; $('[data-match-field]').hidden = type !== 'text';
        $('[data-trigger-title]').textContent = type === 'spawn' ? 'Exact logged target name' : regex ? 'Regular expression' : 'Text';
        field('trigger').required = type !== 'manual';
        $('[data-timer-options]').hidden = !field('timerEnabled').checked;
        $('[data-editor-help]').textContent = regex && type === 'text' ? 'Expressions run in an isolated worker with a deadline. JavaScript syntax and PNUT named captures are supported. Test before saving.' : type === 'spawn' ? 'Starts on a logged death of this exact target. Set the duration yourself.' : type === 'manual' ? 'Use Fire now to run this saved trigger or countdown.' : 'Case and repeated whitespace are ignored. Optionally ignore punctuation. Only new live lines trigger actions.';
    }
    function editing(item = null, duplicate = false) {
        revision++; previewSequence++;
        selected = duplicate ? '' : item?.id || ''; dirty = false;
        const values = { ...DEFAULTS, ...item, trigger:item?.trigger || item?.npc || '' };
        for (const [name, value] of Object.entries(DEFAULTS)) {
            const input = field(name); if (typeof value === 'boolean') input.checked = Boolean(values[name]); else input.value = values[name] || (name.endsWith('Color') || name === 'color' ? DEFAULTS[name] : values[name] ?? '');
        }
        if (duplicate) { field('label').value = `${item.label} copy`.slice(0, 80); dirty = true; }
        $('[data-editor-title]').textContent = selected ? `Edit ${item.label}` : duplicate ? 'Duplicate trigger' : 'New trigger';
        $('[data-save-definition]').textContent = selected ? 'Save changes' : 'Save trigger';
        $('[data-test-result]').textContent = 'Paste a line and choose Test match.'; updateType(); render();
    }
    function render(next) {
        if (disposed) return; if (next) state = next;
        replace($('[data-saved-timers]'), renderSavedTimerDefinitions(state.definitions || [], selected, $('[data-trigger-search]').value));
        replace($('[data-active-timers]'), renderActiveTimerSettings(state.timers || []));
        const savedSelection = state.definitions?.find(item => item.id === selected);
        if (savedSelection && !dirty) field('enabled').checked = savedSelection.enabled !== false;
        const kill = state.lastKill, swing = state.swing || {};
        $('[data-last-kill]').textContent = kill ? `${kill.name} · ${kill.zone || 'Unknown zone'} · ${new Date(kill.at).toLocaleTimeString()}` : 'No live kill has been read yet.';
        $('[data-swing-enabled]').checked = swing.enabled === true;
        if (root.ownerDocument?.activeElement !== $('[data-swing-delay]')) $('[data-swing-delay]').value = swing.delayTenths || 0;
        $('[data-swing-summary]').textContent = `${swing.status || 'idle'}${swing.intervalMs ? ` · ${(swing.intervalMs / 1000).toFixed(2)}s estimated round` : ''} · ${swing.samples || 0} observed rounds`;
        root.querySelectorAll('input,select,textarea,button').forEach(element => { element.disabled = !available || busy; });
        $('[data-start-spawn]').disabled = !available || busy || !kill;
        root.querySelectorAll('[data-timer-action="duplicate"],[data-timer-action="remove-selected"],[data-timer-action="fire-selected"]').forEach(element => { element.disabled ||= !selected; });
        if (state.matchingStatus) status(state.matchingStatus, true);
        if (!available) status('Trigger controls are unavailable. Reopen Eye of Zomm to restore the session.', true);
    }
    async function command(action, payload, message = '') {
        if (!available || disposed || busy) return false; busy = true; render();
        try { const next = await session.commandTimer(action, payload); if (disposed) return false; render(next || await session.getTimers()); status(message); return true; }
        catch (error) { if (!disposed) status(error?.message || 'That timer action could not complete.', true); return false; }
        finally { busy = false; render(); }
    }
    function draft() { return timerDefinitionFromFields(Object.fromEntries(Object.entries(DEFAULTS).map(([name, value]) => [name, typeof value === 'boolean' ? field(name).checked : field(name).value])), selected); }
    async function preview() {
        try {
            if (!session.testTimer) throw new Error('Trigger preview is unavailable. Reopen Eye of Zomm.');
            const version = revision, owner = ++previewSequence, line = $('[data-test-line]').value;
            const next = await session.testTimer(draft(), line);
            if (disposed) return null;
            if (owner !== previewSequence || version !== revision || line !== $('[data-test-line]').value) return { stale:true };
            $('[data-test-result]').textContent = next.error || (next.matched ? `Matches: ${next.match}\nLabel: ${next.label}${Object.keys(next.groups || {}).length ? `\nCaptures: ${Object.entries(next.groups).map(([key,value]) => `${key}=${value}`).join(', ')}` : ''}` : 'No match.');
            $('[data-test-result]').dataset.error = String(Boolean(next.error)); return next;
        } catch (error) { $('[data-test-result]').textContent = error.message; $('[data-test-result]').dataset.error = 'true'; return null; }
    }
    async function submitEditor(event) {
        event.preventDefault();
        try {
            const definition = draft();
            if (definition.match === 'regex' && definition.type === 'text') { const checked = await preview(); if (!checked || checked.error || checked.stale) return; }
            const previousIds = new Set(state.definitions.map(item => item.id));
            if (await command('save-definition', definition, 'Trigger saved.')) editing(state.definitions.find(item => definition.id ? item.id === definition.id : !previousIds.has(item.id)) || null);
        } catch (error) { status(error.message, true); }
    }
    async function submitQuick(event) {
        event.preventDefault(); try { await command('start', timerDefinitionFromFields({ label:quick.elements.namedItem('label').value, durationSeconds:quick.elements.namedItem('durationSeconds').value, repeat:quick.elements.namedItem('repeat').checked, type:'manual' }), 'Countdown started.'); } catch (error) { status(error.message, true); }
    }
    function submitKill(event) { event.preventDefault(); void command('create-spawn', { durationSeconds:Number(killForm.elements.namedItem('durationSeconds').value) }, 'Reminder started from the logged kill time.'); }
    function click(event) {
        const tab = event.target.closest?.('[data-timer-tab]');
        if (tab) { root.querySelectorAll('[data-timer-pane]').forEach(element => { element.hidden = element.dataset.timerPane !== tab.dataset.timerTab; }); root.querySelectorAll('[data-timer-tab]').forEach(element => { element.setAttribute('aria-selected', String(element === tab)); }); return; }
        const button = event.target.closest?.('[data-timer-action]'); if (!button || button.disabled) return;
        const action = button.dataset.timerAction, item = state.definitions?.find(item => item.id === (button.dataset.definitionId || selected));
        if (action === 'new') { editing(); status(''); return; }
        if (action === 'edit' && item) { editing(item); return; }
        if (action === 'duplicate' && item) { editing(item, true); return; }
        if (action === 'test') { void preview(); return; }
        if (action === 'fire-selected') { if (dirty) { status('Save your changes before firing this trigger.', true); return; } void command('fire-definition', { id:selected, line:$('[data-test-line]').value }, 'Trigger fired.'); return; }
        const id = button.dataset.timerId || button.dataset.definitionId || selected;
        const actual = action === 'remove-selected' ? 'remove-definition' : action;
        void command(actual, id && !['cancel-all', 'reset-swing'].includes(action) ? { [actual === 'start' ? 'definitionId' : 'id']:id } : {}, actual === 'remove-definition' ? 'Trigger deleted.' : '').then(ok => { if (ok && actual === 'remove-definition' && selected === id) editing(); });
    }
    function input(event) { if (event.target === $('[data-trigger-search]')) render(); else if (editor.contains?.(event.target)) { dirty = true; revision++; } }
    function change(event) {
        if (event.target.dataset.toggleDefinition) {
            const item = state.definitions.find(item => item.id === event.target.dataset.toggleDefinition);
            if (item) {
                if (item.id === selected) field('enabled').checked = event.target.checked;
                void command('save-definition', { ...item, enabled:event.target.checked }, event.target.checked ? 'Trigger enabled.' : 'Trigger disabled.');
            }
            return;
        }
        if ([field('type'), field('match'), field('timerEnabled')].includes(event.target)) updateType();
        if (event.target === $('[data-swing-enabled]')) void command('set-swing-enabled', { enabled:event.target.checked });
        else if (event.target === $('[data-swing-delay]')) void command('set-swing-delay', { delayTenths:Number(event.target.value) });
        else if (editor.contains?.(event.target)) { dirty = true; revision++; }
    }
    root.addEventListener('click', click); root.addEventListener('change', change); root.addEventListener('input', input);
    editor.addEventListener('submit', submitEditor); quick.addEventListener('submit', submitQuick); killForm.addEventListener('submit', submitKill);
    if (session?.onTimers) unsubscribe = session.onTimers(next => { if (!disposed) { generation++; render(next); } });
    const initial = generation;
    if (available) Promise.resolve().then(() => session.getTimers()).then(next => { if (!disposed && initial === generation && next) render(next); }).catch(() => { available = false; render(); });
    editing(); render();
    return { render(next) { generation++; render(next); }, dispose() { if (disposed) return; disposed = true; unsubscribe?.(); root.removeEventListener('click', click); root.removeEventListener('change', change); root.removeEventListener('input', input); editor.removeEventListener('submit', submitEditor); quick.removeEventListener('submit', submitQuick); killForm.removeEventListener('submit', submitKill); } };
}
