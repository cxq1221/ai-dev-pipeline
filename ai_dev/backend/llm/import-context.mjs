import { openStore } from "./store.mjs";
// Version-specific Pi migration boundary; not part of the portable HTTP contract.
export async function importContexts(databaseUrl, contexts) {
  const store = await openStore(databaseUrl);
  let imported = 0, skipped = 0;
  try {
    for (const item of contexts) {
      const result = await store.sql`INSERT IGNORE INTO llm_sessions (id,workspace_path,messages) VALUES (${item.id},${item.workspacePath},${JSON.stringify(item.messages)})`;
      if (result.affectedRows) imported++; else skipped++;
    }
    return { imported, skipped };
  } finally { await store.close(); }
}
