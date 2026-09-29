import express from "express";
import path from "node:path";
import { createSession } from "./session.mjs";
import {
  prepareWorkspace,
  listFiles,
  readFile,
  diffFiles,
  safePath,
  visible,
} from "./workspace.mjs";
import { localOnly, listen, closeServer } from "../local-http.mjs";
import { redact } from "../redact.mjs";
import fs from "node:fs/promises";
import { skillCatalog } from "./skills.mjs";

export async function startExecutor({
  port = 4418,
  previewPort = 4419,
  dataRoot = path.resolve(".data"),
  workspaceRoot = path.resolve("workspaces"),
  modelBaseUrl,
  gatewayUrl,
  skillsRoot = path.resolve(process.env.SKILLS_DIR || "skills"),
} = {}) {
  await fs.mkdir(skillsRoot, { recursive: true });
  skillsRoot = await fs.realpath(skillsRoot);
  const app = express();
  app.use(localOnly({ internal: true }));
  const sessions = new Map();
  const workspaces = new Map();
  const preview = express();
  preview.get("/r/:id/{*file}", async (req, res) => {
    const root = workspaces.get(req.params.id);
    if (!root) return res.status(404).send("需求预览不存在");
    const name = req.params.file?.join("/") || "index.html";
    if (!visible(name)) return res.status(403).send("文件不对外展示");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(await safePath(root, name), { dotfiles: "deny" });
  });
  preview.use((_e, _req, res, _next) => res.status(404).send("预览文件不可用"));
  const previewServer = await listen(preview, previewPort);
  app.use(express.json({ limit: "10mb" }));
  app.get("/health", (_req, res) =>
    res.json({ ok: true, service: "executor" }),
  );
  app.post("/workspaces", async (req, res) =>
    res.json(await prepareWorkspace(workspaceRoot, req.body)),
  );
  app.get("/skills", (_req, res) => res.json({ directory: skillsRoot, ...skillCatalog(skillsRoot) }));
  app.post("/workspace-view", async (req, res) => {
    const { requirementId, workspacePath, baseRef, action, file } = req.body;
    workspaces.set(requirementId, workspacePath);
    if (action === "files") return res.json(await listFiles(workspacePath));
    if (action === "file")
      return res.json({ content: await readFile(workspacePath, file) });
    if (action === "diff")
      return res.json(await diffFiles(workspacePath, baseRef));
    if (action === "preview")
      return res.json({
        url: `http://127.0.0.1:${previewServer.address().port}/r/${requirementId}/`,
      });
    res.status(400).json({ error: "未知操作" });
  });
  app.post("/sessions/:id", async (req, res) => {
    if (!/^[a-zA-Z0-9-]+$/.test(req.params.id))
      return res.status(400).json({ error: "会话 ID 无效" });
    const target = gatewayUrl || req.body.gatewayUrl;
    if (!sessions.has(req.params.id))
      sessions.set(
        req.params.id,
        await createSession({
          ...req.body,
          skillsRoot,
          modelBaseUrl,
          dataDir: path.join(dataRoot, req.params.id),
          updateRequirement: target
            ? async (content) => {
                const r = await fetch(
                  `${target}/api/requirements/${req.body.requirementId}`,
                  {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clarifiedDescription: content }),
                  },
                );
                if (!r.ok) throw new Error("保存需求说明失败");
              }
            : undefined,
        }),
      );
    res.json({ ready: true });
  });
  app.get("/sessions/:id", (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: "会话实例不存在" });
    res.json(s.state());
  });
  app.post("/sessions/:id/chat", (req, res) =>
    res.json(sessions.get(req.params.id).chat(req.body)),
  );
  app.post("/sessions/:id/stop", async (req, res) =>
    res.json(await sessions.get(req.params.id).stop()),
  );
  app.get("/sessions/:id/events", (req, res) => {
    const s = sessions.get(req.params.id);
    if (!s) return res.status(404).json({ error: "会话实例不存在" });
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    const send = (state) => {
      const { messages, ...rest } = state;
      res.write(
        `data: ${JSON.stringify({ ...rest, ...(!state.busy ? { messages } : {}) })}\n\n`,
      );
    };
    send(s.state());
    const unsub = s.subscribe(send),
      heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    req.on("close", () => {
      unsub();
      clearInterval(heartbeat);
    });
  });
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: redact(error.message), code: error.code }),
  );
  const server = await listen(app, port);
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await Promise.all([...sessions.values()].map((s) => s.close()));
      await closeServer(server);
      await closeServer(previewServer);
    },
  };
}
