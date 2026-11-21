import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountDropObservationSettings} from '../app/drop-observation-settings.js';

const dom=new JSDOM('<section id="settings"></section>'),root=dom.window.document.querySelector('section');
let status={enabled:true,includeCharacterName:false,characterNameSupported:false,authenticated:false,pending:120,acknowledged:30},identity={name:'Synthetic Character',server:'Synthetic'},detected='Synthetic Character',feature=true,listener,unsubscribed=false,cleared=false,logins=0;
const patches=[],warnings=[],next=()=>new Promise(resolve=>setImmediate(resolve));
const api={status:async()=>({...status}),configure:async patch=>{patches.push(patch);Object.assign(status,patch);return{...status};},onStatus:callback=>{listener=callback;return()=>{unsubscribed=true;};}};
const settings=mountDropObservationSettings({root,api,getConfiguredCharacter:()=>identity,getDetectedCharacter:()=>detected,isFeatureEnabled:()=>feature,login:async()=>{logins++;Object.assign(status,{authenticated:true,characterNameSupported:true});},notify:message=>warnings.push(message),setIntervalImpl:()=>123,clearIntervalImpl:id=>{assert.equal(id,123);cleared=true;}});
await next();
const control=name=>root.querySelector(`[data-observation-${name}]`);
assert.equal(logins,0,'Mounting Settings never opens a login window');
assert.equal(control('enabled').checked,true);
assert.equal(control('login').hidden,false,'The drop Settings offer a direct EoZ wiki login');
assert.equal(control('character-name').checked,false,'Public attribution starts off');
assert.equal(control('character-name').disabled,true,'Old or logged-out servers cannot enable public names');
assert.match(control('status').textContent,/120 pending.*Log in here/);
control('login').click();await next();await next();
assert.equal(logins,1);assert.equal(control('login').hidden,true);assert.equal(control('character-name').disabled,false);
assert.match(control('name-disclosure').textContent,/Public character name: Synthetic Character\./);
control('character-name').click();await next();
assert.deepEqual(patches.at(-1),{includeCharacterName:true});assert.equal(control('character-name').checked,true);
assert.match(control('name-disclosure').textContent,/names already queued can still be published/);
control('character-name').click();await next();assert.equal(status.includeCharacterName,false);

detected='Another Character';settings.refreshIdentity();
assert.equal(control('character-name').disabled,true);assert.match(control('name-disclosure').textContent,/name is omitted/);
identity=null;settings.refreshIdentity();assert.match(control('name-disclosure').textContent,/No registered character selected/);
identity={name:'<img onerror=x>',server:'Synthetic'};detected=identity.name;settings.refreshIdentity();
assert.equal(root.querySelector('img'),null,'Configured names render only as text');

let restoreStatus;api.status=()=>new Promise(resolve=>{restoreStatus=resolve;});
const stale=settings.refresh();
Object.assign(status,{includeCharacterName:true,uploading:true});listener({...status});
restoreStatus({...status,includeCharacterName:false,uploading:false});await stale;
assert.equal(control('character-name').checked,true,'Late status requests cannot replace newer native preferences');
assert.match(control('status').textContent,/Uploading in the background/);

feature=false;listener({...status,authenticated:false});
assert.equal(control('enabled').disabled,true);assert.equal(control('character-name').disabled,true);assert.equal(control('login').disabled,true);
assert.match(control('status').textContent,/disabled in Features/);
assert.deepEqual(warnings,[]);
settings.dispose();assert.equal(unsubscribed,true);assert.equal(cleared,true);dom.window.close();
console.log('Drop Settings: explicit login, default-off names, registered identity disclosure, capability and feature gates, native status ordering and safe text passed.');
