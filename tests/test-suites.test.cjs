const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function setup() {
  const context = vm.createContext({URL, URLSearchParams, document:{addEventListener(){}}, esc:s=>String(s).replaceAll('<','&lt;')});
  vm.runInContext(fs.readFileSync(path.join(root,'test-suites.js'),'utf8'),context);
  return code=>vm.runInContext(code,context);
}
test('MeterSphere links preserve project/module and remove pasted punctuation',()=>{
  const run=setup();
  const result=run("normalizeSuiteUrl('http://metersphere.example/#/track/case/all?projectId=p1&moduleId=root；')");
  assert.equal(result.projectId,'p1');
  assert.equal(result.url,'http://metersphere.example/#/track/case/all?projectId=p1&moduleId=root');
  for(const url of ['javascript:alert(1)','https://example.org/','http://user:password@example.org/?projectId=p1']) {
    assert.throws(()=>run('normalizeSuiteUrl('+JSON.stringify(url)+')'));
  }
});
test('new versions have no implicit suites; explicit empty bindings are respected',()=>{
  const run=setup();
  assert.equal(run("versionSuiteIds({id:'new'}).length"),0);
  assert.equal(run("versionSuiteIds({id:'and-082'}).length"),1);
  assert.equal(run("versionSuiteIds({id:'and-082',systemSuiteIds:[]}).length"),0);
});
test('system execution requires at least one suite bound to its version',()=>{
  const run=setup();
  assert.throws(()=>run("captureSystemSuites({id:'and-082'},[])"),/至少/);
  assert.throws(()=>run("captureSystemSuites({id:'new'},['SUITE-001'])"),/未绑定/);
  assert.throws(()=>run("captureSystemSuites({id:'and-082'},['missing'])"),/失效/);
});
test('multiple selected suites are snapshotted and do not import developer cases',()=>{
  const run=setup();
  run("systemTestSuites.push({...systemTestSuites[0],id:'SUITE-002',name:'第二套'}); var v={id:'new',systemSuiteIds:['SUITE-001','SUITE-002']}; var r={build:2};applySystemSuiteRun(r,captureSystemSuites(v,v.systemSuiteIds));");
  assert.equal(run('r.suiteSnapshot.length'),2);
  assert.equal(run('r.cases.length'),2);
  assert.equal(run('r.testKind'),'system');
  assert.equal(run('r.sync'),'未连接 MeterSphere');
  run("systemTestSuites[0].name='changed';systemTestSuites[0].url='https://example.org/?projectId=changed';v.systemSuiteIds=[];");
  assert.equal(run('r.suiteSnapshot[0].name'),'云游戏系统测试');
  assert.equal(run('r.suiteSnapshot[0].projectId'),'6139b0b6-42e1-4a26-8893-ea4517634689');
  assert.equal(run("r.cases.every(c=>c.status==='未执行'&&c.id.startsWith('SIM-SUITE-'))"),true);
});
test('all inline scripts parse and local suite script loads before callers',()=>{
  const html=fs.readFileSync(path.join(root,'ai-dev-pipeline-prototype.html'),'utf8');
  for(const [,script] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script);
  assert.ok(html.indexOf('src="test-suites.js"')<html.indexOf('<script>'));
  assert.ok(html.includes('systemSuiteIds:selectedSuiteIds(\'version-suite\')'));
  assert.ok(!html.includes('发起自动化测试'));
});
