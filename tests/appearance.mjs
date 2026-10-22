import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {FONT_PRESETS,DEFAULT_APPEARANCE,MIN_FONT_SIZE,MAX_FONT_SIZE,normalizeAppearance,applyAppearance,inheritViewerAppearance} from '../app/appearance.js';
import {layoutMapLabels,mapNpcHitTargets,hitMapNpc} from '../app/map-overlay.js';
const require=createRequire(import.meta.url),desktop=require('../desktop/appearance.cjs');

const cases=[undefined,null,{},[],{fontFamily:'georgia',fontSize:20},{fontFamily:'system',fontSize:10},
    {fontFamily:'arial',fontSize:14.6},{fontFamily:'tahoma',fontSize:-100},
    {fontFamily:'url(https://untrusted.invalid/font)',fontSize:'20px; color:red'},
    {fontFamily:'";background:url(x)',fontSize:Infinity},{fontFamily:{toString:()=>{throw Error('must not coerce');}},fontSize:{}}];
for(const value of cases)assert.deepEqual(normalizeAppearance(value),desktop.normalizeAppearance(value),'Renderer and native persistence enforce the same public appearance contract');
assert.deepEqual(normalizeAppearance({fontFamily:'georgia',fontSize:999}),{fontFamily:'georgia',fontSize:MAX_FONT_SIZE});
assert.deepEqual(normalizeAppearance({fontFamily:'arial',fontSize:-10}),{fontFamily:'arial',fontSize:MIN_FONT_SIZE});
assert.equal(new Set(FONT_PRESETS.map(font=>font.id)).size,FONT_PRESETS.length);
assert.deepEqual(normalizeAppearance(),DEFAULT_APPEARANCE);

const fakeDocument=()=>{
    const values=new Map([['--gold','#d8b75c']]),styles=new Map();
    return {values,styles,documentElement:{dataset:{},style:{setProperty:(key,value)=>values.set(key,value)}},
        getElementById:id=>styles.get(id),createElement:()=>({}),head:{append:style=>styles.set(style.id,style)}};
};
const main=fakeDocument(),viewer=fakeDocument();
applyAppearance(main,{fontFamily:'georgia',fontSize:20},{panelScale:1.3});
assert.equal(Number(main.values.get('--font-scale')),2,'Global size multiplies the saved per-panel scale');
assert.equal(main.values.get('--gold'),'#d8b75c','Font changes retain EQL colors');
assert.match(main.values.get('--ui-font-family'),/Georgia/);
inheritViewerAppearance(main,viewer);assert.equal(Number(viewer.values.get('--font-scale')),2);
assert.match(viewer.values.get('--ui-font-family'),/Georgia/);
inheritViewerAppearance(main,viewer);assert.equal(viewer.styles.size,1,'Repeated 3D updates reuse one bounded typography stylesheet');
applyAppearance(main,{fontFamily:'<style>bad</style>',fontSize:NaN},{panelScale:Infinity});
assert.equal(main.documentElement.dataset.fontFamily,'theme');assert.equal(Number(main.values.get('--font-scale')),1);
assert(![...main.values.values()].some(value=>String(value).includes('<style>')),'Untrusted font strings never become CSS values');

const marker={id:'fixture',name:'Synthetic watcher',screen:{x:200,y:150},selected:true};
const layout=layoutMapLabels({npcs:[marker],width:500,height:300,fontScale:2,measureText:()=>120});
assert.equal(layout.npcs[0].height,26,'Large canvas fonts reserve their real line height while decluttering');
const hit=mapNpcHitTargets([marker],layout.npcs)[0];
assert.equal(hit.label.height,28);assert.equal(hitMapNpc({x:hit.label.x+100,y:hit.label.y+25},[hit]),marker,'Scaled label text retains a complete pointer target');
const html=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
assert.match(html,new RegExp(`id="settings-font-size"[^>]*min="${MIN_FONT_SIZE}" max="${MAX_FONT_SIZE}"`));
console.log('Appearance checks passed: allowlisted shared settings, native parity, bounds, combined panel scale, retained colors and scaled Map hit targets.');
