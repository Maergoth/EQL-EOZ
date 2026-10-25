import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { DiscoveryHost } = require('../desktop/discovery-host.cjs');
const origin = 'http://127.0.0.1:53147', channel = 'eye-of-zomm:discovery';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
class Contents extends EventEmitter { constructor(url) { super(); this.mainFrame = { url }; this.sent = [];this.session={}; } send(...args) { this.sent.push(args); } }
class Window extends EventEmitter { constructor(url) { super();this.webContents = new Contents(url); this.destroyed = false; } isDestroyed() { return this.destroyed; }async loadURL(url){this.webContents.mainFrame.url=url;}setBounds(value){this.bounds=value;}getBounds(){return this.bounds||{x:0,y:0,width:800,height:600};}showInactive(){}setAlwaysOnTop(){}hide(){}destroy(){this.destroyed=true;this.emit('closed');} }
function fixture(options={}) {
    const main = new Window(`${origin}/`), timer = new Window(`${origin}/overlay.html?panel=timers`), other = new Window(`${origin}/overlay.html?panel=parse`);
    const handlers = new Map(), captures = [], images = []; let windowsCreated = 0, sources = [], sourceAction = null, clipboardFailure = null;
    const electron = {
        BrowserWindow:class extends Window { constructor(options) {super('about:blank');this.options=options;windowsCreated++;} },
        ipcMain:{ handle:(name, callback) => handlers.set(name, callback), removeHandler:name => handlers.delete(name) },
        screen:{ getAllDisplays:() => [{ id:1,workArea:{x:0,y:0,width:1920,height:1080},size:{ width:1920, height:1080 }, scaleFactor:1.5 }] },
        desktopCapturer:{ async getSources(options) { captures.push(options); return sourceAction ? sourceAction() : sources; } },
        clipboard:{ writeImage(image) { if (clipboardFailure) throw clipboardFailure; images.push(image); } }
    };
    const host = new DiscoveryHost({ electron, origin, getMainWindow:() => main,itemExistence:{check:async()=>({status:'missing'}),clear(){},dispose(){}},...options });
    const frame = window => ({ sender:window.webContents, senderFrame:window.webContents.mainFrame });
    return { host, main, timer, other, mainEvent:frame(main), timerEvent:frame(timer),get noticeEvent(){return frame(host.notices.window);}, otherEvent:frame(other), captures, images, handlers, windowsCreated:() => windowsCreated,
        setSources(value) { sources = value; }, setSourceAction(value) { sourceAction = value; }, setClipboardFailure(value) { clipboardFailure = value; } };
}
const prompt = (id = 'one') => ({ id, kind:'monster', name:'a synthetic rat', zone:'Synthetic Zone' });
const image = (empty = false) => ({ isEmpty:() => empty });
const f = fixture();
try {
    for (const event of [{ sender:{}, senderFrame:f.main.webContents.mainFrame }, { sender:f.main.webContents, senderFrame:{ url:`${origin}/` } }, f.timerEvent, f.otherEvent]) await assert.rejects(f.host.handle(event, 'show', prompt()), /unavailable/);
    for (const value of [{ ...prompt(), id:'' }, { ...prompt(), kind:'account' }, { ...prompt(), name:' ' }, { ...prompt(), name:'x'.repeat(241) }]) await assert.rejects(f.host.handle(f.mainEvent, 'show', value), /Invalid/);
    await f.host.handle(f.mainEvent, 'show', { ...prompt(), privatePath:'C:\\private\\eqlog.txt', raw:'private line' });
    assert.equal(f.windowsCreated(), 1, 'registering creates the dedicated notice popup');
    assert.equal(f.captures.length, 0, 'registering inline notices never captures anything');
    assert.deepEqual(Object.keys((await f.host.handle(f.mainEvent, 'get-state'))[0]).sort(), ['id', 'kind', 'name', 'zone']);
    assert.deepEqual(await f.host.handle(f.noticeEvent, 'get-state'), f.host.state());
    assert.equal(f.captures.length, 0, 'reading inline notice state never enumerates sources');
    const copiedState = f.host.state(); copiedState[0].name = 'Mutated';
    assert.equal(f.host.state()[0].name, 'a synthetic rat', 'state snapshots do not expose mutable host records');
    for (const event of [f.otherEvent, { sender:f.timer.webContents, senderFrame:{ url:f.timer.webContents.mainFrame.url } }, { sender:{}, senderFrame:f.timer.webContents.mainFrame }]) await assert.rejects(f.host.handle(event, 'capture', { id:'one' }), /unavailable/);
    await assert.rejects(f.host.handle(f.timerEvent,'get-state'),/unavailable/,'Timers has no wiki discovery admission');
    const timerUrl = f.host.notices.window.webContents.mainFrame.url;
    f.host.notices.window.webContents.mainFrame.url += '?spoof=true';
    await assert.rejects(f.host.handle(f.noticeEvent, 'get-state'), /unavailable/);
    f.host.notices.window.webContents.mainFrame.url = timerUrl;
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
    result = await f.host.handle(f.noticeEvent, 'capture', { id:'one' });
    assert.deepEqual(result.choices, [{ id:'screen:one', name:'Screen 1' }, { id:'window:notes', name:'Notes' }]);
    assert.equal(f.images.length, written, 'ambiguous sources require a choice before clipboard writes');
    for (const sourceId of ['window:app', 'window:vanished', {}]) await assert.rejects(f.host.handle(f.noticeEvent, 'capture', { id:'one', sourceId }), /available/);
    await f.host.handle(f.noticeEvent, 'capture', { id:'one', sourceId:'screen:one' });
    assert.equal(f.images.length, written + 1, 'exact notice frame can request an explicit screenshot');
    for (const thumbnail of [image(true), null]) {
        const displayImage = image();
        f.setSources([{ id:'window:game', name:'EverQuest Legends', thumbnail },
            { id:'screen:fallback', name:'Screen 2', thumbnail:displayImage },
            { id:'window:empty', name:'Minimized Notes', thumbnail:image(true) }]);
        const beforeFallback = f.images.length;
        result = await f.host.handle(f.noticeEvent, 'capture', { id:'one' });
        assert.deepEqual(result, { choices:[{ id:'screen:fallback', name:'Screen 2' }] });
        assert.equal(f.images.length, beforeFallback, 'an unusable preferred game requires an explicit fallback choice');
        await assert.rejects(f.host.handle(f.noticeEvent, 'capture', { id:'one', sourceId:'window:game' }), /could not be captured/);
        assert.equal(f.images.length, beforeFallback, 'an explicit unusable source never silently falls back');
        result = await f.host.handle(f.noticeEvent, 'capture', { id:'one', sourceId:'screen:fallback' });
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
    const capture = f.host.handle(f.noticeEvent, 'capture', { id:'one' });
    await assert.rejects(f.host.handle(f.mainEvent, 'capture', { id:'one' }), /already in progress/);
    await assert.rejects(f.host.handle(f.noticeEvent, 'dismiss', { id:'one' }), /wait/);
    await f.host.handle(f.mainEvent, 'ignore', { id:'two' });
    assert.equal(f.host.state().length, 1, 'another inline notice can be ignored while a screenshot is in progress');
    inFlight.resolve([{ id:'window:game', name:'EverQuest', thumbnail:image() }]); await capture;
    f.setSourceAction(null);
    await f.host.handle(f.noticeEvent, 'ignore', { id:'one' });
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
    assert.equal(f.windowsCreated(), 1, 'all suggestions reuse the dedicated window');
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

const linked=fixture(),linkedPrompt={id:'linked-item',kind:'item',purpose:'item-link',name:'Synthetic Blade',zone:''};
await linked.host.handle(linked.mainEvent,'show',linkedPrompt);
assert.equal(linked.windowsCreated(),1);assert.equal(linked.captures.length,0,'Chat item discovery never starts a screenshot');
const requested=await linked.host.handle(linked.noticeEvent,'contribute',{id:linkedPrompt.id});
assert.equal(requested.pendingCapture,true);assert.match(requested.captureRequest,/^capture-\d+$/);assert.equal(linked.host.state()[0].captureState,'waiting');assert.equal(linked.host.state().length,1,'Contribute keeps the notice registered');
assert.equal(linked.main.webContents.sent.at(-1)[1].action,'contribute');assert.equal(linked.main.webContents.sent.at(-1)[1].purpose,'item-link');
const status={id:linkedPrompt.id,purpose:'item-link',captureRequest:requested.captureRequest,status:'captured',matchedName:'Synthetic Blade +5'};
await assert.rejects(linked.host.handle(linked.noticeEvent,'capture-status',status),/unavailable/,'A native presentation surface cannot assert OCR success');
await assert.rejects(linked.host.handle(linked.mainEvent,'capture-status',{...status,matchedName:'Another Blade'}),/does not match/);
await linked.host.handle(linked.mainEvent,'capture-status',{...status,status:'retry',message:'Choose a source again.'});
assert.equal(linked.host.state()[0].captureState,'retry');await assert.rejects(linked.host.handle(linked.mainEvent,'capture-status',status),/does not match/,'A cancelled request cannot complete');
const retried=await linked.host.handle(linked.noticeEvent,'contribute',{id:linkedPrompt.id});assert.notEqual(retried.captureRequest,requested.captureRequest);
await assert.rejects(linked.host.handle(linked.mainEvent,'capture-status',status),/no longer active/,'A retry rejects the previous OCR session token');
await linked.host.handle(linked.mainEvent,'capture-status',{...status,captureRequest:retried.captureRequest,matchedName:'synthetic_blade +5 (Exaltation)'});
assert.equal(linked.host.state()[0].captureState,'captured');assert.equal(linked.host.state().length,1,'The successful notice remains for its green UI interval');
const reversed=await linked.host.handle(linked.noticeEvent,'contribute',{id:linkedPrompt.id});
await linked.host.handle(linked.mainEvent,'capture-status',{...status,captureRequest:reversed.captureRequest,matchedName:'synthetic_blade (Exaltation) +5'});assert.equal(linked.host.state()[0].captureState,'captured','Tier suffixes normalize before or after the Exaltation marker');
await linked.host.handle(linked.noticeEvent,'dismiss',{id:linkedPrompt.id});assert.equal(linked.host.state().length,0);assert.equal(linked.main.webContents.sent.at(-1)[1].captureRequest,reversed.captureRequest);assert.equal(linked.main.webContents.sent.at(-1)[1].purpose,'item-link');
await assert.rejects(linked.host.handle(linked.mainEvent,'capture-status',{...status,captureRequest:retried.captureRequest}),/dismissed/,'Late completion cannot resurrect a dismissed flow');linked.host.dispose();
console.log('Wiki discovery host: exact main/notice auth, rejected Timers, dedicated popup without auto-capture, source selection, clipboard/error/busy handling and bounded private notices passed.');

for(const [status,itemExistence]of [['unknown',null],['present',{check:async()=>({status:'present'}),clear(){},dispose(){}}],['unknown',{check:async()=>({status:'unknown'}),clear(){},dispose(){}}]]){
 const admission=fixture({itemExistence}),result=await admission.host.handle(admission.mainEvent,'show',linkedPrompt);
 assert.equal(result.suppressed,true);assert.equal(Boolean(result.deferred),status==='unknown');assert.equal(admission.windowsCreated(),0,'Unverified/present items never create notices');admission.host.dispose();
}
let clock=0;const lookup=deferred(),checking=fixture({now:()=>clock,itemExistence:{check:()=>lookup.promise,clear(){},dispose(){}}});
const showing=checking.host.handle(checking.mainEvent,'show',{...linkedPrompt,createdAt:0,expiresAt:10000});clock=10001;lookup.resolve({status:'missing'});assert.equal((await showing).suppressed,true);assert.equal(checking.windowsCreated(),0,'A late native result cannot revive an expired prompt');checking.host.dispose();
for(const change of ['clear','cancel','navigate']){
 const lookup=deferred(),checking=fixture({itemExistence:{check:()=>lookup.promise,clear(){},dispose(){}}}),showing=checking.host.handle(checking.mainEvent,'show',linkedPrompt);
 if(change==='clear')checking.host.clear();else if(change==='cancel'){await assert.rejects(checking.host.handle(checking.timerEvent,'cancel-item-checks'),/unavailable/);await checking.host.handle(checking.mainEvent,'cancel-item-checks');}else checking.main.webContents.mainFrame.url=origin+'/other';
 lookup.resolve({status:'missing'});assert.equal((await showing).suppressed,true);assert.equal(checking.windowsCreated(),0,change+': a pending lookup cannot escape the original session/frame');checking.host.dispose();
}
const duplicates=fixture();await duplicates.host.handle(duplicates.mainEvent,'show',linkedPrompt);assert.equal((await duplicates.host.handle(duplicates.mainEvent,'show',{...linkedPrompt,id:'another-id',name:'Synthetic Blade +5'})).suppressed,true);assert.equal(duplicates.host.state().length,1,'Two entry points cannot stack the same canonical item');duplicates.host.dispose();
const pendingLookup=deferred(),pendingIgnore=fixture({itemExistence:{check:()=>pendingLookup.promise,clear(){},dispose(){}}});
const pendingShow=pendingIgnore.host.handle(pendingIgnore.mainEvent,'show',linkedPrompt);
assert.equal((await pendingIgnore.host.handle(pendingIgnore.mainEvent,'show',{...linkedPrompt,id:'duplicate-flight'})).suppressed,true,'An in-flight canonical item is reserved before awaiting');
await pendingIgnore.host.handle(pendingIgnore.mainEvent,'ignore',{id:linkedPrompt.id});pendingLookup.resolve({status:'missing'});assert.equal((await pendingShow).suppressed,true);assert.equal(pendingIgnore.windowsCreated(),0,'Ignoring a pending lookup prevents its late popup');
assert.equal((await pendingIgnore.host.handle(pendingIgnore.mainEvent,'show',linkedPrompt)).suppressed,true,'A retired request cannot resurrect after dismissal');pendingIgnore.host.dispose();
console.log('Discovery admission: native proof required, present/error suppression, expiry, source cancellation, exact owner continuity and canonical item dedup passed.');
