import assert from 'node:assert/strict';
import { parseView, renderParseContent, renderIntel, renderConsider, renderItem, durationLabel, timerView, renderTimerRows, escapeHtml } from '../app/overlay.js';
import { overlayControllerPresentation } from '../app/overlay-controller.js';

const event = (type, amount, source = 'Slash') => ({ type, amount, source, victim:'a skeleton' });
const parser = {
    totalDamage:10000, totalHealing:550, sessionDps:500,
    recentEvents:[event('rune',300)],
    encounters:[
        { id:'current', active:true, name:'a skeleton', duration:10, damage:200, events:[event('damage',100),event('damage',100),event('heal',50,'Mend'),event('rune',300)], breakdowns:{ damage:[{name:'Slash',total:200,count:2}], healing:[{name:'Mend',total:50,count:1}], runes:[{name:'Rune capacity',total:300,count:1}] } },
        { id:'old', active:false, name:'a goblin', duration:20, events:[event('damage',80,'Kick')], eventsTruncated:true, breakdowns:{ damage:[{name:'Kick',total:9800,count:500}] } }
    ],
    breakdowns:{ damage:[{name:'Slash',total:200,count:2},{name:'Kick',total:9800,count:500}], healing:[{name:'Mend',total:550,count:11}], runes:[{name:'Rune capacity',total:300,count:1}] }
};
assert.equal(parseView(parser,'live').title,'Live · a skeleton');
assert.equal(parseView(parser,'previous').total,9800,'Historical totals use complete aggregates, beyond the retained feed');
assert.equal(parseView(parser,'session').total,10000);
assert.equal(parseView(parser,'session').rows[0].name,'Kick');
assert.equal(parseView(parser,'session').rows[0].count,500);
assert.equal(parseView(parser,'session').rate,500);
assert.equal(parseView(parser,'session','healing').rate,null,'Do not invent session healing throughput from a bounded encounter list');
assert.equal(parseView({...parser,sessionSeconds:100},'session','healing').rate,5.5);
assert.equal(parseView(parser,'current','healing').total,50);
assert.equal(parseView(parser,'current','runes').total,300);
assert.match(renderParseContent(parseView(parser,'current','runes')),/capacity granted; damage absorbed is not measured/);
assert.doesNotMatch(renderParseContent(parseView(parser,'current','runes')),/300 \/s/,'Rune capacity is not mislabeled as throughput or absorption');
const paused = structuredClone(parser); paused.encounters[0].active = false;
assert.equal(parseView(paused,'live').available,false,'Live does not silently display a completed fight');
assert.equal(parseView(paused,'previous').total,200);
assert.equal(parseView(parser,'discarded').available,false,'Expired pinned history never falls back to Live');
assert.match(parseView(parser,'discarded').title,/no longer retained/);
assert.match(renderParseContent(parseView(parser,'old','feed')),/latest retained events/);
const partial = structuredClone(parser); delete partial.breakdowns;
assert.equal(parseView(partial,'session').truncated,true);
assert.match(renderParseContent(parseView(partial,'session')),/retained events/);
assert.equal(parseView({encounters:[]},'previous').total,0);
assert.equal(parseView({encounters:[{id:'x',active:true,events:[event('damage',Infinity)]}]},'live').total,0);
assert.equal(durationLabel(0),'0:00');
assert.equal(durationLabel(1001),'0:02');
assert.equal(durationLabel(3661000),'1:01:01');
const countdown = { id:'one',label:'Camp respawn',status:'running',source:'spawn',durationSeconds:60,expiresAt:70000,remainingMs:60000 };
assert.equal(timerView(countdown,25000).remainingMs,45000,'Countdown interpolates an engine expiry without starting another scheduler');
assert.equal(timerView({...countdown,status:'paused',expiresAt:null,remainingMs:12345},50000).remainingMs,12345);
assert.equal(timerView(countdown,100000).remainingMs,0);
assert.match(renderTimerRows([countdown],25000),/data-timer-action="pause"/);
assert.match(renderTimerRows([{...countdown,status:'paused'}],25000),/data-timer-action="resume"/);
assert.match(renderTimerRows([{...countdown,status:'ended',remainingMs:0}],25000),/Start again/);
assert.doesNotMatch(renderTimerRows([{...countdown,status:'ended'}],25000),/data-timer-action="resume"/);
assert.match(renderTimerRows([countdown],25000),/estimated/);
const injection = '<img src=x onerror=alert(1)>';
assert.equal(escapeHtml(injection),'&lt;img src=x onerror=alert(1)&gt;');
assert.doesNotMatch(renderParseContent(parseView({encounters:[{id:'x',name:injection,active:true,events:[event('damage',20,injection)]}]},'live')),/<img/);
assert.doesNotMatch(renderItem({name:injection,icon:'javascript:alert(1)',stats:{'<script>':injection}}),/<img|<script>/);
assert.doesNotMatch(renderItem({name:'Test',icon:'https://untrusted.invalid/track.png'}),/<img/,'Overlay items never initiate arbitrary image requests');
assert.match(renderItem({name:'Test',icon:'data:image/png;base64,YQ=='}),/<img/);
assert.match(renderItem({name:'Sword',tier:3,slots:['Primary'],stats:{HP:10}}),/Tier 3/);
assert.match(renderConsider({name:injection,drops:[]}),/&lt;img/);
assert.match(renderConsider({name:'Target',myClassOnly:true,drops:[]}),/Turn off My Class/);
assert.match(renderIntel({npcs:[{name:'Named',named:true,waypoint:'1,2,3',drops:[]}],canRoute:false}),/disabled title="Enable maps/);
assert.doesNotMatch(renderIntel({npcs:[{name:'Named',waypoint:'1,2,3',drops:[]}],canRoute:true}),/disabled/);
assert.match(renderIntel({npcs:[{name:'Named',drops:[{name:'One'},{name:'Two'},{name:'Three'},{name:'Four'}],dropCount:8}]}),/8 known drops · 3 shown/);
assert.match(renderConsider({name:'Target',drops:[{name:'One'}],dropCount:20}),/20 known drops · 1 shown/);
assert.equal(overlayControllerPresentation({supported:false}).supported,false);
const controller = overlayControllerPresentation({panels:{parse:{visible:true,locked:true,passThrough:false}},recoveryShortcutRegistered:false});
assert.equal(controller.panels[0].visible,true);
assert.equal(controller.panels[0].locked,true);
assert.equal(controller.panels[0].passThrough,false,'Lock layout does not imply mouse passthrough');
assert.match(controller.recovery,/shortcut is unavailable/);
assert.match(overlayControllerPresentation({panels:{},recoveryShortcutRegistered:true,recoveryShortcut:'Ctrl+Shift+O'}).recovery,/Ctrl\+Shift\+O/);
assert.match(overlayControllerPresentation({panels:{},sessionRestartCount:1}).restart,/parse history rebuilt.*Saved timer deadlines restored/);
console.log('Overlay presentation checks passed (scopes, complete aggregates, timers, safety, recovery).');
