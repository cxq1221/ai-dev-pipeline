import fs from "node:fs/promises";
import path from "node:path";
import { resolveModel as defaultResolveModel } from "./models.mjs";
import { createSession } from "./session.mjs";
import { DEMO, validateIdentity, sessionId } from "./identity.mjs";
export { DEMO, validateIdentity, sessionId } from "./identity.mjs";

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
