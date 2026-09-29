import express from "express";
import { prepareWorkspace } from "./prepare-workspace.mjs";
import { listFiles, readFile, diffFiles, safePath, visible } from "../shared/files.mjs";
import { listen, closeServer } from "../local-http.mjs";
export async function workspaceService(workspaceRoot, previewPort) {
  const workspaces = new Map();
  const preview = express();
  preview.get("/r/:id/{*file}", async (req, res) => {
    const root = workspaces.get(req.params.id);
    if (!root) return res.status(404).send("需求预览不存在");
    const name = req.params.file?.join("/") || "index.html";
    if (!visible(name)) return res.status(403).send("文件不对外展示");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.sendFile(await safePath(root, name), { dotfiles: "deny" });
  });
  preview.use((_e, _req, res, _next) => res.status(404).send("预览文件不可用"));
  const previewServer = await listen(preview, previewPort);

  return {
    prepare: input => prepareWorkspace(workspaceRoot, input),
    async view({ requirementId, workspacePath, baseRef, action, file }) {
      workspaces.set(requirementId, workspacePath);
      if (action === "files") return listFiles(workspacePath);
      if (action === "file") return { content: await readFile(workspacePath, file) };
      if (action === "diff") return diffFiles(workspacePath, baseRef);
      if (action === "preview") return { url: `http://127.0.0.1:${previewServer.address().port}/r/${requirementId}/` };
    },
    close: () => closeServer(previewServer),
  };
}
