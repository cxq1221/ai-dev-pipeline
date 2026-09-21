// Files remain in this page's memory. No uploads, extraction or AI calls are made.
const knowledgeAssets=new KnowledgeAssetLibrary();
const kaUI={query:'',type:'全部',purpose:'全部',status:'在用'};
const kaPurposes=['当前问题截图','目标设计','竞品参考','补充资料'];
const kaTypes=['图片','PDF','办公文档','设计文件','视频','Demo / 压缩包','外部链接','其他文件'];
const kaURLs=new Map();
function kaFileURL(a){if(!a.file)return '';if(!kaURLs.has(a.id))kaURLs.set(a.id,URL.createObjectURL(a.file));return kaURLs.get(a.id);}
function kaImage(a){return a.file&&/^image\/(png|jpeg|gif|webp|bmp)$/.test(a.file.type);}
function kaReqProducts(id){return [...new Set(work.filter(w=>w.req===id).map(w=>versions.find(v=>v.id===w.version)?.productId).filter(Boolean))];}
function kaScopeLabel(scope){const [kind,id]=scope.split(':');return kind==='product'?'产品 · '+(productRegistry.products.find(p=>p.id===id)?.name||id):'需求 · '+(R(id)?.title||id);}
function kaCurrentReq(){return document.querySelector('#requirement-message')?traceWork()?.req:null;}
function kaKeepDraft(){const input=document.querySelector('#requirement-message'),w=input?traceWork():null;if(w)activeSession(specFor(w)).chatDraft=input.value;}
function kaButton(action,label,id='',req=''){return '<button data-ka="'+action+'" data-id="'+esc(id)+'" data-req="'+esc(req)+'">'+label+'</button>';}
function kaOptions(values,current){return values.map(x=>'<option '+(x===current?'selected':'')+'>'+esc(x)+'</option>').join('');}
function kaThumb(a){return kaImage(a)?'<img class="ka-thumb" alt="" src="'+kaFileURL(a)+'">':'<span class="ka-thumb">'+esc(a.type==='外部链接'?'LINK':a.file?.name.split('.').pop().toUpperCase()||'FILE')+'</span>';}
function kaList(){
 const items=knowledgeAssets.items.filter(a=>(kaUI.status==='全部'||a.archived===(kaUI.status==='已归档'))&&(kaUI.type==='全部'||a.type===kaUI.type)&&(kaUI.purpose==='全部'||a.purpose===kaUI.purpose)&&(a.name+' '+a.description+' '+a.refs.join(' ')).toLowerCase().includes(kaUI.query.toLowerCase()));
 return heading('WORKSPACE / KNOWLEDGE ASSETS','资产','需求参考资料，不是系统构建制品；上传不会自动成为开发指令。',kaButton('upload','＋ 上传文件')+' '+kaButton('link-new','＋ 添加链接'))+
 '<div class="ka-toolbar"><input id="ka-query" aria-label="搜索资产" placeholder="名称 / 说明 / 需求编号" value="'+esc(kaUI.query)+'"><select id="ka-type" aria-label="资产类型">'+kaOptions(['全部',...kaTypes],kaUI.type)+'</select><select id="ka-purpose" aria-label="资产用途">'+kaOptions(['全部',...kaPurposes],kaUI.purpose)+'</select><select id="ka-status" aria-label="资产状态">'+kaOptions(['在用','已归档','全部'],kaUI.status)+'</select>'+kaButton('filter','筛选')+'<span>'+items.length+' 项</span></div>'+
 '<div class="table-wrap"><table class="ka-table"><thead><tr><th>资产</th><th>类型 / 用途</th><th>所属范围 / 关联需求</th><th>上传人 / 更新时间</th><th>状态</th></tr></thead><tbody>'+items.map(a=>'<tr><td><div class="ka-title">'+kaThumb(a)+'<div><button class="ka-name" data-ka="detail" data-id="'+a.id+'">'+esc(a.name)+'</button><small>'+a.id+(a.sample?' · 预置示例':'')+'</small></div></div></td><td>'+esc(a.type)+'<small>'+esc(a.purpose)+'</small></td><td>'+esc(kaScopeLabel(a.scope))+'<small>'+a.refs.length+' 个需求引用</small></td><td>'+esc(a.uploader)+'<small>'+esc(new Date(a.updatedAt).toLocaleString('zh-CN'))+'</small></td><td>'+(a.archived?'已归档':'在用')+'</td></tr>').join('')+'</tbody></table></div>'+(!items.length?'<div class="ka-empty">暂无匹配资产，可上传文件或添加链接。</div>':'')+'<p class="ka-reference-note">文件仅保存在当前页面内存，刷新后清除。当前为管理员演示视角，权限继承仅模拟；请勿上传敏感资料。</p>';
}
function kaPreview(a){
 if(kaImage(a))return '<img alt="'+esc(a.name)+'" src="'+kaFileURL(a)+'">';
 if(a.file?.type==='application/pdf')return '<div class="ka-pdf-view" data-pdf-asset="'+a.id+'" aria-live="polite">正在准备 PDF 本地预览…</div>';
 return '<div class="ka-empty">'+esc(a.type)+'<p>'+(a.link?'外部链接不嵌入加载，请主动打开查看。':'此格式不支持在线预览，请下载后使用相应软件打开。')+'</p><small>未解析内容，AI 尚未读取；程序和脚本不会自动运行。</small></div>';
}
function kaAccess(a){return a.link?'<a href="'+esc(a.link)+'" target="_blank" rel="noopener noreferrer">打开外部链接 ↗</a>':'<a href="'+kaFileURL(a)+'" download="'+esc(a.file.name)+'">下载原文件 ↓</a>';}
let kaPDFRuntime;
const kaPDFDocuments=new Map();
function kaLoadPDF(){
 if(!kaPDFRuntime)kaPDFRuntime=(async()=>{for(const source of ['vendor/pdfjs/pdf.worker.min.js','vendor/pdfjs/pdf.min.js'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=source;script.onload=resolve;script.onerror=()=>reject(Error('本地 PDF 组件加载失败，请下载原文件查看'));document.head.append(script);});})().catch(error=>{kaPDFRuntime=null;throw error;});
 return kaPDFRuntime;
}
async function kaPDFPage(id,number=1){
 const host=document.querySelector('[data-pdf-asset="'+id+'"]');if(!host)return;
 const request={};host.kaRequest=request;
 try{
  const a=knowledgeAssets.get(id);await kaLoadPDF();
  if(!kaPDFDocuments.has(id))kaPDFDocuments.set(id,(async()=>{const task=pdfjsLib.getDocument({data:new Uint8Array(await a.file.arrayBuffer()),useWasm:false,useSystemFonts:true,isEvalSupported:false,isImageDecoderSupported:false});return await task.promise;})());
  const doc=await kaPDFDocuments.get(id);const index=Math.max(1,Math.min(number,doc.numPages)),page=await doc.getPage(index);
  if(!host.isConnected||host.kaRequest!==request)return;
  const base=page.getViewport({scale:1}),scale=Math.min(2,1000/base.width),viewport=page.getViewport({scale});
  host.innerHTML='<div class="ka-detail-actions"><button data-ka="pdf-page" data-id="'+id+'" data-page="'+(index-1)+'" '+(index===1?'disabled':'')+'>上一页</button><span>'+index+' / '+doc.numPages+' 页</span><button data-ka="pdf-page" data-id="'+id+'" data-page="'+(index+1)+'" '+(index===doc.numPages?'disabled':'')+'>下一页</button></div><canvas role="img" aria-label="PDF 第 '+index+' 页"></canvas>';
  const canvas=host.querySelector('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
 }catch(error){kaPDFDocuments.delete(id);if(host.isConnected)host.textContent='无法预览此 PDF（可能已加密、损坏或格式不支持），请下载原文件查看。';}
}
function kaDetail(a){
 return kaButton('home','← 返回资产列表')+heading('KNOWLEDGE ASSET / '+a.id,esc(a.name),esc(a.type+' · '+a.purpose),kaButton('edit','编辑说明',a.id))+
 '<div class="ka-layout"><section><div class="ka-preview">'+kaPreview(a)+'</div><div class="ka-detail-actions">'+kaAccess(a)+kaButton('archive',a.archived?'恢复资产':'归档',a.id)+kaButton('delete','删除',a.id)+'</div><p class="ka-reference-note">图片 / PDF 可预览，其他格式仅下载。PDF 无法显示时可下载查看。没有自动内容提取或 AI 分析。</p></section><section class="panel ka-meta"><h2>资产信息</h2><p>'+esc(a.description||'暂无说明')+'</p><div class="check"><span>继承范围</span><strong>'+esc(kaScopeLabel(a.scope))+'</strong></div><div class="check"><span>状态</span><strong>'+(a.archived?'已归档':'在用')+'</strong></div><p>上传人：'+esc(a.uploader)+'<br>创建：'+esc(new Date(a.createdAt).toLocaleString('zh-CN'))+'<br>更新：'+esc(new Date(a.updatedAt).toLocaleString('zh-CN'))+'</p><p class="ka-reference-note">复用不扩大所属范围；本原型没有真实身份鉴权或服务端权限控制。</p><h2>关联需求 · '+a.refs.length+'</h2>'+a.refs.map(id=>'<div class="check"><a href="#/requirements/'+encodeURIComponent(id)+'">'+esc(R(id)?.title||id)+'</a>'+kaButton('unlink','移除引用',a.id,id)+'</div>').join('')+(a.archived?'<p>归档后保留已有引用，不接受新引用。</p>':kaButton('associate','＋ 关联需求',a.id))+'</section></div>';
}
function kaScopeOptions(req){
 const allowed=req?productRegistry.products.filter(p=>kaReqProducts(req).includes(p.id)):productRegistry.products;
 return (req?'<option value="requirement:'+esc(req)+'">当前需求 · '+esc(R(req)?.title||req)+'</option>':'')+allowed.map(p=>'<option value="product:'+esc(p.id)+'">产品 · '+esc(p.name)+'</option>').join('')+(!req?requirements.map(r=>'<option value="requirement:'+esc(r.id)+'">需求 · '+esc(r.title)+'</option>').join(''):'');
}
function kaForm(mode,req='',id=''){
 kaKeepDraft();const a=id?knowledgeAssets.get(id):null;
 const body='<div class="ka-form">'+(mode==='upload'?'<label>选择文件（单文件 ≤ 50 MB，可多选）<input id="ka-files" type="file" multiple></label>':'')+(mode!=='upload'?'<label>名称<input id="ka-name" value="'+esc(a?.name||'')+'" required></label>':'')+(mode==='link-new'?'<label>外部链接<input id="ka-link" type="url" placeholder="https://…"></label>':'')+'<label>用途<select id="ka-tag">'+kaOptions(kaPurposes,a?.purpose||'补充资料')+'</select></label><label>说明<textarea id="ka-description" rows="3" placeholder="例如：参考这个界面的布局，不照搬配色">'+esc(a?.description||'')+'</textarea></label>'+(a?'<p>文件、链接及所属范围不可覆盖；如需更换内容，请新增独立资产。</p>':'<label>继承可见范围<select id="ka-scope">'+kaScopeOptions(req)+'</select></label>')+'<p class="ka-reference-note">只保存在当前页面内存，刷新即清除；不发送给外部服务或 AI。'+(req?'保存后自动关联当前需求。':'')+'</p><p id="ka-error" class="ka-error" role="alert"></p></div>';
 openModal(a?'编辑资产说明':mode==='upload'?'上传参考资料':'添加参考链接',body,'<div class="dialog-footer"><button data-action="close">取消</button><button class="primary" data-ka="save" data-mode="'+mode+'" data-id="'+id+'" data-req="'+esc(req)+'">保存</button></div>');
}
async function kaSave(d){
 const description=$('#ka-description').value.trim(),purpose=$('#ka-tag').value;
 if(d.mode==='edit'){const a=knowledgeAssets.get(d.id);const name=$('#ka-name').value.trim();if(!name)throw Error('请填写名称');Object.assign(a,{name,description,purpose,updatedAt:new Date().toISOString()});}
 else{
  const scope=$('#ka-scope').value;
  if(d.req&&!knowledgeAssets.canLink({scope},d.req,kaReqProducts(d.req)))throw Error('所选范围不能关联当前需求');
  const [kind,id]=scope.split(':');if(kind==='product'?!productRegistry.products.some(p=>p.id===id):!R(id))throw Error('所属范围不可用');
  let inputs;
  if(d.mode==='upload'){
   const files=[...$('#ka-files').files];if(!files.length)throw Error('请先选择文件');if(files.length>10)throw Error('每次最多上传 10 个文件');
   if(files.some(f=>f.size>50*1024*1024))throw Error('单文件不能超过 50 MB，请重新选择');
   for(const file of files)if(file.type==='application/pdf'&&(await file.slice(0,5).text())!=='%PDF-')throw Error('文件不是有效的 PDF：'+file.name);
   inputs=files.map(file=>({name:file.name,file,scope,purpose,description}));
  }else{const name=$('#ka-name').value.trim();if(!name)throw Error('请填写名称');inputs=[{name,link:KnowledgeAssetLibrary.safeLink($('#ka-link').value),scope,purpose,description}];}
  inputs.forEach(input=>{const a=knowledgeAssets.add(input);if(d.req)knowledgeAssets.link(a.id,d.req,kaReqProducts(d.req));});
  if(vs.page==='knowledge-assets')Object.assign(kaUI,{query:'',type:'全部',purpose:'全部',status:'在用'});
 }
 $('#modal').close();render();toast('已保存参考资料；未解析内容，也未发送给 AI');
}
function kaPick(req){
 kaKeepDraft();const eligible=knowledgeAssets.items.filter(a=>!a.archived&&!a.refs.includes(req)&&knowledgeAssets.canLink(a,req,kaReqProducts(req)));
 openModal('引用已有资产',eligible.length?'<p>仅展示当前需求所属范围可引用的资产，不复制文件。</p>'+eligible.map(a=>'<div class="check"><span>'+esc(a.name)+'<small>'+esc(a.purpose)+'</small></span>'+kaButton('attach','引用',a.id,req)+'</div>').join(''):'<p>暂无可引用资产。可直接上传，或在资产模块创建同产品范围的资料。</p>','<div class="dialog-footer"><button data-action="close">关闭</button></div>');
}
function kaAssociate(a){
 const eligible=requirements.filter(r=>!a.refs.includes(r.id)&&knowledgeAssets.canLink(a,r.id,kaReqProducts(r.id)));
 openModal('关联需求',eligible.length?'<label>选择需求<select id="ka-associate" class="vselect">'+eligible.map(r=>'<option value="'+r.id+'">'+esc(r.id+' · '+r.title)+'</option>').join('')+'</select></label><p>仅展示资产所属范围内的需求，引用不会扩大权限。</p>':'<p>暂无同范围内未关联的需求。</p>',eligible.length?'<div class="dialog-footer"><button data-action="close">取消</button>'+kaButton('associate-save','确认关联',a.id)+'</div>':'<button data-action="close">关闭</button>');
}
function kaGo(id=''){kaKeepDraft();location.hash='/assets'+(id?'/'+encodeURIComponent(id):'');vs.page='knowledge-assets';render();window.scrollTo({top:0});}
const renderBeforeKnowledgeAssets=render;
render=function(){
 renderBeforeKnowledgeAssets();
 const nav=document.querySelector('.sidebar .nav');
 if(nav&&!nav.querySelector('[data-ka="home"]'))nav.insertAdjacentHTML('beforeend','<button data-ka="home" class="'+(vs.page==='knowledge-assets'?'active':'')+'"><span class="nav-icon" aria-hidden="true">'+sidebarIcon('panels-top-left')+'</span><span class="nav-text">资产</span></button>');
 if(vs.page==='knowledge-assets'){
  const content=document.querySelector('.content');if(!content)return;const id=location.hash.split('/')[2];
  try{content.innerHTML=id?kaDetail(knowledgeAssets.get(decodeURIComponent(id))):kaList();if(content.querySelector('.ka-pdf-view'))kaPDFPage(decodeURIComponent(id));}catch(error){content.innerHTML=kaButton('home','← 返回资产列表')+'<p class="ka-empty">'+esc(error.message)+'</p>';}
  document.querySelector('.topbar').innerHTML='<strong>工作空间 / 资产</strong><span class="badge gray">本地内存 · 权限模拟</span>';
  return;
 }
 const req=kaCurrentReq();if(!req)return;
 const controls=document.querySelector('.agent-controls');if(controls&&!controls.querySelector('[data-ka]'))controls.insertAdjacentHTML('afterbegin',kaButton('upload','＋ 上传资料','',req)+kaButton('link-new','添加链接','',req)+kaButton('pick','引用资产','',req));
 const conversation=document.querySelector('.requirement-conversation');
 if(conversation&&!conversation.querySelector('.ka-attachments')){
  const refs=knowledgeAssets.items.filter(a=>a.refs.includes(req));
  if(refs.length)conversation.insertAdjacentHTML('afterbegin','<div class="ka-reference-note">需求参考资料 · 未解析，AI 尚未读取；附件内容不作为开发指令。</div><div class="ka-attachments">'+refs.map(a=>'<div class="ka-attachment"><button class="ka-name" data-ka="detail" data-id="'+a.id+'">'+esc(a.name)+(a.archived?'（已归档）':'')+'</button><small>'+esc(a.purpose)+'</small><button data-ka="unlink" data-id="'+a.id+'" data-req="'+req+'" aria-label="移除 '+esc(a.name)+' 的需求引用">×</button></div>').join('')+'</div>');
 }
};
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-ka]');if(!b||b.disabled)return;e.preventDefault();e.stopImmediatePropagation();const d=b.dataset;
 try{
  if(d.ka==='home')return kaGo();if(d.ka==='detail')return kaGo(d.id);
  if(['upload','link-new','edit'].includes(d.ka))return kaForm(d.ka,d.req,d.id);
  if(d.ka==='save')return await kaSave(d);
  if(d.ka==='pdf-page')return kaPDFPage(d.id,Number(d.page));
  if(d.ka==='filter'){Object.assign(kaUI,{query:$('#ka-query').value.trim(),type:$('#ka-type').value,purpose:$('#ka-purpose').value,status:$('#ka-status').value});render();return;}
  if(d.ka==='pick')return kaPick(d.req);
  if(d.ka==='attach'){knowledgeAssets.link(d.id,d.req,kaReqProducts(d.req));$('#modal').close();render();return;}
  if(d.ka==='associate')return kaAssociate(knowledgeAssets.get(d.id));
  if(d.ka==='associate-save'){const req=$('#ka-associate').value;knowledgeAssets.link(d.id,req,kaReqProducts(req));$('#modal').close();render();return;}
  if(d.ka==='unlink'){kaKeepDraft();knowledgeAssets.unlink(d.id,d.req);render();toast('已移除引用，资产仍保留');return;}
  if(d.ka==='archive'){knowledgeAssets.archive(d.id);render();return;}
  if(d.ka==='delete'){const a=knowledgeAssets.get(d.id);if(a.refs.length)throw Error('资产仍被需求引用，不能删除；可先归档');openModal('删除资产','<p>将从当前原型内存中删除 '+esc(a.name)+'。此操作不会删除你电脑上的原文件。</p>','<button data-action="close">取消</button>'+kaButton('delete-confirm','确认删除',a.id));return;}
  if(d.ka==='delete-confirm'){knowledgeAssets.remove(d.id);if(kaURLs.has(d.id)){URL.revokeObjectURL(kaURLs.get(d.id));kaURLs.delete(d.id);}if(kaPDFDocuments.has(d.id)){kaPDFDocuments.get(d.id).then(doc=>doc.destroy()).catch(()=>{});kaPDFDocuments.delete(d.id);}$('#modal').close();kaGo();toast('已删除当前页资产记录，电脑上的原文件未改动');}
 }catch(error){const box=document.querySelector('#ka-error');if(box)box.textContent=error.message;else toast(error.message);}
},true);
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#/assets')){vs.page='knowledge-assets';render();}});
const kaSample=knowledgeAssets.add({name:'弱网提示需求补充说明.md',file:new File(['# 弱网提示参考资料（示例）\n\n网络延迟高于 80ms 时提示，允许继续进入游戏。\n此文件只用于演示资产引用，不代表开发指令。'],'弱网提示需求补充说明.md',{type:'text/markdown'}),scope:'product:p-sdk',purpose:'补充资料',description:'预置示例：需求沟通中提供的补充说明。',sample:true});
knowledgeAssets.link(kaSample.id,'REQ-101',['p-sdk']);
if(location.hash.startsWith('#/assets'))vs.page='knowledge-assets';
render();
