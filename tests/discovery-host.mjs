import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DiscoveryHost } = require('../desktop/discovery-host.cjs');
const origin = 'http://127.0.0.1:53147', channel = 'eye-of-zomm:discovery';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Contents extends EventEmitter { constructor(url) { super(); this.mainFrame = { url }; this.sent = []; } send(...args) { this.sent.push(args); } }
class Window { constructor(url) { this.webContents = new Contents(url); this.destroyed = false; } isDestroyed() { return this.destroyed; } }
function fixture() {
    const main = new Window(`${origin}/`), timer = new Window(`${origin}/overlay.html?panel=timers`), other = new Window(`${origin}/overlay.html?panel=parse`);
    const handlers = new Map(), captures = [], images = []; let windowsCreated = 0, sources = [], sourceAction = null, clipboardFailure = null;
    const electron = {
        BrowserWindow:class { constructor() { windowsCreated++; throw new Error('No discovery window may be created.'); } },
        ipcMain:{ handle:(name, callback) => handlers.set(name, callback), removeHandler:name => handlers.delete(name) },
        screen:{ getAllDisplays:() => [{ size:{ width:1920, height:1080 }, scaleFactor:1.5 }] },
        desktopCapturer:{ async getSources(options) { captures.push(options); return sourceAction ? sourceAction() : sources; } },
        clipboard:{ writeImage(image) { if (clipboardFailure) throw clipboardFailure; images.push(image); } }
    };
    const host = new DiscoveryHost({ electron, origin, getMainWindow:() => main,
        isTimerPanel:event => !timer.isDestroyed() && event.sender === timer.webContents && event.senderFrame === timer.webContents.mainFrame && event.senderFrame?.url === `${origin}/overlay.html?panel=timers` });
    const frame = window => ({ sender:window.webContents, senderFrame:window.webContents.mainFrame });
    return { host, main, timer, other, mainEvent:frame(main), timerEvent:frame(timer), otherEvent:frame(other), captures, images, handlers, windowsCreated:() => windowsCreated,
        setSources(value) { sources = value; }, setSourceAction(value) { sourceAction = value; }, setClipboardFailure(value) { clipboardFailure = value; } };
}
const prompt = (id = 'one') => ({ id, kind:'monster', name:'a synthetic rat', zone:'Synthetic Zone' });
const image = (empty = false) => ({ isEmpty:() => empty });
const f = fixture();
try {
    for (const event of [{ sender:{}, senderFrame:f.main.webContents.mainFrame }, { sender:f.main.webContents, senderFrame:{ url:`${origin}/` } }, f.timerEvent, f.otherEvent]) await assert.rejects(f.host.handle(event, 'show', prompt()), /unavailable/);
    for (const value of [{ ...prompt(), id:'' }, { ...prompt(), kind:'account' }, { ...prompt(), name:' ' }, { ...prompt(), name:'x'.repeat(241) }]) await assert.rejects(f.host.handle(f.mainEvent, 'show', value), /Invalid/);
    await f.host.handle(f.mainEvent, 'show', { ...prompt(), privatePath:'C:\\private\\eqlog.txt', raw:'private line' });
    assert.equal(f.windowsCreated(), 0, 'registering a suggestion never creates a window');
    assert.equal(f.captures.length, 0, 'registering inline notices never captures anything');
    assert.deepEqual(Object.keys((await f.host.handle(f.mainEvent, 'get-state'))[0]).sort(), ['id', 'kind', 'name', 'zone']);
    assert.deepEqual(await f.host.handle(f.timerEvent, 'get-state'), f.host.state());
    assert.equal(f.captures.length, 0, 'reading inline notice state never enumerates sources');
    const copiedState = f.host.state(); copiedState[0].name = 'Mutated';
    assert.equal(f.host.state()[0].name, 'a synthetic rat', 'state snapshots do not expose mutable host records');
    for (const event of [f.otherEvent, { sender:f.timer.webContents, senderFrame:{ url:f.timer.webContents.mainFrame.url } }, { sender:{}, senderFrame:f.timer.webContents.mainFrame }]) await assert.rejects(f.host.handle(event, 'capture', { id:'one' }), /unavailable/);
    const timerUrl = f.timer.webContents.mainFrame.url;
    f.timer.webContents.mainFrame.url += '&spoof=true';
    await assert.rejects(f.host.handle(f.timerEvent, 'get-state'), /unavailable/);
    f.timer.webContents.mainFrame.url = timerUrl;
    await assert.rejects(f.host.handle(f.mainEvent, 'capture', { id:'stale' }), /already been dismissed/);

    const gameImage = image();
    f.setSources([{ id:'window:game', name:'EverQuest Legends', thumbnail:gameImage }, { id:'window:app', name:'Eye of Zomm · Timers', thumbnail:image() }]);
    let result = await f.host.handle(f.mainEvent, 'capture', { id:'one' });
    assert.equal(result.captured, true); assert.deepEqual(f.images, [gameImage]);
    assert.equal(f.captures[0].thumbnailSize.width, 2880); assert.equal(f.captures[0].thumbnailSize.height, 1620);
    assert.deepEqual(f.captures[0].types, ['window', 'screen']);
    assert.equal(f.host.state()[0].id, 'one', 'success leaves the inline notice registered until its UI dismisses it');
    assert.match(result.message, /Paste your clipboard into discord/);
    f.setSources([{ id:'screen:one', name:'Screen 1', thumbnail:image() }, { id:'window:notes', name:'Notes', thumbnail:image() }, { id:'window:app', name:'EQLWiki - Eye of Zomm', thumbnail:image() }]);
    const written = f.images.length;
    result = await f.host.handle(f.timerEvent, 'capture', { id:'one' });
    assert.deepEqual(result.choices, [{ id:'screen:one', name:'Screen 1' }, { id:'window:notes', name:'Notes' }]);
    assert.equal(f.images.length, written, 'ambiguous sources require a choice before clipboard writes');
    for (const sourceId of ['window:app', 'window:vanished', {}]) await assert.rejects(f.host.handle(f.timerEvent, 'capture', { id:'one', sourceId }), /available/);
    await f.host.handle(f.timerEvent, 'capture', { id:'one', sourceId:'screen:one' });
    assert.equal(f.images.length, written + 1, 'exact native Timers frame can request an explicit screenshot');
    for (const thumbnail of [image(true), null]) {
        const displayImage = image();
        f.setSources([{ id:'window:game', name:'EverQuest Legends', thumbnail },
            { id:'screen:fallback', name:'Screen 2', thumbnail:displayImage },
            { id:'window:empty', name:'Minimized Notes', thumbnail:image(true) }]);
        const beforeFallback = f.images.length;
        result = await f.host.handle(f.timerEvent, 'capture', { id:'one' });
        assert.deepEqual(result, { choices:[{ id:'screen:fallback', name:'Screen 2' }] });
        assert.equal(f.images.length, beforeFallback, 'an unusable preferred game requires an explicit fallback choice');
        await assert.rejects(f.host.handle(f.timerEvent, 'capture', { id:'one', sourceId:'window:game' }), /could not be captured/);
        assert.equal(f.images.length, beforeFallback, 'an explicit unusable source never silently falls back');
        result = await f.host.handle(f.timerEvent, 'capture', { id:'one', sourceId:'screen:fallback' });
        assert.equal(result.captured, true);
        assert.equal(f.images.length, beforeFallback + 1);
        assert.equal(f.images.at(-1), displayImage, 'only the explicitly chosen display is copied exactly once');
    }
    f.setSources([{ id:'window:game', name:'EverQuest', thumbnail:image(true) }]);
    await assert.rejects(f.host.handle(f.mainEvent, 'capture', { id:'one' }), /could not be captured/);
    f.setSources([{ id:'window:game', name:'EverQuest', thumbnail:null }]);
    await assert.rejects(f.host.handle(f.mainEvent, 'capture', { id:'one' }), /could not be captured/);
    f.setSources([{ id:'window:game', name:'EverQuest', thumbnail:image() }]);
    f.setClipboardFailure(new Error('Clipboard denied'));
    await assert.rejects(f.host.handle(f.mainEvent, 'capture', { id:'one' }), /Clipboard denied/);
    assert.equal(f.host.capturing, false); f.setClipboardFailure(null);
    await f.host.handle(f.mainEvent, 'show', prompt('two'));
    const inFlight = deferred(); f.setSourceAction(() => inFlight.promise);
    const capture = f.host.handle(f.timerEvent, 'capture', { id:'one' });
    await assert.rejects(f.host.handle(f.mainEvent, 'capture', { id:'one' }), /already in progress/);
    await assert.rejects(f.host.handle(f.timerEvent, 'dismiss', { id:'one' }), /wait/);
    await f.host.handle(f.mainEvent, 'ignore', { id:'two' });
    assert.equal(f.host.state().length, 1, 'another inline notice can be ignored while a screenshot is in progress');
    inFlight.resolve([{ id:'window:game', name:'EverQuest', thumbnail:image() }]); await capture;
    f.setSourceAction(null);
    await f.host.handle(f.timerEvent, 'ignore', { id:'one' });
    assert.deepEqual(f.main.webContents.sent.at(-1), ['eye-of-zomm:discovery-action', { action:'ignore', id:'one' }]);
    assert.equal(f.host.state().length, 0);
    await f.host.handle(f.mainEvent, 'show', prompt('dismiss-me'));
    await f.host.handle(f.mainEvent, 'dismiss', { id:'dismiss-me' });
    assert.deepEqual(f.main.webContents.sent.at(-1), ['eye-of-zomm:discovery-action', { action:'dismiss', id:'dismiss-me' }]);
    for (let i = 0; i < 25; i++) await f.host.handle(f.mainEvent, 'show', prompt(`queue-${i}`));
    assert.equal(f.host.queue.length, 20);
    assert.equal((await f.host.handle(f.mainEvent, 'show', prompt('overflow'))).queued, false);
    await f.host.handle(f.mainEvent, 'show', prompt('queue-0'));
    assert.equal(f.host.queue.length, 20);
    assert.equal(f.windowsCreated(), 0, 'no discovery API opens or focuses a window');
} finally { f.host.dispose(); }
assert.equal(f.handlers.has(channel), false);

const late = fixture(); await late.host.handle(late.mainEvent, 'show', prompt());
const delayed = deferred(); late.setSourceAction(() => delayed.promise);
const pending = late.host.handle(late.mainEvent, 'capture', { id:'one' });
late.host.dispose(); delayed.resolve([{ id:'game', name:'EverQuest', thumbnail:image() }]);
await assert.rejects(pending, /cancelled/);
assert.equal(late.images.length, 0, 'closing the owner prevents a late clipboard overwrite');
const cleared = fixture(); await cleared.host.handle(cleared.mainEvent, 'show', prompt());
const clearingCapture = deferred(); cleared.setSourceAction(() => clearingCapture.promise);
const oldCapture = cleared.host.handle(cleared.mainEvent, 'capture', { id:'one' });
cleared.host.clear();
assert.equal(cleared.host.state().length, 0);
assert.equal(cleared.handlers.has(channel), true, 'resetting a renderer keeps the shared IPC handler installed');
await cleared.host.handle(cleared.mainEvent, 'show', prompt('new-owner'));
const freshCapture = deferred(); cleared.setSourceAction(() => freshCapture.promise);
const currentCapture = cleared.host.handle(cleared.mainEvent, 'capture', { id:'new-owner' });
clearingCapture.resolve([{ id:'game', name:'EverQuest', thumbnail:image() }]);
await assert.rejects(oldCapture, /cancelled/);
assert.equal(cleared.images.length, 0);
assert.equal(cleared.host.capturing, true, 'an old capture finally block cannot clear a newer owner capture lock');
freshCapture.resolve([{ id:'game', name:'EverQuest', thumbnail:image() }]); await currentCapture;
assert.equal(cleared.images.length, 1);
assert.equal(cleared.host.state()[0].id, 'new-owner', 'new renderer suggestions are accepted after a reset');
cleared.host.dispose();
console.log('Inline wiki discovery host: exact main/Timers auth, no windows or auto-capture, source selection, clipboard/error/busy handling and bounded private notices passed.');
