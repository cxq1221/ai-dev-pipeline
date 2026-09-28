import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDeepSeekSessionStore } from "../backend/deepseek-sessions.mjs";

const identity = { appID: "client001", session: "dsh-test", model: "deepseek-flash" };
const calls = [];
class FakeHarness {
  constructor(options) { this.options = options; this.closed = false; calls.push(this); }
  async run(input, _model, notify) {
    this.input = input;
    notify({ method: "session.event", params: { sessionId: this.options.sessionId, event: {
      type: "tool/call", data: { callId: "one", name: "bash", arguments: '{"command":"printf ok"}' },
    } } });
    await fs.writeFile(path.join(this.options.root, "index.html"), "<h1>ok</h1>");
    notify({ method: "session.event", params: { sessionId: this.options.sessionId, event: {
      type: "tool/result", data: { message: { source: { callId: "one" },
        content: [{ type: "tool-result", content: [{ type: "text", text: "ok" }] }] } },
    } } });
    notify({ method: "session.event", params: { sessionId: this.options.sessionId, event: {
      type: "assistant/message", data: { message: { content: [{ type: "text", text: "完成" }] } },
    } } });
    notify({ method: "session.event", params: { sessionId: this.options.sessionId,
      event: { type: "turn/end", data: { reason: { kind: "completed" } } } } });
    return { finalResponse: "完成" };
  }
  async close() { this.closed = true; }
}
const waitIdle = async (session) => {
  for (let i = 0; i < 100 && session.getState().busy; i++)
    await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(session.getState().busy, false);
};

test("DeepSeek backend keeps API state, events, workspace and replay across restarts", async (t) => {
  const oldKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = "test-placeholder";
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "deepseek-web-test-"));
  t.after(async () => {
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = oldKey;
    await fs.rm(base, { recursive: true, force: true });
  });
  const create = () => createDeepSeekSessionStore({ base, previewOrigin: "http://127.0.0.1:4320",
    agentFactory: (options) => new FakeHarness(options) });
  const first = create();
  const session = await first.get(identity);
  assert.equal(session.getState().backend, "deepseek-harness");
  await session.chat("write page", identity.model);
  await waitIdle(session);
  const turn = session.getState().turns[0];
  assert.equal(turn.status, "done");
  assert.equal(turn.blocks[0].status, "done");
  assert.equal(turn.blocks[0].output, "ok");
  assert.equal(turn.blocks[1].text, "完成");
  assert.equal(turn.changes[0].path, "index.html");
  assert.equal(session.getState().canUndo, false);
  assert.throws(() => session.undo(), { status: 501 });
  const firstHarnessId = calls.at(-1).options.sessionId;
  await first.dispose();

  const second = create();
  t.after(() => second.dispose());
  const reopened = await second.get(identity);
  assert.equal(reopened.getState().turns.length, 1);
  await reopened.chat("continue", identity.model);
  await waitIdle(reopened);
  assert.notEqual(calls.at(-1).options.sessionId, firstHarnessId);
  assert.match(calls.at(-1).input, /write page/);
  assert.match(calls.at(-1).input, /当前需求：continue/);
  const resumedHarnessId = calls.at(-1).options.sessionId;
  await reopened.chat("pro model", "deepseek-v4-pro");
  await waitIdle(reopened);
  assert.notEqual(calls.at(-1).options.sessionId, resumedHarnessId);
  assert.equal(calls.at(-1).options.model.id, "deepseek-v4-pro");
  assert.equal(reopened.getState().modelId, "deepseek-v4-pro");
  await reopened.reset();
  assert.equal(reopened.getState().turns.length, 0);
  assert.equal(await fs.readFile(path.join(reopened.root, "index.html"), "utf8"), "<h1>ok</h1>");
});
