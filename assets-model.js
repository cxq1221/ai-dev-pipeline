// In-memory prototype. Access scopes model relationships, not security enforcement.
class KnowledgeAssetLibrary {
  constructor() { this.items = []; this.sequence = 0; }
  static safeLink(value) {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('请填写不含账号密码的 HTTP / HTTPS 链接');
    return url.href;
  }
  static fileType(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','gif','webp','bmp'].includes(ext)) return '图片';
    if (ext === 'pdf') return 'PDF';
    if (['doc','docx','xls','xlsx','ppt','pptx','csv','txt','md'].includes(ext)) return '办公文档';
    if (['fig','sketch','psd','ai','xd','svg'].includes(ext)) return '设计文件';
    if (['mp4','mov','webm','avi'].includes(ext)) return '视频';
    if (['apk','ipa','exe','dmg','zip','rar','7z'].includes(ext)) return 'Demo / 压缩包';
    return '其他文件';
  }
  add(input) {
    if (!input.name?.trim()) throw Error('请填写资产名称');
    if (!/^(product|requirement):.+$/.test(input.scope || '')) throw Error('请选择所属产品或需求');
    const link = input.link ? KnowledgeAssetLibrary.safeLink(input.link) : '';
    if (!link && !input.file) throw Error('请选择文件或填写链接');
    if (input.file && input.file.size > 50 * 1024 * 1024) throw Error('单个文件不能超过 50 MB');
    const now = new Date().toISOString();
    const item = {id:'ASSET-'+String(++this.sequence).padStart(3,'0'),name:input.name.trim(),
      description:input.description || '',purpose:input.purpose || '补充资料',scope:input.scope,
      type:link?'外部链接':KnowledgeAssetLibrary.fileType(input.file.name),link,file:input.file || null,
      refs:[],archived:false,createdAt:now,updatedAt:now,uploader:'Joey（演示）',sample:!!input.sample};
    this.items.unshift(item);return item;
  }
  get(id) { const item=this.items.find(x=>x.id===id);if(!item)throw Error('资产不存在或刷新后已清除');return item; }
  canLink(item,reqId,productIds=[]) {
    return item.scope==='requirement:'+reqId || productIds.some(p=>item.scope==='product:'+p);
  }
  link(id,reqId,productIds=[]) {
    const item=this.get(id);
    if(item.archived)throw Error('归档资产不能新增引用');
    if(!this.canLink(item,reqId,productIds))throw Error('超出资产所属范围，不能通过引用扩大权限');
    if(!item.refs.includes(reqId))item.refs.push(reqId);
    item.updatedAt=new Date().toISOString();return item;
  }
  unlink(id,reqId) { const item=this.get(id);item.refs=item.refs.filter(r=>r!==reqId);item.updatedAt=new Date().toISOString(); }
  archive(id) { const item=this.get(id);item.archived=!item.archived;item.updatedAt=new Date().toISOString(); }
  remove(id) {
    const item=this.get(id);if(item.refs.length)throw Error('资产仍被需求引用，不能删除；可归档或先移除引用');
    this.items=this.items.filter(x=>x.id!==id);return item;
  }
}
