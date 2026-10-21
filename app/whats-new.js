// This walkthrough opens only from the user's What's new action. Screenshots
// are captures of the current app with synthetic data, bundled with the app.
export const WHATS_NEW_STEPS = Object.freeze([
    Object.freeze({title:'A normal desktop workspace',image:'workspace',view:'settings',action:'Open Settings',
        copy:'The main app remembers its size, position and maximized state in a standard Windows frame. Choose Minimize to tray and Start minimized in Settings. A green Update available button appears for newer releases. Download, then choose Restart to install update for a silent upgrade and automatic relaunch. Settings also links to GitHub.',
        alt:'Eye of Zomm main workspace showing the current desktop layout and settings.',caption:'Current app capture with a disposable demonstration profile.'}),
    Object.freeze({title:'Keep the map in view',image:'map',view:'map',action:'Open Map',
        copy:'Hover the zone-title row to reveal Reset, Follow, zoom and the Map, Top and navigable First person cycle beside its name. Use the separate grip to move an unlocked window. Z and tolerance choose nearby floors; unknown-height markers stay visible. Monster names are interactive.',
        alt:'Eye of Zomm native Map with its horizontal Z slice slider and nearby-floor controls.',caption:'The current native Map and its controls, using demonstration data.'}),
    Object.freeze({title:'Follow named mobs and their loot',image:'intel',view:'npcs',action:'Open NPCs',
        copy:'Item Level Slider and My Class stay above the scrolling list. Raid Zone comes first, with separate drops. Hover or focus a mob name for actions; its Map button previews that source in first person. Show More expands every matching drop.',
        alt:'Eye of Zomm zone intel showing named mobs, distinct raid sources and matching loot.',caption:'Synthetic NPC and loot records demonstrate the current intel view.'}),
    Object.freeze({title:'Bring only the overlays you need',image:'timers',view:'timers',action:'Open Timers',
        copy:'Parse, Map, Zone & loot and Timers are separate desktop windows. Unlock panels to move them and resize supported panels; Timers fits its rows automatically. Set countdowns and log triggers on the main Timers page; the swing bar learns your own attacks.',
        alt:'Eye of Zomm main Timers page with a log-trigger editor, match preview and named captures.',caption:'The current timer editor with a synthetic log line and named-capture preview.'})
]);

export function whatsNewStep(index) {
    const position=Number.isFinite(index)?Math.max(0,Math.min(WHATS_NEW_STEPS.length-1,Math.trunc(index))):0;
    return {...WHATS_NEW_STEPS[position],index:position,count:WHATS_NEW_STEPS.length};
}

export function mountWhatsNew({document=globalThis.document,button,navigate=()=>{},target=document?.body}={}) {
    if(!target)return {open(){},close(){},dispose(){}};
    const dialog=document.createElement('dialog');
    dialog.className='whats-new-dialog';
    dialog.setAttribute('aria-labelledby','whats-new-title');dialog.setAttribute('aria-describedby','whats-new-copy');
    dialog.innerHTML=`<div class="whats-new-heading"><span class="eyebrow">What's new</span><button type="button" class="text-button" data-tour-close aria-label="Close walkthrough">Close ×</button></div><h2 id="whats-new-title"></h2><p id="whats-new-copy"></p><figure class="whats-new-figure"><img data-tour-image width="1280" height="800"><figcaption data-tour-caption></figcaption></figure><footer class="whats-new-footer"><span data-tour-count role="status" aria-live="polite"></span><div class="whats-new-actions"><button type="button" class="secondary-button" data-tour-previous>Previous</button><button type="button" class="secondary-button" data-tour-feature></button><button type="button" class="primary-button" data-tour-next>Next</button></div></footer>`;
    target.appendChild(dialog);
    const $=selector=>dialog.querySelector(selector),listeners=[];
    let index=0,disposed=false;
    const listen=(element,event,handler)=>{element?.addEventListener(event,handler);listeners.push(()=>element?.removeEventListener(event,handler));};
    function render(){
        const step=whatsNewStep(index);index=step.index;
        $('#whats-new-title').textContent=step.title;$('#whats-new-copy').textContent=step.copy;
        $('[data-tour-image]').src=`./assets/whats-new/${step.image}.png`;
        $('[data-tour-image]').alt=step.alt;$('[data-tour-image]').hidden=false;
        $('[data-tour-caption]').textContent=step.caption;
        $('[data-tour-count]').textContent=`${index+1} of ${step.count}`;
        $('[data-tour-previous]').disabled=index===0;
        $('[data-tour-next]').textContent=index===step.count-1?'Done':'Next';
        $('[data-tour-feature]').textContent=step.action;
    }
    function close(){if(disposed)return;if(typeof dialog.close==='function'&&dialog.open)dialog.close();else dialog.removeAttribute('open');button?.focus?.();}
    function open(){if(disposed)return;index=0;render();if(!dialog.open){if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');}$('[data-tour-next]').focus();}
    listen(button,'click',open);listen($('[data-tour-close]'),'click',close);
    listen(dialog,'cancel',event=>{event.preventDefault();close();});
    listen($('[data-tour-next]'),'click',()=>{if(index===WHATS_NEW_STEPS.length-1)close();else{index++;render();}});
    listen($('[data-tour-previous]'),'click',()=>{index--;render();if(index===0)$('[data-tour-next]').focus();});
    listen($('[data-tour-feature]'),'click',()=>{const view=whatsNewStep(index).view;close();navigate(view);});
    listen($('[data-tour-image]'),'error',()=>{$('[data-tour-image]').hidden=true;$('[data-tour-caption]').textContent='Screenshot unavailable in this build. You can still open the feature below.';});
    return {open,close,dispose(){if(disposed)return;close();disposed=true;listeners.forEach(remove=>remove());dialog.remove();}};
}
