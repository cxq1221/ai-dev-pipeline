import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import express from "express";
import {
  createSessionStore,
  DEMO,
  sessionId,
  validateIdentity,
} from "../backend/sessions.mjs";
import { createApi, createPreview } from "../backend/http.mjs";
import { resolveModel as realResolveModel } from "../backend/models.mjs";

// No provider calls in these tests; the real file tools, checkpoints and HTTP routes run.
class FakeAgent {
  constructor(options) {
    this.state = { ...options.initialState };
    this.listeners = new Set();
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(event) {
    for (const fn of this.listeners) fn(event);
  }
  abort() {
    this.controller?.abort();
  }
  async prompt(prompt) {
    this.controller = new AbortController();
    this.state.messages.push({ role: "user", content: prompt });
    this.emit({ type: "message_start", message: { role: "assistant" } });
    if (prompt === "hold")
      await delay(1000, undefined, { signal: this.controller.signal });
    if (prompt.startsWith("write:")) {
      const args = { path: "index.html", content: prompt.slice(6) };
      this.emit({
        type: "tool_execution_start",
        toolCallId: "write-1",
        toolName: "write_file",
        args,
      });
      const result = await this.state.tools
        .find((t) => t.name === "write_file")
        .execute("write-1", args, this.controller.signal);
      this.emit({ type: "tool_execution_end", toolCallId: "write-1", result });
    }
    this.emit({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "完成 " + this.state.model.id,
      },
    });
  }
}
function resolveModel(name) {
  const config = realResolveModel(name);
  return { ...config, apiKey: "test-only-placeholder" };
}
const A = {
  appID: "client001",
  session: "conversation-1",
  model: "deepseek-flash",
};
const B = { ...A, appID: "client002" };
const C = { ...A, session: "conversation-2" };
async function setup(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "pi-api-test-"));
  const store = createSessionStore({
    base,
    previewOrigin: "http://127.0.0.1:4328",
    resolveModel,
    agentFactory: (o) => new FakeAgent(o),
  });
  t.after(async () => {
    await store.dispose();
    await fs.rm(base, { recursive: true, force: true });
  });
  return { base, store };
}
async function idle(session) {
  for (let i = 0; i < 200; i++) {
    if (!session.getState().busy) return;
    await delay(10);
  }
  throw new Error("session did not become idle");
}
async function write(session, text) {
  await session.chat("write:" + text, "deepseek-flash");
  await idle(session);
}

test("required identities validate strings, exact nine characters and safe session syntax", () => {
  assert.deepEqual(validateIdentity(A), A);
  assert.equal(
    validateIdentity({ ...A, appID: "123456789" }).appID,
    "123456789",
  );
  for (const appID of [
    undefined,
    null,
    123456789,
    "client01",
    "client0001",
    "a bcd1234",
    {},
    ["client001"],
  ])
    assert.throws(() => validateIdentity({ ...A, appID }));
  for (const session of [
    undefined,
    "",
    "../outside",
    "a/b",
    {},
    "a".repeat(129),
  ])
    assert.throws(() => validateIdentity({ ...A, session }));
  for (const model of [undefined, "", 12, {}])
    assert.throws(() => validateIdentity({ ...A, model }));
  assert.throws(() => realResolveModel("unknown"));
  assert.equal(realResolveModel("deepseek-v4-pro").model.id, "deepseek-v4-pro");
});

test("concurrent lookups share one instance, apps and sessions have separate workspaces", async (t) => {
  const { store } = await setup(t);
  const [a, a2, b, c] = await Promise.all([
    store.get(A),
    store.get(A),
    store.get(B),
    store.get(C),
  ]);
  assert.equal(a, a2);
  assert.notEqual(a.root, b.root);
  assert.notEqual(a.root, c.root);
  await Promise.all([write(a, "A"), write(b, "B"), write(c, "C")]);
  for (const [session, text] of [
    [a, "A"],
    [b, "B"],
    [c, "C"],
  ]) {
    assert.equal(
      await fs.readFile(path.join(session.root, "index.html"), "utf8"),
      text,
    );
    assert.equal(session.getState().turns.length, 1);
  }
  assert.equal("csrf" in a.getState(), false);
});

test("model parameter selects each turn while keeping the same conversation", async (t) => {
  const { store } = await setup(t);
  const a = await store.get(A);
  await write(a, "one");
  const same = await store.get({ ...A, model: "deepseek-v4-pro" });
  assert.equal(a, same);
  await same.chat("hello", "deepseek-v4-pro");
  await idle(same);
  assert.equal(a.getState().model, "deepseek-v4-pro");
  assert.equal(a.getState().turns.length, 2);
  assert.equal(a.getState().turns[0].model, "deepseek-flash");
  await assert.rejects(store.get({ ...A, model: "unknown" }), { status: 400 });
  assert.equal(a.getState().turns.length, 2);
});

test("busy protection, stop and emitted events are scoped to one session", async (t) => {
  const { store } = await setup(t);
  const a = await store.get(A),
    b = await store.get(B);
  const seenA = [],
    seenB = [];
  a.subscribe((s) => seenA.push(s));
  b.subscribe((s) => seenB.push(s));
  await a.chat("hold", A.model);
  await assert.rejects(a.chat("another", A.model), { status: 409 });
  await assert.rejects(a.reset(), { status: 409 });
  b.stop();
  assert.equal(a.getState().busy, true);
  await write(b, "only B");
  a.stop();
  await idle(a);
  assert.equal(a.getState().turns[0].status, "stopped");
  assert.equal(b.getState().turns[0].status, "done");
  assert.ok(seenA.every((s) => s.appID === A.appID));
  assert.ok(seenB.every((s) => s.appID === B.appID));
  assert.equal(a.getState().turns.length, 1);
});

test("undo and reset do not affect other apps or sessions", async (t) => {
  const { store } = await setup(t);
  const a = await store.get(A),
    b = await store.get(B),
    c = await store.get(C);
  await Promise.all([write(a, "A"), write(b, "B"), write(c, "C")]);
  await a.undo();
  assert.equal(a.getState().turns[0].status, "undone");
  await assert.rejects(fs.readFile(path.join(a.root, "index.html")), {
    code: "ENOENT",
  });
  await b.reset();
  assert.equal(b.getState().turns.length, 0);
  assert.equal(await fs.readFile(path.join(b.root, "index.html"), "utf8"), "B");
  assert.equal(c.getState().turns.length, 1);
  assert.equal(await fs.readFile(path.join(c.root, "index.html"), "utf8"), "C");
});

test("model and history persist, scoped preview can restore a session after restart", async (t) => {
  const { base, store } = await setup(t);
  const a = await store.get(A);
  await write(a, "saved");
  await a.chat("hello", "deepseek-v4-pro");
  await idle(a);
  await store.dispose();
  const reopened = createSessionStore({
    base,
    previewOrigin: "http://127.0.0.1:4328",
    resolveModel,
    agentFactory: (o) => new FakeAgent(o),
  });
  t.after(() => reopened.dispose());
  const saved = await reopened.getPreview(sessionId(A));
  assert.equal(saved.getState().model, "deepseek-v4-pro");
  assert.equal(saved.getState().turns.length, 2);
  assert.equal(
    await fs.readFile(path.join(saved.root, "index.html"), "utf8"),
    "saved",
  );
});

test("existing demo files and legacy history remain attached to the default identity", async (t) => {
  const { base, store } = await setup(t);
  await fs.mkdir(path.join(base, ".data"));
  await fs.mkdir(path.join(base, "workspace"));
  await fs.writeFile(path.join(base, "workspace", "index.html"), "existing");
  await fs.writeFile(
    path.join(base, ".data/session.json"),
    JSON.stringify({
      turns: [{ id: "old", status: "done", blocks: [], changes: [] }],
      messages: [],
    }),
  );
  const legacy = await store.get(DEMO);
  assert.equal(legacy.root, path.join(base, "workspace"));
  assert.equal(legacy.getState().turns[0].id, "old");
  const other = await store.get(A);
  assert.equal(other.getState().turns.length, 0);
  assert.equal(
    await fs.readFile(path.join(legacy.root, "index.html"), "utf8"),
    "existing",
  );
});

test("HTTP contract needs no token and scopes state, SSE, files, preview and mutations", async (t) => {
  const { store } = await setup(t);
  const app = express();
  app.use("/api", createApi(store));
  app.use(createPreview(store));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (route, identity = A, extra = {}) =>
    fetch(
      origin + route + "?" + new URLSearchParams({ ...identity, ...extra }),
    );
  const post = (route, body) =>
    fetch(origin + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await fetch(origin + "/api/state")).status, 400);
  assert.equal((await get("/api/state", { ...A, appID: "short" })).status, 400);
  assert.equal(
    (await get("/api/state", { ...A, model: "unknown" })).status,
    400,
  );
  assert.equal((await post("/api/chat", { ...A, message: 12 })).status, 400);
  assert.equal(
    (await fetch(origin + "/api/stop", { method: "POST" })).status,
    415,
  );
  const response = await post("/api/chat", {
    ...A,
    message: "write:<h1>API test</h1>",
  });
  assert.equal(response.status, 202);
  const accepted = await response.json();
  assert.equal(accepted.session, A.session);
  assert.ok(accepted.turnId);
  const a = await store.get(A);
  await idle(a);
  assert.deepEqual(await (await get("/api/files")).json(), ["index.html"]);
  assert.deepEqual(await (await get("/api/files", B)).json(), []);
  assert.equal((await get("/api/file", A, { path: "../secret" })).status, 400);
  assert.equal(
    (await (await get("/api/file", A, { path: "index.html" })).json()).content,
    "<h1>API test</h1>",
  );
  const stream = await get("/api/events", B);
  assert.ok(stream.headers.get("content-type").includes("text/event-stream"));
  const reader = stream.body.getReader();
  const chunk = new TextDecoder().decode((await reader.read()).value);
  const streamed = JSON.parse(chunk.split("data: ")[1].split("\n")[0]);
  assert.equal(streamed.appID, B.appID);
  assert.equal(streamed.turns.length, 0);
  await reader.cancel();
  const preview = await fetch(`${origin}/s/${sessionId(A)}/`);
  assert.equal(preview.status, 200);
  assert.equal(await preview.text(), "<h1>API test</h1>");
  assert.equal((await fetch(`${origin}/s/${sessionId(B)}/`)).status, 404);
  assert.equal((await post("/api/undo", A)).status, 200);
  assert.deepEqual(await (await get("/api/files")).json(), []);
  assert.equal((await post("/api/reset", A)).status, 200);
  assert.equal((await (await get("/api/state")).json()).turns.length, 0);
});
