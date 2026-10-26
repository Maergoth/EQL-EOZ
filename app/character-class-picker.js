import {CONTRIBUTION_CLASSES} from './contribution-choice-picker.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const codes=new Set(CONTRIBUTION_CLASSES.map(choice=>choice.value));
const aliases=CONTRIBUTION_CLASSES.flatMap(choice=>[choice.value,choice.label,choice.label.replace(/\s+/g,'')].map(name=>[name.toLowerCase(),choice.value]));
const aliasCodes=new Map(aliases);
const classPattern=new RegExp('\\b(?:'+[...aliasCodes.keys()].sort((a,b)=>b.length-a.length).map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+')).join('|')+')\\b','gi');
const chooseMessage='Choose 2 or 3 classes.';

// Character combinations do not use item restrictions such as ALL/NONE.
// Keep unknown saved text separately until the user explicitly replaces it.
function parseClasses(value){
    const selected=[],unrecognized=[];
    for(const entry of Array.isArray(value)?value:[value]){
        const text=typeof entry==='string'?entry:entry==null?'':JSON.stringify(entry);
        const remaining=text.replace(/^Classes?\s*:\s*/i,'').replace(classPattern,match=>{
            const code=aliasCodes.get(match.toLowerCase().replace(/\s+/g,' '));
            if(code&&!selected.includes(code))selected.push(code);
            return code?' ':match;
        });
        for(const word of remaining.split(/[\s,;|/]+/).filter(Boolean))if(!unrecognized.includes(word))unrecognized.push(word);
    }
    return {codes:selected,unrecognized};
}
const pickerFor=root=>root?.matches?.('[data-character-class-picker]')?root:root?.querySelector?.('[data-character-class-picker]');
const boxes=picker=>[...picker.querySelectorAll('input[data-character-class]')];
function storedList(picker,key){try{const value=JSON.parse(picker.dataset[key]||'[]');return Array.isArray(value)?value.filter(item=>typeof item==='string'):[];}catch{return [];}}
function selection(picker){
    const checked=boxes(picker).filter(box=>box.checked&&codes.has(box.value)).map(box=>box.value);
    return [...new Set([...storedList(picker,'characterClassOrder').filter(code=>checked.includes(code)),...checked])];
}
function stateFor(picker){
    if(!picker)return {ok:false,codes:[],unrecognized:[],error:chooseMessage,replacesLegacy:false};
    const selected=selection(picker),unrecognized=storedList(picker,'characterClassUnknown'),replacesLegacy=unrecognized.length>0&&Boolean(picker.querySelector('[data-character-class-replace]')?.checked);
    const error=unrecognized.length&&!replacesLegacy?'Review the unrecognized saved classes and confirm their replacement.':selected.length<2?chooseMessage:selected.length>3?'Choose no more than 3 classes.':'';
    return {ok:!error,codes:selected,unrecognized,error,replacesLegacy};
}

export function characterClassPickerMarkup(classes,{id='character-class-picker'}={}){
    const parsed=parseClasses(classes),selected=new Set(parsed.codes),safeId=String(id).replace(/[^\w-]/g,'-')||'character-class-picker';
    const state={codes:parsed.codes,unrecognized:parsed.unrecognized},error=parsed.unrecognized.length?'Review the unrecognized saved classes and confirm their replacement.':parsed.codes.length<2?chooseMessage:parsed.codes.length>3?'Choose no more than 3 classes.':'';
    return `<fieldset class="character-class-picker" data-character-class-picker data-character-class-order="${escape(JSON.stringify(state.codes))}" data-character-class-unknown="${escape(JSON.stringify(state.unrecognized))}" aria-describedby="${safeId}-hint ${safeId}-status ${safeId}-legacy" aria-invalid="${Boolean(error)}"><legend>Class combination</legend><p id="${safeId}-hint" class="settings-helper">Choose 2 or 3 classes. Remove a selected class to choose another.</p><div class="character-class-options">${CONTRIBUTION_CLASSES.map(choice=>`<label class="character-class-option" for="${safeId}-${choice.value}"><input type="checkbox" id="${safeId}-${choice.value}" name="classes" value="${choice.value}" data-character-class ${selected.has(choice.value)?'checked':parsed.codes.length>=3?'disabled':''}><span>${escape(choice.label)} <small>(${choice.value})</small></span></label>`).join('')}</div><div id="${safeId}-legacy" class="character-class-legacy" data-character-class-legacy ${parsed.unrecognized.length?'':'hidden'}><p data-character-class-legacy-text>Saved class values need review: ${escape(parsed.unrecognized.join(', '))}.</p><label><input type="checkbox" data-character-class-replace> Replace unrecognized saved values with the selected classes</label></div><p id="${safeId}-status" class="settings-helper" data-character-class-status role="status" aria-live="polite">${escape(error||`${parsed.codes.length} classes selected.`)}</p></fieldset>`;
}

export function readCharacterClassPicker(root){
    const picker=pickerFor(root);return picker?selection(picker):[];
}

export function validateCharacterClasses(root){return updateCharacterClassPicker(root);}

export function updateCharacterClassPicker(root){
    const picker=pickerFor(root),state=stateFor(picker);if(!picker)return state;
    picker.dataset.characterClassOrder=JSON.stringify(state.codes);
    const inputs=boxes(picker);
    for(const input of inputs){input.disabled=!input.checked&&state.codes.length>=3;input.setCustomValidity('');}
    const anchor=inputs.find(input=>input.checked)||inputs.find(input=>!input.disabled);
    if(anchor)anchor.setCustomValidity(state.error);
    picker.setAttribute('aria-invalid',String(!state.ok));
    picker.querySelector('[data-character-class-status]').textContent=state.error||`${state.codes.length} classes selected.`;
    return state;
}

// Call only when the underlying saved metadata changes. Updating individual
// controls keeps their DOM identity and focus; unrelated renders need no sync.
export function syncCharacterClassPicker(root,classes){
    const picker=pickerFor(root);if(!picker)return stateFor(null);
    const parsed=parseClasses(classes),selected=new Set(parsed.codes);
    picker.dataset.characterClassOrder=JSON.stringify(parsed.codes);
    picker.dataset.characterClassUnknown=JSON.stringify(parsed.unrecognized);
    for(const input of boxes(picker))input.checked=selected.has(input.value);
    const warning=picker.querySelector('[data-character-class-legacy]');warning.hidden=!parsed.unrecognized.length;
    warning.querySelector('[data-character-class-legacy-text]').textContent=`Saved class values need review: ${parsed.unrecognized.join(', ')}.`;
    warning.querySelector('[data-character-class-replace]').checked=false;
    return updateCharacterClassPicker(picker);
}
