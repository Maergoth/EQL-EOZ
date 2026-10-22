'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
class OcrService {
    constructor({ resourcesPath, packaged = false, runtimeRoot, workerPath, workerExecArgv, timeoutMs = 45000 } = {}) {
        this.runtimeRoot = runtimeRoot || (packaged ? path.join(resourcesPath, 'ocr-runtime') : path.join(__dirname,'..'));
        this.workerPath = workerPath || (packaged ? path.join(this.runtimeRoot,'ocr-worker.cjs') : path.join(__dirname,'ocr-worker.cjs'));
        this.timeoutMs = timeoutMs; this.worker = null; this.pending = null; this.initializing = null; this.nextId = 0;
        this.workerExecArgv=workerExecArgv;
    }
    initialize() {
        if (this.initializing) return this.initializing;
        if (!fs.existsSync(this.workerPath)) return Promise.reject(new Error('The local OCR runtime is missing. Reinstall Eye of Zomm.'));
        this.initializing = new Promise((resolve,reject) => {
            const worker = this.worker = new Worker(this.workerPath, { workerData:{ runtimeRoot:this.runtimeRoot },...(this.workerExecArgv?{execArgv:this.workerExecArgv}:{}) });
            const timer = setTimeout(() => { reject(new Error('Local OCR startup timed out.')); void this.stop(); }, this.timeoutMs);
            this.initReject = reject;
            worker.on('message', message => {
                if (message.ready) { clearTimeout(timer); this.initReject = null; resolve(); return; }
                if (message.error && !message.id) { clearTimeout(timer); reject(new Error(message.error)); void this.stop(); return; }
                if (this.pending && message.id === this.pending.id) {
                    const pending = this.pending; this.pending = null; clearTimeout(pending.timer);
                    if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
                }
            });
            const failed = error => {
                clearTimeout(timer); reject(new Error('Local OCR stopped unexpectedly.'));
                if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('Local OCR stopped unexpectedly.')); this.pending = null; }
                if (this.worker === worker) { this.worker = null; this.initializing = null; }
            };
            worker.once('error', failed); worker.once('exit', code => { if (code !== 0 || this.worker === worker) failed(); });
        });
        return this.initializing;
    }
    async recognize(png,{layout='sparse'}={}) {
        if (!Buffer.isBuffer(png) || png.length > 32 * 1024 * 1024 || png.length < 8) throw new Error('Invalid OCR image.');
        if(!['sparse','block','line'].includes(layout))throw new Error('Invalid OCR layout.');
        await this.initialize();
        if (this.pending) throw new Error('Local OCR is already reading an image.');
        return new Promise((resolve,reject) => {
            const id = ++this.nextId;
            const timer = setTimeout(() => { reject(new Error('Reading this image timed out. Try a smaller region.')); this.pending = null; void this.stop(); }, this.timeoutMs);
            this.pending = { id, resolve, reject, timer };
            this.worker.postMessage({ id, type:'recognize', png, layout });
        });
    }
    async stop() {
        const worker = this.worker; this.worker = null; this.initializing = null;
        if (this.initReject) { this.initReject(new Error('Local OCR was stopped.')); this.initReject = null; }
        if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(new Error('Local OCR was stopped.')); this.pending = null; }
        if (worker) await worker.terminate();
    }
}
module.exports = { OcrService };
