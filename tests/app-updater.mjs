import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const { AppUpdater, RELEASES_URL, MAX_METADATA_BYTES, MAX_INSTALLER_BYTES, compareVersions, selectRelease,
    isReleaseNotesUrl, trustedDownloadRedirect, launchSilentNsisInstaller, resolveInstalledNsisScope, readNsisInstallLocation, NSIS_INSTALL_KEY, NSIS_REGISTRY_READ_SCRIPT } = require('../desktop/app-updater.cjs');
const installer = Buffer.from('MZ synthetic installer fixture; never executed.');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonResponse = value => new Response(JSON.stringify(value));
const release = (version = '0.8.2', overrides = {}) => {
    const tag = `v${version}`;
    const name = `EQLWiki-Eye-of-Zomm-Setup-${version}-x64.exe`;
    return { tag_name:tag, draft:false, prerelease:version.startsWith('0.') || version.includes('-'), assets:[{
        name, size:installer.length, digest:`sha256:${sha256(installer)}`,
        browser_download_url:`https://github.com/Maergoth/EQL-EOZ/releases/download/${tag}/${name}`
    }], ...overrides };
};
const tests = [];
const test = (name, run) => tests.push({ name, run });

async function withUpdater(testBody, options = {}) {
    const directory = await mkdtemp(path.join(tmpdir(), 'eoz-app-update-'));
    const calls = [], launches = [];
    let quits = 0;
    const defaults = {
        version:'0.8.1', cacheDirectory:directory, isPackaged:true, platform:'win32', arch:'x64',
        fetchImpl:async (url, request) => { calls.push({ url, request }); return url === RELEASES_URL ? jsonResponse([release()]) : new Response(installer); },
        launchInstaller:async target => { launches.push(target); return ''; },
        onInstallerLaunched:() => { quits += 1; }
    };
    const updater = new AppUpdater({ ...defaults, ...options });
    try { await testBody({ updater, directory, calls, launches, quits:() => quits, defaults }); }
    finally { updater.shutdown(); await rm(directory, { recursive:true, force:true }); }
}

test('semantic versions sort numeric fields and prereleases without downgrades', () => {
    assert.equal(compareVersions('0.8.10', '0.8.2'), 1);
    assert.equal(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1);
    assert.equal(compareVersions('1.0.0', '1.0.0-beta.9'), 1);
    assert.equal(compareVersions('1.0.0+new', '1.0.0+old'), 0);
    assert.equal(compareVersions('1.0.0-2', '1.0.0-beta'), -1);
    assert.throws(() => compareVersions('1.0.0-02', '1.0.0'), /version/);
    assert.equal(selectRelease([release('0.8.0'), release('0.8.1')], '0.8.1'), null);
});

test('beta releases are discovered from the releases list and stable users stay stable', () => {
    assert.equal(selectRelease([release('0.8.2'), release('0.8.3'), release('0.8.4', { draft:true })], '0.8.1').version, '0.8.3');
    assert.equal(selectRelease([release('1.1.0-beta.2'), release('1.0.1')], '1.0.0').version, '1.0.1');
    assert.equal(selectRelease([release('1.0.0-beta.2')], '1.0.0-beta.1').version, '1.0.0-beta.2');
    assert.equal(selectRelease([release('1.0.0-beta.2')], '0.8.1'), null);
    assert.equal(selectRelease([release('1.0.0', { prerelease:false })], '0.8.1').version, '1.0.0');
});

test('the newest release must have one exact installer with valid GitHub size and digest', () => {
    for (const mutate of [
        value => { value.assets = []; },
        value => { value.assets.push({ ...value.assets[0] }); },
        value => { value.assets[0].browser_download_url = 'https://github.com/other/repo/releases/download/v0.8.2/evil.exe'; },
        value => { value.assets[0].name = 'other.exe'; },
        value => { value.assets[0].size = MAX_INSTALLER_BYTES + 1; },
        value => { value.assets[0].size = '100'; },
        value => { delete value.assets[0].digest; },
        value => { value.assets[0].digest = 'sha256:invalid'; }
    ]) {
        const value = release();
        mutate(value);
        assert.throws(() => selectRelease([value], '0.8.1'));
    }
    assert.throws(() => selectRelease([release('0.8.3', { assets:[] }), release()], '0.8.1'), /newest release/);
});

test('release notes and redirects stay within the exact project and GitHub asset CDN', () => {
    assert(isReleaseNotesUrl('https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2'));
    assert(isReleaseNotesUrl('https://github.com/Maergoth/EQL-EOZ/releases/tag/v1.0.0-beta.1'));
    for (const url of ['http://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2', 'https://github.com/Maergoth/EQL-EOZ/issues',
        'https://github.com/Maergoth/other/releases/tag/v0.8.2', 'https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2?evil=1',
        'https://github.com/Maergoth/EQL-EOZ/releases/tag/v0.8.2/../../x', 'https://github.com@evil.test/Maergoth/EQL-EOZ/releases/tag/v0.8.2']) assert.equal(isReleaseNotesUrl(url), false);
    const original = release().assets[0].browser_download_url;
    assert(trustedDownloadRedirect('https://release-assets.githubusercontent.com/github-production-release-asset/123/id?token=synthetic', original));
    assert(trustedDownloadRedirect('https://objects.githubusercontent.com/github-production-release-asset-2e65be/123/id', original));
    for (const url of ['https://evil.test/installer.exe', 'http://release-assets.githubusercontent.com/github-production-release-asset/123/id',
        'https://release-assets.githubusercontent.com/arbitrary.exe', 'https://github.com/other/repo/releases/download/v1/foo.exe',
        'https://user@release-assets.githubusercontent.com/github-production-release-asset/123/id']) assert.equal(trustedDownloadRedirect(url, original), false);
});

test('development and unsupported platforms never access the update network or cache', async () => {
    for (const options of [{ isPackaged:false }, { platform:'linux' }, { arch:'arm64' }]) {
        await withUpdater(async ({ updater, calls, directory }) => {
            assert.equal((await updater.startup()).status, 'unsupported');
            await updater.check(); await updater.download(); await updater.install();
            assert.equal(calls.length, 0);
            assert.deepEqual(await readdir(directory), []);
        }, options);
    }
});

test('quiet startup only checks metadata by default, then manual download verifies bytes', async () => {
    await withUpdater(async ({ updater, calls, launches, directory }) => {
        const available = await updater.startup();
        assert.equal(available.status, 'available');
        assert.equal(available.availableVersion, '0.8.2');
        assert.equal(available.automaticDownload, false);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, RELEASES_URL);
        assert.equal(calls[0].request.redirect, 'manual');
        const ready = await updater.download();
        assert.equal(ready.status, 'ready');
        assert.equal(ready.downloadedBytes, installer.length);
        assert.equal(calls.length, 2);
        assert.deepEqual(await readFile(path.join(directory, release().assets[0].name)), installer);
        assert.equal(JSON.parse(await readFile(path.join(directory, 'ready.json'))).release.version, '0.8.2');
        assert.equal(launches.length, 0);
        assert.equal(JSON.stringify(ready).includes(directory), false);
    });
});

test('normal cache directories pin their canonical path for verified install handoff', async () => {
    await withUpdater(async ({ updater, directory, launches }) => {
        await updater.check();
        assert.equal((await updater.download()).status, 'ready');
        assert.equal(updater.directory, await realpath(directory));
        assert.equal((await updater.install()).status, 'installing');
        assert.deepEqual(launches, [path.join(await realpath(directory), release().assets[0].name)]);
    });
});

test('Windows short and case-variant paths support preferences, download, restore and install', async () => {
    if (process.platform !== 'win32') return;
    await withUpdater(async ({ directory, defaults, launches }) => {
        // The hosted Windows runner can expose TEMP through a RUNNER~1 parent.
        // Obtain a genuine 8.3 alias without interpolating paths into shell code.
        const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
            '(New-Object -ComObject Scripting.FileSystemObject).GetFolder($env:EOZ_TEST_CACHE_PATH).ShortPath'],
        { env:{ ...process.env, EOZ_TEST_CACHE_PATH:directory }, windowsHide:true });
        const shortPath = stdout.trim();
        assert(shortPath, 'Windows must return a valid folder spelling');
        const canonical = await realpath(directory);
        const spellings = [shortPath, canonical.toUpperCase()];
        if (path.relative(canonical, shortPath) === '') console.log('  note: this volume does not expose a distinct 8.3 cache alias');
        for (const spelling of spellings) {
            const cacheDirectory = path.join(spelling, 'new-cache');
            const updater = new AppUpdater({ ...defaults, cacheDirectory });
            const restored = new AppUpdater({ ...defaults, cacheDirectory });
            try {
                assert.equal((await updater.setStartupDownload(true)).automaticDownload, true);
                await updater.check();
                assert.equal((await updater.download()).status, 'ready');
                assert.equal((await restored.getStatus()).status, 'ready');
                assert.equal((await restored.getStatus()).automaticDownload, true);
                assert.equal((await restored.install()).status, 'installing');
                assert.equal(launches.at(-1), path.join(await realpath(cacheDirectory), release().assets[0].name));
            } finally { updater.shutdown(); restored.shutdown(); }
        }
    });
});

test('cache leaf and ancestor symlinks or junctions are rejected before creating descendants', async () => {
    await withUpdater(async ({ directory, defaults }) => {
        const target = path.join(directory, 'target');
        const redirected = path.join(directory, 'redirected');
        await mkdir(target);
        await symlink(target, redirected, process.platform === 'win32' ? 'junction' : 'dir');
        for (const cacheDirectory of [redirected, path.join(redirected, 'not-created')]) {
            const updater = new AppUpdater({ ...defaults, cacheDirectory });
            try { await assert.rejects(updater.ensureDirectory(), /normal local directory/); }
            finally { updater.shutdown(); }
        }
        assert.deepEqual(await readdir(target), []);
    });
});

test('a parent redirected after initialization is rejected on the next cache operation', async () => {
    await withUpdater(async ({ directory, defaults }) => {
        const parent = path.join(directory, 'parent');
        const moved = path.join(directory, 'moved');
        const updater = new AppUpdater({ ...defaults, cacheDirectory:path.join(parent, 'cache') });
        try {
            await updater.ensureDirectory();
            await rename(parent, moved);
            await symlink(moved, parent, process.platform === 'win32' ? 'junction' : 'dir');
            await assert.rejects(updater.ensureDirectory(), /normal local directory/);
        } finally { updater.shutdown(); }
    });
});

test('an opt-in survives relaunch, downloads on startup, and never starts an installer', async () => {
    await withUpdater(async ({ updater, defaults, launches }) => {
        assert.equal((await updater.setStartupDownload(true)).automaticDownload, true);
        const relaunched = new AppUpdater(defaults);
        assert.equal((await relaunched.startup()).status, 'ready');
        assert.equal((await relaunched.getStatus()).automaticDownload, true);
        assert.equal(launches.length, 0);
        await relaunched.setStartupDownload(false);
        assert.equal((await relaunched.getStatus()).automaticDownload, false);
    });
});

test('a verified ready installer survives quitting without auto execution and is ignored after upgrading', async () => {
    await withUpdater(async ({ updater, defaults, launches }) => {
        await updater.check(); await updater.download();
        const relaunched = new AppUpdater(defaults);
        assert.equal((await relaunched.getStatus()).status, 'ready');
        assert.equal((await relaunched.startup()).status, 'ready');
        assert.equal(launches.length, 0);
        const upgraded = new AppUpdater({ ...defaults, version:'0.8.2' });
        assert.equal((await upgraded.startup()).status, 'current');
    });
});

test('Later keeps the app running; one explicit restart request hands off only the verified local package', async () => {
    await withUpdater(async ({ updater, launches, directory, quits }) => {
        await updater.check(); await updater.download();
        assert.equal((await updater.getStatus()).status, 'ready');
        assert.equal(launches.length, 0);
        assert.equal(quits(), 0);
        assert.equal((await updater.install()).status, 'installing');
        assert.deepEqual(launches, [path.join(await realpath(directory), release().assets[0].name)]);
        assert.equal(quits(), 1);
        await updater.install();assert.equal(launches.length,1,'A successful handoff cannot be launched twice');
    });
});

test('a restart request keeps the owner alive until installer process creation is accepted', async () => {
    let started,accept;
    const launching=new Promise(resolve=>{started=resolve;}),handoff=new Promise(resolve=>{accept=resolve;});
    await withUpdater(async ({updater,quits})=>{
        await updater.check();await updater.download();
        const result=updater.install();await launching;
        assert.equal(quits(),0);assert.equal((await updater.getStatus()).status,'installing');
        accept('');assert.equal((await result).status,'installing');assert.equal(quits(),1);
    },{launchInstaller:async()=>{started();return handoff;}});
});

test('silent NSIS handoff uses fixed upgrade/restart flags and preserves a custom installed path without a shell', async () => {
    const target='C:\\Users\\Fixture Profile\\app-updates\\EQLWiki-Eye-of-Zomm-Setup-0.8.2-x64.exe';
    const installDirectory='C:\\Program Files\\Eye of Zomm & Fixtures',child=new EventEmitter(),calls=[];
    let unrefs=0,settled=false;child.unref=()=>{unrefs++;};
    const resolveScope=async()=>'currentuser';
    const pending=launchSilentNsisInstaller(target,{installDirectory,resolveScope,spawnImpl:(...args)=>{calls.push(args);return child;}}).then(result=>{settled=true;return result;});
    await Promise.resolve();assert.equal(settled,false,'Returning a child object is not an accepted process creation');
    assert.deepEqual(calls,[[target,['/S','--updated','--force-run','/currentuser',`/D=${installDirectory}`],{
        shell:false,detached:true,stdio:'ignore',windowsHide:true,windowsVerbatimArguments:true,argv0:`"${target}"`
    }]]);
    child.emit('spawn');assert.equal(await pending,'');assert.equal(unrefs,1);
    for(const spawnImpl of [()=>{throw Error('private path diagnostic');},()=>{const failed=new EventEmitter();queueMicrotask(()=>failed.emit('error',Error('private path diagnostic')));return failed;}]){
        await assert.rejects(launchSilentNsisInstaller(target,{installDirectory,resolveScope,spawnImpl}),error=>/Windows could not start/.test(error.message)&&!error.message.includes('private'));
    }
    for(const directory of ['relative-folder','C:\\bad" /S','C:\\bad\npath']){
        await assert.rejects(launchSilentNsisInstaller(target,{installDirectory:directory,spawnImpl:()=>{throw Error('Must not spawn invalid arguments');}}),/Windows could not start/);
    }
});

test('silent update scope matches the running install rather than choosing the other registered installation', async () => {
    const user='C:\\Users\\Fixture\\Programs\\Eye of Zomm',machine='C:\\Program Files\\Eye of Zomm';
    const settings={readLocation:async hive=>hive==='HKCU'?user:machine,realpath:async value=>value};
    assert.equal(await resolveInstalledNsisScope(user,settings),'currentuser','A dual install must not elevate/uninstall the machine install when updating the user install');
    assert.equal(await resolveInstalledNsisScope(machine.toUpperCase()+'\\',{...settings,readLocation:async hive=>hive==='HKLM'?machine:''}),'allusers','A machine-only install retains its scope, with case and trailing-separator tolerance');
    await assert.rejects(resolveInstalledNsisScope(machine,settings),/Both per-user and machine-wide installs/,'Stock NSIS must not silently consolidate another user copy during a machine-wide update');
    const short='C:\\Users\\FIXTUR~1\\Programs\\Eye of Zomm';
    assert.equal(await resolveInstalledNsisScope(short,{...settings,realpath:async value=>value===short?user:value}),'currentuser','Canonical paths reconcile Windows short aliases');
    for(const locations of [{HKCU:user,HKLM:user},{HKCU:'',HKLM:''},{HKCU:machine,HKLM:''}]){
        await assert.rejects(resolveInstalledNsisScope(user,{...settings,readLocation:async hive=>locations[hive]}),/Windows registration/);
    }
    const calls=[];
    const location=await readNsisInstallLocation('HKCU',{execFileImpl:(file,args,options,callback)=>{
        calls.push({file,args,options});callback(null,user);
    }});
    assert.equal(location,user);assert.equal(calls.length,1);
    assert.deepEqual(calls[0].args,['-NoProfile','-NonInteractive','-Command',NSIS_REGISTRY_READ_SCRIPT]);
    assert.equal(calls[0].options.env.EOZ_UPDATE_REGISTRY_HIVE,'HKCU');assert.equal(calls[0].options.env.EOZ_UPDATE_REGISTRY_KEY,NSIS_INSTALL_KEY);
    assert.equal(calls[0].options.windowsHide,true);assert.equal(calls[0].options.timeout,5000);assert.equal(calls[0].options.encoding,'utf8');assert.equal(path.win32.basename(calls[0].file).toLowerCase(),'powershell.exe');
    assert(NSIS_REGISTRY_READ_SCRIPT.includes('[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)'));
    assert(NSIS_REGISTRY_READ_SCRIPT.includes('[Microsoft.Win32.RegistryView]::Registry64'));
    assert.equal(await readNsisInstallLocation('HKCU',{execFileImpl:(_file,_args,_options,callback)=>callback(Error('private registry text'))}), '');
    assert.equal(await readNsisInstallLocation('OTHER',{execFileImpl:()=>{throw Error('Invalid hives cannot run a process');}}),'');
    await withUpdater(async({updater,quits})=>{
        await updater.check();await updater.download();const result=await updater.install();
        assert.equal(result.status,'ready');assert.match(result.error,/Windows registration/);assert.equal(quits(),0);
    },{launchInstaller:target=>launchSilentNsisInstaller(target,{installDirectory:user,resolveScope:()=>resolveInstalledNsisScope(user,{...settings,readLocation:async()=>''}),spawnImpl:()=>{throw Error('An unmatched install cannot launch');}})});
    await withUpdater(async({updater,quits})=>{
        await updater.check();await updater.download();const result=await updater.install();
        assert.equal(result.status,'ready');assert.match(result.error,/Both per-user and machine-wide installs/);assert.equal(quits(),0);
    },{launchInstaller:target=>launchSilentNsisInstaller(target,{installDirectory:machine,resolveScope:()=>resolveInstalledNsisScope(machine,settings),spawnImpl:()=>{throw Error('A consolidating install cannot launch');}})});
});

test('Windows CI registry reader roundtrips non-ASCII installation paths without overwriting an existing profile', async () => {
    // Never write a developer's registry during ordinary local npm test runs.
    if(process.platform!=='win32'||process.env.CI!=='true')return;
    const directory=await mkdtemp(path.join(tmpdir(),'eoz-unicode-update-registry-'));
    const installDirectory=path.join(directory,'Eye of Zomm-é-Ω-語-玩家');
    await mkdir(installDirectory);
    const executable=path.win32.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const fixtureScript=[
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
        "$ErrorActionPreference = 'Stop'",
        "$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)",
        "$key = $null",
        "try {",
        "  $key = $base.OpenSubKey($env:EOZ_UPDATE_REGISTRY_KEY, $true)",
        "  if ($env:EOZ_UPDATE_REGISTRY_FIXTURE_ACTION -eq 'prepare') {",
        "    $created = $null -eq $key",
        "    if ($null -ne $key -and $key.GetValueNames() -contains 'InstallLocation') { throw 'Refusing to overwrite an existing EoZ InstallLocation' }",
        "    if ($created) { $key = $base.CreateSubKey($env:EOZ_UPDATE_REGISTRY_KEY) }",
        "    $key.SetValue('InstallLocation', $env:EOZ_UPDATE_REGISTRY_FIXTURE_LOCATION, [Microsoft.Win32.RegistryValueKind]::String)",
        "    [Console]::Write($(if ($created) { 'created-key' } else { 'existing-key' }))",
        "  } elseif ($env:EOZ_UPDATE_REGISTRY_FIXTURE_ACTION -eq 'cleanup') {",
        "    if ($null -ne $key -and $key.GetValueNames() -contains 'InstallLocation') {",
        "      if ([string]::Equals([string]$key.GetValue('InstallLocation'), $env:EOZ_UPDATE_REGISTRY_FIXTURE_LOCATION, [StringComparison]::Ordinal)) {",
        "        $key.DeleteValue('InstallLocation')",
        "        if ($env:EOZ_UPDATE_REGISTRY_FIXTURE_CREATED_KEY -eq 'true' -and $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0) { $key.Dispose(); $key = $null; $base.DeleteSubKey($env:EOZ_UPDATE_REGISTRY_KEY) }",
        "      }",
        "    }",
        "  } else { throw 'Unsupported fixture action' }",
        "} finally { if ($null -ne $key) { $key.Dispose() }; $base.Dispose() }"
    ].join('\n');
    let createdKey=false;
    const fixture=action=>promisify(execFile)(executable,['-NoProfile','-NonInteractive','-Command',fixtureScript],{
        windowsHide:true,timeout:10000,maxBuffer:16384,encoding:'utf8',env:{...process.env,
            EOZ_UPDATE_REGISTRY_KEY:NSIS_INSTALL_KEY,EOZ_UPDATE_REGISTRY_FIXTURE_ACTION:action,
            EOZ_UPDATE_REGISTRY_FIXTURE_LOCATION:installDirectory,EOZ_UPDATE_REGISTRY_FIXTURE_CREATED_KEY:String(createdKey)}
    });
    try{
        const prepared=await fixture('prepare');createdKey=prepared.stdout==='created-key';
        assert(['created-key','existing-key'].includes(prepared.stdout));
        assert.equal(await readNsisInstallLocation('HKCU'),installDirectory,'The real fixed UTF-8 reader retains every Unicode character');
        assert.equal(await resolveInstalledNsisScope(installDirectory),'currentuser','The actual reader and canonical scope resolver match a Unicode install directory');
        await assert.rejects(fixture('prepare'),/Refusing to overwrite an existing EoZ InstallLocation/,'Even the disposable CI fixture refuses an existing value');
        assert.equal(await readNsisInstallLocation('HKCU'),installDirectory,'A refused overwrite leaves the original fixture value intact');
    }finally{
        try{await fixture('cleanup');}finally{await rm(directory,{recursive:true,force:true});}
    }
});

test('pinned NSIS templates support silent assisted upgrade, custom path and automatic relaunch', async () => {
    const builderRoot=path.dirname(require.resolve('app-builder-lib/package.json'));
    const template=async name=>(await readFile(path.join(builderRoot,'templates','nsis',name),'utf8')).replace(/\r\n/g,'\n');
    assert.equal(JSON.parse(await readFile(path.join(builderRoot,'package.json'),'utf8')).version,'26.15.3');
    const {UUID}=createRequire(path.join(builderRoot,'package.json'))('builder-util-runtime');
    const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
    assert.equal(NSIS_INSTALL_KEY,`Software\\${UUID.v5(pkg.build.appId,UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'))}`,'Registry identity matches the pinned builder and existing appId');
    assert((await template('installSection.nsh')).includes('${if} ${isForceRun}\n  ${andIf} ${Silent}\n    !insertmacro doStartApp'),'Assisted silent installers honor --force-run');
    const multi=await template('multiUser.nsh');
    assert(multi.includes('The /D parameter is special in NSIS - it must be the last parameter and cannot have quotes'));
    assert(multi.includes('StrCpy $R9 $R8 "" $R6'),'The installed directory consumes the raw final /D argument, including spaces');
    assert((await template('include/installUtil.nsh')).includes('/S /KEEP_APP_DATA $0'),'The upgrade preserves existing application data');
    assert((await template('include/allowOnlyOneInstallerInstance.nsh')).includes('# allow app to exit without explicit kill'));
});

test('an edited installer fails re-verification and permits a verified replacement download', async () => {
    await withUpdater(async ({ updater, directory, launches, quits }) => {
        await updater.check(); await updater.download();
        const edited = Buffer.from(installer); edited[0] ^= 1;
        await writeFile(path.join(directory, release().assets[0].name), edited);
        const result = await updater.install();
        assert.equal(result.status, 'available');
        assert.match(result.error, /SHA-256/);
        assert.equal(launches.length, 0);
        assert.equal(quits(), 0);
        assert.equal((await updater.download()).status, 'ready');
        assert.equal((await updater.install()).status, 'installing');
        assert.equal(launches.length, 1);
        assert.equal(quits(), 1);
    });
});

test('Windows handoff failure keeps Eye of Zomm running and exposes no raw operating-system text', async () => {
    await withUpdater(async ({ updater, quits }) => {
        await updater.check(); await updater.download();
        const result = await updater.install();
        assert.equal(result.status, 'ready');
        assert.match(result.error, /Windows could not start/);
        assert.equal(result.error.includes('private'), false);
        assert.equal(quits(), 0);
    }, { launchInstaller:async () => 'private filesystem diagnostic' });
});

test('a hash mismatch never stages a ready update and removes partial files', async () => {
    await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /SHA-256/);
        assert.equal((await readdir(directory)).length, 0);
    }, { fetchImpl:async url => url === RELEASES_URL ? jsonResponse([release('0.8.2', { assets:[{ ...release().assets[0], digest:`sha256:${'0'.repeat(64)}` }] })]) : new Response(installer) });
});

test('declared, streamed, and incomplete installer sizes are rejected', async () => {
    for (const body of [
        () => new Response(installer, { headers:{ 'content-length':String(installer.length + 1) } }),
        () => new Response(Buffer.concat([installer, Buffer.from('extra')])),
        () => new Response(installer.subarray(0, installer.length - 1))
    ]) await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /size|incomplete/);
        assert.deepEqual(await readdir(directory), []);
    }, { fetchImpl:async url => url === RELEASES_URL ? jsonResponse([release()]) : body() });
});

test('metadata response bytes and HTTP errors are bounded without exposing response bodies', async () => {
    for (const response of [
        () => new Response('x'.repeat(MAX_METADATA_BYTES + 1)),
        () => new Response('private remote body', { status:429 }),
        () => new Response('{bad-json')
    ]) await withUpdater(async ({ updater }) => {
        const result = await updater.check();
        assert.equal(result.status, 'unavailable');
        assert.equal(result.error.includes('private'), false);
        assert.ok(result.error.length < 200);
    }, { fetchImpl:async () => response() });
});

test('decoded HTTP response lengths do not confuse compressed transport bytes with installer bytes', async () => {
    await withUpdater(async ({ updater }) => {
        assert.equal((await updater.check()).status, 'available');
        assert.equal((await updater.download()).status, 'ready');
    }, { fetchImpl:async url => new Response(url === RELEASES_URL ? JSON.stringify([release()]) : installer,
        { headers:{ 'content-encoding':'gzip', 'content-length':'5' } }) });
});

test('redirects are manual and an unexpected host cannot receive the installer request', async () => {
    const seen = [];
    await withUpdater(async ({ updater }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /unexpected address/);
        assert.equal(seen.length, 2);
    }, { fetchImpl:async url => { seen.push(url); return url === RELEASES_URL ? jsonResponse([release()]) : new Response(null, { status:302, headers:{ location:'https://evil.test/private.exe' } }); } });
});

test('the exact GitHub CDN redirect can stream and verify the package', async () => {
    const cdn = 'https://release-assets.githubusercontent.com/github-production-release-asset/123/fixture?synthetic=1';
    const seen = [];
    await withUpdater(async ({ updater }) => {
        await updater.check();
        assert.equal((await updater.download()).status, 'ready');
        assert.deepEqual(seen, [RELEASES_URL, release().assets[0].browser_download_url, cdn]);
    }, { fetchImpl:async url => {
        seen.push(url);
        if (url === RELEASES_URL) return jsonResponse([release()]);
        if (url === cdn) return new Response(installer);
        return new Response(null, { status:302, headers:{ location:cdn } });
    } });
});

function stalledResponse(signal, started = () => {}) {
    return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener('abort', () => controller.error(new Error('synthetic private abort text')), { once:true });
        started();
    } }));
}

test('a download deadline remains active after response headers arrive', async () => {
    await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const result = await updater.download();
        assert.equal(result.status, 'available');
        assert.match(result.error, /timed out/);
        assert.deepEqual(await readdir(directory), []);
    }, { downloadTimeoutMs:20, fetchImpl:async (url, { signal }) => url === RELEASES_URL ? jsonResponse([release()]) : stalledResponse(signal) });
});

test('cancelling a streamed download removes staging and permits a later retry', async () => {
    let started;
    const bodyStarted = new Promise(resolve => { started = resolve; });
    let stall = true;
    await withUpdater(async ({ updater, directory }) => {
        await updater.check();
        const downloading = updater.download();
        await bodyStarted;
        assert.equal((await updater.getStatus()).status, 'downloading');
        await updater.cancel();
        const result = await downloading;
        assert.equal(result.status, 'available');
        assert.equal(result.error, '');
        assert.deepEqual(await readdir(directory), []);
        stall = false;
        assert.equal((await updater.download()).status, 'ready');
    }, { fetchImpl:async (url, { signal }) => url === RELEASES_URL ? jsonResponse([release()]) : stall ? stalledResponse(signal, started) : new Response(installer) });
});

test('concurrent checks and downloads share one operation instead of duplicating network work', async () => {
    let started;
    const bodyStarted = new Promise(resolve => { started = resolve; });
    let installerRequests = 0;
    await withUpdater(async ({ updater }) => {
        await updater.check();
        const downloading = updater.download();
        await bodyStarted;
        assert.equal((await updater.download()).status, 'downloading');
        assert.equal((await updater.check()).status, 'downloading');
        assert.equal(installerRequests, 1);
        await updater.cancel(); await downloading;
    }, { fetchImpl:async (url, { signal }) => {
        if (url === RELEASES_URL) return jsonResponse([release()]);
        installerRequests += 1;
        return stalledResponse(signal, started);
    } });
});

test('saved records cannot point outside the owned update cache', async () => {
    await withUpdater(async ({ updater, directory, launches }) => {
        const saved = { version:'0.8.2', tag:'v0.8.2', name:'../../other.exe', url:'https://evil.test/other.exe', size:1, sha256:'0'.repeat(64) };
        await writeFile(path.join(directory, 'ready.json'), JSON.stringify({ schema:1, release:saved }));
        const result = await updater.getStatus();
        assert.notEqual(result.status, 'ready');
        await updater.install();
        assert.equal(launches.length, 0);
    });
});

test('preload exposes only the fixed updater actions and main rejects iframe or unrelated IPC senders', async () => {
    const exposures = {}, invoked = [];
    const preload = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
    vm.runInNewContext(preload, { require:() => ({ contextBridge:{ exposeInMainWorld:(name, api) => { exposures[name] = api; } },
        ipcRenderer:{ invoke:(...args) => { invoked.push(args); return Promise.resolve(); } } }) });
    const bridge = exposures.eyeOfZommUpdates;
    await bridge.getStatus(); await bridge.check(); await bridge.download(); await bridge.cancel(); await bridge.setStartupDownload(true); await bridge.install();
    assert.deepEqual(invoked, [['eye-of-zomm:app-update', 'get-status'], ['eye-of-zomm:app-update', 'check'], ['eye-of-zomm:app-update', 'download'],
        ['eye-of-zomm:app-update', 'cancel'], ['eye-of-zomm:app-update', 'startup-download', true], ['eye-of-zomm:app-update', 'install']]);

    const mainPath = new URL('../desktop/main.cjs', import.meta.url);
    const nativeRequire = createRequire(mainPath);
    const handlers = {};
    const updaterOptions=[],silentLaunches=[];let nativeQuits=0;
    const mainFrame = { url:'http://127.0.0.1:53147/' };
    const contents = { mainFrame };
    const testWindow = { isDestroyed:() => false, webContents:contents };
    const context = vm.createContext({
        require:name => name === 'electron' ? { app:{ getVersion:() => '0.8.1', getPath:() => tmpdir(), requestSingleInstanceLock:() => false, quit() {nativeQuits++;}, on() {} },
            ipcMain:{ handle:(name, handler) => { handlers[name] = handler; } } } : name === './app-updater.cjs' ? {
                AppUpdater:class { constructor(options){updaterOptions.push(options);} getStatus() { return { status:'mocked' }; } install(){return {status:'installing'};} }, isReleaseNotesUrl,
                launchSilentNsisInstaller:async(target,options)=>{silentLaunches.push({target,...options});return '';}
            } : nativeRequire(name),
        __dirname:path.dirname(mainPath.pathname.replace(/^\/(\w:)/, '$1')), process, console, Buffer, URL, testWindow
    });
    vm.runInContext(await readFile(mainPath, 'utf8'), context);
    vm.runInContext('windowRef = testWindow', context);
    const handler = handlers['eye-of-zomm:app-update'];
    const trusted = { sender:contents, senderFrame:mainFrame };
    assert.equal((await handler(trusted, 'get-status')).status, 'mocked');
    assert.equal('confirmInstall' in updaterOptions[0],false,'The explicit trusted restart click is not followed by another native confirmation');
    assert.equal((await handler(trusted,'install')).status,'installing');
    await updaterOptions[0].launchInstaller('verified-local-installer.exe');
    assert.deepEqual(silentLaunches,[{target:'verified-local-installer.exe',installDirectory:path.dirname(process.execPath)}],'The main process supplies its own installed directory, never an IPC path');
    const beforeQuit=nativeQuits;updaterOptions[0].onInstallerLaunched();assert.equal(nativeQuits,beforeQuit+1);
    await assert.rejects(handler({ sender:{}, senderFrame:mainFrame }, 'download'), /unavailable/);
    await assert.rejects(handler({ sender:contents, senderFrame:{ url:mainFrame.url } }, 'install'), /unavailable/);
    await assert.rejects(handler(trusted, 'arbitrary-action'), /Unknown/);
    await assert.rejects(handler(trusted, 'startup-download', 'true'), /Unknown/);
});

let failures = 0;
for (const { name, run } of tests) {
    try { await run(); console.log(`PASS application updater: ${name}`); }
    catch (error) { failures += 1; console.error(`FAIL application updater: ${name}\n${error.stack}`); }
}
if (failures) process.exitCode = 1;
