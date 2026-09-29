<script setup>
import { computed } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
const props = defineProps({
  turn: { type: Object, required: true },
  canUndo: Boolean,
});
const emit = defineEmits(["undo", "review", "copy", "retry"]);
const labels = {
  running: "正在开发",
  done: "已完成",
  error: "执行失败",
  stopped: "已停止",
  undone: "已撤销修改",
  interrupted: "已中断",
};
const toolNames = {
  list_files: "查看文件",
  read_file: "读取文件",
  write_file: "写入文件",
  edit_file: "修改文件",
  bash: "执行命令",
};
const duration = computed(() => {
  const s = Math.round(
    ((props.turn.finishedAt || Date.now()) - props.turn.startedAt) / 1000,
  );
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
});
// This is the only HTML rendering boundary; tool output and paths use Vue text escaping.
function markdown(text) {
  return DOMPurify.sanitize(marked.parse(text || ""), {
    FORBID_TAGS: ["img", "iframe", "style", "form", "input"],
    FORBID_ATTR: ["style"],
  });
}
</script>
<template>
  <article class="turn">
    <div class="user-line">
      <div class="user-bubble">{{ turn.prompt }}</div>
    </div>
    <div class="turn-meta">
      <span :class="{ pulse: turn.status === 'running' }">{{
        labels[turn.status] || turn.status
      }}</span
      ><span>·</span><span>用时 {{ duration }}</span>
    </div>
    <template
      v-for="(block, index) in turn.blocks"
      :key="block.id || `text-${index}`"
    >
      <div
        v-if="block.type === 'text'"
        class="markdown"
        v-html="markdown(block.text)"
      ></div>
      <details v-else class="tool">
        <summary>
          <span
            class="tool-icon"
            :class="{ pulse: block.status === 'running' }"
            >{{
              block.status === "running"
                ? "◌"
                : block.status === "done"
                  ? "✓"
                  : "!"
            }}</span
          ><span>{{ toolNames[block.name] || block.name }}</span
          ><span class="tool-target">{{
            block.args?.path || block.args?.command || "workspace/"
          }}</span
          ><span>⌄</span>
        </summary>
        <pre
          >{{ block.args?.command || block.args?.path || ""
          }}{{ block.output ? "\n\n" + block.output : "\n等待工具结果…" }}</pre>
      </details>
    </template>
    <div v-if="turn.error" class="turn-error">{{ turn.error }}</div>
    <div v-if="turn.changes.length" class="changes-card">
      <div class="changes-title">
        <strong
          >{{ turn.status === "undone" ? "已撤销" : "已编辑" }}
          {{ turn.changes.length }} 个文件</strong
        >
        <div>
          <button v-if="canUndo" @click="emit('undo')">撤销 ↶</button>
          <button @click="emit('review', turn.id)">查看变更</button>
        </div>
      </div>
      <button
        v-for="change in turn.changes"
        :key="change.path"
        class="change-file"
        @click="emit('review', turn.id)"
      >
        <span>{{ change.path }}</span
        ><span class="change-stats"
          ><span class="plus">+{{ change.added }}</span>
          <span class="minus">−{{ change.removed }}</span></span
        >
      </button>
    </div>
    <div v-if="turn.status !== 'running'" class="turn-actions">
      <button @click="emit('copy', turn)">复制回复</button
      ><button
        v-if="['error', 'stopped', 'interrupted'].includes(turn.status)"
        @click="emit('retry', turn)"
      >
        继续此需求
      </button>
    </div>
  </article>
</template>
