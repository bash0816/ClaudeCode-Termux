#!/usr/bin/env node
'use strict';
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const r = require('./patchelf-runtime');
const packageDir = path.resolve(__dirname, '..');
const pkg = require(path.join(packageDir, 'package.json'));
const config = require(path.join(packageDir, 'config/claude-native-audited-versions.json'));
function run(command, args) { const x = spawnSync(command,args,{encoding:'utf8'}); if(x.error||x.status!==0) throw new Error(`${command} failed: ${x.error?.message||x.stderr||x.status}`); return (x.stdout||'').trim(); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function shellPath(value) { if (!path.isAbsolute(value) || /[\s'"`$;&|<>\\(){}\[\]*?!]/.test(value)) throw new Error(`PREFIX-derived wrapper path contains unsupported shell characters: ${value}`); return value; }
function currentName(versionDir){ try { const name=fs.readlinkSync(path.join(versionDir,'current')); return /^gen-[a-f0-9]{16}-[A-Za-z0-9-]+$/.test(name)?name:null; } catch { return null; } }
function glibcInventory(glibcLib) {
 const links=[]; for(const name of fs.readdirSync(glibcLib).sort()) { if(!/^[A-Za-z0-9_.+-]+\.so(?:\.[A-Za-z0-9_.+-]+)*$/.test(name)) continue; const p=path.join(glibcLib,name); try { const real=fs.realpathSync(p); if(fs.statSync(real).isFile()) links.push({soname:name,realpath:real}); } catch {} }
 return links;
}
function main(argv=process.argv.slice(2)) {
 const command=argv[0], version=process.env.CLAUDE_TERMUX_CLAUDE_VERSION||pkg.version, item=config.versions[version];
 const tp=r.termuxPaths(process.env.PREFIX), root=process.env.CLAUDE_TERMUX_PACKAGE_CACHE||path.join(os.homedir(),'.claude-termux-native-package');
 const versionDir=path.join(root,'patchelf',version), shellRoot=path.join(root,'patchelf','shell');
 if(command==='gc'||command==='--termux-gc'){ const result=r.gcGenerations({versionDir,flockPath:tp.flock}); process.stderr.write(JSON.stringify(result,null,2)+'\n'); return; }
 if(!item?.native_spec||!item.tarball_sha256||!item.tarball_integrity) throw new Error(`Audited patchelf identity is unavailable for ${version}`);
 const runtimeFiles=['glibc/lib/libc.so.6','glibc/lib/libm.so.6'];
 const tools={patchelf:process.env.CLAUDE_TERMUX_PATCHELF||tp.patchelf,readelf:process.env.CLAUDE_TERMUX_READELF||tp.readelf};
 const glibcLib=process.env.CLAUDE_TERMUX_GLIBC_LIB||path.join(tp.glibc,'lib');
 const inventory=glibcInventory(glibcLib);
 const runShell=shellPath(path.join(path.dirname(tp.bash),'sh')), preload=shellPath(tp.preload), bash=shellPath(tp.bash);
 const wrapperRun=`#!${runShell}\nunset LD_LIBRARY_PATH\nexport LD_PRELOAD='${preload}'\nexec '${runShell}' -c 'exec "$@"' hook-run "$@"\n`;
 const wrapperBash=`#!${runShell}\nunset LD_LIBRARY_PATH\nexport LD_PRELOAD='${preload}'\nexec '${bash}' "$@"\n`;
 const wid=r.wrapperIdentity(wrapperRun,wrapperBash);
 const widDir=path.join(shellRoot,wid);
 const wrappers=fs.existsSync(widDir)?r.ensureShellWrappers(shellRoot,wrapperRun,wrapperBash):r.ensureShellWrappersLocked(shellRoot,wrapperRun,wrapperBash,tp.flock);
 const wrapperFiles={wrapperRun:wrappers.run,wrapperBash:wrappers.bash};
 const fingerprintPaths=[['patched','patched/claude'],['patchelf',tools.patchelf],['readelf',tools.readelf],['glibcLoader',path.join(glibcLib,'ld-linux-aarch64.so.1')],...inventory.flatMap((x,i)=>[[`glibc${i}`,x.realpath],[`glibcLink${i}`,path.join(glibcLib,x.soname)],[`glibcMinLink${i}`,path.join('glibc-min',x.soname)]])];
 const identity=r.createIdentity({schema:r.SCHEMA,version,tarball_sha256:item.tarball_sha256,tarball_integrity:item.tarball_integrity,wid,glibc:inventory,tools:Object.fromEntries(Object.entries(tools).map(([k,p])=>[k,r.fingerprint(p)]))});
 const wrappersField={wid,run:`${wid}/run`,bash:`${wid}/bash`};
 function isReusable(generationPath, ready) {
   try {
     r.validateReady(ready,{generationPath,fingerprintPaths,requiredSha256:['patched','patchelf','readelf','wrapperRun','wrapperBash',...inventory.map((_,i)=>`glibc${i}`),...inventory.map((_,i)=>[`glibcLink${i}`,`glibcMinLink${i}`]).flat()]});
     if(ready.identity!==identity) throw new Error('identity mismatch');
     if(ready.wid!==wid) throw new Error('wid mismatch');
     if(JSON.stringify(ready.glibcLinks)!==JSON.stringify(inventory)||JSON.stringify(ready.glibcPaths)!==JSON.stringify(inventory.map(x=>x.realpath))||JSON.stringify(ready.fingerprintPaths)!==JSON.stringify(fingerprintPaths)) throw new Error('READY omits or changes code-required runtime targets');
     const wrapperMap={wrapperRun:path.join(shellRoot,ready.wrappers.run),wrapperBash:path.join(shellRoot,ready.wrappers.bash)};
     const warm=r.warmGeneration({generationPath,ready,fingerprintPaths,wrapperFiles:wrapperMap,versionDir,flockPath:tp.flock});
     return warm.reusable;
   } catch { return false; }
 }
 function validateCLIReady(ready) {
   r.validateReady(ready,{generationPath:path.join(versionDir,currentName(versionDir)||''),fingerprintPaths,requiredSha256:['patched','patchelf','readelf','wrapperRun','wrapperBash',...inventory.map((_,i)=>`glibc${i}`),...inventory.map((_,i)=>[`glibcLink${i}`,`glibcMinLink${i}`]).flat()]});
   if(JSON.stringify(ready.glibcLinks)!==JSON.stringify(inventory)||JSON.stringify(ready.glibcPaths)!==JSON.stringify(inventory.map(x=>x.realpath))||JSON.stringify(ready.fingerprintPaths)!==JSON.stringify(fingerprintPaths)) throw new Error('READY omits or changes code-required runtime targets');
 }
 function resolve() {
   const name=currentName(versionDir); if(!name) return null;
   const generationPath=path.join(versionDir,name);
   try { const ready=r.parseReady(fs.readFileSync(path.join(generationPath,'READY'),'utf8'),{generationPath});
     if(!isReusable(generationPath,ready)) return null;
     const wrapperMap={wrapperRun:path.join(shellRoot,ready.wrappers.run),wrapperBash:path.join(shellRoot,ready.wrappers.bash)};
     return {generationPath,ready,wrapperMap};
   } catch { return null; }
 }
 function prepare() {
   const sourcePath=process.env.CLAUDE_TERMUX_NATIVE_BIN||path.join(root,'versions',version,'app/node_modules/@anthropic-ai/claude-code-linux-arm64/claude');
   const tarballUrl=run(process.env.CLAUDE_TERMUX_NPM||'npm',['view',item.native_spec,'dist.tarball','--json']).replace(/^"|"$/g,'');
   const built=r.prepareGeneration({versionDir,flockPath:tp.flock,identity,fingerprintPaths,sha256Paths:{patched:'patched/claude',patchelf:tools.patchelf,readelf:tools.readelf,wrapperRun:wrappers.run,wrapperBash:wrappers.bash,...Object.fromEntries(inventory.map((x,i)=>[`glibc${i}`,x.realpath])),...Object.fromEntries(inventory.map((x,i)=>[`glibcLink${i}`,path.join(glibcLib,x.soname)])),...Object.fromEntries(inventory.map((x,i)=>[`glibcMinLink${i}`,path.join('glibc-min',x.soname)]))},wrapperFiles,readyFields:{fingerprintPaths,wid,wrappers:wrappersField,glibcLinks:inventory,glibcPaths:inventory.map(x=>x.realpath),sha256:{wrapperRun:sha(wrappers.run),wrapperBash:sha(wrappers.bash),patchelf:sha(tools.patchelf),readelf:sha(tools.readelf),...Object.fromEntries(inventory.map((x,i)=>[`glibc${i}`,sha(x.realpath)]))}},populate:tempDir=>r.populateGeneration({tempDir,sourcePath,tarballUrl,tarballSha256:item.tarball_sha256,tarballIntegrity:item.tarball_integrity,patchelfPath:tools.patchelf,readelfPath:tools.readelf,glibcLib,loaderPath:path.join(glibcLib,'ld-linux-aarch64.so.1'),shellRoot,runTemplate:wrapperRun,bashTemplate:wrapperBash}),isReusable});
   return {generationPath:built.generationPath,ready:built.ready,wrapperMap:wrapperFiles};
 }
 if(command==='verify'||command==='--termux-verify'){
   const name=currentName(versionDir); if(!name) throw new Error('no current generation');
   const generationPath=path.join(versionDir,name), ready=r.parseReady(fs.readFileSync(path.join(generationPath,'READY'),'utf8'),{generationPath});
   if(ready.identity!==identity||ready.wid!==wid) throw new Error('READY identity mismatch: current generation does not match the audited runtime inputs');
   validateCLIReady(ready); const files={patched:path.join(generationPath,'patched/claude'),patchelf:tools.patchelf,readelf:tools.readelf};
   for(const [i,file] of ready.glibcPaths.entries()) files[`glibc${i}`]=file;
   for(const [i,x] of ready.glibcLinks.entries()) { files[`glibcLink${i}`]=path.join(glibcLib,x.soname); files[`glibcMinLink${i}`]=path.join(generationPath,'glibc-min',x.soname); }
   const result=r.verifyGeneration({generationPath,ready,files,wrappers:[{key:'wrapperRun',path:path.join(shellRoot,ready.wrappers.run)},{key:'wrapperBash',path:path.join(shellRoot,ready.wrappers.bash)}]});
   process.stderr.write(`patchelf runtime verification passed (${result.checked.length} files)\n`); return;
 }
 if(!['launch-prep','hook-path'].includes(command)) throw new Error(`Unknown patchelf runtime command: ${command||'(missing)'}`);
 let x=resolve();
 if(!x) { prepare(); x=resolve(); }
 // Revalidate immediately before publishing paths to the shell launcher.
 if(!x) throw new Error('READY changed or failed validation before launch paths were published');
 const out=command==='hook-path'?[r.hookPath({run:x.wrapperMap.wrapperRun})]:Object.values(r.launchPrep({generationPath:x.generationPath,patchedPath:path.join(x.generationPath,'patched/claude'),glibcMinPath:path.join(x.generationPath,'glibc-min'),shellWrap:x.wrapperMap.wrapperBash,flockPath:tp.flock}));
 if(out.some(v=>/[\r\n]/.test(v))) throw new Error('unsafe output path'); process.stdout.write(out.join('\n')+'\n');
}
if(require.main===module){try{main();}catch(e){console.error(`patchelf runtime failed: ${e.message||e}`);process.exitCode=1;}}
module.exports={main};
