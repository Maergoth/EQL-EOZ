'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const WINDOWS_RENAME_RETRY_DELAYS_MS = Object.freeze([25, 50, 100, 200, 400]);
const TRANSIENT_WINDOWS_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);

function createAtomicWriteJson({ io = fs, platform = process.platform,
    sleep = delay => new Promise(resolve => setTimeout(resolve, delay)), uuid = randomUUID } = {}) {
    return async function atomicWriteJson(filePath, value) {
        const temporary = `${filePath}.tmp-${process.pid}-${uuid()}`;
        let cleanup = true;
        await io.mkdir(path.dirname(filePath), { recursive:true });
        try {
            try {
                await io.writeFile(temporary, JSON.stringify(value, null, 2), { encoding:'utf8', flag:'wx' });
            } catch (error) {
                // Exclusive creation can only collide with another writer's
                // file; that file is not ours to clean up.
                if (error?.code === 'EEXIST') cleanup = false;
                throw error;
            }
            for (let attempt = 0; ; attempt++) {
                try {
                    await io.rename(temporary, filePath);
                    return;
                } catch (error) {
                    // Windows scanners can briefly hold either rename endpoint.
                    // Keep the existing destination intact throughout the wait.
                    if (platform !== 'win32' || !TRANSIENT_WINDOWS_RENAME_ERRORS.has(error?.code) || attempt >= WINDOWS_RENAME_RETRY_DELAYS_MS.length) throw error;
                    await sleep(WINDOWS_RENAME_RETRY_DELAYS_MS[attempt]);
                }
            }
        } finally {
            // Never let cleanup replace the write/rename error, and never
            // remove the destination to make replacement appear successful.
            if (cleanup) await io.unlink(temporary).catch(() => {});
        }
    };
}

module.exports = { createAtomicWriteJson, atomicWriteJson:createAtomicWriteJson(), WINDOWS_RENAME_RETRY_DELAYS_MS };
