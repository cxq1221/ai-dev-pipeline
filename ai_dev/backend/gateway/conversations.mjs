import { randomUUID } from "node:crypto";
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
export function conversations(sql) {
  return {
    async get(id) {
      const [row] = await sql`SELECT * FROM conversations WHERE id=${id}`;
      if (!row) throw Object.assign(new Error("会话不存在"), { status: 404 });
      return { ...row, context_messages: json(row.context_messages) };
    },
    async state(id) {
      const row = await this.get(id);
      const turns = (
        await sql`SELECT * FROM turns WHERE conversation_id=${id} ORDER BY started_at, id`
      ).map((t) => ({
        id: t.id,
        prompt: t.prompt,
        blocks: json(t.blocks),
        status: t.status,
        error: t.error,
        changes: [],
        sourceRef: json(t.source_ref),
        startedAt: Number(t.started_at),
        finishedAt: t.finished_at == null ? null : Number(t.finished_at),
      }));
      return {
        id,
        requirementId: row.requirement_id,
        model: row.model,
        turns,
        busy: turns.some((t) => t.status === "running"),
      };
    },
    async create(requirementId, title = "需求讨论") {
      const id = randomUUID(),
        now = Date.now();
      await sql`INSERT INTO conversations (id,requirement_id,title,model,context_messages,created_at,updated_at) VALUES (${id},${requirementId},${title},${"deepseek-flash"},${"[]"},${now},${now})`;
      return { id, title, requirementId };
    },
    async list(id) {
      return await sql`SELECT id, title, model FROM conversations WHERE requirement_id=${id} ORDER BY created_at`;
    },
    async begin(id, message, turnId) {
      const now = Date.now();
      await sql`INSERT INTO turns (id,conversation_id,prompt,blocks,status,started_at) VALUES (${turnId},${id},${message},${"[]"},${"running"},${now})`;
    },
    async save(id, snapshot) {
      const t = snapshot.turn;
      if (!t) return;
      await sql.begin(async (tx) => {
        await tx`UPDATE turns SET blocks=${JSON.stringify(t.blocks)},status=${t.status},error=${t.error || null},source_ref=${t.sourceRef ? JSON.stringify(t.sourceRef) : null},finished_at=${t.finishedAt || null} WHERE id=${t.id} AND conversation_id=${id} AND (status='running' OR ${t.status} <> 'running')`;
        if (!snapshot.busy && snapshot.messages)
          await tx`UPDATE conversations SET context_messages=${JSON.stringify(snapshot.messages)},checkpoint_turn_id=${t.id},updated_at=${Date.now()} WHERE id=${id} AND NOT EXISTS (SELECT 1 FROM turns WHERE conversation_id=${id} AND started_at > ${t.startedAt || 0})`;
      });
    },
  };
}
