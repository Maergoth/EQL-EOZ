'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const MAX_RECORD = 128 * 1024;
const SEGMENT_RE = /^screen-read-\d{8}-[a-f0-9]{16}\.ndjson$/;

// Private, bounded observation storage. It is never served by the local HTTP app.
class ScreenReadJournal {
    constructor({ root, maxBytes = 64 * 1024 * 1024, segmentBytes = 4 * 1024 * 1024,
        retentionMs = 7 * 86400000, maxQueuedBytes = 2 * 1024 * 1024, now = Date.now } = {}) {
        if (!root || !path.isAbsolute(root)) throw new Error('A private absolute journal directory is required.');
        this.root = path.resolve(root); this.maxBytes = maxBytes; this.segmentBytes = segmentBytes;
        this.retentionMs = retentionMs; this.maxQueuedBytes = maxQueuedBytes; this.now = now;
        this.sequence = 0; this.segment = null; this.segmentSize = 0; this.day = '';
        this.queuedBytes = 0; this.queue = Promise.resolve(); this.closed = false;
        this.initialized = null; this.historyGap = false; this.warnings = [];
    }
    async initialize() {
        if (!this.initialized) this.initialized = this._initialize();
        return this.initialized;
    }
    async _initialize() {
        await fs.mkdir(this.root, { recursive:true, mode:0o700 });
        const info = await fs.lstat(this.root);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The journal directory must be a real private directory.');
        this.rootReal = await fs.realpath(this.root);
        const statePath=path.join(this.root,'sequence.json');
        const stateInfo=await fs.lstat(statePath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if(stateInfo){
            if(!stateInfo.isFile()||stateInfo.isSymbolicLink()||stateInfo.size>1024)throw new Error('Invalid capture journal cursor.');
            try{const state=JSON.parse(await fs.readFile(statePath,'utf8'));if(Number.isSafeInteger(state.sequence)&&state.sequence>=0)this.sequence=state.sequence;}catch{this.historyGap=true;}
        }
        for (const entry of await this._files()) {
            const { records } = await this._readFile(entry.name);
            for (const record of records) this.sequence = Math.max(this.sequence, record.sequence);
        }
        await this._prune();
    }
    async _files() {
        const entries = await fs.readdir(this.root, { withFileTypes:true });
        const files = [];
        for (const entry of entries) {
            if (!SEGMENT_RE.test(entry.name)) continue;
            if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Unsafe journal segment.');
            const stat = await fs.lstat(path.join(this.root, entry.name));
            files.push({ name:entry.name, size:stat.size, mtime:stat.mtimeMs });
        }
        return files.sort((a,b) => a.mtime - b.mtime || a.name.localeCompare(b.name));
    }
    async _readFile(name) {
        if (!SEGMENT_RE.test(name)) throw new Error('Invalid journal segment.');
        const target = path.join(this.root, name);
        const stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > this.segmentBytes + MAX_RECORD) throw new Error('Invalid journal segment size or type.');
        const real = await fs.realpath(target);
        if (path.dirname(real) !== this.rootReal) throw new Error('Journal segment escaped its directory.');
        const text = await fs.readFile(target, 'utf8');
        const lines = text.split('\n'); lines.pop(); // A crash-truncated final line is not an observation.
        const records = []; let corrupt = false;
        for (const line of lines) {
            try {
                if (!line || Buffer.byteLength(line) > MAX_RECORD) throw new Error('Oversized record');
                const record = JSON.parse(line);
                if (record.schema !== 1 || !Number.isSafeInteger(record.sequence) || record.sequence < 1 || typeof record.id !== 'string') throw new Error('Invalid record');
                records.push(record);
            } catch { corrupt = true; }
        }
        if (corrupt) {
            this.historyGap = true;
            if (!this.warnings.includes(name)) this.warnings.push(name);
        }
        return { records, corrupt };
    }
    async _prune() {
        const files = await this._files(); let total = files.reduce((sum, file) => sum + file.size, 0);
        for (const file of files) {
            if (file.name === this.segment) continue;
            if (this.now() - file.mtime <= this.retentionMs && total <= this.maxBytes) continue;
            await fs.unlink(path.join(this.root, file.name)); total -= file.size; this.historyGap = true;
        }
    }
    append(observation) {
        if (this.closed) return Promise.reject(new Error('The capture journal has closed.'));
        let clone, estimated;
        try {
            const encoded = JSON.stringify(observation);
            estimated = Buffer.byteLength(encoded || '') + 256;
            if (!encoded || estimated > MAX_RECORD) throw new Error('This observation exceeds the capture journal limit.');
            clone = JSON.parse(encoded);
            if (!clone.id || !['ocr','game-log','manual','capture-state'].includes(clone.kind)) throw new Error('Invalid capture observation.');
        } catch (error) { return Promise.reject(error); }
        if (this.queuedBytes + estimated > this.maxQueuedBytes) return Promise.reject(new Error('Capture storage is busy. Pause capture and try again.'));
        this.queuedBytes += estimated;
        const operation = this.queue.then(async () => {
            await this.initialize();
            const next = { ...clone, schema:1, sequence:this.sequence + 1, recordedAt:new Date(this.now()).toISOString() };
            const line = `${JSON.stringify(next)}\n`, bytes = Buffer.byteLength(line);
            if (bytes > MAX_RECORD) throw new Error('This observation exceeds the capture journal limit.');
            const day = new Date(this.now()).toISOString().slice(0,10).replace(/-/g,'');
            if (!this.segment || day !== this.day || this.segmentSize + bytes > this.segmentBytes) {
                this.day = day; this.segment = `screen-read-${day}-${crypto.randomBytes(8).toString('hex')}.ndjson`; this.segmentSize = 0;
            }
            const target = path.join(this.root, this.segment);
            const existing = await fs.lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
            if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Unsafe journal destination.');
            const handle = await fs.open(target, 'a', 0o600);
            try { await handle.writeFile(line, 'utf8'); await handle.sync(); } finally { await handle.close(); }
            this.segmentSize += bytes; this.sequence = next.sequence;
            const stateTemp=path.join(this.root,`sequence-${crypto.randomBytes(8).toString('hex')}.tmp`);
            await fs.writeFile(stateTemp,JSON.stringify({schema:1,sequence:this.sequence}),{mode:0o600});
            await fs.rename(stateTemp,path.join(this.root,'sequence.json'));
            await this._prune();
            return next;
        });
        this.queue = operation.catch(() => {});
        return operation.finally(() => { this.queuedBytes -= estimated; });
    }
    async read({ afterSequence = 0, limit = 100 } = {}) {
        await this.initialize(); await this.queue;
        if (!Number.isSafeInteger(afterSequence) || afterSequence < 0) throw new Error('Invalid capture history cursor.');
        limit = Math.max(1, Math.min(500, Number(limit) || 100));
        const records = [];
        for (const entry of await this._files()) {
            for (const record of (await this._readFile(entry.name)).records) if (record.sequence > afterSequence) records.push(record);
        }
        records.sort((a,b) => a.sequence - b.sequence);
        return { records:records.slice(0,limit), lastSequence:this.sequence, historyGap:this.historyGap || Boolean(records.length && records[0].sequence>afterSequence+1),
            warnings:this.warnings.length ? ['Some capture history was corrupt and could not be read.'] : [] };
    }
    async clear() {
        await this.initialize(); await this.queue;
        for (const entry of await this._files()) await fs.unlink(path.join(this.root, entry.name));
        this.segment = null; this.segmentSize = 0; this.historyGap = true; this.warnings = [];
    }
    async close() { this.closed = true; await this.queue; }
}
module.exports = { ScreenReadJournal, MAX_RECORD };
