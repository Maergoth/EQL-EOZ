import {characterCatalogDetails} from './character-item-card.js';
import {characterItemboxTitleMarkup,characterItemboxBodyMarkup} from './character-itembox.js';
import {isItemStatModified,itemAccuracyIsPercent} from './item-stat-presentation.js';
import {catalogBaseStats} from './item-scaling.js';

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numericStats=values=>Object.fromEntries(Object.entries(values||{}).slice(0,64).flatMap(([key,value])=>{
    if(value===null)return [[key.slice(0,60),null]];
    const numeric=typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;
    return Number.isFinite(numeric)?[[key.slice(0,60),numeric]]:[];
}));

/** One catalog adapter for main loot/NPC/item hovers and native Intel. The
 * caller supplies already-adjusted values; rendering never changes a pack or
 * contributes catalog numbers to recorded Character totals. */
export function catalogItemboxMarkup(item={},options={}){
    const tier=Math.max(0,Math.min(10,Math.trunc(Number(options.tier??item.tier)||0)));
    const stats=numericStats(options.stats??item.stats),baseStats=numericStats(catalogBaseStats({...item,stats:options.baseStats??item.baseStats??item.stats}));
    const name=String(item.name||item.wikiTitle||'Unknown item').slice(0,240),title=String(item.wikiTitle||name).replace(/\s+\+\d+\s*$/,'');
    const label=tier?name.replace(/\s+\+\d+\s*$/,'')+' +'+tier:name;
    const modifiedKeys=Object.keys(stats).filter(key=>isItemStatModified(baseStats[key],stats[key],tier));
    const accuracyPercent=itemAccuracyIsPercent(item,baseStats,stats);
    const body=characterItemboxBodyMarkup({stats,baseStats,details:characterCatalogDetails(item),icon:options.icon??item.icon,slots:item.slots,modifiedKeys,accuracyPercent});
    const sources=options.showSources===true?(Array.isArray(item.dropSources)?item.dropSources:[]).slice(0,8).map(source=>escape([source?.zone,source?.name].filter(Boolean).join(' · '))).filter(Boolean):[];
    const footer=sources.length?'<div class="wiki-itembox-sources"><strong>Drops from</strong><br>'+sources.join('<br>')+'</div>':'';
    return '<section class="wiki-itembox">'+characterItemboxTitleMarkup(label,{title})+'<div class="character-itembox-body">'+body+footer+'</div></section>';
}
