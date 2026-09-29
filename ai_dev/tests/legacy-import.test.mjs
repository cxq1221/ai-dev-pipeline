import { test, expect } from "bun:test";
import { SQL } from "bun";
import path from "node:path";
import { fixture, api } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";

test("旧会话一次性导入后保留历史上下文，重复导入不覆盖后端后续对话", async () => {
  const f = await fixture(), model = modelServer(body => {
    if (body.messages.at(-1).role !== "user") return null;
    const history = JSON.stringify(body.messages);
    if (history.includes("旧约定：按钮为绿色")) return { name: "update_requirement", arguments: JSON.stringify({ content: history.includes("新约定：圆角") ? "绿色圆角按钮" : "绿色按钮" }) };
    return null;
  });
  const backend = await startLlmBackend({ port: 0, databaseUrl: process.env.TEST_DATABASE_URL, modelBaseUrl: model.url });
  const gw = await startGateway({ port: 0, previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), executorUrl: backend.url, databaseUrl: process.env.TEST_DATABASE_URL });
  const wait = async id => { for (let i = 0; i < 100; i++) { const s = await api(gw.url, `/api/conversations/${id}/state`); if (!s.busy) return; await Bun.sleep(40); } throw new Error("超时"); };
  try {
    const r = await api(gw.url, "/api/requirements", { title: "历史数据", originalDescription: "按钮", repositoryPath: f.repo });
    const id = crypto.randomUUID(), now = Date.now();
    const sql = new SQL(process.env.TEST_DATABASE_URL);
    await sql`INSERT INTO conversations (id,requirement_id,title,model,context_messages,created_at,updated_at) VALUES (${id},${r.id},'历史对话','deepseek-flash',${JSON.stringify([{ role: "user", content: [{ type: "text", text: "旧约定：按钮为绿色" }], timestamp: now }])},${now},${now})`;
    await sql.close();
    const migrate = async () => {
      const proc = Bun.spawn([process.execPath, "scripts/migrate-llm-context.mjs"], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, LLM_DATABASE_URL: process.env.TEST_DATABASE_URL }, stdout: "pipe", stderr: "pipe" });
      const error = await new Response(proc.stderr).text();
      if (await proc.exited) throw new Error(error);
    };
    await expect(api(gw.url, `/api/conversations/${id}/chat`, { message: "迁移前不能丢失历史" })).rejects.toMatchObject({ status: 409 });
    await migrate();
    await api(gw.url, `/api/conversations/${id}/chat`, { message: "新约定：圆角" }); await wait(id);
    expect((await api(gw.url, `/api/requirements/${r.id}`)).clarifiedDescription).toBe("绿色圆角按钮");
    await migrate();
    await api(gw.url, `/api/conversations/${id}/chat`, { message: "按全部约定更新说明" }); await wait(id);
    expect((await api(gw.url, `/api/requirements/${r.id}`)).clarifiedDescription).toBe("绿色圆角按钮");
  } finally { await gw.close(); await backend.close(); model.close(); }
}, 30000);
