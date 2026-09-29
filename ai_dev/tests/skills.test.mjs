import { test, expect } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { fixture, api } from "./helpers.mjs";
import { modelServer } from "./model-server.mjs";
import { startExecutor } from "../backend/executor/http.mjs";

test("Skill 受控发现、手动注入、Agent 读写与下一轮重新加载", async () => {
  const f = await fixture();
  const skillsRoot = path.join(await fs.realpath(f.root), "skills");
  const autoDir = path.join(skillsRoot, "auto-check");
  const manualDir = path.join(skillsRoot, "manual-check");
  await fs.mkdir(autoDir, { recursive: true });
  await fs.mkdir(manualDir);
  const skillFile = path.join(autoDir, "SKILL.md");
  const original = "---\nname: auto-check\ndescription: AUTO_CATALOG_V1\n---\nAUTO_BODY_V1";
  const improved = original.replaceAll("V1", "V2");
  await fs.writeFile(skillFile, original);
  await fs.writeFile(path.join(manualDir, "SKILL.md"), "---\nname: manual-check\ndescription: MANUAL_ONLY\ndisable-model-invocation: true\n---\nMANUAL_BODY");
  const outside = path.join(f.root, "outside.txt");
  await fs.writeFile(outside, "OUTSIDE_SECRET");
  await fs.symlink(outside, path.join(autoDir, "linked.txt"));
  let sequence = [];
  const model = modelServer(() => sequence.shift() || null);
  const ex = await startExecutor({ port: 0, previewPort: 0, skillsRoot, dataRoot: path.join(f.root, "runtime"), modelBaseUrl: model.url });
  const chat = async (message, skillNames = []) => {
    await api(ex.url, "/sessions/skill-test/chat", { turnId: crypto.randomUUID(), message, skillNames, requirement: { original: "ORIGINAL_REQUIREMENT", clarified: "" } });
    for (let i = 0; i < 100; i++) {
      const state = await api(ex.url, "/sessions/skill-test");
      if (!state.busy) return state;
      await Bun.sleep(30);
    }
    throw new Error("Skill 执行未结束");
  };
  const tool = (name, args) => ({ name, arguments: JSON.stringify(args) });
  try {
    const catalog = await api(ex.url, "/skills");
    expect(catalog.skills.map(s => s.name)).toEqual(["auto-check", "manual-check"]);
    expect(catalog.diagnostics.length).toBe(1);
    await api(ex.url, "/sessions/skill-test", { workspacePath: f.repo });
    await chat("普通任务");
    const initial = JSON.stringify(model.requests[0]);
    expect(initial).toContain("AUTO_CATALOG_V1");
    expect(initial).not.toContain("AUTO_BODY_V1");
    expect(initial).not.toContain("MANUAL_ONLY");
    await chat("指定任务", ["manual-check"]);
    expect(JSON.stringify(model.requests.at(-1))).toContain("MANUAL_BODY");
    expect(JSON.stringify(model.requests.at(-1))).toContain("ORIGINAL_REQUIREMENT");
    sequence = [tool("read", { path: skillFile }), tool("write", { path: skillFile, content: improved })];
    await chat("优化 Skill");
    expect(await fs.readFile(skillFile, "utf8")).toBe(improved);
    const requestsBefore = model.requests.length;
    await chat("下一轮任务");
    expect(JSON.stringify(model.requests[requestsBefore])).toContain("AUTO_CATALOG_V2");
    sequence = [tool("write", { path: path.join(autoDir, "scripts", "check.sh"), content: "echo ok" })];
    await chat("添加脚本");
    expect(await fs.readFile(path.join(autoDir, "scripts", "check.sh"), "utf8")).toBe("echo ok");
    sequence = [tool("read", { path: path.join(autoDir, "linked.txt") }), tool("write", { path: outside, content: "overwrite" })];
    const blocked = await chat("检查边界");
    expect(blocked.turn.blocks.filter(b => b.type === "tool" && b.status === "error").length).toBe(2);
    expect(await fs.readFile(outside, "utf8")).toBe("OUTSIDE_SECRET");
    expect(JSON.stringify(model.requests)).not.toContain("OUTSIDE_SECRET");
    await expect(chat("错误选择", ["../../outside"])).rejects.toThrow("Skill 不存在");
  } finally { await ex.close(); model.close(); }
}, 20000);
