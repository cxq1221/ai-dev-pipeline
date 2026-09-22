/* Shared, in-memory runtime demo. Commands and addresses are display-only. */
(function (root) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const keyFor = (requirement, platform) => requirement + '::' + platform;
  function defaults(platform, name = platform) {
    const machine = platform === 'iOS' || platform === 'macOS' ? 'macOS' : platform === 'Windows' ? 'Windows' : 'Linux';
    return {machine, host: machine.toLowerCase() + '-dev-01', name: name + (['iOS','Android'].includes(platform) ? ' Demo' : ['Windows','macOS'].includes(platform) && name===platform ? ' 应用' : ''),
      hotReload: platform === 'Web', command: platform === 'Web' ? 'npm run dev' : './scripts/build-and-run-demo',
      appUrl: '', desktopUrl: ''};
  }
  function validateConfig(input) {
    const config = {...input};
    for (const field of ['host','name','command']) {
      config[field] = String(config[field] || '').trim();
      if (!config[field]) throw Error('请填写开发机、运行目标和启动方式');
    }
    if (!['Linux','macOS','Windows'].includes(config.machine)) throw Error('请选择开发机类型');
    for (const field of ['appUrl','desktopUrl']) {
      config[field] = String(config[field] || '').trim();
      if (!config[field]) continue;
      const url = new URL(config[field]);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error('预览入口请填写不含账号密码的 HTTP / HTTPS 地址');
      config[field] = url.href;
    }
    config.hotReload = !!config.hotReload;
    return config;
  }
  const initialScreen = () => ({page:'lobby', latency:81, muted:false, text:'', steps:0, x:50, y:50});
  class Store {
    constructor(onChange = () => {}, schedule = (fn, ms) => setTimeout(fn, ms)) { this.items = new Map(); this.onChange = onChange; this.schedule = schedule; }
    ensure(input) {
      const key = keyFor(input.requirement, input.platform);
      if (!this.items.has(key)) {
        const ready = !!input.ready;
        this.items.set(key, {key, requirement:input.requirement, platform:input.platform, title:input.title,
          serviceIds:input.serviceIds || [], config:clone(input.config), nextConfig:null, status:ready?'running':'idle',
          phase:ready?'运行中':'尚未启动', generation:0, revision:ready?1:0, draftRevision:1,
          updatedAt:ready?new Date().toISOString():'', needsReload:false, error:'', screen:initialScreen(),
          lastActor:'', lastAction:'', logs:[ready?'预置运行环境已就绪（演示）':'运行配置已准备，等待启动']});
      }
      return this.items.get(key);
    }
    get(key) { const state = this.items.get(key); if (!state) throw Error('运行环境不存在'); return state; }
    emit(state, message) {
      if (message) state.logs = [...state.logs, message].slice(-7);
      this.onChange(clone(state));
    }
    configure(serviceId, config) {
      for (const state of this.items.values()) if (state.serviceIds.includes(serviceId)) {
        state.nextConfig = clone(config); state.needsReload = true;
        this.emit(state, '运行配置已修改，重新加载后生效');
      }
    }
    begin(key, hot = false, fail = false) {
      const state = this.get(key);
      if (state.status === 'loading') return;
      if (state.nextConfig) { state.config = state.nextConfig; state.nextConfig = null; hot = false; }
      const token = ++state.generation, revision = state.draftRevision;
      const hotUpdate = hot && state.config.hotReload && state.revision > 0 && state.status !== 'stopped';
      state.status = 'loading'; state.error = '';
      state.phase = hotUpdate ? '正在热更新' : state.revision ? '重新编译中' : '准备运行环境';
      this.emit(state, state.phase + ' · ' + state.config.host);
      this.schedule(() => {
        if (state.generation !== token) return;
        state.phase = hotUpdate ? '应用更新' : '编译完成，启动应用';
        this.emit(state, state.phase);
      }, 550);
      this.schedule(() => {
        if (state.generation !== token) return;
        if (fail) {
          state.status = 'error'; state.phase = '更新失败'; state.error = '演示编译失败：Demo 页面缺少组件引用。修复后可重新加载。';
          state.needsReload = true; this.emit(state, state.error); return;
        }
        state.status = 'running'; state.phase = '运行中'; state.revision = revision;
        state.updatedAt = new Date().toISOString(); state.needsReload = !!state.nextConfig || state.draftRevision > revision;
        if (!hotUpdate) state.screen = initialScreen();
        this.emit(state, (hotUpdate?'热更新完成':'应用已启动') + ' · 运行修订 ' + revision);
        if (state.needsReload && state.config.hotReload && !state.nextConfig) this.begin(key, true);
      }, hotUpdate ? 1000 : 1700);
    }
    codeChanged(key) {
      const state = this.get(key); state.draftRevision++; state.needsReload = true;
      this.emit(state, 'AI 已生成新修改 · 修订 ' + state.draftRevision);
      if (state.config.hotReload && state.status !== 'stopped' && state.status !== 'idle' && !state.nextConfig) this.begin(key, true);
    }
    stop(key, reason = '运行已停止') {
      const state = this.get(key); state.generation++; state.status = 'stopped'; state.phase = '已停止';
      this.emit(state, reason);
    }
    action(key, action, value) {
      const state = this.get(key);
      if (action === 'start' || action === 'reload') return this.begin(key);
      if (action === 'stop') return this.stop(key);
      if (action === 'code') return this.codeChanged(key);
      if (action === 'fail') return this.begin(key, false, true);
      if (!state.revision || state.status === 'stopped' || state.status === 'idle') return;
      const screen = state.screen;
      if (action === 'ai') { screen.latency = screen.latency > 80 ? 24 : 126; state.lastActor = 'AI'; state.lastAction = '切换网络场景'; }
      else {
        state.lastActor = '你';
        if (action === 'latency' && [24,80,81,126].includes(Number(value))) { screen.latency = Number(value); state.lastAction = '设置网络延迟'; }
        else if (action === 'play') { screen.page = 'game'; state.lastAction = '进入游戏'; }
        else if (action === 'home') { screen.page = 'lobby'; state.lastAction = '返回首页'; }
        else if (action === 'mute') { screen.muted = !screen.muted; state.lastAction = screen.muted?'静音':'开启声音'; }
        else if (action === 'text') { screen.text = String(value || '').slice(0,60); state.lastAction = '更新体验备注'; }
        else if (['left','right','up','down','tap'].includes(action)) {
          if (action === 'left') screen.x = Math.max(10,screen.x-8);
          if (action === 'right') screen.x = Math.min(90,screen.x+8);
          if (action === 'up') screen.y = Math.max(12,screen.y-8);
          if (action === 'down') screen.y = Math.min(88,screen.y+8);
          screen.steps++; state.lastAction = '操作游戏';
        } else return;
      }
      this.emit(state);
    }
  }
  function button(action, label, extra = '') { return '<button type="button" data-preview-action="'+action+'" '+extra+'>'+label+'</button>'; }
  function scene(s) {
    const mobile = ['iOS','Android'].includes(s.platform), web = s.platform === 'Web';
    if (s.platform === '服务端') return '<div class="rp-service-scene"><span class="rp-kicker">SERVICE / RUNNING</span><h2>'+escape(s.config.name)+'</h2><p>服务进程运行中</p><code>GET /health → 200 OK</code><pre>'+escape(s.logs.join('\n'))+'</pre>'+button('tap','发送示例请求')+'<small>请求次数 '+s.screen.steps+'</small></div>';
    const app = '<div class="rp-demo-app"><header><strong>Cloudplay</strong><span>'+escape(s.platform)+' Demo</span></header>'+
      (s.screen.page === 'game' ? '<div class="rp-game" tabindex="0" aria-label="游戏体验区域，方向键移动"><div class="rp-game-grid"></div><span class="rp-game-label">NEBULA / 云端探索</span><span class="rp-avatar" style="left:'+s.screen.x+'%;top:'+s.screen.y+'%">◆</span><span class="rp-game-score">已操作 '+s.screen.steps+' 次</span></div><div class="rp-direction">'+button('left','←','aria-label="向左移动"')+button('up','↑','aria-label="向上移动"')+button('down','↓','aria-label="向下移动"')+button('right','→','aria-label="向右移动"')+'</div><div class="rp-demo-actions">'+button('home','返回首页')+button('mute',s.screen.muted?'开启声音':'静音')+'</div>' :
      '<div class="rp-demo-hero"><span>PLAY WITHOUT LIMITS</span><h2>即刻进入<br>你的云端世界</h2><p>'+escape(s.config.name)+'</p><div class="rp-orbit"></div></div><div class="rp-demo-body"><div class="rp-demo-network"><span>网络状态</span><strong>'+s.screen.latency+' ms</strong></div>'+(s.screen.latency>80?'<div class="rp-network-hint">当前网络可能影响体验，你仍可继续进入。</div>':'<div class="rp-network-good">连接良好，准备就绪</div>')+button('play','继续进入 →','class="rp-play"')+'<label class="rp-demo-note">体验备注<input data-preview-note value="'+escape(s.screen.text)+'" maxlength="60" placeholder="点击输入，按 Enter 保存" aria-label="体验备注"></label></div>')+
      '<footer>运行修订 '+s.revision+' <span>演示应用</span></footer></div>';
    return '<div class="rp-device '+(mobile?'rp-phone':web?'rp-browser':'rp-native')+'">'+
      (mobile?'<div class="rp-phone-status"><span>9:41</span><i></i><span>▰</span></div>':web?'<div class="rp-window-chrome"><span>● ● ●</span><code>'+escape(s.config.appUrl || 'demo.local / preview')+'</code></div>':'<div class="rp-window-chrome"><strong>'+escape(s.config.name)+'</strong><span>− □ ×</span></div>')+app+(mobile?'<div class="rp-home-indicator"></div>':'')+'</div>';
  }
  function desktop(s) {
    return '<div class="rp-desktop"><div class="rp-desktop-bar"><strong>'+escape(s.config.machine)+'</strong><span>'+escape(s.config.host)+'</span><span>开发桌面 · 演示</span></div><div class="rp-desktop-work"><aside class="rp-editor"><div>EXPLORER</div><p>▾ workspace</p><p>　▾ demo</p><p>　　App</p><p>　　NetworkHint</p><p>　▾ scripts</p><p>　　build-and-run</p><div class="rp-editor-code"><span>// Live workspace</span><br><br>latency &gt; 80<br>　? showHint()<br>　: continuePlay()</div></aside><div class="rp-desktop-app">'+scene(s)+'</div></div><div class="rp-desktop-terminal"><strong>TERMINAL</strong><code>$ '+escape(s.config.command)+'</code><span>'+escape(s.logs.at(-1))+'</span></div><div class="rp-desktop-dock"><span>⌘</span><span>代码</span><span>终端</span><span>应用</span></div></div>';
  }
  function view(s, mode = 'app') {
    const live = s.revision > 0 && !['idle','stopped'].includes(s.status);
    const label = s.status === 'loading' ? s.phase : s.status === 'error' ? '更新失败' : s.status === 'running' ? '运行中' : s.status === 'stopped' ? '已停止' : '待启动';
    return '<div class="rp-state-line"><span class="rp-state-dot '+s.status+'"></span><strong>'+escape(label)+'</strong><span>'+ (s.config.hotReload?'热更新':'手动重新加载')+'</span></div>'+
      '<div class="rp-screen '+(mode==='desktop'?'rp-screen-desktop':'')+'">'+(live?(mode==='desktop'?desktop(s):scene(s)):'<div class="rp-empty"><span class="rp-empty-icon">▣</span><h3>'+(s.status==='stopped'?'运行已停止':'准备查看开发效果')+'</h3><p>'+escape(s.platform)+' · '+escape(s.config.name)+'</p>'+button('start',s.status==='stopped'?'重新启动':'启动预览','class="rp-primary"')+'</div>')+'</div>'+
      (s.status==='loading'?'<div class="rp-update"><span class="rp-spinner"></span>'+escape(s.phase)+(live?' · 当前仍展示上一次运行内容':'')+'</div>':'')+
      (s.error?'<div class="rp-error" role="status">'+escape(s.error)+' '+button('reload','重试')+'</div>':'')+
      (s.needsReload&&s.status!=='loading'&&!s.error?'<div class="rp-update">'+(s.nextConfig?'运行配置已更改':'有新的代码修改')+'，点击“重新加载”后生效。</div>':'')+
      '<div class="rp-runtime-meta"><span>'+escape(s.config.host)+'</span><span>'+(s.updatedAt?'更新于 '+new Date(s.updatedAt).toLocaleTimeString('zh-CN',{hour12:false}):'等待首次运行')+'</span></div>'+
      '<div class="rp-runtime-actions">'+button('reload',s.status==='stopped'?'重新启动':'重新加载',s.status==='loading'?'disabled':'')+button('stop','停止',s.status==='stopped'||s.status==='idle'?'disabled':'')+'<details class="rp-demo-menu"><summary>演示操作</summary><div>'+button('ai','模拟 AI 操作',!live?'disabled':'')+button('code','模拟代码更新')+button('fail','模拟构建失败',s.status==='loading'?'disabled':'')+'<span>网络场景</span><div class="rp-latencies">'+[24,80,81,126].map(n=>button('latency',n+'ms','data-value="'+n+'" '+(!live?'disabled':''))).join('')+'</div></div></details></div>'+
      '<div class="rp-activity" aria-live="polite">'+(s.lastActor?escape(s.lastActor+' · '+s.lastAction):'可以直接操作窗口；你和 AI 的操作即时共享')+'</div>'+
      '<details class="rp-logs"><summary>运行日志</summary><pre>'+escape(s.logs.join('\n'))+'</pre></details>'+
      '<p class="rp-prototype-note">交互演示 · 未连接真实开发机</p>';
  }
  function mount(container, state, mode) {
    const active = container.contains(document.activeElement) ? document.activeElement : null;
    const note = active?.matches('[data-preview-note]'), game = active?.matches('.rp-game');
    const position = note ? [active.selectionStart, active.selectionEnd, active.value] : null;
    const menuOpen = !!container.querySelector('.rp-demo-menu[open]'), logsOpen = !!container.querySelector('.rp-logs[open]');
    container.innerHTML = view(state, mode);
    if (menuOpen) container.querySelector('.rp-demo-menu').open = true;
    if (logsOpen) container.querySelector('.rp-logs').open = true;
    if (note) { const input = container.querySelector('[data-preview-note]'); if (input) { input.value = position[2]; input.focus({preventScroll:true}); input.setSelectionRange(position[0],position[1]); } }
    if (game) container.querySelector('.rp-game')?.focus({preventScroll:true});
  }
  function bind(container, dispatch) {
    container.addEventListener('click', e => {
      const button = e.target.closest('[data-preview-action]');
      if (!button || button.disabled) return;
      e.preventDefault(); dispatch(button.dataset.previewAction,button.dataset.value);
    });
    container.addEventListener('input', e => { if (e.target.matches('[data-preview-note]')) dispatch('text',e.target.value); });
    container.addEventListener('keydown', e => {
      if (e.target.matches('[data-preview-note]') && e.key==='Enter') { e.preventDefault(); dispatch('text',e.target.value); }
      if (!e.target.closest('.rp-game')) return;
      const action = {ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',' ':'tap'}[e.key];
      if (action) { e.preventDefault(); e.stopPropagation(); dispatch(action); }
    });
  }
  const api = {Store, defaults, validateConfig, keyFor, escape, view, mount, bind};
  root.RuntimePreview = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
