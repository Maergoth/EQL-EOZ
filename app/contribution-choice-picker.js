// Fixed item metadata choices. Merely opening a draft must not rewrite an old
// OCR value: readContributionChoicePicker returns it verbatim until a choice
// is changed. The caller retains the field's existing review/edited policy.
export const CONTRIBUTION_CLASSES = Object.freeze([
    ['WAR','Warrior'],['CLR','Cleric'],['PAL','Paladin'],['RNG','Ranger'],
    ['SHD','Shadow Knight'],['DRU','Druid'],['MNK','Monk'],['BRD','Bard'],
    ['ROG','Rogue'],['SHM','Shaman'],['NEC','Necromancer'],['WIZ','Wizard'],
    ['MAG','Magician'],['ENC','Enchanter'],['BST','Beastlord'],['BER','Berserker']
].map(([value,label])=>Object.freeze({value,label})));
export const CONTRIBUTION_SLOTS = Object.freeze([
    ['CHARM','Charm'],['EAR','Ear'],['HEAD','Head'],['FACE','Face'],['NECK','Neck'],
    ['SHOULDERS','Shoulders'],['ARMS','Arms'],['BACK','Back'],['WRIST','Wrist'],
    ['RANGE','Range'],['HANDS','Hands'],['PRIMARY','Primary'],['SECONDARY','Secondary'],
    ['FINGER','Finger'],['CHEST','Chest'],['LEGS','Legs'],['FEET','Feet'],['WAIST','Waist'],
    ['AMMO','Ammo'],['POWER SOURCE','Power Source'],['ANY','Any slot']
].map(([value,label])=>Object.freeze({value,label})));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choices=kind=>kind==='classes'?CONTRIBUTION_CLASSES:kind==='slots'?CONTRIBUTION_SLOTS:null;
const classCodes=CONTRIBUTION_CLASSES.map(choice=>choice.value);
const ordered=(kind,values)=>choices(kind).map(choice=>choice.value).filter(value=>values.has(value));

export function normalizeContributionChoices(kind,input){
    const options=choices(kind);if(!options)throw Error('Unknown contribution choice kind.');
    let text=(Array.isArray(input)?input.map(value=>typeof value==='string'?value:String(value??'')).join(' '):typeof input==='string'?input:input==null?'':String(input)).trim();
    text=text.replace(kind==='classes'?/^Classes?\s*:\s*/i:/^(?:Equipment\s+)?Slots?\s*:\s*/i,'');
    // Resolve whole class/slot names before splitting the OCR's whitespace.
    const aliases=[...options.map(choice=>[choice.label,choice.value])];
    if(kind==='classes')aliases.push(['Shadowknight','SHD']);
    else aliases.push(['PowerSource','POWER SOURCE'],['Ranged','RANGE'],['Ears','EAR'],['Wrists','WRIST'],['Fingers','FINGER'],['Shoulder','SHOULDERS']);
    for(const [name,value]of aliases.sort((a,b)=>b[0].length-a[0].length)){
        const pattern=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
        text=text.replace(new RegExp(`\\b${pattern}\\b`,'gi'),value.replace(/ /g,'_'));
    }
    const exclusion=kind==='classes'&&/^ALL\s+EXCEPT\b/i.test(text);
    if(exclusion)text=text.replace(/^ALL\s+EXCEPT\b/i,'');
    const allowed=new Set(options.map(choice=>choice.value)),seen=new Set(),unrecognized=[];
    for(const token of text.split(/[\s,;|/]+/).filter(Boolean)){
        const value=token.toUpperCase().replace(/_/g,' ');
        if(allowed.has(value)||kind==='classes'&&['ALL','NONE'].includes(value))seen.add(value);
        else if(!unrecognized.includes(token))unrecognized.push(token);
    }
    let value;
    if(exclusion)value=ordered(kind,new Set(classCodes.filter(code=>!seen.has(code))));
    else if(kind==='classes'&&seen.has('ALL'))value=['ALL'];
    else if(kind==='classes'&&seen.has('NONE')&&!classCodes.some(code=>seen.has(code)))value=['NONE'];
    else value=ordered(kind,seen);
    if(kind==='classes'&&value.length===classCodes.length)value=['ALL'];
    return {value,unrecognized};
}

export function toggleContributionChoice(kind,current,choice){
    const options=choices(kind);if(!options)throw Error('Unknown contribution choice kind.');
    const normalized=normalizeContributionChoices(kind,current).value,selected=new Set(normalized.includes('ALL')?classCodes:normalized);
    if(kind==='classes'&&choice==='ALL')return normalized.includes('ALL')?[]:['ALL'];
    if(kind==='classes'&&choice==='NONE')return normalized.includes('NONE')?[]:['NONE'];
    if(!options.some(option=>option.value===choice))return normalized;
    selected.delete('NONE');if(selected.has(choice))selected.delete(choice);else selected.add(choice);
    const value=ordered(kind,selected);
    return kind==='classes'&&value.length===classCodes.length?['ALL']:value;
}

function summary(kind,value){
    if(value.includes('ALL'))return 'All classes';
    if(value.includes('NONE'))return 'No classes';
    if(!value.length)return kind==='classes'?'Choose classes':'Choose equipment slots';
    return choices(kind).filter(choice=>value.includes(choice.value)).map(choice=>kind==='classes'?choice.value:choice.label).join(', ');
}
export function contributionChoicePickerMarkup(kind,value,{id=`contribution-${kind}-choices`}={}){
    const options=choices(kind);if(!options)throw Error('Unknown contribution choice kind.');
    const parsed=normalizeContributionChoices(kind,value),selected=new Set(parsed.value),label=kind==='classes'?'Classes':'Equipment slots',safeId=String(id).replace(/[^\w-]/g,'-');
    const allOptions=kind==='classes'?[{value:'ALL',label:'All classes'},{value:'NONE',label:'No classes'},...options]:options;
    return `<div class="contribution-choice-picker" data-choice-picker="${kind}" data-choice-original="${escape(JSON.stringify(value??[]))}"><button type="button" class="contribution-choice-trigger" data-choice-trigger aria-haspopup="listbox" aria-expanded="false" aria-controls="${safeId}" aria-label="${label}: ${escape(summary(kind,parsed.value))}"><span data-choice-summary>${escape(summary(kind,parsed.value))}</span><span aria-hidden="true">▾</span></button><div id="${safeId}" class="contribution-choice-list" data-choice-list role="listbox" aria-label="${label}" aria-multiselectable="true" hidden>${allOptions.map(option=>`<button type="button" class="contribution-choice-option" data-choice-option="${escape(option.value)}" role="option" tabindex="-1" aria-selected="${selected.has(option.value)||selected.has('ALL')&&classCodes.includes(option.value)}"><span>${escape(option.label)}</span>${kind==='classes'&&classCodes.includes(option.value)?`<small>${option.value}</small>`:''}<span data-choice-check aria-hidden="true">✓</span></button>`).join('')}</div><textarea hidden data-field-value data-array="true" data-choice-output>${escape(parsed.value.join(', '))}</textarea>${parsed.unrecognized.length?`<small class="settings-helper" data-choice-legacy>Saved values need review: ${escape(parsed.unrecognized.join(', '))}. Select from the list to replace them.</small>`:''}</div>`;
}
export function readContributionChoicePicker(picker){
    if(picker.dataset.choiceEdited!=='true')return JSON.parse(picker.dataset.choiceOriginal||'[]');
    return normalizeContributionChoices(picker.dataset.choicePicker,picker.querySelector('[data-choice-output]').value).value;
}

export function contributionChoicePlacement(trigger,bounds,height){
    const below=Math.max(0,bounds.bottom-trigger.bottom-4),above=Math.max(0,trigger.top-bounds.top-4),up=below<height&&above>below;
    return {up,room:Math.floor(Math.max(1,Math.min(height,up?above:below)))};
}

export function mountContributionChoicePickers({root,onChange=()=>{}}){
    const doc=root.ownerDocument,find=target=>target?.closest?.('[data-choice-picker]'),pickers=()=>[...root.querySelectorAll('[data-choice-picker]')];
    const close=(picker,restore=false)=>{picker.querySelector('[data-choice-list]').hidden=true;const trigger=picker.querySelector('[data-choice-trigger]');trigger.setAttribute('aria-expanded','false');if(restore)trigger.focus();};
    const open=(picker,last=false)=>{
        for(const other of pickers())if(other!==picker)close(other);
        const list=picker.querySelector('[data-choice-list]'),trigger=picker.querySelector('[data-choice-trigger]'),view=doc.defaultView;
        list.hidden=false;trigger.setAttribute('aria-expanded','true');
        list.style.removeProperty('--choice-room');
        const bounds={top:0,bottom:view.innerHeight};
        // A form can scroll inside the app viewport. Its scroll boundary is as
        // important as the screen edge when deciding which way the menu opens.
        for(let parent=picker.parentElement;parent;parent=parent.parentElement){
            if(!/^(?:auto|scroll|hidden|clip)$/.test(view.getComputedStyle(parent).overflowY))continue;
            const rect=parent.getBoundingClientRect();bounds.top=Math.max(bounds.top,rect.top);bounds.bottom=Math.min(bounds.bottom,rect.bottom);
        }
        const placement=contributionChoicePlacement(trigger.getBoundingClientRect(),bounds,Math.min(290,view.innerHeight*.45,list.scrollHeight));
        picker.dataset.choiceUp=String(placement.up);list.style.setProperty('--choice-room',placement.room+'px');
        const options=[...picker.querySelectorAll('[data-choice-option]')],selected=options.find(option=>option.getAttribute('aria-selected')==='true');
        (last?options.at(-1):selected||options[0])?.focus();
    };
    const choose=(picker,option)=>{
        const kind=picker.dataset.choicePicker,output=picker.querySelector('[data-choice-output]'),value=toggleContributionChoice(kind,output.value,option.dataset.choiceOption),selected=new Set(value);
        picker.dataset.choiceEdited='true';output.value=value.join(', ');
        for(const node of picker.querySelectorAll('[data-choice-option]'))node.setAttribute('aria-selected',String(selected.has(node.dataset.choiceOption)||selected.has('ALL')&&classCodes.includes(node.dataset.choiceOption)));
        picker.querySelector('[data-choice-summary]').textContent=summary(kind,value);
        picker.querySelector('[data-choice-trigger]').setAttribute('aria-label',`${kind==='classes'?'Classes':'Equipment slots'}: ${summary(kind,value)}`);
        const legacy=picker.querySelector('[data-choice-legacy]');if(legacy)legacy.hidden=true;
        const EventClass=doc.defaultView?.Event||Event;output.dispatchEvent(new EventClass('input',{bubbles:true}));onChange({picker,kind,value});
    };
    const click=event=>{
        const picker=find(event.target);if(!picker||!root.contains(picker))return;
        const trigger=event.target.closest('[data-choice-trigger]'),option=event.target.closest('[data-choice-option]');
        if(trigger){if(picker.querySelector('[data-choice-list]').hidden)open(picker);else close(picker,true);}
        else if(option)choose(picker,option);
    };
    const keydown=event=>{
        const picker=find(event.target);if(!picker||!root.contains(picker))return;
        const trigger=event.target.closest('[data-choice-trigger]'),option=event.target.closest('[data-choice-option]');
        if(event.key==='Escape'){if(!picker.querySelector('[data-choice-list]').hidden){event.preventDefault();close(picker,true);}return;}
        // Keep the native Tab/Shift+Tab order anchored to the dropdown trigger,
        // rather than a now-hidden option with tabindex=-1.
        if(event.key==='Tab'){close(picker,true);return;}
        if(trigger&&['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){event.preventDefault();if(!picker.querySelector('[data-choice-list]').hidden&&['Enter',' '].includes(event.key))close(picker,true);else open(picker,event.key==='ArrowUp');return;}
        if(!option)return;
        const options=[...picker.querySelectorAll('[data-choice-option]')],index=options.indexOf(option);
        if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();options[event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();}
        else if(['Enter',' '].includes(event.key)){event.preventDefault();choose(picker,option);}
    };
    const outside=event=>{for(const picker of pickers())if(!picker.contains(event.target))close(picker);};
    const focusout=event=>{const picker=find(event.target);if(picker)queueMicrotask(()=>{if(!picker.contains(doc.activeElement))close(picker);});};
    root.addEventListener('click',click);root.addEventListener('keydown',keydown);root.addEventListener('focusout',focusout);doc.addEventListener('pointerdown',outside);
    return {dispose(){root.removeEventListener('click',click);root.removeEventListener('keydown',keydown);root.removeEventListener('focusout',focusout);doc.removeEventListener('pointerdown',outside);}};
}
