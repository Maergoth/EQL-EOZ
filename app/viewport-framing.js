// A map may finish loading while its parent view is hidden. Fitting then uses
// a zero-sized viewport and produces a wildly distant camera on first reveal.
export function deferHiddenViewportFit(app, recenter = () => {}) {
    const resetTopView = app.resetTopView.bind(app);
    let pending = false;
    const visible = () => Number(app.els?.viewport?.clientWidth) > 0 && Number(app.els?.viewport?.clientHeight) > 0;
    app.resetTopView = (...args) => {
        if (!visible()) {
            pending = true;
            return;
        }
        pending = false;
        return resetTopView(...args);
    };
    function fitIfNeeded() {
        if (pending && visible() && (app.mapFileVisible || app.mode !== 'first')) {
            app.resetTopView();
            recenter();
        }
    }
    // First may be revealed before Top. Consume the deferred fit when the
    // player later enters Top/Map, before a hidden-load camera can be reused.
    for (const method of ['setMode', 'setGameMapVisible']) {
        if (typeof app[method] !== 'function') continue;
        const original = app[method].bind(app);
        app[method] = (...args) => {
            const result = original(...args);
            fitIfNeeded();
            return result;
        };
    }
    return {
        resize() {
            app.resize?.();
            fitIfNeeded();
        }
    };
}
