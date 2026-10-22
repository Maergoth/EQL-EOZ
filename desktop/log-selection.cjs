'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function pathApi(value) {
    return /\\/.test(String(value || '')) ? path.win32 : path;
}

function inferEqRootPath(candidate) {
    const value = String(candidate || '').trim();
    if (!value) return '';
    const api = pathApi(value);
    const looksLikeLog = /^eqlog_.*\.txt$/i.test(api.basename(value));
    const directory = looksLikeLog ? api.dirname(value) : value;
    return api.basename(directory).toLowerCase() === 'logs'
        ? api.dirname(directory)
        : directory;
}

function logsDirectory(eqRootPath) {
    const root = inferEqRootPath(eqRootPath);
    return root ? pathApi(root).join(root, 'Logs') : '';
}

function isEqLogName(name) {
    return /^eqlog_.+\.txt$/i.test(String(name || ''));
}

async function newestEqLog(eqRootPath, fileApi = fsp) {
    let directory = logsDirectory(eqRootPath);
    if (!directory) return '';
    let entries;
    try {
        entries = await fileApi.readdir(directory, { withFileTypes: true });
    } catch (error) {
        // Wine/Proton installations may contain "logs" on a case-sensitive host.
        // Resolve only the selected game's immediate directory, keeping the
        // original on-disk spelling. Ambiguous case variants stay unselected.
        if (error?.code !== 'ENOENT') return '';
        try {
            const root = inferEqRootPath(eqRootPath);
            const matches = (await fileApi.readdir(root, { withFileTypes:true }))
                .filter(entry => entry.isDirectory() && /^logs$/i.test(entry.name));
            if (matches.length !== 1) return '';
            directory = pathApi(root).join(root, matches[0].name);
            entries = await fileApi.readdir(directory, { withFileTypes:true });
        } catch { return ''; }
    }

    const api = pathApi(directory);
    const candidates = [];
    for (const entry of entries) {
        if (!entry.isFile() || !isEqLogName(entry.name)) continue;
        const fullPath = api.join(directory, entry.name);
        try {
            const stat = await fileApi.stat(fullPath);
            candidates.push({ fullPath, mtimeMs: Number(stat.mtimeMs) || 0, name: entry.name });
        } catch {}
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.name.localeCompare(a.name));
    return candidates[0]?.fullPath || '';
}

async function fileExists(filePath, fileApi = fs) {
    if (!filePath) return false;
    try {
        await fileApi.promises.access(filePath, fileApi.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

async function resolveConfiguredLog(config = {}, fileApi = fsp) {
    const explicitPath = String(config.logPath || '').trim();
    if (config.logSelection === 'manual' && explicitPath) {
        try {
            await fileApi.access(explicitPath);
            return explicitPath;
        } catch {}
    }
    const root = String(config.eqRootPath || inferEqRootPath(explicitPath));
    return (await newestEqLog(root, fileApi)) || explicitPath;
}

function isPathInside(rootPath, candidatePath) {
    const root = String(rootPath || '');
    const candidate = String(candidatePath || '');
    if (!root || !candidate) return false;
    const api = pathApi(root);
    const relative = api.relative(api.resolve(root), api.resolve(candidate));
    return relative === '' || (!relative.startsWith('..') && !api.isAbsolute(relative));
}

module.exports = {
    fileExists,
    inferEqRootPath,
    isEqLogName,
    isPathInside,
    logsDirectory,
    newestEqLog,
    resolveConfiguredLog
};
