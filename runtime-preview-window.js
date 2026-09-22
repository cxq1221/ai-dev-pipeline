(() => {
  const params=new URLSearchParams(location.search),workspace=params.get('workspace'),key=params.get('key');
  const owner=window.opener,container=document.getElementById('rp-window-body');
  let view=params.get('view')==='desktop'?'desktop':'app',state=null,lastSeen=0;
  const targetOrigin=location.origin==='null'?'*':location.origin;
  function render() {
    if (!state) return;
    document.title=state.platform+' · '+state.title+' · Forge';
    document.getElementById('rp-window-title').textContent=state.config.name;
    document.getElementById('rp-window-context').textContent=state.requirement+' · '+state.title+' · '+state.platform;
    document.querySelectorAll('[data-window-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.windowView===view));
    document.body.classList.toggle('rp-desktop-page',view==='desktop');
    RuntimePreview.mount(container,state,view);
  }
  function send(type,extra={}) { if(owner&&!owner.closed)owner.postMessage({type,workspace,key,...extra},targetOrigin); }
  function connection() {
    const box=document.getElementById('rp-connection');
    if (!owner || owner.closed) {
      box.textContent='需求开发页已关闭或未连接，请从需求开发页重新打开预览。';
      container.inert=true; return;
    }
    send('forge-runtime-hello');
    box.textContent=state&&Date.now()-lastSeen<5000?'':'正在连接原运行环境…';
    container.inert=!!state&&Date.now()-lastSeen>=5000;
  }
  window.addEventListener('message',event=>{
    if(event.source!==owner || (location.origin!=='null'&&event.origin!==location.origin))return;
    const data=event.data;
    if(data?.type!=='forge-runtime-state'||data.workspace!==workspace||data.state?.key!==key)return;
    lastSeen=Date.now();document.getElementById('rp-connection').textContent='';container.inert=false;
    if(JSON.stringify(state)!==JSON.stringify(data.state)){state=data.state;render();}
  });
  RuntimePreview.bind(container,(action,value)=>send('forge-runtime-action',{action,value}));
  document.querySelectorAll('[data-window-view]').forEach(button=>button.addEventListener('click',()=>{
    view=button.dataset.windowView;params.set('view',view);history.replaceState(null,'','?'+params);render();
  }));
  connection();const timer=setInterval(connection,1500);
  window.addEventListener('pagehide',()=>clearInterval(timer));
})();
