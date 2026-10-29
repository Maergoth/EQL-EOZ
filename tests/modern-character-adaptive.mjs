import assert from 'node:assert/strict';
import {parseScreenRead,screenReadRefinementRegions,screenReadCharacterFollowup} from '../app/screen-read-parser.js';
import {adaptiveWord as word,modernAdaptiveWords} from './fixtures/screen-read/modern-adaptive-words.mjs';
const {scene,context,rows,left,right,resources}=modernAdaptiveWords(),tag='default-modern-resource-context-v1';
const physical=tile=>({...tile,x:Math.floor(tile.x),y:Math.floor(tile.y),width:Math.ceil(tile.x+tile.width)-Math.floor(tile.x),height:Math.ceil(tile.y+tile.height)-Math.floor(tile.y),scale:tile.scale||(tile.column?6:3),preprocessing:'antialias-inverted',...(tile.column?.startsWith('modern-attack')||tile.sourceRows?{guardPreprocessing:'local-otsu'}:{}),...(tile.sourceGuard?{sourceGuard:{...tile.sourceGuard,x:Math.floor(tile.sourceGuard.x),y:Math.floor(tile.sourceGuard.y),width:Math.ceil(tile.sourceGuard.x+tile.sourceGuard.width)-Math.floor(tile.sourceGuard.x),height:Math.ceil(tile.sourceGuard.y+tile.sourceGuard.height)-Math.floor(tile.sourceGuard.y)},guardVerified:true,edgeClipped:false}:{})});
const plans=screenReadRefinementRegions({...scene,characterOnly:true});
assert.equal(plans.length,1);assert.equal(plans[0].nativeContext,tag);assert.equal(plans[0].layout,'block');assert.equal(plans[0].scale,6);assert.deepEqual(plans[0].tiles.map(tile=>tile.scale),[3,6,6]);
assert.deepEqual(plans[0].tiles.map(tile=>tile.context||tile.column),[tag,'modern-resource-current','modern-resource-maximum']);
assert.equal(screenReadRefinementRegions(scene).some(pass=>pass.nativeContext),false,'Contribution keeps its existing queue and identity priority');
const completeReliable={...scene,confidence:40,words:[scene.words.find(word=>word.text==='Inventory'),...context.map(word=>word.text==='471823'?{...word,text:'47/823'}:word)]},strongPlan=screenReadRefinementRegions({...completeReliable,characterOnly:true});
assert.deepEqual(strongPlan.map(pass=>pass.tiles.length),[4,3]);assert(strongPlan.every(pass=>!pass.nativeContext),'Strong individual resource pairs preserve the seven-cell path despite weak frame average');
for(const [reason,alter]of [
    ['one weak resource pair',words=>words.map(word=>word.text==='47/823'?{...word,confidence:84}:word)],
    ['nonfinite numeric confidence',words=>words.map(word=>word.text==='47/823'?{...word,confidence:NaN}:word)],
    ['merged slash',words=>words.map(word=>word.text==='47/823'?{...word,text:'471823'}:word)],
    ['malformed leading zeros',words=>words.map(word=>word.text==='47/823'?{...word,text:'047/823'}:word)],
    ['unsafe literal integer',words=>words.map(word=>word.text==='47/823'?{...word,text:'999999999999999999/823'}:word)],
    ['extra competing value',words=>[...words,word('99',left+40,76,12)]],
    ['pair outside native widgets',words=>words.map(word=>word.text==='47/823'?{...word,bbox:{...word.bbox,x0:left+30}}:word)]
]){const changed={...completeReliable,words:alter(completeReliable.words)};assert.equal(screenReadRefinementRegions({...changed,characterOnly:true})[0].nativeContext,tag,reason);assert.equal(screenReadRefinementRegions(changed).some(pass=>pass.nativeContext),false,'Contribution routing unchanged: '+reason);}
const literalZero={...completeReliable,words:completeReliable.words.map(word=>word.text==='47/823'?{...word,text:'0/823'}:word)},otherLiterals={...completeReliable,words:completeReliable.words.map(word=>word.text==='47/823'?{...word,text:'1,234/5,678'}:word)};
assert.deepEqual(screenReadRefinementRegions({...literalZero,characterOnly:true}).map(pass=>pass.tiles.length),[4,3],'Explicit zero is reliable literal evidence');
assert.deepEqual(screenReadRefinementRegions({...otherLiterals,characterOnly:true}).map(pass=>pass.tiles.length),[4,3],'No expected value or cap is built into path selection');
const weakWithoutFingerprint={...completeReliable,words:completeReliable.words.filter(word=>!['Attack Speed','Velocity'].includes(word.text)).map(word=>word.text==='47/823'?{...word,confidence:84}:word)};assert.equal(screenReadRefinementRegions({...weakWithoutFingerprint,characterOnly:true}).some(pass=>pass.nativeContext),false,'Missing both native fingerprint alternatives cannot authorize the adaptive path');
const velocityAlternative={...scene,words:scene.words.filter(word=>word.text!=='Attack Speed')};assert.equal(screenReadRefinementRegions({...velocityAlternative,characterOnly:true})[0].nativeContext,tag,'A reliable observed Velocity ordinal7 can fingerprint the same native grid');
assert.equal(parseScreenRead({...velocityAlternative,characterOnly:true}).find(record=>record.subject.kind==='character')?.fields.some(field=>field.key==='attackSpeed'),false,'An alternate caption never manufactures the missing Attack Speed value');
for(const [reason,alter]of [
    ['weak Velocity',word=>({...word,confidence:84})],['nonfinite Velocity',word=>({...word,confidence:NaN})],['malformed caption',word=>({...word,text:'Velocty'})],
    ['misaligned ordinal',word=>({...word,bbox:{...word.bbox,y0:word.bbox.y0+8,y1:word.bbox.y1+8}})],['foreign column',word=>({...word,bbox:{...word.bbox,x0:word.bbox.x0+181,x1:word.bbox.x1+181}})],
    ['unsupported tall box',word=>({...word,bbox:{...word.bbox,y1:word.bbox.y0+24}})]
])assert.equal(screenReadRefinementRegions({...velocityAlternative,characterOnly:true,words:velocityAlternative.words.map(word=>word.text==='Velocity'?alter(word):word)}).some(pass=>pass.nativeContext),false,reason);
assert.equal(screenReadRefinementRegions({...velocityAlternative,characterOnly:true,words:[...velocityAlternative.words,word('Velocity',left,179,45)]}).some(pass=>pass.nativeContext),false,'Duplicate Velocity is ambiguous');
assert.equal(screenReadRefinementRegions({...scene,characterOnly:true,words:scene.words.map(word=>word.text==='Velocity'?{...word,bbox:{...word.bbox,y0:180,y1:192}}:word)}).some(pass=>pass.nativeContext),false,'An observed conflicting Velocity cannot be ignored merely because Attack Speed also exists');
const first={...plans[0],confidence:97,tiles:plans[0].tiles.map(tile=>({...physical(tile),...(tile.sourceRows?{rowProofs:tile.sourceRows.map(row=>({...physical(row),complete:true,inkPresent:true,edgeClipped:false}))}:{})})),words:context.map(entry=>({...entry,context:tag}))};
for(const tile of first.tiles.filter(tile=>tile.column))for(const row of tile.rowProofs)first.words.push({...word(String(resources[row.key]),tile.x+18,row.y+4,18,10),column:tile.column});
const input={...scene,characterOnly:true,input:{scale:1,region:{x:0,y:0}},refinements:[first]},followup=screenReadCharacterFollowup(input);
assert(followup,'Recovered actual labels admit the last bounded pass');assert.equal(followup.nativeFollowup,tag);assert.equal(followup.layout,'sparse');
assert.deepEqual(followup.tiles.map(tile=>tile.column),['modern-attributes','modern-resists','modern-attackOffense','modern-attackAccuracy']);
const second={...followup,confidence:97,tiles:followup.tiles.map(physical),words:[...rows.map(row=>({...word(String(row.value),right+(row.key.startsWith('resist')?113:84),row.y,18),column:row.key.startsWith('resist')?'modern-resists':'modern-attributes'})),...rows.filter(row=>!row.key.startsWith('resist')).map(row=>({...row.words[0],column:'modern-attributes'})),{...word('318',left+101,140,18),column:'modern-attackOffense'},{...word('647',left+129,140,18),column:'modern-attackAccuracy'}]};
const record=(value=input)=>parseScreenRead(value).find(record=>record.subject.kind==='character'),values=value=>Object.fromEntries((record(value)?.fields||[]).map(field=>[field.key,field.value]));
const parsed=values({...input,refinements:[first,second]});for(const [key,value]of Object.entries(resources))assert.equal(parsed[key],value,key);
for(const {key,value}of rows)assert.equal(parsed[key],value,key);
for(const [key,value]of Object.entries({acMitigation:117,acMitigationSoftcap:89,acEvasion:307,attackOffense:318,attackAccuracy:647,velocity:0,hpRegen:19,manaRegen:23,enduranceRegen:29,damageShieldMitigation:0}))assert.equal(parsed[key],value,key);
assert(record({...input,refinements:[first,second]}).fields.find(field=>field.key==='damageShieldMitigation').raw.includes('Mitigal'),'Clipped caption remains raw evidence');
assert.equal(screenReadCharacterFollowup({...input,refinements:[first,second]}),null,'No fourth call can be planned');
assert(followup.tiles.filter(tile=>tile.column.startsWith('modern-attack')).every(tile=>tile.y===139&&tile.height===16),'Fallback Attack uses its complete native14-unit row plus one-unit gutters');
const fatContext={...first,words:first.words.map(word=>word.context&&word.text==='Attack'?{...word,bbox:{...word.bbox,y0:136,y1:156}}:word)},fatPlan=screenReadCharacterFollowup({...input,refinements:[fatContext]});
assert(fatPlan);assert.deepEqual(fatPlan.tiles.filter(tile=>tile.column.startsWith('modern-attack')).map(tile=>[tile.y,tile.height]),[[139,16],[139,16]],'Tall OCR label boxes cannot expand a native widget into neighboring rows');
const fractional=entry=>entry.bbox.x0>=right?{...entry,bbox:{...entry.bbox,x0:entry.bbox.x0-1/3,x1:entry.bbox.x1-1/3}}:entry,fractionScene={...scene,words:scene.words.map(fractional)},fractionPlan=screenReadRefinementRegions({...fractionScene,characterOnly:true})[0],fractionFirst={...first,tiles:fractionPlan.tiles.map(tile=>({...physical(tile),...(tile.sourceRows?{rowProofs:tile.sourceRows.map(row=>({...physical(row),complete:true,inkPresent:true,edgeClipped:false}))}:{})})),words:first.words.map(fractional)},fractionInput={...input,words:fractionScene.words,refinements:[fractionFirst]},fractionFollow=screenReadCharacterFollowup(fractionInput);
assert(fractionFollow);const fractionSecond={...second,tiles:fractionFollow.tiles.map(physical),words:second.words.map(fractional)};
assert.equal(values({...fractionInput,refinements:[fractionFirst,fractionSecond]}).str,145,'A final glyph within the outward native pixel interval is admitted despite fractional nominal end');
const outsideRounded={...fractionSecond,words:fractionSecond.words.map(word=>word.column==='modern-attributes'&&word.text==='145'?{...word,bbox:{...word.bbox,x1:384}}:word)};assert.equal(values({...fractionInput,refinements:[fractionFirst,outsideRounded]}).str,undefined,'The outward source interval is a bound, not an arbitrary numeric tolerance');
for(const [reason,alter]of [
    ['missing HP anchor',words=>words.filter(word=>word.text!=='HP')],['missing End anchor',words=>words.filter(word=>word.text!=='End')],
    ['one-column evidence',words=>words.filter(word=>word.bbox.x0<right||!/[a-z]/i.test(word.text)||word.bbox.y0===60)],
    ['conflicting native row',words=>words.map(word=>word.text==='Dexterity'?{...word,bbox:{...word.bbox,y0:word.bbox.y0+8,y1:word.bbox.y1+8}}:word)],
    ['duplicate native label',words=>[...words,word('HP',left,83,12)]],
    ['no observed intervening Attack ink',words=>words.filter(word=>word.text!=='3181647')]
])assert.equal(screenReadRefinementRegions({...scene,characterOnly:true,words:alter(scene.words)}).some(pass=>pass.nativeContext),false,reason);
for(const [reason,alter]of [
    ['unexecuted context',pass=>({...pass,tiles:pass.tiles.filter(tile=>!tile.context)})],
    ['wrong context footprint',pass=>({...pass,tiles:pass.tiles.map(tile=>tile.context?{...tile,x:tile.x+20}:tile)})],
    ['context transformed as numeric column',pass=>({...pass,tiles:pass.tiles.map(tile=>tile.context?{...tile,preprocessing:'local-otsu'}:tile)})],
    ['duplicate resource column',pass=>({...pass,tiles:pass.tiles.map(tile=>tile.column==='modern-resource-maximum'?{...tile,column:'modern-resource-current'}:tile)})],
    ['duplicate context heading',pass=>({...pass,words:[...pass.words,word('Stats',right+50,60,35)].map(word=>({...word,context:tag}))})],
    ['untagged words',pass=>({...pass,words:pass.words.map(({context,...word})=>word)})],
    ['missing recovered Attack label',pass=>({...pass,words:pass.words.filter(word=>word.text!=='Attack')})],
    ['weak recovered Attack label',pass=>({...pass,words:pass.words.map(word=>word.text==='Attack'?{...word,confidence:84}:word)})],
    ['contradictory recovered body',pass=>({...pass,words:pass.words.map(word=>word.text==='Wisdom'?{...word,bbox:{...word.bbox,y0:word.bbox.y0+8,y1:word.bbox.y1+8}}:word)})],
    ['borrowed second pane',pass=>({...pass,words:[...pass.words,...pass.words.filter(word=>word.text==='Character'||word.text==='Vitals').map(word=>({...word,bbox:{...word.bbox,x0:word.bbox.x0+40,x1:word.bbox.x1+40}}))]})]
])assert.equal(screenReadCharacterFollowup({...input,refinements:[alter(first)]}),null,reason);
assert.equal(screenReadCharacterFollowup({...input,words:[...input.words,word('Inventory',400,20,75)]}),null,'Two Inventory anchors cannot be mixed');
assert.equal(screenReadCharacterFollowup({...input,input:{scale:2,region:{x:0,y:0}}}),null,'Executed context must map through the actual acquisition scale');
assert.equal(screenReadCharacterFollowup({...input,input:{scale:1,region:{x:17,y:0}}}),null,'Executed context must match the selected native origin');
const forgedAc={...physical(followup.tiles.find(tile=>tile.column==='modern-attackOffense')),column:'modern-acMitigation',x:129,y:118,width:57,height:24},extraSecond={...second,tiles:[forgedAc,...second.tiles.slice(0,3)],words:[{...word('991',165,124,18),column:'modern-acMitigation'},...second.words]};
assert.equal(values({...input,refinements:[first,extraSecond]}).acMitigation,117,'An unplanned AC kind cannot acquire followup ownership');
for(const [reason,alter]of [
    ['edge ink',row=>({...row,edgeClipped:true})],['no source ink',row=>({...row,inkPresent:false})],['clipped source extent',row=>({...row,complete:false})],['inward source footprint',row=>({...row,x:row.x+1,width:row.width-1})]
]){const bad={...first,tiles:first.tiles.map(tile=>tile.column==='modern-resource-current'?{...tile,rowProofs:tile.rowProofs.map(row=>row.key==='hpCurrent'?alter(row):row)}:tile)};assert.equal(values({...input,refinements:[bad,second]}).hpCurrent,undefined,reason);assert.equal(values({...input,refinements:[bad,second]}).hpMaximum,823,'Other fields survive '+reason);}
const literalContext={...first,words:first.words.map(word=>word.context&&word.text==='471823'?{...word,text:'47/823'}:word)},failedLiteral={...literalContext,tiles:literalContext.tiles.map(tile=>tile.column==='modern-resource-current'?{...tile,rowProofs:tile.rowProofs.map(row=>row.key==='hpCurrent'?{...row,edgeClipped:true}:row)}:tile)};
assert.equal(values({...input,refinements:[failedLiteral,second]}).hpCurrent,undefined,'An ordinary valid HP pair cannot refill an authoritative failed cell in the same pass');
for(const alter of [tile=>({...tile,preprocessing:'local-otsu'}),tile=>({...tile,guardPreprocessing:'antialias-inverted'}),tile=>({...tile,scale:7})]){
    const bad={...first,tiles:first.tiles.map(tile=>tile.column==='modern-resource-current'?alter(tile):tile)};assert.equal(values({...input,refinements:[bad,second]}).hpCurrent,undefined,'Numeric OCR and independent source-guard provenance must match actual execution');
}
assert.equal(values({...input,refinements:[{...literalContext,words:literalContext.words.map(word=>word.context&&word.text==='47/823'?{...word,text:'48/823'}:word)},second]}).hpCurrent,undefined,'Reliable context and physical-cell differences remain conflicts');
const resourceInput={...input,words:input.words.map(word=>word.text==='271/689'?{...word,text:'2711689'}:word)},weakEnd={...first,words:first.words.map(word=>word.context&&word.text==='271/689'?{...word,confidence:92}:word.column==='modern-resource-maximum'&&word.text==='689'?{...word,confidence:81}:word)},rescued=record({...resourceInput,refinements:[weakEnd,second]}).fields.find(field=>field.key==='enduranceMaximum');
assert.equal(rescued.value,689,'A reliable literal pair with independent physical agreement preserves the unread component');assert.equal(rescued.confidence,92,'The context score is retained rather than promoting the weak widget score81');assert.match(rescued.raw,/certified native resource context OCR: End 271\/689/);
for(const [reason,alter]of [
    ['weak context',pass=>({...pass,words:pass.words.map(word=>word.context&&word.text==='271/689'?{...word,confidence:84}:word)})],
    ['nonfinite context',pass=>({...pass,words:pass.words.map(word=>word.context&&word.text==='271/689'?{...word,confidence:NaN}:word)})],
    ['merged context',pass=>({...pass,words:pass.words.map(word=>word.context&&word.text==='271/689'?{...word,text:'2711689'}:word)})],
    ['weak competing component',pass=>({...pass,words:pass.words.map(word=>word.column==='modern-resource-maximum'&&word.text==='689'?{...word,text:'639'}:word)})],
    ['oversized weak competing component',pass=>({...pass,words:pass.words.map(word=>word.column==='modern-resource-maximum'&&word.text==='689'?{...word,text:'639',bbox:{...word.bbox,y0:103,y1:125}}:word)})],
    ['reliable conflicting component',pass=>({...pass,words:pass.words.map(word=>word.column==='modern-resource-maximum'&&word.text==='689'?{...word,text:'639',confidence:96}:word)})],
    ['both physical components unread',pass=>({...pass,words:pass.words.map(word=>word.column==='modern-resource-current'&&word.text==='271'?{...word,confidence:81}:word)})],
    ['failed max source proof',pass=>({...pass,tiles:pass.tiles.map(tile=>tile.column==='modern-resource-maximum'?{...tile,rowProofs:tile.rowProofs.map(row=>row.key==='enduranceMaximum'?{...row,edgeClipped:true}:row)}:tile)})],
    ['failed other source proof',pass=>({...pass,tiles:pass.tiles.map(tile=>tile.column==='modern-resource-current'?{...tile,rowProofs:tile.rowProofs.map(row=>row.key==='enduranceCurrent'?{...row,edgeClipped:true}:row)}:tile)})],
    ['invalid actual context authority',pass=>({...pass,tiles:pass.tiles.map(tile=>tile.context?{...tile,x:tile.x+20}:tile)})],
    ['pair outside native widgets',pass=>({...pass,words:pass.words.map(word=>word.context&&word.text==='271/689'?{...word,bbox:{...word.bbox,x1:300}}:word)})],
    ['extra numeric context',pass=>({...pass,words:[...pass.words,{...word('7',left+40,108,8),context:tag}]})],
    ['extra physical number',pass=>({...pass,words:[...pass.words,{...word('7',left+143,108,8),column:'modern-resource-maximum'}]})]
])assert.equal(values({...resourceInput,refinements:[alter(weakEnd),second]}).enduranceMaximum,undefined,reason);
const zeroAgreement={...weakEnd,words:weakEnd.words.map(word=>word.context&&word.text==='271/689'?{...word,text:'0/689'}:word.column==='modern-resource-current'&&word.text==='271'?{...word,text:'0'}:word)};assert.equal(values({...resourceInput,refinements:[zeroAgreement,second]}).enduranceMaximum,689,'Explicit zero can be an independently agreed component');
for(const [reason,text,confidence]of [['low confidence','47',84],['extra separator','47/823',97],['unsafe integer','999999999999999999999',97],['nonfinite confidence','47',NaN]]){
    const bad={...first,words:first.words.map(word=>word.column==='modern-resource-current'&&word.text==='47'?{...word,text,confidence}:word)};assert.equal(values({...input,refinements:[bad,second]}).hpCurrent,undefined,reason);
}
for(const caption of ['Mitigal','Mitigali','Mitigat']){
    const pass={...first,words:first.words.map(word=>word.text==='Mitigal'?{...word,text:caption}:word)};assert.equal(values({...input,refinements:[pass]}).damageShieldMitigation,0);
}
const noBaseAlias={...input,words:input.words.filter(word=>word.text!=='0/61')},weakAlias={...first,words:first.words.map(word=>word.text==='0/61'?{...word,confidence:84}:word)};assert.equal(values({...noBaseAlias,refinements:[weakAlias]}).damageShieldMitigation,undefined);
const unknownAlias={...first,words:first.words.filter(word=>word.text!=='0/61')};assert.equal(values({...noBaseAlias,refinements:[unknownAlias]}).damageShieldMitigation,undefined);
const nativeMitigat={...first,words:first.words.map(word=>word.text==='Mitigal'?{...word,text:'Mitigat'}:word)},weakMitigat={...nativeMitigat,words:nativeMitigat.words.map(word=>word.text==='0/61'?{...word,confidence:84}:word)};assert.equal(values({...noBaseAlias,refinements:[weakMitigat]}).damageShieldMitigation,undefined,'Mitigat retains the numeric85 floor');
const conflictingMitigat={...nativeMitigat,words:nativeMitigat.words.map(word=>word.text==='0/61'?{...word,text:'1/61'}:word)};assert.equal(values({...input,refinements:[conflictingMitigat]}).damageShieldMitigation,undefined,'Mitigat remains subject to independent numeric conflicts');
for(const caption of ['Mitigatx','Mitigate','Mitig'])assert.equal(values({...noBaseAlias,refinements:[{...first,words:first.words.map(word=>word.text==='Mitigal'?{...word,text:caption}:word)}]}).damageShieldMitigation,undefined,'No fuzzy clipped-caption prefix: '+caption);
assert.equal(parseScreenRead({text:'Item Name: Synthetic Lens\nDescription\nDamage Shield Mitigal 0/61\nAC 12\nHP 37',confidence:97})[0]?.fields.some(field=>field.key==='damageShieldMitigation'),false,'No item clipped-caption alias');
assert.equal(parseScreenRead({text:'Character Stats\nDamage Shield Mitigal 0/61\nHP 10/100\nMana 20/200',characterOnly:true,confidence:97})[0]?.fields.some(field=>field.key==='damageShieldMitigation'),false,'Legacy/Default text does not gain a Modern clipped-caption alias');
assert.equal(parseScreenRead({text:'Item Name: Synthetic Lens\nDescription\nDamage Shield Mitigat 0/61\nAC 12\nHP 37',confidence:97})[0]?.fields.some(field=>field.key==='damageShieldMitigation'),false,'Mitigat is not an item alias');
assert.equal(parseScreenRead({text:'Character Stats\nDamage Shield Mitigat 0/61\nHP 10/100\nMana 20/200',characterOnly:true,confidence:97})[0]?.fields.some(field=>field.key==='damageShieldMitigation'),false,'Mitigat is not a Legacy/Default alias');
const conflictingAlias={...first,words:first.words.map(word=>word.text==='0/61'?{...word,text:'1/61'}:word)};assert.equal(values({...input,refinements:[conflictingAlias]}).damageShieldMitigation,undefined,'Clipped captions retain normal reliable numeric-conflict handling');
assert.equal(values({...input,refinements:[first,second]}).primaryDps,undefined,'A blank native DPS widget is never invented');
console.log('Adaptive Modern: actual context-only handoff, native resource source proofs, preserved auxiliaries, pass-local ownership and adversarial schema/provenance guards passed.');
