const checks = {
  bun: Boolean(process.versions.bun),
  git: Bun.spawnSync(["git", "--version"]).exitCode === 0,
  database: Boolean(process.env.DATABASE_URL),
  llmDatabase: Boolean(process.env.LLM_DATABASE_URL),
  model: Boolean(process.env.DEEPSEEK_API_KEY),
};
for (const [key, ok] of Object.entries(checks))
  console.log(`${key}: ${ok ? "就绪" : "缺少配置或工具"}`);
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
