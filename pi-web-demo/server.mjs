import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSessionStore } from "./backend/sessions.mjs";
import { createApi, createPreview } from "./backend/http.mjs";
import { redact } from "./backend/models.mjs";
const base = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4317),
  previewPort = port + 1;
const store = createSessionStore({
  base,
  previewOrigin: `http://127.0.0.1:${previewPort}`,
});
const app = express();
const origins = new Set([
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
]);
app.use((req, res, next) => {
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host))
    return res.status(403).send("Invalid host");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && !origins.has(origin))
      return res.status(403).json({ error: "请求来源未配置" });
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.vary("Origin");
    }
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.sendStatus(204);
    }
  }
  next();
});
app.use("/api", createApi(store));
if (process.env.NODE_ENV === "development") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.join(base, "vite.config.js"),
    server: {
      middlewareMode: true,
      host: "127.0.0.1",
      fs: {
        strict: true,
        allow: [path.join(base, "frontend"), path.join(base, "node_modules")],
      },
    },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.get(/^\/quickstart$/, (_req, res) => res.redirect("/quickstart/"));
  app.get(
    ["/", "/quickstart/", "/quickstart/index.html"],
    async (req, res, next) => {
      try {
        const html = await fs.readFile(
          path.join(
            base,
            req.path.startsWith("/quickstart")
              ? "frontend/quickstart/index.html"
              : "frontend/index.html",
          ),
          "utf8",
        );
        res
          .type("html")
          .send(await vite.transformIndexHtml(req.originalUrl, html));
      } catch (error) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    },
  );
} else {
  app.use(express.static(path.join(base, "dist")));
}

app.use((err, _req, res, _next) =>
  res.status(400).json({ error: redact(err.message) }),
);
const preview = express();
preview.use((req, res, next) => {
  if (
    ![`127.0.0.1:${previewPort}`, `localhost:${previewPort}`].includes(
      req.headers.host,
    )
  )
    return res.sendStatus(403);
  next();
});
preview.use(createPreview(store));
preview.listen(previewPort, "127.0.0.1", () =>
  console.log(`Preview: http://127.0.0.1:${previewPort}`),
);
app.listen(port, "127.0.0.1", () =>
  console.log(`Pi coding demo: http://127.0.0.1:${port}`),
);
