// The controller is in the complete app, independent of panels that may be
// locked or ignoring the mouse. It never owns a second log/session parser.
const PANELS = { parse:'Parse', map:'Map & intel', intel:'Zone & loot', timers:'Triggers' };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
export function overlayControllerPresentation(state = {}) {
    const supported = state.supported !== false && Boolean(state.panels);
    return { supported,
        panels:Object.entries(PANELS).map(([id,label]) => ({ id, label, visible:Boolean(state.panels?.[id]?.visible), locked:Boolean(state.panels?.[id]?.locked), passThrough:Boolean(state.panels?.[id]?.passThrough) })),
        recovery:state.recoveryShortcutRegistered ? `Restore mouse input: ${String(state.recoveryShortcut || 'Ctrl+Shift+O').replace('CommandOrControl', 'Ctrl')}. The tray also restores input.` : 'Restore mouse input from these controls or the tray. The global shortcut is unavailable.',
        session:state.sessionAvailable === false ? 'The shared session is paused. Keep the main app open to update overlay data.' : 'Panels share this app’s current log, encounters, loot and triggers.',
        restart:Number(state.sessionRestartCount) > 0 ? 'Session restarted; parse history rebuilt from the log tail. Saved timer deadlines restored.' : '' };
}
export function overlayGlobalPresentation(state = {}) {
    const supported=state.supported!==false&&Boolean(state.panels)&&['locked','unlocked','hidden'].includes(state.globalMode);
    if(!supported)return{supported:false,label:'Overlays',title:'Native overlay controls are available in the desktop app.',mode:null};
    const mode=state.globalMode,label={locked:'Locked',unlocked:'Unlocked',hidden:'Hidden'}[mode],next={locked:'show and unlock all overlays',unlocked:'hide all overlays',hidden:'show and lock all overlays'}[mode];
    return{supported:true,mode,label:`Overlays: ${label}`,title:`All overlays: ${label}. Click to ${next}. Unlocking also restores mouse input for layout editing.`};
}
export function mountOverlayController({ document = globalThis.document, root = document?.getElementById('overlay-controller'), button = document?.getElementById('open-native-overlays'), api = globalThis.eyeOfZommOverlays, setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval } = {}) {
    if (!root) return { render() {}, dispose() {} };
    root.innerHTML = `<style>#overlay-controller .overlay-controller-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:space-between;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)}#overlay-controller .overlay-controller-row strong{min-width:80px;color:#e8d48f;font-size:calc(12px * var(--ui-font-scale,1))}#overlay-controller .overlay-controller-row label{margin:0;font-size:calc(10px * var(--ui-font-scale,1));display:flex;align-items:center;gap:5px}#overlay-controller .overlay-controller-actions{display:flex;gap:6px;flex-wrap:wrap;margin:11px 0}#overlay-controller .overlay-controller-note{font-size:calc(10px * var(--ui-font-scale,1));color:#9ba8b8;line-height:1.5;margin:8px 0}#overlay-controller .overlay-controller-row input{accent-color:#d8b75c}@media(max-width:500px){#overlay-controller .overlay-controller-row{flex-wrap:wrap}}</style><h2>Native overlays</h2><div class="overlay-controller-note" data-overlay-support></div><div data-overlay-panels>${Object.entries(PANELS).map(([id,label]) => `<div class="overlay-controller-row" data-panel="${id}"><strong>${escapeHtml(label)}</strong><label><input type="checkbox" data-overlay-setting="visible" data-panel="${id}"> Show</label><label><input type="checkbox" data-overlay-setting="locked" data-panel="${id}"> Lock layout</label><label><input type="checkbox" data-overlay-setting="passThrough" data-panel="${id}"> Ignore mouse</label></div>`).join('')}</div><div class="overlay-controller-actions"><button class="secondary-button" type="button" data-overlay-action="show-all">Show all</button><button class="secondary-button" type="button" data-overlay-action="hide-all">Hide all</button><button class="secondary-button" type="button" data-overlay-action="lock-all">Lock all layouts</button><button class="secondary-button" type="button" data-overlay-action="unlock-all">Edit layouts</button><button class="secondary-button" type="button" data-overlay-action="restore-mouse">Restore mouse input</button><button class="secondary-button" type="button" data-overlay-action="reset-layout">Reset positions</button></div><p class="overlay-controller-note" data-overlay-session></p><p class="overlay-controller-note" data-overlay-restart hidden></p><p class="overlay-controller-note" data-overlay-recovery></p><p class="overlay-controller-note" role="status" aria-live="polite" data-overlay-status></p>`;
    let disposed = false, state = { supported:false }, generation = 0, refreshing = false, cycling = false, unsubscribe;
    const $ = selector => root.querySelector(selector);
    function renderGlobal() {
        if(!button)return;
        const view=overlayGlobalPresentation(state);button.textContent=view.label;button.title=view.title;button.setAttribute('aria-label',view.title);button.setAttribute('aria-busy',String(cycling));button.disabled=!view.supported||cycling;button.dataset.overlayMode=view.mode||'unavailable';
    }
    function render(next) {
        if (next) state = next;
        const view = overlayControllerPresentation(state);
        $('[data-overlay-support]').textContent = view.supported ? 'Independent desktop panels. Drag their headers and resize their edges while unlocked. Locking preserves menus and tabs; Ignore mouse passes all clicks through.' : 'Native overlays are available in the desktop app.';
        $('[data-overlay-session]').textContent = view.session;
        $('[data-overlay-restart]').textContent = view.restart;
        $('[data-overlay-restart]').hidden = !view.restart;
        $('[data-overlay-recovery]').textContent = view.recovery;
        root.querySelectorAll('button,input').forEach(element => { element.disabled = !view.supported; });
        for (const panel of view.panels) for (const key of ['visible', 'locked', 'passThrough']) $(`[data-overlay-setting="${key}"][data-panel="${panel.id}"]`).checked = panel[key];
        renderGlobal();
    }
    async function refresh() {
        if (disposed || refreshing || !api?.getState) return;
        const owner = generation; refreshing = true;
        try { const next = await api.getState(); if (!disposed && owner === generation) render(next); }
        catch { if (!disposed) $('[data-overlay-status]').textContent = 'Overlay controls are unavailable. Restart Eye of Zomm to reconnect.'; }
        finally { refreshing = false; }
    }
    async function control(action, panel, value) {
        if (disposed || !api?.control) return;
        const owner = ++generation;
        try {
            const next = await api.control(action, panel, value);
            if (!disposed && owner === generation) { if (next?.panels) render(next); else await refresh(); $('[data-overlay-status]').textContent = next?.error || ''; }
        } catch { if (!disposed && owner === generation) $('[data-overlay-status]').textContent = 'That overlay action could not complete. Please retry.'; }
    }
    function click(event) {
        const button = event.target.closest?.('[data-overlay-action]'); if (!button || button.disabled) return;
        const action = button.dataset.overlayAction;
        if (action === 'lock-all') { void (async () => { for (const id of Object.keys(PANELS)) await control('lock', id, true); })(); }
        else void control(action);
    }
    function change(event) {
        const input = event.target.closest?.('[data-overlay-setting]'); if (!input || input.disabled) return;
        const action = { visible:input.checked ? 'show' : 'hide', locked:'lock', passThrough:'pass-through' }[input.dataset.overlaySetting];
        if (action) void control(action, input.dataset.panel, input.checked);
    }
    async function cycle() {
        if(disposed||cycling||button?.disabled)return;
        cycling=true;renderGlobal();
        try { await control('cycle-all'); }
        finally { cycling=false;if(!disposed)renderGlobal(); }
    }
    root.addEventListener('click', click); root.addEventListener('change', change);
    button?.addEventListener('click',cycle);
    if (api?.onState) unsubscribe = api.onState(next => { if (!disposed) { generation++; render(next); } });
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 1500);
    render(); void refresh();
    return { render(next) { generation++; render(next); }, refresh, dispose() { disposed = true; clearInterval(interval); unsubscribe?.(); button?.removeEventListener('click',cycle); root.removeEventListener('click', click); root.removeEventListener('change', change); } };
}
