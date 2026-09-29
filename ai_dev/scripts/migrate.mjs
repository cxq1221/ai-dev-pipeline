import { connect, migrate } from "../backend/gateway/db.mjs";
const sql = await connect(process.env.DATABASE_URL);
try {
  await migrate(sql);
  console.log("数据库迁移完成");
} finally {
  await sql.close();
}
