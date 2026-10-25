import assert from 'node:assert/strict';
import {EQLogParser,extractItemLinks} from '../app/parser.js';
import {createWikiDiscovery} from '../app/wiki-discovery.js';
import {createContributionQueue} from '../app/contribution-queue.js';
import {logContributionObservation} from '../app/contribution-evidence.js';
import {collectDropObservation} from '../app/drop-observations.js';
import {buildContributionDraft} from '../app/contribution-model.js';
import {canonicalChatItemMatch} from '../app/chat-item-mentions.js';

const escaped=(name,id=123)=>`\\aITEM ${id} 0:${name}\\/a`;
const native=(name,id=123)=>'\x12'+'0'+id.toString(16).padStart(5,'0')+'0'.repeat(50)+name+'\x12';
let now=Date.UTC(2026,9,24,12),cursor=0;
const line=text=>`[${new Date(now).toISOString()}] ${text}`;
const parser=new EQLogParser();
const chat=items=>parser.parse(line(`Synthetic Speaker tells the guild, '${items.join(' ')}'`));
assert.deepEqual(extractItemLinks(`${native('AC Blade')} ${escaped('Escaped Blade')} ${native('ac blade')}`),['AC Blade','Escaped Blade'],'Both verified encodings retain display order and dedupe case variants');
for(const text of ["Synthetic Speaker says, 'Plain Item Name'",'[Plain Item Name]','\\aPC 123 0:Synthetic Player\\/a','\\aITEM invalid:Fake Blade\\/a','\\aITEM 123 0:Unclosed Blade',escaped('Zero Item',0),native('Empty Item',0),native('Quest Command',0xfffff),native('Legacy Quest Command',999999),'\x12'+'0'.repeat(45)+'Old Rat'+'\x12',escaped('<Unsafe Item>')]){
    assert.deepEqual(extractItemLinks(text),[],text);
    assert.equal(parser.parse(line(text)),null,'Ordinary text, player links, malformed links and quest proxies never become items');
}
assert.equal(extractItemLinks(Array.from({length:12},(_,index)=>escaped(`Bounded Item ${index}`)).join(' ')).length,8);
assert.deepEqual(extractItemLinks('x'.repeat(16384)+escaped('Outside Bound')),[]);
const linked=chat([escaped('Missing Blade +4'),native('Missing Charm'),escaped('Known Sword +5 (Exaltation)')]);
assert.equal(linked.type,'item-links');assert.deepEqual(linked.items,['Missing Blade +4','Missing Charm','Known Sword +5 (Exaltation)']);assert(linked.evidence.text.includes('Synthetic Speaker tells the guild'));
assert.equal(linked.at,now);assert.equal(parser.snapshot().totalLoot,0);assert.equal(parser.snapshot().observed.length,0);assert.equal(parser.snapshot().encounterCount,0);
assert.equal(parser.parse(line(`Synthetic Speaker says, '${escaped('Historical Item')}'`),{recordSession:false}),null,'Historical tail replay does not discover chat items');
const looted=parser.parse(line(`You have looted ${escaped('Rat Whiskers')} from the corpse of a sewer rat!`));assert.equal(looted.type,'loot');assert.equal(looted.item,'Rat Whiskers');assert.equal(parser.snapshot().totalLoot,1,'Existing loot remains a single normal loot event');
const nativeLoot=parser.parse(line(`You have looted ${native('Native Rat Whiskers')} from the corpse of a sewer rat!`));assert.equal(nativeLoot.type,'loot');assert.equal(nativeLoot.item,'Native Rat Whiskers');

const plainNames=['Example Gauntlets','Cloak of Synthetic Flames','Synthetic Blade of the Watcher','Thornstinger','Earthshaker','Synthetic Relic','Known Sword'];
const plainParser=new EQLogParser({getPack:()=>plainPack}),plainPack={items:plainNames.map(name=>({name}))};
for(const payload of ['Example Gauntlets +5','Example Gauntlets +4 These seem solid...','Cloak of Synthetic Flames +10','Synthetic Blade of the Watcher +0','Thornstinger +5','Earthshaker +6','Synthetic Relic +5']){
    const event=plainParser.parse(line(`Syntheticplayer tells General:1, '${payload}'`));assert.equal(event?.type,'item-links',payload);assert.deepEqual(event.items,[payload.match(/^.*?\+\d+/)[0]]);assert.equal(event.itemLinkFormat,'plain-tiered-chat');assert.equal(event.evidence.interpretation,'possible-tiered-item-mention');
}
for(const wrapper of [payload=>`Syntheticplayer tells the guild, '${payload}'`,payload=>`Syntheticplayer tells you, '${payload}'`,payload=>`You tell General:1, '${payload}'`,payload=>`Syntheticplayer says, '${payload}'`])assert.deepEqual(plainParser.parse(line(wrapper('Example Gauntlets +5')))?.items,['Example Gauntlets +5']);
for(const payload of ['Example Gauntlets','I Need Gauntlets +5','These Gauntlets +5','Need Better Gauntlets +5','Damage Shield +5 please','AC +5','HP +5','Haste +5','Example Gauntlets +11','Synthetic Spell +5'])assert.equal(plainParser.parse(line(`Syntheticplayer tells General:1, '${payload}'`)),null,payload);
for(const payload of ['example gauntlets +5','I think Example Gauntlets +5 are solid','Example Gauntlets +5 Other Boots +4'])assert.deepEqual(plainParser.parse(line(`Syntheticplayer tells General:1, '${payload}'`))?.items,['Example Gauntlets +5'],'Known exact item boundaries do not depend on title case or surrounding prose');
for(const text of ['Example Gauntlets +5',"System message: 'Example Gauntlets +5'",'Syntheticplayer begins casting Example Gauntlets +5.','You hit a synthetic target for 5 points of damage by Example Gauntlets +5.'])assert.notEqual(plainParser.parse(line(text))?.type,'item-links','A non-chat line never becomes a plaintext item mention');
assert.equal(plainParser.parse(line("Syntheticplayer tells General:1, 'Example Gauntlets +5'"),{recordSession:false}),null,'Historical plain chat mentions do not trigger discovery');
const authenticated=plainParser.parse(line(`Syntheticplayer tells General:1, '${escaped('Authentic Blade +5')} Example Gauntlets +4'`));assert.deepEqual(authenticated.items,['Authentic Blade +5']);assert.equal(authenticated.itemLinkFormat,undefined);assert.equal(authenticated.evidence.interpretation,undefined,'Authenticated encoded links retain precedence over plaintext guesses');

let pack={meta:{wikiEntitiesComplete:true},wikiEntities:{items:['Known Sword'],npcs:[],titles:['Known Sword','Plain Existing Page']},items:[{name:'Known Sword',wikiTitle:'Known Sword',aliases:['Known Alias']}],npcs:[],zones:[]};
const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const options={storage,getPack:()=>pack,now:()=>now,verifyItem:()=>({status:'missing'})},queue=createContributionQueue(options),prompts=[];
const discovery=createWikiDiscovery({...options,getSuppression:(...args)=>queue.suppression(...args),onMissing:prompt=>prompts.push(prompt)});
const context=()=>({live:true,at:now,cursor:++cursor,zone:'Current Raid Zone',instance:'raid',logId:'C:/Private/eqlog_Player.txt'});
const linkedContext=context();
const prompt=discovery.consume(linked,linkedContext);assert.equal(prompt.name,'Missing Blade');assert.equal(prompt.purpose,'item-link');assert.equal(prompt.zone,'');assert.equal(prompts.length,2,'Each missing item opens its own notice; known decorated links are skipped');
const captured=queue.consumeLog(linked,linkedContext);assert.deepEqual(captured.candidates.map(candidate=>candidate.name),['Missing Blade','Missing Charm']);
for(const candidate of captured.candidates){assert.equal(candidate.kind,'item');assert.equal(candidate.zone,'');assert.equal(candidate.instance,'unknown');assert.deepEqual(candidate.sources,[]);assert.deepEqual(candidate.relations,[]);assert.equal(candidate.fields.quantity,undefined);assert(candidate.evidence[0].text.includes('Synthetic Speaker'));assert(!JSON.stringify(candidate).includes('C:/Private'),'Local path stays hashed even though the triggering chat evidence is retained locally');}
assert.equal(captured.candidates[0].fields.tier.value,4,'Displayed tier is evidence rather than a fabricated loot fact');
const observation=logContributionObservation({type:'item-link',item:'Missing Blade +4 (Exaltation)',evidence:linked.evidence},linkedContext,{now});assert.equal(observation.subject.name,'Missing Blade');assert.equal(observation.input.purpose,'item-link');assert.equal(observation.input.zone,'');assert.equal(observation.input.instance,'unknown');assert.deepEqual(observation.relations,[]);
const blueprints={entries:{item:{text:'{{Itempage|statsblock=}}'}}},draft=buildContributionDraft(captured.candidates[0],blueprints);assert(!draft.text.includes('Synthetic Speaker'),'Chat text stays in local evidence and never enters wiki prose');assert(!draft.text.includes('Current Raid Zone'),'A chat item is not assigned the player’s current zone');
assert.equal(collectDropObservation(linked,linkedContext,{now}),null,'Chat links never enter kill/loot observation uploads');
const mention=plainParser.parse(line("Syntheticplayer tells General:1, 'Example Gauntlets +5'")),mentionContext=context(),mentionPrompt=discovery.consume(mention,mentionContext);assert.equal(mentionPrompt?.name,'Example Gauntlets');assert.match(mentionPrompt.hint,/Possible item mentioned in chat/,'Plaintext mentions are never presented as proven encoded links');const mentionCandidate=queue.consumeLog(mention,mentionContext).candidate;assert.equal(mentionCandidate?.name,'Example Gauntlets');assert.deepEqual(mentionCandidate.sources,[]);assert.deepEqual(mentionCandidate.relations,[]);assert.equal(mentionCandidate.zone,'');assert.equal(collectDropObservation(mention,mentionContext,{now}),null);assert.equal(discovery.consume(plainParser.parse(line("Syntheticplayer tells General:1, 'Example Gauntlets +4 These seem solid...'")),context()),null,'Plaintext mention tiers share the existing base-item dedupe');
assert.equal(discovery.consume(plainParser.parse(line("Syntheticplayer tells General:1, 'Known Sword +5'")),context()),null,'A known item mentioned in plaintext never becomes a missing-page suggestion');
assert.equal(discovery.consume(chat([escaped('Missing Blade (Exaltation)'),escaped('Missing Blade +5'),escaped('Known Alias'),escaped('Plain Existing Page')]),context()),null,'Canonical queued, tiered, Exaltation and known aliases do not repeat notices');
const before=queue.snapshot().length;queue.consumeLog(chat([escaped('Missing Blade (Exaltation)'),escaped('Missing Blade +5')]),context());assert.equal(queue.snapshot().length,before,'Unknown tier/Exaltation links reuse the base item candidate');
const replay=createContributionQueue(options);const replayBefore=JSON.stringify(replay.snapshot());replay.consumeLog(linked,linkedContext);assert.equal(JSON.stringify(replay.snapshot()),replayBefore,'Repeated delivery remains idempotent after restart');
for(const change of [{live:false},{at:now-11000}]){const event={type:'item-links',items:['Stale Missing Item'],at:change.at??now};assert.equal(discovery.consume(event,{...context(),...change}),null);assert.equal(replay.consumeLog(event,{...context(),...change}).candidate,null);}
const partial={...pack,meta:{wikiEntitiesComplete:false}},partialQueue=createContributionQueue({storage:null,getPack:()=>partial,now:()=>now}),partialDiscovery=createWikiDiscovery({storage:null,getPack:()=>partial,now:()=>now});assert.equal(partialQueue.consumeLog({type:'item-links',items:['Unknown In Partial Catalog']},context()).candidate,null);assert.equal(partialDiscovery.consume({type:'item-links',items:['Unknown In Partial Catalog'],at:now},context()),null,'Incomplete cache absence never declares a linked item missing');

// Chat observations carry no zone claim, but must not cancel an already armed
// /loc request in the unchanged live game zone.
const spawn=queue.consumeLog({type:'kill',victim:'A missing spawn'},context());assert(spawn.prompt?.armed);const armed=queue.spawnStatus().candidateId;
queue.consumeLog(chat([escaped('Another Missing Chat Item')]),context());assert.equal(queue.spawnStatus().candidateId,armed);
console.log('Item links: bounded authentic escaped/modern links, no ordinary/player/quest false positives, preserved loot parsing, canonical missing-item notices, local chat evidence, no inferred sources/uploads, restart dedup and live catalog guards passed.');

// The game's flattened log can lose item-link delimiters. The word “Then” is
// prose here; no special-case English stop-word list should define the item.
const actual='Signet Ring of Lord Everling',catalog={items:[{name:actual,wikiTitle:actual,aliases:['Everling Signet']}],wikiEntities:{items:[actual,'Everling Signet','Eon'],npcs:[],titles:[actual,'Everling Signet','Eon']},meta:{wikiEntitiesComplete:true,sample:false}};
const anchored=new EQLogParser({getPack:()=>catalog});
for(const prefix of ['Then ','Please consider the ','Earlier I linked: ','Compare this, ','→ ','']){
    const event=anchored.parse(line(`Syntheticplayer tells General:1, '${prefix}${actual} +3'`));
    assert.deepEqual(event?.items,[actual+' +3'],prefix);assert(!event.items[0].startsWith('Then '));
}
assert.deepEqual(anchored.parse(line("Syntheticplayer tells General:1, 'And then Everling Signet +3, that one.'"))?.items,[actual+' +3'],'Typed aliases resolve to the known item without preceding prose');
assert.deepEqual(anchored.parse(line("Syntheticplayer tells General:1, 'Tiny item: Eon +3'"))?.items,['Eon +3'],'Short known names remain supported');
for(const format of [escaped,native]){
    const unknown='Genuinely Uncatalogued Relic +3',event=anchored.parse(line(`Syntheticplayer tells General:1, 'Then ${format(unknown)} as promised.'`));
    assert.deepEqual(event?.items,[unknown],'Real encoded links retain exact unknown full-name boundaries');assert.equal(event.itemLinkFormat,undefined);
}
const noCatalog=new EQLogParser();
for(const payload of ['Then Signet Ring of Lord Everling +3','Please Consider Synthetic Relic +3','Synthetic Relic +3','Thornstinger +5','Ring +3 These Are Stats','[HP +3]','[Strength +3]','[Synthetic Spell +3]','[Unknown Relic +30]','[Unknown Relic +3.5]','[<script> +3]'])assert.equal(noCatalog.parse(line(`Syntheticplayer tells General:1, '${payload}'`)),null,payload+' has no reliable new-item boundary');
for(const payload of ['Look at [Uncatalogued Relic +3], please.','Look at "Uncatalogued Relic +3", please.','Then [Uncatalogued Relic] +3','Then "Uncatalogued Relic" +3']){
    assert.equal(noCatalog.parse(line(`Syntheticplayer tells General:1, '${payload}'`)),null,'Quoted/bracketed text cannot authenticate an unknown item');
}
for(const payload of [`${actual} +30`,`${actual} +3.5`,`${actual} +3foo`,`${actual} +3+4`,`${escaped('[Unknown Relic +3]',0)}`,`\\aPC 123 0:[Unknown Relic +3]\\/a`])assert.equal(anchored.parse(line(`Syntheticplayer tells General:1, '${payload}'`)),null,'Invalid rank/player/quest controls cannot fall through to a guessed identity: '+payload);
const ambiguousCatalog={items:[{name:'Shared Relic',wikiTitle:'First Relic'},{name:'Shared Relic',wikiTitle:'Second Relic'}]};
assert.equal(new EQLogParser({getPack:()=>ambiguousCatalog}).parse(line("Syntheticplayer tells General:1, 'Earlier Shared Relic +3'")),null,'Ambiguous typed catalog identities stay quiet');
const reloaded=new EQLogParser();assert.equal(reloaded.parse(line(`Syntheticplayer tells General:1, 'Then ${actual} +3'`)),null);reloaded.setLogIdentityPack(catalog);assert.deepEqual(reloaded.parse(line(`Syntheticplayer tells General:1, 'Then ${actual} +3'`))?.items,[actual+' +3'],'Native automatic reader pack updates also anchor chat identities');
const actualPrompts=[],knownDiscovery=createWikiDiscovery({storage:null,getPack:()=>catalog,now:()=>now,onMissing:prompt=>actualPrompts.push(prompt),verifyItem:()=>({status:'missing'})});
knownDiscovery.consume(anchored.parse(line(`Syntheticplayer tells General:1, 'Then ${actual} +3'`)),context());assert.deepEqual(actualPrompts,[],'The reported known-item chat cannot manufacture a missing Then-prefixed item notice');
console.log('Ranked chat boundaries: exact catalog names/aliases in prose, quiet unknown markers, authentic unknown links, ambiguous/unbounded/invalid negatives and native pack refresh passed.');

// Regression from reported discovery names, reproduced synthetically. A screenshot
// proves the bad name, not the original bytes or which log-link encoding ran.
const salesItems=['Brown Chitin Protector','Chitin Protector','Rubicite Breastplate','Breastplate'];
const salesPack={meta:{wikiEntitiesComplete:true,sample:false},items:salesItems.map(name=>({name,wikiTitle:name})),wikiEntities:{items:salesItems,npcs:[],titles:salesItems}};
salesPack.items[0].aliases=['Brown Protector'];
const salesParser=new EQLogParser({getPack:()=>salesPack});
const salesChat=text=>salesParser.parse(line(`Syntheticplayer auctions, '${text}'`));
for(const [label,canonical] of [['Free Brown Chitin Protector','Brown Chitin Protector'],['WTS FULL SET OF Rubicite Breastplate','Rubicite Breastplate'],['Please inspect Brown Protector','Brown Chitin Protector'],['Brown Chitin Protector available here','Brown Chitin Protector']]){
    assert.deepEqual(canonicalChatItemMatch(label,salesPack),{state:'matched',name:canonical,exact:false},label);
    for(const payload of [`[${label} +3]`,`"${label} +3"`,`[${label}] +3`,`"${label}" +3`])assert.deepEqual(salesChat(payload)?.items,[canonical+' +3'],payload);
}
for(const label of ['Brown Chitin Protector or Rubicite Breastplate','Rubicite Breastplate and Brown Protector']){
    assert.deepEqual(canonicalChatItemMatch(label,salesPack),{state:'ambiguous'});
    assert.equal(salesChat(`[${label} +3]`),null,'A marker containing distinct items must not arbitrarily choose the longest title');
}
const overlapping={items:[{name:'Shield of Fire'},{name:'Fire Walker'}]};
assert.deepEqual(canonicalChatItemMatch('Shield of Fire Walker',overlapping),{state:'ambiguous'},'Partially overlapping known identities have no unique item boundary');
assert.deepEqual(canonicalChatItemMatch('Earlier Shared Relic',ambiguousCatalog),{state:'ambiguous'},'An ambiguous longest alias cannot fall back to a shorter title');
for(const label of ['NotBrown Chitin Protector','Brown Chitin Protectorate','Brown Chitin Protectorβ','βBrown Chitin Protector','\u{10400}Brown Chitin Protector','Brown Chitin Protector\u{10400}'])assert.deepEqual(canonicalChatItemMatch(label,{items:[{name:'Brown Chitin Protector'}]}),{state:'none'},'Unicode word boundaries: '+label);
for(const payload of ['Free Brown Chitin Protector +3','WTS FULL SET OF Rubicite Breastplate +3'])assert.deepEqual(salesChat(payload)?.items,[payload.includes('Rubicite')?'Rubicite Breastplate +3':'Brown Chitin Protector +3']);
assert.deepEqual(salesChat('Brown Chitin Protector +3 Rubicite Breastplate +4')?.items,['Brown Chitin Protector +3','Rubicite Breastplate +4'],'Separate rank suffixes bind their own items');
assert.deepEqual(salesChat('Brown Chitin Protector +3 +4')?.items,['Brown Chitin Protector +3'],'An earlier rank token is not stripped to invent a second item boundary');
assert.deepEqual(salesChat('Brown Chitin Protector +3 (Exaltation) +4')?.items,['Brown Chitin Protector +3'],'A decorated earlier rank is not reused for a later rank token');
const genuineNames=['Free Brown Chitin Protector','Then Rubicite Breastplate','Free Spirit','Then and Now'];
const genuinePack={items:[...salesPack.items,...genuineNames.map(name=>({name,wikiTitle:name}))]},genuineParser=new EQLogParser({getPack:()=>genuinePack});
for(const name of genuineNames){
    assert.deepEqual(canonicalChatItemMatch(name,genuinePack),{state:'matched',name,exact:true},'A full title beats contained shorter catalog names');
    assert.deepEqual(canonicalChatItemMatch('Please inspect '+name+' here',genuinePack),{state:'matched',name,exact:false},'Surrounding prose never removes a genuine Free/Then title prefix');
    assert.deepEqual(genuineParser.parse(line(`Syntheticplayer says, '[${name} +3]'`))?.items,[name+' +3']);
    assert.deepEqual(genuineParser.parse(line(`Syntheticplayer says, '${name} +3'`))?.items,[name+' +3']);
}
const aliasOrderPack={items:[{name:'First Item',aliases:['A']},{name:'A Long Second Item',aliases:['Z']}]};
assert.deepEqual(new EQLogParser({getPack:()=>aliasOrderPack}).parse(line("Syntheticplayer says, 'A +3 Z +4'"))?.items,['First Item +3','A Long Second Item +4'],'Canonical alias lengths do not change source display order');
assert.deepEqual(canonicalChatItemMatch('Look: Staff of Elemental Mastery: Water, please',{items:[{name:'Staff of Elemental Mastery: Water'}]}),{state:'matched',name:'Staff of Elemental Mastery: Water',exact:false},'Punctuation inside a real item title stays intact');
for(const format of [escaped,native]){
    for(const name of ['Free Brown Chitin Protector','Then Rubicite Breastplate','Genuinely Uncatalogued Relic'])assert.deepEqual(salesChat(`Then ${format(name+' +3')} as promised.`)?.items,[name+' +3'],'Authentic encoded boundaries remain exact even when an unknown full title contains a known suffix');
}
for(const payload of ['[Uncatalogued Relic]','"Uncatalogued Relic"','Free Brown Chitin Protector','WTS FULL SET OF Rubicite Breastplate'])assert.equal(salesChat(payload),null,'Unranked flattened text does not invent an unknown item');
for(const payload of ['[Free Genuinely Unknown Blade +3]','"WTS FULL SET OF Uncatalogued Hauberk +4"','[Genuinely Unknown Blade] +3','"Genuinely Unknown Blade" +3'])assert.equal(salesChat(payload),null,'Even explicit text delimiters cannot establish a missing unknown item');
const salesPrompts=[],salesDiscovery=createWikiDiscovery({storage:null,getPack:()=>salesPack,now:()=>now,onMissing:prompt=>salesPrompts.push(prompt),verifyItem:()=>({status:'missing'})});
for(const payload of ['[Free Brown Chitin Protector +3]','"WTS FULL SET OF Rubicite Breastplate +3"'])salesDiscovery.consume(salesChat(payload),context());
assert.deepEqual(salesPrompts,[],'Reported marked sales prose resolves to known items, so it cannot create false missing-page notices');
assert.deepEqual(canonicalChatItemMatch('Free Brown Protector',salesPack),{state:'matched',name:'Brown Chitin Protector',exact:false},'Aliases share the same canonical result for queue reconciliation');
const plainProof=logContributionObservation({type:'item-link',item:'Example Gauntlets +5',itemLinkFormat:mention.itemLinkFormat,evidence:mention.evidence},mentionContext,{now});
assert.equal(plainProof.input.itemLinkFormat,'plain-tiered-chat','Evidence retains the parser interpretation rather than claiming an authenticated game link');
assert(mentionCandidate.evidence.some(e=>e.itemLinkFormat==='plain-tiered-chat'));
assert(createContributionQueue(options).snapshot().find(row=>row.name==='Example Gauntlets')?.evidence.some(e=>e.itemLinkFormat==='plain-tiered-chat'),'The flattened origin flag survives storage/reload');
assert(captured.candidates.every(candidate=>candidate.evidence.every(e=>e.itemLinkFormat===undefined)),'Authentic encoded links are not relabelled as flattened guesses');
console.log('Sales prose boundaries: reported bracket/quote variants, longest bounded titles/aliases, exact genuine Free/Then titles, disjoint/overlap ambiguity, Unicode word boundaries, encoded unknown preservation and downstream no-notice regression passed.');
