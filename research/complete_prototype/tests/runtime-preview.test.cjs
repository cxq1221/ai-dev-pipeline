const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Store, defaults, validateConfig, view} = require('../runtime-preview-core.js');

function fixture(platform='Web',ready=true) {
  const queue=[],snapshots=[];
  const store=new Store(s=>snapshots.push(s),(fn,ms)=>queue.push({fn,ms}));
  const state=store.ensure({requirement:'REQ-101',platform,title:'弱网提示',config:defaults(platform),serviceIds:['sdk'],ready});
  const flush=()=>{let count=0;while(queue.length){if(++count>100)throw Error('unexpected rescheduling');queue.sort((a,b)=>a.ms-b.ms);queue.shift().fn();}};
  return {store,state,queue,snapshots,flush,key:state.key};
}
test('runtime identity is requirement + platform, not conversation or window',()=>{
  const f=fixture();
  assert.equal(f.store.ensure({requirement:'REQ-101',platform:'Web'}),f.state);
  const other=f.store.ensure({requirement:'REQ-101',platform:'iOS',config:defaults('iOS')});
  assert.notEqual(other,f.state);
  f.store.action(f.key,'play');
  assert.equal(other.screen.page,'lobby');
  assert.equal(f.state.screen.page,'game');
});
test('native code changes wait for explicit compile/restart; hot updates preserve interaction',()=>{
  for(const platform of ['iOS','Android','Windows','macOS','Web']) {
    const f=fixture(platform);
    f.store.action(f.key,'play');f.store.action(f.key,'text','保留输入');
    f.store.codeChanged(f.key);
    if(platform!=='Web'){
      assert.equal(f.state.status,'running');assert.equal(f.queue.length,0);assert.equal(f.state.revision,1);
      f.store.action(f.key,'reload');
    } else assert.equal(f.state.status,'loading');
    f.flush();
    assert.equal(f.state.revision,2);assert.equal(f.state.needsReload,false);
    assert.equal(f.state.screen.page,platform==='Web'?'game':'lobby');
    assert.equal(f.state.screen.text,platform==='Web'?'保留输入':'');
  }
});
test('stop invalidates in-flight compilation; restart uses current code',()=>{
  const f=fixture('iOS',false);
  f.store.action(f.key,'start');f.store.stop(f.key);f.flush();
  assert.equal(f.state.status,'stopped');assert.equal(f.state.revision,0);
  f.store.codeChanged(f.key);assert.equal(f.queue.length,0);
  f.store.action(f.key,'reload');f.flush();assert.equal(f.state.status,'running');assert.equal(f.state.revision,2);
});
test('failed builds preserve last runtime and can retry',()=>{
  const f=fixture('iOS');
  f.store.action(f.key,'play');f.store.codeChanged(f.key);f.store.action(f.key,'fail');f.flush();
  assert.equal(f.state.status,'error');assert.equal(f.state.revision,1);assert.equal(f.state.screen.page,'game');
  f.store.action(f.key,'reload');f.flush();
  assert.equal(f.state.status,'running');assert.equal(f.state.revision,2);assert.equal(f.state.error,'');
});
test('configuration edits during a build stay pending until explicit reload',()=>{
  const f=fixture();
  f.store.codeChanged(f.key);
  f.store.configure('sdk',{...f.state.config,host:'web-dev-02'});
  f.flush();assert.equal(f.state.needsReload,true);assert.equal(f.state.config.host,'linux-dev-01');
  f.store.codeChanged(f.key);assert.equal(f.queue.length,0);
  f.store.action(f.key,'reload');f.flush();
  assert.equal(f.state.config.host,'web-dev-02');assert.equal(f.state.needsReload,false);
});
test('edits arriving during hot update reach newest revision without a control lock',()=>{
  const f=fixture();
  f.store.codeChanged(f.key);f.store.codeChanged(f.key);
  f.store.action(f.key,'play');f.store.action(f.key,'right');f.store.action(f.key,'ai');f.store.action(f.key,'text','用户和 AI');
  f.flush();
  assert.equal(f.state.revision,3);assert.equal(f.state.screen.steps,1);assert.equal(f.state.screen.latency,24);
  assert.equal(f.state.screen.text,'用户和 AI');assert.equal(f.state.screen.page,'game');
  assert.equal(f.snapshots[0].screen.page,'lobby','published snapshots are immutable');
});
test('display-only configuration rejects executable URLs and embedded credentials',()=>{
  const config=defaults('iOS');assert.equal(config.machine,'macOS');assert.equal(config.hotReload,false);
  for(const url of ['javascript:alert(1)','file:///tmp/a','https://user:pass@example.com'])assert.throws(()=>validateConfig({...config,appUrl:url}));
  assert.throws(()=>validateConfig({...config,host:''}));
  assert.equal(validateConfig({...config,appUrl:'https://preview.example.com'}).appUrl,'https://preview.example.com/');
  const f=fixture();f.state.config.name='<script>fake</script>';
  assert.ok(!view(f.state).includes('<script>fake</script>'));assert.ok(view(f.state).includes('&lt;script&gt;'));
});
test('preview entrypoints include existing local runtime files and all scripts parse',()=>{
  const root=path.join(__dirname,'..');
  for(const file of ['ai-dev-pipeline-prototype.html','runtime-preview.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    for(const m of html.matchAll(/(?:src|href)="(runtime-preview[^"?#]+)"/g))assert.ok(fs.existsSync(path.join(root,m[1])),m[1]);
  }
  for(const file of ['runtime-preview-core.js','runtime-preview.js','runtime-preview-window.js'])new Function(fs.readFileSync(path.join(root,file),'utf8'));
});
