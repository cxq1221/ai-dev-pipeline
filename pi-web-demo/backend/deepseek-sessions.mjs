import fs from "node:fs/promises";
import path from "node:path";
import { validateIdentity, sessionId } from "./identity.mjs";
import { resolveDeepSeekModel } from "./deepseek-agent.mjs";
import { createDeepSeekSession } from "./deepseek-session.mjs";

export function createDeepSeekSessionStore({ base, previewOrigin, agentFactory }) {
  const sessions = new Map();
  const locations = (id) => ({
    root: path.join(base, "workspaces-deepseek", id),
    dataDir: path.join(base, ".data", "deepseek", id),
  });
  async function get(input) {
    const identity = validateIdentity(input);
    resolveDeepSeekModel(identity.model);
    const id = sessionId(identity);
    if (!sessions.has(id)) {
      const pending = createDeepSeekSession({
        identity, ...locations(id),
        previewUrl: `${previewOrigin}/s/${id}`,
        agentFactory,
      });
      sessions.set(id, pending);
      pending.catch(() => { if (sessions.get(id) === pending) sessions.delete(id); });
    }
    return sessions.get(id);
  }
  async function getPreview(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Object.assign(new Error("预览不存在"), { status: 404 });
    if (sessions.has(id)) return sessions.get(id);
    const saved = JSON.parse(await fs.readFile(path.join(locations(id).dataDir, "session.json"), "utf8"));
    const identity = validateIdentity(saved);
    if (sessionId(identity) !== id) throw new Error("会话数据不匹配");
    return get(identity);
  }
  return { get, getPreview,
    async dispose() {
      for (const session of await Promise.all(sessions.values())) await session.dispose();
      sessions.clear();
    },
  };
}
