import assert from 'node:assert/strict';
import { TABS, parseView, renderParseContent, renderIntel, renderConsider, renderItem, durationLabel, timerView, renderTimerRows, renderSwing, escapeHtml } from '../app/overlay.js';
import { overlayControllerPresentation } from '../app/overlay-controller.js';

const event = (type, amount, source = 'Slash') => ({ type, amount, source, victim:'a skeleton' });
const parser = {
    totalDamage:10000, totalHealing:550, totalTaken:600, sessionTakenPerSecond:20, sessionDps:500, totalOwnKills:3,totalKills:18,totalLoot:5,encounterCount:2,zoneCount:1,
    recentEvents:[event('rune',300)],
    encounters:[
        { id:'current', active:true, name:'a skeleton', duration:10, damage:200, events:[event('damage',100),event('damage',100),event('heal',50,'Mend'),event('rune',300)], breakdowns:{ damage:[{name:'Slash',total:200,count:2}], healing:[{name:'Mend',total:50,count:1}], runes:[{name:'Rune capacity',total:300,count:1}] } },
        { id:'old', active:false, name:'a goblin', duration:20, events:[event('damage',80,'Kick')], eventsTruncated:true, breakdowns:{ damage:[{name:'Kick',total:9800,count:500}] } }
    ],
    breakdowns:{ damage:[{name:'Slash',total:200,count:2},{name:'Kick',total:9800,count:500}], healing:[{name:'Mend',total:550,count:11}], taken:[{name:'a skeleton',total:600,count:10,rate:20}], runes:[{name:'Rune capacity',total:300,count:1}] }
};
assert.deepEqual(TABS,['overview','damage','healing','taken','session'],'Exact PNUT overlay tabs; no substituted Runes or Feed tabs');
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
assert.match(renderParseContent(parseView(parser,'live','session')),/Logged capacity granted; damage absorbed is not measured/);
assert.match(renderParseContent(parseView(parser,'live','overview')),/<th>Name<\/th><th>Damage<\/th><th>DPS/);
assert.match(renderParseContent(parseView(parser,'session','taken')),/a skeleton/);
assert.equal(parseView(parser,'session','taken').total,600);
assert.equal(parseView(parser,'session','taken').rate,20);
assert.match(renderParseContent(parseView(parser,'live','session')),/Own kills<\/td><td>3<\/td>/,'Nearby observed kills are not mislabeled as your own');
assert.doesNotMatch(renderParseContent(parseView({...parser,zoneCount:undefined},'live','session')),/Zones visited/,'Unavailable zone history is not shown as a false zero');
assert.match(renderParseContent(parseView(parser,'live','session')),/Session elapsed/);
assert.match(renderParseContent(parseView(parser,'session','damage')),/<th>Ability<\/th><th>Damage<\/th>/);
assert.match(renderParseContent(parseView(parser,'session','damage')),/--amount:100\.0%/,'The largest PNUT meter bar fills the available row');
const paused = structuredClone(parser); paused.encounters[0].active = false;
assert.equal(parseView(paused,'live').available,false,'Live does not silently display a completed fight');
assert.equal(parseView(paused,'previous').total,200);
assert.equal(parseView(parser,'discarded').available,false,'Expired pinned history never falls back to Live');
assert.match(parseView(parser,'discarded').title,/no longer retained/);
const partial = structuredClone(parser); delete partial.breakdowns;
assert.equal(parseView(partial,'session').truncated,true);
assert.match(renderParseContent(parseView(partial,'session')),/Retained events/);
assert.equal(parseView({encounters:[]},'previous').total,0);
assert.equal(parseView({encounters:[{id:'x',active:true,events:[event('damage',Infinity)]}]},'live').total,0);
assert.equal(durationLabel(0),'0:00');
assert.equal(durationLabel(1001),'0:02');
assert.equal(durationLabel(3661000),'1:01:01');
const countdown = { id:'one',label:'Camp respawn',status:'running',source:'spawn',durationSeconds:60,expiresAt:70000,remainingMs:60000 };
assert.equal(timerView(countdown,25000).remainingMs,45000,'Countdown interpolates an engine expiry without starting another scheduler');
assert.equal(timerView({...countdown,status:'paused',expiresAt:null,remainingMs:12345},50000).remainingMs,12345);
assert.equal(timerView(countdown,100000).remainingMs,0);
assert.doesNotMatch(renderTimerRows([countdown],25000),/<button|<input|data-timer-action/,'Native timers are display-only');
assert.match(renderTimerRows([{...countdown,status:'paused'}],25000),/paused/);
assert.match(renderTimerRows([{...countdown,status:'ended',remainingMs:0}],25000),/0:00/);
assert.match(renderTimerRows([countdown],25000),/timer-ring/);
assert.match(renderTimerRows([countdown],25000),/--remaining:75\.0%/);
assert.match(renderTimerRows([countdown],25000),/estimated/);
assert.doesNotMatch(renderSwing({enabled:true,lastAt:10000,intervalMs:2500,status:'tracking'},11000),/<button|<input|<select/);
assert.match(renderSwing({enabled:true,lastAt:10000,intervalMs:2500,status:'tracking'},11000),/Observed 2\.5s/);
assert.equal(renderSwing({enabled:false},11000),'');
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
