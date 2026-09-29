import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  safePath,
  snapshot,
  changes,
  restore,
} from "../workspace.mjs";
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-demo-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test("blocks traversal and symlink paths", async (t) => {
  const root = await setup(t);
  await assert.rejects(safePath(root, "../outside"));
  await fs.symlink(os.tmpdir(), path.join(root, "link"));
  await assert.rejects(safePath(root, "link/outside"));
});
test("snapshots restore creates, changes, deletes and binary bytes", async (t) => {
  const root = await setup(t);
  await fs.writeFile(path.join(root, "a.txt"), "old\n");
  await fs.writeFile(path.join(root, "b.bin"), Buffer.from([0, 255, 4]));
  const before = await snapshot(root);
  await fs.writeFile(path.join(root, "a.txt"), "new\n");
  await fs.unlink(path.join(root, "b.bin"));
  await fs.writeFile(path.join(root, "c.txt"), "created");
  const after = await snapshot(root);
  assert.equal(changes(before, after).length, 3);
  await restore(root, before, after);
  assert.deepEqual(await snapshot(root), before);
});
test("undo refuses to overwrite later manual changes", async (t) => {
  const root = await setup(t);
  const before = await snapshot(root);
  await fs.writeFile(path.join(root, "a"), "agent");
  const after = await snapshot(root);
  await fs.writeFile(path.join(root, "a"), "user");
  await assert.rejects(restore(root, before, after));
  assert.equal(await fs.readFile(path.join(root, "a"), "utf8"), "user");
});
