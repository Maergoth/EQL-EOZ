import assert from 'node:assert/strict';
import { createCharacterModel, characterLooseCandidates, CHARACTER_SLOTS } from '../app/character-model.js';
import { characterCatalogCard } from '../app/character-catalog.js';
import { characterItemLabel, characterEquipmentMarkup, characterLooseInventoryMarkup, characterIdentityMarkup, characterStatSummaryMarkup, characterItemTooltipMarkup, characterTierControlsMarkup, characterItemStatBodyMarkup, CHARACTER_EQUIPMENT_ROWS } from '../app/character-inventory-view.js';

const model=createCharacterModel({storage:null}),item={name:'Synthetic Earring',wikiTitle:'Synthetic Earring',slots:['EAR'],stats:{HP:10},statsComplete:true,augmentStatus:'none'};
const first=model.intake({item:characterCatalogCard(item,{tier:0})}).candidate,second=model.duplicateCandidate(first.id).candidate;
const unknown=model.intake({item:{name:'Unmatched <item> +5',tier:5,slots:['NECK'],observedStats:{HP:75}}}).candidate;
model.setStatSnapshot('base',{stats:{HP:100},confirmed:true});assert(model.assign(first.id,'ear1').ok);
assert.equal(characterItemLabel({name:'Synthetic Item +5 +5',tier:5}),'Synthetic Item +5');
assert.equal(characterItemLabel({name:'Synthetic Item',tier:null}),'Synthetic Item · tier unknown');
const snapshot=model.snapshot(),board=characterEquipmentMarkup(snapshot),loose=characterLooseCandidates(snapshot),bag=characterLooseInventoryMarkup(loose,unknown.id);
assert.deepEqual(new Set(CHARACTER_EQUIPMENT_ROWS.flat()),new Set(CHARACTER_SLOTS.map(slot=>slot.id)),'Modern board contains every canonical slot exactly once');
assert.equal((board.match(/data-slot-id=/g)||[]).length,25);assert(board.includes('data-equipped-card="ear1"'));assert(!board.includes('<select'));
assert(!loose.some(card=>card.id===first.id));assert(loose.some(card=>card.id===second.id));assert(bag.includes('is-unmatched'));assert(bag.includes('data-item-unmatched'));assert(!bag.includes('Unmatched <item>'));
assert(!model.assign(unknown.id,'neck',{allowIncompatible:true}).ok,'unmatched cannot use an override to enter the board');
assert(characterStatSummaryMarkup(model.totals()).includes('>110<'));
assert.equal((characterStatSummaryMarkup(model.totals()).match(/data-summary-stat="HP"/g)||[]).length,1);assert(!characterStatSummaryMarkup(model.totals()).includes('data-summary-stat="HP_MAXIMUM"'));
model.setStatSnapshot('base',{stats:{HP:90,HP_MAXIMUM:200},confirmed:true});const maximum=characterStatSummaryMarkup(model.totals());assert(maximum.includes('data-summary-stat="HP_MAXIMUM"'));assert(!maximum.includes('data-summary-stat="HP"'));model.setStatSnapshot('base',{stats:{HP:100},confirmed:true});
model.unassign('ear1');assert(characterLooseCandidates(model.snapshot()).some(card=>card.id===first.id));assert(characterStatSummaryMarkup(model.totals()).includes('>100<'));
const header=characterIdentityMarkup({name:'Example <Name>',level:65,classes:['WAR','CLR'],server:'Example',race:'Human',aaCount:42});assert(header.includes('42 AAs'));assert(header.includes('Level 65'));assert(header.includes('&lt;Name&gt;'));assert(!header.includes('<img'));
const tooltip=characterItemTooltipMarkup({...unknown,observedName:'Screen name +5'});assert(tooltip.includes('HP'));assert(tooltip.includes('75'));assert(tooltip.includes('Match this item'));assert(tooltip.includes('Screen name +5'));assert(!tooltip.includes('<item>'));
model.setStatSnapshot('base',{stats:{AC_MITIGATION:20,ATK:77},confirmed:true});const partialAc=characterStatSummaryMarkup(model.totals());assert(partialAc.includes('data-summary-stat="ATK"'));assert(!partialAc.includes('data-summary-stat="AC"'));
model.setStatSnapshot('base',{stats:{ATK_OFFENSE:30,AC:88},confirmed:true});const partialAtk=characterStatSummaryMarkup(model.totals());assert(partialAtk.includes('data-summary-stat="AC"'));assert(!partialAtk.includes('data-summary-stat="ATK"'));
console.log('Character inventory presentation: complete compact board, one tier label, escaped item names, unresolved warning, disjoint physical copies, live totals and identity/AA fallback passed.');

const controls=characterTierControlsMarkup(unknown);assert(controls.includes('data-card-tier'));assert(controls.includes('data-card-fraction'));assert(controls.includes('max="31"'));assert(!controls.includes('<details'));assert(board.includes('data-slot-id="any1"'));assert(board.includes('data-slot-id="any2"'));
assert.equal(model.setTierPreview(first.id,{tier:2,fraction:0}).ok,true);const preview=model.snapshot().candidates.find(card=>card.id===first.id);const previewMarkup=characterItemStatBodyMarkup(preview);assert(previewMarkup.includes('is-scaled'));assert(previewMarkup.includes('Preview from wiki base stats'));assert(characterItemStatBodyMarkup({...preview,slotReadWarning:'Conflicting slot &lt;value&gt;'}).includes('Conflicting slot &amp;lt;value&amp;gt;'));
