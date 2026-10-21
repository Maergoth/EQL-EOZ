import assert from 'node:assert/strict';
import { TABS, parseView, renderParseContent, renderIntel, renderItem, durationLabel, timerView, renderTimerRows, renderTimerNotifications, renderSwing, escapeHtml, intelNpcKey, isRaidSource } from '../app/overlay.js';
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
assert.match(renderTimerRows([{...countdown,color:'#123456',warningColor:'#abcdef',warningSeconds:50,lowSeconds:2}],25000),/--timer-color:#abcdef/);
assert.match(renderTimerRows([{...countdown,lowColor:'#fedcba',lowSeconds:50}],25000),/--timer-color:#fedcba/);
assert.equal(renderTimerNotifications([{label:'Expired',expiresAt:100}],101),'');
assert.match(renderTimerNotifications([{label:'Notice <safe>',expiresAt:1500}],1000),/Notice &lt;safe&gt;/);
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
assert.match(renderIntel({npcs:[{name:'Named',named:true,waypoint:'1,2,3',drops:[]}],canRoute:false}),/disabled title="Enable maps/);
assert.doesNotMatch(renderIntel({npcs:[{name:'Named',waypoint:'1,2,3',drops:[]}],canRoute:true}),/disabled/);
assert.match(renderIntel({npcs:[{name:'Named',drops:[{name:'One'},{name:'Two'},{name:'Three'},{name:'Four'}],dropCount:8}]}),/8 known drops · 3 shown/);
const allDrops = Array.from({length:25},(_,index) => ({name:`Synthetic drop ${index + 1}`}));
const intel = {zone:'Fixture Zone',packVersion:'pack1',profileKey:'MNK|base|Classic',myClassOnly:true,npcs:[
    {id:'normal-keeper',name:'Synthetic Keeper',raidInstance:false,drops:allDrops.slice(0,3),dropCount:25},
    {id:'raid-keeper',name:'Synthetic Keeper',raidInstance:true,drops:[{name:'Raid-only item'}],dropCount:1}
]};
const key = intelNpcKey(intel.npcs[0],intel);
const collapsed = renderIntel(intel);
assert.match(collapsed,/Normal Zone/); assert.match(collapsed,/Raid Zone/);
assert(collapsed.indexOf('data-intel-section="raid"') < collapsed.indexOf('data-intel-section="normal"'), 'Raid Zone is listed before Normal Zone');
assert.match(collapsed,/raid-source-badge/);
assert.match(collapsed,/Show More \(22\)/);
assert.match(renderIntel({npcs:[{id:'budgeted',name:'Small omitted preview',drops:[],dropCount:2}]}),/Show More \(2\)/,'Snapshot budget can omit even a small preview without losing access to its drops');
assert.doesNotMatch(collapsed,/Synthetic drop 25/,'Heartbeat snapshot holds only a small preview');
const expanded = renderIntel(intel,{expanded:new Set([key]),dropCache:new Map([[key,{items:allDrops,total:25}]])});
assert.match(expanded,/Synthetic drop 25/,'Expanded mob reveals every returned drop, beyond old 3/5 limits');
assert.match(expanded,/Show Less/);
assert.match(expanded,/25 known class drops/);
assert.doesNotMatch(expanded,/3 shown/,'The displayed-drop count uses the full lazy response when expanded');
assert.match(renderIntel(intel,{query:'keeper'}),/data-npc-index="1"/,'Grouping and filtering preserve original source indices');
assert.doesNotMatch(renderIntel(intel,{query:'not found'}),/Synthetic Keeper/);
assert.match(renderIntel({...intel,focusedNpcId:'raid-keeper'}),/aria-current="true"/);
assert.notEqual(key,intelNpcKey(intel.npcs[1],intel),'Raid and normal versions of the same name keep independent expansion state');
for (const changed of [{myClassOnly:false},{packVersion:'pack2'},{profileKey:'WAR|tier1|Classic'},{zone:'Other Zone'}]) assert.notEqual(key,intelNpcKey(intel.npcs[0],{...intel,...changed}),'Changed context invalidates cached class, tier, era, zone or dataset results');
assert.equal(isRaidSource({instanceType:'raid'}),true);
assert.equal(isRaidSource({raidInstance:'false'}),false);
assert.match(renderIntel(intel,{expanded:new Set([key]),loading:new Set([key])}),/aria-busy="true"/);
assert.match(renderIntel(intel,{expanded:new Set([key]),errors:new Map([[key,injection]])}),/&lt;img/);
assert.equal(overlayControllerPresentation({supported:false}).supported,false);
const controller = overlayControllerPresentation({panels:{parse:{visible:true,locked:true,passThrough:false}},recoveryShortcutRegistered:false});
assert.equal(controller.panels[0].visible,true);
assert.equal(controller.panels[0].locked,true);
assert.equal(controller.panels[0].passThrough,false,'Lock layout does not imply mouse passthrough');
assert.match(controller.recovery,/shortcut is unavailable/);
assert.match(overlayControllerPresentation({panels:{},recoveryShortcutRegistered:true,recoveryShortcut:'Ctrl+Shift+O'}).recovery,/Ctrl\+Shift\+O/);
assert.match(overlayControllerPresentation({panels:{},sessionRestartCount:1}).restart,/parse history rebuilt.*Saved timer deadlines restored/);
console.log('Overlay presentation checks passed (scopes, complete aggregates, timers, safety, recovery).');
