import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountItemBaseReview} from '../app/item-base-review-ui.js';
import {ITEM_CONTRIBUTION_STATS,itemContributionStatSource} from '../app/item-contribution-stats.js';
import {buildContributionDraft} from '../app/contribution-model.js';
import {validateItemBaseReview} from '../app/item-base-review.js';
import {contributionFieldMarkup} from '../app/contribution-editor.js';
import {mountCaptureWorkspace} from '../app/capture-workspace.js';
import {createContributionQueue} from '../app/contribution-queue.js';

const dom=new JSDOM('<main></main>'),document=dom.window.document,host=document.querySelector('main');
const wrap=value=>({value,confirmed:false}),blueprints={entries:{item:{text:'{{Itempage|statsblock=}}'}}};
let candidate,widget;
const mount=fields=>{widget?.dispose();candidate={kind:'item',name:'Synthetic Form Relic',title:'Synthetic Form Relic',fields,...fields.candidate};delete candidate.fields.candidate;widget=mountItemBaseReview({host,getCandidate:()=>candidate,onChange:patch=>candidate={...candidate,...patch}});};
const input=field=>host.querySelector(`[data-item-stat-field="${field}"]`);
const edit=(field,value)=>{input(field).value=String(value);input(field).dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
const review=()=>{candidate={...candidate,...widget.readPatch(candidate,{reviewed:true})};return buildContributionDraft(candidate,blueprints);};
try{
 mount({tier:wrap(0)});
 assert.equal(host.querySelectorAll('[data-base-tier]').length,1);assert.equal(host.querySelectorAll('textarea,table').length,0);
 assert.equal(new Set([...host.querySelectorAll('[data-item-stat-field]')].map(node=>node.dataset.itemStatField)).size,ITEM_CONTRIBUTION_STATS.length);
 assert([...host.querySelectorAll('[data-item-stat-field]')].every(node=>node.value===''),'All missing stat fields start blank, including Void');
 let draft=review();assert.doesNotMatch(draft.text,/SV Void:|HP:|AC:/);assert.equal(Object.hasOwn(candidate.fields,'resistCorruption'),false);
 edit('hp','12');edit('str','0');edit('resistFire','-5');edit('resistCorruption','0');draft=review();
 for(const line of ['HP: 12','STR: 0','SV Fire: -5','SV Void: 0'])assert(draft.text.includes(line));
 assert.equal(candidate.fields.tier.edited,false,'Editing a stat never claims the OCR tier was manually edited');
 edit('hp','');draft=review();assert.doesNotMatch(draft.text,/HP:/);assert.equal(candidate.fields.hp.value,null);assert(candidate.fields.hp.edited,'Explicit blanks remain protected from later OCR');

 mount({tier:wrap(0),hp:wrap(5),statLines:{value:['HP: 19','Weight: 0.7','STR: 0','A saved note.','Custom flourish: silver'],confirmed:true,edited:true}});
 assert.equal(input('hp').value,'19');assert.equal(input('weight').value,'0.7');assert.equal(input('str').value,'0');assert.match(host.textContent,/A saved note/);assert.match(host.textContent,/Custom flourish/);
 draft=review();assert.match(draft.text,/HP: 19/);assert.match(draft.text,/A saved note/);assert.match(draft.text,/Custom flourish/);
 const updated={...candidate.fields,hp:wrap(22)};assert.equal(itemContributionStatSource(updated).values.hp,22,'New OCR updates unedited structured fields without a stale serialized-text override');
 edit('hp','25');assert.equal(itemContributionStatSource({...candidate.fields,hp:{...candidate.fields.hp,value:25}}).values.hp,25);

 mount({tier:wrap(0),statsblock:{value:'HP: 7<br>Mana: 0<br>Unrecognized legacy text.',confirmed:true}});
 assert.equal(input('hp').value,'7');assert.equal(input('mana').value,'0');draft=review();assert.match(draft.text,/Unrecognized legacy text/);assert.equal(candidate.fields.statsblock.confirmed,false);
 mount({tier:wrap(0),statLines:{value:['HP: 7','HP: 9','Preserve this.'],confirmed:true,edited:true}});
 draft=review();assert(draft.blockers.length,'Conflicting stored numeric values are not silently discarded');assert(candidate.fields.statLines.value.includes('HP: 9'));
 edit('hp','8');draft=review();assert.deepEqual(draft.blockers,[]);assert.match(draft.text,/HP: 8/);assert.doesNotMatch(draft.text,/HP: 7|HP: 9/);assert.match(draft.text,/Preserve this/);
 const longNotes=Array.from({length:60},(_,index)=>`Retained contributor prose ${index}.`);
 mount({tier:wrap(0),statLines:{value:longNotes,confirmed:true,edited:true}});edit('hp','1');review();assert.deepEqual(itemContributionStatSource(candidate.fields).retained,longNotes,'The bounded outgoing stat block cannot erase retained draft prose');

 mount({tier:wrap(4),hp:wrap(42),weight:wrap(.7),resistCorruption:wrap(4),statLines:wrap(['HP: 42','Weight: 0.7','A ranked note.','Mystic bonus: 7'])});
 assert.equal(input('hp').value,'29');assert.equal(input('weight').value,'');assert.equal(input('resistCorruption').value,'');assert.equal(candidate.fields.hp.value,42);
 assert(candidate.fields.savedItemStatText.value.includes('Mystic bonus: 7'),'Unrecognized numeric prose remains stored as evidence');
 draft=review();assert.deepEqual(draft.blockers,[]);assert.match(draft.text,/HP: 29/);assert.doesNotMatch(draft.text,/HP: 42|Weight: 0.7|SV Void:|Mystic bonus: 7/);assert.match(draft.text,/reverse calculated from a tier 4/);
 edit('hp','31');draft=review();assert(draft.blockers.length);assert.match(host.querySelector('[data-base-status]').textContent,/supported base value/);
 assert.equal(candidate.fields.itemStatDraft.value.values.hp,31,'An invalid correction is preserved as a draft, not lost or posted');
 widget.dispose();widget=mountItemBaseReview({host,getCandidate:()=>candidate,onChange:patch=>candidate={...candidate,...patch}});assert.equal(input('hp').value,'31','Reopening preserves the exact invalid typed value');
 host.querySelector('[data-base-refresh]').click();assert.equal(input('hp').value,'29','Use updated reading deliberately discards the invalid draft and recalculates from current evidence');assert.equal(Object.hasOwn(candidate.fields,'itemStatDraft'),false);assert(validateItemBaseReview(candidate).ok);
 edit('hp','30');edit('resistCorruption','0');draft=review();assert.deepEqual(draft.blockers,[]);assert.match(draft.text,/SV Void: 0/,'A deliberate zero survives ranked review');
 edit('hp','');edit('resistCorruption','');draft=review();assert.deepEqual(draft.blockers,[]);assert.doesNotMatch(draft.text,/HP:|SV Void:/,'Reviewed empty choices omit all numeric observations without publishing them');

 mount({tier:wrap(4),hp:wrap(42)});const saved=structuredClone(candidate);
 widget.dispose();candidate={...saved,fields:{...saved.fields,hp:wrap(43)}};
 widget=mountItemBaseReview({host,getCandidate:()=>candidate,onChange:patch=>candidate={...candidate,...patch}});
 assert.equal(validateItemBaseReview(candidate).ok,false);assert(!host.querySelector('[data-base-refresh]').hidden);review();assert.equal(validateItemBaseReview(candidate).ok,false,'Preview does not silently reauthorize a stale reading');
 host.querySelector('[data-base-refresh]').click();assert(validateItemBaseReview(candidate).ok,'An explicit updated-reading action recalculates and binds the current observation');
 for(const hp of [29,31]){
  mount({tier:wrap(4),hp:wrap(42),statLines:{value:[`HP: ${hp}`,'Keep my note.'],confirmed:true,edited:true}});
  if(hp===29){assert.equal(input('hp').value,'29');assert(validateItemBaseReview(candidate).ok);}
  else{assert(candidate.fields.statLines.value.includes('HP: 31'));assert(buildContributionDraft(candidate,blueprints).blockers.length);}
 }
 for(const key of ['statLines','statsblock','hp','backstabDamage','range','accuracy','savedItemStatText'])assert.equal(contributionFieldMarkup(key,wrap(10),{kind:'item'}),'','No duplicate numeric/freeform editor for '+key);
 assert(contributionFieldMarkup('classes',wrap(['WAR']),{kind:'item'}).includes('data-choice-picker'));
 for(const rank of [0,4]){
  mount({tier:wrap(rank),hp:wrap(rank?42:5)});
  const broken=input('hp');broken.value='';Object.defineProperty(broken,'validity',{configurable:true,value:{badInput:true}});broken.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.deepEqual(candidate.fields.itemStatDraft.value.invalidFields,['hp']);assert(buildContributionDraft(candidate,blueprints).blockers.length);
  candidate=JSON.parse(JSON.stringify(candidate));widget.dispose();widget=mountItemBaseReview({host,getCandidate:()=>candidate,onChange:patch=>candidate={...candidate,...patch}});
  assert.equal(input('hp').value,'','A malformed browser number never restores the older number on reload');assert.equal(input('hp').getAttribute('aria-invalid'),'true');
  draft=review();assert(draft.blockers.length,'The persisted invalid-input sentinel blocks even after browser badInput resets');
  edit('hp','');draft=review();assert.deepEqual(draft.blockers,[]);assert.doesNotMatch(draft.text,/HP:/,'An explicit clear resolves the invalid sentinel as an omission');
 }
 mount({tier:wrap(0),hp:wrap(5)});let brokenTier=host.querySelector('[data-base-tier]');brokenTier.value='';Object.defineProperty(brokenTier,'validity',{configurable:true,value:{badInput:true}});brokenTier.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert(candidate.fields.itemStatDraft.value.invalidTier);candidate=JSON.parse(JSON.stringify(candidate));widget.dispose();widget=mountItemBaseReview({host,getCandidate:()=>candidate,onChange:patch=>candidate={...candidate,...patch}});
 assert.equal(host.querySelector('[data-base-tier]').value,'');assert(review().blockers.length,'An invalid tier cannot become the default zero after reload');
 brokenTier=host.querySelector('[data-base-tier]');brokenTier.value='0';brokenTier.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.deepEqual(review().blockers,[]);
 for(const modifier of [{modified:wrap(true)},{augmented:wrap(true)},{augmentNames:wrap(['Synthetic Rune'])}])for(const field of ['hp','accuracy','avoidance']){
  mount({tier:wrap(0),[field]:wrap(12),...modifier,statLines:wrap(['A saved manual note.'])});draft=review();assert(draft.blockers.length,`${field}: known modifiers cannot become base statistics`);assert.equal(candidate.fields[field].value,12);assert(candidate.fields.statLines.value.includes('A saved manual note.'));assert.match(host.querySelector('[data-base-status]').textContent,/unmodified tier 0 reading/);
 }
 mount({tier:wrap(0),hp:wrap(5),accuracy:wrap(12),augmented:wrap(true)});
 const modifiedBad=input('hp');modifiedBad.value='';Object.defineProperty(modifiedBad,'validity',{value:{badInput:true}});modifiedBad.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.equal(candidate.fields.itemStatDraft.value.reason,'known-modifiers','Malformed input retains the provenance of the other captured numbers');
 candidate=JSON.parse(JSON.stringify({...candidate,fields:{...candidate.fields,hp:wrap(9),accuracy:wrap(15),augmented:wrap(false)}}));widget.dispose();widget=mountItemBaseReview({host,getCandidate:()=>candidate,onChange:patch=>candidate={...candidate,...patch}});
 edit('hp','9');assert(review().blockers.length,'Correcting one invalid field cannot approve another value from an older modified reading');assert.equal(input('accuracy').value,'12');assert(!host.querySelector('[data-base-refresh]').hidden);
 host.querySelector('[data-base-refresh]').click();assert.equal(input('accuracy').value,'15');assert.deepEqual(review().blockers,[]);
 mount({tier:wrap(0),accuracy:wrap(12),augmented:wrap(true)});review();candidate={...candidate,fields:{...candidate.fields,accuracy:wrap(15),augmented:wrap(false)}};widget.dispose();widget=mountItemBaseReview({host,getCandidate:()=>candidate,onChange:patch=>candidate={...candidate,...patch}});
 assert(review().blockers.length,'A later unmodified reading cannot silently approve the preserved modified draft');host.querySelector('[data-base-refresh]').click();assert.equal(input('accuracy').value,'15');draft=review();assert.deepEqual(draft.blockers,[]);assert.match(draft.text,/Accuracy: 15/);
 mount({tier:wrap(0),hp:wrap(5),accuracy:wrap(3),avoidance:wrap(0),augmented:wrap(false)});draft=review();assert.deepEqual(draft.blockers,[]);assert.match(draft.text,/HP: 5/);assert.match(draft.text,/Accuracy: 3/);assert.match(draft.text,/Avoidance: 0/);
 console.log('Structured item form: one grid/tier, blank omission, explicit zero, legacy migration/prose/conflicts, OCR versus manual edits, ranked provenance, unsupported omissions and stale recovery checks passed.');
}finally{widget?.dispose();dom.window.close();}

// Run the actual workspace's save/preview path. The returned structured field
// set is authoritative, including removal of a no-longer-invalid draft key.
const full=new JSDOM('<section class="view is-active"><div id="contribution-workspace"></div></section><div id="character-workspace"></div><div id="capture-settings"></div>',{url:'http://127.0.0.1/',pretendToBeVisual:true});
const previous={document:globalThis.document,window:globalThis.window,FormData:globalThis.FormData};Object.assign(globalThis,{document:full.window.document,window:full.window,FormData:full.window.FormData});
const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},pack={meta:{sample:true},items:[],npcs:[],zones:[]};
const queue=createContributionQueue({storage,getPack:()=>pack}),draft=queue.add({kind:'item',name:'Synthetic Submit Relic',fields:{tier:0,hp:9,races:['ALL']}},true);
queue.update(draft.id,{fields:{...draft.fields,itemStatDraft:{value:{schemaVersion:1,tier:4,values:{hp:31}},edited:true,confirmed:false}}});
let prepared;
const wiki={status:async()=>({authenticated:true,canEdit:true,user:{id:1,name:'Synthetic Editor'}}),blueprints:async()=>({eras:['Classic Era']}),onStatus:()=>()=>{},preparePlan:async input=>{prepared=input.candidate;return{id:'fixture',reviewDigest:'synthetic',status:'prepared',expectedUser:{name:'Synthetic Editor'},pages:[],blockers:buildContributionDraft(input.candidate,blueprints).blockers,warnings:[]};}};
const mountWorkspace=()=>mountCaptureWorkspace({document:full.window.document,storage,characterStorage:storage,contributionStorage:storage,wiki,capture:null,share:null,inventory:null,getPack:()=>pack});
let workspace=mountWorkspace();
try{
 await new Promise(resolve=>setImmediate(resolve));full.window.document.querySelector('[data-candidate-form]').requestSubmit();
 await new Promise(resolve=>setImmediate(resolve));assert(prepared);assert.equal(Object.hasOwn(prepared.fields,'itemStatDraft'),false,'The real save path clears invalid-draft fields removed by the current form');
 assert(prepared.fields.statLines.value.includes('HP: 9'));assert.equal(full.window.document.querySelector('[data-field-key="statLines"]'),null);
 const savedPlan=()=>JSON.parse(memory.get('eql-eye-of-zomm-contributions-v1')).candidates.find(candidate=>candidate.id===draft.id).planId;
 assert.equal(savedPlan(),'fixture');workspace.dispose();workspace=mountWorkspace();await new Promise(resolve=>setImmediate(resolve));workspace.openContribution(draft.id);assert.equal(savedPlan(),'fixture','An unchanged reload with generated Race metadata preserves the exact saved plan');
 const broken=full.window.document.querySelector('[data-item-stat-field="hp"]');broken.value='';Object.defineProperty(broken,'validity',{value:{badInput:true}});broken.dispatchEvent(new full.window.Event('input',{bubbles:true}));
 workspace.dispose();workspace=mountWorkspace();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(full.window.document.querySelector('[data-item-stat-field="hp"]').value,'');prepared=null;full.window.document.querySelector('[data-candidate-form]').requestSubmit();await new Promise(resolve=>setImmediate(resolve));
 assert(prepared);assert(buildContributionDraft(prepared,blueprints).blockers.length);assert(full.window.document.querySelector('[data-publish-plan]').disabled,'The actual remounted workspace cannot publish its old numeric value');
 const corrected=full.window.document.querySelector('[data-item-stat-field="hp"]');corrected.value='0';corrected.dispatchEvent(new full.window.Event('input',{bubbles:true}));
 full.window.document.querySelector('[data-candidate-form]').requestSubmit();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(buildContributionDraft(prepared,blueprints).blockers,[]);assert.match(buildContributionDraft(prepared,blueprints).text,/HP: 0/,'Explicit valid correction resolves the sentinel and preserves zero');
 console.log('Actual item workspace save: structured preview omits deleted stale draft keys and retains the current base value.');
}finally{workspace.dispose();Object.assign(globalThis,previous);full.window.close();}
