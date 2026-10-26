'use strict';
// The sole database owner. All synchronous SQLite work stays off Electron main.
const {parentPort,workerData}=require('node:worker_threads');
const {DatabaseSync,backup}=require('node:sqlite');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto'),{pathToFileURL}=require('node:url');
const {LIMITS,object,failure,id,json,revision}=require('./character-repository-contract.cjs');
let db,initialError,chain=Promise.resolve();const jobs=new Map();
let helpersPromise;
const helpers=()=>helpersPromise||=(async()=>{const load=name=>import(pathToFileURL(path.join(workerData.appRoot,'app',name)).href);const [parser,merge,catalog,achievements,model]=await Promise.all([load('inventory-stream-parser.js'),load('inventory-import-record.js'),load('character-catalog.js'),load('achievement-export.js'),load('character-model.js')]);return {...parser,...merge,...catalog,...achievements,...model};})();
let removalVariant;
const blankCounts=()=>({total:0,candidates:0,equipped:0,loose:0,keyring:0,rejected:0,rawRows:0,groups:{}});
const parse=text=>JSON.parse(text),fold=value=>String(value||'').normalize('NFKC').replace(/_/g,' ').replace(/\s+/gu,' ').trim().toLowerCase();
const profileIdentity=(name,server)=>JSON.stringify([name,server].map(value=>String(value).normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim()));
const getMeta=key=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
const setMeta=(key,value)=>db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);
const rowFor=profileId=>{id(profileId,'profile ID');const row=db.prepare('SELECT * FROM profiles WHERE id=?').get(profileId);if(!row)throw failure('profile-missing','This saved character no longer exists.');return row;};
const checkRevision=(row,expected)=>{revision(expected);if(row.revision!==expected)throw failure('revision-conflict','This character changed. Reload the current saved profile before applying this edit.');};
function coreText(core){if(!object(core)||core.schemaVersion!==1||Object.hasOwn(core,'candidates'))throw failure('invalid-request','Profile core must use schema 1 without inventory cards.');for(const key of ['candidateIds','keyring','rejectedItems'])if(Array.isArray(core.inventoryExport?.[key]))throw failure('invalid-request','Inventory collections belong in repository rows.');return json(core,LIMITS.coreBytes,'Character core');}
const flowText=flow=>flow===null||flow===undefined?null:json(typeof flow==='string'?parse(flow):flow,LIMITS.flowBytes,'Character walkthrough');
function physical(card){const key=card?.inventoryOrigin?.key;return typeof key==='string'&&key.length<=1200?key:null;}
function physicalGroup(card){const origin=card?.inventoryOrigin;if(origin?.group==='augment'){const location=String(origin.location||'');for(const [pattern,group]of [[/^General [1-9]\d*(?:-Slot[1-9]\d*)*$/u,'inventory'],[/^Bank[1-9]\d*(?:-Slot[1-9]\d*)*$/u,'bank'],[/^SharedBank[1-9]\d*(?:-Slot[1-9]\d*)*$/u,'shared-bank'],[/^Personal-Depot[1-9]\d*(?:-Slot[1-9]\d*)*$/u,'personal-depot'],[/^Held(?:-Slot[1-9]\d*)*$/u,'held']])if(pattern.test(location))return group;return 'inventory';}return origin?.group||card.group||'manual';}
function cardData(card,kind='card',ordinal=0,recordId=card?.id){
    if(!object(card))throw failure('invalid-request','A physical item record is required.');id(recordId,'item ID');
    const payload=json(card,LIMITS.recordBytes,'Item record');
    return {id:recordId,payload,name:fold(card.name||card.baseName||''),group:physicalGroup(card),physical:kind==='card'?physical(card):null,kind,ordinal};
}
function insertItem(profile,generation,data){db.prepare('INSERT INTO items(profile,generation,id,ordinal,physical_key,name,group_name,kind,equipped_slot,payload) VALUES(?,?,?,?,?,?,?,?,NULL,?)').run(profile,generation,data.id,data.ordinal,data.physical,data.name,data.group,data.kind,data.payload);}
function recount(profile,generation,rawRows=0){
    const counts=blankCounts();for(const row of db.prepare('SELECT kind,equipped_slot IS NOT NULL AS equipped,COUNT(*) AS n FROM items WHERE profile=? AND generation=? GROUP BY kind,equipped_slot IS NOT NULL').all(profile,generation)){
        counts.total+=row.n;if(row.kind==='card'){counts.candidates+=row.n;counts[row.equipped?'equipped':'loose']+=row.n;}else if(row.kind==='keyring')counts.keyring+=row.n;else if(row.kind==='rejected')counts.rejected+=row.n;
    }for(const row of db.prepare("SELECT group_name,COUNT(*) AS n FROM items WHERE profile=? AND generation=? AND kind='card' AND equipped_slot IS NULL GROUP BY group_name").all(profile,generation))counts.groups[row.group_name]=row.n;counts.rawRows=rawRows;return counts;
}
function equip(profile,generation,core){
    const entries=Object.entries(core.equipment||{});if(entries.length>64)throw failure('invalid-request','The equipment map is invalid.');
    db.prepare('UPDATE items SET equipped_slot=NULL WHERE profile=? AND generation=? AND equipped_slot IS NOT NULL').run(profile,generation);
    const seen=new Set();for(const [slot,itemId]of entries){id(slot,'equipment slot');id(itemId,'equipped item ID');if(seen.has(itemId))throw failure('invalid-request','One physical copy cannot occupy two equipment slots.');seen.add(itemId);const changed=db.prepare("UPDATE items SET equipped_slot=? WHERE profile=? AND generation=? AND id=? AND kind='card'").run(slot,profile,generation,itemId);if(Number(changed.changes)!==1)throw failure('invalid-request','Equipped item does not exist in this saved inventory.');}
}
function snapshot(row){return {ok:true,profileId:row.id,registered:row.id!=='draft',revision:row.revision,generation:row.generation,core:parse(row.core),flow:row.flow===null?null:parse(row.flow),counts:parse(row.counts),equipped:[]};}
function saveGeneration(row){const core=parse(row.core),sources=[core.inventoryExport?.file?.backupName,core.achievementExport?.file?.backupName].filter(name=>typeof name==='string');db.prepare('INSERT INTO generation_snapshots(profile,generation,revision,core,flow,counts,updated,sources) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(profile,generation) DO UPDATE SET revision=excluded.revision,core=excluded.core,flow=excluded.flow,counts=excluded.counts,updated=excluded.updated').run(row.id,row.generation,row.revision,row.core,row.flow,row.counts,row.updated,JSON.stringify(sources));}
// Keep one recovery snapshot in addition to the live pointer. Each call removes
// at most 500 records; the host yields between calls instead of one large DELETE.
function collectGarbage(){
    const candidate=db.prepare(`SELECT candidate.profile,candidate.generation FROM (
        SELECT profile,generation FROM generation_snapshots UNION SELECT profile,generation FROM import_jobs
    ) AS candidate WHERE NOT EXISTS(SELECT 1 FROM profiles WHERE id=candidate.profile AND generation=candidate.generation)
    AND candidate.generation<>COALESCE((SELECT generation FROM generation_snapshots AS previous WHERE previous.profile=candidate.profile AND previous.generation<>(SELECT generation FROM profiles WHERE id=candidate.profile) ORDER BY revision DESC LIMIT 1),'')
    AND NOT EXISTS(SELECT 1 FROM import_jobs WHERE profile=candidate.profile AND generation=candidate.generation AND state='staging') LIMIT 1`).get();
    if(!candidate)return {ok:true,done:true};
    return transaction(()=>{for(const table of ['items','raw_rows','import_occurrences']){const removed=db.prepare(`DELETE FROM ${table} WHERE rowid IN(SELECT rowid FROM ${table} WHERE profile=? AND generation=? LIMIT 500)`).run(candidate.profile,candidate.generation);if(Number(removed.changes))return {ok:true,done:false,removed:Number(removed.changes)};}db.prepare('DELETE FROM import_jobs WHERE profile=? AND generation=?').run(candidate.profile,candidate.generation);db.prepare('DELETE FROM generation_snapshots WHERE profile=? AND generation=?').run(candidate.profile,candidate.generation);return {ok:true,done:false,removed:0};});
}
function backupReferences(value){
    if(!Array.isArray(value.names)||value.names.length>50||value.names.some(name=>typeof name!=='string'||!/^[-a-f0-9]{36}\.(?:inventory|achievements)\.txt$/u.test(name)))throw failure('invalid-request','Invalid private import backup query.');
    const referenced=[];for(const name of value.names){const job=name.slice(0,36);if(db.prepare("SELECT 1 FROM import_jobs WHERE id=? AND state='staging'").get(job)||db.prepare("SELECT 1 FROM generation_snapshots WHERE json_extract(sources,'$[0]')=? OR json_extract(sources,'$[1]')=? LIMIT 1").get(name,name))referenced.push(name);}return {ok:true,referenced};
}
function transaction(work){db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}}
function metadata(value){if(!object(value))throw failure('invalid-request','Character details are required.');const name=id(value.name,'character name').trim(),server=id(value.server,'server name').trim();if(name.length>120||server.length>100)throw failure('invalid-request','Character details are too long.');return {name,server};}
function emptyCore(value){return {schemaVersion:1,sequence:0,metadata:{classes:[],level:null,aaCount:null,race:'',...value},equipment:{},pendingEquipment:{},inventoryExport:null,achievements:null,achievementExport:null,statSnapshots:{base:null,equipped:null,current:null},observationRefs:[],observationFloor:0,removedObservations:[],removedInstances:[],updatedAt:Date.now()};}
function ensureDraft(){if(!db.prepare("SELECT 1 FROM profiles WHERE id='draft'").get())db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?)').run('draft','','','draft',0,randomUUID(),coreText(emptyCore({name:'',server:''})),null,JSON.stringify(blankCounts()),Date.now());if(!getMeta('active_profile'))setMeta('active_profile','draft');}
function projectArchives(core){
    if(core.removedInstances===undefined)return {core,records:[]};if(!Array.isArray(core.removedInstances))throw failure('invalid-request','Removed-instance history must be an array.');
    const records=core.removedInstances.map(record=>{if(!object(record)||typeof record.instanceKey!=='string'||!record.instanceKey||!Number.isSafeInteger(record.at)||record.at<0||!object(record.variant))throw failure('invalid-request','Removed-instance history is malformed.');json(record,LIMITS.recordBytes,'Removed item record');return record;});
    return {core:{...core,removedInstances:records.map(record=>({instanceKey:record.instanceKey,at:record.at,variant:removalVariant(record.variant)}))},records};
}
function saveArchives(profile,records){for(const record of records){const variant=removalVariant(record.variant),key=JSON.stringify([record.instanceKey,variant.tier,variant.fraction,variant.augments.map(augment=>[augment.name,augment.id])]),payload=JSON.stringify(record),hash=createHash('sha256').update(payload).digest('hex');db.prepare('INSERT OR IGNORE INTO removed_instances VALUES(?,?,?,?)').run(profile,key,hash,payload);}}
async function safeDirectory(){
    if(!path.isAbsolute(workerData.directory))throw Error('Private storage directory is required.');await fsp.mkdir(workerData.directory,{recursive:true,mode:0o700});
    const directory=await fsp.lstat(workerData.directory);if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('Unsafe Character repository directory.');
    for(const suffix of ['', '-wal','-shm']){const file=workerData.file+suffix;const stat=await fsp.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('Unsafe Character repository file.');}
}
function canSeed(){if(getMeta('seed_token'))return false;const migration=parse(getMeta('migration')||'null');return getMeta('activated')==='1'&&migration?.characterKeysPresent===false&&getMeta('active_profile')==='draft'&&rowFor('draft').revision===0&&!db.prepare("SELECT 1 FROM profiles WHERE id<>'draft' LIMIT 1").get()&&!db.prepare('SELECT 1 FROM items LIMIT 1').get()&&!jobs.size;}
async function migrate(seedFile=null){
    if(getMeta('activated')==='1'&&!seedFile)return;
    const sourceFile=seedFile||workerData.legacyFile;
    let legacy=null,source=null,sourceStat=null;try{sourceStat=await fsp.lstat(sourceFile,{bigint:true});if(!sourceStat.isFile()||sourceStat.isSymbolicLink())throw Error('Legacy Character source must be an original regular file.');const handle=await fsp.open(sourceFile,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));try{const opened=await handle.stat({bigint:true});if(opened.dev!==sourceStat.dev||opened.ino!==sourceStat.ino||opened.size!==sourceStat.size||opened.mtimeNs!==sourceStat.mtimeNs||opened.ctimeNs!==sourceStat.ctimeNs)throw Error('Legacy source changed.');source=await handle.readFile();const after=await handle.stat({bigint:true});if(after.size!==opened.size||after.mtimeNs!==opened.mtimeNs||after.ctimeNs!==opened.ctimeNs)throw Error('Legacy source changed.');}finally{await handle.close();}legacy=JSON.parse(source.toString('utf8'));}catch(error){if(error.code!=='ENOENT')throw failure('migration-required','Existing Character data could not be migrated safely. Its original file was preserved.');}
    let backupInfo=null;
    if(source){const digest=createHash('sha256').update(source).digest('hex'),target=path.join(workerData.directory,`character-legacy-${digest}.json`);try{const handle=await fsp.open(target,'wx',0o600);try{await handle.writeFile(source);await handle.sync();}finally{await handle.close();}}catch(error){if(error.code!=='EEXIST')throw error;}const saved=await fsp.readFile(target);if(!saved.equals(source))throw Error('Legacy backup verification failed.');backupInfo={name:path.basename(target),sha256:digest,bytes:source.length};}
    // Migration helper consumes raw schema-1 values, with no model normalizer or
    // 1000-card slice. Unknown card properties stay inside ordinary row JSON.
    let migration={profiles:function*(){},activeProfileId:null},migrationHelper;
    if(legacy){migrationHelper=await import(pathToFileURL(path.join(workerData.appRoot,'app/inventory-legacy-migration.js')).href);migration=migrationHelper.decomposeLegacyCharacterStorage(legacy);}
    const proofs=[];
    if(migrationHelper)for(const profile of migration.profiles())proofs.push(await migrationHelper.legacyInventoryProof(profile,{hashBytes:async bytes=>createHash('sha256').update(bytes).digest('hex')}));
    transaction(()=>{
        if(sourceStat){const current=fs.lstatSync(sourceFile,{bigint:true});if(!current.isFile()||current.isSymbolicLink()||current.dev!==sourceStat.dev||current.ino!==sourceStat.ino||current.size!==sourceStat.size||current.mtimeNs!==sourceStat.mtimeNs||current.ctimeNs!==sourceStat.ctimeNs)throw failure('source-changed','Legacy data changed before migration activation. No migration was activated.');}
        if(seedFile){if(!getMeta('seed_token')||parse(getMeta('migration')||'null')?.characterKeysPresent!==false||rowFor('draft').revision!==0||db.prepare("SELECT 1 FROM profiles WHERE id<>'draft' LIMIT 1").get()||db.prepare('SELECT 1 FROM items LIMIT 1').get())throw failure('seed-not-allowed','The native repository is no longer pristine.');db.prepare('INSERT INTO migration_history(receipt,envelope) VALUES(?,?)').run(getMeta('migration')||'null',getMeta('legacy_envelope')||'null');db.prepare("DELETE FROM profiles WHERE id='draft'").run();db.prepare("DELETE FROM legacy_profiles WHERE profile='draft'").run();db.prepare("DELETE FROM legacy_records WHERE profile='draft'").run();}
        let profileCount=0;
        for(const profile of migration.profiles()){
            profileCount++;id(profile.id,'legacy profile ID');const label=profile.id==='draft'?{name:'',server:''}:metadata(profile),generation=randomUUID(),core=profile.core?{...profile.core}:emptyCore(label);delete core.candidates;
            if(core.inventoryExport){core.inventoryExport={...core.inventoryExport};for(const key of ['candidateIds','keyring','rejectedItems'])delete core.inventoryExport[key];}
            const projected=projectArchives(core),coreJson=coreText(projected.core),flow=flowText(profile.flow);saveArchives(profile.id,projected.records);
            db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?)').run(profile.id,label.name,label.server,profileIdentity(label.name,label.server),0,generation,coreJson,flow,JSON.stringify(blankCounts()),Date.now());
            db.prepare('INSERT INTO legacy_profiles VALUES(?,?,?,?)').run(profile.id,JSON.stringify(profile.core),JSON.stringify(profile.flow),JSON.stringify(profile.legacyMetadata??{...profile,records:undefined,core:undefined,flow:undefined}));
            let ordinal=0;for(const record of profile.records()){
                const payload=json(record.value,LIMITS.recordBytes,'Legacy inventory record');db.prepare('INSERT INTO legacy_records VALUES(?,?,?,?)').run(profile.id,record.kind,record.ordinal,payload);
                if(record.kind==='candidate-id')continue;
                const kind=record.kind==='candidate'?'card':record.kind;insertItem(profile.id,generation,cardData(record.value,kind,++ordinal,kind==='card'?record.value.id:`legacy-${record.kind}-${record.ordinal}`));
            }
            const stored=db.prepare('SELECT core,flow FROM legacy_profiles WHERE profile=?').get(profile.id),expected=proofs.find(proof=>proof.profileId===profile.id),hash=text=>createHash('sha256').update(text).digest('hex');let digest=hash(JSON.stringify({profileId:profile.profileId,core:parse(stored.core),flow:parse(stored.flow)})),recordCount=0;
            for(const record of db.prepare("SELECT kind,ordinal,payload FROM legacy_records WHERE profile=? ORDER BY CASE kind WHEN 'candidate' THEN 0 WHEN 'candidate-id' THEN 1 WHEN 'keyring' THEN 2 ELSE 3 END,ordinal").iterate(profile.id)){const text=JSON.stringify({kind:record.kind,ordinal:record.ordinal,value:parse(record.payload)});digest=hash(JSON.stringify([digest,record.kind,record.ordinal,hash(text)]));recordCount++;}
            if(!expected||expected.sha256!==digest||expected.recordCount!==recordCount)throw failure('migration-proof-failed','Stored migration records did not match the original profile. No migration was activated.');
            equip(profile.id,generation,core);const counts=recount(profile.id,generation,core.inventoryExport?.rowCount||0);db.prepare('UPDATE profiles SET counts=? WHERE id=?').run(JSON.stringify(counts),profile.id);saveGeneration(rowFor(profile.id));
        }
        if(migration.activeProfileId)setMeta('active_profile',migration.activeProfileId);
        const roster=migration.roster?{...migration.roster,profiles:undefined,draft:undefined}:null;setMeta('legacy_envelope',json({outerFields:migration.outerFields,roster,source:backupInfo},LIMITS.coreBytes,'Legacy envelope metadata'));
        const characterKeys=['eql-eye-of-zomm-character-v1','eql-eye-of-zomm-character-walkthrough-v1','eql-eye-of-zomm-character-profiles-v1'];
        setMeta('migration',JSON.stringify({schemaVersion:1,at:new Date().toISOString(),source:backupInfo,characterKeysPresent:characterKeys.some(key=>Object.hasOwn(legacy?.values||{},key)),profiles:profileCount,proofs}));setMeta('activated','1');db.prepare("DELETE FROM meta WHERE key='seed_token'").run();ensureDraft();
    });
    await fsp.writeFile(path.join(workerData.directory,'migration-receipt.json'),getMeta('migration'),{mode:0o600});
}
async function initialize(){
    await safeDirectory();let exists=true;try{await fsp.access(workerData.file);}catch(error){if(error.code!=='ENOENT')throw error;exists=false;}
    if(!exists){const handle=await fsp.open(workerData.file,'wx',0o600);await handle.close();}
    db=new DatabaseSync(workerData.file,{allowExtension:false});db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000; PRAGMA cache_size=-16384;');
    db.exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,name TEXT NOT NULL,server TEXT NOT NULL,identity TEXT NOT NULL UNIQUE,revision INTEGER NOT NULL,generation TEXT NOT NULL,core TEXT NOT NULL,flow TEXT,counts TEXT NOT NULL,updated INTEGER NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS items(profile TEXT NOT NULL,generation TEXT NOT NULL,id TEXT NOT NULL,ordinal INTEGER NOT NULL,physical_key TEXT,name TEXT NOT NULL,group_name TEXT NOT NULL,kind TEXT NOT NULL,equipped_slot TEXT,payload TEXT NOT NULL,PRIMARY KEY(profile,generation,id)) STRICT;
CREATE INDEX IF NOT EXISTS item_origin ON items(profile,generation,physical_key) WHERE physical_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS item_page ON items(profile,generation,ordinal,id);
CREATE INDEX IF NOT EXISTS item_name ON items(profile,generation,name,id);
CREATE INDEX IF NOT EXISTS item_scope ON items(profile,generation,kind,equipped_slot,ordinal,id);
CREATE INDEX IF NOT EXISTS item_kind_id ON items(profile,generation,kind,id);
CREATE INDEX IF NOT EXISTS item_group_page ON items(profile,generation,group_name,ordinal,id);
CREATE INDEX IF NOT EXISTS item_legacy_origin ON items(profile,generation,json_extract(payload,'$.inventoryOrigin.location'),json_extract(payload,'$.inventoryOrigin.itemId'),json_extract(payload,'$.inventoryOrigin.tier'),json_extract(payload,'$.inventoryOrigin.baseName'));
CREATE TABLE IF NOT EXISTS raw_rows(profile TEXT NOT NULL,generation TEXT NOT NULL,ordinal INTEGER NOT NULL,section TEXT NOT NULL,location TEXT NOT NULL,root_location TEXT NOT NULL,root_occurrence INTEGER NOT NULL,group_name TEXT NOT NULL,parent_location TEXT,parent_ordinal INTEGER,source_slot INTEGER,empty INTEGER NOT NULL,attached INTEGER NOT NULL DEFAULT 0,occurrence INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL,PRIMARY KEY(profile,generation,ordinal)) STRICT;
CREATE INDEX IF NOT EXISTS raw_parent ON raw_rows(profile,generation,root_location,root_occurrence,location,ordinal);
CREATE INDEX IF NOT EXISTS raw_children ON raw_rows(profile,generation,parent_ordinal,ordinal);
CREATE UNIQUE INDEX IF NOT EXISTS raw_socket ON raw_rows(profile,generation,parent_ordinal,source_slot) WHERE parent_ordinal IS NOT NULL;
CREATE TABLE IF NOT EXISTS import_occurrences(profile TEXT NOT NULL,generation TEXT NOT NULL,origin TEXT NOT NULL,next_occurrence INTEGER NOT NULL,PRIMARY KEY(profile,generation,origin)) STRICT;
CREATE TABLE IF NOT EXISTS removed_instances(profile TEXT NOT NULL,semantic_key TEXT NOT NULL,digest TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(profile,semantic_key,digest)) STRICT;
CREATE TABLE IF NOT EXISTS legacy_profiles(profile TEXT PRIMARY KEY,core TEXT NOT NULL,flow TEXT NOT NULL,metadata TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS legacy_records(profile TEXT NOT NULL,kind TEXT NOT NULL,ordinal INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(profile,kind,ordinal)) STRICT;
CREATE TABLE IF NOT EXISTS migration_history(id INTEGER PRIMARY KEY,receipt TEXT NOT NULL,envelope TEXT NOT NULL) STRICT;
CREATE TABLE IF NOT EXISTS generation_snapshots(profile TEXT NOT NULL,generation TEXT NOT NULL,revision INTEGER NOT NULL,core TEXT NOT NULL,flow TEXT,counts TEXT NOT NULL,updated INTEGER NOT NULL,sources TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(profile,generation)) STRICT;
CREATE INDEX IF NOT EXISTS snapshot_revision ON generation_snapshots(profile,revision DESC);
CREATE TABLE IF NOT EXISTS import_jobs(id TEXT PRIMARY KEY,profile TEXT NOT NULL,generation TEXT NOT NULL,base_revision INTEGER NOT NULL,state TEXT NOT NULL,created INTEGER NOT NULL) STRICT;`);
    if(!db.prepare('PRAGMA table_info(generation_snapshots)').all().some(column=>column.name==='sources')){db.exec("ALTER TABLE generation_snapshots ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'");for(const row of db.prepare('SELECT profile,generation,core FROM generation_snapshots').iterate()){const core=parse(row.core),sources=[core.inventoryExport?.file?.backupName,core.achievementExport?.file?.backupName].filter(name=>typeof name==='string');db.prepare('UPDATE generation_snapshots SET sources=? WHERE profile=? AND generation=?').run(JSON.stringify(sources),row.profile,row.generation);}}
    db.exec("CREATE INDEX IF NOT EXISTS snapshot_source_first ON generation_snapshots(json_extract(sources,'$[0]')); CREATE INDEX IF NOT EXISTS snapshot_source_second ON generation_snapshots(json_extract(sources,'$[1]'));");
    const schema=getMeta('schema_version');if(schema&&schema!=='1')throw Error('Unsupported Character repository version. Original database preserved.');setMeta('schema_version','1');
    removalVariant=(await helpers()).characterRemovalVariant;await migrate();ensureDraft();db.prepare("DELETE FROM meta WHERE key='seed_token'").run();db.prepare("UPDATE import_jobs SET state='cancelled' WHERE state='staging'").run();for(const row of db.prepare('SELECT * FROM profiles').iterate())saveGeneration(row);
}
function listProfiles(value={}){
    const limit=Math.max(1,Math.min(LIMITS.pageSize,Number.isInteger(value.limit)?value.limit:LIMITS.pageSize)),after=typeof value.cursor==='string'?value.cursor:'';
    const rows=db.prepare("SELECT id,name,server,revision FROM profiles WHERE id>? AND id<>'draft' ORDER BY id LIMIT ?").all(after,limit+1),more=rows.length>limit;if(more)rows.pop();return {ok:true,profiles:rows,nextCursor:more?rows.at(-1).id:null,activeProfileId:getMeta('active_profile')};
}
function change(value){
    const row=rowFor(value.profileId);checkRevision(row,value.expectedRevision);const upserts=value.upserts||[],removes=value.removes||[],updates=value.updates||[],duplicates=value.duplicates||[];
    if([upserts,removes,updates,duplicates].some(value=>!Array.isArray(value))||upserts.length+removes.length+updates.length+duplicates.length>LIMITS.pageSize)throw failure('invalid-request','Item edits must use a bounded batch.');json({upserts,removes,updates,duplicates},LIMITS.batchBytes,'Item edit batch');
    const targets=[...upserts.map(card=>card.id),...updates.map(edit=>edit.id),...duplicates.map(edit=>edit.id),...removes];if(new Set(targets).size!==targets.length)throw failure('invalid-request','An item can occur only once in a save batch.');
    const projected=projectArchives(value.core===undefined?parse(row.core):value.core),core=projected.core,flow=value.flow===undefined?row.flow:flowText(value.flow),coreJson=coreText(core),label=row.id==='draft'?{name:String(core.metadata?.name||''),server:String(core.metadata?.server||'')}:metadata(core.metadata||{});
    return transaction(()=>{
        checkRevision(rowFor(row.id),value.expectedRevision);
        saveArchives(row.id,projected.records);
        const merge=(edit,copy=false)=>{if(!object(edit)||!object(edit.patch||{})||edit.unset!==undefined&&(!Array.isArray(edit.unset)||edit.unset.length>100))throw failure('invalid-request','Invalid physical item patch.');const sourceId=id(copy?edit.sourceId:edit.id,'item ID'),record=db.prepare("SELECT payload FROM items WHERE profile=? AND generation=? AND id=? AND kind='card'").get(row.id,row.generation,sourceId);if(!record)throw failure('item-missing','The physical item being edited no longer exists.');const card={...parse(record.payload),...(edit.patch||{}),id:id(edit.id,'item ID')};for(const key of edit.unset||[]){if(typeof key!=='string'||key==='id'||key.length>160)throw failure('invalid-request','Invalid item field removal.');delete card[key];}return card;};
        for(const candidate of [...upserts,...duplicates])if(db.prepare('SELECT 1 FROM items WHERE profile=? AND generation=? AND id=?').get(row.id,row.generation,id(candidate.id,'item ID')))throw failure('item-exists','The new physical item ID already exists. No item was overwritten.');
        const allUpserts=[...upserts,...updates.map(edit=>merge(edit)),...duplicates.map(edit=>merge(edit,true))];
        const counts=value.clearInventory===true?blankCounts():parse(row.counts),affected=new Set([...allUpserts.map(card=>id(card.id,'item ID')),...removes.map(value=>id(value,'item ID')),...Object.values(parse(row.core).equipment||{}),...Object.values(core.equipment||{})]);
        if(value.clearInventory===true){db.prepare('DELETE FROM items WHERE profile=? AND generation=?').run(row.id,row.generation);db.prepare('DELETE FROM raw_rows WHERE profile=? AND generation=?').run(row.id,row.generation);}
        const old=new Map();for(const itemId of affected){const found=db.prepare('SELECT kind,equipped_slot,group_name FROM items WHERE profile=? AND generation=? AND id=?').get(row.id,row.generation,itemId);if(found)old.set(itemId,found);}
        for(const itemId of removes)db.prepare('DELETE FROM items WHERE profile=? AND generation=? AND id=?').run(row.id,row.generation,itemId);
        let nextOrdinal=db.prepare('SELECT COALESCE(MAX(ordinal),0)+1 AS n FROM items WHERE profile=? AND generation=?').get(row.id,row.generation).n;
        for(const card of allUpserts){if(card.repositoryLarge===true)throw failure('invalid-request','Load the full item before saving it.');const previous=db.prepare('SELECT ordinal FROM items WHERE profile=? AND generation=? AND id=?').get(row.id,row.generation,card.id),data=cardData(card,'card',previous?.ordinal??nextOrdinal++);db.prepare('DELETE FROM items WHERE profile=? AND generation=? AND id=?').run(row.id,row.generation,data.id);insertItem(row.id,row.generation,data);}
        equip(row.id,row.generation,core);
        counts.groups||={};const apply=(entry,direction)=>{if(!entry)return;counts.total+=direction;if(entry.kind==='card'){counts.candidates+=direction;counts[entry.equipped_slot?'equipped':'loose']+=direction;if(!entry.equipped_slot)counts.groups[entry.group_name]=(counts.groups[entry.group_name]||0)+direction;}else if(entry.kind==='keyring')counts.keyring+=direction;else if(entry.kind==='rejected')counts.rejected+=direction;};
        for(const itemId of affected){apply(old.get(itemId),-1);apply(db.prepare('SELECT kind,equipped_slot,group_name FROM items WHERE profile=? AND generation=? AND id=?').get(row.id,row.generation,itemId),1);}
        db.prepare('UPDATE profiles SET name=?,server=?,identity=?,revision=revision+1,core=?,flow=?,counts=?,updated=? WHERE id=?').run(label.name,label.server,row.id==='draft'?'draft':profileIdentity(label.name,label.server),coreJson,flow,JSON.stringify(counts),Date.now(),row.id);
        const saved=rowFor(row.id);saveGeneration(saved);return snapshot(saved);
    });
}
function list(value){
    const row=rowFor(value.profileId);if(value.generation!==undefined&&value.generation!==row.generation)throw failure('revision-conflict','This inventory changed. Reload its first page.');if(value.revision!==undefined)checkRevision(row,value.revision);
    const scope=value.scope||'all',sort=value.sort||'origin',query=typeof value.query==='string'?fold(value.query):'';if(!['all','loose','equipped','keyring','rejected','inventory','bank','shared-bank','personal-depot','held','manual','retained'].includes(scope)||!['origin','name'].includes(sort)||query.length>LIMITS.queryCharacters)throw failure('invalid-request','Invalid inventory page.');
    const limit=Math.max(1,Math.min(LIMITS.pageSize,Number.isInteger(value.limit)?value.limit:LIMITS.pageSize));let cursor=null;
    if(value.cursor){if(typeof value.cursor!=='string'||value.cursor.length>4096)throw failure('invalid-request','Invalid inventory cursor.');try{cursor=parse(Buffer.from(value.cursor,'base64url').toString());}catch{throw failure('invalid-request','Invalid inventory cursor.');}if(cursor.profile!==row.id||cursor.generation!==row.generation||cursor.revision!==row.revision||cursor.scope!==scope||cursor.sort!==sort||cursor.query!==query)throw failure('revision-conflict','This inventory page is no longer current.');}
    let where='profile=? AND generation=?',args=[row.id,row.generation];
    if(scope==='loose')where+=" AND kind='card' AND equipped_slot IS NULL";
    else if(scope==='equipped'){where+=" AND kind='card' AND (equipped_slot IS NOT NULL OR id IN (SELECT value FROM json_each(?)))";args.push(JSON.stringify(parse(row.core).pendingEquipment||{}));}
    else if(scope==='keyring'||scope==='rejected'){where+=' AND kind=?';args.push(scope);}
    else if(scope!=='all'){where+=" AND kind='card' AND equipped_slot IS NULL AND group_name=?";args.push(scope);}
    if(query){where+=" AND instr(name,?)>0";args.push(query);}
    const field=sort==='name'?'name':'ordinal';if(cursor){where+=` AND (${field}>? OR (${field}=? AND id>?))`;args.push(cursor.value,cursor.value,cursor.id);}
    const items=[],kinds={},largeItems={};let last=null,more=false,used=1024;
    for(const item of db.prepare(`SELECT id,ordinal,name,kind,length(CAST(payload AS BLOB)) AS bytes,CASE WHEN length(CAST(payload AS BLOB))>? THEN NULL ELSE payload END AS payload,substr(json_extract(payload,'$.name'),1,240) AS display_name,json_extract(payload,'$.tier') AS tier FROM items WHERE ${where} ORDER BY ${field},id LIMIT ?`).iterate(256*1024,...args,limit+1)){
        const content=item.payload===null?{id:item.id,name:item.display_name||item.name,tier:item.tier,repositoryLarge:true}:parse(item.payload),transport=item.kind==='card'?content:{id:item.id,entry:content};
        const bytes=Buffer.byteLength(JSON.stringify(transport))+Buffer.byteLength(item.id)+64;if(items.length>=limit||used+bytes>LIMITS.pageBytes-8192){more=true;break;}
        items.push(transport);kinds[item.id]=item.kind;if(item.payload===null)largeItems[item.id]={bytes:item.bytes};used+=bytes;last=item;
    }
    const nextCursor=more?Buffer.from(JSON.stringify({profile:row.id,generation:row.generation,revision:row.revision,scope,sort,query,value:last[field],id:last.id})).toString('base64url'):null;
    const counts=parse(row.counts);let filteredTotal=null;if(!query){filteredTotal=scope==='all'?counts.total:scope==='loose'?counts.loose:scope==='keyring'?counts.keyring:scope==='rejected'?counts.rejected:scope==='equipped'?db.prepare("SELECT COUNT(*) AS n FROM items WHERE profile=? AND generation=? AND kind='card' AND (equipped_slot IS NOT NULL OR id IN(SELECT value FROM json_each(?)))").get(row.id,row.generation,JSON.stringify(parse(row.core).pendingEquipment||{})).n:counts.groups?.[scope]||0;}
    return {ok:true,items,kinds,largeItems,profileId:row.id,revision:row.revision,generation:row.generation,nextCursor,counts,filteredTotal};
}
function importJob(value){const job=jobs.get(value.jobId);if(!job||job.cancelled)throw failure('cancelled','This import is no longer active.');const row=rowFor(job.profile);if(row.revision!==job.revision||getMeta('active_profile')!==job.profile)throw failure('revision-conflict','The selected character changed during import. The previous inventory was kept.');return job;}
function stageRow(job,row){
    const payload=json(row,16384,'Inventory source row');let parent=null,occurrence=0;
    if(row.section==='items'){
        if(row.group!=='equipment'&&db.prepare("SELECT 1 FROM raw_rows WHERE profile=? AND generation=? AND section='items' AND root_location=? AND root_occurrence=? AND location=? LIMIT 1").get(job.profile,job.generation,row.rootLocation,row.rootOccurrence,row.location))throw failure('invalid-inventory','The export contains a duplicate storage location.');
        if(row.parentLocation){
            parent=db.prepare("SELECT ordinal,empty FROM raw_rows WHERE profile=? AND generation=? AND section='items' AND root_location=? AND root_occurrence=? AND location=? AND ordinal<? ORDER BY ordinal DESC LIMIT 1").get(job.profile,job.generation,row.rootLocation,row.rootOccurrence,row.parentLocation,row.ordinal);
            if(!parent||parent.empty)throw failure('invalid-inventory','A nested inventory row has no preceding nonempty parent in its physical root.');
            if(db.prepare('SELECT 1 FROM raw_rows WHERE profile=? AND generation=? AND parent_ordinal=? AND source_slot=? LIMIT 1').get(job.profile,job.generation,parent.ordinal,row.sourceSlot))throw failure('invalid-inventory','A physical parent contains duplicate source socket positions.');
        }
    }
    if(row.section==='keyring'){const origin=JSON.stringify([row.group,row.location,row.itemId,row.tier]),counter=db.prepare('SELECT next_occurrence FROM import_occurrences WHERE profile=? AND generation=? AND origin=?').get(job.profile,job.generation,origin);occurrence=counter?.next_occurrence||0;db.prepare('INSERT INTO import_occurrences VALUES(?,?,?,?) ON CONFLICT(profile,generation,origin) DO UPDATE SET next_occurrence=excluded.next_occurrence').run(job.profile,job.generation,origin,occurrence+1);}
    db.prepare('INSERT INTO raw_rows(profile,generation,ordinal,section,location,root_location,root_occurrence,group_name,parent_location,parent_ordinal,source_slot,empty,occurrence,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(job.profile,job.generation,row.ordinal,row.section,row.location,row.rootLocation,row.rootOccurrence,row.group,row.parentLocation,parent?.ordinal??null,row.sourceSlot,row.empty?1:0,occurrence,payload);
}
async function beginImport(value){
    if(jobs.size)throw failure('import-busy','An inventory import is already active.');id(value.jobId,'import ID');const row=rowFor(value.profileId);checkRevision(row,value.expectedRevision);if(getMeta('active_profile')!==row.id)throw failure('selection-changed','The selected character changed.');
    if(!object(value.pack)||!Array.isArray(value.pack.items))throw failure('catalog-unavailable','The local item catalog is unavailable.');const h=await helpers();
    const job={id:value.jobId,profile:row.id,revision:row.revision,generation:randomUUID(),core:parse(row.core),flow:row.flow,pack:value.pack,helpers:h,files:{},lastPrepared:-1,lastRetained:null,prepared:false,retained:false,equipment:{},cancelled:false,achievementText:'',summary:null,now:Date.now(),sequence:0};
    job.parser=h.createInventoryStreamParser({onRow:entry=>stageRow(job,entry)});jobs.set(job.id,job);db.prepare('INSERT INTO import_jobs VALUES(?,?,?,?,?,?)').run(job.id,job.profile,job.generation,job.revision,'staging',Date.now());return {ok:true,jobId:job.id};
}
function appendImport(value){
    const job=importJob(value);if(typeof value.text!=='string'||value.text.length>256*1024)throw failure('invalid-request','Import chunks must be bounded decoded text.');
    if(value.kind==='inventory'){if(job.summary)throw failure('invalid-request','The inventory stream already ended.');transaction(()=>job.parser.write(value.text));}
    else if(value.kind==='achievements'){if(job.files.achievements)throw failure('invalid-request','The achievement stream already ended.');if(job.achievementText.length+value.text.length>job.helpers.ACHIEVEMENT_LIMITS.characters)throw failure('record-too-large','The achievement record exceeds its supported per-record limit.');job.achievementText+=value.text;}
    else throw failure('invalid-request','Unknown game export kind.');return {ok:true};
}
function finishImportFile(value){const job=importJob(value);if(!object(value.file))throw failure('invalid-request','Verified export metadata is required.');if(value.kind==='inventory')transaction(()=>job.summary=job.parser.finish().summary);else if(value.kind==='achievements'){job.achievements=job.helpers.parseAchievementExport(job.achievementText);job.achievementText='';}else throw failure('invalid-request','Unknown game export kind.');job.files[value.kind]=value.file;return {ok:true,summary:job.summary};}
function storeRejected(job,value,ordinal,index=0){insertItem(job.profile,job.generation,cardData(value,'rejected',ordinal*16+index,`source-rejected-${ordinal}-${index}`));}
function prepareImportPage(value){
    const job=importJob(value);if(!job.files.inventory||!job.files.achievements)throw failure('invalid-request','Both game exports must be verified before resolving inventory.');
    if(!job.prepared){
        const rows=db.prepare('SELECT * FROM raw_rows WHERE profile=? AND generation=? AND ordinal>? ORDER BY ordinal LIMIT 50').all(job.profile,job.generation,job.lastPrepared);
        transaction(()=>{
            for(const row of rows){job.lastPrepared=row.ordinal;const current=db.prepare('SELECT attached FROM raw_rows WHERE profile=? AND generation=? AND ordinal=?').get(job.profile,job.generation,row.ordinal);if(current.attached||row.empty)continue;
                let entry=parse(row.payload),occurrence=row.occurrence;const h=job.helpers;
                if(entry.section==='keyring'){
                    const resolution=h.resolveInventoryCatalog(job.pack,entry.baseName||entry.name,{socket:entry.group==='augment'});
                    const merged=h.mergeImportedKeyringRow({entry,resolution,now:job.now,occurrence});if(merged.entry)insertItem(job.profile,job.generation,cardData(merged.entry,'keyring',entry.ordinal*16,`source-keyring-${entry.ordinal}`));merged.rejected.forEach((rejected,index)=>storeRejected(job,rejected,entry.ordinal,index));continue;
                }
                const childCount=db.prepare('SELECT COUNT(*) AS n FROM raw_rows WHERE profile=? AND generation=? AND parent_ordinal=?').get(job.profile,job.generation,entry.ordinal).n;
                const parentKind=h.inventoryParentKind(job.pack,entry);
                const children=childCount?db.prepare('SELECT ordinal,payload FROM raw_rows WHERE profile=? AND generation=? AND parent_ordinal=? ORDER BY ordinal LIMIT 9').all(job.profile,job.generation,entry.ordinal).map(child=>({...parse(child.payload),hasChildren:Boolean(db.prepare('SELECT 1 FROM raw_rows WHERE profile=? AND generation=? AND parent_ordinal=? LIMIT 1').get(job.profile,job.generation,child.ordinal))})):[];
                const allChildrenAreLeafSingles=!db.prepare("SELECT 1 FROM raw_rows AS child WHERE child.profile=? AND child.generation=? AND child.parent_ordinal=? AND ((child.empty=0 AND json_extract(child.payload,'$.count')<>1) OR EXISTS(SELECT 1 FROM raw_rows AS nested WHERE nested.profile=child.profile AND nested.generation=child.generation AND nested.parent_ordinal=child.ordinal)) LIMIT 1").get(job.profile,job.generation,entry.ordinal);
                const prepared=h.prepareInventoryParent(entry,children,{parentKind,childCount,allChildrenAreLeafSingles});entry=prepared.entry;
                if(prepared.attached)db.prepare('UPDATE raw_rows SET attached=1 WHERE profile=? AND generation=? AND parent_ordinal=?').run(job.profile,job.generation,entry.ordinal);
                if(!entry.slot)entry={...entry,group:h.inventoryLooseGroup(entry)};
                const resolution=h.resolveInventoryCatalog(job.pack,entry.baseName||entry.name,{socket:entry.group==='augment'}),originKey=h.inventoryOriginKey(entry,{occurrence}),oldGeneration=rowFor(job.profile).generation;
                let previous=db.prepare('SELECT payload FROM items WHERE profile=? AND generation=? AND physical_key=? LIMIT 2').all(job.profile,oldGeneration,originKey);
                if(!previous.length&&entry.group==='augment')previous=db.prepare("SELECT payload FROM items WHERE profile=? AND generation=? AND json_extract(payload,'$.inventoryOrigin.location')=? AND json_extract(payload,'$.inventoryOrigin.itemId')=? AND json_extract(payload,'$.inventoryOrigin.tier')=? AND json_extract(payload,'$.inventoryOrigin.baseName')=? AND json_extract(payload,'$.inventoryOrigin.group') IN('inventory','bank','shared-bank','personal-depot','held') LIMIT 2").all(job.profile,oldGeneration,entry.location,entry.itemId,entry.tier,entry.baseName);
                if(previous.length>1)throw failure('ambiguous-binding','More than one saved physical copy matches this exported location. Review the saved copies before importing.');const previousCard=previous.length===1?parse(previous[0].payload):null;
                const merged=h.mergeImportedInventoryRow({entry,previousCard,resolution,id:previousCard?.id||`character-${randomUUID()}`,now:job.now,occurrence,resolveItem:child=>h.resolveInventoryCatalog(job.pack,child.baseName||child.name,{socket:child.group==='augment'})});
                if(merged.card){insertItem(job.profile,job.generation,cardData(merged.card,'card',entry.ordinal*16));if(merged.slot)job.equipment[merged.slot]=merged.card.id;}
                merged.rejected.forEach((rejected,index)=>storeRejected(job,rejected,entry.ordinal,index));
            }
        });if(rows.length===50)return {ok:true,done:false,rows:job.lastPrepared+1,phase:'resolve'};job.prepared=true;
    }
    if(!job.retained){
        const previousGeneration=rowFor(job.profile).generation,rows=db.prepare("SELECT id,payload FROM items WHERE profile=? AND generation=? AND kind='card' AND id>? ORDER BY id LIMIT 50").all(job.profile,previousGeneration,job.lastRetained||'');
        transaction(()=>{for(const row of rows){job.lastRetained=row.id;if(db.prepare('SELECT 1 FROM items WHERE profile=? AND generation=? AND id=?').get(job.profile,job.generation,row.id))continue;const card=parse(row.payload),data=cardData(card,'card',job.summary.rowCount*16+(++job.sequence));data.group=card.inventoryOrigin?'retained':'manual';insertItem(job.profile,job.generation,data);}});
        if(rows.length===50)return {ok:true,done:false,rows:job.summary.rowCount,phase:'retain'};job.retained=true;
    }
    return {ok:true,done:true,rows:job.summary.rowCount};
}
function commitImport(value){
    const job=importJob(value);if(!job.prepared||!job.retained)throw failure('invalid-request','Inventory resolution is incomplete.');
    return transaction(()=>{
        const row=rowFor(job.profile);checkRevision(row,job.revision);if(job.cancelled||getMeta('active_profile')!==job.profile)throw failure('cancelled','The selected character changed.');
        saveGeneration(row);
        const inventoryCount=db.prepare("SELECT COUNT(*) AS n FROM raw_rows WHERE profile=? AND generation=? AND section='items' AND group_name<>'equipment' AND empty=0 AND attached=0").get(job.profile,job.generation).n;
        const core={...job.core,equipment:{...job.equipment},pendingEquipment:{},statSnapshots:{...job.core.statSnapshots,current:null},inventoryExport:{schemaVersion:1,importedAt:job.now,file:job.files.inventory,rowCount:job.summary.rowCount,equipmentSlotCount:23,emptyEquipmentCount:job.summary.emptyEquipmentCount,inventoryCount},achievements:job.achievements,achievementExport:{schemaVersion:1,importedAt:job.now,file:job.files.achievements},updatedAt:job.now};
        const charm=job.core.equipment?.charm;if(charm&&db.prepare("SELECT 1 FROM items WHERE profile=? AND generation=? AND id=? AND kind='card'").get(job.profile,job.generation,charm))core.equipment.charm=charm;
        equip(job.profile,job.generation,core);const counts=recount(job.profile,job.generation,job.summary.rowCount);
        let flow=row.flow;if(flow!==null){const previous=parse(flow);if(object(previous)&&previous.schemaVersion===1)flow=flowText({...previous,...(previous.active&&previous.step==='inventory'?{step:'stats',inventoryAccepted:true}:{}),statsAccepted:false,statsDraft:'',statsDirty:false,statsAfterAt:job.now});}
        db.prepare('UPDATE profiles SET revision=revision+1,generation=?,core=?,flow=?,counts=?,updated=? WHERE id=?').run(job.generation,coreText(core),flow,JSON.stringify(counts),Date.now(),job.profile);
        db.prepare("UPDATE import_jobs SET state='committed' WHERE id=?").run(job.id);jobs.delete(job.id);const saved=rowFor(job.profile);saveGeneration(saved);return snapshot(saved);
    });
}
function cancelImport(value){const job=jobs.get(value.jobId);if(job){job.cancelled=true;jobs.delete(job.id);db.prepare("UPDATE import_jobs SET state='cancelled' WHERE id=?").run(job.id);}return {ok:true};}
async function handle(action,value={}){
    if(initialError)throw initialError;
    if(getMeta('seed_token')&&['createProfile','selectProfile','transaction','beginImport'].includes(action))throw failure('seed-pending','Finish or cancel the legacy browser recovery before changing this character.');
    if(action==='bootstrap')return {...listProfiles(),schemaVersion:1,available:true,legacySeedAllowed:canSeed(),migration:parse(getMeta('migration')||'null')};
    if(action==='collectGarbage')return collectGarbage();
    if(action==='backupReferences')return backupReferences(value);
    if(action==='beginSeed'){if(!canSeed())throw failure('seed-not-allowed','Legacy browser data can seed only an untouched new native repository.');id(value.token,'legacy seed token');setMeta('seed_token',value.token);return {ok:true};}
    if(action==='cancelSeed'){if(getMeta('seed_token')===value.token)db.prepare("DELETE FROM meta WHERE key='seed_token'").run();return {ok:true};}
    if(action==='commitSeed'){if(getMeta('seed_token')!==value.token)throw failure('seed-not-allowed','Legacy recovery is no longer active.');const expected=path.join(workerData.directory,`browser-seed-${value.token}.json`);if(value.file!==expected)throw failure('invalid-request','Invalid private seed destination.');await migrate(expected);return handle('bootstrap');}
    if(action==='listProfiles')return listProfiles(value);
    if(action==='createProfile'){const label=metadata(value.metadata),profileId=randomUUID();return transaction(()=>{const from=(value.fromProfileId||getMeta('active_profile')==='draft')?'draft':null;if(value.fromProfileId&&value.fromProfileId!=='draft')throw failure('invalid-request','Only the unregistered draft can be promoted.');if(from){const draft=rowFor('draft');if(value.expectedRevision!==undefined)checkRevision(draft,value.expectedRevision);const core={...parse(draft.core),metadata:{...parse(draft.core).metadata,...value.metadata,...label}};db.prepare('UPDATE profiles SET id=?,name=?,server=?,identity=?,revision=revision+1,core=? WHERE id=?').run(profileId,label.name,label.server,profileIdentity(label.name,label.server),coreText(core),'draft');for(const table of ['items','raw_rows','removed_instances','generation_snapshots'])db.prepare(`UPDATE ${table} SET profile=? WHERE profile='draft'`).run(profileId);}else{const core=emptyCore({...value.metadata,...label});db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?)').run(profileId,label.name,label.server,profileIdentity(label.name,label.server),0,randomUUID(),coreText(core),null,JSON.stringify(blankCounts()),Date.now());}setMeta('active_profile',profileId);ensureDraft();const saved=rowFor(profileId);saveGeneration(saved);saveGeneration(rowFor('draft'));return snapshot(saved);});}
    if(action==='selectProfile'){const row=rowFor(value.profileId);for(const job of [...jobs.values()])cancelImport({jobId:job.id});setMeta('active_profile',row.id);return snapshot(row);}
    if(action==='getCore')return snapshot(rowFor(value.profileId));
    if(action==='transaction')return change(value);
    if(action==='list')return list(value);
    if(action==='get'){const row=rowFor(value.profileId),item=db.prepare('SELECT length(CAST(payload AS BLOB)) AS bytes,kind,CASE WHEN length(CAST(payload AS BLOB))>? THEN NULL ELSE payload END AS payload FROM items WHERE profile=? AND generation=? AND id=?').get(LIMITS.pageBytes-8192,row.id,row.generation,id(value.id,'item ID'));if(!item)throw failure('item-missing','This inventory item no longer exists.');if(item.payload===null)return {ok:true,large:true,item:null,id:value.id,totalBytes:item.bytes,kind:item.kind,revision:row.revision,generation:row.generation};return {ok:true,item:item.kind==='card'?parse(item.payload):{id:value.id,entry:parse(item.payload)},kind:item.kind,revision:row.revision,generation:row.generation};}
    if(action==='getChunk'){const row=rowFor(value.profileId);checkRevision(row,value.revision);if(value.generation!==row.generation)throw failure('revision-conflict','The inventory changed while reading this item.');const offset=value.offset,length=value.length??LIMITS.recordChunkBytes;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<1||length>LIMITS.recordChunkBytes)throw failure('invalid-request','Invalid item chunk request.');const item=db.prepare('SELECT substr(CAST(payload AS BLOB),?,?) AS bytes,length(CAST(payload AS BLOB)) AS total FROM items WHERE profile=? AND generation=? AND id=?').get(offset+1,length,row.id,row.generation,id(value.id,'item ID'));if(!item)throw failure('item-missing','This inventory item no longer exists.');if(offset>item.total)throw failure('invalid-request','Invalid item chunk offset.');return {ok:true,bytes:item.bytes,totalBytes:item.total,nextOffset:offset+item.bytes.length,revision:row.revision,generation:row.generation};}
    if(action==='beginImport')return beginImport(value);
    if(action==='appendImport')return appendImport(value);
    if(action==='finishImportFile')return finishImportFile(value);
    if(action==='prepareImportPage')return prepareImportPage(value);
    if(action==='commitImport')return commitImport(value);
    if(action==='cancelImport')return cancelImport(value);
    if(action==='flush'){db.exec('PRAGMA wal_checkpoint(PASSIVE)');return {ok:true};}
    if(action==='backup'){const target=path.join(workerData.directory,`character-backup-${randomUUID()}.sqlite`);await backup(db,target);return {ok:true,name:path.basename(target)};}
    if(action==='close'){for(const job of jobs.values())job.cancelled=true;db.close();return {ok:true};}
    throw failure('invalid-request','Unknown Character repository operation.');
}
initialize().catch(error=>{initialError=error;}).then(()=>{parentPort.postMessage({ready:true,error:initialError?{code:initialError.code||'repository-unavailable',message:initialError.message}:null});});
parentPort.on('message',message=>{chain=chain.then(async()=>{try{parentPort.postMessage({id:message.id,result:await handle(message.action,message.value)});}catch(error){parentPort.postMessage({id:message.id,result:{ok:false,code:error.code||'repository-error',error:String(error.message||'Character storage failed.').slice(0,400)}});}});});
