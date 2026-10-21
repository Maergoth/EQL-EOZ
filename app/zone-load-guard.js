function identity(record) {
    return record ? `${record.format}:${record.id}` : '';
}

/**
 * The upstream loader owns one parser and mutates one scene. Serialize every
 * entry point, including its toolbar, so a second load cannot terminate a
 * parser whose caller is still waiting. Only the latest requested zone may
 * become ready; queued callers are always settled when superseded.
 */
export function installZoneLoadGuard(app, { onRequest = () => {}, onReady = () => {} } = {}) {
    const load = app.loadSelectedZone.bind(app);
    let sequence = 0;
    let active = null;
    let pending = null;
    let draining = false;
    let readyIdentity = identity(app.currentZoneRecord);

    function discardScene({ preserveError = false } = {}) {
        const status = app.els?.statusText?.textContent;
        const overlay = app.els?.overlay;
        const errorHtml = overlay?.innerHTML;
        const errorHidden = overlay?.hidden;
        app.resetLoadedZone?.();
        app.currentZoneRecord = null;
        app.currentZoneKey = '';
        if (preserveError) {
            if (status) app.setStatus?.(status, 0);
            if (overlay && errorHtml) {
                overlay.innerHTML = errorHtml;
                overlay.hidden = errorHidden;
            }
        }
    }

    async function drain() {
        if (draining) return;
        draining = true;
        try {
            while (pending) {
                const request = pending;
                pending = null;
                active = request;
                let failed = false;
                try {
                    if (request.source !== app.source) {
                        request.resolve({ ok:false, reason:'superseded' });
                        continue;
                    }
                    // The selection may have changed while another load was
                    // active. The original loader snapshots it synchronously.
                    app.els.zoneSelect.value = request.identity;
                    await load();
                } catch {
                    failed = true;
                }

                if (request.serial !== sequence || request.source !== app.source) {
                    discardScene();
                    request.resolve({ ok:false, reason:'superseded' });
                    continue;
                }
                if (failed || identity(app.currentZoneRecord) !== request.identity) {
                    discardScene({ preserveError:true });
                    request.resolve({ ok:false, reason:'load-failed' });
                    continue;
                }
                readyIdentity = request.identity;
                try {
                    onReady(request.record);
                } catch {
                    readyIdentity = '';
                    discardScene({ preserveError:true });
                    request.resolve({ ok:false, reason:'load-failed' });
                    continue;
                }
                request.resolve({ ok:true, identity:request.identity });
            }
        } finally {
            active = null;
            draining = false;
        }
    }

    app.loadSelectedZone = () => {
        const record = app.selectedZoneRecord?.();
        if (!record || !app.source) return Promise.resolve({ ok:false, reason:'zone-not-selected' });
        const requestedIdentity = identity(record);
        const duplicate = pending || (!pending && active?.serial === sequence ? active : null);
        if (duplicate?.identity === requestedIdentity && duplicate.source === app.source) return duplicate.promise;
        const serial = ++sequence;
        readyIdentity = '';
        app.currentZoneRecord = null;
        app.clearNavigationGuide?.();
        active?.resolve({ ok:false, reason:'superseded' });
        pending?.resolve({ ok:false, reason:'superseded' });
        let resolve;
        const result = new Promise(finish => { resolve = finish; });
        pending = { serial, record, identity:requestedIdentity, source:app.source, resolve, promise:result };
        onRequest(record);
        void drain();
        return result;
    };

    return {
        isReady(record = app.currentZoneRecord) {
            return Boolean(readyIdentity && identity(record) === readyIdentity && identity(app.currentZoneRecord) === readyIdentity);
        }
    };
}
