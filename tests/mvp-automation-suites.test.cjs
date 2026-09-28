const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Inert DOM objects exercise model/state contracts, not browser or visual behavior.
function setup(hash = '#/test-cases') {
  const html = fs.readFileSync(path.join(__dirname, '../ai-dev-pipeline-mvp-v2.html'), 'utf8');
  const source = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)][0][1];
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      innerHTML: '', textContent: '', value: '', hidden: false, open: false,
      focus() {}, scrollIntoView() {},
      showModal() { this.open = true; }, close() { this.open = false; }
    });
    return nodes.get(selector);
  };
  const timers = new Map();
  let serial = 0, clock = 0;
  const location = { hash };
  const context = vm.createContext({
    console, URL, location,
    document: { querySelector: node, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, scrollTo() {} },
    history: { replaceState(_state, _title, hash) { location.hash = hash; } },
    setTimeout(fn, delay) { const id = ++serial; timers.set(id, { fn, due: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  const exposed = source.replace(
    'window.addEventListener(\'hashchange\',readMvpRoute);\nreadMvpRoute();',
    'globalThis.app={store,ui,libraryUi,suiteLibrary,suiteSources,createSuiteFromDraft,' +
    'setDraft(value){suiteDraft=value},convertCases,runLibraryTest,render,readMvpRoute,' +
    'renderSuiteHome,renderSuiteDetail,renderAutomationCase,detailedTestReport,' +
    'openReq,backPool,openLibrary,selectedLibrarySuite}; readMvpRoute();'
  );
  assert.notEqual(exposed, source, 'test export anchor must exist');
  vm.runInContext(exposed, context);
  function flush() {
    let count = 0;
    while (timers.size) {
      assert.ok(count++ < 100, 'conversion must eventually finish');
      const [id, item] = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      timers.delete(id); clock = item.due; item.fn();
    }
  }
  function create(sourceIndex = 0, caseIndices = [0, 1], fail = false) {
    const s = context.app.suiteSources[sourceIndex];
    context.app.setDraft({
      sourceId: s.id, name: '自选自动化用例集',
      selected: new Set(caseIndices.map(i => s.cases[i].id)), fail
    });
    context.app.createSuiteFromDraft();
    return context.app.suiteLibrary[0];
  }
  function execute(suite, failed = false, req = 'REQ-101') {
    const app = context.app;
    app.ui.req = req; app.ui.page = 'detail'; app.ui.tab = '测试';
    app.ui.build = 2; app.ui.testRunId = null; app.ui.testSuiteId = suite.id;
    node('#suite-select').value = suite.id;
    node('#env-select').value = '示例环境';
    node('#device-select').value = '示例设备';
    app.runLibraryTest(failed);
    return app.store.find(r => r.id === req).builds.find(b => b.n === 2).tests.at(-1);
  }
  return { app: context.app, nodes, node, flush, create, execute, location };
}

test('conversion appears immediately, preserves source selection, and becomes directly usable', () => {
  const h = setup(), suite = h.create(0, [0, 2]);
  assert.equal(h.app.ui.page, 'test-cases');
  assert.equal(h.app.libraryUi.suiteId, null);
  assert.equal(suite.busy, true);
  assert.equal(suite.cases.length, 2);
  assert.equal(suite.cases[0].state, 'converting');
  assert.equal(suite.cases[1].state, 'queued');
  assert.equal(suite.cases[1].source.id, h.app.suiteSources[0].cases[2].id);
  h.flush();
  assert.equal(suite.busy, false);
  assert.ok(suite.cases.every(c => c.state === 'ready' && c.output.script));
  const run = h.execute(suite);
  assert.equal(run.suiteId, suite.id);
  assert.equal(run.cases.length, 2);
  assert.equal(run.result, '通过');
});

test('a failed conversion retries independently without altering successful output', () => {
  const h = setup(), suite = h.create(1, [0, 1], true);
  h.flush();
  assert.equal(suite.cases[1].state, 'failed');
  assert.equal(suite.cases[1].output, null);
  const successful = JSON.stringify(suite.cases[0].output);
  const partial = h.execute(suite);
  assert.equal(partial.cases.length, 1);
  assert.equal(partial.suiteSnapshot.notExecuted.length, 1);
  assert.match(partial.aiReport.summary, /未参与本次执行/);
  h.app.convertCases(suite, [suite.cases[1].id]);
  h.flush();
  assert.equal(suite.cases[1].state, 'ready');
  assert.equal(JSON.stringify(suite.cases[0].output), successful);
  assert.equal(h.execute(suite).cases.length, 2);
});

test('regeneration changes future executions while historical source, scripts and reports stay intact', () => {
  const h = setup(), suite = h.app.suiteLibrary[0];
  const oldRun = h.execute(suite);
  const original = JSON.stringify(oldRun);
  const c = suite.cases[0], source = h.app.suiteSources[0].cases[0];
  c.note = '补充检查：继续进入后的游戏画面应可见';
  source.steps[0].expected = '新的源用例预期';
  assert.notEqual(c.output.steps[0].expected, source.steps[0].expected, 'source changes need manual conversion');
  h.app.convertCases(suite, [c.id]); h.flush();
  assert.equal(c.output.steps.at(-1).expected, c.note);
  assert.equal(c.output.steps[0].expected, source.steps[0].expected);
  assert.equal(JSON.stringify(oldRun), original);
  const next = h.execute(suite);
  assert.notEqual(next.id, oldRun.id);
  assert.match(next.cases[0].script, /补充检查/);
  assert.equal(JSON.stringify(oldRun), original);
});

test('one suite is reused by multiple requirements and selection determines executed cases', () => {
  const h = setup(), suite = h.app.suiteLibrary[1];
  const first = h.execute(suite, true);
  const secondReq = h.app.store[1];
  secondReq.builds = [JSON.parse(JSON.stringify(h.app.store[0].builds[1]))];
  secondReq.builds[0].tests = [];
  const second = h.execute(suite, false, secondReq.id);
  assert.equal(first.suiteId, second.suiteId);
  assert.equal(first.cases.length, 3);
  assert.deepEqual(Array.from(first.cases, c => c.name), Array.from(suite.cases, c => c.source.name));
  assert.match(first.id, /REQ-101/);
  assert.match(second.id, /REQ-102/);
  assert.equal(first.cases.filter(c => c.status === '失败').length, 1);
  assert.equal(second.cases.filter(c => c.status === '失败').length, 0);
  assert.notEqual(first.suiteSnapshot, second.suiteSnapshot);
});

test('seeded case deep links render and library navigation preserves requirement routes', () => {
  const h = setup('#/test-cases/AUTO-SUITE-001/AUTO-MS-NET-1');
  assert.equal(h.app.ui.page, 'test-cases');
  assert.match(h.node('#content').innerHTML, /MeterSphere 原始用例/);
  assert.match(h.node('#content').innerHTML, /自动化脚本/);
  h.app.openReq('REQ-102');
  assert.equal(h.app.ui.page, 'detail');
  assert.match(h.node('#top-title').textContent, /REQ-102/);
  assert.match(h.location.hash, /REQ-102/);
  h.app.backPool();
  assert.equal(h.app.ui.page, 'pool');
  h.app.openLibrary();
  assert.equal(h.location.hash, '#/test-cases');
});

test('empty selection and blank names do not create suites; user text renders escaped', () => {
  const h = setup(), size = h.app.suiteLibrary.length, source = h.app.suiteSources[0];
  h.app.setDraft({ sourceId: source.id, name: '空集', selected: new Set(), fail: false });
  h.app.createSuiteFromDraft();
  assert.equal(h.app.suiteLibrary.length, size);
  h.app.setDraft({ sourceId: source.id, name: '  ', selected: new Set([source.cases[0].id]), fail: false });
  h.app.createSuiteFromDraft();
  assert.equal(h.app.suiteLibrary.length, size);
  const suite = h.app.suiteLibrary[0], c = suite.cases[0];
  suite.name = '<img src=x onerror=alert(1)>';
  c.note = '<script>alert(1)</script>';
  h.app.convertCases(suite, [c.id]); h.flush();
  const page = h.app.renderAutomationCase(suite, c);
  assert.ok(!page.includes('<script>alert(1)</script>'));
  assert.ok(page.includes('&lt;script&gt;'));
  assert.ok(h.app.renderSuiteHome().includes('&lt;img'));
});

test('report details show chosen-suite coverage and the execution-time script', () => {
  const h = setup(), suite = h.app.suiteLibrary[2], run = h.execute(suite);
  h.app.ui.testRunId = run.id;
  h.app.ui.testDetailTab = 'overview';
  const overview = h.app.detailedTestReport(h.app.store[0]);
  assert.ok(overview.includes(suite.cases[0].source.name));
  assert.ok(!overview.includes('覆盖 24ms'));
  h.app.ui.testDetailTab = 'cases';
  h.app.ui.testCaseId = run.cases[0].id;
  const detail = h.app.detailedTestReport(h.app.store[0]);
  assert.ok(detail.includes('查看执行时的自动化脚本'));
  assert.ok(detail.includes('test_ms_recover_1'));
});
