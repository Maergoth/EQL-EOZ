// Pure parser for EverQuest's /outputfile inventory TSV. File access, catalog
// matching and committing a character remain explicit caller responsibilities.
const MAX_CHARACTERS=2*1024*1024,MAX_ROWS=20000,MAX_LINE=4096;
const SLOT_LABELS=Object.freeze({
    'Any Slot':['any1','any2'],Ear:['ear1','ear2'],Head:['head'],Face:['face'],Neck:['neck'],
    Shoulders:['shoulders'],Arms:['arms'],Back:['back'],Wrist:['wrist1','wrist2'],Range:['range'],
    Hands:['hands'],Primary:['primary'],Secondary:['secondary'],Fingers:['finger1','finger2'],
    Chest:['chest'],Legs:['legs'],Feet:['feet'],Waist:['waist'],Ammo:['ammo']
});
const WORN_SLOT_COUNT=23;
const fail=(line,reason)=>{throw Error(`Inventory export${line?` at line ${line}`:''}: ${reason}`);};
const integer=(value,line,label,max=2147483647)=>{
    if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)fail(line,`invalid ${label}.`);
    return Number(value);
};
function itemName(name){
    const match=/\s+\+(10|[0-9])$/u.exec(name);
    return {name,baseName:match?name.slice(0,match.index).trimEnd():name,tier:match?Number(match[1]):0};
}
function fieldsAt(line,index,count,{trailingBlank=false}={}){
    const fields=line.split('\t');
    if(trailingBlank&&fields.length===count+1&&fields.at(-1)==='')fields.pop();
    if(fields.length!==count)fail(index,`expected ${count} tab-separated columns.`);
    return fields.map(value=>value.trim());
}
function rowItem(fields,index,{keyring=false}={}){
    const [location,name,id,count]=fields;
    if(!location||location.length>180||name.length>240)fail(index,'invalid location or item name.');
    const itemId=integer(id,index,'item ID'),quantity=keyring?1:integer(count,index,'item count',1000000000);
    // Slots is both a container field and an item field in exports. Validate
    // its syntax, but never turn it into an augment count or a parent link.
    if(!keyring)integer(fields[4],index,'Slots value',1000000);
    const empty=itemId===0;
    if(empty&&((name&&name!=='Empty')||!keyring&&quantity!==0)||!empty&&(!name||name==='Empty'||quantity===0))fail(index,'inconsistent empty item, ID or count.');
    return {location,...itemName(name),itemId,count:quantity,empty};
}
function groupFor(location){
    if(/^General [1-9]\d*(?:-Slot[1-9]\d*)*$/.test(location))return 'inventory';
    if(/^Bank[1-9]\d*(?:-Slot[1-9]\d*)*$/.test(location))return 'bank';
    if(/^SharedBank[1-9]\d*(?:-Slot[1-9]\d*)*$/.test(location))return 'shared-bank';
    if(/^Held(?:-Slot[1-9]\d*)*$/.test(location))return 'held';
    const root=location.split('-Slot')[0];
    if(Object.hasOwn(SLOT_LABELS,root)&&new RegExp(`^${root}(?:-Slot[1-9]\\d*)+$`).test(location))return 'augment';
    return null;
}

/** Parse a complete worn table atomically, preserving private storage groups.
 * No successful return is possible with missing/extra worn slots or malformed
 * rows. Empty worn slots are explicit; other empty locations create no cards.
 * Repeated keyring labels and physical copies are deliberately not deduped.
 * Ordered worn children belong to that physical occurrence of the root slot.
 * Their source socket positions remain separate from dense UI indices.
 */
export function parseInventoryExport(text){
    if(typeof text!=='string'||text.length>MAX_CHARACTERS)fail(0,'expected a bounded text export.');
    const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
    while(lines.at(-1)==='')lines.pop();
    if(lines.length>MAX_ROWS+4)fail(0,'too many rows.');
    if(lines.some(line=>line.length>MAX_LINE||/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(line)))fail(0,'invalid characters or oversized line.');
    if(lines[0]!=='Location\tName\tID\tCount\tSlots')fail(1,'expected the Location, Name, ID, Count, Slots header.');
    const equipment=[],inventory=[],keyring=[],warnings=[],seenLabels=new Map(),seenLocations=new Set(),nodes=[],lastByLocation=new Map(),roots=new Map();
    let section='items',rowCount=0,keyringSeen=false;
    for(let offset=1;offset<lines.length;offset++){
        const line=lines[offset],index=offset+1;
        if(!line.trim()){if(section==='items')section='between';continue;}
        if(/^KeyRing\t/.test(line)){
            if(keyringSeen)fail(index,'duplicate KeyRing header.');
            const header=fieldsAt(line,index,3,{trailingBlank:true});
            if(header.join('\t')!=='KeyRing\tName\tID')fail(index,'invalid KeyRing header.');
            keyringSeen=true;section='keyring';continue;
        }
        if(section==='between')fail(index,'unexpected row after the inventory table.');
        if(++rowCount>MAX_ROWS)fail(index,'too many rows.');
        if(section==='keyring'){
            const item=rowItem(fieldsAt(line,index,3),index,{keyring:true});
            if(!/^[A-Za-z][A-Za-z ]{0,79}$/.test(item.location))fail(index,'invalid KeyRing category.');
            if(!item.empty){const {empty,...value}=item;keyring.push({...value,group:item.location==='Augmentation'?'augment':'keyring'});}
            continue;
        }
        const item=rowItem(fieldsAt(line,index,5),index),slots=Object.hasOwn(SLOT_LABELS,item.location)?SLOT_LABELS[item.location]:null;
        if(slots){
            const seen=seenLabels.get(item.location)||0;
            if(seen>=slots.length)fail(index,'duplicate worn equipment location.');
            seenLabels.set(item.location,seen+1);const worn={slot:slots[seen],...item},node={item:worn,children:[],index,group:null};
            node.root=node;roots.set(item.location,node);lastByLocation.set(item.location,node);nodes.push(node);equipment.push(worn);
            continue;
        }
        const group=groupFor(item.location);
        if(!group)fail(index,'unrecognized inventory location.');
        if(group!=='augment'&&seenLocations.has(item.location))fail(index,'duplicate storage location.');
        seenLocations.add(item.location);
        const node={item,children:[],index,group},child=/-Slot([1-9]\d*)$/.exec(item.location);
        if(child){
            const parentLocation=item.location.slice(0,child.index),parent=lastByLocation.get(parentLocation),root=roots.get(item.location.split('-Slot')[0]);
            if(!parent||parent.root!==root)fail(index,'a nested item has no preceding parent location.');
            const sourceSlot=integer(child[1],index,'source socket position',1000000);
            if(parent.item.empty||parent.children.some(value=>value.sourceSlot===sourceSlot))fail(index,'invalid or duplicate child location for an item.');
            node.root=root;node.parent=parent;node.sourceSlot=sourceSlot;parent.children.push(node);
        }else{node.root=node;roots.set(item.location,node);}
        lastByLocation.set(item.location,node);nodes.push(node);
    }
    if(equipment.length!==WORN_SLOT_COUNT||Object.entries(SLOT_LABELS).some(([label,slots])=>seenLabels.get(label)!==slots.length))fail(0,'incomplete worn equipment table; all 23 equipment locations are required.');
    const attached=new Set();
    for(const node of nodes){
        if(!node.children.length)continue;
        // Worn descendants are sockets. For storage, an observed Exaltation
        // child distinguishes a socket set from ordinary container contents.
        // Slots=11 supplies neither of these facts.
        const sockets=Object.hasOwn(node.item,'slot')||node.children.some(child=>/\(Exaltation\)(?:\s+\+(?:10|[0-9]))?$/iu.test(child.item.name));
        if(!sockets)continue;
        if(node.children.length>32)fail(node.index,'too many observed augment sockets; no children were imported.');
        node.item.augmentSlots=node.children.length;
        node.item.augments=node.children.map((child,index)=>{attached.add(child);return {index,sourceSlot:child.sourceSlot,...child.item};});
    }
    for(const node of nodes){
        if(node.item.slot||node.item.empty||attached.has(node))continue;
        const {empty,...value}=node.item;inventory.push({...value,group:node.group});
    }
    return {kind:'eql-inventory-export',schemaVersion:1,equipment,inventory,keyring,warnings,rowCount,equipmentSlotCount:equipment.length,emptyEquipmentCount:equipment.filter(item=>item.empty).length};
}

export default parseInventoryExport;
