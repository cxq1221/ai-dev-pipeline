import { test, expect } from "bun:test";
import { SQL } from "bun";
import path from "node:path";
import fs from "node:fs/promises";
import { fixture, api } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startLlmBackend } from "../backend/llm/http.mjs";
import { startGateway } from "../backend/gateway/http.mjs";

test("澄清首次发送才建会话，限制写入，开发沿用同一会话", async () => {
  const f = await fixture(), model = modelServer();
  const ex = await startLlmBackend({ databaseUrl: process.env.TEST_DATABASE_URL, port: 0, dataRoot: path.join(f.root, "runtime"), modelBaseUrl: model.url });
  const options = { previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), port: 0, executorUrl: ex.url, databaseUrl: process.env.TEST_DATABASE_URL };
  let gw = await startGateway(options);
  const wait = async (id) => {
    for (let i = 0; i < 100; i++) {
      const state = await api(gw.url, `/api/conversations/${id}/state`);
      if (!state.busy) return state;
      await Bun.sleep(30);
    }
    throw new Error("澄清执行超时");
  };
  try {
    const req = await api(gw.url, "/api/requirements", { title: "澄清测试", originalDescription: "做一个页面", repositoryPath: f.repo });
    const route = `/api/requirements/${req.id}/clarification`;
    const list = () => api(gw.url, `/api/requirements/${req.id}/conversations`);
    const create = () => api(gw.url, `/api/requirements/${req.id}/conversations`, { title: "新对话" });
    const blocked = async () => {
      await expect(create()).rejects.toMatchObject({ status: 409, message: "请先完成需求澄清" });
    };
    expect(await list()).toEqual([]);
    await blocked();
    await expect(api(gw.url, route, { message: "" })).rejects.toThrow();
    expect(await list()).toEqual([]);
    const first = await api(gw.url, route, { message: "请澄清需求" });
    expect((await wait(first.conversationId)).mode).toBe("clarification");
    const systemText = model.requests.at(-1).messages.filter(m => m.role === "system").map(m => m.content).join("\n");
    const grilling = await fs.readFile(new URL("../backend/gateway/prompts/grilling.md", import.meta.url), "utf8");
    expect(systemText).toContain(grilling.trim());
    expect(systemText).toContain("用户说“全部按推荐”或“你决定”算有效回答");
    await api(gw.url, `/api/conversations/${first.conversationId}/chat`, { message: "开始开发", startDevelopment: true });
    expect((await wait(first.conversationId)).mode).toBe("clarification");
    await blocked();
    const toolNames = model.requests.at(-1).tools.map(t => t.function.name);
    expect(toolNames).toContain("read");
    expect(toolNames).toContain("list_files");
    expect(toolNames).toContain("update_requirement");
    for (const name of ["bash", "write", "edit"]) expect(toolNames).not.toContain(name);
    await api(gw.url, `/api/conversations/${first.conversationId}/chat`, { message: "写入 blocked.txt" });
    await wait(first.conversationId);
    expect(await fs.exists(path.join(req.workspacePath, "blocked.txt"))).toBe(false);
    await api(gw.url, `/api/conversations/${first.conversationId}/chat`, { message: "更新说明" });
    await wait(first.conversationId);
    expect((await api(gw.url, `/api/requirements/${req.id}`)).clarifiedDescription).toContain("80ms");
    await blocked();
    await gw.close();
    gw = await startGateway(options);
    const again = await api(gw.url, route, { message: "继续讨论" });
    expect(again.conversationId).toBe(first.conversationId);
    expect((await wait(first.conversationId)).mode).toBe("clarification");
    expect((await list()).length).toBe(1);
    await blocked();
    await api(gw.url, `/api/conversations/${first.conversationId}/chat`, { message: "全部按推荐" });
    expect((await wait(first.conversationId)).mode).toBe("clarification");
    await api(gw.url, `/api/conversations/${first.conversationId}/chat`, { message: "开始开发" });
    expect((await wait(first.conversationId)).mode).toBe("development");
    expect(model.requests.at(-1).tools.map(t => t.function.name)).toContain("bash");
    const automatic = (await wait(first.conversationId)).turns.filter(t => t.id.startsWith("auto-"));
    expect(automatic).toHaveLength(1);
    expect(automatic[0].status).toBe("done");
    const requestCount = model.requests.length;
    await Promise.all(Array.from({ length: 5 }, () => api(gw.url, `/api/conversations/${first.conversationId}/state`)));
    expect(model.requests.length).toBe(requestCount);
    await api(gw.url, `/api/conversations/${first.conversationId}/chat`, { message: "写入 allowed.txt" });
    await wait(first.conversationId);
    expect(await fs.readFile(path.join(req.workspacePath, "allowed.txt"), "utf8")).toBe("并发成果");
    expect((await list()).length).toBe(1);
    const other = await api(gw.url, "/api/requirements", { title: "另一个需求", originalDescription: "暂未澄清", repositoryPath: f.repo });
    await expect(api(gw.url, `/api/requirements/${other.id}/conversations`, { title: "不应创建" })).rejects.toMatchObject({ status: 409 });
    // Seed a historical ordinary conversation that predates the clarification gate.
    const sql = new SQL(process.env.TEST_DATABASE_URL);
    const legacyId = crypto.randomUUID(), now = Date.now();
    try {
      await sql`INSERT INTO conversations (id,requirement_id,title,model,context_messages,created_at,updated_at) VALUES (${legacyId},${other.id},${"历史对话"},${"deepseek-flash"},${"[]"},${now},${now})`;
    } finally { await sql.close(); }
    await gw.close(); gw = await startGateway(options);
    expect((await api(gw.url, `/api/conversations/${legacyId}/state`)).turns).toEqual([]);
    await api(gw.url, `/api/conversations/${legacyId}/chat`, { message: "继续历史讨论" });
    expect((await wait(legacyId)).turns.at(-1).status).toBe("done");
    expect((await api(gw.url, `/api/conversations/${legacyId}/state`)).mode).toBe("clarification");
    expect(model.requests.at(-1).tools.map(t => t.function.name)).not.toContain("bash");
    await expect(api(gw.url, `/api/conversations/${legacyId}/chat`, { message: "开始开发", startDevelopment: true })).rejects.toMatchObject({ status: 409 });
    const created = await create();
    expect((await list()).length).toBe(2);
    await gw.close();
    gw = await startGateway(options);
    await create();
    expect((await api(gw.url, `/api/conversations/${created.id}/state`)).turns).toEqual([]);
  } finally { await gw.close(); await ex.close(); model.close(); }
}, 20000);


test("完成澄清工具执行后轮次失败仍不放行，重试成功才进入开发", async () => {
  let failCompletion = true;
  const f = await fixture(), model = modelServer(body => {
    const last = body.messages.at(-1);
    if (last.role === "tool") {
      return failCompletion ? Response.json({ error: { message: "模拟模型检查失败" } }, { status: 400 }) : null;
    }
    if (body.tools.some(t => t.function.name === "complete_clarification")) {
      return { name: "complete_clarification", arguments: JSON.stringify({ content: "按用户已接受的推荐展示首页，验收首页内容可见。" }) };
    }
    return null;
  });
  const ex = await startLlmBackend({ databaseUrl: process.env.TEST_DATABASE_URL, port: 0, dataRoot: path.join(f.root, "runtime"), modelBaseUrl: model.url });
  const gw = await startGateway({ previewPort: 0, workspaceRoot: path.join(f.root, "workspaces"), port: 0, executorUrl: ex.url, databaseUrl: process.env.TEST_DATABASE_URL });
  const wait = async id => {
    for (let i = 0; i < 100; i++) {
      const state = await api(gw.url, `/api/conversations/${id}/state`);
      if (!state.busy) return state;
      await Bun.sleep(30);
    }
    throw new Error("澄清检查超时");
  };
  try {
    const r = await api(gw.url, "/api/requirements", { title: "检查失败", originalDescription: "展示首页", repositoryPath: f.repo });
    const { conversationId: id } = await api(gw.url, `/api/requirements/${r.id}/clarification`, { message: "全部按推荐" });
    await wait(id);
    await api(gw.url, `/api/conversations/${id}/chat`, { message: "开始开发", startDevelopment: true });
    const failed = await wait(id);
    expect(failed.turns.at(-1).status).toBe("error");
    expect(failed.turns.at(-1).blocks.some(b => b.name === "complete_clarification" && b.status === "done")).toBe(true);
    expect(failed.mode).toBe("clarification");
    await expect(api(gw.url, `/api/requirements/${r.id}/conversations`, { title: "不应放行" })).rejects.toMatchObject({ status: 409 });
    failCompletion = false;
    await api(gw.url, `/api/conversations/${id}/chat`, { message: "开始开发" });
    expect((await wait(id)).mode).toBe("development");
    expect((await api(gw.url, `/api/requirements/${r.id}`)).clarifiedDescription).toContain("验收首页内容可见");
  } finally { await gw.close(); await ex.close(); model.close(); }
}, 20000);
