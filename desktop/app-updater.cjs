'use strict';

// Application releases are independent of the wiki dataset. Only an explicit
// install request may hand a verified NSIS package to Windows; startup never does.
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

const REPOSITORY = 'Maergoth/EQL-EOZ';
const RELEASES_URL = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_INSTALLER_BYTES = 512 * 1024 * 1024;
const METADATA_TIMEOUT_MS = 20000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

class UpdateError extends Error {}

// Match electron-builder's UUIDv5(appId, ELECTRON_BUILDER_NS_UUID). This is
// the existing application's NSIS identity, not a new installation identity.
const registryGuidBytes = crypto.createHash('sha1').update(Buffer.from('50e065bc313411e69bab38c9862bdaf3','hex')).update('com.eqlwiki.eyeofzomm').digest().subarray(0,16);
registryGuidBytes[6]=(registryGuidBytes[6]&15)|80;registryGuidBytes[8]=(registryGuidBytes[8]&63)|128;
const registryGuidHex=registryGuidBytes.toString('hex');
const NSIS_INSTALL_KEY=`Software\\${registryGuidHex.slice(0,8)}-${registryGuidHex.slice(8,12)}-${registryGuidHex.slice(12,16)}-${registryGuidHex.slice(16,20)}-${registryGuidHex.slice(20)}`;

// reg.exe's redirected console text has no UTF-8 contract. Read the Unicode
// registry value through .NET and explicitly encode stdout as UTF-8 instead.
// Script source is fixed; the only inputs are our key and an allowlisted hive.
const NSIS_REGISTRY_READ_SCRIPT = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$ErrorActionPreference = 'Stop'",
    "$hive = switch ($env:EOZ_UPDATE_REGISTRY_HIVE) { 'HKCU' { [Microsoft.Win32.RegistryHive]::CurrentUser } 'HKLM' { [Microsoft.Win32.RegistryHive]::LocalMachine } default { throw 'Unsupported registry hive' } }",
    "$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, [Microsoft.Win32.RegistryView]::Registry64)",
    "try { $key = $base.OpenSubKey($env:EOZ_UPDATE_REGISTRY_KEY); if ($null -eq $key) { exit 1 }; try { if ($key.GetValueKind('InstallLocation') -ne [Microsoft.Win32.RegistryValueKind]::String) { exit 1 }; [Console]::Write([string]$key.GetValue('InstallLocation')) } finally { $key.Dispose() } } finally { $base.Dispose() }"
].join('\n');

function readNsisInstallLocation(hive, { execFileImpl = execFile } = {}) {
    if(!['HKCU','HKLM'].includes(hive))return Promise.resolve('');
    return new Promise(resolve => {
        // Fixed registry keys/values only; no shell and no renderer input.
        const executable=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
        execFileImpl(executable,['-NoProfile','-NonInteractive','-Command',NSIS_REGISTRY_READ_SCRIPT],
            { windowsHide:true, timeout:5000, maxBuffer:16384, encoding:'utf8',
                env:{...process.env,EOZ_UPDATE_REGISTRY_HIVE:hive,EOZ_UPDATE_REGISTRY_KEY:NSIS_INSTALL_KEY} },(error,stdout)=>{
                if(error){resolve('');return;}
                resolve(String(stdout||''));
            });
    });
}

async function resolveInstalledNsisScope(installDirectory, { readLocation = readNsisInstallLocation, realpath = fsp.realpath } = {}) {
    const canonical=async value=>{
        if(typeof value!=='string'||!path.win32.isAbsolute(value)||/[\x00-\x1f\x7f"]/u.test(value))return '';
        const resolved=await realpath(value).catch(()=>value);
        return path.win32.normalize(resolved).replace(/\\+$/,'').toLowerCase();
    };
    const [userLocation,machineLocation]=await Promise.all([readLocation('HKCU'),readLocation('HKLM')]);
    const [current,user,machine]=await Promise.all([canonical(installDirectory),canonical(userLocation),canonical(machineLocation)]);
    if(current&&current===user&&current!==machine)return 'currentuser';
    if(current&&current===machine&&current!==user){
        // Stock NSIS consolidates HKCU into HKLM during an all-users install.
        // Do not silently remove a separate per-user copy during this update.
        if(userLocation)throw new UpdateError('Both per-user and machine-wide installs were detected. Use the release download to update the machine-wide copy manually.');
        return 'allusers';
    }
    throw new UpdateError('The installed app could not be matched to its Windows registration. Use the release download to reinstall it.');
}

// electron-builder 26.15.3's assisted NSIS template starts the installed app
// when /S and --force-run are combined. --updated keeps upgrade semantics and
// gives the old process time to exit before replacing its files. /D must be
// the final, unquoted argument; pass it verbatim, with no command shell.
async function launchSilentNsisInstaller(target, { installDirectory, spawnImpl = spawn, resolveScope = resolveInstalledNsisScope } = {}) {
    const invalid = value => typeof value !== 'string' || /[\x00-\x1f\x7f"]/u.test(value);
    if (invalid(target) || invalid(installDirectory) || !path.win32.isAbsolute(installDirectory) ||
        !(path.isAbsolute(target) || path.win32.isAbsolute(target)) || !/\.exe$/i.test(target)) {
        throw new UpdateError('Windows could not start the update installer. Try again.');
    }
    const scope=await resolveScope(installDirectory);
    if(!['currentuser','allusers'].includes(scope))throw new UpdateError('The installed app could not be matched to its Windows registration. Use the release download to reinstall it.');
    return new Promise((resolve, reject) => {
        let child;
        const failure = () => reject(new UpdateError('Windows could not start the update installer. Try again.'));
        try {
            child = spawnImpl(target, ['/S', '--updated', '--force-run', `/${scope}`, `/D=${installDirectory}`], {
                shell:false, detached:true, stdio:'ignore', windowsHide:true,
                windowsVerbatimArguments:true, argv0:`"${target}"`
            });
        } catch { failure(); return; }
        child.once('error', failure);
        child.once('spawn', () => { child.unref(); resolve(''); });
    });
}

function parseVersion(value) {
    if (typeof value !== 'string' || value.length > 100) throw new UpdateError('The release version is unsupported.');
    const match = VERSION_PATTERN.exec(value.replace(/^v/, ''));
    if (!match) throw new UpdateError('The release version is unsupported.');
    const numbers = match.slice(1, 4).map(Number);
    const prerelease = match[4]?.split('.') || [];
    if (numbers.some(number => !Number.isSafeInteger(number)) || prerelease.some(part => /^\d+$/.test(part) && (part.length > 1 && part[0] === '0'))) {
        throw new UpdateError('The release version is unsupported.');
    }
    return { numbers, prerelease, version:value.replace(/^v/, '') };
}

function compareVersions(left, right) {
    left = typeof left === 'string' ? parseVersion(left) : left;
    right = typeof right === 'string' ? parseVersion(right) : right;
    for (let i = 0; i < 3; i += 1) if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] < right.numbers[i] ? -1 : 1;
    if (!left.prerelease.length || !right.prerelease.length) return left.prerelease.length === right.prerelease.length ? 0 : left.prerelease.length ? -1 : 1;
    for (let i = 0; i < Math.max(left.prerelease.length, right.prerelease.length); i += 1) {
        const a = left.prerelease[i], b = right.prerelease[i];
        if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
        if (a === b) continue;
        const numericA = /^\d+$/.test(a), numericB = /^\d+$/.test(b);
        if (numericA && numericB) return BigInt(a) < BigInt(b) ? -1 : 1;
        if (numericA !== numericB) return numericA ? -1 : 1;
        return a < b ? -1 : 1;
    }
    return 0;
}

function releaseNotesUrl(tag) {
    parseVersion(tag);
    return `https://github.com/${REPOSITORY}/releases/tag/${tag}`;
}

function isReleaseNotesUrl(value) {
    try {
        const target = new URL(value);
        const prefix = `https://github.com/${REPOSITORY}/releases/tag/`;
        if (!value.startsWith(prefix) || target.search || target.hash || target.username || target.password) return false;
        const tag = value.slice(prefix.length);
        return tag.startsWith('v') && releaseNotesUrl(tag) === value;
    } catch { return false; }
}

function validateRelease(payload, currentVersion) {
    const tag = payload.tag_name;
    if (typeof tag !== 'string' || !tag.startsWith('v')) throw new UpdateError('The release tag is unsupported.');
    const parsed = parseVersion(tag);
    const current = parseVersion(currentVersion);
    const isPrerelease = Boolean(payload.prerelease || parsed.prerelease.length);
    if (isPrerelease && (!(current.numbers[0] === 0 || current.prerelease.length) || parsed.numbers[0] !== current.numbers[0])) return null;
    if (compareVersions(parsed, current) <= 0) return null;
    const name = `EQLWiki-Eye-of-Zomm-Setup-${parsed.version}-x64.exe`;
    const matches = Array.isArray(payload.assets) ? payload.assets.filter(asset => asset?.name === name) : [];
    if (matches.length !== 1) throw new UpdateError('The newest release does not have one Windows x64 installer. Try again later.');
    const asset = matches[0];
    const url = `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`;
    if (asset.browser_download_url !== url) throw new UpdateError('The release installer address is unexpected.');
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > MAX_INSTALLER_BYTES) throw new UpdateError('The release installer size is invalid.');
    if (typeof asset.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(asset.digest)) throw new UpdateError('GitHub has not provided a verified SHA-256 for this installer. Try again later.');
    return Object.freeze({ version:parsed.version, tag, name, url, size:asset.size, sha256:asset.digest.slice(7).toLowerCase(), releaseUrl:releaseNotesUrl(tag) });
}

function selectRelease(payload, currentVersion) {
    if (!Array.isArray(payload)) throw new UpdateError('GitHub returned invalid application release information.');
    const current = parseVersion(currentVersion);
    const candidates = payload.filter(release => {
        if (!release || release.draft) return false;
        try {
            const version = parseVersion(release.tag_name);
            if (compareVersions(version, current) <= 0) return false;
            if ((release.prerelease || version.prerelease.length) && (!(current.numbers[0] === 0 || current.prerelease.length) || version.numbers[0] !== current.numbers[0])) return false;
            return true;
        } catch { return false; }
    }).sort((a, b) => compareVersions(b.tag_name, a.tag_name));
    return candidates.length ? validateRelease(candidates[0], currentVersion) : null;
}

function trustedDownloadRedirect(value, originalUrl) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash) return false;
        if (value === originalUrl) return true;
        return ['release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(url.hostname) && /^\/github-production-release-asset(?:[-/])/.test(url.pathname);
    } catch { return false; }
}

function cancelResponse(response) {
    try { void response.body?.cancel().catch(() => {}); } catch {}
}

async function fetchTrusted(fetchImpl, originalUrl, signal, userAgent) {
    let url = originalUrl;
    for (let redirects = 0; redirects <= 5; redirects += 1) {
        signal.throwIfAborted();
        const response = await fetchImpl(url, { signal, redirect:'manual', cache:'no-store', headers:{
            'User-Agent':userAgent,
            Accept:originalUrl === RELEASES_URL ? 'application/vnd.github+json' : 'application/octet-stream',
            'Accept-Encoding':'identity',
            'X-GitHub-Api-Version':'2022-11-28'
        } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const next = response.headers.get('location');
            cancelResponse(response);
            if (originalUrl === RELEASES_URL || !next || !trustedDownloadRedirect(next, originalUrl)) throw new UpdateError('GitHub redirected the update to an unexpected address.');
            url = next;
            continue;
        }
        if (!response.ok) {
            cancelResponse(response);
            throw new UpdateError(response.status === 403 || response.status === 429 ? 'GitHub update checks are temporarily limited. Try again later.' : 'The application update is temporarily unavailable. Try again later.');
        }
        return response;
    }
    throw new UpdateError('The update download redirected too many times.');
}

async function consumeResponse(response, { limit, expectedSize, signal, onChunk }) {
    const declared = response.headers.get('content-length');
    // Fetch decodes HTTP content encodings before exposing the body. A remote
    // compressed Content-Length describes transport bytes, not the decoded data.
    const comparableLength = !response.headers.get('content-encoding') || response.headers.get('content-encoding').toLowerCase() === 'identity';
    if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit || (comparableLength && expectedSize !== undefined && Number(declared) !== expectedSize))) {
        cancelResponse(response);
        throw new UpdateError('The update download has an unexpected size.');
    }
    if (!response.body) throw new UpdateError('The update download is empty.');
    const reader = response.body.getReader();
    let size = 0;
    try {
        while (true) {
            signal.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            signal.throwIfAborted();
            size += value.byteLength;
            if (size > limit || (expectedSize !== undefined && size > expectedSize)) throw new UpdateError('The update download exceeded its allowed size.');
            await onChunk(Buffer.from(value), size);
        }
        if ((expectedSize !== undefined && size !== expectedSize) || (comparableLength && declared !== null && size !== Number(declared))) throw new UpdateError('The update download was incomplete. Try again.');
        return size;
    } catch (error) {
        try { void reader.cancel().catch(() => {}); } catch {}
        throw error;
    } finally { reader.releaseLock(); }
}

async function assertNormalDirectoryAncestors(directory) {
    // A Windows 8.3 path is another spelling of a normal directory. Inspect the
    // components themselves so accepting that spelling never accepts a redirected
    // cache root or parent (including Windows junctions).
    for (let current = directory; ; current = path.dirname(current)) {
        let stat;
        try { stat = await fsp.lstat(current); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
            throw new UpdateError('The application update cache must be a normal local directory.');
        }
        if (path.dirname(current) === current) break;
    }
}

class AppUpdater {
    constructor({ version, cacheDirectory, isPackaged = false, platform = process.platform, arch = process.arch, fetchImpl = globalThis.fetch,
        launchInstaller = async () => 'No installer launcher configured.', onInstallerLaunched = () => {},
        now = () => new Date(), metadataTimeoutMs = METADATA_TIMEOUT_MS, downloadTimeoutMs = DOWNLOAD_TIMEOUT_MS }) {
        parseVersion(version);
        this.version = version;
        this.directory = path.resolve(cacheDirectory);
        this.supported = Boolean(isPackaged && platform === 'win32' && arch === 'x64');
        this.fetch = fetchImpl;
        this.launchInstaller = launchInstaller;
        this.onInstallerLaunched = onInstallerLaunched;
        this.now = now;
        this.metadataTimeoutMs = metadataTimeoutMs;
        this.downloadTimeoutMs = downloadTimeoutMs;
        this.release = null;
        this.pending = null;
        this.active = null;
        this.initialization = null;
        this.state = { supported:this.supported, platform, isPackaged:Boolean(isPackaged), automaticDownload:false,
            status:this.supported ? 'idle' : 'unsupported', currentVersion:version, availableVersion:'', downloadedBytes:0,
            totalBytes:0, lastCheckUtc:'', releaseUrl:'', error:'' };
    }

    snapshot() { return { ...this.state }; }

    async ensureDirectory() {
        await assertNormalDirectoryAncestors(this.directory);
        await fsp.mkdir(this.directory, { recursive:true });
        await assertNormalDirectoryAncestors(this.directory);
        // Pin later record, verification and installer operations to the canonical
        // directory rather than comparing lexical Windows long/short spellings.
        this.directory = await fsp.realpath(this.directory);
    }

    async readRecord(name) {
        const target = path.join(this.directory, name);
        const stat = await fsp.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) throw new UpdateError('The saved application update is invalid. Download it again.');
        return JSON.parse(await fsp.readFile(target, 'utf8'));
    }

    async writeRecord(name, value) {
        await this.ensureDirectory();
        const temporary = path.join(this.directory, `.record-${crypto.randomUUID()}.tmp`);
        try {
            await fsp.writeFile(temporary, JSON.stringify(value), { flag:'wx', mode:0o600 });
            await fsp.rename(temporary, path.join(this.directory, name));
        } finally { await fsp.unlink(temporary).catch(() => {}); }
    }

    async verifyInstaller(release, signal) {
        await this.ensureDirectory();
        const target = path.join(this.directory, release.name);
        const stat = await fsp.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== release.size || path.relative(this.directory, await fsp.realpath(target)) !== release.name) {
            throw new UpdateError('The saved installer is unavailable or changed. Download it again.');
        }
        const handle = await fsp.open(target, 'r');
        try {
            const opened = await handle.stat();
            if (!opened.isFile() || opened.size !== release.size) throw new UpdateError('The saved installer is unavailable or changed. Download it again.');
            const digest = crypto.createHash('sha256');
            const buffer = Buffer.alloc(256 * 1024);
            let size = 0;
            while (true) {
                signal?.throwIfAborted();
                const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
                if (!bytesRead) break;
                size += bytesRead;
                if (size > release.size) throw new UpdateError('The saved installer has changed. Download it again.');
                digest.update(buffer.subarray(0, bytesRead));
            }
            if (size !== release.size || digest.digest('hex') !== release.sha256) throw new UpdateError('The installer failed SHA-256 verification. Download it again.');
            return target;
        } finally { await handle.close(); }
    }

    async initialize() {
        if (!this.initialization) this.initialization = (async () => {
            if (!this.supported) return;
            try {
                await this.ensureDirectory();
                const preferences = await this.readRecord('preferences.json').catch(() => null);
                this.state.automaticDownload = preferences?.automaticDownload === true;
                const record = await this.readRecord('ready.json').catch(() => null);
                if (record?.schema !== 1 || !record.release) return;
                const saved = record.release;
                const release = validateRelease({ tag_name:saved.tag, prerelease:parseVersion(saved.tag).prerelease.length > 0,
                    assets:[{ name:saved.name, browser_download_url:saved.url, size:saved.size, digest:`sha256:${saved.sha256}` }] }, this.version);
                if (!release || release.version !== saved.version) return;
                await this.verifyInstaller(release);
                this.pending = release;
                this.release = release;
                Object.assign(this.state, { status:'ready', availableVersion:release.version, totalBytes:release.size, downloadedBytes:release.size, releaseUrl:release.releaseUrl });
            } catch (error) {
                this.state.error = error instanceof UpdateError ? error.message : 'The saved application update is unavailable. Check for updates to try again.';
            }
        })();
        await this.initialization;
    }

    async getStatus() { await this.initialize(); return this.snapshot(); }

    async setStartupDownload(enabled) {
        await this.initialize();
        if (!this.supported || typeof enabled !== 'boolean') return this.snapshot();
        try {
            await this.writeRecord('preferences.json', { schema:1, automaticDownload:enabled });
            this.state.automaticDownload = enabled;
        } catch { this.state.error = 'The update preference could not be saved. Try again.'; }
        return this.snapshot();
    }

    begin(kind, timeoutMs) {
        const operation = { kind, controller:new AbortController(), cancelled:false, timedOut:false };
        operation.timer = setTimeout(() => { operation.timedOut = true; operation.controller.abort(); }, timeoutMs);
        this.active = operation;
        return operation;
    }

    finish(operation) {
        clearTimeout(operation.timer);
        if (this.active === operation) this.active = null;
    }

    failure(error, operation) {
        this.state.status = this.pending && this.release?.version === this.pending.version ? 'ready' : this.release ? 'available' : 'unavailable';
        this.state.error = operation.cancelled ? '' : operation.timedOut ? 'The application update timed out. Try again later.' : error instanceof UpdateError ? error.message : 'The application update is unavailable. Check your connection and try again.';
        if (operation.kind === 'download' && this.state.status !== 'ready') this.state.downloadedBytes = 0;
    }

    async check() {
        await this.initialize();
        if (!this.supported || this.active) return this.snapshot();
        const operation = this.begin('check', this.metadataTimeoutMs);
        Object.assign(this.state, { status:'checking', error:'' });
        try {
            const response = await fetchTrusted(this.fetch, RELEASES_URL, operation.controller.signal, `EQLWiki-EyeOfZomm/${this.version}`);
            const chunks = [];
            await consumeResponse(response, { limit:MAX_METADATA_BYTES, signal:operation.controller.signal, onChunk:chunk => chunks.push(chunk) });
            let payload;
            try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { throw new UpdateError('GitHub returned invalid application release information.'); }
            const release = selectRelease(payload, this.version);
            this.release = release || this.pending;
            Object.assign(this.state, { lastCheckUtc:this.now().toISOString(), error:'',
                status:this.release ? (this.pending?.version === this.release.version ? 'ready' : 'available') : 'current',
                availableVersion:this.release?.version || '', releaseUrl:this.release?.releaseUrl || '',
                totalBytes:this.release?.size || 0, downloadedBytes:this.pending && this.pending.version === this.release?.version ? this.pending.size : 0 });
        } catch (error) { this.failure(error, operation); }
        finally { this.finish(operation); }
        return this.snapshot();
    }

    async download() {
        await this.initialize();
        if (!this.supported || this.active || !this.release || this.state.status === 'ready') return this.snapshot();
        const operation = this.begin('download', this.downloadTimeoutMs);
        const release = this.release;
        const temporary = path.join(this.directory, `.download-${crypto.randomUUID()}.part`);
        Object.assign(this.state, { status:'downloading', error:'', downloadedBytes:0, totalBytes:release.size });
        let handle;
        try {
            await this.ensureDirectory();
            handle = await fsp.open(temporary, 'wx', 0o600);
            const response = await fetchTrusted(this.fetch, release.url, operation.controller.signal, `EQLWiki-EyeOfZomm/${this.version}`);
            const digest = crypto.createHash('sha256');
            await consumeResponse(response, { limit:MAX_INSTALLER_BYTES, expectedSize:release.size, signal:operation.controller.signal,
                onChunk:async (chunk, size) => { await handle.writeFile(chunk); digest.update(chunk); this.state.downloadedBytes = size; } });
            if (digest.digest('hex') !== release.sha256) throw new UpdateError('The downloaded installer failed SHA-256 verification. Try downloading again.');
            operation.controller.signal.throwIfAborted();
            await handle.sync();
            await handle.close();
            handle = null;
            await fsp.rename(temporary, path.join(this.directory, release.name));
            await this.writeRecord('ready.json', { schema:1, release });
            this.pending = release;
            this.state.status = 'ready';
            await this.pruneInstallers(release.name);
        } catch (error) { this.failure(error, operation); }
        finally {
            await handle?.close().catch(() => {});
            await fsp.unlink(temporary).catch(() => {});
            this.finish(operation);
        }
        return this.snapshot();
    }

    async pruneInstallers(keep) {
        const entries = await fsp.readdir(this.directory, { withFileTypes:true }).catch(() => []);
        for (const entry of entries) {
            if (entry.name === keep || !entry.isFile()) continue;
            const match = /^EQLWiki-Eye-of-Zomm-Setup-(.+)-x64\.exe$/.exec(entry.name);
            if (!match) continue;
            try { parseVersion(match[1]); } catch { continue; }
            await fsp.unlink(path.join(this.directory, entry.name)).catch(() => {});
        }
    }

    async cancel() {
        if (this.active && ['check', 'download'].includes(this.active.kind)) {
            this.active.cancelled = true;
            this.active.controller.abort();
        }
        return this.snapshot();
    }

    async install() {
        await this.initialize();
        if (!this.supported || this.active || !this.pending || this.state.status !== 'ready') return this.snapshot();
        const operation = this.begin('install', this.downloadTimeoutMs);
        try {
            this.state.status = 'installing';
            this.state.error = '';
            let target;
            try { target = await this.verifyInstaller(this.pending, operation.controller.signal); }
            catch (error) {
                // A broken saved package must be downloadable again in this
                // session. A Windows handoff failure below keeps a valid package.
                this.pending = null;
                this.state.downloadedBytes = 0;
                try {
                    await this.ensureDirectory();
                    await fsp.unlink(path.join(this.directory, 'ready.json')).catch(() => {});
                } catch {}
                throw error instanceof UpdateError ? error : new UpdateError('The saved installer is unavailable. Download it again.');
            }
            operation.controller.signal.throwIfAborted();
            const error = await this.launchInstaller(target);
            if (error) throw new UpdateError('Windows could not start the update installer. Try again.');
            await this.onInstallerLaunched();
        } catch (error) { this.failure(error, operation); }
        finally { this.finish(operation); }
        return this.snapshot();
    }

    async startup() {
        await this.initialize();
        await this.check();
        if (this.state.automaticDownload && this.state.status === 'available') await this.download();
        return this.snapshot();
    }

    shutdown() { this.active?.controller.abort(); }
}

module.exports = { AppUpdater, UpdateError, launchSilentNsisInstaller, resolveInstalledNsisScope, readNsisInstallLocation, NSIS_INSTALL_KEY, NSIS_REGISTRY_READ_SCRIPT, RELEASES_URL, MAX_METADATA_BYTES, MAX_INSTALLER_BYTES, parseVersion, compareVersions,
    selectRelease, isReleaseNotesUrl, trustedDownloadRedirect, consumeResponse };
