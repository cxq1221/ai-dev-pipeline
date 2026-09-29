export async function executeBusinessTool(sql, id, runId, event) {
  return sql.begin(async tx => {
    const [turn] = await tx`SELECT status FROM turns WHERE id=${runId} AND conversation_id=${id} FOR UPDATE`;
    const [prior] = await tx`SELECT result FROM business_tool_results WHERE run_id=${runId} AND tool_call_id=${event.toolCallId}`;
    if (prior) return prior.result;
    let result;
    try {
      if (turn?.status !== "running") throw new Error("执行已结束");
      const [execution] = await tx`SELECT e.request,d.cancel_requested FROM backend_executions e JOIN backend_delivery d ON d.run_id=e.run_id WHERE e.run_id=${runId}`;
      if (execution?.cancel_requested) throw new Error("执行已停止");
      if (!execution?.request.tools.some(t => t.name === event.name)) throw new Error("工具未获授权");
      const [conversation] = await tx`SELECT c.requirement_id, rc.mode, rc.conversation_id AS clarification_id FROM conversations c LEFT JOIN requirement_clarifications rc ON rc.requirement_id=c.requirement_id WHERE c.id=${id}`;
      const content = event.args?.content;
      if (typeof content !== "string" || !content.trim() || content.length > 50000) throw new Error("请提交 1–50000 字的完整需求说明");
      if (event.name === "update_requirement") {
        await tx`UPDATE requirements SET clarified_description=${content},updated_at=${Date.now()} WHERE id=${conversation.requirement_id}`;
      } else if (event.name === "complete_clarification") {
        if (conversation.mode !== "clarification" || conversation.clarification_id !== id) throw new Error("本会话不能完成需求澄清");
      } else throw new Error("未知业务工具");
      result = { content: [{ type: "text", text: event.name === "complete_clarification" ? "需求结论已提交；本轮成功结束后系统自动开发。" : "需求说明已保存" }] };
    } catch (e) { result = { content: [{ type: "text", text: e.message }], isError: true }; }
    await tx`INSERT INTO business_tool_results VALUES (${runId},${event.toolCallId},${event.name},${JSON.stringify(event.args)},${JSON.stringify(result)})`;
    return result;
  });
}
