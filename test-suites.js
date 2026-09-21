// Prototype metadata only: no requests to MeterSphere and no imported test cases.
const systemTestSuites = [{
  id: 'SUITE-001', name: '云游戏系统测试', description: '版本级系统回归；关联 MeterSphere 项目用例。',
  url: 'http://metersphere.cloudgame.vrviu.com:8081/#/track/case/all?projectId=6139b0b6-42e1-4a26-8893-ea4517634689&moduleId=root',
  projectId: '6139b0b6-42e1-4a26-8893-ea4517634689'
}];
function normalizeSuiteUrl(value) {
  const url = new URL(value.trim().replace(/[；;]+$/, ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请使用不含账号密码的 HTTP / HTTPS 地址');
  const params = new URLSearchParams(url.hash.split('?')[1] || url.search.slice(1));
  const projectId = params.get('projectId');
  if (!projectId || !projectId.trim()) throw new Error('链接必须包含 MeterSphere projectId');
  return {url: url.href, projectId};
}
function suiteLink(s) { return '<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">MeterSphere 项目用例 ↗</a>'; }
function versionSuiteIds(v) { return v?.systemSuiteIds || (v?.id === 'and-082' ? ['SUITE-001'] : []); }
function suiteChoices(name, ids, available = systemTestSuites) {
  return available.length ? '<div class="resource-checks" style="display:grid;gap:10px">'+available.map(s=>'<label style="display:flex;align-items:center;gap:8px"><input style="width:auto;margin:0" type="checkbox" name="'+name+'" value="'+esc(s.id)+'" '+(ids.includes(s.id)?'checked':'')+'><span>'+esc(s.name)+'</span></label>').join('')+'</div>' : '<p class="trace-note">暂无绑定的用例集，请先在测试资源维护用例集并绑定到版本。</p>';
}
function selectedSuiteIds(name) { return [...document.querySelectorAll('[name="'+name+'"]:checked')].map(x=>x.value); }
function resourceTabs() {
  return '<div class="resource-tabs" role="tablist" aria-label="测试资源分类">'+[['environments','测试环境'],['devices','测试设备'],['suites','测试用例集']].map(([id,label])=>'<button role="tab" aria-selected="'+(resourceUI.tab===id)+'" data-resource-action="tab" data-value="'+id+'" class="'+(resourceUI.tab===id?'active':'')+'">'+label+'</button>').join('')+'</div>';
}
function systemSuitesPage() {
  const list=systemTestSuites.filter(s=>(s.name+' '+s.description+' '+s.projectId).toLowerCase().includes(resourceUI.query.toLowerCase()));
  return heading('SETTINGS / TEST RESOURCES','测试资源','开发测试验证单次修改；系统测试验证版本候选包。','<button class="primary" data-system-suite="new">＋ 新增用例集</button>')+resourceTabs()+
    '<div class="resource-toolbar"><input id="suite-query" aria-label="搜索测试用例集" placeholder="名称 / 项目 ID" value="'+esc(resourceUI.query)+'"><button data-system-suite="search">搜索</button></div><div class="table-wrap"><table class="resource-table"><thead><tr><th>系统测试用例集</th><th>MeterSphere 项目</th><th>绑定版本</th><th>操作</th></tr></thead><tbody>'+list.map(s=>'<tr><td><strong>'+esc(s.name)+'</strong><small>'+esc(s.description)+'</small></td><td>'+suiteLink(s)+'<small>'+esc(s.projectId)+'</small></td><td>'+versions.filter(v=>versionSuiteIds(v).includes(s.id)).map(v=>esc(v.platform+' '+v.name)).join('、')+'</td><td><button data-system-suite="edit" data-id="'+s.id+'">编辑</button></td></tr>').join('')+'</tbody></table></div>'+(!list.length?'<p class="empty">暂无用例集</p>':'')+'<p class="trace-note">只维护项目用例链接，不同步真实用例或触发 MeterSphere；模拟配置刷新后恢复。</p>';
}
function openSystemSuiteEditor(id) {
  const s=systemTestSuites.find(x=>x.id===id);
  openModal(s?'编辑系统测试用例集':'新增系统测试用例集','<label>用例集名称<input id="suite-name" value="'+esc(s?.name||'')+'"></label><label>说明<textarea id="suite-description">'+esc(s?.description||'')+'</textarea></label><label>MeterSphere 项目用例链接<input id="suite-url" value="'+esc(s?.url||'')+'" placeholder="http://…/#/track/case/all?projectId=…&moduleId=root"></label><p class="trace-note">一个用例集关联一个项目用例链接；项目 ID 从链接中识别。</p><p id="suite-error" class="resource-error" role="alert"></p>','<div class="dialog-footer"><button data-action="close">取消</button><button class="primary" data-system-suite="save" data-id="'+(id||'')+'">保存</button></div>');
}
function openVersionSuiteBindings(v) {
  openModal('绑定系统测试用例集',suiteChoices('version-suite',versionSuiteIds(v))+'<p class="trace-note">可绑定多个用例集；发起系统测试时再选择本次执行范围。修改绑定不改变历史执行快照。</p>','<div class="dialog-footer"><button data-action="close">取消</button><button class="primary" data-system-suite="bind-save" data-id="'+v.id+'">保存</button></div>');
}
function versionSystemSuitePanel(v) {
  const suites=systemTestSuites.filter(s=>versionSuiteIds(v).includes(s.id));
  return '<div class="panel"><div class="row between"><h2>系统测试用例集</h2><button data-system-suite="bind" data-id="'+v.id+'" '+(v.published?'disabled':'')+'>绑定用例集</button></div><p class="trace-note">开发测试针对单次代码修改；这里针对版本候选包执行系统测试，两类结果不互相替代。</p>'+(suites.length?suites.map(s=>'<div class="check"><strong>'+esc(s.name)+'</strong>'+suiteLink(s)+'</div>').join(''):'<p>尚未绑定用例集，请先绑定再发起系统测试。</p>')+'</div>';
}
function runSuiteFields(v,parent) {
  const available=systemTestSuites.filter(s=>versionSuiteIds(v).includes(s.id));
  const selected=parent?.suiteSnapshot?.map(s=>s.id)||available.map(s=>s.id);
  return '<fieldset><legend>系统测试用例集（至少选择一个）</legend>'+suiteChoices('run-suite',selected,available)+'</fieldset><p class="trace-note">仅执行本次勾选的用例集。当前只模拟执行，不会读取或运行真实 MeterSphere 用例。</p>';
}
function captureSystemSuites(v,ids) {
  if(!ids.length)throw new Error('请至少选择一个系统测试用例集');
  const suites=ids.map(id=>systemTestSuites.find(s=>s.id===id&&versionSuiteIds(v).includes(id)));
  if(suites.some(s=>!s))throw new Error('用例集已失效或未绑定到当前版本，请重新选择');
  return JSON.parse(JSON.stringify(suites));
}
function applySystemSuiteRun(r,suites) {
  r.testKind='system';r.suiteSnapshot=suites;r.baseline=suites.map(s=>s.name).join('、');
  r.cases=suites.map((s,i)=>({id:'SIM-SUITE-'+(i+1),name:s.name+' · 模拟执行占位',suiteId:s.id,type:'系统测试',input:'候选包 build '+r.build,expected:'关联用例集执行完成（模拟）',ac:'版本系统回归',status:'未执行',duration:'—',attempts:[],actual:'尚未执行；未导入真实用例'}));
  r.sync='未连接 MeterSphere';
}
function systemSuiteReport(r) {
  const snapshot='<div class="panel"><h2>系统测试 · 用例集快照</h2><p>本次执行 '+r.suiteSnapshot.length+' 个用例集 · 候选包 build '+r.build+'</p>'+r.suiteSnapshot.map(s=>'<div class="check"><span><strong>'+esc(s.name)+'</strong><small>'+esc(s.description)+'</small></span>'+suiteLink(s)+'</div>').join('')+'<p class="trace-note">以下为用例集级模拟占位，不是 MeterSphere 真实用例或结果；开发测试不计入本报告。</p></div>';
  if(runUI.tab==='环境与制品')return snapshot;
  if(runUI.tab==='历史与同步')return snapshot+'<div class="panel"><h2>历史与同步</h2><p>未连接 MeterSphere，未同步执行结果。</p><p>上次执行：'+(r.parent?'<a href="#/test-runs/'+encodeURIComponent(r.parent)+'">'+esc(r.parent)+'</a>':'无')+'</p></div>';
  if(runUI.tab==='缺陷与追溯')return snapshot+'<div class="panel"><p>当前为用例集执行演示，尚未关联真实缺陷。</p></div>';
  return snapshot+'<div class="panel"><h2>'+esc(runUI.tab)+'</h2><div class="table-wrap"><table><thead><tr><th>用例集执行（模拟）</th><th>状态</th><th>说明</th></tr></thead><tbody>'+r.cases.map(c=>'<tr><td>'+esc(c.name)+'</td><td>'+esc(c.status)+'</td><td>'+esc(c.status==='未执行'?'等待模拟执行':'模拟结果，非真实测试结论')+'</td></tr>').join('')+'</tbody></table></div></div>';
}
document.addEventListener('click',e=>{
  const button=e.target.closest('[data-system-suite]'); if(!button)return;
  e.preventDefault();e.stopImmediatePropagation(); const {systemSuite:action,id}=button.dataset;
  if(action==='new'||action==='edit')return openSystemSuiteEditor(id);
  if(action==='search'){resourceUI.query=$('#suite-query').value.trim();render();return;}
  if(action==='bind')return openVersionSuiteBindings(versions.find(v=>v.id===id));
  if(action==='bind-save'){const v=versions.find(v=>v.id===id);if(!v||v.published)return;v.systemSuiteIds=selectedSuiteIds('version-suite');$('#modal').close();render();return;}
  if(action==='save'){
    try{
      const name=$('#suite-name').value.trim();if(!name)throw new Error('请填写用例集名称');
      const data={name,description:$('#suite-description').value.trim(),...normalizeSuiteUrl($('#suite-url').value)};
      const old=systemTestSuites.find(s=>s.id===id);
      if(old)Object.assign(old,data);else systemTestSuites.push({id:'SUITE-'+Date.now(),...data});
      $('#modal').close();render();
    }catch(error){$('#suite-error').textContent=error.message;}
  }
},true);
