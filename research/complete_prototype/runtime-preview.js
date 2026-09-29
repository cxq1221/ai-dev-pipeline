/* Requirement-level integration for the local runtime preview prototype. */
const runtimeWorkspaceId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now());
const runtimeWindows = new Map();
const runtimeViews = new Map();
const runtimeFallbackConfigs = new Map();
let runtimeWidth = 400, runtimeResizeObserver, runtimePainting = false;
const runtimeStore = new RuntimePreview.Store(state => {
  for (const [child, key] of runtimeWindows) {
    if (child.closed) { runtimeWindows.delete(child); continue; }
    if (key === state.key) child.postMessage({type:'forge-runtime-state', workspace:runtimeWorkspaceId, state}, location.origin==='null'?'*':location.origin);
  }
  const panel = document.querySelector('.rp-panel');
  if (panel?.dataset.key === state.key) paintRuntimePanel(state);
});
function runtimeTargets(requirement) {
  const groups = new Map();
  for (const task of work.filter(w => w.req === requirement)) {
    if (!groups.has(task.platform)) groups.set(task.platform, []);
    groups.get(task.platform).push(task);
  }
  return [...groups].map(([platform,tasks]) => {
    const services = new Map();
    for (const task of tasks) {
      const bindings = task.repoSnapshot ? [task.repoSnapshot] : versions.find(v=>v.id===task.version)?.repoBindings || [];
      for (const map of bindings) { const s=regService(map.service); if (s?.platform===platform) services.set(s.id,s); }
    }
    if (!services.size) { const service=productRegistry.services.find(s=>s.platform===platform); if (service) services.set(service.id,service); }
    const list = [...services.values()], primary = list[0];
    const config = primary ? (primary.runtimeConfig ||= RuntimePreview.defaults(platform,primary.name)) : (runtimeFallbackConfigs.get(platform) || RuntimePreview.defaults(platform));
    const state = runtimeStore.ensure({requirement,platform,title:R(requirement)?.title || requirement,config,
      serviceIds:list.map(s=>s.id),ready:tasks.some(t=>['开发中','已合入'].includes(t.status))});
    if (tasks.some(t=>t.status==='开发中')) state.hadDevelopment = true;
    else if (state.hadDevelopment && tasks.every(t=>t.status==='已合入') && state.status!=='stopped') {
      state.hadDevelopment=false; runtimeStore.stop(state.key,'任务已完成，运行已停止');
    }
    return {platform,tasks,services:list,state};
  });
}
function runtimeView(requirement, targets) {
  if (!runtimeViews.has(requirement)) runtimeViews.set(requirement,{platform:targets.find(t=>t.platform===traceWork()?.platform)?.platform || targets[0]?.platform,mode:'app',collapsed:false});
  const view=runtimeViews.get(requirement);
  if (!targets.some(t=>t.platform===view.platform)) view.platform=targets[0]?.platform;
  return view;
}
function keepRuntimeDraft() {
  const task=traceWork(), input=document.querySelector('#requirement-message');
  if (task && input) activeSession(specFor(task)).chatDraft=input.value;
}
function alignRuntimeComposer() {
  const main=document.querySelector('.requirement-main'),dock=document.querySelector('.agent-dock');
  if (!main || !dock) return;
  const rect=main.getBoundingClientRect();
  Object.assign(dock.style,{left:rect.left+'px',right:'auto',width:rect.width+'px',maxWidth:'none'});
  const panel=document.querySelector('.rp-panel');
  if (panel && window.innerWidth>980) panel.style.maxHeight=Math.max(300,window.innerHeight-Math.max(16,panel.getBoundingClientRect().top)-16)+'px';
  else if (panel) panel.style.maxHeight='';
}
function setRuntimeWidth(width) {
  runtimeWidth=Math.max(300,Math.min(640,Number(width)||400));
  document.querySelector('.rp-layout')?.style.setProperty('--rp-width',runtimeWidth+'px');
  const handle=document.querySelector('.rp-resize');
  if (handle) handle.setAttribute('aria-valuenow',runtimeWidth);
  alignRuntimeComposer();
}
function paintRuntimePanel(state) {
  if (runtimePainting) return;
  runtimePainting=true;
  const panel=document.querySelector('.rp-panel'),view=runtimeViews.get(state.requirement);
  if (panel?.dataset.key===state.key) RuntimePreview.mount(panel.querySelector('.rp-body'),state,view?.mode||'app');
  runtimePainting=false;
}
function openRuntimeWindow(key, mode) {
  const url=new URL('runtime-preview.html',location.href);
  url.hash='';url.search=new URLSearchParams({workspace:runtimeWorkspaceId,key,view:mode}).toString();
  const child=window.open(url.href,'forge-preview-'+runtimeWorkspaceId+'-'+key+'-'+mode);
  if (!child) { toast('浏览器阻止了新窗口，请允许此站点打开窗口后重试'); return; }
  runtimeWindows.set(child,key);
}
window.addEventListener('message',event=>{
  const data=event.data,key=runtimeWindows.get(event.source);
  if (!key || !data || data.workspace!==runtimeWorkspaceId || data.key!==key) return;
  if (location.origin!=='null' && event.origin!==location.origin) return;
  if (data.type==='forge-runtime-hello') {
    event.source.postMessage({type:'forge-runtime-state',workspace:runtimeWorkspaceId,state:JSON.parse(JSON.stringify(runtimeStore.get(key)))},location.origin==='null'?'*':location.origin);
  } else if (data.type==='forge-runtime-action') runtimeStore.action(key,data.action,data.value);
});
function attachRuntimePanel() {
  runtimeResizeObserver?.disconnect();
  document.body.classList.remove('has-runtime-preview','runtime-preview-collapsed');
  const layout=document.querySelector('.requirement-workspace');
  if (!layout || !['version','requirement'].includes(vs.page) || vs.tab!=='需求开发') return;
  const requirement=traceWork()?.req,targets=runtimeTargets(requirement);
  if (!targets.length) return;
  const view=runtimeView(requirement,targets),target=targets.find(t=>t.platform===view.platform),state=target.state;
  if (view.collapsed) {
    document.body.classList.add('runtime-preview-collapsed');
    layout.insertAdjacentHTML('beforeend','<button type="button" class="rp-reopen" data-runtime-action="toggle" aria-label="展开运行预览" aria-expanded="false" title="展开运行预览 · '+RuntimePreview.escape(target.platform)+'"><span class="rp-reopen-icon" aria-hidden="true">'+sidebarIcon('monitor-smartphone')+'</span><span class="rp-reopen-label">运行预览</span><span class="rp-reopen-arrow" aria-hidden="true">‹</span></button>');
  }
  if (!view.collapsed) {
    layout.classList.add('rp-layout');document.body.classList.add('has-runtime-preview');
    layout.style.setProperty('--rp-width',runtimeWidth+'px');
    const panel=document.createElement('aside');panel.className='rp-panel';panel.dataset.key=state.key;panel.setAttribute('aria-label','运行预览');
    panel.innerHTML='<div class="rp-resize" role="separator" aria-label="调整预览宽度" aria-orientation="vertical" aria-valuemin="300" aria-valuemax="640" aria-valuenow="'+runtimeWidth+'" tabindex="0"></div><div class="rp-panel-head"><div><strong>运行预览</strong><span class="rp-demo-badge">演示</span></div><button data-runtime-action="toggle" aria-label="收起运行预览">收起 →</button></div><div class="rp-target"><select aria-label="预览平台" id="rp-platform">'+targets.map(t=>'<option value="'+RuntimePreview.escape(t.platform)+'" '+(t.platform===view.platform?'selected':'')+'>'+RuntimePreview.escape(t.platform+' · '+t.state.config.name)+'</option>').join('')+'</select><button data-runtime-action="config" data-service="'+RuntimePreview.escape(target.services[0]?.id||'')+'" data-platform="'+RuntimePreview.escape(target.platform)+'">运行配置</button></div><div class="rp-view-tools"><div class="rp-view-tabs"><button data-runtime-action="app" aria-pressed="'+(view.mode==='app')+'">应用</button><button data-runtime-action="desktop" aria-pressed="'+(view.mode==='desktop')+'">桌面</button></div><button data-runtime-action="new-page">新页面 ↗</button><button data-runtime-action="full-desktop">完整桌面 ↗</button></div><div class="rp-body"></div>';
    layout.append(panel);RuntimePreview.bind(panel,(action,value)=>runtimeStore.action(panel.dataset.key,action,value));
    paintRuntimePanel(state);
    const handle=panel.querySelector('.rp-resize');
    handle.addEventListener('pointerdown',event=>{
      const start=event.clientX,width=runtimeWidth;handle.setPointerCapture(event.pointerId);
      const move=e=>setRuntimeWidth(width+start-e.clientX);
      const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);};
      handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
    });
    handle.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopPropagation();setRuntimeWidth(runtimeWidth+(event.key==='ArrowLeft'?24:-24));}});
  }
  runtimeResizeObserver=new ResizeObserver(alignRuntimeComposer);
  runtimeResizeObserver.observe(layout.querySelector('.requirement-main'));
  requestAnimationFrame(alignRuntimeComposer);
}
function attachRuntimeConfigs() {
  if (vs.page!=='products') return;
  for (const edit of document.querySelectorAll('.content [data-reg="edit-service"][data-id]')) {
    const service=regService(edit.dataset.id),section=edit.closest('section');
    if (!service || !section || section.querySelector('.rp-config-summary')) continue;
    const config=service.runtimeConfig ||= RuntimePreview.defaults(service.platform,service.name);
    const html='<div class="rp-config-summary"><div><strong>运行配置</strong><span>'+esc(config.machine+' · '+config.host+' · '+(config.hotReload?'热更新':'手动重新加载'))+'</span><small>'+esc(config.name)+'</small></div><button data-runtime-action="config" data-service="'+esc(service.id)+'" data-platform="'+esc(service.platform)+'">配置运行预览</button></div>';
    section.querySelector('.table-wrap')?.insertAdjacentHTML('beforebegin',html);
  }
}
function editRuntimeConfig(serviceId,platform) {
  keepRuntimeDraft();const service=regService(serviceId),config=service?.runtimeConfig || runtimeFallbackConfigs.get(platform) || RuntimePreview.defaults(platform,service?.name||platform);
  const option=(value,selected)=>'<option '+(value===selected?'selected':'')+'>'+esc(value)+'</option>';
  openModal('运行配置 · '+(service?.name||platform),'<div class="rp-config-form"><label>开发机类型<select id="rp-machine">'+['Linux','macOS','Windows'].map(x=>option(x,config.machine)).join('')+'</select></label><label>默认开发机<input id="rp-host" value="'+esc(config.host)+'" placeholder="例如 macos-dev-01"></label><label>运行目标<input id="rp-name" value="'+esc(config.name)+'" placeholder="例如 iOS SDK Demo"></label><label>更新方式<select id="rp-hot"><option value="no" '+(!config.hotReload?'selected':'')+'>重新加载时编译并启动</option><option value="yes" '+(config.hotReload?'selected':'')+'>支持热更新</option></select></label><label class="rp-full">启动方式 / 命令<textarea id="rp-command" rows="2">'+esc(config.command)+'</textarea></label><label class="rp-full">应用预览入口（可选）<input id="rp-app-url" value="'+esc(config.appUrl)+'" placeholder="https://preview.example.com/app"></label><label class="rp-full">完整桌面入口（可选）<input id="rp-desktop-url" value="'+esc(config.desktopUrl)+'" placeholder="https://desktop.example.com/session"></label><p class="rp-full trace-note">当前仅保存演示配置；命令与地址不会执行或连接。修改已有运行环境的配置后，重新加载生效。</p><p class="rp-full" id="rp-config-error" role="alert"></p></div>','<div class="dialog-footer"><button data-action="close">取消</button><button class="primary" data-runtime-action="save-config" data-service="'+esc(serviceId||'')+'" data-platform="'+esc(platform)+'">保存</button></div>');
}
const renderBeforeRuntimePreview=render;
function reconcileRuntimeCompletion() {
  // Completion can happen on the commit/overview page while preview windows stay open.
  for (const state of runtimeStore.items.values()) {
    const tasks=work.filter(w=>w.req===state.requirement&&w.platform===state.platform);
    if (tasks.some(t=>t.status==='开发中')) state.hadDevelopment=true;
    else if (state.hadDevelopment && tasks.length && tasks.every(t=>t.status==='已合入')) {
      state.hadDevelopment=false;
      if (state.status!=='stopped') runtimeStore.stop(state.key,'任务已完成，运行已停止');
    }
  }
}
render=function(){reconcileRuntimeCompletion();renderBeforeRuntimePreview();attachRuntimeConfigs();attachRuntimePanel();};
const startBeforeRuntimePreview=startRequirementDevelopment;
startRequirementDevelopment=function(){
  const task=traceWork();
  // Capture readiness before the existing development action mutates task status.
  const previous=task && runtimeTargets(task.req).find(t=>t.platform===task.platform)?.state;
  const needsStart=!previous?.revision || previous.status==='stopped';
  const result=startBeforeRuntimePreview();
  if (!result || !task) return result;
  vs.page='version';vs.version=task.version;vs.tab='需求开发';trace.task=task.id;
  history.replaceState(null,'','#/versions/'+task.version+'/clarification/'+task.id);
  const targets=runtimeTargets(task.req),view=runtimeView(task.req,targets);
  view.platform=task.platform;view.collapsed=false;
  const state=targets.find(t=>t.platform===task.platform)?.state;
  if (state) { state.hadDevelopment=true; if (needsStart) runtimeStore.begin(state.key); else runtimeStore.codeChanged(state.key); }
  render();return true;
};
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-runtime-action]');if (!button || button.disabled) return;
  event.preventDefault();event.stopImmediatePropagation();const d=button.dataset;
  if (d.runtimeAction==='config') return editRuntimeConfig(d.service,d.platform);
  if (d.runtimeAction==='save-config') {
    try {
      const config=RuntimePreview.validateConfig({machine:$('#rp-machine').value,host:$('#rp-host').value,name:$('#rp-name').value,hotReload:$('#rp-hot').value==='yes',command:$('#rp-command').value,appUrl:$('#rp-app-url').value,desktopUrl:$('#rp-desktop-url').value});
      const service=regService(d.service);
      if (service) { service.runtimeConfig=config;runtimeStore.configure(service.id,config); }
      else { runtimeFallbackConfigs.set(d.platform,config);for(const s of runtimeStore.items.values())if(!s.serviceIds.length&&s.platform===d.platform){s.nextConfig=structuredClone(config);s.needsReload=true;runtimeStore.emit(s);} }
      $('#modal').close();render();toast('运行配置已保存');
    } catch(error) { $('#rp-config-error').textContent=error.message; }
    return;
  }
  const requirement=traceWork()?.req,view=runtimeViews.get(requirement);if (!view) return;
  const key=RuntimePreview.keyFor(requirement,view.platform);
  if (d.runtimeAction==='new-page' || d.runtimeAction==='full-desktop') return openRuntimeWindow(key,d.runtimeAction==='full-desktop'?'desktop':view.mode);
  keepRuntimeDraft();
  if (d.runtimeAction==='toggle') view.collapsed=!view.collapsed;
  if (['app','desktop'].includes(d.runtimeAction)) view.mode=d.runtimeAction;
  render();
  if (d.runtimeAction==='toggle') requestAnimationFrame(()=>document.querySelector(view.collapsed?'.rp-reopen':'.rp-panel-head [data-runtime-action="toggle"]')?.focus({preventScroll:true}));
},true);
document.addEventListener('change',event=>{
  if (event.target.id!=='rp-platform') return;
  const requirement=traceWork()?.req,view=runtimeViews.get(requirement);if (!view) return;
  keepRuntimeDraft();view.platform=event.target.value;render();
});
window.addEventListener('resize',alignRuntimeComposer);
window.addEventListener('scroll',alignRuntimeComposer,{passive:true});
render();
