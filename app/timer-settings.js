// All timer configuration stays in the complete app. Floating timer panels are
// display surfaces; this editor talks to the one shared session, never a parser
// or a second clock/engine.
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const duration = milliseconds => {
    const seconds = Math.ceil(Math.max(0, Number(milliseconds) || 0) / 1000);
    const minutes = Math.floor(seconds / 60), rest = String(seconds % 60).padStart(2, '0');
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
};

export function timerDefinitionFromFields(fields, id = '') {
    const label = String(fields.label || '').trim();
    const durationSeconds = Number(fields.durationSeconds);
    const type = ['manual', 'text', 'spawn'].includes(fields.type) ? fields.type : 'manual';
    const trigger = String(fields.trigger || '').trim();
    if (!label) throw new Error('Enter a timer name.');
    if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 604800) throw new Error('Choose a duration between 1 second and 7 days.');
    if (type !== 'manual' && !trigger) throw new Error(type === 'spawn' ? 'Enter the exact logged target name.' : 'Enter the log text that starts this timer.');
    return { ...(id ? { id } : {}), label, type, durationSeconds, repeat:Boolean(fields.repeat), enabled:fields.enabled !== false,
        trigger:type === 'text' ? trigger : '', npc:type === 'spawn' ? trigger : '',
        match:['contains', 'starts', 'equals'].includes(fields.match) ? fields.match : 'contains',
        overlap:['replace', 'ignore', 'add'].includes(fields.overlap) ? fields.overlap : 'replace', zone:String(fields.zone || '').trim() };
}

export function renderSavedTimerDefinitions(definitions = []) {
    if (!definitions.length) return '<p class="timer-note">No saved timers yet. Create a reusable countdown or a log trigger below.</p>';
    return definitions.map(item => `<div class="timer-settings-row"><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.type === 'spawn' ? 'Logged kill' : item.type === 'text' ? 'Log text' : 'Manual')} · ${duration(item.durationSeconds * 1000)}${item.repeat ? ' · repeating' : ''}${item.enabled === false ? ' · disabled' : ''}${item.zone ? ` · ${escapeHtml(item.zone)}` : ''}</small>${item.trigger || item.npc ? `<small>${escapeHtml(item.trigger || item.npc)}</small>` : ''}</div><div class="timer-row-actions"><button type="button" class="secondary-button" data-timer-action="start" data-definition-id="${escapeHtml(item.id)}">Start now</button><button type="button" class="secondary-button" data-timer-action="edit" data-definition-id="${escapeHtml(item.id)}">Edit</button><button type="button" class="secondary-button" data-timer-action="remove-definition" data-definition-id="${escapeHtml(item.id)}">Delete</button></div></div>`).join('');
}

export function renderActiveTimerSettings(timers = []) {
    if (!timers.length) return '<p class="timer-note">No active countdowns. The floating Timers panel shows countdowns and your observed swing estimate.</p>';
    return timers.map(item => `<div class="timer-settings-row"><div><strong>${escapeHtml(item.label)} <span class="timer-settings-time">${duration(item.remainingMs)}</span></strong><small>${escapeHtml(item.status)}${item.repeat ? ' · repeating' : ''}${item.zone ? ` · ${escapeHtml(item.zone)}` : ''}${item.visible === false ? ' · counting in another zone' : ''}${item.source === 'spawn' ? ' · personal respawn estimate' : ''}</small></div><div class="timer-row-actions">${item.status === 'ended' ? '' : `<button type="button" class="secondary-button" data-timer-action="${item.status === 'paused' ? 'resume' : 'pause'}" data-timer-id="${escapeHtml(item.id)}">${item.status === 'paused' ? 'Resume' : 'Pause'}</button>`}<button type="button" class="secondary-button" data-timer-action="reset" data-timer-id="${escapeHtml(item.id)}">${item.status === 'ended' ? 'Start again' : 'Reset'}</button><button type="button" class="secondary-button" data-timer-action="delete" data-timer-id="${escapeHtml(item.id)}">Dismiss</button></div></div>`).join('');
}

export function mountTimerSettings({ root = globalThis.document?.getElementById('timer-settings'), session } = {}) {
    if (!root) return { render() {}, dispose() {} };
    root.innerHTML = `<style>#timer-settings [hidden]{display:none!important}#timer-settings .timer-note{font-size:11px;line-height:1.5;color:#9ba8b8;margin:8px 0}#timer-settings h3{color:#e8d48f;font-size:13px;margin:20px 0 9px}#timer-settings .timer-settings-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid rgba(255,255,255,.07);padding:9px 0}#timer-settings .timer-settings-row strong{font-size:12px;color:#e8d48f}#timer-settings small{display:block;color:#9ba8b8;font-size:10px;overflow-wrap:anywhere;margin-top:4px}#timer-settings .timer-row-actions{display:flex;gap:5px;flex-wrap:wrap;flex-shrink:0}#timer-settings .timer-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}#timer-settings label{font-size:11px;color:#bac5d1;display:flex;gap:6px;align-items:center}#timer-settings label.timer-stacked{display:flex;flex-direction:column;align-items:stretch;gap:5px}#timer-settings input:not([type=checkbox]),#timer-settings select{min-width:0;width:100%;padding:7px;border:1px solid #33465c;border-radius:5px;background:#0d1a2a;color:#ecedee;font:inherit}#timer-settings input[type=checkbox]{accent-color:#d8b75c}#timer-settings .timer-wide{grid-column:1/-1}#timer-settings .timer-settings-time{font-variant-numeric:tabular-nums;white-space:nowrap;color:#f1e2b0;margin-left:8px}#timer-settings [data-timer-status]{font-size:11px;min-height:1.5em;color:#e8d48f}#timer-settings [data-timer-status][data-error=true]{color:#f39c96}@media(max-width:620px){#timer-settings .timer-form-grid{grid-template-columns:1fr}#timer-settings .timer-settings-row{align-items:flex-start;flex-direction:column}}</style>
        <h2>Timers & swing estimate</h2><p class="timer-note">Configure timers here. The floating Timers panel stays compact and shows countdowns and your observed swing. All panels share this app’s session.</p>
        <p data-timer-status role="status" aria-live="polite"></p>
        <h3>Running countdowns</h3><div data-active-timers></div><button type="button" class="secondary-button" data-timer-action="cancel-all">Dismiss all countdowns</button>
        <h3>Start a countdown</h3><form data-quick-timer><div class="timer-form-grid"><label class="timer-stacked">Name<input name="label" maxlength="80" required placeholder="Break reminder"></label><label class="timer-stacked">Duration (seconds)<input name="durationSeconds" type="number" min="1" max="604800" step="1" value="60" required></label><label><input name="repeat" type="checkbox"> Repeat</label></div><button class="secondary-button" type="submit">Start now</button></form>
        <h3>Saved timers & log triggers</h3><div data-saved-timers></div>
        <form data-timer-editor><h3 data-editor-title>New saved timer</h3><div class="timer-form-grid"><label class="timer-stacked">Name<input name="label" maxlength="80" required></label><label class="timer-stacked">Type<select name="type"><option value="manual">Manual countdown</option><option value="text">Log text trigger</option><option value="spawn">Logged kill / respawn reminder</option></select></label><label class="timer-stacked">Duration (seconds)<input name="durationSeconds" type="number" min="1" max="604800" step="1" value="60" required></label><label class="timer-stacked">Zone (optional)<input name="zone" maxlength="120" placeholder="Use the zone name shown above"></label><label class="timer-stacked timer-wide" data-trigger-field><span data-trigger-title>Log text</span><input name="trigger" maxlength="240"></label><label class="timer-stacked" data-match-field>Match<select name="match"><option value="contains">Contains</option><option value="starts">Starts with</option><option value="equals">Whole line</option></select></label><label class="timer-stacked">If already running<select name="overlap"><option value="replace">Replace</option><option value="ignore">Retain existing</option><option value="add">Add another</option></select></label><label><input name="repeat" type="checkbox"> Repeat countdown</label><label><input name="enabled" type="checkbox" checked> Enable automatic trigger</label></div><p class="timer-note" data-editor-help>Manual timers start when you choose Start now. Zone filters use the logged zone name.</p><div class="timer-row-actions"><button class="secondary-button" type="submit" data-save-definition>Save timer</button><button class="secondary-button" type="button" data-timer-action="new">New / cancel edit</button></div></form>
        <h3>Reminder from last logged kill</h3><p class="timer-note" data-last-kill>No live kill has been read yet.</p><form data-kill-timer><div class="timer-form-grid"><label class="timer-stacked">Reminder duration (seconds)<input name="durationSeconds" type="number" min="1" max="604800" step="1" value="60" required></label></div><button class="secondary-button" type="submit" data-start-spawn>Start respawn reminder</button></form><p class="timer-note">Uses the kill’s timestamp and your chosen duration. This is your estimate; the app does not know the actual respawn time.</p>
        <h3>Observed swing</h3><div class="timer-form-grid"><label><input data-swing-enabled type="checkbox" checked> Show swing estimate</label><label class="timer-stacked">Weapon delay (tenths of a second)<input data-swing-delay type="number" min="0" max="200" step="1" value="0"></label></div><p class="timer-note" data-swing-summary>Waiting for your own logged melee.</p><p class="timer-note">0 learns automatically; 36 seeds 3.6 seconds after an observed swing. Hits and misses inform one round estimate with one-second log precision. Larger slowdowns can be ambiguous; Relearn starts fresh.</p><button type="button" class="secondary-button" data-timer-action="reset-swing">Relearn swing</button>`;
    const $ = selector => root.querySelector(selector);
    const editor = $('[data-timer-editor]'), quick = $('[data-quick-timer]'), killForm = $('[data-kill-timer]');
    let state = { definitions:[], timers:[], swing:{} }, selected = '', disposed = false, busy = false, available = Boolean(session?.getTimers && session?.commandTimer);
    let generation = 0, unsubscribe;
    const field = name => editor.elements.namedItem(name);
    const status = (message, error = false) => { $('[data-timer-status]').textContent = message; $('[data-timer-status]').dataset.error = String(error); };
    function replace(element, html) {
        if (element.innerHTML === html) return;
        const focused = root.ownerDocument?.activeElement;
        const previous = focused && element.contains?.(focused) && focused.dataset.timerAction ? { ...focused.dataset } : null;
        element.innerHTML = html;
        if (previous) {
            for (const button of element.querySelectorAll('button')) {
                if (button.dataset.timerAction === previous.timerAction && button.dataset.timerId === previous.timerId && button.dataset.definitionId === previous.definitionId) {
                    button.focus({ preventScroll:true }); break;
                }
            }
        }
    }
    function updateType() {
        const type = field('type').value;
        $('[data-trigger-field]').hidden = type === 'manual';
        $('[data-match-field]').hidden = type !== 'text';
        $('[data-trigger-title]').textContent = type === 'spawn' ? 'Exact logged target name' : 'Log text';
        field('trigger').required = type !== 'manual';
        $('[data-editor-help]').textContent = type === 'text' ? 'Literal text only. Case and repeated whitespace are ignored; punctuation matters. Only new live log lines trigger timers.' : type === 'spawn' ? 'Starts when this exact target is logged slain. Choose the duration yourself; no respawn period is inferred.' : 'Manual timers start when you choose Start now. Zone filters use the logged zone name.';
    }
    function editing(item = null) {
        selected = item?.id || '';
        for (const name of ['label', 'type', 'durationSeconds', 'zone', 'trigger', 'match', 'overlap']) field(name).value = item ? (name === 'trigger' ? item.trigger || item.npc || '' : item[name] ?? '') : ({ type:'manual', durationSeconds:60, match:'contains', overlap:'replace' }[name] ?? '');
        field('repeat').checked = Boolean(item?.repeat); field('enabled').checked = item?.enabled !== false;
        $('[data-editor-title]').textContent = item ? `Edit ${item.label}` : 'New saved timer';
        $('[data-save-definition]').textContent = item ? 'Save changes' : 'Save timer';
        updateType();
    }
    function render(next) {
        if (disposed) return;
        if (next) state = next;
        replace($('[data-active-timers]'), renderActiveTimerSettings(state.timers || []));
        replace($('[data-saved-timers]'), renderSavedTimerDefinitions(state.definitions || []));
        const kill = state.lastKill;
        $('[data-last-kill]').textContent = kill ? `${kill.name} · ${kill.zone || 'Unknown zone'} · ${new Date(kill.at).toLocaleTimeString()}` : 'No live kill has been read yet.';
        const swing = state.swing || {};
        $('[data-swing-enabled]').checked = swing.enabled !== false;
        if (root.ownerDocument?.activeElement !== $('[data-swing-delay]')) $('[data-swing-delay]').value = swing.delayTenths || 0;
        $('[data-swing-summary]').textContent = `${swing.status || 'idle'}${swing.intervalMs ? ` · ${(swing.intervalMs / 1000).toFixed(2)}s estimated round` : ''} · ${swing.samples || 0} observed rounds`;
        root.querySelectorAll('input,select,button').forEach(element => { element.disabled = !available || busy; });
        $('[data-start-spawn]').disabled = !available || busy || !kill;
        if (!available) status('Timer controls are unavailable. Reopen Eye of Zomm to restore the session.', true);
    }
    async function command(action, payload, message = '') {
        if (!available || disposed || busy) return false;
        busy = true; render();
        try {
            const next = await session.commandTimer(action, payload);
            if (disposed) return false;
            render(next || await session.getTimers()); status(message);
            return true;
        } catch (error) { if (!disposed) status(error?.message || 'That timer action could not complete.', true); return false; }
        finally { busy = false; render(); }
    }
    async function submitEditor(event) {
        event.preventDefault();
        try {
            const values = Object.fromEntries(['label', 'type', 'durationSeconds', 'zone', 'trigger', 'match', 'overlap'].map(name => [name, field(name).value]));
            values.repeat = field('repeat').checked; values.enabled = field('enabled').checked;
            const definition = timerDefinitionFromFields(values, selected);
            if (await command('save-definition', definition, selected ? 'Timer changes saved.' : 'Timer saved. Choose Start now or wait for its log trigger.')) editing();
        } catch (error) { status(error.message, true); }
    }
    async function submitQuick(event) {
        event.preventDefault();
        try {
            const item = timerDefinitionFromFields({ label:quick.elements.namedItem('label').value, durationSeconds:quick.elements.namedItem('durationSeconds').value,
                repeat:quick.elements.namedItem('repeat').checked, type:'manual' });
            await command('start', item, 'Countdown started.');
        } catch (error) { status(error.message, true); }
    }
    function click(event) {
        const button = event.target.closest?.('[data-timer-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.timerAction;
        if (action === 'new') { editing(); status(''); return; }
        if (action === 'edit') {
            const item = state.definitions?.find(item => item.id === button.dataset.definitionId);
            if (item) { editing(item); field('label').focus?.(); }
            return;
        }
        const id = button.dataset.timerId || button.dataset.definitionId;
        void command(action, id ? { [action === 'start' ? 'definitionId' : 'id']:id } : {}, action === 'remove-definition' ? 'Saved timer deleted.' : '').then(ok => {
            if (ok && action === 'remove-definition' && selected === id) editing();
        });
    }
    function change(event) {
        if (event.target === field('type')) updateType();
        if (event.target === $('[data-swing-enabled]')) void command('set-swing-enabled', { enabled:event.target.checked });
        if (event.target === $('[data-swing-delay]')) void command('set-swing-delay', { delayTenths:Number(event.target.value) });
    }
    function submitKill(event) { event.preventDefault(); void command('create-spawn', { durationSeconds:Number(killForm.elements.namedItem('durationSeconds').value) }, 'Reminder started from the logged kill time.'); }
    root.addEventListener('click', click); root.addEventListener('change', change);
    editor.addEventListener('submit', submitEditor); quick.addEventListener('submit', submitQuick); killForm.addEventListener('submit', submitKill);
    if (session?.onTimers) unsubscribe = session.onTimers(next => { if (!disposed) { generation++; render(next); } });
    const initial = generation;
    if (available) Promise.resolve().then(() => session.getTimers()).then(next => { if (!disposed && generation === initial && next) render(next); }).catch(() => { if (!disposed) { available = false; render(); } });
    editing(); render();
    return { render(next) { generation++; render(next); }, dispose() {
        if (disposed) return; disposed = true; unsubscribe?.(); root.removeEventListener('click', click); root.removeEventListener('change', change);
        editor.removeEventListener('submit', submitEditor); quick.removeEventListener('submit', submitQuick); killForm.removeEventListener('submit', submitKill);
    } };
}
