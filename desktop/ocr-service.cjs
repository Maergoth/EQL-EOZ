'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const {validateOcrRuntime}=require('./ocr-runtime.cjs');
class OcrService {
    constructor({ resourcesPath, packaged = false, runtimeRoot, workerPath, workerExecArgv, timeoutMs = 45000 } = {}) {
        this.runtimeRoot = runtimeRoot || (packaged ? path.join(resourcesPath, 'ocr-runtime') : path.join(__dirname,'..'));
        this.workerPath = workerPath || (packaged ? path.join(this.runtimeRoot,'ocr-worker.cjs') : path.join(__dirname,'ocr-worker.cjs'));
        this.timeoutMs = timeoutMs; this.worker = null; this.pending = null; this.initializing = null; this.startup = null; this.nextId = 0;
        this.workerExecArgv=workerExecArgv;
        this.packaged=packaged;
    }
    initialize() {
        if (this.initializing) return this.initializing;
        if (!fs.existsSync(this.workerPath)) return Promise.reject(new Error('The local OCR runtime is missing. Reinstall Eye of Zomm.'));
        if(this.packaged)try{validateOcrRuntime(this.runtimeRoot);}catch{return Promise.reject(new Error('The bundled OCR runtime is incomplete or changed. Reinstall Eye of Zomm.'));}
        let worker;
        try { worker = new Worker(this.workerPath, { workerData:{ runtimeRoot:this.runtimeRoot },...(this.workerExecArgv?{execArgv:this.workerExecArgv}:{}) }); }
        catch (error) { return Promise.reject(error); }
        this.worker = worker;
        const startup = {worker};
        this.initializing = new Promise((resolve,reject) => {startup.resolve=resolve;startup.reject=reject;});
        this.startup = startup;
        startup.timer = setTimeout(() => {
            if(this.worker===worker&&this.startup===startup)void this.stopWorker(worker,new Error('Local OCR startup timed out.'));
        }, this.timeoutMs);
        worker.on('message', message => {
            if(this.worker!==worker)return;
            if (message.ready) {
                if(this.startup===startup){clearTimeout(startup.timer);this.startup=null;startup.resolve(worker);}
                return;
            }
            if (message.error && !message.id) { void this.stopWorker(worker,new Error(message.error)); return; }
            const pending=this.pending;
            if (pending?.worker===worker && message.id === pending.id) {
                this.pending = null; clearTimeout(pending.timer);
                if (message.error) pending.reject(new Error(message.error)); else pending.resolve(message.result);
            }
        });
        const failed = () => {if(this.worker===worker)void this.stopWorker(worker,new Error('Local OCR stopped unexpectedly.'));};
        worker.once('error', failed); worker.once('exit', failed);
        return this.initializing;
    }
    async recognize(png,{layout='sparse'}={}) {
        if (!Buffer.isBuffer(png) || png.length > 32 * 1024 * 1024 || png.length < 8) throw new Error('Invalid OCR image.');
        if(!['sparse','block','line'].includes(layout))throw new Error('Invalid OCR layout.');
        const worker=await this.initialize();
        if(this.worker!==worker)throw new Error('Local OCR was stopped.');
        if (this.pending) throw new Error('Local OCR is already reading an image.');
        return new Promise((resolve,reject) => {
            const id = ++this.nextId;
            const pending = {worker,id,resolve,reject};
            pending.timer = setTimeout(() => {
                if(this.worker===worker&&this.pending===pending)void this.stopWorker(worker,new Error('Reading this image timed out. Try a smaller region.'));
            }, this.timeoutMs);
            this.pending = pending;
            try {worker.postMessage({ id, type:'recognize', png, layout });}
            catch {void this.stopWorker(worker,new Error('Local OCR stopped unexpectedly.'));}
        });
    }
    async stopWorker(worker,error) {
        if(!worker||this.worker!==worker)return;
        this.worker = null; this.initializing = null;
        const startup=this.startup;
        if(startup?.worker===worker){this.startup=null;clearTimeout(startup.timer);startup.reject(error);}
        const pending=this.pending;
        if(pending?.worker===worker){this.pending=null;clearTimeout(pending.timer);pending.reject(error);}
        try {await worker.terminate();}catch{}
    }
    async stop() {await this.stopWorker(this.worker,new Error('Local OCR was stopped.'));}
}
module.exports = { OcrService };
