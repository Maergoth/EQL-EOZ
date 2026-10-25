// Shared by the main trigger editor and its native Timers surface. This is a
// presentation queue only; catalog checks and clipboard capture stay in owner IPC.
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const requestNumber = value => typeof value === 'string' && /^capture-[1-9]\d{0,14}$/.test(value) ? Number(value.slice(8)) : 0;
export function createDiscoveryNoticeQueue({now = Date.now, durationMs = 15000, maxVisible = 4} = {}) {
    const entries = new Map(), dismissed = new Set();
    const held = entry => entry.captureState === 'captured' ? entry.holds.has('hidden') : entry.holds.size > 0;
    function activate() {
        let slots = maxVisible;
        for (const entry of entries.values()) {
            entry.visible = slots-- > 0;
            if (entry.visible && entry.startedAt === null) entry.startedAt = now();
        }
    }
    function settle(entry) {
        if (entry.startedAt !== null && !held(entry)) entry.remainingMs = Math.max(0, entry.remainingMs - Math.max(0, now() - entry.startedAt));
        if (entry.startedAt !== null) entry.startedAt = now();
    }
    function hold(id, reason, enabled) {
        const entry = entries.get(String(id)); if (!entry) return;
        settle(entry);
        if (enabled) entry.holds.add(reason); else entry.holds.delete(reason);
    }
    function captureStatus(id, state, message = '', request) {
        const entry = entries.get(String(id));
        if (!entry || !['item-link','spawn-location'].includes(entry.prompt.purpose) || !['waiting','retry','captured'].includes(state)) return;
        request ??= entry.captureRequest;
        if (requestNumber(request) < requestNumber(entry.captureRequest)) return;
        if (entry.captureState === 'captured' && requestNumber(request) <= requestNumber(entry.captureRequest)) return;
        const changed = entry.captureState !== state || requestNumber(request) > requestNumber(entry.captureRequest);
        settle(entry); entry.captureState = state;
        if (requestNumber(request)) entry.captureRequest = request;
        entry.message = String(message || (state === 'captured' ? entry.prompt.purpose === 'spawn-location' ? 'Spawn location captured.' : 'Item captured in Contribute.' : state === 'retry' ? 'Capture paused. Try again, or dismiss this notice.' : entry.prompt.purpose === 'spawn-location' ? 'Waiting for your next /loc.' : 'Open the item’s examine window. This notice stays until its item is read.'));
        entry.error = state === 'retry';
        if (state === 'captured') {
            entry.holds.delete('contribution');
            if (changed) {entry.remainingMs = 900; entry.startedAt = entry.visible ? now() : null;}
        } else entry.holds.add('contribution');
    }
    return {
        reconcile(pending = []) {
            const ids = new Set(pending.map(entry => String(entry.id)));
            for (const id of entries.keys()) if (!ids.has(id)) entries.delete(id);
            for (const id of dismissed) if (!ids.has(id)) dismissed.delete(id);
            for (const prompt of pending) {
                const id = String(prompt.id || ''); if (!id || dismissed.has(id)) continue;
                const existing = entries.get(id);
                if (existing) existing.prompt = {...prompt};
                else entries.set(id,{id,prompt:{...prompt},visible:false,startedAt:null,remainingMs:durationMs,holds:new Set(),busy:false,choices:[],message:'',error:false,captured:false,captureState:'',captureRequest:0});
                captureStatus(id,prompt.captureState,prompt.captureMessage,prompt.captureRequest);
            }
            activate();
        },
        hold, captureStatus,
        reset(id) { const entry = entries.get(String(id)); if (entry) {entry.remainingMs = durationMs; entry.startedAt = entry.visible ? now() : null;} },
        get:id => entries.get(String(id)),
        visible:() => [...entries.values()].filter(entry => entry.visible),
        queued:() => [...entries.values()].filter(entry => !entry.visible).length,
        remove(id) { id = String(id); dismissed.add(id); entries.delete(id); activate(); },
        tick() { const expired = []; for (const entry of entries.values()) { if (!entry.visible) continue; settle(entry); if (!entry.remainingMs && !held(entry)) expired.push(entry.id); } for (const id of expired) this.remove(id); return expired; }
    };
}
export function discoveryNoticeMarkup(entry) {
    const itemLink = entry.prompt.purpose === 'item-link', complete = entry.captureState === 'captured';
    const choices = entry.choices.length ? `<div class="wiki-discovery-choices" aria-label="Screenshot source">${entry.choices.map(choice => `<button type="button" data-discovery-command="capture" data-source-id="${escape(choice.id)}">${escape(choice.name)}</button>`).join('')}<button type="button" data-discovery-command="cancel-choices">Cancel</button></div>` : '';
    return `<article class="wiki-discovery-card${entry.captured || complete ? ' is-copied' : ''}${complete ? ' is-complete' : ''}" data-discovery-id="${escape(entry.id)}" aria-label="Wiki suggestion" aria-busy="${entry.busy}"><div class="wiki-discovery-title">${complete ? 'Item captured' : entry.captured ? 'Screenshot copied' : entry.prompt.kind === 'item' ? "This item isn't on the wiki!" : "This monster isn't on the wiki!"}<button type="button" class="wiki-discovery-close" data-discovery-command="dismiss" aria-label="Dismiss wiki suggestion" ${entry.busy ? 'disabled' : ''}>×</button></div><div class="wiki-discovery-name">${escape(entry.prompt.name)}</div>${entry.prompt.hint?`<div class="wiki-discovery-message">${escape(entry.prompt.hint)}</div>`:''}${entry.message ? `<div class="wiki-discovery-message${entry.error ? ' is-error' : ''}" role="status">${escape(entry.message)}</div>` : ''}${choices}${complete ? '' : `<div class="wiki-discovery-actions"><button type="button" data-discovery-command="${itemLink ? 'contribute' : 'capture'}" ${entry.busy ? 'disabled' : ''}>${entry.busy ? itemLink ? 'Opening…' : 'Capturing…' : itemLink ? entry.captureState ? 'Retry capture' : 'Contribute' : entry.captured ? 'Screenshot again' : 'Screenshot'}</button><button type="button" data-discovery-command="ignore" ${entry.busy ? 'disabled' : ''}>Ignore</button></div>`}</article>`;
}
const STYLES = `.wiki-discovery-notices{display:flow-root;font-family:inherit;font-size:calc(12px * var(--text-scale,1));line-height:1.3;-webkit-app-region:no-drag}.wiki-discovery-card{position:relative;padding:6px 7px;margin:5px 0;border:1px solid #d8b75c50;border-left:2px solid #d8b75c;background:#111722;color:#e9edf3;border-radius:4px;transition:opacity .15s}.wiki-discovery-title{font-size:calc(10px * var(--text-scale,1));text-transform:uppercase;letter-spacing:.04em;color:#d8b75c;padding-right:18px}.wiki-discovery-name{font-weight:600;overflow-wrap:anywhere;margin:2px 0 5px}.wiki-discovery-card button{font:inherit;font-size:calc(11px * var(--text-scale,1));cursor:pointer;background:#17202b;color:#e7d18a;border:1px solid #d8b75c40;border-radius:3px;padding:3px 6px;-webkit-app-region:no-drag}.wiki-discovery-card button:disabled{opacity:.5;cursor:default}.wiki-discovery-card button:focus-visible{outline:2px solid #f0d77f;outline-offset:1px}.wiki-discovery-close{position:absolute;right:5px;top:3px;font-size:calc(16px * var(--text-scale,1))!important;border:0!important;padding:0 3px!important;background:transparent!important}.wiki-discovery-actions{display:flex;gap:5px}.wiki-discovery-message{font-size:calc(11px * var(--text-scale,1));color:#b8d8bc;margin:3px 0 5px}.wiki-discovery-message.is-error{color:#f0a6a6}.wiki-discovery-choices{display:flex;flex-direction:column;align-items:stretch;gap:3px;max-height:120px;overflow:auto;margin:4px 0 6px}.wiki-discovery-choices button{text-align:left;overflow-wrap:anywhere}.wiki-discovery-queued{font-size:calc(10px * var(--text-scale,1));color:#9ba8b8;padding:0 4px}.wiki-discovery-card.is-copied{border-color:#80b89280}.wiki-discovery-card.is-complete{background:#143b26;border-color:#69d78d}.wiki-discovery-card.is-complete .wiki-discovery-title{color:#9ff1b5}@media(prefers-reduced-motion:reduce){.wiki-discovery-card{transition:none}}`;
export function playDiscoveryShutter() {
    // Local synthesis only: no audio file, network request, or game focus change.
    try {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return;
        const context = new Audio(), gain = context.createGain(), oscillator = context.createOscillator();
        oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(1300,context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(170,context.currentTime + .075);
        gain.gain.setValueAtTime(.035,context.currentTime); gain.gain.exponentialRampToValueAtTime(.001,context.currentTime + .09);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .1); oscillator.onended = () => {void context.close();}; void context.resume().catch(() => {});
    } catch { /* Clipboard success never depends on the audio device. */ }
}
export function mountWikiDiscoveryNotices({root, action, now = Date.now, setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval, playShutter = playDiscoveryShutter, onSizeChange = () => {}} = {}) {
    if (!root) return {render() {},dispose() {}};
    const queue = createDiscoveryNoticeQueue({now}), document = root.ownerDocument;
    if (!document.getElementById('wiki-discovery-notice-style')) {const style = document.createElement('style'); style.id = 'wiki-discovery-notice-style'; style.textContent = STYLES; document.head.append(style);}
    root.classList.add('wiki-discovery-notices');
    let disposed = false, markup = '';
    function syncVisibility() {
        const hidden = document.visibilityState === 'hidden' || typeof root.getClientRects === 'function' && root.getClientRects().length === 0;
        for (const entry of queue.visible()) queue.hold(entry.id,'hidden',hidden);
    }
    function paint() {
        if (disposed) return;
        const html = queue.visible().map(discoveryNoticeMarkup).join('') + (queue.queued() ? `<div class="wiki-discovery-queued">${queue.queued()} more queued</div>` : '');
        if (html !== markup) {
            markup = html; root.innerHTML = html;
            // Replacing an action's own controls must not leave a lost focus
            // hold behind. Never focus this window or any unrelated control.
            const active = cardFor(document.activeElement);
            for (const entry of queue.visible()) queue.hold(entry.id,'focus',active?.dataset.discoveryId === entry.id);
            onSizeChange();
        }
        for (const card of root.querySelectorAll('[data-discovery-id]')) {
            const entry = queue.get(card.dataset.discoveryId);
            if (entry) card.style.opacity = String(entry.holds.size ? 1 : Math.min(1,entry.remainingMs / 900));
        }
    }
    async function command(name, id, sourceId) {
        const entry = queue.get(id); if (!entry || entry.busy) return;
        if (name === 'cancel-choices') {entry.choices = []; queue.hold(id,'choices',false); paint(); return;}
        entry.busy = true; queue.hold(id,'busy',true); paint();
        try {
            const result = await action(name,{id,...(sourceId ? {sourceId} : {})});
            if (disposed || queue.get(id) !== entry) return;
            if (result?.error) throw new Error(result.error);
            if (name === 'capture' && Array.isArray(result?.choices)) {
                entry.choices = result.choices.filter(choice => choice && typeof choice.id === 'string').map(choice => ({id:choice.id,name:String(choice.name || 'Window or display')}));
                entry.message = entry.choices.length ? 'Choose a window or display.' : 'No screenshot source is available. Try Screenshot again.'; entry.error = !entry.choices.length;
                queue.hold(id,'choices',entry.choices.length > 0);
            } else if (name === 'capture' && result?.captured) {
                entry.choices = []; queue.hold(id,'choices',false); entry.captured = true; entry.error = false;
                entry.message = 'Paste your clipboard into discord!'; queue.reset(id); playShutter();
            } else if (name === 'capture') throw new Error('Screenshot was not copied. Try again.');
            else if (name === 'contribute' && result?.pendingCapture === true) {
                queue.captureStatus(id,'waiting',result.captureMessage,result.captureRequest);
            } else if (name === 'contribute') throw new Error('Capture could not start. Try again, or dismiss this notice.');
            else queue.remove(id);
        } catch (error) {
            if (queue.get(id) !== entry) return;
            entry.choices = []; queue.hold(id,'choices',false); entry.error = true; entry.message = String(error?.message || 'Action unavailable. Try again.');
            if (name === 'contribute') queue.captureStatus(id,'retry',entry.message); else queue.reset(id);
        } finally {entry.busy = false; queue.hold(id,'busy',false); paint();}
    }
    const cardFor = target => target?.closest?.('[data-discovery-id]');
    const click = event => {const button = event.target.closest?.('[data-discovery-command]'), card = cardFor(button); if (button && card && !button.disabled) void command(button.dataset.discoveryCommand,card.dataset.discoveryId,button.dataset.sourceId);};
    const hover = event => {const card = cardFor(event.target); if (card && !card.contains(event.relatedTarget)) queue.hold(card.dataset.discoveryId,'hover',event.type === 'mouseover');};
    const focus = event => {const card = cardFor(event.target); if (card && !card.contains(event.relatedTarget)) queue.hold(card.dataset.discoveryId,'focus',event.type === 'focusin');};
    root.addEventListener('click',click); root.addEventListener('mouseover',hover); root.addEventListener('mouseout',hover); root.addEventListener('focusin',focus); root.addEventListener('focusout',focus);
    const tick = setInterval(() => {syncVisibility(); for (const id of queue.tick()) void Promise.resolve(action('dismiss',{id})).catch(() => {}); syncVisibility(); paint();},100);
    return {render(pending) {queue.reconcile(Array.isArray(pending) ? pending : []); syncVisibility(); paint();},dispose() {disposed = true; clearInterval(tick); for (const [name,listener] of [['click',click],['mouseover',hover],['mouseout',hover],['focusin',focus],['focusout',focus]]) root.removeEventListener(name,listener); root.innerHTML = '';}};
}
