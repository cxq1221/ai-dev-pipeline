<script setup>
import { nextTick, onUnmounted, ref, watch } from "vue";
import { useSession } from "./composables/useSession";
import ChatTurn from "./components/ChatTurn.vue";
import ChatComposer from "./components/ChatComposer.vue";
import WorkspacePanel from "./components/WorkspacePanel.vue";
import ConfirmDialog from "./components/ConfirmDialog.vue";
const { state, connection, error, submitting, api, action, send, identity } =
  useSession();
const panelOpen = ref(window.innerWidth > 700),
  scroll = ref(null),
  composer = ref(null),
  workspace = ref(null),
  dialog = ref(null),
  toast = ref("");
const prompts = [
  "做一个有添加、完成和删除功能的待办清单网页",
  "创建一个简洁的番茄钟，支持开始、暂停和重置",
  "先查看工作区代码，告诉我可以改进什么",
];
let toastTimer;
function notify(text) {
  toast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.value = ""), 2400);
}
onUnmounted(() => clearTimeout(toastTimer));
watch(
  state,
  async () => {
    const el = scroll.value;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 130;
    await nextTick();
    if (atBottom) el.scrollTop = el.scrollHeight;
  },
  { flush: "pre" },
);
async function submit(message) {
  if (await send(message)) composer.value?.clear(message);
}
async function undo() {
  if (
    await dialog.value.ask("撤销上一轮的文件修改，并恢复修改前的对话上下文？")
  )
    if (await action("/api/undo")) notify("已恢复修改前的文件");
}
async function reset() {
  if (await dialog.value.ask("清空对话上下文？生成的文件会保留。"))
    await action("/api/reset");
}
function review(id) {
  panelOpen.value = true;
  workspace.value.review(id);
}
async function copy(turn) {
  try {
    await navigator.clipboard.writeText(
      turn.blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
    );
    notify("已复制回复");
  } catch (e) {
    error.value = e.message;
  }
}
function retry(turn) {
  void submit(
    `继续完成上一条需求：${turn.prompt}。先检查当前文件和之前的执行结果。`,
  );
}
</script>
<template>
  <header>
    <a class="brand" href="/" aria-label="Pi 编码工作台"
      ><b>π</b><span>Pi <em>/</em> 编码工作台</span></a
    >
    <div class="header-right">
      <a class="quiet" href="/quickstart/">Quickstart ↗</a>
      <span
        id="connection"
        class="status"
        :style="{ color: connection === '已连接' ? '' : '#ad714a' }"
        >{{ connection }}</span
      ><button id="toggle-panel" @click="panelOpen = !panelOpen">
        工作区 <span>↗</span></button
      ><button
        id="reset"
        class="quiet"
        :disabled="state.busy || submitting"
        @click="reset"
      >
        清空对话
      </button>
    </div>
  </header>
  <main>
    <section class="conversation">
      <div id="scroll" ref="scroll" class="scroll">
        <div id="messages" aria-live="polite">
          <section v-if="!state.turns.length" class="welcome">
            <span class="eyebrow">从一个想法开始</span>
            <h1>你想做点什么？</h1>
            <p>
              描述你的需求，让想法变成可以运行的代码。<br />我会编写文件、执行验证，并与你一起迭代。
            </p>
            <div class="suggestions">
              <button
                v-for="prompt in prompts"
                :key="prompt"
                @click="composer.suggest(prompt)"
              >
                {{ prompt }}<span>↗</span>
              </button>
            </div>
          </section>
          <ChatTurn
            v-for="(turn, index) in state.turns"
            :key="turn.id"
            :turn="turn"
            :can-undo="index === state.turns.length - 1 && state.canUndo"
            @undo="undo"
            @review="review"
            @copy="copy"
            @retry="retry"
          />
        </div>
      </div>
      <ChatComposer
        ref="composer"
        :busy="state.busy"
        :configured="state.configured"
        :model="identity.model"
        :submitting="submitting"
        :error="error"
        @send="submit"
        @stop="action('/api/stop')"
      />
    </section>
    <WorkspacePanel
      v-show="panelOpen"
      ref="workspace"
      :state="state"
      :api="api"
      @close="panelOpen = false"
      @error="error = $event"
    />
  </main>
  <ConfirmDialog ref="dialog" />
  <div v-if="toast" id="toast" role="status">{{ toast }}</div>
</template>
