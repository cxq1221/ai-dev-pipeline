import { SQL } from "bun";
import fs from "node:fs/promises";
export async function connect(databaseUrl) {
  if (!databaseUrl)
    throw new Error("请设置 DATABASE_URL（测试使用 TEST_DATABASE_URL）");
  const sql = new SQL(databaseUrl);
  await sql`SELECT 1`;
  return sql;
}
export async function migrate(sql) {
  const directory = new URL("../../migrations/", import.meta.url);
  for (const file of (await fs.readdir(directory))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const statement of (
      await fs.readFile(new URL(file, directory), "utf8")
    )
      .split(";")
      .filter((s) => s.trim()))
      await sql.unsafe(statement);
  }
}
