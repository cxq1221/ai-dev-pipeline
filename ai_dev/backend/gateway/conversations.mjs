import { randomUUID } from "node:crypto";
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);
export function conversations(sql) {
  return {
    async get(id) {
      const [row] = await sql`SELECT c.*, COALESCE(rc.mode, 'clarification') AS mode, (rc.conversation_id=c.id) AS isClarification FROM conversations c LEFT JOIN requirement_clarifications rc ON rc.requirement_id=c.requirement_id WHERE c.id=${id}`;
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
        mode: row.mode,
        turns,
        busy: turns.some((t) => t.status === "running" || t.status === "queued"),
      };
    },
    async create(requirementId, title = "需求讨论") {
      const [clarification] = await sql`SELECT mode FROM requirement_clarifications WHERE requirement_id=${requirementId}`;
      if (clarification?.mode !== "development")
        throw Object.assign(new Error("请先完成需求澄清"), { status: 409 });
      const id = randomUUID(),
        now = Date.now();
      await sql`INSERT INTO conversations (id,requirement_id,title,model,context_messages,created_at,updated_at) VALUES (${id},${requirementId},${title},${"deepseek-flash"},${"[]"},${now},${now})`;
      return { id, title, requirementId };
    },
    async list(id) {
      return await sql`SELECT c.id, c.title, c.model, COALESCE(rc.mode, 'clarification') AS mode, (rc.conversation_id=c.id) AS isClarification FROM conversations c LEFT JOIN requirement_clarifications rc ON rc.requirement_id=c.requirement_id WHERE c.requirement_id=${id} ORDER BY c.created_at`;
    },
    async clarification(requirementId) {
      return sql.begin(async (tx) => {
        const [r] = await tx`SELECT id FROM requirements WHERE id=${requirementId} FOR UPDATE`;
        if (!r) throw Object.assign(new Error("需求不存在"), { status: 404 });
        const [existing] = await tx`SELECT conversation_id FROM requirement_clarifications WHERE requirement_id=${requirementId}`;
        if (existing) return existing.conversation_id;
        const id = randomUUID(), now = Date.now();
        await tx`INSERT INTO conversations (id,requirement_id,title,model,context_messages,created_at,updated_at) VALUES (${id},${requirementId},${"需求澄清"},${"deepseek-flash"},${"[]"},${now},${now})`;
        await tx`INSERT INTO requirement_clarifications (requirement_id,conversation_id) VALUES (${requirementId},${id})`;
        return id;
      });
    },
    async begin(id, message, turnId) {
      const now = Date.now();
      await sql`INSERT INTO turns (id,conversation_id,prompt,blocks,status,started_at) VALUES (${turnId},${id},${message},${"[]"},${"running"},${now})`;
    },
    async save(id, snapshot) {
      const t = snapshot.turn;
      if (!t) return;
      await sql.begin(async (tx) => {
        const [previous] = await tx`SELECT status FROM turns WHERE id=${t.id} AND conversation_id=${id} FOR UPDATE`;
        if (!previous) return;
        const completed = t.status === "done" && !snapshot.busy && !t.error
          && previous.status === "running"
          && t.blocks?.find(b => b.type === "tool" && b.name === "complete_clarification" && b.status === "done" && typeof b.args?.content === "string" && b.args.content.trim());
        let startAutomatically = false;
        if (completed) {
          const [clarification] = await tx`SELECT requirement_id FROM requirement_clarifications WHERE conversation_id=${id} AND mode='clarification' FOR UPDATE`;
          if (clarification) {
            await tx`UPDATE requirements SET clarified_description=${completed.args.content},updated_at=${Date.now()} WHERE id=${clarification.requirement_id}`;
            await tx`UPDATE requirement_clarifications SET mode='development' WHERE conversation_id=${id}`;
            startAutomatically = true;
          }
        }
        await tx`UPDATE turns SET blocks=${JSON.stringify(t.blocks)},status=${t.status},error=${t.error || null},source_ref=${t.sourceRef ? JSON.stringify(t.sourceRef) : null},finished_at=${t.finishedAt || null} WHERE id=${t.id} AND conversation_id=${id} AND (status='running' OR ${t.status} <> 'running')`;
        if (!snapshot.busy && snapshot.messages)
          await tx`UPDATE conversations SET context_messages=${JSON.stringify(snapshot.messages)},checkpoint_turn_id=${t.id},updated_at=${Date.now()} WHERE id=${id} AND NOT EXISTS (SELECT 1 FROM turns WHERE conversation_id=${id} AND started_at > ${t.startedAt || 0})`;
        if (startAutomatically) {
          const nextId = `auto-${t.id}`, now = Math.max(Date.now(), Number(t.startedAt || 0) + 1);
          const prompt = "需求澄清已完成，请按照已保存的需求结论立即开始开发，完成实现与验证；无需再次询问是否开始。";
          await tx`INSERT INTO turns (id,conversation_id,prompt,blocks,status,started_at) VALUES (${nextId},${id},${prompt},${"[]"},${"queued"},${now})`;
        }
      });
    },
  };
}
