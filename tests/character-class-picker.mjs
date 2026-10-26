import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {CONTRIBUTION_CLASSES} from '../app/contribution-choice-picker.js';
import {characterClassPickerMarkup,readCharacterClassPicker,validateCharacterClasses,syncCharacterClassPicker,updateCharacterClassPicker} from '../app/character-class-picker.js';

function fixture(classes,options){
    const dom=new JSDOM('<form>'+characterClassPickerMarkup(classes,options)+'<button>Continue</button></form>'),doc=dom.window.document,form=doc.querySelector('form'),root=form.querySelector('fieldset');
    form.addEventListener('change',()=>updateCharacterClassPicker(form));updateCharacterClassPicker(form);
    return {dom,doc,form,root,box:code=>root.querySelector(`input[value="${code}"]`),state:()=>validateCharacterClasses(form),read:()=>readCharacterClassPicker(form),close:()=>dom.window.close()};
}
{
    const f=fixture(['Rogue','Shadow Knight','Beastlord']);
    assert.equal(f.root.querySelectorAll('[data-character-class]').length,16);
    assert.equal(f.root.querySelector('legend').textContent,'Class combination');
    assert.deepEqual(f.read(),['ROG','SHD','BST'],'Saved selection order survives full-name normalization.');assert.equal(f.state().ok,true);
    assert.deepEqual([...new f.dom.window.FormData(f.form).getAll('classes')].sort(),['BST','ROG','SHD']);
    for(const choice of CONTRIBUTION_CLASSES){const input=f.box(choice.value),label=input.closest('label');assert.match(label.textContent,new RegExp(choice.label));assert(label.textContent.includes(choice.value));assert.equal(input.disabled,!input.checked);assert.equal(input.type,'checkbox');assert.equal(input.tabIndex,0);}
    f.box('ROG').focus();assert.equal(f.doc.activeElement,f.box('ROG'));
    const keyboard=new f.dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});f.box('ROG').dispatchEvent(keyboard);assert.equal(keyboard.defaultPrevented,false,'Native checkbox keyboard handling is not intercepted.');
    f.box('ROG').closest('label').click();assert.deepEqual(f.read(),['SHD','BST']);assert.equal(f.state().ok,true);assert.equal(f.box('WAR').disabled,false,'Removing a selected option re-enables all choices.');
    f.box('WIZ').click();assert.deepEqual(f.read(),['SHD','BST','WIZ']);f.box('CLR').click();assert.deepEqual(f.read(),['SHD','BST','WIZ'],'Disabled fourth options cannot be activated.');
    assert.equal(f.form.checkValidity(),true);f.box('BST').click();f.box('WIZ').click();assert.equal(f.state().ok,false);assert.equal(f.form.checkValidity(),false);assert.match(f.box('SHD').validationMessage,/2 or 3/);f.close();
}
{
    const f=fixture('Classes: shadowknight / cleric; WAR');assert.deepEqual(f.read(),['SHD','CLR','WAR']);assert.equal(f.state().ok,true);
    const focused=f.box('SHD');focused.focus();syncCharacterClassPicker(f.form,['MNK','BER']);assert.equal(f.box('SHD'),focused,'Model sync updates controls without replacing nodes.');assert.equal(f.doc.activeElement,focused);assert.deepEqual(f.read(),['MNK','BER']);assert.equal(f.state().ok,true);
    f.box('ROG').click();const before=f.read();updateCharacterClassPicker(f.form);updateCharacterClassPicker(f.form);assert.deepEqual(f.read(),before,'Unrelated validation preserves unsaved choices and click order.');f.close();
}
{
    const malicious='<img src=x onerror="alert(1)">',f=fixture(['WAR','CLR',malicious],{id:'<script>"bad'});
    assert.equal(f.root.querySelector('img,script'),null);assert.equal(f.root.querySelectorAll('input[onerror]').length,0);assert(f.root.querySelector('[data-character-class-legacy-text]').textContent.includes('<img'));
    assert.equal(f.state().ok,false);assert.deepEqual(f.read(),['WAR','CLR']);assert.equal(f.form.checkValidity(),false,'Valid known choices cannot silently drop unknown saved values.');
    f.box('WIZ').click();assert.equal(f.state().ok,false,'Ordinary selection changes do not acknowledge the saved unknown text.');
    const review=f.root.querySelector('[data-character-class-replace]');review.click();assert.equal(f.state().ok,true);assert.equal(f.state().replacesLegacy,true);assert(f.state().unrecognized.length>0,'Review provenance remains available after acknowledgement.');
    syncCharacterClassPicker(f.form,['PAL','RNG','unrecognized legacy']);assert.equal(review.checked,false);assert.equal(f.state().ok,false);assert.equal(f.root.querySelector('[data-character-class-legacy]').hidden,false);f.close();
}
{
    const f=fixture(['WAR','CLR','PAL','RNG']);assert.deepEqual(f.read(),['WAR','CLR','PAL','RNG'],'Invalid old four-class combinations are not silently truncated.');assert.equal(f.state().ok,false);assert.match(f.state().error,/no more than 3/);
    for(const code of f.read())assert.equal(f.box(code).disabled,false,'Every selected legacy option can be removed.');f.box('PAL').click();assert.equal(f.state().ok,true);f.close();
}
for(const legacy of ['ALL','NONE','ALL except CLR','WARLOCK / CLR']){
    const f=fixture(legacy);assert.equal(f.state().ok,false);assert(f.state().unrecognized.length);assert(f.read().length<3,'Item restriction syntax never expands into a Character combination.');f.close();
}
{
    const f=fixture([]);assert.equal(f.state().ok,false);assert.equal(f.form.checkValidity(),false);f.box('WAR').click();assert.equal(f.state().ok,false);f.box('CLR').click();assert.equal(f.state().ok,true);assert.deepEqual(f.read(),['WAR','CLR']);f.close();
}
assert.deepEqual(readCharacterClassPicker(null),[]);assert.equal(validateCharacterClasses(null).ok,false);
console.log('Character class checkboxes: canonical ordered 2/3 selection, native labels/focus/form validation, max-three removal recovery, explicit legacy review, safe sync and hostile-text escaping passed.');
