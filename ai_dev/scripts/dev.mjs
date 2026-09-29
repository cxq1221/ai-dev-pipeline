import path from "node:path";
process.chdir(path.resolve(import.meta.dir, ".."));
const children = [];
let closing = false;
async function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const p of children) p.kill("SIGTERM");
  const force = setTimeout(() => {
    for (const p of children) p.kill("SIGKILL");
  }, 4000);
  await Promise.all(children.map((p) => p.exited));
  clearTimeout(force);
  process.exit(code);
}
for (const file of ["executor.mjs", "server.mjs"]) {
  const env = { ...process.env };
  if (file === "server.mjs") { delete env.DEEPSEEK_API_KEY; delete env.LLM_DATABASE_URL; }
  else delete env.DATABASE_URL;
  const p = Bun.spawn([process.execPath, "--no-env-file", file], {
    env,
    stdout: "inherit",
    stderr: "inherit",
  });
  children.push(p);
  p.exited.then((code) => {
    if (!closing) void close(code || 1);
  });
}
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
