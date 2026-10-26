import {CHARACTER_SLOTS,normalizeCharacterCandidate,normalizeCharacterAugment,characterCatalogPatch} from './character-model.js';
import {INVENTORY_STREAM_LIMITS} from './inventory-stream-parser.js';

const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const slots=new Map(CHARACTER_SLOTS.filter(slot=>slot.id!=='charm').map(slot=>[slot.id,slot]));
const groups=new Set(['equipment','inventory','bank','shared-bank','personal-depot','held','augment','keyring']);
const exact=value=>String(value??'').normalize('NFKC').replace(/_/g,' ').replace(/\s+/gu,' ').trim().toLowerCase();
const rowError=()=>{throw Error('The inventory export contains an invalid physical item row.');};
function validate(entry,{empty=false}={}){
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.location!=='string'||!entry.location.trim()||entry.location.length>180||typeof entry.name!=='string'||entry.name.length>240||typeof entry.baseName!=='string'||entry.baseName.length>240||/[\u0000-\u001f\u007f]/u.test(entry.location+entry.name+entry.baseName)||!Number.isSafeInteger(entry.itemId)||entry.itemId<0||entry.itemId>2147483647||!Number.isInteger(entry.count)||entry.count<0||entry.count>1e9||!Number.isInteger(entry.tier)||entry.tier<0||entry.tier>10)rowError();
    const rank=/\s+\+(10|[0-9])$/u.exec(entry.name);
    if(entry.baseName!==(rank?entry.name.slice(0,rank.index).trimEnd():entry.name)||entry.tier!==(rank?Number(rank[1]):0))rowError();
    if(entry.empty===true){if(!empty||entry.itemId!==0||entry.count!==0||entry.name&&entry.name!=='Empty')rowError();}
    else if(!entry.itemId||!entry.count||!entry.name.trim()||entry.name==='Empty')rowError();
    return entry;
}

/** Exact old physical binding, independent of canonical display title. The
 * caller supplies occurrence from its indexed source rows (usually zero).
 * Socket keys use the parent's full physical key and sparse export position.
 */
export function inventoryOriginKey(entry,{slot=entry?.slot,occurrence=0,parentKey=null,sourceSlot=entry?.sourceSlot}={}){
    validate(entry,{empty:true});
    if(!Number.isSafeInteger(occurrence)||occurrence<0)rowError();
    if(parentKey!==null){
        if(typeof parentKey!=='string'||!parentKey||!Number.isInteger(sourceSlot)||sourceSlot<1||sourceSlot>1e6)rowError();
        return JSON.stringify([parentKey,'socket',sourceSlot,entry.itemId,entry.tier]);
    }
    if(slot!==null&&slot!==undefined&&!slots.has(slot)||!groups.has(entry.group)||Boolean(slot)!==(entry.group==='equipment'))rowError();
    return JSON.stringify([slot||entry.group,entry.location,entry.itemId,entry.tier,occurrence]);
}

export function inventoryLooseGroup(entry){
    return /\(Exaltation\)$/iu.test(entry.baseName)?'augment':entry.group==='augment'?'inventory':entry.group;
}

/** Only one bounded direct-child group is materialized. SQL can supply the
 * aggregate childCount/allChildrenAreLeafSingles before fetching <=8 rows.
 * Returning separate contents makes no claim that an unknown parent is a bag.
 */
export function prepareInventoryParent(entry,children=[],{parentKind='unknown',childCount=children.length,allChildrenAreLeafSingles}={}){
    validate(entry,{empty:true});
    if(!['equipment','container','unknown'].includes(parentKind)||!Array.isArray(children)||!Number.isSafeInteger(childCount)||childCount<children.length||children.length>INVENTORY_STREAM_LIMITS.observedSockets+1)rowError();
    const value=clone(entry);
    // A prior grouping result must never leak into a fresh raw-row decision.
    delete value.augments;delete value.augmentSlots;delete value.contentsSeparate;
    if(!childCount)return parentKind==='container'?{entry:{...value,contentsSeparate:'container'},attached:false}:{entry:value,attached:false};
    if(parentKind==='equipment'&&childCount>children.length&&typeof allChildrenAreLeafSingles!=='boolean')throw Error('Complete direct-child classification is required for stored equipment.');
    const leafSingles=allChildrenAreLeafSingles===undefined
        ?childCount===children.length&&children.every(child=>!child.hasChildren&&(child.empty||child.count===1))
        :allChildrenAreLeafSingles===true;
    const socketParent=!entry.empty&&parentKind!=='container'&&(Boolean(entry.slot)||parentKind==='equipment'&&leafSingles);
    if(!socketParent)return {entry:{...value,contentsSeparate:parentKind==='container'?'container':'unverified'},attached:false};
    if(childCount>INVENTORY_STREAM_LIMITS.observedSockets)throw Error(`The inventory export contains an unsupported Exaltation layout for ${entry.name} at ${entry.location} (maximum ${INVENTORY_STREAM_LIMITS.observedSockets} observed sockets).`);
    if(children.length!==childCount||children.some(child=>child.hasChildren))throw Error('The inventory export contains an unsupported nested socket layout.');
    const seen=new Set();
    value.augmentSlots=childCount;
    value.augments=children.map((child,index)=>{
        validate(child,{empty:true});
        if(!Number.isInteger(child.sourceSlot)||child.sourceSlot<1||child.sourceSlot>1e6||seen.has(child.sourceSlot))rowError();
        seen.add(child.sourceSlot);
        return {...clone(child),index,sourceSlot:child.sourceSlot,group:'augment',slot:null};
    });
    return {entry:value,attached:true};
}

/** Resolve only an exact authored name or a positively identified supported
 * export alias. A resolver's fuzzy choice cannot invent an item identity.
 */
export function inventoryCatalogPatch(entry,resolution){
    const item=resolution?.item;
    const name=exact(entry.baseName),exaltation=entry.group==='augment'&&resolution?.exaltationAlias===true&&/\s*\(Exaltation\)$/iu.test(entry.baseName)?exact(entry.baseName.replace(/\s*\(Exaltation\)$/iu,'')):null;
    const exported=resolution?.exportNameAlias===true&&/[^*]\*$/u.test(entry.baseName)?exact(entry.baseName.slice(0,-1).trim()):null;
    return item&&[item.name,item.wikiTitle].some(value=>value&&(exact(value)===name||exaltation&&exact(value)===exaltation||exported&&exact(value)===exported))?characterCatalogPatch(item,{match:'exact',icon:resolution.icon}):null;
}

/** Merge one physical card using the same normalization and catalog patch as
 * Character. No whole-inventory scan, sequence allocation, storage or mutation
 * occurs here. Existing IDs/manual values/evidence survive physical reimports.
 * Every unknown raw row must separately remain in the database generation.
 */
export function mergeImportedInventoryRow({entry,children=entry?.augments||[],previousCard=null,resolution=null,catalogItem=null,icon,id,now,occurrence=0,resolveItem}={}){
    validate(entry,{empty:true});
    if(!groups.has(entry.group)||entry.slot&&!slots.has(entry.slot)||!Array.isArray(children)||children.length>INVENTORY_STREAM_LIMITS.observedSockets||!Number.isSafeInteger(now)||now<0||now>8.64e15)rowError();
    const originKey=inventoryOriginKey(entry,{occurrence}),rejected=[];
    if(previousCard){
        const prior=previousCard.inventoryOrigin;
        const legacyRole=entry.group==='augment'&&!entry.slot&&prior&&['inventory','bank','shared-bank','personal-depot','held'].includes(prior.group)&&prior.location===entry.location&&prior.itemId===entry.itemId&&prior.tier===entry.tier&&prior.baseName===entry.baseName;
        if(!prior||prior.key!==originKey&&!legacyRole)throw Error('A saved item does not match this physical inventory binding.');
    }
    if(entry.empty)return {card:null,known:false,slot:null,originKey,rejected};
    const physical={...clone(entry),slot:entry.slot||null,key:originKey};
    if(entry.contentsSeparate!==undefined&&(!['container','unverified'].includes(entry.contentsSeparate)||children.length||entry.augments!==undefined||entry.augmentSlots!==undefined))rowError();
    const socketChildren=children.map((value,index)=>{
        const child=value.entry||value;validate(child,{empty:true});
        if(child.index!==undefined&&child.index!==index||child.augments!==undefined||!Number.isInteger(child.sourceSlot)||child.sourceSlot<1||child.sourceSlot>1e6)rowError();
        return {entry:{...clone(child),index,group:'augment',slot:null,key:inventoryOriginKey(child,{parentKey:originKey})},resolution:value.entry?value.resolution:undefined};
    });
    if(new Set(socketChildren.map(value=>value.entry.sourceSlot)).size!==socketChildren.length)rowError();
    const hasSockets=entry.augments!==undefined||entry.augmentSlots!==undefined||children.length>0;
    if(hasSockets&&(entry.augmentSlots!==socketChildren.length||entry.augments!==undefined&&!Array.isArray(entry.augments)))rowError();
    const getPatch=(row,provided)=>inventoryCatalogPatch(row,provided??(typeof resolveItem==='function'?resolveItem(clone(row)):null));
    const patch=getPatch(physical,resolution||(catalogItem?{item:catalogItem,icon}:null)),previous=previousCard?clone(previousCard):null;
    const reject=(row,reason='wiki-item-missing',slot=physical.slot)=>rejected.push({name:row.name,baseName:row.baseName,tier:row.tier,itemId:row.itemId,location:row.location,...(slot?{slot}:{}),reason});
    const socketPatch={};
    if(entry.contentsSeparate){
        const manual=(previous?.augments||[]).filter(augment=>!augment.inventoryOrigin);
        const provenEmpty=entry.contentsSeparate==='container'&&!manual.length;
        const capacity=manual.length||previous?.editedFields?.includes('augmentSlots')?previous?.augmentSlots??5:5;
        Object.assign(socketPatch,{augments:manual,augmentSlots:provenEmpty?0:capacity,emptyAugmentSlots:provenEmpty?0:null,augmentStatus:provenEmpty?'none':'unknown',augmentBaseline:null});
    }
    if(!patch){
        reject(physical);for(const {entry:child}of socketChildren)if(!child.empty)reject(child,'parent-item-missing');
        const card=previous?{...previous,catalogIdentity:null,wikiTitle:'',wikiMatch:'unmatched',...socketPatch}:null;
        return {card,known:false,slot:null,originKey,rejected};
    }
    const candidateId=previous?.id||id;
    if(typeof candidateId!=='string'||!candidateId||candidateId.length>100)throw Error('A stable physical item ID is required.');
    if(hasSockets){
        socketPatch.augmentSlots=entry.augmentSlots;socketPatch.augments=[];
        for(const {entry:child,resolution:provided}of socketChildren){
            if(child.empty)continue;
            const known=getPatch(child,provided),old=previous?.augments?.find(augment=>augment.inventoryOrigin?.key===child.key);
            if(!known){reject(child);continue;}
            socketPatch.augments.push(normalizeCharacterAugment({...old,index:child.index,sourceSlot:child.sourceSlot,inventoryOrigin:{...child,importedAt:now},name:known.name,wikiTitle:known.wikiTitle,catalogIdentity:known.catalogIdentity,details:known.details,baseStats:known.baseStats,unscaledStatKeys:known.unscaledStatKeys,iconId:known.iconId||old?.iconId||'',icon:known.icon||old?.icon||'',tier:child.tier,stats:old?.stats||{},statsComplete:old?.statsComplete===true},child.index));
        }
        socketPatch.emptyAugmentSlots=entry.augmentSlots-socketPatch.augments.length;
        socketPatch.augmentStatus=socketPatch.augments.length?'included':'none';
        if(previous?.observedStats&&Object.keys(previous.observedStats).length)socketPatch.augmentBaseline={mode:'unknown',emptyKnown:false,augments:[],uncertain:true};
    }
    const worn=slots.get(physical.slot);
    const normalized=normalizeCharacterCandidate({...previous,...patch,id:candidateId,name:patch.name||entry.baseName,wikiTitle:patch.wikiTitle||'',catalogIdentity:patch.catalogIdentity||null,wikiMatch:'confirmed',inventoryOrigin:{...physical,importedAt:now},...socketPatch,origin:previous?.origin||'manual',tier:entry.tier,fraction:0,slots:worn?[worn.universal?'ANY':worn.kind]:previous?.slots||[],createdAt:previous?.createdAt??now,updatedAt:now});
    return {card:{...previous,...normalized},known:true,slot:worn?.id||null,originKey,rejected};
}

export function mergeImportedKeyringRow({entry,resolution=null,now,occurrence=0}={}){
    validate(entry?.empty===true&&entry.count===1?{...entry,count:0}:entry,{empty:true});
    if(!['keyring','augment'].includes(entry.group)||!Number.isSafeInteger(now)||now<0||now>8.64e15)rowError();
    if(entry.empty)return {entry:null,rejected:[]};
    const patch=inventoryCatalogPatch(entry,resolution);
    return {entry:{...clone(entry),key:inventoryOriginKey(entry,{slot:null,occurrence}),slot:null,importedAt:now,known:Boolean(patch),wikiTitle:patch?.wikiTitle||'',iconId:patch?.iconId||''},rejected:patch?[]:[{name:entry.name,baseName:entry.baseName,tier:entry.tier,itemId:entry.itemId,location:entry.location,reason:'wiki-item-missing'}]};
}
