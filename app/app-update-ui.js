const ACTIVE = new Set(['checking', 'downloading', 'installing']);
const OFFER = new Set(['available', 'downloading', 'ready', 'installing']);

export function appUpdatePresentation(state = {}) {
    const status = state.status || 'idle';
    const version = state.availableVersion ? `v${state.availableVersion}` : '';
    const supported = state.supported === true;
    const manualInstall = state.installMode === 'manual-linux';
    const labels = {
        idle:'Checking for application updates shortly.',
        checking:'Checking for application updates…',
        current:'Eye of Zomm is up to date.',
        available:`Eye of Zomm ${version} is available.`,
        downloading:`Downloading Eye of Zomm ${version}…`,
        ready:manualInstall ? `Eye of Zomm ${version} is downloaded. Install this package manually.` : `Eye of Zomm ${version} is ready to install.`,
        installing:manualInstall ? 'Opening the verified download folder…' : 'Restarting to install the update…',
        unavailable:'Application updates are unavailable. Try again later.',
        unsupported:'Application updates are available in the Windows and Linux x64 desktop apps.'
    };
    const finiteBytes = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
    const total = finiteBytes(state.totalBytes);
    const downloaded = finiteBytes(state.downloadedBytes);
    const percent = total ? Math.min(100, Math.floor(downloaded / total * 100)) : null;
    return {
        status, supported,
        message:!supported ? labels.unsupported : (labels[status] || labels.unavailable),
        detail:supported ? String(state.error || (manualInstall && status === 'ready' ? state.installationHint || '' : '')) : '',
        installLabel:manualInstall ? 'Open download folder' : 'Restart to install update',
        installingLabel:manualInstall ? 'Opening download…' : 'Restarting to install…',
        version,
        showDownload:supported && status === 'available',
        showInstall:supported && status === 'ready',
        showCancel:supported && status === 'downloading',
        showProgress:status === 'downloading',
        showLater:supported && ['available', 'ready'].includes(status),
        showBadge:supported && OFFER.has(status),
        badge:status === 'ready' ? 'Update Ready' : status === 'downloading' ? 'Downloading Update' : 'Update Available',
        checkDisabled:!supported || ACTIVE.has(status),
        percent,
        progress:percent === null ? 'Downloading…' : `${percent}% · ${(downloaded / 1048576).toFixed(1)} of ${(total / 1048576).toFixed(1)} MB`
    };
}

// Verification and the silent installer remain in the native updater. A new
// requested Windows download starts a cancellable five-second restart countdown.
export function mountAppUpdates({ document = globalThis.document, bridge = globalThis.eyeOfZommUpdates,
    openSettings = () => {}, setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout,
    now = Date.now } = {}) {
    const ids = ['app-update-status', 'app-update-detail', 'app-update-progress', 'app-update-progress-label',
        'check-app-update', 'download-app-update', 'install-app-update', 'cancel-app-update',
        'later-app-update', 'app-update-startup-download', 'app-update-notes', 'app-update-badge'];
    const elements = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
    if (Object.values(elements).some(element => !element)) return { dispose() {} };
    let current = bridge?.getStatus ? { supported:true, status:'idle' } : { supported:false, status:'unsupported' };
    let disposed = false;
    let timer = null;
    let action = '';
    let generation = 0;
    let refreshSequence = 0;
    let deferredVersion = null;
    let restartTimer = null, restartDeadline = 0, requestedDownload = false;
    const listeners = [];
    const listen = (element, name, callback) => {
        element.addEventListener(name, callback);
        listeners.push(() => element.removeEventListener(name, callback));
    };
    const text = (id, value) => {
        if (elements[id].textContent !== value) elements[id].textContent = value;
    };
    function render() {
        const view = appUpdatePresentation(current);
        const countdown=restartDeadline?`Restarting in ${Math.max(1,Math.ceil((restartDeadline-now())/1000))}`:'';
        text('app-update-status', countdown?`${countdown} to install Eye of Zomm ${view.version}.`:view.message + (deferredVersion === current.availableVersion && view.showLater ? ' You can return using Update Available in the header.' : ''));
        text('app-update-detail', view.detail);
        elements['app-update-detail'].hidden = !view.detail;
        for (const [id, shown] of [
            ['download-app-update', view.showDownload], ['install-app-update', view.showInstall],
            ['cancel-app-update', view.showCancel], ['later-app-update', view.showLater],
            ['app-update-progress', view.showProgress], ['app-update-progress-label', view.showProgress]
        ]) elements[id].hidden = !shown;
        if (!restartDeadline && deferredVersion === current.availableVersion) elements['later-app-update'].hidden = true;
        elements['check-app-update'].disabled = view.checkDisabled || Boolean(action);
        elements['download-app-update'].disabled = Boolean(action);
        elements['install-app-update'].disabled = Boolean(action);
        elements['cancel-app-update'].disabled = action === 'cancel';
        elements['app-update-startup-download'].disabled = !view.supported || Boolean(action);
        elements['app-update-startup-download'].checked = Boolean(current.automaticDownload);
        text('download-app-update', `Download ${view.version}`);
        text('install-app-update', countdown|| (action === 'install' ? view.installingLabel : view.installLabel));
        elements['install-app-update'].disabled=Boolean(action)||Boolean(countdown);
        text('later-app-update',countdown?'Cancel restart':'Later');
        text('app-update-progress-label', view.progress);
        if (view.percent === null) elements['app-update-progress'].removeAttribute('value');
        else elements['app-update-progress'].value = view.percent;
        // Native metadata is verified, but keep the renderer's link narrowly scoped too.
        const notes = /^https:\/\/github\.com\/Maergoth\/EQL-EOZ\/releases\/tag\/v[0-9][0-9A-Za-z.+-]*$/.test(current.releaseUrl || '');
        elements['app-update-notes'].hidden = !notes;
        if (notes) elements['app-update-notes'].href = current.releaseUrl;
        else elements['app-update-notes'].removeAttribute('href');
        elements['app-update-badge'].hidden = !view.showBadge;
        text('app-update-badge', countdown||view.badge);
        elements['app-update-badge'].title = `${view.message} Open Application updates in Settings.`;
    }
    function cancelRestart(){clearTimeout(restartTimer);restartTimer=null;restartDeadline=0;requestedDownload=false;}
    function maybeRestart(previous) {
        if (disposed || current.status!=='ready' || current.error || current.installMode==='manual-linux') {
            const keepRequested=current.status==='downloading'&&requestedDownload;
            cancelRestart();requestedDownload=keepRequested;
            return;
        }
        if (restartDeadline || !(requestedDownload || previous?.status==='downloading' && current.automaticDownload)) return;
        requestedDownload=false;restartDeadline=now()+5000;
        const tick=()=>{
            if(disposed||current.status!=='ready'||current.error){cancelRestart();render();return;}
            if(now()>=restartDeadline){
                if(action){restartTimer=setTimeout(tick,200);return;}
                cancelRestart();void invoke('install');return;
            }
            render();restartTimer=setTimeout(tick,Math.min(1000,restartDeadline-now()));
        };
        tick();
    }
    function schedule() {
        clearTimeout(timer);
        if (disposed || !bridge?.getStatus) return;
        const delay = document.hidden ? 15000 : ACTIVE.has(current.status) ? 750 : current.status === 'idle' ? 2000 : 15000;
        timer = setTimeout(refresh, delay);
    }
    async function refresh() {
        const request = ++refreshSequence;
        const owner = generation;
        try {
            const next = await bridge.getStatus();
            if (!disposed && owner === generation && request === refreshSequence) { const previous=current;current=next;maybeRestart(previous);render(); }
        } catch {
            // A temporary IPC failure must not discard a ready download or interrupt play.
        } finally { schedule(); }
    }
    async function invoke(name, value) {
        if (disposed || !bridge?.[name] || (action && name !== 'cancel')) return;
        const owner = ++generation;
        action = name;
        if (name==='download') {requestedDownload=true;deferredVersion=null;}
        if (['cancel','check','install'].includes(name)) cancelRestart();
        if (name === 'check') {
            deferredVersion = null;
            current = { ...current, status:'checking', error:'' };
        } else if (name === 'download') current = { ...current, status:'downloading', downloadedBytes:0, error:'' };
        render();
        schedule();
        try {
            const next = await bridge[name](value);
            if (!disposed && owner === generation) {const previous=current;current=next;if(name==='download')maybeRestart(previous);}
        } catch {
            if (!disposed && owner === generation) {cancelRestart();current = { ...current, status:'unavailable', error:'Please retry from Application updates.' };}
        } finally {
            if (!disposed && owner === generation) { action = ''; render(); schedule(); }
        }
    }
    for (const [id, method] of [['check-app-update', 'check'], ['download-app-update', 'download'],
        ['install-app-update', 'install'], ['cancel-app-update', 'cancel']]) {
        listen(elements[id], 'click', () => { void invoke(method); });
    }
    listen(elements['app-update-startup-download'], 'change', event => { void invoke('setStartupDownload', event.currentTarget.checked); });
    listen(elements['later-app-update'], 'click', () => {
        cancelRestart();
        deferredVersion = current.availableVersion;
        render();
    });
    listen(elements['app-update-badge'], 'click', () => { void openSettings(); });
    listen(document, 'visibilitychange', () => { if (!document.hidden && bridge?.getStatus) void refresh(); });
    function dispose() {
        disposed = true;
        ++generation;
        clearTimeout(timer);
        cancelRestart();
        listeners.forEach(remove => remove());
    }
    render();
    if (bridge?.getStatus) void refresh();
    return { dispose, refresh };
}
