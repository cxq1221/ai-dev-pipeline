import fs from "node:fs";
import path from "node:path";
import { loadSkills } from "@earendil-works/pi-coding-agent";

// Only discover regular files within the explicitly configured directory.
export function skillCatalog(root) {
  const files = [], diagnostics = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        diagnostics.push({ type: "warning", message: "忽略符号链接", path: file });
      } else if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name === "SKILL.md") files.push(file);
    }
  }
  if (root && fs.existsSync(root)) walk(root);
  const result = loadSkills({ cwd: root || process.cwd(), skillPaths: files.sort(), includeDefaults: false });
  return { skills: result.skills, diagnostics: [...diagnostics, ...result.diagnostics] };
}

export function selectedSkills(root, names = []) {
  if (!Array.isArray(names) || names.length > 10 || names.some(n => typeof n !== "string"))
    throw Object.assign(new Error("Skill 选择无效，最多选择 10 个"), { status: 400 });
  const catalog = skillCatalog(root);
  return [...new Set(names)].map(name => {
    const skill = catalog.skills.find(s => s.name === name);
    if (!skill) throw Object.assign(new Error(`Skill 不存在或配置无效：${name}`), { status: 400 });
    return { ...skill, content: fs.readFileSync(skill.filePath, "utf8") };
  });
}
