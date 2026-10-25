import {contributionTitle,contributionTemplates,contributionScopedTemplateInfo,contributionLootScopeText,contributionLootReferences} from './contribution-model.js';
import {normalizeWikiIdentity,wikiPageTitleKey} from './wiki-identity.js';
import {parseItemStatBlock} from './screen-read-parser.js';

const MAX_AGE=7*24*60*60*1000,MAX_SOURCE=512*1024;
const active=value=>String(value).replace(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*\/>|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*>[\s\S]*?(?:<\/\2\s*>|$)/gi,' ');
const title=value=>{try{return contributionTitle(value);}catch{return '';}};
const identity=record=>wikiPageTitleKey(record?.wikiTitle||record?.title||record?.name||record);
const statKeys={ac:'AC',hp:'HP',mana:'MP',endurance:'END',str:'STR',sta:'STA',agi:'AGI',dex:'DEX',wis:'WIS',int:'INT',cha:'CHA',weight:'WT',damage:'DMG',delay:'DELAY',range:'RANGE',backstabDamage:'BACKSTAB_DMG',damageBonus:'DMG_BONUS',resistMagic:'SV_MAGIC',resistFire:'SV_FIRE',resistCold:'SV_COLD',resistPoison:'SV_POISON',resistDisease:'SV_DISEASE',resistCorruption:'SV_CORRUPTION',hpRegen:'HP_REGEN',manaRegen:'MANA_REGEN',enduranceRegen:'END_REGEN',attack:'ATK',haste:'HASTE',attackSpeed:'HASTE',accuracy:'ACCURACY',avoidance:'AVOIDANCE'};
function literal(value){
    let text=active(value);if(/[{}]/.test(text))return null;
    text=text.replace(/<br\s*\/?>|<\/?p\s*>/gi,'\n').replace(/<\/?(?:b|strong|i|em)\s*>/gi,'');if(/[<>]/.test(text))return null;
    return text.replace(/\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g,(_all,name,label)=>label||name).replace(/'{2,}/g,'').replace(/&nbsp;/gi,' ').trim();
}
function field(card,name){const found=card.fields.filter(value=>value.name.toLowerCase()===name.toLowerCase());return found.length===1&&found[0].name===name?found[0].value:null;}
function withoutTemplates(value){
    let text=active(value),depth=0,start=0;const ranges=[];
    for(const token of text.matchAll(/\{\{|\}\}/g))if(token[0]==='{{'){if(!depth)start=token.index;depth++;}else if(depth&&!--depth)ranges.push([start,token.index+2]);
    if(depth)ranges.push([start,text.length]);for(const [a,b]of ranges.reverse())text=text.slice(0,a)+text.slice(a,b).replace(/[^\r\n]/g,' ')+text.slice(b);return text;
}
function rootCards(source,name){
    const text=active(source),cards=contributionTemplates(text,name),result=[];
    for(const card of cards){
        const invocation=text.slice(card.start+2).match(/^\s*(?:Template\s*:\s*)?([^|{}\r\n]+)/i)?.[1]?.trim().replace(/_/g,' ');
        if(!invocation||invocation[0].toUpperCase()+invocation.slice(1)!==name)continue;
        let depth=0;for(const token of text.slice(0,card.start).matchAll(/\{\{|\}\}/g))depth+=token[0]==='{{'?1:-1;
        if(depth===0)result.push(card);
    }
    return result;
}
function derive(entry){
    const source=active(entry.content),items=rootCards(source,'Itempage'),npcs=rootCards(source,'Namedmobpage');
    if(items.length&&npcs.length)return {entry,kind:null,variants:[]};
    const kind=items.length?'item':npcs.length?'npc':entry.categories.includes('Zones')?'zone':null,name=kind==='item'?'Itempage':'Namedmobpage',variants=[];
    if(kind==='item'&&items.length!==1)return {entry,kind,variants:[]};
    if(kind==='item'||kind==='npc')for(const instance of ['normal','raid'])try{
        const selected=contributionScopedTemplateInfo(source,name,instance);
        if(!(kind==='item'?items:npcs).some(card=>card.start===selected.template.start)||instance==='raid'&&selected.scope!=='raid')continue;
        const card=selected.template,record={name:entry.title,wikiTitle:entry.title,revisionId:entry.revision,aliases:entry.aliases,instanceType:instance,raidInstance:instance==='raid'};
        if(kind==='item'){
            const stats=field(card,'statsblock'),plain=stats===null?null:literal(stats),lines=plain===null?[]:plain.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
            record.stats=Object.fromEntries((plain===null?[]:parseItemStatBlock(plain).fields).filter(value=>statKeys[value.key]).map(value=>[statKeys[value.key],value.value]));
            record.displayLines=lines.slice(0,16).map(value=>value.slice(0,512));
            record.classes=(plain?.match(/^Class\s*:\s*([A-Z /]+)$/m)?.[1]||'').split(/[ /]+/).filter(value=>/^(?:ALL|NONE|WAR|CLR|PAL|RNG|SHD|DRU|MNK|BRD|ROG|SHM|NEC|WIZ|MAG|ENC|BST|BER)$/.test(value));
            record.slots=(plain?.match(/^Slot\s*:\s*([A-Z ]+)$/m)?.[1]||'').split(/\s+/).filter(value=>/^(?:PRIMARY|SECONDARY|RANGE|AMMO|ARMS|BACK|CHEST|EAR|FACE|FEET|FINGER|FINGERS|HANDS|HEAD|LEGS|NECK|SHOULDERS|WAIST|WRIST)$/.test(value));
            const icon=(field(card,'lucy_img_ID')??field(card,'lucy_img_id')??field(card,'icon_id')??'').trim();if(/^\d{1,7}$/.test(icon)&&Number(icon)>0)record.iconId=Number(icon);
            record.contributionCard={schemaVersion:1,complete:false,questContext:Boolean(field(card,'relatedquests')?.trim())};
        }else{
            const level=literal(field(card,'level')??'')?.match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?$/);
            if(level&&Number(level[1])>0&&Number(level[2]||level[1])>=Number(level[1])){record.levelMin=Number(level[1]);record.levelMax=Number(level[2]||level[1]);record.avgLevel=(record.levelMin+record.levelMax)/2;}
            const location=literal(field(card,'location')??'');if(location&&/^[+-]?\d+(?:\.\d+)?\s*,\s*[+-]?\d+(?:\.\d+)?(?:\s*,\s*[+-]?\d+(?:\.\d+)?)?$/.test(location))record.loc=location.split(',').map(Number);
        }
        const notes=literal(field(card,'notes')??'');if(notes)record.notes=notes.slice(0,16000);
        variants.push({instance,card,scope:selected.scope||'normal',record});
    }catch{/* Unsupported variants remain a presence fact only. */}
    return {entry,kind,variants};
}

// Only positive public facts enrich the local read model. The base snapshot,
// global source-count proofs and authored source bodies remain independent.
export function createLiveWikiOverlay({now=Date.now}={}){
    const memo=new Map();let memoBytes=0,previous=null,revisionBase=null,revisions=new Map(),countKeys=new Map();
    function apply(base,snapshot){
        if(Array.isArray(snapshot))snapshot={schemaVersion:1,entries:snapshot};
        if(!base||snapshot?.schemaVersion!==1||!Array.isArray(snapshot.entries))return base;
        if(revisionBase!==base){revisionBase=base;revisions=new Map();countKeys=new Map(Object.keys(base.lootSourceCounts||{}).map(key=>[wikiPageTitleKey(key),key]));for(const kind of ['items','npcs','zones'])for(const record of base[kind]||[])if(Number.isSafeInteger(record.revisionId))revisions.set(identity(record),Math.max(revisions.get(identity(record))||0,record.revisionId));}
        const entries=[];let bytes=0;
        for(const value of snapshot.entries.slice(-1000)){
            const fetched=Date.parse(value?.fetchedAt||''),name=title(value?.title);
            if(!name||value.namespace!==0||value.source!=='public-wiki'||value.origin!=='https://eqlwiki.com'||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.content!=='string'||value.content.length>MAX_SOURCE||new TextEncoder().encode(value.content).byteLength>MAX_SOURCE||!Number.isFinite(fetched)||fetched>now()+2000||now()-fetched>=MAX_AGE)continue;
            if((revisions.get(wikiPageTitleKey(name))||0)>=value.revision)continue;
            bytes+=new TextEncoder().encode(value.content).byteLength;if(bytes>32*1024*1024)break;
            entries.push({...value,title:name,categories:(Array.isArray(value.categories)?value.categories:[]).filter(value=>typeof value==='string'&&value.length<=240).slice(0,500),aliases:(Array.isArray(value.aliases)?value.aliases:[]).map(title).filter(Boolean).slice(0,32)});
        }
        const signature=JSON.stringify(entries.map(value=>[value.title,value.revision,value.sha256||value.content,value.categories,value.aliases]));
        if(previous?.base===base&&previous.signature===signature)return previous.pack;
        if(!entries.length){previous={base,signature,pack:base};return base;}
        const derived=entries.map(entry=>{
            const key=JSON.stringify([entry.title,entry.revision,entry.categories,entry.aliases]);let saved=memo.get(key);
            if(!saved||saved.source!==entry.content){
                let parsed;try{parsed=derive(entry);}catch{parsed={entry,kind:null,variants:[]};}
                if(saved)memoBytes-=saved.bytes;
                saved={source:entry.content,parsed,bytes:entry.content.length*2+key.length*2};memo.set(key,saved);memoBytes+=saved.bytes;
            }
            return {...saved.parsed,entry};
        });
        while(memo.size>1200||memoBytes>64*1024*1024){const key=memo.keys().next().value;memoBytes-=memo.get(key).bytes;memo.delete(key);}
        const lists={item:[...(base.items||[])],npc:[...(base.npcs||[])],zone:[...(base.zones||[])]},typed=new Map();
        const addIdentity=(kind,name,canonical)=>{const key=kind+'|'+normalizeWikiIdentity(name);if(!name)return;let values=typed.get(key);if(!values)typed.set(key,values=new Set());values.add(canonical);};
        for(const kind of ['item','npc','zone'])for(const record of lists[kind])for(const name of [record.name,record.wikiTitle,...(record.aliases||[])])addIdentity(kind,name,record.wikiTitle||record.name);
        // Flat category/catalog membership proves page presence, not a literal
        // Itempage/Namedmobpage. Only rich records or parsed cards prove types.
        for(const parsed of derived)if(parsed.kind)for(const name of [parsed.entry.title,...parsed.entry.aliases])addIdentity(parsed.kind,name,parsed.entry.title);
        const lookup=(kind,name)=>{const matches=typed.get(kind+'|'+normalizeWikiIdentity(name));return matches?.size===1?[...matches][0]:'';};
        const replace=(kind,record)=>{const index=lists[kind].findIndex(value=>identity(value)===identity(record)&&(kind!=='npc'||Boolean(value.raidInstance||value.instanceType==='raid')===record.raidInstance));if(index<0)lists[kind].push(record);else lists[kind][index]={...lists[kind][index],...record};};
        for(const parsed of derived){
            if(parsed.kind==='zone')replace('zone',{name:parsed.entry.title,wikiTitle:parsed.entry.title,revisionId:parsed.entry.revision,aliases:parsed.entry.aliases});
            for(const variant of parsed.variants){
                const record={...variant.record};
                if(parsed.kind==='npc'){
                    const raw=field(variant.card,'zone'),plain=raw===null?null:literal(raw),zone=plain&&!/[\n,;{}]/.test(plain)?lookup('zone',plain):'';
                    if(zone)record.zone=zone;
                    if(variant.instance==='normal'){const categoryZones=parsed.entry.categories.map(value=>lookup('zone',value)).filter(Boolean);if(categoryZones.length)record.categoryZones=[...new Set(categoryZones)];}
                }
                replace(parsed.kind,record);
            }
        }
        const incompleteCounts=new Set();
        function invalidateCount(item,npc=''){
            const countKey=countKeys.get(wikiPageTitleKey(item)),record=lists.item.find(value=>identity(value)===wikiPageTitleKey(item)),count=countKey?base.lootSourceCounts[countKey]:record;
            if(count?.lootSourceCountComplete===true&&(!npc||!Array.isArray(count.lootSourceNpcs)||!count.lootSourceNpcs.some(value=>wikiPageTitleKey(lookup('npc',value)||value)===wikiPageTitleKey(npc))))incompleteCounts.add(countKey||item);
        }
        // A newer Itempage can broaden its source field without naming a new
        // exact NPC. Its old complete global proof is no longer reusable.
        for(const parsed of derived)if(parsed.kind==='item')invalidateCount(parsed.entry.title);
        function taintUnknownMembers(value,npc,direct){
            const refs=[...active(value).matchAll(/\[\[\s*([^\]|#]+)(?:\|[^\]]*)?\]\]|\{\{\s*:\s*([^{}|\r\n]+)\s*\}\}/g)].map(match=>(match[1]||match[2]).trim()).slice(0,400);
            for(const ref of refs){
                const known=lookup('item',ref);if(known&&!direct.some(value=>wikiPageTitleKey(value)===wikiPageTitleKey(ref)))invalidateCount(known,npc);
                if(base.meta?.lootSetsVersion!==1||base.meta?.sample===true)continue;
                const set=base.lootSets?.[ref],members=set?.complete===true?set.items:set?.possibleItemsComplete===true?set.possibleItems:null;
                if(!Array.isArray(members)||members.length>2000)continue;
                for(const member of members){const canonical=title(member);if(canonical)invalidateCount(canonical,npc);}
            }
        }
        function addSource(item,npc,zone,instance,entry,field){
            const itemTitle=lookup('item',item),npcTitle=lookup('npc',npc);if(!itemTitle||!npcTitle)return;
            let index=lists.item.findIndex(value=>identity(value)===wikiPageTitleKey(itemTitle));if(index<0){lists.item.push({name:itemTitle,wikiTitle:itemTitle});index=lists.item.length-1;}
            const record=lists.item[index],sources=Array.isArray(record.dropSources)?record.dropSources:[],key=value=>JSON.stringify([wikiPageTitleKey(value.name),wikiPageTitleKey(value.zone||''),value.instanceType||value.instance||(value.raidInstance?'raid':'normal')]);
            invalidateCount(itemTitle,npcTitle);
            const source={name:npcTitle,...(zone?{zone}:{}),instanceType:instance,raidInstance:instance==='raid',lootSources:[{wikiTitle:entry.title,revisionId:entry.revision,field,instance}]};
            if(!sources.some(value=>key(value)===key(source)))lists.item[index]={...record,dropSources:[...sources,source]};
        }
        for(const parsed of derived)for(const variant of parsed.variants){
            const {card,instance,scope}=variant,{entry}=parsed;
            if(parsed.kind==='npc')for(const parameter of ['known_loot','common_loot']){
                const raw=field(card,parameter);if(raw===null)continue;
                const value=contributionLootScopeText(raw,instance,scope),supported=!/\{\||<table\b/i.test(value),direct=supported?contributionLootReferences(value).slice(0,200):[];
                taintUnknownMembers(value,entry.title,direct);if(!supported)continue;
                const record=lists.npc.find(value=>identity(value)===wikiPageTitleKey(entry.title)&&Boolean(value.raidInstance||value.instanceType==='raid')===(instance==='raid'));
                for(const item of direct)addSource(item,entry.title,record?.zone||'',instance,entry,parameter);
            }
            if(parsed.kind==='item'){
                const values=card.fields.filter(value=>['dropsfrom','drops_from'].includes(value.name));if(values.length!==1||/\{\||<table\b/i.test(values[0].value))continue;
                let zone='';const rows=withoutTemplates(contributionLootScopeText(values[0].value,instance,scope)).replace(/<li\b[^>]*>/gi,'\n* ').replace(/<\/(?:li|ul|ol)\s*>|<(?:ul|ol)\b[^>]*>|<br\s*\/?>/gi,'\n');
                for(const line of rows.split(/\r?\n/).slice(0,400)){
                    const header=line.trim().match(/^\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/),row=line.match(/^\s*[*#]+\s*\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/);
                    if(header){const knownZone=lookup('zone',header[1]);if(knownZone)zone=knownZone;else{zone=null;if(lookup('npc',header[1]))addSource(entry.title,header[1],'',instance,entry,values[0].name);}}
                    if(row&&zone!==null&&lookup('npc',row[1]))addSource(entry.title,row[1],zone,instance,entry,values[0].name);
                }
            }
        }
        const entities=base.wikiEntities||{},titles=[...(entities.titles||[])];for(const {entry}of derived){titles.push(entry.title);for(const alias of entry.aliases)titles.push({name:alias,wikiTitle:entry.title});}
        let counts=base.lootSourceCounts;
        if(incompleteCounts.size){
            if(counts){counts={...counts};for(const key of incompleteCounts)if(counts[key])counts[key]={...counts[key],lootSourceCountComplete:false};}
            lists.item=lists.item.map(record=>incompleteCounts.has(record.wikiTitle||record.name)?{...record,lootSourceCountComplete:false}:record);
        }
        const result={...base,items:lists.item,npcs:lists.npc,zones:lists.zone,wikiEntities:{...entities,titles},...(counts?{lootSourceCounts:counts}:{})};
        previous={base,signature,pack:result};return result;
    }
    return {apply};
}
const sharedOverlay=createLiveWikiOverlay();
export const applyLiveWikiOverlay=(base,entriesOrSnapshot)=>sharedOverlay.apply(base,entriesOrSnapshot);
