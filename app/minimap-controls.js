export function localMapZoom(value, multiplier = 1) {
    const current = Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 1;
    return Math.max(.25,Math.min(8,current*multiplier));
}

// This wrapper owns EoZ controls; the tracked viewer patch consumes the single
// zoom factor while retaining its original player-follow/heading projection.
export function installMiniMapControls(app) {
    const panel = app?.els?.miniMap, title = panel?.querySelector('.eqlzv-minimap-title');
    if (!title || title.querySelector('[data-minimap-zoom]')) return {dispose() {}};
    const document = panel.ownerDocument, controls = document.createElement('span');
    controls.className = 'eoz-minimap-controls'; controls.setAttribute('role','group'); controls.setAttribute('aria-label','Local Map zoom');
    controls.innerHTML = '<button type="button" data-minimap-zoom="out" aria-label="Zoom out Local Map">−</button><button type="button" data-minimap-zoom="reset" aria-label="Reset Local Map zoom" title="Reset Local Map zoom">1×</button><button type="button" data-minimap-zoom="in" aria-label="Zoom in Local Map">+</button>';
    title.append(controls); app.miniMapZoom = localMapZoom(app.miniMapZoom);
    function zoom(multiplier, reset = false) {
        app.miniMapZoom = reset ? 1 : localMapZoom(app.miniMapZoom,multiplier);
        controls.querySelector('[data-minimap-zoom="reset"]').textContent = `${Number(app.miniMapZoom.toFixed(2))}×`;
        controls.querySelector('[data-minimap-zoom="in"]').disabled = app.miniMapZoom >= 8;
        controls.querySelector('[data-minimap-zoom="out"]').disabled = app.miniMapZoom <= .25;
        app.drawMiniMap?.();
    }
    const click = event => {event.stopPropagation(); const action = event.target.closest?.('[data-minimap-zoom]')?.dataset.minimapZoom; if (action) zoom(action === 'in' ? 1.4 : 1/1.4,action === 'reset');};
    const wheel = event => {event.preventDefault();event.stopPropagation();if(event.deltaY)zoom(event.deltaY < 0 ? 1.2 : 1/1.2);};
    const pointer = event => event.stopPropagation();
    panel.addEventListener('click',click);panel.addEventListener('wheel',wheel,{passive:false});panel.addEventListener('pointerdown',pointer);
    return {dispose() {panel.removeEventListener('click',click);panel.removeEventListener('wheel',wheel);panel.removeEventListener('pointerdown',pointer);controls.remove();}};
}
