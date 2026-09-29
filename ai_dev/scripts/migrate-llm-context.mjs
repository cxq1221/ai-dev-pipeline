import { connect, migrate } from "../backend/gateway/db.mjs";
import { importContexts } from "../backend/llm/import-context.mjs";
const sql = await connect(process.env.DATABASE_URL);
try {
  await migrate(sql);
  const running = await sql`SELECT id FROM turns WHERE status IN ('running','queued') LIMIT 1`;
  if (running.length) throw new Error("请先停止应用并结束运行/排队中的任务，再迁移上下文");
  const rows = await sql`SELECT c.id,c.context_messages,r.workspace_path FROM conversations c JOIN requirements r ON r.id=c.requirement_id LEFT JOIN conversation_backends cb ON cb.conversation_id=c.id WHERE cb.backend_id IS NULL OR cb.backend_id='local'`;
  const result = await importContexts(process.env.LLM_DATABASE_URL, rows.map(row => ({ id: row.id, workspacePath: row.workspace_path, messages: typeof row.context_messages === "string" ? JSON.parse(row.context_messages) : row.context_messages })));
  for (const row of rows) await sql`INSERT IGNORE INTO legacy_context_imports VALUES (${row.id},${Date.now()})`;
  await sql`INSERT IGNORE INTO conversation_backends (conversation_id,backend_id) SELECT id,'local' FROM conversations`;
  console.log(JSON.stringify({ ...result, sourceRetained: true }));
} finally { await sql.close(); }
