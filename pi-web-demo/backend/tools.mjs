import fs from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { snapshot, safePath, runCommand } from "../workspace.mjs";
export function createTools(root, redact) {
  const result = (text) => ({
    content: [{ type: "text", text: redact(text) }],
    details: {},
  });
  const tool = (name, description, properties, execute) => ({
    name,
    label: name,
    description,
    parameters: Type.Object(properties),
    execute,
  });
  return [
    tool(
      "list_files",
      "List workspace files; paths are relative to workspace.",
      {},
      async () =>
        result(
          Object.keys(await snapshot(root)).join("\n") || "(empty workspace)",
        ),
    ),
    tool(
      "read_file",
      "Read a UTF-8 file inside the workspace.",
      { path: Type.String() },
      async (_id, args) =>
        result(
          (await fs.readFile(await safePath(root, args.path), "utf8")).slice(
            0,
            100000,
          ),
        ),
    ),
    tool(
      "write_file",
      "Create or replace a UTF-8 file inside the workspace.",
      { path: Type.String(), content: Type.String() },
      async (_id, args, signal) => {
        if (signal?.aborted) throw new Error("已停止");
        const p = await safePath(root, args.path);
        await fs.mkdir(path.dirname(p), { recursive: true });
        await fs.writeFile(p, args.content);
        return result(`Written ${args.path}`);
      },
    ),
    tool(
      "edit_file",
      "Replace exactly one matching text block; read the file first.",
      { path: Type.String(), old_text: Type.String(), new_text: Type.String() },
      async (_id, args, signal) => {
        if (signal?.aborted) throw new Error("已停止");
        const p = await safePath(root, args.path);
        const old = await fs.readFile(p, "utf8");
        if (!args.old_text || old.split(args.old_text).length !== 2)
          throw new Error("old_text 必须精确且唯一匹配");
        await fs.writeFile(
          p,
          old.replace(args.old_text, () => args.new_text),
        );
        return result(`Updated ${args.path}`);
      },
    ),
    tool(
      "bash",
      "Execute a shell command in workspace. 60 second timeout, no background servers. Use for testing and inspecting code.",
      { command: Type.String() },
      async (_id, args, signal, onUpdate) => {
        const r = await runCommand(root, args.command, signal, (text) =>
          onUpdate?.(result(text)),
        );
        return {
          ...result(
            `exit=${r.code}${r.timedOut ? " TIMEOUT" : ""}${r.aborted ? " ABORTED" : ""}\n${r.output}`,
          ),
          isError: r.code !== 0,
        };
      },
    ),
  ];
}
