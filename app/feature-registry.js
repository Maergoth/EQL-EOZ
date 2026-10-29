// Availability is separate from consent and saved feature data. Adding a feature
// here supplies one stable identity to Settings, native policy and navigation.
export const FEATURE_CATALOG = Object.freeze([
    {id:'map',label:'Live Map',description:'3D maps, minimap, routes and map file reading.',views:['map'],panels:['map']},
    {id:'npcIntel',label:'NPC intelligence',description:'NPC browsing, live target intelligence and the Intel overlay.',views:['npcs'],panels:['intel']},
    {id:'items',label:'Item browser',description:'Browse and compare cached wiki items.',views:['items'],panels:[]},
    {id:'drops',label:'Drop history',description:'Record and display this session’s personal loot history.',views:['drops'],panels:[]},
    {id:'combat',label:'Combat parsing',description:'Damage, healing, encounters and the Parse overlay.',views:['combat'],panels:['parse']},
    {id:'triggers',label:'Triggers and timers',description:'Log triggers, countdowns, alerts and the Timers overlay.',views:['timers'],panels:['timers']},
    {id:'contributions',label:'Wiki contributions',description:'Discoveries, contribution drafts and automatic or reviewed wiki publishing.',views:['contribute'],panels:[]},
    {id:'character',label:'Character',description:'Private inventories, Character statistics and sharing.',views:['character'],panels:[]},
    {id:'overlays',label:'Overlay windows',description:'All independent native overlay windows.',views:[],panels:[]},
    {id:'screenReading',label:'Screen reading',description:'Allow the separate Screen Reading consent control to enable local OCR.',views:[],panels:[]},
    {id:'dropObservations',label:'Drop observations',description:'Allow the separate collection preference to collect and sync observations.',views:[],panels:[]}
].map(value=>Object.freeze({...value,views:Object.freeze(value.views),panels:Object.freeze(value.panels)})));
export const FEATURE_IDS = Object.freeze(FEATURE_CATALOG.map(feature=>feature.id));
export function normalizeFeatures(value){return Object.fromEntries(FEATURE_IDS.map(id=>[id,value?.[id]!==false]));}
export function validateFeaturePatch(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).length||Object.keys(value).some(id=>!FEATURE_IDS.includes(id)||typeof value[id]!=='boolean'))throw Error('Choose a valid feature setting.');
    return {...value};
}
export function featureForView(view){return FEATURE_CATALOG.find(feature=>feature.views.includes(view))?.id||null;}
export function featureForPanel(panel){return FEATURE_CATALOG.find(feature=>feature.panels.includes(panel))?.id||null;}
export function featureEnabled(features,id){return !id||FEATURE_IDS.includes(id)&&normalizeFeatures(features)[id]!==false;}
export function featurePanelEnabled(features,panel){const id=featureForPanel(panel);return Boolean(id)&&featureEnabled(features,'overlays')&&featureEnabled(features,id);}
