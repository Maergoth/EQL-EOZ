// Incremental syntax parser for /outputfile inventory. The receiver stages all
// rows privately and checks relational uniqueness/parents before activation.
// There is intentionally no whole-file byte or row-count bound.
export const INVENTORY_STREAM_LIMITS=Object.freeze({chunkCharacters:256*1024,lineCharacters:4096,observedSockets:8});
export const INVENTORY_WORN_LABELS=Object.freeze({
    'Any Slot':['any1','any2'],Ear:['ear1','ear2'],Head:['head'],Face:['face'],Neck:['neck'],
    Shoulders:['shoulders'],Arms:['arms'],Back:['back'],Wrist:['wrist1','wrist2'],Range:['range'],
    Hands:['hands'],Primary:['primary'],Secondary:['secondary'],Fingers:['finger1','finger2'],
    Chest:['chest'],Legs:['legs'],Feet:['feet'],Waist:['waist'],Ammo:['ammo']
});
const fail=(line,reason)=>{throw Error(`Inventory export${line?` at line ${line}`:''}: ${reason}`);};
const integer=(value,line,label,max=2147483647)=>{
    if(!/^\d+$/u.test(value)||!Number.isSafeInteger(Number(value))||Number(value)>max)fail(line,`invalid ${label}.`);
    return Number(value);
};
const groupFor=location=>{
    if(/^General [1-9]\d*(?:-Slot[1-9]\d*)*$/u.test(location))return 'inventory';
    if(/^Bank[1-9]\d*(?:-Slot[1-9]\d*)*$/u.test(location))return 'bank';
    if(/^SharedBank[1-9]\d*(?:-Slot[1-9]\d*)*$/u.test(location))return 'shared-bank';
    if(/^Personal-Depot[1-9]\d*(?:-Slot[1-9]\d*)*$/u.test(location))return 'personal-depot';
    if(/^Held(?:-Slot[1-9]\d*)*$/u.test(location))return 'held';
    const root=location.split('-Slot')[0];
    return Object.hasOwn(INVENTORY_WORN_LABELS,root)&&location!==root&&/^(?:[A-Za-z ]+)(?:-Slot[1-9]\d*)+$/u.test(location)?'augment':null;
};
const fieldsAt=(line,index,count,trailingBlank=false)=>{
    const fields=line.split('\t');
    if(trailingBlank&&fields.length===count+1&&fields.at(-1)==='')fields.pop();
    if(fields.length!==count)fail(index,`expected ${count} tab-separated columns.`);
    return fields.map(value=>value.trim());
};
function itemAt(fields,line,keyring=false){
    const [location,name,id,count]=fields;
    if(!location||location.length>180||name.length>240)fail(line,'invalid location or item name.');
    const itemId=integer(id,line,'item ID'),quantity=keyring?1:integer(count,line,'item count',1000000000);
    // The export's Slots column is not evidence of socket capacity.
    if(!keyring)integer(fields[4],line,'Slots value',1000000);
    const empty=itemId===0;
    if(empty&&((name&&name!=='Empty')||!keyring&&quantity!==0)||!empty&&(!name||name==='Empty'||quantity===0))fail(line,'inconsistent empty item, ID or count.');
    const rank=/\s+\+(10|[0-9])$/u.exec(name);
    return {location,name,baseName:rank?name.slice(0,rank.index).trimEnd():name,tier:rank?Number(rank[1]):0,itemId,count:quantity,empty};
}

/** Input is decoded text: use TextDecoder(...,{fatal:true}) in streaming mode
 * for UTF-8/UTF-16 files. Each write is bounded, but any number of writes/rows
 * may be supplied. onRow is synchronous so SQLite can stage before the next
 * row. Without it, only the rows from this call are returned. Root occurrence
 * distinguishes repeated worn labels; no unbounded location map is retained.
 * Parent existence, empty-parent, per-root duplicates and descendant checks
 * belong to the staging receiver, not this syntax-only parser.
 */
export function createInventoryStreamParser({onRow}={}){
    if(onRow!==undefined&&typeof onRow!=='function')throw TypeError('Inventory row sink must be a function.');
    const labels=new Map();let buffer='',lineNumber=0,rowCount=0,equipmentCount=0,emptyEquipmentCount=0,section='header',keyringSeen=false,skipLf=false,started=false,closed=false,failed=false;
    const accept=line=>{
        lineNumber++;
        if(line.length>INVENTORY_STREAM_LIMITS.lineCharacters||/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(line))fail(lineNumber,'invalid characters or oversized line.');
        if(section==='header'){
            if(line!=='Location\tName\tID\tCount\tSlots')fail(lineNumber,'expected the Location, Name, ID, Count, Slots header.');
            section='items';return null;
        }
        if(!line.trim()){if(section==='items')section='between';return null;}
        if(/^KeyRing\t/u.test(line)){
            if(keyringSeen)fail(lineNumber,'duplicate KeyRing header.');
            if(fieldsAt(line,lineNumber,3,true).join('\t')!=='KeyRing\tName\tID')fail(lineNumber,'invalid KeyRing header.');
            keyringSeen=true;section='keyring';return null;
        }
        if(section==='between')fail(lineNumber,'unexpected row after the inventory table.');
        if(!Number.isSafeInteger(rowCount+1))fail(lineNumber,'row ordinal exceeds the exact integer range.');
        const item=itemAt(fieldsAt(line,lineNumber,section==='keyring'?3:5),lineNumber,section==='keyring');
        const common={ordinal:rowCount++,line:lineNumber,section,slot:null,equipmentOrdinal:null,parentLocation:null,sourceSlot:null,rootLocation:item.location,rootOccurrence:0};
        if(section==='keyring'){
            if(!/^[A-Za-z][A-Za-z ]{0,79}$/u.test(item.location))fail(lineNumber,'invalid KeyRing category.');
            return {...common,...item,group:item.location==='Augmentation'?'augment':'keyring'};
        }
        const slots=Object.hasOwn(INVENTORY_WORN_LABELS,item.location)?INVENTORY_WORN_LABELS[item.location]:null;
        if(slots){
            const seen=labels.get(item.location)||0;
            if(seen>=slots.length)fail(lineNumber,'duplicate worn equipment location.');
            labels.set(item.location,seen+1);
            if(item.empty)emptyEquipmentCount++;
            return {...common,...item,group:'equipment',slot:slots[seen],equipmentOrdinal:equipmentCount++,rootOccurrence:seen};
        }
        const group=groupFor(item.location);
        if(!group)fail(lineNumber,'unrecognized inventory location.');
        const child=/-Slot([1-9]\d*)$/u.exec(item.location),rootLocation=item.location.split('-Slot')[0];
        if(child){
            if(group==='augment'&&!labels.has(rootLocation))fail(lineNumber,'a nested item has no preceding worn parent location.');
            common.parentLocation=item.location.slice(0,child.index);
            common.sourceSlot=integer(child[1],lineNumber,'source socket position',1000000);
            common.rootLocation=rootLocation;
            common.rootOccurrence=group==='augment'?labels.get(rootLocation)-1:0;
        }
        return {...common,...item,group};
    };
    const run=action=>{
        if(closed||failed)throw Error('Inventory stream parser is already finished or failed.');
        try{return action();}catch(error){failed=true;throw error;}
    };
    const write=text=>run(()=>{
        if(typeof text!=='string'||text.length>INVENTORY_STREAM_LIMITS.chunkCharacters)throw TypeError('Inventory input must be bounded decoded text chunks.');
        const rows=[],emit=row=>{if(row){if(onRow)onRow(row);else rows.push(row);}};
        for(const character of text){
            if(!started){started=true;if(character==='\uFEFF')continue;}
            if(skipLf){skipLf=false;if(character==='\n')continue;}
            if(character==='\r'||character==='\n'){
                emit(accept(buffer));buffer='';skipLf=character==='\r';
            }else{
                buffer+=character;
                if(buffer.length>INVENTORY_STREAM_LIMITS.lineCharacters)fail(lineNumber+1,'invalid characters or oversized line.');
            }
        }
        return rows;
    });
    const finish=()=>run(()=>{
        const rows=[];
        if(buffer){const row=accept(buffer);if(row){if(onRow)onRow(row);else rows.push(row);}buffer='';}
        if(equipmentCount!==23||Object.entries(INVENTORY_WORN_LABELS).some(([label,slots])=>labels.get(label)!==slots.length))fail(0,'incomplete worn equipment table; all 23 equipment locations are required.');
        closed=true;
        return {rows,summary:{kind:'eql-inventory-export',schemaVersion:1,rowCount,equipmentSlotCount:23,emptyEquipmentCount,keyringSeen}};
    });
    return {write,push:write,finish};
}

export default createInventoryStreamParser;
