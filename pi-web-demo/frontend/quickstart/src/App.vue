<script setup>
import { onMounted, onUnmounted, ref, shallowRef } from "vue";

// 接入 1：改成你的 API 地址和客户端标识。appID 必须是 9 位字符串；
// 相同 appID + session 会恢复同一段对话。模型 Key 只配置在后端。
const API_BASE = window.location.origin;
const identity = {
  appID: "quickdemo",
  session: "quickstart",
  model: "deepseek-flash",
};

const state = shallowRef({ turns: [], busy: false });
const message = ref("");
const status = ref("连接中");
const error = ref("");
const posting = ref(false);
let events;

function endpoint(path, query = false) {
  const url = new URL(path, API_BASE);
  if (query) url.search = new URLSearchParams(identity).toString();
  return url;
}

async function post(path, payload = {}) {
  const response = await fetch(endpoint(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...identity, ...payload }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}

async function connect() {
  events?.close();
  error.value = "";
  status.value = "连接中";
  try {
    // 接入 2：读取历史；GET /api/state 和 SSE 都带相同的三个查询参数。
    const response = await fetch(endpoint("/api/state", true));
    const initial = await response.json();
    if (!response.ok)
      throw new Error(initial.error || `HTTP ${response.status}`);
    state.value = initial;

    // 接入 3：SSE 每次推送完整状态，直接替换，不要追加到旧消息列表。
    events = new EventSource(endpoint("/api/events", true));
    events.onmessage = (event) => {
      state.value = JSON.parse(event.data);
      status.value = "已连接";
    };
    events.onerror = () => (status.value = "重连中");
  } catch (cause) {
    error.value = cause.message;
    status.value = "连接失败";
  }
}

async function send() {
  const text = message.value.trim();
  if (!text || posting.value || state.value.busy || status.value !== "已连接")
    return;
  posting.value = true;
  error.value = "";
  try {
    // 接入 4：POST /api/chat 返回 202 表示已接受，结果由 SSE 更新。
    await post("/api/chat", { message: text });
    message.value = "";
  } catch (cause) {
    error.value = cause.message;
  } finally {
    posting.value = false;
  }
}

async function stop() {
  try {
    await post("/api/stop");
  } catch (cause) {
    error.value = cause.message;
  }
}

function onKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    void send();
  }
}

onMounted(connect);
onUnmounted(() => events?.close());
</script>

<template>
  <main class="chat">
    <header>
      <h1>编码对话</h1>
      <span role="status">{{ state.busy ? "正在执行" : status }}</span>
    </header>

    <section class="messages" aria-live="polite">
      <p v-if="!state.turns.length" class="empty">
        描述你想开发的功能，Agent 会编写并修改代码。
      </p>
      <article v-for="turn in state.turns" :key="turn.id">
        <p class="user">{{ turn.prompt }}</p>
        <div class="answer">
          <template
            v-for="(block, index) in turn.blocks"
            :key="block.id || index"
          >
            <p v-if="block.type === 'text'">{{ block.text }}</p>
            <p v-else class="tool">{{ block.name }} · {{ block.status }}</p>
          </template>
          <p v-if="turn.error" class="error">{{ turn.error }}</p>
          <p v-if="turn.status === 'running'" class="tool">正在处理…</p>
        </div>
      </article>
    </section>

    <form @submit.prevent="send">
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <textarea
        v-model="message"
        aria-label="开发需求"
        placeholder="例如：做一个带新增和删除功能的待办清单…"
        rows="3"
        maxlength="20000"
        @keydown="onKeydown"
      ></textarea>
      <div class="actions">
        <small>Enter 发送 · Shift + Enter 换行</small>
        <button v-if="status === '连接失败'" type="button" @click="connect">
          重试连接
        </button>
        <button v-else-if="state.busy" type="button" @click="stop">停止</button>
        <button
          v-else
          type="submit"
          :disabled="status !== '已连接' || posting || !message.trim()"
        >
          {{ posting ? "发送中…" : "发送" }}
        </button>
      </div>
    </form>
  </main>
</template>
