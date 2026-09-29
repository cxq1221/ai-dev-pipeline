export async function backendRegistry(sql, configurations, defaultId, legacyUrl) {
  if (!Array.isArray(configurations) || !configurations.length) throw new Error("至少配置一个大模型后端");
  for (const config of configurations) {
    const target = new URL(config.url);
    if (!/^[a-zA-Z0-9-]{1,100}$/.test(config.id) || !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) || target.protocol !== "http:") throw new Error("首版后端必须使用本机 HTTP 地址和有效 ID");
    await sql`INSERT INTO llm_backends (id,name,url) VALUES (${config.id},${config.name || config.id},${config.url.replace(/\/$/, "")}) ON DUPLICATE KEY UPDATE name=VALUES(name),url=VALUES(url)`;
  }
  if (!configurations.some(c => c.id === defaultId)) throw new Error("默认后端不在配置列表中");
  // Existing conversations belong to the original backend, regardless of new default.
  await sql`INSERT IGNORE INTO llm_backends VALUES ('local','原本机后端',${legacyUrl})`;
  await sql`INSERT IGNORE INTO conversation_backends (conversation_id,backend_id) SELECT id,'local' FROM conversations`;
  return {
    defaultId,
    choose(id = defaultId) {
      if (!configurations.some(c => c.id === id)) throw Object.assign(new Error("后端不可用于新会话"), { status: 400 });
      return id;
    },
    async url(id) {
      const [row] = await sql`SELECT b.url FROM conversation_backends cb JOIN llm_backends b ON b.id=cb.backend_id WHERE cb.conversation_id=${id}`;
      if (!row) throw Object.assign(new Error("会话未绑定后端"), { status: 409 });
      return row.url;
    },
    list: () => configurations.map(({ id, name }) => ({ id, name: name || id })),
  };
}
