import assert from 'node:assert/strict';
import {EQLogParser} from '../app/parser.js';
import {DotCastOrder} from '../app/dot-cast-order.js';
import {compactParseSnapshot} from '../app/overlay-session.js';
import {logContributionObservation} from '../app/contribution-evidence.js';
const at=Date.parse('2026-10-25T12:00:00Z');
const make=()=>{const parser=new EQLogParser();parser.setCharacterFromFilename('eqlog_Synthetic_example.txt');return parser;};
const add=(parser,second,body,options)=>parser.parse(`[${new Date(at+second*1000).toISOString()}] ${body}`,options);
const cast=(parser,second,actor,spell='Synthetic Rot')=>add(parser,second,`${actor} ${actor==='You'?'begin':'begins'} casting ${spell}.`);
const tick=(parser,second,target,amount=10,spell='Synthetic Rot')=>add(parser,second,target==='You'?`You have taken ${amount} damage from ${spell}.`:`${target} has taken ${amount} damage by ${spell}.`);
const named=(parser,second,target,actor,amount=10,spell='Synthetic Rot')=>add(parser,second,`${target} has taken ${amount} damage from ${spell} by ${actor}.`);
const row=(parser,name)=>parser.snapshot().combatants.find(value=>value.name===name);
{
    const parser=make();cast(parser,0,'Alpha');cast(parser,0,'Beta');
    assert.deepEqual(parser.snapshot().combatants,[]);assert.deepEqual(parser.snapshot().observed,[]);assert.equal(parser.snapshot().encounters.length,0,'Starts alone never invent combatants, NPCs or encounters');
    const first=tick(parser,2,'a synthetic north target'),second=tick(parser,3,'a synthetic south target');
    assert.equal(first.actor,'Alpha');assert.equal(second.actor,'Beta');assert.equal(first.actorAttribution,'cast-order');
    assert(first.attributionCastOrder<second.attributionCastOrder,'Equal-second timestamps retain stable log order');
    assert.equal(tick(parser,4,'a synthetic north target',5).actor,'Alpha');assert.equal(tick(parser,5,'a synthetic south target',7).actor,'Beta');
    assert.equal(row(parser,'Alpha').damage,15);assert.equal(row(parser,'Beta').damage,17);assert.equal(parser.totalDamage,0);
    assert.equal(parser.snapshot().combatants.reduce((sum,value)=>sum+value.damage,0),parser.snapshot().combatants.reduce((sum,value)=>sum+value.taken,0));
}
{
    const parser=make();cast(parser,0,'You');cast(parser,1,"Ally's pet");
    const own=tick(parser,2,'a synthetic north target',8),pet=tick(parser,3,'a synthetic south target',9);
    assert.equal(own.type,'damage');assert.equal(own.actorAttribution,'cast-order');assert.equal(pet.actor,"Ally's pet");assert.equal(parser.totalDamage,8);
    assert.deepEqual(parser.snapshot().observed,[],'An inferred own DoT cannot create wiki/NPC observations via noteDamage');
    assert.equal(logContributionObservation(own,{live:true,at:own.at,cursor:1,logId:'synthetic'}),null);
    const compact=compactParseSnapshot(parser.snapshot()),retained=compact.recentEvents.find(event=>event.actorAttribution==='cast-order');
    assert.equal(retained.attributionCastAt,at+1000);assert(Number.isFinite(retained.attributionCastOrder),'Native transport retains bounded inference provenance');
    assert.equal(row(parser,"Ally's pet").damage,9);assert(!row(parser,'Ally'),'Pets are not merged into player owners');
}
{
    const parser=make();cast(parser,0,'Alpha');cast(parser,1,'Beta');
    assert.equal(tick(parser,2,'a synthetic target').actor,'Alpha');
    assert.equal(tick(parser,3,'a synthetic target').actorKnown,false,'A new possible caster and an old repeated tick cannot be resolved by round-robin');
    const explicit=named(parser,4,'a synthetic target','Beta');assert.equal(explicit.actor,'Beta');assert.equal(explicit.actorAttribution,undefined,'A named caster is always authoritative');
    assert.equal(tick(parser,5,'a synthetic target').actorKnown,false,'Two observed owners keep following unnamed same-target ticks ambiguous');
    assert.equal(tick(parser,21,'a synthetic target').actorKnown,false,'After the inactivity gap an old pairing cannot be revived');
    assert.equal(row(parser,'Alpha').damage,10);assert.equal(row(parser,'Beta').damage,10);assert.equal(row(parser,'Unknown attacker').damage,30);
}
{
    const failed=make();cast(failed,0,'Alpha');tick(failed,1,'a synthetic north target');cast(failed,2,'Beta');
    assert.equal(tick(failed,3,'a synthetic north target').actorKnown,false);
    add(failed,4,'Beta spell is interrupted.');assert.equal(tick(failed,5,'a synthetic north target').actor,'Alpha','A confirmed competing cast failure resolves its live blocker');
    const separate=make();cast(separate,0,'Alpha');tick(separate,1,'a synthetic north target');cast(separate,2,'Beta');
    assert.equal(tick(separate,3,'a synthetic north target').actorKnown,false);
    assert.equal(tick(separate,4,'a synthetic south target').actor,'Beta');assert.equal(tick(separate,5,'a synthetic north target').actor,'Alpha','Binding the competing start to another recipient resolves its former uncertainty');
    const quoted=make();add(quoted,0,"Witness says, 'Alpha begins casting Synthetic Rot.'");assert.equal(tick(quoted,1,'a synthetic target').actorKnown,false,'Quoted cast starts cannot establish ownership');
}
{
    const parser=make();cast(parser,0,'Alpha');cast(parser,1,'Beta');named(parser,2,'a synthetic south target','Beta');
    assert.equal(tick(parser,3,'a synthetic north target').actor,'Alpha','An explicit Beta tick consumes Beta’s matching start without stealing earlier Alpha');
    assert.equal(tick(parser,4,'a synthetic south target').actor,'Beta');
    cast(parser,5,'Alpha');assert.equal(tick(parser,6,'a synthetic north target').actor,'Alpha','A same-caster refresh keeps one owner');
    const prior=make();named(prior,0,'a synthetic target','Alpha');
    const inferred=tick(prior,1,'a synthetic target');assert.equal(inferred.actor,'Alpha');assert.equal(inferred.actorAttribution,'prior-explicit-tick');assert.equal(inferred.attributionCastAt,undefined);
}
{
    const parser=make();cast(parser,0,'Alpha','Synthetic Rot III');assert.equal(tick(parser,1,'a synthetic target').actorKnown,false,'Spell ranks cannot be conflated');
    assert.equal(tick(parser,2,'a synthetic target',10,'Synthetic Rot III').actor,'Alpha');
    const expired=make();cast(expired,0,'Alpha');assert.equal(tick(expired,31,'a synthetic target').actorKnown,false,'Pending starts expire after thirty seconds');
    const active=make();cast(active,0,'Alpha');tick(active,1,'a synthetic target');assert.equal(tick(active,17,'a synthetic target').actorKnown,false,'Active pairing uses the configured inactivity gap, not invented spell duration');
}
for(const failure of ['Alpha spell is interrupted.',"Alpha can't cast spells while stunned!",'Alpha tries to cast a spell on a synthetic target, but a synthetic target are protected.']){
    const parser=make();cast(parser,0,'Alpha');assert.equal(add(parser,1,failure).type,'combatant-cast-failed');assert.equal(tick(parser,2,'a synthetic target').actorKnown,false,failure);
}
for(const failure of ['Your spell is interrupted.','a synthetic target resisted your Synthetic Rot.','Your target is too far away, get closer!','Your target is out of range, get closer!','You cannot see your target.']){
    const parser=make();cast(parser,0,'You');assert.equal(add(parser,1,failure).type,'cast-interrupt');assert.equal(tick(parser,2,'a synthetic target').actorKnown,false,failure);assert.equal(parser.totalDamage,0);
}
{
    const parser=make();cast(parser,0,'Alpha');tick(parser,1,'a synthetic target');cast(parser,2,'Alpha');add(parser,3,'Alpha spell is interrupted.');
    assert.equal(tick(parser,4,'a synthetic target').actor,'Alpha','A failed refresh does not remove the existing active effect');
    const own=make();cast(own,0,'You');tick(own,1,'a synthetic target');add(own,2,'Your Synthetic Rot spell has worn off of a synthetic target.');assert.equal(tick(own,3,'a synthetic target').actorKnown,false);
    const notFailure=make();cast(notFailure,0,'Alpha');add(notFailure,1,"Witness says, 'Alpha spell is interrupted.'");assert.equal(tick(notFailure,2,'a synthetic target').actor,'Alpha','Quoted failures cannot cancel real pending starts');
}
{
    const parser=make();cast(parser,0,'Alpha');tick(parser,1,'a synthetic target');cast(parser,2,'Beta');add(parser,3,'a synthetic target has been slain by Other!');
    assert.equal(tick(parser,4,'a synthetic target').actorKnown,false,'Target death clears its pairing and unbound pre-death starts before a replacement can reuse the name');
    const casterDeath=make();cast(casterDeath,0,'Alpha');tick(casterDeath,1,'a synthetic target');add(casterDeath,2,'Alpha has been slain by Other!');assert.equal(tick(casterDeath,3,'a synthetic target').actor,'Alpha','An established DoT may outlive its caster');
    for(const death of ['You have been slain by a synthetic guard!','You died.']){const incoming=make();cast(incoming,0,'Alpha');assert.equal(tick(incoming,1,'You').attacker,'Alpha');add(incoming,2,death);assert.equal(tick(incoming,3,'You').attackerKnown,false,death);}
}
for(const change of ['source','zone','session','gap','historical']){
    const parser=make();cast(parser,0,'Alpha');tick(parser,1,'a synthetic target');
    if(change==='source')parser.setCharacterFromFilename('eqlog_Second_example.txt');
    else if(change==='zone')add(parser,2,'You have entered A Synthetic Zone.');
    else if(change==='session')parser.startNewSession(at+2000);
    else if(change==='gap')parser.setEncounterGapSeconds(30);
    else{parser.startNewSession(at+2000);add(parser,2,'Alpha begins casting Synthetic Rot.',{recordSession:false});}
    assert.equal(tick(parser,3,'a synthetic target').actorKnown,false,change+' cannot retain prior inference');
}
{
    const context=(at=0)=>({context:'source-one/visit-one',at,gapMs:15000}),bounded=new DotCastOrder({maxPending:2,maxEffects:1});
    bounded.start('Alpha','Rot',context());bounded.start('Beta','Rot',context());bounded.start('Gamma','Rot',context());
    assert.equal(bounded.pending.length,0);assert.equal(bounded.resolve('Target','Rot',context(1)),null,'Overflow drops inference instead of assigning the next surviving caster');
    bounded.start('Gamma','Rot',context(30001));assert.equal(bounded.resolve('Target','Rot',context(30002)).actor,'Gamma');
    bounded.named('Alpha','Other target','Rot',context(30003));assert.equal(bounded.effects.size,0);assert.equal(bounded.resolve('Target','Rot',context(30004)),null,'Active context overflow is bounded and conservative');
    const backward=new DotCastOrder();backward.start('Alpha','Rot',context(100));assert.equal(backward.resolve('Target','Rot',context(99)),null,'Backward log time cannot reuse a future start');
}
{
    const options=at=>({context:'source-one/visit-one',at,gapMs:60000}),bounded=new DotCastOrder({maxPending:4,maxEffects:4,maxOwners:3});
    bounded.named('Original','Target','Rot',options(0));
    for(let index=1;index<=400;index++){
        const at=index*31000;
        bounded.start('Contender '+index,'Rot',options(at));
        assert.equal(bounded.resolve('Target','Rot',options(at+1)),null);
        const effect=bounded.effects.values().next().value;
        assert(effect.blockers.size<=1,'Expired competing IDs collapse to bounded ambiguity, not a historical ID collection');
        assert.equal(effect.owners.size,1);
    }
    bounded.targetDeath('Other target',options(12400002));
    const effect=bounded.effects.values().next().value;
    assert.equal(effect.blockers.size,0);assert.equal(effect.ambiguous,true,'Retiring unbound starts cannot turn unresolved competition into a proven single caster');
    for(let index=1;index<=100;index++)bounded.named('Explicit '+index,'Target','Rot',options(12400002+index));
    assert.equal(effect.owners.size,3,'Many directly logged owners cannot grow a single binding without limit');
    assert.equal(bounded.resolve('Target','Rot',options(12400103)),null);
    for(const actor of [...effect.owners.keys()])bounded.ended(actor,'Target','Rot',options(12400104));
    assert.equal(bounded.resolve('Target','Rot',options(12400105)),null,'Untracked extra owners stay ambiguous after tracked owners wear off');
}
{
    const parser=make(),prefix='Synthetic '+ 'x'.repeat(180);
    cast(parser,0,'Alpha',prefix+' I');
    assert.equal(tick(parser,1,'a synthetic target',10,prefix+' II').actorKnown,false,'Overlong common prefixes cannot become a false exact ability match');
    assert.equal(parser.dotCasts.pending.length,0,'Oversize identities are rejected rather than silently truncated');
    named(parser,2,'a synthetic target','Alpha',10,prefix+' I');
    assert.equal(tick(parser,3,'a synthetic target',10,prefix+' I').actorKnown,false,'An overlong named ability cannot seed a truncated binding');
    const sameZone=make();add(sameZone,0,'You have entered A Synthetic Zone.');cast(sameZone,1,'Alpha');tick(sameZone,2,'a synthetic target');
    add(sameZone,3,'You have entered A Synthetic Zone.');assert.equal(tick(sameZone,4,'a synthetic target').actorKnown,false,'A new visit to the same zone retires old bindings');
}
console.log('DoT cast-order assumption: stable FIFO, distinct targets, repeated bindings, explicit overrides, ambiguous overlaps, exact ranks, provenance, failures, death/source/zone/session/expiry/overflow guards and no wiki observations passed.');
