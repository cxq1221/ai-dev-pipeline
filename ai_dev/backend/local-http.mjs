export function localOnly({ internal = false } = {}) {
  return (req, res, next) => {
    const port = req.socket.localPort;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const origin = req.headers.origin;
    if (
      !hosts.includes(req.headers.host) ||
      req.headers["sec-fetch-site"] === "cross-site" ||
      (origin &&
        (internal || !hosts.map((h) => "http://" + h).includes(origin)))
    )
      return res.status(403).json({ error: "仅允许本机受信任来源" });
    if (
      ["POST", "PATCH", "PUT"].includes(req.method) &&
      !req.is("application/json")
    )
      return res.status(415).json({ error: "需要 application/json" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    next();
  };
}
export function listen(app, port) {
  return new Promise((resolve, reject) => {
    const s = app.listen(port, "127.0.0.1", () => resolve(s));
    s.once("error", reject);
  });
}
export async function closeServer(server) {
  const done = new Promise((resolve) => server.close(resolve));
  server.closeAllConnections();
  await done;
}
