'use strict';
// Sole SQLite owner; bounded reads/transactions stay off Electron's main thread.
const {parentPort,workerData}=require('node:worker_threads'),{DatabaseSync}=require('node:sqlite');
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {DropObservationStorage,normalizeObservation,account,sameAccount,HOUR,MAX_FILE_BYTES}=require('./drop-observation-storage.cjs');
const object=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,120}$/.test(value);
const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const parse=value=>JSON.parse(value),json=value=>JSON.stringify(value);
let db,settings,initialError,chain=Promise.resolve();
const blankCounts=()=>({pending:0,pendingWithCharacterName:0,conflicts:0,rejected:0});
const initial=now=>({schemaVersion:1,enabled:true,includeCharacterName:false,lastAttemptAt:0,lastSuccessAt:0,nextAttemptAt:now,failures:0,acknowledged:0,lastError:null,notBeforeAt:0,budgetOwner:null,counts:blankCounts(),uploadWindowStartedAt:0,uploadWindowBatchIds:[]});
const getMeta=key=>db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value??null;
const setMeta=(key,value)=>db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);
const saveSettings=()=>setMeta('settings',json(settings));
function validateSettings(value){
    if(!object(value)||value.schemaVersion!==1||typeof value.enabled!=='boolean'||typeof value.includeCharacterName!=='boolean'||value.lastError!==null&&(typeof value.lastError!=='string'||value.lastError.length>300))throw Error('Invalid observation settings.');
    for(const key of ['lastAttemptAt','lastSuccessAt','nextAttemptAt','failures','acknowledged','uploadWindowStartedAt'])if(!Number.isSafeInteger(value[key])||value[key]<0)throw Error('Invalid observation schedule.');
    if(!Array.isArray(value.uploadWindowBatchIds)||value.uploadWindowBatchIds.length>120||new Set(value.uploadWindowBatchIds).size!==value.uploadWindowBatchIds.length||value.uploadWindowBatchIds.some(id=>!token(id)))throw Error('Invalid observation budget.');
    if(!Number.isSafeInteger(value.notBeforeAt)||value.notBeforeAt<0||!object(value.counts)||Object.keys(blankCounts()).some(key=>!Number.isSafeInteger(value.counts[key])||value.counts[key]<0))throw Error('Invalid observation counters.');
    if(value.budgetOwner!==null)account(value.budgetOwner);
}
function transaction(fn){
    const previous=settings?structuredClone(settings):null;db.exec('BEGIN IMMEDIATE');
    try{const result=fn();if(settings){validateSettings(settings);saveSettings();}db.exec('COMMIT');return result;}
    catch(error){try{db.exec('ROLLBACK');}catch{}if(previous)settings=previous;throw error;}
}
function readCounts(){
    const counts=blankCounts();
    for(const row of db.prepare('SELECT status,COUNT(*) AS n,SUM(has_character_name) AS named FROM observations GROUP BY status').iterate()){
        if(row.status==='pending'){counts.pending=row.n;counts.pendingWithCharacterName=row.named||0;}else if(row.status==='conflict')counts.conflicts=row.n;else if(row.status==='rejected')counts.rejected=row.n;
    }
    return counts;
}
function status(){
    if(!db||!settings||initialError)return null;
    return {enabled:settings.enabled,includeCharacterName:settings.includeCharacterName,...settings.counts,acknowledged:settings.acknowledged,lastAttemptAt:settings.lastAttemptAt,lastSuccessAt:settings.lastSuccessAt,nextAttemptAt:settings.nextAttemptAt,failures:settings.failures,error:settings.lastError};
}
async function safeFile(file){const stat=await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('Unsafe private observation file.');return stat;}
function insertRecord(record){
    const event=record.event,user=record.account===null?null:account(record.account);
    db.prepare('INSERT INTO observations(id,hash,payload,observed_at,status,account_id,account_name,batch_id,has_character_name,code) VALUES(?,?,?,?,?,?,?,?,?,?)').run(event.id,record.hash,json(event),event.observedAt,record.status,user?.id??null,user?.name??null,record.batchId??null,Object.hasOwn(event,'characterName')?1:0,record.code??null);
    if(record.status==='pending'){settings.counts.pending++;if(Object.hasOwn(event,'characterName'))settings.counts.pendingWithCharacterName++;}else if(record.status==='conflict')settings.counts.conflicts++;else if(record.status==='rejected')settings.counts.rejected++;
}
function insertBatch(batch){
    const payload={schemaVersion:1,batchId:batch.batchId,clientVersion:batch.clientVersion,events:batch.events};
    db.prepare('INSERT INTO batches(id,account_id,account_name,client_version,payload,hash,event_count,bytes,has_character_name) VALUES(?,?,?,?,?,?,?,?,?)').run(batch.batchId,batch.account.id,batch.account.name,batch.clientVersion,json(payload),batch.hash,batch.events.length,Buffer.byteLength(json(payload)),batch.events.some(event=>Object.hasOwn(event,'characterName'))?1:0);
}
async function migrate(now){
    const source=await safeFile(workerData.legacyFile);if(!source){transaction(()=>{settings=initial(now);setMeta('activated','1');});return;}
    if(source.size>MAX_FILE_BYTES)throw Error('Legacy observations exceed their supported format.');
    const raw=await fs.readFile(workerData.legacyFile),legacy=parse(raw.toString('utf8'));
    const validator=new DropObservationStorage({directory:workerData.directory,now:()=>now});validator.check(legacy);
    const backup=path.join(workerData.directory,`drop-observations-legacy-backup-${randomUUID()}.json`);
    const handle=await fs.open(backup,'wx',0o600);try{await handle.writeFile(raw);await handle.sync();}finally{await handle.close();}
    const sourceHash=hash(raw);if(hash(await fs.readFile(backup))!==sourceHash||hash(await fs.readFile(workerData.legacyFile))!==sourceHash)throw Error('Legacy observation backup could not be verified.');
    transaction(()=>{
        settings={...initial(now),...Object.fromEntries(Object.keys(initial(now)).filter(key=>Object.hasOwn(legacy,key)).map(key=>[key,legacy[key]]))};
        settings.counts=blankCounts();
        // Legacy schema 1 stored only soft hourly/backoff schedules. Upgrade
        // activation gets one prompt attempt against the healthy receiver;
        // ordinary SQLite restarts preserve all hard deadlines and retries.
        settings.failures=0;settings.lastError=null;settings.nextAttemptAt=Math.max(now,settings.notBeforeAt);
        for(const record of legacy.records)insertRecord(record);
        for(const receipt of legacy.receipts){const previous=db.prepare('SELECT hash FROM receipts WHERE id=?').get(receipt.id);if(previous&&previous.hash!==receipt.hash)throw Error('Legacy receipt hashes conflict.');db.prepare('INSERT OR IGNORE INTO receipts(id,hash) VALUES(?,?)').run(receipt.id,receipt.hash);}
        for(const batch of legacy.batches)insertBatch(batch);
        // Verify persisted content/bindings before activating this authority.
        if(db.prepare('SELECT COUNT(*) AS n FROM observations').get().n!==legacy.records.length||db.prepare('SELECT COUNT(*) AS n FROM batches').get().n!==legacy.batches.length)throw Error('Legacy observation migration counts differ.');
        for(const record of legacy.records){const row=db.prepare('SELECT hash,payload,status,account_id,account_name,batch_id FROM observations WHERE id=?').get(record.event.id);if(row.hash!==record.hash||row.payload!==json(record.event)||row.status!==record.status||row.account_id!==(record.account?.id??null)||row.account_name!==(record.account?.name??null)||row.batch_id!==(record.batchId??null))throw Error('Legacy observation migration proof differs.');}
        for(const batch of legacy.batches){const row=db.prepare('SELECT hash,payload FROM batches WHERE id=?').get(batch.batchId);if(row.hash!==batch.hash||row.payload!==json({schemaVersion:1,batchId:batch.batchId,clientVersion:batch.clientVersion,events:batch.events}))throw Error('Legacy immutable batch proof differs.');}
        setMeta('legacy_source',json({sha256:sourceHash,backup:path.basename(backup),records:legacy.records.length,receipts:new Set(legacy.receipts.map(row=>row.id)).size,batches:legacy.batches.length}));setMeta('activated','1');
    });
}
async function initialize(now){
    if(db&&settings)return;
    await fs.mkdir(workerData.directory,{recursive:true});const directory=await fs.lstat(workerData.directory);if(!directory.isDirectory()||directory.isSymbolicLink())throw Error('Unsafe private observation directory.');
    const existing=await safeFile(workerData.file);for(const suffix of ['-wal','-shm'])await safeFile(workerData.file+suffix);
    if(existing?.size){const file=await fs.open(workerData.file,'r');try{const prefix=Buffer.alloc(16);await file.read(prefix,0,16,0);if(prefix.toString('binary')!=='SQLite format 3\0')throw Error('The observation database header is corrupt.');}finally{await file.close();}}
    db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');await fs.chmod(workerData.file,0o600);
    const version=db.prepare('PRAGMA user_version').get().user_version;if(version!==0&&version!==1)throw Error('Unsupported observation database version.');
    db.exec(`CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,hash TEXT NOT NULL,payload TEXT NOT NULL,observed_at TEXT NOT NULL,status TEXT NOT NULL,account_id INTEGER,account_name TEXT,batch_id TEXT,has_character_name INTEGER NOT NULL DEFAULT 0,code TEXT);
        CREATE INDEX IF NOT EXISTS observation_pending ON observations(status,account_id,account_name,has_character_name,observed_at DESC,id);
        CREATE INDEX IF NOT EXISTS observation_order ON observations(status,observed_at DESC,id);
        CREATE INDEX IF NOT EXISTS observation_batch ON observations(batch_id);
        CREATE INDEX IF NOT EXISTS observation_owner_order ON observations(status,account_id,account_name,batch_id,observed_at DESC,id);
        CREATE INDEX IF NOT EXISTS observation_owner_named_order ON observations(status,account_id,account_name,batch_id,has_character_name,observed_at DESC,id);
        CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS rate_attempts(account_id INTEGER NOT NULL,account_name TEXT NOT NULL,batch_id TEXT NOT NULL,attempted_at INTEGER NOT NULL,PRIMARY KEY(account_id,account_name,batch_id));
        CREATE INDEX IF NOT EXISTS rate_attempt_owner ON rate_attempts(account_id,account_name,attempted_at);
        CREATE TABLE IF NOT EXISTS quota_deadlines(account_id INTEGER NOT NULL,account_name TEXT NOT NULL,not_before_at INTEGER NOT NULL,PRIMARY KEY(account_id,account_name));
        CREATE TABLE IF NOT EXISTS batches(ordinal INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,account_id INTEGER NOT NULL,account_name TEXT NOT NULL,client_version TEXT NOT NULL,payload TEXT NOT NULL,hash TEXT NOT NULL,event_count INTEGER NOT NULL,bytes INTEGER NOT NULL,has_character_name INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS batch_owner ON batches(account_id,account_name,ordinal);
        PRAGMA user_version=1;`);
    if(getMeta('activated')==='1'){
        const saved=parse(getMeta('settings')),counts=readCounts();settings={...initial(now),...saved};
        if(Object.hasOwn(saved,'counts')){if(Object.keys(counts).some(key=>saved.counts?.[key]!==counts[key]))throw Error('Observation counters do not match their saved records.');}else settings.counts=counts;
        validateSettings(settings);saveSettings();
    }
    else await migrate(now);
    if(db.prepare('PRAGMA quick_check(1)').get().quick_check!=='ok')throw Error('Observation database integrity could not be verified.');
}
function compatibleWhere(user,options={},unbatched=false){
    return {where:`status='pending' AND (account_id IS NULL OR (account_id=? AND account_name=?))${options.characterNameSupported===false?' AND has_character_name=0':''}${unbatched?' AND batch_id IS NULL':''}`,params:[user.id,user.name]};
}
function hardDeadline(owner,now){
    if(settings.notBeforeAt<=now)settings.notBeforeAt=0;
    const quota=owner?db.prepare('SELECT not_before_at FROM quota_deadlines WHERE account_id=? AND account_name=?').get(owner.id,owner.name)?.not_before_at||0:0;
    return Math.max(settings.notBeforeAt,quota>now?quota:0);
}
function storedEvent(row,now){
    const event=parse(row.payload),normalized=normalizeObservation(event,{now});
    if(row.id!==normalized.id||row.hash!==hash(normalized)||row.hash!==hash(event)||row.observed_at!==normalized.observedAt||row.has_character_name!==(Object.hasOwn(event,'characterName')?1:0))throw Error('The saved observation payload could not be verified.');
    return event;
}
function boundBatch(saved,user,now){
    const batch=parse(saved.payload),keys=['schemaVersion','batchId','clientVersion','events'];
    if(!object(batch)||Object.keys(batch).some(key=>!keys.includes(key))||batch.schemaVersion!==1||batch.batchId!==saved.id||!token(batch.batchId)||typeof batch.clientVersion!=='string'||batch.clientVersion.length>80||batch.clientVersion!==saved.client_version||!Array.isArray(batch.events)||!batch.events.length||batch.events.length>100||saved.account_id!==user.id||saved.account_name!==user.name||saved.bytes!==Buffer.byteLength(saved.payload)||saved.bytes>262144||saved.hash!==hash(batch.events)||saved.has_character_name!==(batch.events.some(event=>Object.hasOwn(event,'characterName'))?1:0))throw Error('The saved observation batch binding could not be verified.');
    const expected=new Map();for(const event of batch.events){const normalized=normalizeObservation(event,{now});if(expected.has(event.id)||hash(event)!==hash(normalized))throw Error('The saved observation batch binding could not be verified.');expected.set(event.id,hash(event));}
    const records=db.prepare('SELECT id,hash,payload,observed_at,status,account_id,account_name,has_character_name FROM observations WHERE batch_id=? LIMIT 101').all(batch.batchId);
    if(saved.event_count!==expected.size||records.length!==expected.size||records.some(row=>!expected.has(row.id)||row.hash!==expected.get(row.id)||row.status!=='pending'||row.account_id!==user.id||row.account_name!==user.name))throw Error('The saved observation batch binding could not be verified.');
    for(const row of records)storedEvent(row,now);
    return {batch,records};
}
function prepareBatch(value,now){
    const user=account(value.owner),version=value.version,options=value.options||{},maximum=options.maxEvents??100,maxBytes=options.maxBytes??262144;
    if(typeof version!=='string'||version.length>80||!token(value.batchId)||!Number.isSafeInteger(maximum)||maximum<1||maximum>100||!Number.isSafeInteger(maxBytes)||maxBytes<8192||maxBytes>262144)throw Error('Invalid observation batch limits.');
    return transaction(()=>{
        const previous=db.prepare(`SELECT * FROM batches WHERE account_id=? AND account_name=? AND event_count<=? AND bytes<=?${options.characterNameSupported===false?' AND has_character_name=0':''} ORDER BY ordinal LIMIT 1`).get(user.id,user.name,maximum,maxBytes);if(previous)return boundBatch(previous,user,now).batch;
        // Read two indexed bounded streams, then merge their heads. A single
        // OR/account filter can otherwise scan another account's whole queue.
        const fields='id,hash,payload,observed_at,has_character_name',names=options.characterNameSupported===false?' AND has_character_name=0':'';
        const owned=db.prepare(`SELECT ${fields} FROM observations WHERE status='pending' AND account_id=? AND account_name=? AND batch_id IS NULL${names} ORDER BY observed_at DESC,id ASC LIMIT ?`).all(user.id,user.name,maximum);
        const unbound=db.prepare(`SELECT ${fields} FROM observations WHERE status='pending' AND account_id IS NULL AND account_name IS NULL AND batch_id IS NULL${names} ORDER BY observed_at DESC,id ASC LIMIT ?`).all(maximum);
        const candidates=[...owned,...unbound].sort((a,b)=>a.observed_at>b.observed_at?-1:a.observed_at<b.observed_at?1:a.id<b.id?-1:a.id>b.id?1:0).slice(0,maximum);
        if(!candidates.length)return null;
        const events=[],records=[],batchId=value.batchId;let bytes=Buffer.byteLength(json({schemaVersion:1,batchId,clientVersion:version,events:[]}));
        for(const row of candidates){const event=storedEvent(row,now),extra=Buffer.byteLength(json(event))+(events.length?1:0);if(bytes+extra>maxBytes)break;events.push(event);records.push(row.id);bytes+=extra;}
        if(!events.length)throw Error('Observation does not fit the advertised batch size.');
        insertBatch({batchId,clientVersion:version,account:user,events,hash:hash(events)});
        const bind=db.prepare('UPDATE observations SET account_id=?,account_name=?,batch_id=? WHERE id=? AND batch_id IS NULL');for(const id of records)if(Number(bind.run(user.id,user.name,batchId,id).changes)!==1)throw Error('Observation batch binding changed.');
        return {schemaVersion:1,batchId,clientVersion:version,events};
    });
}
function acknowledge(value){
    const user=account(value.owner),batch=value.batch,ack=value.receipt?.eozobservations||value.receipt;
    return transaction(()=>{
        const saved=token(batch?.batchId)?db.prepare('SELECT * FROM batches WHERE id=?').get(batch.batchId):null;
        if(!saved||saved.account_id!==user.id||saved.account_name!==user.name||saved.hash!==hash(batch.events))throw Error('The observation batch changed before acknowledgment.');
        if(!object(ack)||ack.schemaVersion!==1||ack.batchId!==batch.batchId||!sameAccount(ack.account,user)||!Array.isArray(ack.accepted)||!Array.isArray(ack.duplicates)||!Array.isArray(ack.conflicts)||!Array.isArray(ack.rejected)||!Number.isFinite(Date.parse(ack.receivedAt)))throw Error('The wiki observation receipt could not be verified.');
        const verified=boundBatch(saved,user,value.now),records=verified.records,expected=new Set(verified.batch.events.map(event=>event.id)),seen=new Set(),accepted=new Set([...ack.accepted,...ack.duplicates]),issues=new Map();
        for(const [kind,values]of [['accepted',ack.accepted],['duplicates',ack.duplicates],['conflict',ack.conflicts],['rejected',ack.rejected]])for(const entry of values){const id=kind==='rejected'?entry?.id:entry;if(!token(id)||!expected.has(id)||seen.has(id))throw Error('The wiki observation receipt has invalid event IDs.');seen.add(id);if(kind==='rejected'){if(typeof entry.code!=='string'||!/^[a-z0-9_-]{1,80}$/i.test(entry.code))throw Error('Invalid observation rejection.');issues.set(id,{status:'rejected',code:entry.code});}if(kind==='conflict')issues.set(id,{status:'conflict',code:'payload-conflict'});}
        if(seen.size!==expected.size)throw Error('The wiki observation receipt is incomplete.');
        for(const row of records){
            settings.counts.pending--;settings.counts.pendingWithCharacterName-=row.has_character_name;
            if(accepted.has(row.id)){const prior=db.prepare('SELECT hash FROM receipts WHERE id=?').get(row.id);if(prior&&prior.hash!==row.hash)throw Error('An accepted observation receipt hash changed.');db.prepare('INSERT OR IGNORE INTO receipts(id,hash) VALUES(?,?)').run(row.id,row.hash);db.prepare('DELETE FROM observations WHERE id=?').run(row.id);settings.acknowledged++;}
            else{const issue=issues.get(row.id);if(!issue)throw Error('The observation batch binding is incomplete.');db.prepare('UPDATE observations SET status=?,code=?,batch_id=NULL WHERE id=?').run(issue.status,issue.code,row.id);settings.counts[issue.status==='conflict'?'conflicts':'rejected']++;}
        }
        // Confirmed receipt time is conservative relative to the server's
        // receive time; advancing it cannot reopen a rolling server slot early.
        db.prepare('UPDATE rate_attempts SET attempted_at=MAX(attempted_at,?) WHERE account_id=? AND account_name=? AND batch_id=?').run(value.now,user.id,user.name,batch.batchId);
        db.prepare('DELETE FROM batches WHERE id=?').run(batch.batchId);return {accepted:accepted.size,issues:issues.size};
    });
}
async function action(name,value,now){
    if(name==='initialize'){await initialize(now);return null;}
    if(!db||!settings||initialError)throw Error('Observation storage is unavailable.');
    if(name==='close'){db.close();db=null;return null;}
    if(name==='configure')return transaction(()=>{const patch=typeof value==='boolean'?{enabled:value}:value;if(!object(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!['enabled','includeCharacterName'].includes(key)||typeof patch[key]!=='boolean'))throw Error('Choose valid observation preferences.');Object.assign(settings,patch);return {enabled:settings.enabled,includeCharacterName:settings.includeCharacterName};});
    if(name==='append'){
        if(!Array.isArray(value?.events)||!value.events.length||value.events.length>100)throw Error('Collect one to 100 observations.');const events=value.events.map(event=>normalizeObservation(event,{now})),owner=value.owner===null?null:account(value.owner);
        return transaction(()=>{if(!settings.enabled)return {stored:0,duplicates:0,conflicts:0,disabled:true};let stored=0,duplicates=0,conflicts=0;
            for(const event of events){const fingerprint=hash(event),prior=db.prepare('SELECT hash FROM observations WHERE id=? UNION ALL SELECT hash FROM receipts WHERE id=? LIMIT 1').get(event.id,event.id);if(prior){if(prior.hash===fingerprint)duplicates++;else conflicts++;continue;}insertRecord({event,hash:fingerprint,status:'pending',account:owner,batchId:null});stored++;}return {stored,duplicates,conflicts};});
    }
    if(name==='pendingForAccount'){
        const user=account(value?.owner),names=value.options?.characterNameSupported===false?' AND has_character_name=0':'';
        if(value.options?.existsOnly)return Number(Boolean(db.prepare(`SELECT 1 FROM observations WHERE status='pending' AND account_id=? AND account_name=?${names} LIMIT 1`).get(user.id,user.name)||db.prepare(`SELECT 1 FROM observations WHERE status='pending' AND account_id IS NULL AND account_name IS NULL${names} LIMIT 1`).get()));
        const query=compatibleWhere(user,value.options);return db.prepare(`SELECT COUNT(*) AS n FROM observations WHERE ${query.where}`).get(...query.params).n;
    }
    if(name==='prepareBatch')return prepareBatch(value,now);
    if(name==='acknowledge')return acknowledge({...value,now});
    if(name==='requestSoon')return transaction(()=>{const delay=value?.delayMs??0,afterLogin=value?.options?.afterLogin===true;if(!Number.isSafeInteger(delay)||delay<0||delay>24*HOUR)throw Error('Invalid observation schedule.');if(Object.hasOwn(value?.options||{},'owner'))settings.budgetOwner=value.options.owner===null?null:account(value.options.owner);const deadline=hardDeadline(settings.budgetOwner,now);if(!settings.failures||afterLogin||/Log in to the wiki/.test(settings.lastError||'')){settings.nextAttemptAt=Math.max(deadline,Math.min(settings.nextAttemptAt,now+delay));if(afterLogin){settings.failures=0;settings.lastError=null;}}else settings.nextAttemptAt=Math.max(deadline,settings.nextAttemptAt);return {nextAttemptAt:settings.nextAttemptAt};});
    if(name==='reserveBatchAttempt')return transaction(()=>{
        const batchId=value?.batchId,hourlyLimit=value?.hourlyLimit;if(!token(batchId)||!Number.isSafeInteger(hourlyLimit)||hourlyLimit<1||hourlyLimit>120)throw Error('Invalid observation upload budget.');
        const bound=value.owner??db.prepare('SELECT account_id AS id,account_name AS name FROM batches WHERE id=?').get(batchId),owner=account(bound);settings.budgetOwner=owner;
        db.prepare('DELETE FROM rate_attempts WHERE attempted_at<=?').run(now-HOUR);db.prepare('DELETE FROM quota_deadlines WHERE not_before_at<=?').run(now);
        const global=settings.notBeforeAt>now?settings.notBeforeAt:0;if(global)return {allowed:false,nextAllowedAt:global};
        if(db.prepare('SELECT 1 FROM rate_attempts WHERE account_id=? AND account_name=? AND batch_id=?').get(owner.id,owner.name,batchId))return {allowed:true,nextAllowedAt:now};
        const window=db.prepare('SELECT COUNT(*) AS n,MIN(attempted_at) AS first FROM rate_attempts WHERE account_id=? AND account_name=?').get(owner.id,owner.name);
        if(window.n>=hourlyLimit){const nextAllowedAt=window.first+HOUR;db.prepare('INSERT INTO quota_deadlines(account_id,account_name,not_before_at) VALUES(?,?,?) ON CONFLICT(account_id,account_name) DO UPDATE SET not_before_at=excluded.not_before_at').run(owner.id,owner.name,nextAllowedAt);settings.nextAttemptAt=Math.max(settings.nextAttemptAt,nextAllowedAt);return {allowed:false,nextAllowedAt};}
        db.prepare('INSERT INTO rate_attempts(account_id,account_name,batch_id,attempted_at) VALUES(?,?,?,?)').run(owner.id,owner.name,batchId,now);return {allowed:true,nextAllowedAt:now};
    });
    if(name==='beginAttempt')return transaction(()=>{settings.lastAttemptAt=now;settings.nextAttemptAt=Math.max(now+60000,hardDeadline(settings.budgetOwner,now));return {nextAttemptAt:settings.nextAttemptAt};});
    if(name==='recordAttempt')return transaction(()=>{const success=value?.success===true,error=value?.error??null,delay=value?.delayMs??HOUR,retry=value?.retryAfterMs??0;if(!Number.isSafeInteger(delay)||delay<0||delay>24*HOUR||!Number.isSafeInteger(retry)||retry<0||retry>24*HOUR)throw Error('Invalid observation retry schedule.');settings.lastAttemptAt=now;if(retry)settings.notBeforeAt=Math.max(settings.notBeforeAt,now+retry);if(success){settings.lastSuccessAt=now;settings.failures=0;settings.lastError=null;settings.nextAttemptAt=Math.max(now+delay,hardDeadline(settings.budgetOwner,now));}else{settings.failures=Math.min(24,settings.failures+1);settings.lastError=typeof error==='string'?error.slice(0,300):'Observation upload is unavailable; pending data was retained.';settings.nextAttemptAt=Math.max(now+Math.min(60,2**Math.min(6,settings.failures-1))*60000,hardDeadline(settings.budgetOwner,now));}return {nextAttemptAt:settings.nextAttemptAt};});
    throw Error('Unknown observation storage action.');
}
parentPort.on('message',message=>{chain=chain.then(async()=>{
    try{const value=await action(message.action,message.value,message.now);parentPort.postMessage({id:message.id,ok:true,value,status:status()});if(message.action==='close')parentPort.close();}
    catch(error){if(message.action==='initialize'){initialError=true;try{db?.close();}catch{}db=null;}parentPort.postMessage({id:message.id,ok:false,error:String(error.message||'Observation storage failed.').slice(0,300),status:status()});}
}).catch(()=>{});});
