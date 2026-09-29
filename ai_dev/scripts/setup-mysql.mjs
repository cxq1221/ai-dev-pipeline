import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

// Provision a private local credential file without printing credentials.
const target = path.resolve(import.meta.dir, "../.env.mysql");
try {
  const password = randomBytes(24).toString("hex");
  await fs.writeFile(target, `MYSQL_PASSWORD=${password}\nDATABASE_URL=mysql://ai_dev:${password}@127.0.0.1:33318/ai_dev?sslmode=require\n`, { flag: "wx", mode: 0o600 });
  console.log("已创建 .env.mysql（权限 600），未改动应用 .env。");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  const existing = await fs.readFile(target, "utf8");
  const updated = existing.replace(/^(DATABASE_URL=mysql:\/\/ai_dev:[^\r\n]+@127\.0\.0\.1:33318\/ai_dev)$/m, "$1?sslmode=require");
  if (updated !== existing) await fs.writeFile(target, updated, { mode: 0o600 });
  console.log(".env.mysql 已存在，保留现有凭据。");
}
