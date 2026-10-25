// Effective authored coverage is a union, not a request to copy reciprocal
// fields. Positive facts survive an unsupported/broad surrounding field.
import {createWikiResolver,normalizeWikiIdentity,itemExaltationBaseIdentity} from './wiki-identity.js';
import {lootSetCoverage} from './loot-set-coverage.js';
import {contributionScopedTemplateInfo,contributionItemSourceMatches,patchContributionRelationship,contributionZoneLootScopeInfo,contributionItemHasStats,contributionLootScopeText,contributionLootReferences} from './contribution-model.js';
import {classifyCachedLoot} from './loot-classification.js';

const MAX=2000,scoped=value=>['normal','raid'].includes(value?.instance||value?.instanceType)?value.instance||value.instanceType:typeof value?.raidInstance==='boolean'?(value.raidInstance?'raid':'normal'):value?.instance||value?.instanceType?'unknown':'normal';
const active=text=>String(text).replace(/<!--[\s\S]*?(?:-->|$)|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*\/>|<(nowiki|pre|source|syntaxhighlight|ref|code)\b[^>]*>[\s\S]*?(?:<\/\2\s*>|$)/gi,' ');
const broad=text=>{
    const value=active(text).replace(/<\/?(?:ul|ol|li)\b[^>]*>|<br\s*\/?>/gi,'\n').replace(/\[\[[^\[\]\r\n]*\]\]|\{\{\s*:[^{}]*\}\}/g,'');
    if(/[{}]/.test(value))return false; // Unknown expansion remains unsupported.
    let grouped=false;
    for(const line of value.split(/\r?\n/)){
        const residual=line.replace(/[*#]|<[^>]*>|'{2,}/g,'').trim().replace(/_/g,' ');
        if(!residual||/^(?:\?|None|This item is not dropped by mobs\.)$/i.test(residual))continue;
        if(!/(?<![\p{L}\p{N}])(?:various|many|most|all|any|random|newbie|mobs?|monsters?|types|wing)(?![\p{L}\p{N}])|\b(?:common\s+)?drops?\s+from\s+low[ -]level\s+humanoids?\b/iu.test(residual))return false;
        grouped=true;
    }
    return grouped;
};
const validTitle=value=>typeof value==='string'&&value.trim()&&value.length<=240&&!/[\u0000-\u001f|#\[\]{}<>]/.test(value);
function canonical(resolver,kind,value){
    if(!validTitle(value))return null;
    const resolved=resolver.resolve(kind,kind==='item'?itemExaltationBaseIdentity(value):value);
    return resolved.membership==='ambiguous'?null:resolved.canonicalTitle||String(value).replace(/_/g,' ').trim();
}
export function contributionRelation(value={}, {pack={},resolver=createWikiResolver(pack)}={}){
    if(!['normal','raid'].includes(value.instance))return null;
    const relation={item:canonical(resolver,'item',value.itemTitle||value.item),npc:canonical(resolver,'npc',value.npcTitle||value.npc),zone:canonical(resolver,'zone',value.zoneTitle||value.zone),instance:value.instance};
    return relation.item&&relation.npc&&relation.zone?relation:null;
}
export function contributionRelationKey(value,options){const relation=contributionRelation(value,options);return relation?JSON.stringify([relation.item,relation.npc,relation.zone].map(normalizeWikiIdentity).concat(relation.instance)):null;}
const same=(resolver,kind,a,b)=>{const first=canonical(resolver,kind,a),second=canonical(resolver,kind,b);return Boolean(first&&second&&normalizeWikiIdentity(first)===normalizeWikiIdentity(second));};
const result=(state,reason,relation,proofs=[])=>({schemaVersion:1,state,reason,relation,proofs:proofs.slice(0,8)});
function typed(pack,kind,title,resolver){
    if(pack?.meta?.wikiRelationshipCoverageVersion!==1||pack.meta.sample===true)return null;
    const canonicalTitle=canonical(resolver,kind,title),map=pack.wikiRelationshipCoverage;
    if(!canonicalTitle||!map||typeof map!=='object'||Array.isArray(map))return null;
    const entry=map[canonicalTitle];
    return entry?.schemaVersion===1&&entry.kind===kind&&same(resolver,kind,entry.wikiTitle,canonicalTitle)&&Number.isSafeInteger(entry.revisionId)&&entry.revisionId>0?entry:null;
}
export function cachedContributionCoverage(pack={},value, {resolver=createWikiResolver(pack)}={}){
    const relation=contributionRelation(value,{resolver});if(!relation)return result('unknown','invalid-relation',null);
    if(pack.meta?.sample===true)return result('unknown','sample-dataset',relation);
    const item=resolver.resolve('item',relation.item);
    if(item.membership==='ambiguous')return result('unknown','ambiguous-item',relation);
    for(const record of item.records||[])for(const source of (Array.isArray(record.dropSources)?record.dropSources:[]).slice(0,MAX)){
        if(source.ambiguous===true||scoped(source)!==relation.instance||!same(resolver,'npc',source.name||source.npc,relation.npc))continue;
        if(source.zone&&!same(resolver,'zone',source.zone,relation.zone))continue;
        const authored=(Array.isArray(source.lootSources)?source.lootSources:[]).filter(proof=>validTitle(proof?.wikiTitle)&&Number.isSafeInteger(proof.revisionId)&&proof.revisionId>0).slice(0,8).map(proof=>({wikiTitle:proof.wikiTitle,revisionId:proof.revisionId,field:proof.field||'loot',instance:relation.instance}));
        return result('covered',source.zone?'cached-exact-source':'cached-unscoped-source',relation,authored.length?authored:[{wikiTitle:record.wikiTitle||record.name,revisionId:record.revisionId||null,field:'dropsfrom',instance:relation.instance}]);
    }
    const itemCoverage=typed(pack,'item',relation.item,resolver),npcCoverage=typed(pack,'npc',relation.npc,resolver);
    for(const entry of [itemCoverage,npcCoverage].filter(Boolean)){
        for(const edge of (Array.isArray(entry.edges)?entry.edges:[]).slice(0,MAX)){
            if(edge.ambiguous===true||scoped(edge)!==relation.instance)continue;
            if(entry.kind==='item'&&same(resolver,'npc',edge.npc,relation.npc)&&(!edge.zone||same(resolver,'zone',edge.zone,relation.zone))||entry.kind==='npc'&&same(resolver,'item',edge.item,relation.item)&&(!edge.zone||same(resolver,'zone',edge.zone,relation.zone)))return result('covered','cached-authored-edge',relation,[{wikiTitle:entry.wikiTitle,revisionId:entry.revisionId,field:edge.field||'',instance:relation.instance}]);
        }
        for(const ref of (Array.isArray(entry.collectionRefs)?entry.collectionRefs:[]).slice(0,MAX)){
            if(entry.kind!=='npc'||ref.ambiguous===true||ref.complete!==true||scoped(ref)!==relation.instance||ref.zone&&!same(resolver,'zone',ref.zone,relation.zone))continue;
            const coverage=lootSetCoverage(pack,relation.item,[ref.title||ref.setTitle||ref.item],{resolver});
            if(coverage)return result('covered','cached-complete-set',relation,[{wikiTitle:entry.wikiTitle,revisionId:entry.revisionId,setTitle:coverage.setTitle},...(Number.isSafeInteger(ref.collectionSource?.revisionId)&&ref.collectionSource.revisionId>0?[{wikiTitle:ref.collectionSource.wikiTitle,revisionId:ref.collectionSource.revisionId,field:'finite-collection'}]:[])]);
        }
    }
    // Broad/qualified source fields cannot establish absence for a new exact
    // edge. Preserve authored group intent and retain one useful item review.
    if(itemCoverage){
        const scopes=(Array.isArray(itemCoverage.scopes)?itemCoverage.scopes:[]).slice(0,MAX).filter(scope=>scoped(scope)===relation.instance);
        if(scopes.some(scope=>scope.state==='broad')||itemCoverage.state==='broad')return result('broad','authored-broad-item-sources',relation);
        if(scopes.some(scope=>['unsupported','variant'].includes(scope.state))||['unsupported','variant'].includes(itemCoverage.state))return result('unsupported','unsupported-item-sources',relation);
    }
    if(npcCoverage){
        const classification=classifyCachedLoot(pack,relation.item,[relation.npc],{resolver}),field=classification.kind==='common'?'common_loot':classification.kind==='unique'?'known_loot':null;
        const scopes=(Array.isArray(npcCoverage.scopes)?npcCoverage.scopes:[]).slice(0,MAX).filter(scope=>scoped(scope)===relation.instance&&(!scope.zone||same(resolver,'zone',scope.zone,relation.zone))&&(!field||scope.field===field));
        if(scopes.some(scope=>scope.state==='broad'))return result('broad','authored-broad-loot',relation);
        if(scopes.some(scope=>['unsupported','variant'].includes(scope.state)))return result('unsupported','unsupported-loot-scope',relation);
    }
    return result('unknown','no-positive-coverage',relation);
}

// A field may contain internal normal/raid headings even when the outer card
// is normal. Preserve their strict boundary for both broad intent and positives.
function fieldScope(value,instance,outer='normal'){
    return contributionLootScopeText(value,instance,outer);
}
function selectedFields(source,name,instance,names){
    const {template,scope}=contributionScopedTemplateInfo(source,name,instance),fields=template.fields.filter(field=>names.includes(field.name.toLowerCase()));
    if(new Set(fields.map(field=>field.name.toLowerCase())).size!==fields.length||name==='Itempage'&&fields.length>1)throw Error('Duplicate relationship fields');
    return fields.map(field=>({...field,value:fieldScope(field.value,instance,scope||'normal')}));
}
function literalReferenceText(text){
    let value=text,depth=0,start=0;const ranges=[];
    for(const match of text.matchAll(/\{\{|\}\}/g)){
        if(match[0]==='{{'){if(depth===0)start=match.index;depth++;}
        else if(depth){depth--;if(!depth&&!/^\{\{\s*:\s*[^{}|\r\n]+\s*\}\}$/.test(text.slice(start,match.index+2)))ranges.push([start,match.index+2]);}
    }
    if(depth)ranges.push([start,text.length]);for(const [a,b]of ranges.reverse())value=value.slice(0,a)+' '.repeat(b-a)+value.slice(b);
    return value;
}
function literalReferences(text){
    return [...literalReferenceText(text).matchAll(/\{\{\s*:\s*([^{}|\r\n]+)\s*\}\}|\[\[\s*([^\]|\r\n]+)(?:\|[^\]\r\n]*)?\]\]/g)].map(match=>(match[1]||match[2]).trim()).slice(0,MAX);
}
// A literal displayed loot row may name several items or an explicit quantity
// of a collection. Links in a trailing rarity/quest note are not loot facts.
function npcLiteralReferences(text){
    return contributionLootReferences(text);
}
export function liveContributionCoverage(pack={},value,{itemPage,npcPage,resolver=createWikiResolver(pack)}={}){
    const relation=contributionRelation(value,{resolver});if(!relation)return result('unknown','invalid-relation',null);
    const proof=(page,field)=>[{wikiTitle:page.title,revisionId:page.revision||null,field,instance:relation.instance}];
    let itemIntent=itemPage&&(itemPage.missing||typeof itemPage.content!=='string'||itemPage.content.length>512*1024)?result('unsupported','unavailable-item-source',relation):null;
    if(itemPage&&!itemPage.missing&&typeof itemPage.content==='string'&&itemPage.content.length<=512*1024){
        try{
            const fields=selectedFields(itemPage.content,'Itempage',relation.instance,['dropsfrom','drops_from']);
            for(const field of fields){
                const comparable=(relation.instance==='raid'?'== Raid Instance ==\n':'')+'{{Itempage|dropsfrom='+field.value+'}}';
                if(contributionItemSourceMatches(comparable,{npcTitle:relation.npc,zoneTitle:relation.zone,instance:relation.instance}))return result('covered','live-exact-source',relation,proof(itemPage,field.name));
                // An unscoped bare NPC link already records the relation. A
                // zone heading makes subsequent bullets scoped; no guessing
                // from family labels, qualifiers or template-generated text.
                let zoneHeading='';
                const rows=literalReferenceText(field.value).replace(/<li\b[^>]*>/gi,'\n* ').replace(/<\/(?:li|ul|ol)\s*>|<(?:ul|ol)\b[^>]*>|<br\s*\/?>/gi,'\n');
                for(const line of rows.split(/\r?\n/)){
                    const trimmed=line.trim(),link=trimmed.match(/^\[\[([^|\]#]+)(?:\|[^\]]*)?\]\]$/),bullet=trimmed.match(/^[*#]+\s*\[\[([^|\]#]+)(?:\|[^\]]*)?\]\]/);
                    if(link){if(same(resolver,'npc',link[1],relation.npc)&&!zoneHeading)return result('covered','live-unscoped-source',relation,proof(itemPage,field.name));zoneHeading=link[1];}
                    if(bullet&&same(resolver,'npc',bullet[1],relation.npc)&&(!zoneHeading||same(resolver,'zone',zoneHeading,relation.zone)))return result('covered',zoneHeading?'live-exact-source':'live-unscoped-source',relation,proof(itemPage,field.name));
                }
                if(broad(field.value))itemIntent=result('broad','authored-broad-item-sources',relation);
                else{
                    const remainder=field.value.replace(/\[\[[^\]\n]+\]\]/g,'').replace(/<\/?(?:ul|ol|li|br)\b[^>]*>/gi,'').replace(/^[*#;:\s-]+/gm,'').trim();
                    if(remainder&&!/^(?:[?]|None)$/i.test(remainder))itemIntent=result('unsupported','unsupported-item-sources',relation);
                }
            }
            if(!fields.length)itemIntent=result('unsupported','missing-item-source-field',relation);
        }catch{itemIntent=result('unsupported','unsupported-item-sources',relation);}
    }
    if(!npcPage||npcPage.missing)return result('unknown','unknown-monster',relation);
    if(typeof npcPage.content!=='string'||npcPage.content.length>512*1024)return result('unsupported','unsupported-loot-scope',relation);
    try{
        const fields=selectedFields(npcPage.content,'Namedmobpage',relation.instance,['known_loot','common_loot']);
        for(const field of fields){
            const references=npcLiteralReferences(field.value);
            if(references.some(title=>same(resolver,'item',title,relation.item)))return result('covered','live-authored-loot',relation,proof(npcPage,field.name));
            const set=lootSetCoverage(pack,relation.item,references,{resolver});
            if(set)return result('covered','live-complete-set',relation,[{...proof(npcPage,field.name)[0],setTitle:set.setTitle}]);
        }
        if(itemIntent)return itemIntent;
        const classification=classifyCachedLoot(pack,relation.item,[relation.npc],{resolver}),destination=classification.kind==='common'?'common_loot':classification.kind==='unique'?'known_loot':null;
        const target=destination?fields.filter(field=>field.name.toLowerCase()===destination):fields;
        if(!target.length)return result('unsupported','missing-loot-destination-field',relation);
        if(target.some(field=>broad(field.value)))return result('broad','authored-broad-loot',relation);
        const selected=contributionScopedTemplateInfo(npcPage.content,'Namedmobpage',relation.instance);
        const rawLoot=selected.template.fields.filter(field=>destination?field.name.toLowerCase()===destination:['known_loot','common_loot'].includes(field.name.toLowerCase()));
        if(relation.instance==='raid'&&selected.scope!=='raid'||rawLoot.some(field=>/^={1,6}[^\r\n]*\b(?:raid|normal)[ _]+(?:instance|zone)\b/im.test(active(field.value))))return result('unsupported','unsupported-loot-scope',relation);
        // Literal structured lists are the supported append-only destination.
        // Unknown nested templates, prose qualifiers and dynamic fields require
        // review; finite item/set transclusions themselves remain supported.
        for(const field of target){
            if(/^\s*(?:[?]|(?:\*\s*)?None|<ul>\s*<li>\s*None\s*<\/li>\s*<\/ul>)?\s*$/i.test(field.value))continue;
            const remainder=field.value.replace(/\{\{\s*:\s*[^{}|]+\s*\}\}|\[\[[^\]\n]+\]\]/g,'').replace(/<\/?(?:ul|ol|li|br)\b[^>]*>/gi,'').replace(/^[*#;:\s-]+/gm,'').trim();
            if(remainder)return result('unsupported','unsupported-loot-field',relation);
        }
        return result('uncovered','supported-new-loot',relation,proof(npcPage,'loot'));
    }catch{return result('unsupported','unsupported-loot-scope',relation);}
}

// This is a separate summary fact, eligible only alongside a new source. It
// never repairs an old display gap and never invents a missing zone section.
export function automaticZoneLootSummary(pack,value,{zonePage,itemPage,resolver=createWikiResolver(pack)}={}){
    const relation=contributionRelation(value,{resolver});
    if(!relation||zonePage?.missing||zonePage?.title!==relation.zone||zonePage.namespace!==undefined&&zonePage.namespace!==0||zonePage.title.includes(':')&&zonePage.namespace!==0||typeof zonePage.content!=='string'||zonePage.content.length>512*1024||!Number.isSafeInteger(zonePage.revision)||zonePage.revision<1||classifyCachedLoot(pack,relation.item,[relation.npc],{resolver}).kind!=='unique'||!contributionItemHasStats(pack,relation.item))return null;
    if(itemPage&&(itemPage.missing||itemPage.namespace!==undefined&&itemPage.namespace!==0||itemPage.title?.includes(':')&&itemPage.namespace!==0||!contributionItemHasStats({},relation.item,itemPage.content)))return null;
    try{
        const scope=contributionZoneLootScopeInfo(zonePage.content,'unique',{instance:relation.instance});if(!scope)return null;
        const text=active(scope.value),remainder=text.replace(/\{\{\s*:\s*[^{}|]+\s*\}\}|\[\[[^\]\n]+\]\]/g,'').replace(/<\/?(?:ul|ol|li|br)\b[^>]*>/gi,'').replace(/^[*#;:\s-]+/gm,'').trim();
        if(remainder&&!/^(?:[?]|None|Unknown|n\/?a)$/i.test(remainder))return null;
        for(const title of literalReferences(text)){
            const item=resolver.resolve('item',title);
            if(item.membership!=='ambiguous'&&item.records?.length)continue;
            const collections=pack?.meta?.lootSetsVersion===1&&pack.lootSets&&typeof pack.lootSets==='object'&&!Array.isArray(pack.lootSets)?Object.entries(pack.lootSets):[];
            if(collections.length>20000||!collections.some(([name,entry])=>same(resolver,'item',name,title)&&entry?.complete===true&&Array.isArray(entry.items)&&entry.items.length&&entry.items.length<=1000&&lootSetCoverage(pack,entry.items[0],[name],{resolver})))return null;
        }
        const patch=patchContributionRelationship(zonePage.content,{role:'zone-loot',itemTitle:relation.item,npcTitle:relation.npc,zoneTitle:relation.zone,instance:relation.instance,lootKind:'unique',preserveExisting:true},{pack,resolver,itemStats:{[relation.item]:true}});
        return patch.changed?patch.text:null;
    }catch{return null;}
}

export function validateAutomaticSourcePlan(plan,{pack={},resolver=createWikiResolver(pack)}={}){
    const source=plan?.automaticSource,relation=contributionRelation(source||{},{resolver});
    if(!relation||source.schemaVersion!==2||source.authorRole!=='npc-loot'||!['explicit-corpse','recent-kill'].includes(source.evidence)||typeof source.observationId!=='string'||!source.observationId||source.observationId.length>240||!/^[a-f0-9]{64}$/.test(source.relationKey||'')||source.account?.id!==plan.expectedUser?.id||source.account?.name!==plan.expectedUser?.name||plan.blockers?.length||plan.attachment||!Array.isArray(plan.pages)||plan.pages.length<1||plan.pages.length>2)throw Error('This saved automatic source plan needs a fresh review under the one-author contribution rules.');
    const page=plan.pages[0],proof=classifyCachedLoot(pack,relation.item,[relation.npc],{resolver});
    if(page.title!==relation.npc||page.role!=='primary'||page.operation!=='replace-reviewed'||typeof page.beforeText!=='string'||typeof page.afterText!=='string'||!Number.isSafeInteger(page.baseRevision)||page.baseRevision<1||!proof.kind||plan.lootClassifications?.[relation.item]?.kind!==proof.kind)throw Error('The source update requires manual review.');
    const before=liveContributionCoverage(pack,relation,{resolver,npcPage:{title:relation.npc,content:page.beforeText,revision:page.baseRevision,missing:false}});
    if(before.state!=='uncovered')throw Error('This automatic plan would refine a covered or unsupported authored loot field.');
    const expected=patchContributionRelationship(page.beforeText,{role:'npc-loot',itemTitle:relation.item,npcTitle:relation.npc,instance:relation.instance,lootKind:proof.kind,preserveExisting:true},{pack,resolver}).text.replace(/\0/g,'').replace(/[ \t\n\r\v]+$/,'').replace(/\r\n?/g,'\n');
    if(expected!==page.afterText)throw Error('This plan contains changes beyond appending the observed monster loot fact.');
    if(plan.pages.length===2){
        const summary=plan.pages[1];
        if(summary.title!==relation.zone||summary.role!=='zone-loot'||summary.operation!=='replace-reviewed'||typeof summary.beforeText!=='string'||typeof summary.afterText!=='string')throw Error('The optional zone summary requires manual review.');
        const expectedSummary=automaticZoneLootSummary(pack,relation,{resolver,zonePage:{title:summary.title,content:summary.beforeText,revision:summary.baseRevision,missing:false}});
        if(!expectedSummary||expectedSummary.replace(/\0/g,'').replace(/[ \t\n\r\v]+$/,'').replace(/\r\n?/g,'\n')!==summary.afterText)throw Error('This plan contains changes beyond the independently eligible zone Unique Items summary.');
    }
    return true;
}
