import assert from 'node:assert/strict';
import {createContributionQueue} from '../app/contribution-queue.js';
import {createItemBaseReview,applyItemBaseReview} from '../app/item-base-review.js';
let clock=Date.UTC(2026,9,24,15);
const options={now:()=>clock,storage:{getItem:()=>null,setItem(){}},getPack:()=>({meta:{wikiEntitiesComplete:true},wikiEntities:{items:[],npcs:[],titles:[]}})};
function fixture(){const q=createContributionQueue(options),candidate=q.add({kind:'item',name:'Synthetic Base Mantle',fields:{tier:4,fraction:0,hp:42,str:9}}),review=createItemBaseReview(candidate,{tier:4,fraction:0,choices:{HP:30,STR:5},reviewed:true,modifiersExcluded:true}),patch=applyItemBaseReview(candidate,review);q.update(candidate.id,{...patch,fields:{...patch.fields,statLines:{...patch.fields.statLines,confirmed:true}}});return {q,id:candidate.id};}
const observation=(fields={},overrides={})=>({id:'current-base',kind:'ocr',owner:'contribution',capturedAt:new Date(clock).toISOString(),subject:{kind:'item',name:'Synthetic Base Mantle +0'},input:{generation:2},fields:Object.entries({tier:0,hp:30,str:5,...fields}).map(([key,value])=>({key,value})),...overrides});
for(const [name,fields,override,reason]of [
    ['conflicting numeric',{hp:31},{},/disagree/],['partial numeric',{str:null},{},/not visible/],
    ['known modifier',{modified:true},{},/known augment/],['known occupied socket',{augmentNames:['Synthetic Rune']},{},/known augment/],
    ['stale',{}, {capturedAt:new Date(clock-600001).toISOString()},/Read a current/],
    ['future',{}, {capturedAt:new Date(clock+2001).toISOString()},/Read a current/],
    ['log metadata',{}, {kind:'game-log'},/Read a current/],['different item',{}, {subject:{kind:'item',name:'Other Mantle'}},/Read a current/]
]){const {q,id}=fixture();q.consume(observation(fields,override));const preview=q.tierZeroReview(id);assert.equal(preview.ok,false,name);assert.match(preview.reason,reason,name);assert.throws(()=>q.confirmTierZero(id,{reviewed:true,modifiersExcluded:true}),undefined,name);assert(q.snapshot().find(candidate=>candidate.id===id).baseRecovery,'Rejected verification preserves the inference');}
for(const mutate of [candidate=>({title:'A changed title'}),candidate=>({fields:{...candidate.fields,hp:{value:44}}}),candidate=>({fields:{...candidate.fields,statLines:{value:['HP: 999'],edited:true}}}),candidate=>({baseRecovery:{...candidate.baseRecovery,choices:{HP:29,STR:5}}})]){
    const {q,id}=fixture();q.consume(observation());q.update(id,mutate(q.snapshot().find(candidate=>candidate.id===id)));assert.equal(q.tierZeroReview(id).ok,false,'Changing identity, source stats, outgoing text or inference invalidates confirmation');assert.throws(()=>q.confirmTierZero(id,{reviewed:true,modifiersExcluded:true}));
}
{const {q,id}=fixture();q.consume(observation());const candidate=q.snapshot().find(candidate=>candidate.id===id);q.update(id,{fields:{...candidate.fields,statLines:{...candidate.fields.statLines,confirmed:true}}});assert(q.tierZeroReview(id).ok,'Review acknowledgement alone does not alter the observed text');clock+=600001;assert.equal(q.tierZeroReview(id).ok,false);clock-=600001;}
{const {q,id}=fixture();q.consume(observation());const before=q.snapshot().find(candidate=>candidate.id===id);const after=q.confirmTierZero(id,{reviewed:true,modifiersExcluded:true,evidenceId:'current-base'});assert.deepEqual(after.fields.statLines,before.fields.statLines);assert.equal(after.baseVerification.observed.HP,30);assert.equal(after.baseRecoveryHistory.length,1);assert.equal(after.baseRecoveryHistory[0].tier,4);assert.equal(after.baseRecovery,null);}
console.log('Tier-zero transition: real current evidence, partial/conflicting/modifier refusal, source/text/identity guards and explicit preserved inference history passed.');
