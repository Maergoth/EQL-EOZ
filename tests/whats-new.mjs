import assert from 'node:assert/strict';
import {mountWhatsNew,WHATS_NEW_STEPS,whatsNewStep} from '../app/whats-new.js';
import {PACKAGED_RUNTIME_IMAGES} from '../scripts/packaged-runtime-sources.mjs';
import {RELEASE_HISTORY} from '../app/release-history.js';
import {createReleaseSeenStore,compareReleaseVersions,releaseHistoryUpTo,RELEASE_SEEN_STORAGE_KEY} from '../app/release-history-state.js';
import {checkReleaseHistory,verifyReleaseHistory} from '../scripts/check-release-history.mjs';
import {readFileSync} from 'node:fs';

class Element {
    constructor(document){this.document=document;this.listeners=new Map();this.attributes={};this.children=[];this.nodes=new Map();this.open=false;this.disabled=false;}
    set innerHTML(value){this.markup=value;for(const match of value.matchAll(/(?:id="([^"]+)"|(data-tour-[\w-]+)(?:\s|>))/g)){const key=match[1]?`#${match[1]}`:`[${match[2]}]`;this.nodes.set(key,new Element(this.document));}}
    get innerHTML(){return this.markup;}
    querySelector(selector){return this.nodes.get(selector);}
    appendChild(child){this.children.push(child);}
    replaceChildren(...children){this.children=[...children];}
    setAttribute(name,value){this.attributes[name]=value;if(name==='open')this.open=true;}
    removeAttribute(name){delete this.attributes[name];if(name==='open')this.open=false;}
    addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener);}
    removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
    dispatch(type){const event={prevented:false,preventDefault(){this.prevented=true;}};for(const listener of this.listeners.get(type)||[])listener(event);return event;}
    click(){if(!this.disabled)this.dispatch('click');}
    focus(){this.document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;}
    remove(){this.removed=true;}
}
const document={createElement(){return new Element(this);}};document.body=new Element(document);
const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
const button=new Element(document),navigations=[],navigationWasModal=[];
const tour=mountWhatsNew({document,button,storage,getVersion:()=> '0.8.8',navigate:view=>{navigations.push(view);navigationWasModal.push(document.body.children[0].open);}}),dialog=document.body.children[0],$=selector=>dialog.querySelector(selector);
assert.equal(dialog.open,false,'Mounting the app cannot interrupt users with an automatic walkthrough');
assert.match(button.textContent,/New/);
assert.equal($('[data-tour-version]').children.length,27,'Historical releases remain browsable');
assert.equal(dialog.attributes['aria-labelledby'],'whats-new-title');
button.click();assert.equal(dialog.open,true);assert.equal($('[data-tour-count]').textContent,'1 of 4');
assert.equal($('[data-tour-previous]').disabled,true);assert.equal(document.activeElement,$('[data-tour-next]'));
assert.equal($('[data-tour-image]').src,'./assets/whats-new/0.8.8/workspace.png');
assert.equal(createReleaseSeenStore({storage}).isSeen('0.8.8'),true,'Only the release opened by the user becomes viewed');
assert.equal(createReleaseSeenStore({storage}).isSeen('0.8.7'),false,'Skipped releases keep their New state');
$('[data-tour-next]').click();assert.equal($('[data-tour-count]').textContent,'2 of 4');
assert.equal($('[data-tour-image]').alt,WHATS_NEW_STEPS[1].alt);
$('[data-tour-previous]').click();assert.equal($('[data-tour-count]').textContent,'1 of 4');
for(let i=0;i<3;i++)$('[data-tour-next]').click();
assert.equal($('[data-tour-next]').textContent,'Done');$('[data-tour-next]').click();
assert.equal(dialog.open,false);assert.equal(document.activeElement,button,'Closing restores focus to the manual trigger');
tour.open();$('[data-tour-next]').click();$('[data-tour-feature]').click();
assert.deepEqual(navigations,['map']);assert.equal(dialog.open,false);
assert.deepEqual(navigationWasModal,[false],'Close and restore trigger focus before changing away from the Settings view');
tour.open();assert.equal(dialog.dispatch('cancel').prevented,true);assert.equal(dialog.open,false,'Escape follows the accessible native-dialog cancel action');
tour.open();$('[data-tour-image]').dispatch('error');assert.equal($('[data-tour-image]').hidden,true);
assert.match($('[data-tour-caption]').textContent,/Screenshot unavailable/);
const select=$('[data-tour-version]');select.value='0.8.4';select.dispatch('change');
assert.equal($('[data-tour-image]').src,'./assets/whats-new/0.8.4/workspace.png');
assert.match($('[data-tour-release-title]').textContent,/0\.8\.4/);
assert($('[data-tour-changes]').children.length>3);
select.value='0.8.3';select.dispatch('change');
assert.equal($('[data-tour-image]').hidden,true,'A missing historical capture never borrows a current screenshot');
assert.equal($('[data-tour-details]').open,true);
assert.match($('[data-tour-caption]').textContent,/No historical screenshot/);
assert.equal($('[data-tour-count]').textContent,'1 of 1');
$('[data-tour-mark-all]').click();assert.equal(button.textContent,"What's new");
assert.equal(createReleaseSeenStore({storage}).unread('0.8.8').length,0);
tour.dispose();button.click();assert.equal(dialog.open,false);assert.equal(dialog.removed,true);
assert.equal(whatsNewStep(-9).index,0);assert.equal(whatsNewStep(99).index,3);
for(const release of RELEASE_HISTORY)for(const step of release.steps){assert(step.alt.length>20&&step.caption.length>20);assert(PACKAGED_RUNTIME_IMAGES.includes(`app/assets/whats-new/${step.image}.png`));assert(step.image.startsWith(release.version+'/'));}
assert.equal(compareReleaseVersions('0.8.10','0.8.9'),1);assert.equal(releaseHistoryUpTo('0.8.5')[0].version,'0.8.5');
const upgradeValues=new Map(),upgradeStorage={getItem:key=>upgradeValues.get(key),setItem:(key,value)=>upgradeValues.set(key,value)},before=createReleaseSeenStore({storage:upgradeStorage});
before.markAllSeen('0.8.6');
const upgraded=createReleaseSeenStore({storage:upgradeStorage});assert.deepEqual(upgraded.unread('0.8.8').map(release=>release.version),['0.8.8','0.8.7']);
upgraded.markSeen('0.8.8');assert.deepEqual(createReleaseSeenStore({storage:upgradeStorage}).unread('0.8.8').map(release=>release.version),['0.8.7']);
upgradeValues.set(RELEASE_SEEN_STORAGE_KEY,'{damaged');assert(createReleaseSeenStore({storage:upgradeStorage}).unread('0.8.8').length>0);
assert.equal(createReleaseSeenStore({storage:{getItem:()=>null,setItem:()=>{throw Error('Synthetic quota');}}}).markSeen('0.8.8'),false);
assert.deepEqual(checkReleaseHistory(),{versions:27,screenshots:20});
const changelog=readFileSync(new URL('../CHANGELOG.md',import.meta.url),'utf8'),readBytes=path=>readFileSync(new URL('../'+path,import.meta.url));
assert.throws(()=>verifyReleaseHistory({version:'0.8.9',changelog,readBytes}),/current 0\.8\.9 entry/);
const missing=structuredClone(RELEASE_HISTORY);missing[0].steps=[];
assert.throws(()=>verifyReleaseHistory({version:'0.8.8',history:missing,changelog,readBytes}),/own captured screenshots/);
assert.throws(()=>verifyReleaseHistory({version:'0.8.8',changelog,readBytes:path=>{const bytes=Buffer.from(readBytes(path));bytes[bytes.length-1]^=1;return bytes;}}),/differs from its reviewed SHA-256/);
console.log('Release history: manual walkthrough, archived media, per-version unread/skipped upgrades, persistence, focus/keyboard actions and release/package gates passed.');
