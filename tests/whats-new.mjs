import assert from 'node:assert/strict';
import {mountWhatsNew,WHATS_NEW_STEPS,whatsNewStep} from '../app/whats-new.js';
import {PACKAGED_RUNTIME_IMAGES} from '../scripts/packaged-runtime-sources.mjs';

class Element {
    constructor(document){this.document=document;this.listeners=new Map();this.attributes={};this.children=[];this.nodes=new Map();this.open=false;this.disabled=false;}
    set innerHTML(value){this.markup=value;for(const match of value.matchAll(/(?:id="([^"]+)"|(data-tour-[\w-]+)(?:\s|>))/g)){const key=match[1]?`#${match[1]}`:`[${match[2]}]`;this.nodes.set(key,new Element(this.document));}}
    get innerHTML(){return this.markup;}
    querySelector(selector){return this.nodes.get(selector);}
    appendChild(child){this.children.push(child);}
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
const button=new Element(document),navigations=[],navigationWasModal=[];
const tour=mountWhatsNew({document,button,navigate:view=>{navigations.push(view);navigationWasModal.push(document.body.children[0].open);}}),dialog=document.body.children[0],$=selector=>dialog.querySelector(selector);
assert.equal(dialog.open,false,'Mounting the app cannot interrupt users with an automatic walkthrough');
assert.equal(dialog.attributes['aria-labelledby'],'whats-new-title');
button.click();assert.equal(dialog.open,true);assert.equal($('[data-tour-count]').textContent,'1 of 4');
assert.equal($('[data-tour-previous]').disabled,true);assert.equal(document.activeElement,$('[data-tour-next]'));
assert.equal($('[data-tour-image]').src,'./assets/whats-new/workspace.png');
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
tour.dispose();button.click();assert.equal(dialog.open,false);assert.equal(dialog.removed,true);
assert.equal(whatsNewStep(-9).index,0);assert.equal(whatsNewStep(99).index,3);
for(const step of WHATS_NEW_STEPS){assert(step.alt.length>20&&step.caption.length>20);assert(PACKAGED_RUNTIME_IMAGES.includes(`app/assets/whats-new/${step.image}.png`));}
console.log('Manual walkthrough: steps, navigation, captions, native dialog cancel, focus restoration, image fallback and packaged-media contracts passed.');
