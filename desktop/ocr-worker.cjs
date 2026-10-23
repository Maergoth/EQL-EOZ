'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const { createRequire } = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const runtimeRequire = createRequire(path.join(workerData.runtimeRoot, 'package.json'));
const { createWorker } = runtimeRequire('tesseract.js');
const languageRoot = path.join(path.dirname(runtimeRequire.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
const workerPath = path.join(path.dirname(runtimeRequire.resolve('tesseract.js/package.json')), 'src', 'worker-script', 'node', 'index.js');
let worker;
async function initialize() {
    // A local model is mandatory. An absent resource never becomes a CDN download.
    if (!fs.statSync(path.join(languageRoot, 'eng.traineddata.gz')).isFile()) throw new Error('The bundled English OCR model is missing.');
    worker = await createWorker('eng', 1, { langPath:languageRoot, workerPath, gzip:true, cacheMethod:'none',
        logger:() => {}, errorHandler:() => {} });
    // Game screens contain independent panes, not one document paragraph.
    await worker.setParameters({ preserve_interword_spaces:'1',tessedit_pageseg_mode:'11' });
    parentPort.postMessage({ ready:true });
}
function wordsFrom(blocks) {
    const result = [];
    for (const block of blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) for (const word of line.words || []) {
        if (result.length >= 2000) return result;
        result.push({ text:String(word.text || '').slice(0,160), confidence:Number(word.confidence) || 0, bbox:word.bbox });
    }
    return result;
}
parentPort.on('message', async message => {
    if (!worker || message?.type !== 'recognize') return;
    try {
        await worker.setParameters({tessedit_pageseg_mode:{sparse:'11',block:'6',line:'7'}[message.layout]||'11'});
        const result = await worker.recognize(Buffer.from(message.png), {}, { text:true, blocks:true });
        parentPort.postMessage({ id:message.id, result:{ text:String(result.data.text || '').slice(0,16384),
            confidence:Number(result.data.confidence) || 0, words:wordsFrom(result.data.blocks) } });
    } catch (error) { parentPort.postMessage({ id:message.id, error:String(error.message || 'OCR could not read this image.').slice(0,500) }); }
});
initialize().catch(error => { parentPort.postMessage({ error:String(error.message || 'Local OCR could not start.').slice(0,500) }); });
