import express from "express";
import fs from "node:fs/promises";
import { snapshot, safePath } from "../workspace.mjs";
import { redact } from "./models.mjs";

export function createApi(store) {
  const api = express.Router();
  api.use(express.json({ limit: "128kb" }));
  api.use(async (req, res, next) => {
    if (req.method !== "GET" && !req.is("application/json"))
      return res.status(415).json({ error: "请使用 application/json 请求体" });
    try {
      req.codingSession = await store.get(
        req.method === "GET" ? req.query : req.body,
      );
      next();
    } catch (e) {
      next(e);
    }
  });
  api.get("/state", (req, res) => res.json(req.codingSession.getState()));
  api.get("/events", (req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();
    const send = (state) => {
      if (!res.destroyed) res.write(`data: ${JSON.stringify(state)}\n\n`);
    };
    const unsubscribe = req.codingSession.subscribe(send);
    send(req.codingSession.getState());
    const timer = setInterval(() => res.write(": keepalive\n\n"), 15000);
    res.on("close", () => {
      unsubscribe();
      clearInterval(timer);
    });
  });
  api.get("/files", async (req, res) =>
    res.json(Object.keys(await snapshot(req.codingSession.root)).sort()),
  );
  api.get("/file", async (req, res) => {
    if (typeof req.query.path !== "string")
      return res.status(400).json({ error: "path 必须是字符串" });
    res.json({
      content: (
        await fs.readFile(
          await safePath(req.codingSession.root, req.query.path),
          "utf8",
        )
      ).slice(0, 200000),
    });
  });
  api.post("/chat", async (req, res) =>
    res
      .status(202)
      .json(await req.codingSession.chat(req.body.message, req.body.model)),
  );
  api.post("/stop", (req, res) => {
    req.codingSession.stop();
    res.json({ ok: true });
  });
  api.post("/undo", async (req, res) => {
    await req.codingSession.undo();
    res.json({ ok: true });
  });
  api.post("/reset", async (req, res) => {
    await req.codingSession.reset();
    res.json({ ok: true });
  });
  api.use((err, _req, res, _next) =>
    res.status(err.status || 400).json({ error: redact(err.message) }),
  );
  return api;
}
export function createPreview(store) {
  const preview = express();
  preview.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "sandbox allow-scripts allow-same-origin; default-src 'self' 'unsafe-inline' data: blob: https:; connect-src 'none'; frame-src 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  preview.get("/s/:id/{*file}", async (req, res, next) => {
    try {
      const session = await store.getPreview(req.params.id);
      const name = req.params.file?.join("/") || "index.html";
      if (name.split("/").some((x) => x.startsWith(".")))
        return res.sendStatus(403);
      res.sendFile(await safePath(session.root, name), (err) => {
        if (err) next(err);
      });
    } catch (e) {
      next(e);
    }
  });
  preview.get("/s/:id", (req, res) => res.redirect(`/s/${req.params.id}/`));
  preview.use((_err, _req, res, _next) =>
    res.status(404).send("暂未生成此文件。请在对话中创建 index.html。"),
  );
  return preview;
}
