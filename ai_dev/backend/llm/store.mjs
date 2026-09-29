import { SQL } from "bun";
export async function openStore(url) {
  if (!url) throw new Error("需要 LLM_DATABASE_URL");
  const sql = new SQL(url);
  const migration = await Bun.file(new URL("./migrations/001_runtime.sql", import.meta.url)).text();
  for (const statement of migration.split(";").map(s => s.trim()).filter(Boolean)) await sql.unsafe(statement);
  return {
    sql,
    async session(id) { return (await sql`SELECT * FROM llm_sessions WHERE id=${id}`)[0]; },
    async execution(id) {
      let [row] = await sql`SELECT * FROM llm_session_execution WHERE session_id=${id}`;
      if (!row) {
        // Additive, lazy upgrade; retain the old event history unchanged.
        const runs = await sql`SELECT * FROM llm_runs WHERE session_id=${id}`;
        const latest = runs.map(run => ({ run, turn: run.events.findLast(e => e.turn)?.turn }))
          .sort((a, b) => Number(b.turn?.startedAt || 0) - Number(a.turn?.startedAt || 0))[0];
        if (latest) {
          const { run, turn } = latest;
          const current = turn || { id: run.id, prompt: run.request.message, blocks: [], status: run.status };
          await sql`INSERT IGNORE INTO llm_session_execution (session_id,state,request,current,calls) VALUES (${id},${run.status === "running" ? "running" : "idle"},${JSON.stringify(run.request)},${JSON.stringify(current)},'[]')`;
          [row] = await sql`SELECT * FROM llm_session_execution WHERE session_id=${id}`;
        }
      }
      return row;
    },
    async accept(input) {
      return sql.begin(async tx => {
        await tx`INSERT IGNORE INTO llm_sessions (id,workspace_path,messages) VALUES (${input.sessionId},${input.workspacePath},${JSON.stringify([])})`;
        const [session] = await tx`SELECT * FROM llm_sessions WHERE id=${input.sessionId} FOR UPDATE`;
        if (session.workspace_path !== input.workspacePath) throw Object.assign(new Error("会话工作区不可变更"), { status: 409 });
        const [prior] = await tx`SELECT state FROM llm_session_execution WHERE session_id=${input.sessionId}`;
        if (prior && prior.state !== "idle") throw Object.assign(new Error("当前会话仍在执行"), { status: 409 });
        const current = { id: input.runId, prompt: input.message, blocks: [], status: "running", startedAt: Date.now() };
        await tx`INSERT INTO llm_session_execution (session_id,state,request,current,calls) VALUES (${input.sessionId},'running',${JSON.stringify(input)},${JSON.stringify(current)},'[]') ON DUPLICATE KEY UPDATE state='running',request=VALUES(request),current=VALUES(current),calls='[]'`;
        return { session, current };
      });
    },
    async save(input, state, current, calls, messages) {
      await sql.begin(async tx => {
        await tx`UPDATE llm_session_execution SET state=${state},current=${JSON.stringify(current)},calls=${JSON.stringify(calls)} WHERE session_id=${input.sessionId}`;
        if (messages) await tx`UPDATE llm_sessions SET messages=${JSON.stringify(messages)} WHERE id=${input.sessionId}`;
      });
    },
    close: () => sql.close(),
  };
}
