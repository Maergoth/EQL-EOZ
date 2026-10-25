import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {zoneCreationFields,zoneCreationMarkup,ZONE_CREATION_FIELD_KEYS} from '../app/zone-creation-view.js';

const dom=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
const previous={FormData:globalThis.FormData,document:globalThis.document,window:globalThis.window};Object.assign(globalThis,{FormData:dom.window.FormData,document:dom.window.document,window:dom.window});
const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)},document=dom.window.document;
const pack={meta:{sample:false,wikiEntitiesComplete:true},items:[],npcs:[],zones:[{name:'Synthetic Existing Vale'}],wikiEntities:{items:[],npcs:[],zones:['Synthetic Existing Vale'],titles:['Synthetic Existing Vale']}},queue=createContributionQueue({storage,getPack:()=>pack});
const first=queue.add({kind:'zone',name:'Synthetic New Vale',instance:'raid'},true),second=queue.add({kind:'zone',name:'Synthetic Other Vale'},true),existing=queue.add({kind:'zone',name:'Synthetic Existing Vale',fields:{whoName:'Existing Vale'}},true);queue.update(existing.id,{intent:'update'});
const requests=[],wiki={status:async()=>({authenticated:true,user:{id:7,name:'Synthetic contributor'},canEdit:true}),blueprints:async()=>({eras:['Classic Era']}),onStatus:()=>()=>{},preparePlan:async request=>{requests.push(structuredClone(request));return{id:'synthetic-zone-plan',reviewDigest:'synthetic-digest',status:'prepared',expectedUser:{name:'Synthetic contributor'},blueprintRevision:1,blockers:[],warnings:[],pages:[{id:'zone',title:request.candidate.title,operation:'create',status:'pending',beforeText:'',afterText:'Synthetic reviewed zone'}]};}};
const view=mountCaptureWorkspace({document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,share:null,inventory:null,getPack:()=>pack});
const tick=()=>new Promise(resolve=>setImmediate(resolve)),field=key=>document.querySelector(`[data-field-key="${key}"] [data-field-value]`),saved=()=>JSON.parse(data.get('eql-eye-of-zomm-contributions-v1')).candidates.find(candidate=>candidate.id===first.id);
const change=(input,value)=>{assert(input);input.value=value;input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
try{
    view.refresh();await tick();
    const form=document.querySelector('[data-candidate-form]');assert.equal(form.dataset.newZone,'true');assert.equal(form.elements.zone.type,'hidden');assert(form.elements.raid.hidden);assert.equal(form.elements.raid.checked,false);
    assert.equal(field('raidAvailability').required,true);assert.equal(field('raidAvailability').value,'');assert.equal(form.checkValidity(),false,'A new zone requires an explicit raid answer');
    for(const key of ZONE_CREATION_FIELD_KEYS)assert.equal(form.querySelectorAll(`[data-field-key="${key}"]`).length,1,key+' has one editor');
    assert.equal(document.querySelector('[data-zone-raid-details]').hidden,true);
    change(form.elements.playerText,'A normal zone overview.');
    for(const [key,value]of Object.entries({levelRange:'20–35',minPlayerLevel:'20',monsterTypes:'Undead, elementals',notableNPCs:'A named guardian\nThe ancient keeper',relatedQuests:'A quest, with a comma\nAnother quest',adjacentZones:'Synthetic Neighbor',whoName:'The Synthetic Vale',respawnTime:'20 minutes',succor:'-60, 325, 120',zem:'100',mapFilename:'syntheticvale',mapNotes:'Enter through the western gate.',knownNPCs:'A wandering guard'}))change(field(key),value);
    change(field('raidAvailability'),'yes');assert.equal(document.querySelector('[data-zone-raid-details]').hidden,false);assert(form.checkValidity());
    for(const [key,value]of Object.entries({raidOverview:'A separate raid overview.',raidLevelRange:'50–60',raidMinPlayerLevel:'46',raidMonsterTypes:'Dragons',raidNotableNPCs:'The raid keeper',raidRelatedQuests:'A raid quest, with punctuation',raidAdjacentZones:'Synthetic Raid Entrance',raidWhoName:'Synthetic Vale: Raid',raidRespawnTime:'3 days',raidSuccor:'1, 2, 3',raidZem:'150',raidMapFilename:'syntheticraid',raidMapNotes:'The raid portal is on the upper floor.'}))change(field(key),value);
    document.querySelector('[data-candidate-form]').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();
    assert.equal(requests.length,1);const outgoing=requests[0].candidate;
    assert.equal(outgoing.instance,'normal','Raid availability does not make the new page a raid-scoped NPC contribution');assert.equal(outgoing.playerText,'A normal zone overview.');
    assert.deepEqual(outgoing.fields.relatedQuests.value,['A quest, with a comma','Another quest'],'Wiki title commas survive list editing');assert.deepEqual(outgoing.fields.raidRelatedQuests.value,['A raid quest, with punctuation']);
    assert.deepEqual(outgoing.fields.notableNPCs.value,['A named guardian','The ancient keeper']);assert.deepEqual(outgoing.fields.knownNPCs.value,['A wandering guard'],'Ordinary population stays separate from explicit notable encounters');
    for(const key of ZONE_CREATION_FIELD_KEYS)assert.equal(outgoing.fields[key].confirmed,true,key+' is included in the reviewed form');
    assert.equal(outgoing.fields.minPlayerLevel.value,20);assert.equal(outgoing.fields.raidZem.value,150);
    for(const answer of ['no','unknown','yes']){
        change(field('raidAvailability'),answer);assert.equal(document.querySelector('[data-zone-raid-details]').hidden,answer!=='yes');assert(document.querySelector('[data-candidate-form]').checkValidity());
        assert.equal(saved().fields.raidOverview.value,'A separate raid overview.');assert.deepEqual(saved().fields.raidNotableNPCs.value,['The raid keeper']);
        view.openContribution(second.id);view.openContribution(first.id);
        assert.equal(field('raidAvailability').value,answer);assert.equal(field('raidMapNotes').value,'The raid portal is on the upper floor.');assert.equal(document.querySelector('[data-zone-raid-details]').hidden,answer!=='yes','Reopening respects the saved choice');
    }
    view.openContribution(existing.id);assert.equal(document.querySelector('[data-zone-creation]'),null,'Existing-zone updates retain their existing editor');assert.equal(document.querySelector('[data-candidate-form]').dataset.newZone,undefined);
    const hostile=zoneCreationMarkup({playerText:'</textarea><script>bad()</script>',fields:{}},zoneCreationFields({raidOverview:{value:'<img src=x onerror="bad()">'},notableNPCs:{value:['A <Guardian>']}}));assert.doesNotMatch(hostile,/<script>|<img|<Guardian>/);assert.match(hostile,/&lt;script&gt;/);
    console.log('Zone creation UI: explicit Yes/No/Unknown, normal and raid details, comma-safe title lists, confirmed preview payload, draft persistence, hidden raid retention and unchanged existing-zone updates passed.');
}finally{view.dispose();Object.assign(globalThis,previous);dom.window.close();}
