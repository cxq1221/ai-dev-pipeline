import express from "express";
import { randomUUID } from "node:crypto";
import { connect, migrate } from "./db.mjs";
import path from "node:path";
import fs from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { backendRegistry } from "./backends.mjs";
import { conversations } from "./conversations.mjs";
import { llmClient } from "./llm-client.mjs";
import { localOnly, closeServer } from "../local-http.mjs";
import { workspaceService } from "./workspace-service.mjs";
import { skillCatalog } from "../shared/skills.mjs";
import { redact } from "../redact.mjs";

export async function startGateway({
  port = 4417,
  previewPort = 4419,
  workspaceRoot = path.resolve("workspaces"),
  skillsRoot = path.resolve(process.env.SKILLS_DIR || "skills"),
  databaseUrl = process.env.DATABASE_URL,
  executorUrl = "http://127.0.0.1:4418",
  backends = process.env.LLM_BACKENDS ? JSON.parse(process.env.LLM_BACKENDS) : [{ id: "local", name: "本机后端", url: executorUrl }],
  defaultBackendId = process.env.DEFAULT_LLM_BACKEND || backends[0]?.id,
  serveUI = false,
  defaultRepositoryPath = process.env.DEFAULT_REPOSITORY_PATH || "",
  repositoryPaths = (process.env.REPOSITORY_PATHS || "").split(","),
} = {}) {
  await fs.mkdir(skillsRoot, { recursive: true });
  skillsRoot = await fs.realpath(skillsRoot);
  const workspaces = await workspaceService(workspaceRoot, previewPort);
  const sql = await connect(databaseUrl);
  await migrate(sql);
  const app = express();
  app.use(localOnly());
  app.use(express.json());
  app.get("/api/config", (_req, res) => res.json({ defaultRepositoryPath, repositoryPaths: [...new Set([defaultRepositoryPath, ...repositoryPaths].map(p => p.trim()).filter(Boolean))] }));
  const registry = await backendRegistry(sql, backends, defaultBackendId, executorUrl);
  app.get("/api/backends", (_req, res) => res.json({ backends: registry.list(), defaultBackendId }));
  const chats = conversations(sql, registry);
  const llm = llmClient(chats, sql, { skillsRoot, registry });
  app.post("/api/requirements/:id/clarification", async (req, res) => {
    const { message } = req.body;
    if (typeof message !== "string" || !message.trim() || message.length > 20000)
      return res.status(400).json({ error: "请先填写澄清消息（1–20000 字）" });
    const id = await chats.clarification(req.params.id, req.body.backendId);
    // A failed dispatch retains the user's attempted session for retry.
    try {
      const result = await llm.chat(id, message, req.body.skillNames);
      res.json({ ...result, conversationId: id });
    } catch (e) { res.status(e.status || 500).json({ error: redact(e.message), conversationId: id }); }
  });
  app.get("/api/skills", async (_req, res) => res.json({ directory: skillsRoot, ...skillCatalog(skillsRoot) }));
  app.get("/api/requirements/:id/conversations", async (req, res) =>
    res.json(await chats.list(req.params.id)),
  );
  app.post("/api/requirements/:id/conversations", async (req, res) => {
    const [r] =
      await sql`SELECT id FROM requirements WHERE id=${req.params.id}`;
    if (!r) return res.status(404).json({ error: "需求不存在" });
    res.json(await chats.create(req.params.id, req.body.title || "需求讨论", req.body.backendId));
  });
  app.get("/api/conversations/:id/mode", async (req, res) => {
    const c = await chats.get(req.params.id);
    res.json({ mode: c.mode, isClarification: Boolean(c.isClarification) });
  });
  app.get("/api/conversations/:id/state", async (req, res) =>
    res.json(await llm.state(req.params.id)),
  );
  app.post("/api/conversations/:id/chat", async (req, res) =>
    res.json(await llm.chat(req.params.id, req.body.message, req.body.skillNames, req.body.startDevelopment === true)),
  );
  app.post("/api/conversations/:id/stop", async (req, res) => {
    await sql`UPDATE turns SET status='stopped',finished_at=${Date.now()} WHERE conversation_id=${req.params.id} AND status='queued'`;
    res.json(await llm.stop(req.params.id));
  });
  app.get("/api/conversations/:id/events", async (req, res) => {
    await chats.get(req.params.id);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    let last = "",
      polling = false;
    const timer = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const value = JSON.stringify(await llm.state(req.params.id));
        if (value !== last) {
          res.write(`data: ${value}\n\n`);
          last = value;
        }
      } catch {
        res.write("event: unavailable\ndata: {}\n\n");
      } finally {
        polling = false;
      }
    }, 250);
    req.on("close", () => clearInterval(timer));
  });
  const requirement = (row) =>
    row && {
      id: row.id,
      title: row.title,
      originalDescription: row.original_description,
      clarifiedDescription: row.clarified_description,
      repositoryPath: row.repository_path,
      baseRef: row.base_ref,
      branchName: row.branch_name,
      workspacePath: row.workspace_path,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  app.get("/health", (_req, res) => res.json({ ok: true, service: "gateway" }));
  app.get("/api/requirements", async (_req, res) =>
    res.json(
      (await sql`SELECT * FROM requirements ORDER BY created_at DESC`).map(
        requirement,
      ),
    ),
  );
  app.get("/api/requirements/:id", async (req, res) => {
    const [row] =
      await sql`SELECT * FROM requirements WHERE id=${req.params.id}`;
    if (!row) return res.status(404).json({ error: "需求不存在" });
    res.json(requirement(row));
  });
  app.get("/api/requirements/:id/:action", async (req, res, next) => {
    if (!["files", "file", "diff", "preview"].includes(req.params.action))
      return next();
    const [r] = await sql`SELECT * FROM requirements WHERE id=${req.params.id}`;
    if (!r) return res.status(404).json({ error: "需求不存在" });
    res.json(
      await workspaces.view({
        requirementId: r.id,
        workspacePath: r.workspace_path,
        baseRef: r.base_ref,
        action: req.params.action,
        file: req.query.path,
      }),
    );
  });
  app.patch("/api/requirements/:id", async (req, res) => {
    const text = req.body.clarifiedDescription;
    if (typeof text !== "string" || text.length > 50000)
      return res
        .status(400)
        .json({ error: "需求说明必须是 50000 字以内的文本" });
    const [r] =
      await sql`SELECT id FROM requirements WHERE id=${req.params.id}`;
    if (!r) return res.status(404).json({ error: "需求不存在" });
    await sql`UPDATE requirements SET clarified_description=${text},updated_at=${Date.now()} WHERE id=${req.params.id}`;
    res.json({ ok: true });
  });
  app.post("/api/requirements", async (req, res) => {
    const { title, originalDescription, repositoryPath } = req.body;
    if (
      ![title, originalDescription, repositoryPath].every(
        (x) => typeof x === "string" && x.trim(),
      ) ||
      title.length > 255
    )
      return res
        .status(400)
        .json({ error: "请输入标题、原始需求和本地仓库路径" });
    const id = randomUUID(),
      now = Date.now();
    const workspace = await workspaces.prepare({ requirementId: id, repositoryPath, initializeEmptyRepository: req.body.initializeEmptyRepository === true });
    await sql`INSERT INTO requirements VALUES (${id},${title},${originalDescription},${""},${repositoryPath},${workspace.baseRef},${workspace.branchName},${workspace.workspacePath},${now},${now})`;
    res.json(
      requirement((await sql`SELECT * FROM requirements WHERE id=${id}`)[0]),
    );
  });
  let vite;
  const httpServer = createHttpServer(app);
  if (serveUI === "development") {
    const { createServer } = await import("vite");
    vite = await createServer({
      configFile: path.resolve(import.meta.dir, "../../vite.config.js"),
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        fs: {
          strict: true,
          allow: [
            path.resolve(import.meta.dir, "../../frontend"),
            path.resolve(import.meta.dir, "../../node_modules"),
          ],
        },
      },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.get("/", async (_req, res) =>
      res
        .type("html")
        .send(
          await vite.transformIndexHtml(
            "/",
            await fs.readFile(
              path.resolve(import.meta.dir, "../../frontend/index.html"),
              "utf8",
            ),
          ),
        ),
    );
  } else if (serveUI)
    app.use(express.static(path.resolve(import.meta.dir, "../../dist")));
  app.use((error, _req, res, _next) =>
    res.status(error.status || 500).json({ error: redact(error.message), code: error.code }),
  );
  const server = await new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, "127.0.0.1", () => resolve(httpServer));
  });
  llm.start();
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      await llm.close();
      await workspaces.close();
      await closeServer(server);
      await vite?.close();
      await sql.close();
    },
  };
}
