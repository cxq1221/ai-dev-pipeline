<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import ChatTurn from "../components/ChatTurn.vue";
import ChatComposer from "../components/ChatComposer.vue";
import WorkspacePanel from "../components/WorkspacePanel.vue";
import { api, useSession } from "../composables/useSession.js";
const props = defineProps({ requirement: Object });
const chats = ref([]),
  composer = ref(null);
const showWorkspace = ref(true),
  previewUrl = ref(""),
  spec = ref(props.requirement.clarifiedDescription);
const { state, error, submitting, id, select, send, stop } = useSession();
const panelState = computed(() => ({
  ...state.value,
  session: props.requirement.id,
  appID: props.requirement.id,
  previewUrl: previewUrl.value,
}));
const workspaceApi = (route) =>
  api(route.replace("/api/", `/api/requirements/${props.requirement.id}/`));
let timer;
async function refresh() {
  chats.value = await api(
    `/api/requirements/${props.requirement.id}/conversations`,
  );
}
async function add() {
  try {
    const c = await api(
      `/api/requirements/${props.requirement.id}/conversations`,
      { title: `需求讨论 ${chats.value.length + 1}` },
    );
    await refresh();
    await select(c.id);
  } catch (e) {
    error.value = e.message;
  }
}
async function submit(message, skillNames) {
  if (await send(message, skillNames)) composer.value?.clear(message);
}
function copy(turn) {
  navigator.clipboard
    .writeText(
      turn.blocks
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
    )
    .catch((e) => (error.value = e.message));
}
onMounted(async () => {
  try {
    await refresh();
    if (chats.value.length) await select(chats.value[0].id);
    previewUrl.value = (await workspaceApi("/api/preview")).url;
    timer = setInterval(async () => {
      try {
        spec.value = (
          await api(`/api/requirements/${props.requirement.id}`)
        ).clarifiedDescription;
      } catch {}
    }, 2000);
  } catch (e) {
    error.value = e.message;
  }
});
onUnmounted(() => clearInterval(timer));
</script>
<template>
  <section class="development">
    <small>REQUIREMENT / LOCAL WORKSPACE</small>
    <h1>{{ requirement.title }}</h1>
    <p class="mono">{{ requirement.branchName }}</p>
    <button
      v-if="!showWorkspace"
      class="restore-preview"
      @click="showWorkspace = true"
    >
      展开工作区 →
    </button>
    <div class="dev-layout" :class="{ 'with-preview': showWorkspace }">
      <aside class="conversations">
        <strong>需求会话</strong><button @click="add">新会话</button
        ><small>独立对话 · 共享代码</small
        ><button
          v-for="c in chats"
          :key="c.id"
          :class="{ active: c.id === id }"
          @click="select(c.id)"
        >
          {{ c.title }}
        </button>
      </aside>
      <div class="chat-area">
        <details class="spec" open>
          <summary>需求说明</summary>
          <p>{{ requirement.originalDescription }}</p>
          <div v-if="spec">
            <strong>澄清后需求</strong>
            <p class="spec-content">{{ spec }}</p>
          </div>
        </details>
        <p v-if="!id" class="empty">创建一个会话，开始与 Pi 一起开发。</p>
        <div class="turns">
          <ChatTurn
            v-for="t in state.turns"
            :key="t.id"
            :turn="t"
            @copy="copy"
            @retry="composer?.suggest('请检查当前代码后继续完成需求。')"
          />
        </div>
        <ChatComposer
          v-if="id"
          ref="composer"
          :busy="state.busy"
          :configured="true"
          :submitting="submitting"
          :error="error"
          :model="state.model"
          @send="submit"
          @stop="stop"
        />
        <p v-else-if="error" role="alert">{{ error }}</p>
      </div>
      <WorkspacePanel
        v-if="showWorkspace && previewUrl"
        :state="panelState"
        :api="workspaceApi"
        @close="showWorkspace = false"
        @error="error = $event"
      />
    </div>
  </section>
</template>
