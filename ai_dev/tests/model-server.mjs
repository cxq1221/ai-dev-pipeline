// Only the external model HTTP boundary is substituted. Pi and both services are real.
export function modelServer(toolForRequest) {
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const body = await req.json();
      requests.push(body);
      const last = body.messages.at(-1);
      const text =
        typeof last?.content === "string"
          ? last.content
          : last?.content
              ?.filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("");
      if (text?.includes("慢任务")) await Bun.sleep(800);
      const content = last?.role === "tool" ? "已完成修改" : `已收到：${text}`;
      const update = last?.role !== "tool" && text?.includes("更新说明");
      const write = last?.role !== "tool" && text?.match(/写入 (\w+\.txt)/);
      const overwrite = last?.role !== "tool" && text?.includes("直接覆盖首页");
      const canComplete = last?.role === "user" && text?.includes("开始开发")
        && body.tools?.some(t => t.function.name === "complete_clarification")
        && body.messages.some(m => m.role === "user" && /全部按推荐|你决定|需求已确认/.test(JSON.stringify(m.content)));
      const tool = toolForRequest ? toolForRequest(body) : canComplete
        ? { name: "complete_clarification", arguments: JSON.stringify({ content: "目标：实现页面；范围：当前首页；关键行为：按已接受的推荐实现；验收：页面正确展示。" }) }
        : update
        ? {
            name: "update_requirement",
            arguments: JSON.stringify({
              content: "延迟超过 80ms 显示弱网提示，允许继续进入。",
            }),
          }
        : write || overwrite
          ? {
              name: "write",
              arguments: JSON.stringify({
                path: overwrite ? "index.html" : write[1],
                content: "并发成果",
              }),
            }
          : null;
      if (tool instanceof Response) return tool;
      const delta = tool
        ? {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: `fixture-call-${requests.length}`,
                type: "function",
                function: tool,
              },
            ],
          }
        : { role: "assistant", content };
      const chunk = (d, finish = null) =>
        `data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 1, model: body.model, choices: [{ index: 0, delta: d, finish_reason: finish }] })}\n\n`;
      return new Response(
        chunk(delta) +
          chunk({}, tool ? "tool_calls" : "stop") +
          "data: [DONE]\n\n",
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  return { url: server.url.origin, requests, close: () => server.stop(true) };
}
