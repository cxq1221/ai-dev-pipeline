// Prototype metadata only: no requests to MeterSphere and no imported test cases.
const systemTestSuites = [{
  id: 'SUITE-001', name: '云游戏系统测试', description: '版本级系统回归；关联 MeterSphere 项目用例。',
  url: 'http://metersphere.cloudgame.vrviu.com:8081/#/track/case/all?projectId=6139b0b6-42e1-4a26-8893-ea4517634689&moduleId=root',
  projectId: '6139b0b6-42e1-4a26-8893-ea4517634689'
}, ...[
  ['SUITE-002', 'Android SDK 接入与兼容性', '初始化、鉴权、启动与退出；Android 系统版本、机型和横竖屏兼容。'],
  ['SUITE-003', 'iOS SDK 接入与兼容性', '初始化、会话生命周期、前后台切换、系统权限与设备适配。'],
  ['SUITE-004', '云游戏弱网与重连', '延迟、丢包、网络切换、断线恢复，以及弱网提示与继续游戏。'],
  ['SUITE-005', '音视频与串流体验', '首帧、画面清晰度、音画同步、分辨率切换与长时间串流稳定性。'],
  ['SUITE-006', '手柄编辑平台 Web 回归', '布局编辑、按键映射、配置保存与导入导出；浏览器兼容性。'],
  ['SUITE-007', '星云 POC 平台端到端', '登录、游戏列表、启动排队、进入游戏、退出与异常恢复。'],
  ['SUITE-008', 'cg-session 会话服务', '会话创建、资源分配、心跳、超时回收与重复请求幂等性。'],
  ['SUITE-009', 'cg-boss 业务后台', '业务配置、账号权限、配置生效、数据查询与操作审计。'],
  ['SUITE-010', 'IaaS 资源调度与实例生命周期', '实例创建、启动、停止、资源不足处理、回收与状态一致性。'],
  ['SUITE-011', '存储与游戏存档', '存档读写、挂载、上传下载、版本恢复与跨会话数据一致性。'],
  ['SUITE-012', '多业务线隔离与配置回归', '自建、原力、IaaS、咪咕、云电竞的配置隔离、访问边界与差异化流程。']
].map(([id,name,description])=>({id,name,description,url:'',projectId:''}))];
// Local, read-only examples; these IDs and results do not come from MeterSphere.
const suiteCaseExamples = [
 [
  ['正常网络启动游戏','P0','使用有效账号登录，选择可用游戏并启动。','进入游戏画面，输入与声音正常，无弱网提示。'],
  ['80ms 弱网提示边界','P0','分别将测试网络延迟设置为 79ms、80ms、81ms，再打开启动页。','79ms 和 80ms 不提示；81ms 显示弱网提示。'],
  ['弱网提示后继续进入','P0','将延迟设置为 126ms，看到提示后点击继续。','仍可进入游戏，提示不阻断启动流程。'],
  ['网络断开后恢复连接','P0','游戏中断网，恢复网络后选择重连。','明确显示连接状态；恢复原会话，不重复创建实例。'],
  ['退出游戏释放会话','P0','进入游戏后主动退出，再查询会话与资源状态。','客户端回到列表，会话结束，分配的资源按策略释放。'],
  ['启动失败后的再次尝试','P1','模拟首次启动失败，恢复服务后点击重试。','展示可理解的错误原因，重试成功且无重复会话。'],
  ['前后台切换恢复体验','P1','游戏中切到后台，再返回前台。','按会话保活策略恢复画面、声音和操作状态。'],
  ['设置页版本与诊断信息','P2','打开设置页，读取 SDK 版本并复制诊断编号。','版本与当前候选包一致，诊断编号可复制且不含凭据。']
 ],
 [
  ['SDK 初始化与重复调用','P0','使用有效配置初始化 SDK，再次调用初始化。','初始化成功；重复调用不会创建重复连接或导致崩溃。'],
  ['无效凭据接入','P0','使用过期凭据启动游戏。','返回明确鉴权错误，不建立可操作的游戏会话。'],
  ['横竖屏切换','P1','进入游戏后旋转设备，重复切换横竖屏。','画面比例、触点映射与虚拟按键位置保持正确。'],
  ['Android 机型兼容','P1','在配置的 Android 机型矩阵运行登录、启动和退出流程。','各机型完成主流程，无崩溃、黑屏或界面遮挡。']
 ],
 [
  ['iOS 首次接入','P0','安装候选包，使用有效配置初始化并启动会话。','初始化完成，进入游戏且回调顺序符合接入约定。'],
  ['拒绝麦克风权限','P1','首次启动语音时拒绝授权，再返回游戏。','显示权限说明，游戏仍可继续，不反复强制弹窗。'],
  ['锁屏后恢复','P1','游戏过程中锁屏，解锁后返回应用。','根据保活状态恢复会话或提示重新连接。'],
  ['安全区域适配','P1','在不同屏幕尺寸的设备检查横竖屏操作区。','按键不被刘海、圆角或系统手势区域遮挡。']
 ],
 [
  ['高延迟提示','P0','逐步提高网络延迟，观察提示与操作反馈。','按产品阈值展示提示，仍允许用户自主继续。'],
  ['丢包下画面恢复','P1','施加测试丢包后恢复正常网络。','异常有状态提示；网络恢复后画面逐步恢复。'],
  ['Wi-Fi 与蜂窝网络切换','P0','游戏中从 Wi-Fi 切换蜂窝网络再切回。','连接恢复后继续原会话，不丢失退出入口。'],
  ['连续重连去重','P1','断网后多次点击重连，再恢复网络。','只保留一次有效恢复流程，无重复计时或会话。']
 ],
 [
  ['首帧输出','P0','从点击启动到出现可交互画面记录时间。','成功出首帧，记录耗时并对照该版本验收基线。'],
  ['音画同步','P1','播放带明显声画事件的测试场景。','声音与画面同步，差值满足所选测试基线。'],
  ['分辨率切换','P1','在游戏中切换支持的分辨率与画质档位。','画面恢复正常，输入坐标不偏移，音频不中断。'],
  ['长时间串流','P1','按测试计划持续运行并采集画面、音频和资源指标。','无持续黑屏或无声，指标满足约定稳定性基线。']
 ],
 [
  ['布局编辑与保存','P0','添加按键、拖动位置，保存后重新打开布局。','位置、大小和映射与保存前一致。'],
  ['撤销与重做','P1','连续修改多个控件，依次撤销再重做。','每一步准确恢复，不修改未选中的控件。'],
  ['配置导入导出','P0','导出有效布局，再导入空白工程；另导入无效文件。','有效布局可还原；无效文件有提示且不覆盖现有数据。'],
  ['浏览器缩放适配','P1','在支持的浏览器中改变缩放比例并拖动控件。','画布显示与鼠标坐标一致，主要操作入口可见。']
 ],
 [
  ['登录与游戏列表','P0','使用测试账号登录，打开游戏列表。','仅展示账号可访问的游戏，列表加载状态明确。'],
  ['排队与取消','P0','在资源不足时启动游戏，进入排队后取消。','排队进度可见；取消后不再分配实例。'],
  ['从列表进入游戏','P0','选择可用游戏，完成启动、交互和退出。','端到端主流程可用，退出后列表状态正确。'],
  ['服务异常反馈','P1','模拟启动接口超时，恢复服务后再次启动。','出现可重试的提示；恢复后成功进入游戏。']
 ],
 [
  ['创建会话与资源分配','P0','提交有效创建请求，查询会话与实例关联。','建立唯一会话，并绑定符合条件的实例。'],
  ['重复创建幂等','P0','使用相同幂等标识重复提交创建请求。','返回同一有效会话，不重复占用资源。'],
  ['心跳超时回收','P0','停止心跳并等待配置的超时周期。','会话进入终止状态，资源按策略释放。'],
  ['资源不足响应','P1','在无可用实例时请求创建会话。','返回资源不足或排队状态，不留下孤立会话。']
 ],
 [
  ['业务配置生效','P0','修改测试业务配置，保存后验证对应业务行为。','配置按约定生效，其他业务配置不受影响。'],
  ['只读账号权限','P0','使用只读账号尝试修改业务配置。','界面与接口均拒绝写入，原配置保持不变。'],
  ['查询过滤与分页','P1','组合业务线、时间和状态条件，逐页查询。','结果符合筛选条件，无分页重复或遗漏。'],
  ['关键操作审计','P1','执行一次配置变更并查看审计记录。','记录操作者、时间与变更内容，不泄露敏感凭据。']
 ],
 [
  ['实例创建与启动','P0','提交满足资源条件的实例创建请求并启动。','实例状态正确流转，运行资源满足申请规格。'],
  ['实例停止与回收','P0','停止运行实例并发起回收。','实例停止，资源占用与管理状态一致。'],
  ['资源容量不足','P1','提交超出可用容量的申请。','明确拒绝或排队，不出现部分分配后长期悬挂。'],
  ['并发调度一致性','P0','并发申请同一资源池中的剩余容量。','无超分配，同一资源不同时归属多个实例。']
 ],
 [
  ['存档写入与再次读取','P0','写入测试存档，退出会话后重新进入读取。','存档内容完整，进度与保存结果一致。'],
  ['挂载失败处理','P0','模拟存储挂载失败，再恢复存储服务。','不以空目录覆盖存档；明确失败并支持安全重试。'],
  ['上传中断恢复','P1','在存档上传中断开网络，恢复后重试。','不会将不完整文件标记为成功，重试后校验一致。'],
  ['不同账号存档隔离','P0','两个测试账号分别保存并读取同一游戏进度。','各自只能读写自己的存档，不能访问其他账号数据。']
 ],
 [
  ['业务参数正确路由','P0','分别使用各业务线的测试 biz 和环境参数启动。','请求进入对应测试环境，不串用其他业务配置。'],
  ['跨业务凭据拒绝','P0','将业务 A 的测试凭据用于业务 B 的请求。','鉴权失败且不返回业务 B 的敏感数据。'],
  ['差异化功能开关','P1','对照各业务配置检查功能开关与界面入口。','仅开放本业务启用的功能，关闭功能不可绕过调用。'],
  ['单业务变更隔离','P1','修改一个业务的测试配置，回归其他业务主流程。','变更仅影响目标业务，其他业务行为保持不变。']
 ]
];
function suiteExampleCases(id){
 const match=/^SUITE-(\d{3})$/.exec(id),rows=match?suiteCaseExamples[Number(match[1])-1]:null;
 return (rows||[]).map(([name,priority,steps,expected],i)=>({id:'DEMO-'+id+'-'+String(i+1).padStart(2,'0'),name,priority,steps,expected}));
}
function suiteExampleCaseTable(s){
 const cases=suiteExampleCases(s.id);
 return '<section class="panel"><div class="row between"><h2>预置测试用例 <span class="badge gray">'+cases.length+' 条 · 示例</span></h2></div><p class="trace-note">本地只读示例，未从 MeterSphere 同步，也没有实际执行。点击用例名称展开步骤与预期结果；不影响现有模拟测试报告。</p>'+(cases.length?'<div class="table-wrap"><table class="resource-table"><thead><tr><th>优先级</th><th>用例 / 步骤与预期</th><th>状态</th></tr></thead><tbody>'+cases.map(c=>'<tr><td><span class="badge '+(c.priority==='P0'?'amber':'gray')+'">'+c.priority+'</span></td><td style="max-width:none"><details><summary style="cursor:pointer"><strong>'+esc(c.name)+'</strong> <small style="display:inline">'+esc(c.id)+'</small></summary><div style="padding:10px 0;line-height:1.8"><p><strong>前置条件：</strong>使用隔离测试环境、候选包和测试账号；按场景准备相应设备、网络或服务配置。</p><p><strong>操作步骤：</strong>'+esc(c.steps)+'</p><p><strong>预期结果：</strong>'+esc(c.expected)+'</p></div></details></td><td>未执行</td></tr>').join('')+'</tbody></table></div>':'<p>此用例集暂无预置示例，请前往关联项目查看实际用例。</p>')+'</section>';
}
function normalizeSuiteUrl(value) {
  const url = new URL(value.trim().replace(/[；;]+$/, ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请使用不含账号密码的 HTTP / HTTPS 地址');
  const params = new URLSearchParams(url.hash.split('?')[1] || url.search.slice(1));
  const projectId = params.get('projectId');
  if (!projectId || !projectId.trim()) throw new Error('链接必须包含 MeterSphere projectId');
  return {url: url.href, projectId};
}
function suiteLink(s) { return s.url?'<a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">MeterSphere 项目用例 ↗</a>':'<span class="badge gray">待关联 MeterSphere · 预置示例</span>'; }
function versionSuiteIds(v) { return v?.systemSuiteIds || (v?.id === 'and-082' ? ['SUITE-001'] : []); }
function suiteChoices(name, ids, available = systemTestSuites) {
  return available.length ? '<div class="resource-checks" style="display:grid;gap:10px">'+available.map(s=>'<label style="display:flex;align-items:center;gap:8px"><input style="width:auto;margin:0" type="checkbox" name="'+name+'" value="'+esc(s.id)+'" '+(ids.includes(s.id)?'checked':'')+'><span>'+esc(s.name)+'</span></label>').join('')+'</div>' : '<p class="trace-note">暂无绑定的用例集，请先在测试资源维护用例集并绑定到版本。</p>';
}
function selectedSuiteIds(name) { return [...document.querySelectorAll('[name="'+name+'"]:checked')].map(x=>x.value); }
function resourceTabs() {
  return '<div class="resource-tabs" role="tablist" aria-label="测试资源分类">'+[['environments','测试环境'],['devices','测试设备'],['suites','测试用例集']].map(([id,label])=>'<button role="tab" aria-selected="'+(resourceUI.tab===id)+'" data-resource-action="tab" data-value="'+id+'" class="'+(resourceUI.tab===id?'active':'')+'">'+label+'</button>').join('')+'</div>';
}
function systemSuitesPage() {
  if(resourceUI.suiteId)return systemSuiteDetailPage(resourceUI.suiteId);
  const list=systemTestSuites.filter(s=>(s.name+' '+s.description+' '+s.projectId).toLowerCase().includes(resourceUI.query.toLowerCase()));
  return heading('SETTINGS / TEST RESOURCES','测试资源','开发测试验证单次修改；系统测试验证版本候选包。','<button class="primary" data-system-suite="new">＋ 新增用例集</button>')+resourceTabs()+
    '<div class="resource-toolbar"><input id="suite-query" aria-label="搜索测试用例集" placeholder="名称 / 项目 ID" value="'+esc(resourceUI.query)+'"><button data-system-suite="search">搜索</button></div><div class="table-wrap"><table class="resource-table"><thead><tr><th>系统测试用例集</th><th>MeterSphere 项目</th><th>绑定版本</th><th>操作</th></tr></thead><tbody>'+list.map(s=>'<tr><td><strong>'+esc(s.name)+'</strong><small>'+esc(s.description)+'</small></td><td>'+suiteLink(s)+'<small>'+esc(s.projectId)+'</small></td><td>'+versions.filter(v=>versionSuiteIds(v).includes(s.id)).map(v=>esc(v.platform+' '+v.name)).join('、')+'</td><td><button data-system-suite="detail" data-id="'+s.id+'">详情</button> <button data-system-suite="edit" data-id="'+s.id+'">编辑关联</button></td></tr>').join('')+'</tbody></table></div>'+(!list.length?'<p class="empty">暂无用例集</p>':'')+'<p class="trace-note">只维护项目用例链接，不同步真实用例或触发 MeterSphere；模拟配置刷新后恢复。</p>';
}
function systemSuiteDetailPage(id) {
  const s=systemTestSuites.find(x=>x.id===id);
  const back='<button data-system-suite="list">← 返回用例集列表</button>';
  if(!s)return back+'<p class="empty">用例集不存在</p>';
  const bound=versions.filter(v=>versionSuiteIds(v).includes(s.id));
  const edit='<button data-system-suite="edit" data-id="'+esc(s.id)+'">编辑关联配置</button>';
  const external=s.url?'<a class="artifact-link" href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">前往 MeterSphere 编辑 ↗</a>':'<span class="badge gray">待关联 MeterSphere</span>';
  return back+heading('TEST RESOURCES / SUITE DETAIL',esc(s.name),'系统测试用例集 · '+esc(s.id),edit)+
    '<section class="panel"><h2>用例集说明</h2><p>'+esc(s.description||'暂无说明')+'</p><div class="check"><span>关联项目 ID</span><strong>'+esc(s.projectId||'未配置')+'</strong></div><div class="check"><span>用例数据</span><span>本地预置 '+suiteExampleCases(s.id).length+' 条 · 未同步 MeterSphere</span></div><div class="row" style="margin-top:16px">'+external+'</div><p class="trace-note">'+(s.url?'在新页面打开关联项目的用例列表，在 MeterSphere 中查看和编辑具体用例；可能需要登录并具有编辑权限。':'请通过“编辑关联配置”填写项目用例链接，再前往 MeterSphere 编辑。')+' 本平台仅维护关联关系，不修改远端用例。</p></section>'+
    suiteExampleCaseTable(s)+'<section class="panel"><h2>绑定版本 <span class="badge gray">'+bound.length+'</span></h2>'+(bound.length?bound.map(v=>'<div class="check"><span>'+esc(v.platform+' '+v.name)+'</span><a href="#/versions/'+encodeURIComponent(v.id)+'/tests">查看版本系统测试 →</a></div>').join(''):'<p class="trace-note">尚未绑定版本，可在创建版本或版本测试页中选择本用例集。</p>')+'</section>';
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
  if(action==='detail'||action==='list'){resourceUI.suiteId=action==='detail'?id:null;render();return;}
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
