import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveModel as defaultResolveModel } from "./models.mjs";
import { createSession } from "./session.mjs";

export const DEMO = Object.freeze({
  appID: "vue-demo1",
  session: "demo",
  model: "deepseek-flash",
});
const invalid = (message) => Object.assign(new Error(message), { status: 400 });
export function validateIdentity(input) {
  const { appID, session, model } = input || {};
  if (
    typeof appID !== "string" ||
    [...appID].length !== 9 ||
    /\s|\p{C}/u.test(appID)
  )
    throw invalid("appID 必须是恰好 9 位的字符串，不含空白或控制字符");
  if (typeof session !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(session))
    throw invalid("session 必须是 1–128 位字母、数字、下划线或连字符");
  if (typeof model !== "string" || !model)
    throw invalid("model 必填且必须是字符串");
  return { appID, session, model };
}
export function sessionId(identity) {
  return createHash("sha256")
    .update(JSON.stringify([identity.appID, identity.session]))
    .digest("hex");
}
export function createSessionStore({
  base,
  previewOrigin,
  resolveModel = defaultResolveModel,
  agentFactory,
}) {
  const sessions = new Map();
  const legacyId = sessionId(DEMO);
  function locations(id) {
    return id === legacyId
      ? {
          root: path.join(base, "workspace"),
          dataDir: path.join(base, ".data"),
        }
      : {
          root: path.join(base, "workspaces", id),
          dataDir: path.join(base, ".data/sessions", id),
        };
  }
  async function get(input) {
    const identity = validateIdentity(input);
    resolveModel(identity.model); // Validate on every request, including existing sessions.
    const id = sessionId(identity);
    if (!sessions.has(id)) {
      const pending = createSession({
        identity,
        ...locations(id),
        previewUrl: `${previewOrigin}/s/${id}`,
        resolveModel,
        agentFactory,
      });
      sessions.set(id, pending);
      pending.catch(() => {
        if (sessions.get(id) === pending) sessions.delete(id);
      });
    }
    return sessions.get(id);
  }
  async function getPreview(id) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw Object.assign(new Error("预览不存在"), { status: 404 });
    if (sessions.has(id)) return sessions.get(id);
    const saved = JSON.parse(
      await fs.readFile(
        path.join(locations(id).dataDir, "session.json"),
        "utf8",
      ),
    );
    const identity =
      id === legacyId
        ? { ...DEMO, model: saved.model || DEMO.model }
        : validateIdentity(saved);
    if (sessionId(identity) !== id) throw new Error("会话数据不匹配");
    return get(identity);
  }
  return {
    get,
    getPreview,
    async dispose() {
      for (const session of await Promise.all(sessions.values()))
        await session.dispose();
      sessions.clear();
    },
  };
}
