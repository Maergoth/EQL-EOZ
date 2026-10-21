'use strict';

const DEFAULT_AREA = { x:0, y:0, width:1440, height:900 };
const number = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;

function normalizeWindowPlacement(raw, displays = []) {
    const areas = displays.map(display => display.workArea).filter(area => area &&
        [area.x,area.y,area.width,area.height].every(Number.isFinite) && area.width > 0 && area.height > 0);
    if (!areas.length) areas.push(DEFAULT_AREA);
    const primary = areas[0];
    const defaults = { width:Math.min(1440,primary.width), height:Math.min(900,primary.height) };
    const bounds = {
        x:number(raw?.bounds?.x,primary.x + Math.floor((primary.width-defaults.width)/2)),
        y:number(raw?.bounds?.y,primary.y + Math.floor((primary.height-defaults.height)/2)),
        width:number(raw?.bounds?.width,defaults.width), height:number(raw?.bounds?.height,defaults.height)
    };
    let area = primary, largest = 0;
    for (const candidate of areas) {
        const overlap = Math.max(0,Math.min(bounds.x+bounds.width,candidate.x+candidate.width)-Math.max(bounds.x,candidate.x)) *
            Math.max(0,Math.min(bounds.y+bounds.height,candidate.y+candidate.height)-Math.max(bounds.y,candidate.y));
        if (overlap > largest) { area=candidate;largest=overlap; }
    }
    bounds.width = Math.min(area.width,Math.max(Math.min(1024,area.width),bounds.width));
    bounds.height = Math.min(area.height,Math.max(Math.min(700,area.height),bounds.height));
    bounds.x = Math.min(area.x+area.width-bounds.width,Math.max(area.x,bounds.x));
    bounds.y = Math.min(area.y+area.height-bounds.height,Math.max(area.y,bounds.y));
    return { schemaVersion:1, bounds, maximized:raw?.maximized === true };
}

class WindowPlacement {
    constructor({ window, screen, initial, write, getMaximized = () => window.isMaximized(), warn = console.warn,
        setTimeout = globalThis.setTimeout, clearTimeout = globalThis.clearTimeout }) {
        Object.assign(this,{window,screen,write,getMaximized,warn,setTimeout,clearTimeout});
        this.state=normalizeWindowPlacement(initial,this.displays());
        this.writeQueue=Promise.resolve();this.timer=null;this.disposed=false;this.adjusting=false;
        this.changed=()=>{this.capture();this.schedule();};
        this.restored=()=>{this.capture();this.restoreBounds();this.schedule();};
        this.displayChanged=()=>{this.restoreBounds();this.schedule();};
        for (const event of ['move','resize','maximize']) window.on(event,this.changed);
        for (const event of ['unmaximize','restore']) window.on(event,this.restored);
        for (const event of ['display-added','display-removed','display-metrics-changed']) screen?.on(event,this.displayChanged);
    }
    displays() { return this.screen?.getAllDisplays?.() || []; }
    capture() {
        if (this.disposed || this.adjusting || this.window.isDestroyed() || this.window.isMinimized() || this.window.isFullScreen?.()) return;
        const bounds=this.window.getNormalBounds?.() || this.window.getBounds();
        this.state=normalizeWindowPlacement({bounds,maximized:this.getMaximized()},this.displays());
    }
    applyBounds() {
        const win=this.window;
        if (win.isDestroyed() || win.isMinimized() || win.isMaximized() || win.isFullScreen?.()) return;
        win.setMinimumSize?.(Math.min(1024,this.state.bounds.width),Math.min(700,this.state.bounds.height));
        const current=win.getBounds();
        if (Object.keys(this.state.bounds).every(key=>current[key]===this.state.bounds[key])) return;
        this.adjusting=true;
        try { win.setBounds(this.state.bounds); } finally {this.adjusting=false;}
    }
    restoreBounds() {
        if (this.disposed) return;
        this.state=normalizeWindowPlacement(this.state,this.displays());
        this.applyBounds();
    }
    schedule() {
        if (this.disposed) return;
        this.clearTimeout(this.timer);
        this.timer=this.setTimeout(()=>{void this.flush().catch(this.warn);},250);
        this.timer.unref?.();
    }
    flush() {
        this.capture();this.clearTimeout(this.timer);
        const state=JSON.parse(JSON.stringify(this.state));
        this.writeQueue=this.writeQueue.catch(()=>{}).then(()=>this.write(state));
        return this.writeQueue;
    }
    dispose() {
        if (this.disposed) return this.writeQueue;
        const pending=this.flush();this.disposed=true;
        for (const event of ['move','resize','maximize']) this.window.removeListener(event,this.changed);
        for (const event of ['unmaximize','restore']) this.window.removeListener(event,this.restored);
        for (const event of ['display-added','display-removed','display-metrics-changed']) this.screen?.removeListener(event,this.displayChanged);
        return pending;
    }
}

module.exports={normalizeWindowPlacement,WindowPlacement};
