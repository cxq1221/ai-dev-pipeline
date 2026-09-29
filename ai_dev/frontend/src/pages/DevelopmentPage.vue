<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import ChatTurn from "../components/ChatTurn.vue";
import ChatComposer from "../components/ChatComposer.vue";
import WorkspacePanel from "../components/WorkspacePanel.vue";
import { api, useSession } from "../composables/useSession.js";
const props = defineProps({ requirement: Object });
const clarificationTemplate = `【需求背景】（客户是谁，为什么要做，有什么收益？）
1.
2.

【交付时间】（预期交付时间）
1.

【功能列表】（列出用户可理解的功能点，并列出平台）
1. iOS：通过 SDK 可以截图并保存到相册
2. Android：
3. 后台API：
4. 控制台：`;
function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text || ""), {
    FORBID_TAGS: ["img", "iframe", "style", "form", "input"],
    FORBID_ATTR: ["style"],
  });
}
const renderedSpec = computed(() => renderMarkdown(spec.value || "尚未生成澄清后的需求说明，完成需求澄清后将在此展示。"));
const draftKey = `forge:clarification-draft:${props.requirement.id}`;
const draftOpen = ref(false), firstSubmitting = ref(false), localDraft = ref(""), hasLocalDraft = ref(false);
try {
  const saved = localStorage.getItem(draftKey);
  if (saved !== null) { localDraft.value = saved; hasLocalDraft.value = true; }
} catch { /* Browser storage may be disabled; the in-memory draft still works. */ }
const backends = ref([]), newBackendId = ref("");
const backendName = computed(() => backends.value.find(b => b.id === state.value.backendId)?.name || state.value.backendId);
const chats = ref([]),
  composer = ref(null);
const showWorkspace = ref(true),
  specDialog = ref(null),
  previewUrl = ref(""),
  spec = ref(props.requirement.clarifiedDescription);
const { state, error, submitting, id, select, send, stop } = useSession();
const clarification = computed(() => chats.value.find(c => c.isClarification));
const selectedClarification = computed(() => clarification.value?.id === id.value);
const canCreateConversation = computed(() => clarification.value?.mode === "development"
  || (selectedClarification.value && state.value.mode === "development"));
function saveDraft(value) {
  if (!draftOpen.value && !selectedClarification.value) return;
  localDraft.value = value;
  hasLocalDraft.value = true;
  try { localStorage.setItem(draftKey, value); } catch { error.value = "浏览器无法保存本地草稿，请不要刷新页面。"; }
}
async function openClarification() {
  if (clarification.value) {
    draftOpen.value = false;
    await select(clarification.value.id);
  } else {
    if (!hasLocalDraft.value) localDraft.value = clarificationTemplate;
    draftOpen.value = true;
    saveDraft(localDraft.value);
  }
}
async function choose(value) { draftOpen.value = false; await select(value); }
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
  if (firstSubmitting.value || !canCreateConversation.value) return;
  firstSubmitting.value = true;
  try {
    const c = await api(
      `/api/requirements/${props.requirement.id}/conversations`,
      { title: `需求讨论 ${chats.value.length + 1}`, backendId: newBackendId.value },
    );
    await refresh();
    await choose(c.id);
  } catch (e) {
    error.value = e.message;
  } finally { firstSubmitting.value = false; }
}
async function submit(message, skillNames) {
  if (firstSubmitting.value || submitting.value) return;
  let success = false;
  if (draftOpen.value) {
    firstSubmitting.value = true;
    error.value = "";
    try {
      const result = await api(`/api/requirements/${props.requirement.id}/clarification`, { message, skillNames, backendId: newBackendId.value });
      await refresh();
      draftOpen.value = false;
      await select(result.conversationId);
      await nextTick();
      success = true;
    } catch (e) {
      // Keep the draft on failure, and reconnect to any session already created.
      try { await refresh(); if (clarification.value) await choose(clarification.value.id); } catch {}
      error.value = e.message;
    } finally { firstSubmitting.value = false; }
  } else success = await send(message, skillNames);
  if (success) {
    composer.value?.clear(message);
    await nextTick();
    if (selectedClarification.value) {
      localDraft.value = "";
      hasLocalDraft.value = false;
      try { localStorage.removeItem(draftKey); } catch {}
    }
  }
}
async function beginDevelopment() {
  if (await send("开始开发", [], true)) await refresh();
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
    const configuration = await api("/api/backends");
    backends.value = configuration.backends;
    newBackendId.value = configuration.defaultBackendId;
    await refresh();
    if (hasLocalDraft.value && !clarification.value) draftOpen.value = true;
    else if (chats.value.length) await select((hasLocalDraft.value && clarification.value ? clarification.value : chats.value[0]).id);
    previewUrl.value = (await workspaceApi("/api/preview")).url;
    timer = setInterval(async () => {
      try {
        await refresh();
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
function openRequirementDetails() {
  specDialog.value?.showModal();
}
defineExpose({ openRequirementDetails });
</script>
<template>
  <section class="development">
    <header class="development-heading">
      <div class="requirement-title-row">
        <h1>{{ requirement.title }}</h1>
      </div>
      <button v-if="!showWorkspace" class="restore-preview" @click="showWorkspace = true">展开工作区 →</button>
      <p class="mono">{{ requirement.branchName }}</p>
    </header>
    <div class="dev-layout" :class="{ 'with-preview': showWorkspace }">
      <aside class="conversations">
        <strong>需求会话</strong>
        <label v-if="backends.length > 1" class="backend-choice">新会话后端
          <select v-model="newBackendId" aria-label="新会话后端">
            <option v-for="backend in backends" :key="backend.id" :value="backend.id">{{ backend.name }}</option>
          </select>
        </label>
        <small v-if="!draftOpen && backendName">当前后端：{{ backendName }}</small>
        <button v-if="!clarification" class="primary" :disabled="firstSubmitting" @click="openClarification">需求澄清</button>
        <button :disabled="firstSubmitting || !canCreateConversation" :title="canCreateConversation ? '独立对话 · 共享代码' : '请先完成需求澄清'" @click="add">新会话</button
        ><small>{{ canCreateConversation ? "独立对话 · 共享代码" : "请先完成需求澄清" }}</small
        ><button
          v-for="c in chats"
          :key="c.id"
          :class="{ active: !draftOpen && c.id === id }"
          :disabled="firstSubmitting"
          @click="choose(c.id)"
        >
          {{ c.isClarification ? ((c.id === id ? state.mode : c.mode) === 'development' ? '需求开发' : '需求澄清') : c.title }}
        </button>
      </aside>
      <div class="chat-area">
        <section v-if="!clarification || draftOpen" class="clarification-guide">
          <h3>先把需求聊清楚</h3>
          <p>{{ clarificationTemplate }}</p>
          <button v-if="!draftOpen" class="primary" :disabled="firstSubmitting" @click="openClarification">需求澄清</button>
          <small>{{ draftOpen ? "草稿仅保存在本浏览器，首次发送后才创建会话并调用 AI。" : "点击后可编辑引导内容；未发送不会创建澄清会话。" }}</small>
        </section>
        <div v-if="!draftOpen" class="turns">
          <ChatTurn
            v-for="t in state.turns"
            :key="t.id"
            :turn="t"
            @copy="copy"
            @retry="composer?.suggest('请检查当前代码后继续完成需求。')"
          />
        </div>
        <ChatComposer
          v-if="id || draftOpen"
          :key="draftOpen ? 'clarification-draft' : id"
          ref="composer"
          :busy="draftOpen ? false : state.busy"
          :configured="true"
          :submitting="submitting || firstSubmitting"
          :initial-draft="draftOpen || selectedClarification ? localDraft : ''"
          :clarification="draftOpen || (selectedClarification && state.mode === 'clarification' && state.turns.length === 0)"
          :error="error"
          :model="state.model"
          @send="submit"
          @stop="stop"
          @draft-change="saveDraft"
        >
          <div v-if="draftOpen || state.mode" class="composer-phase">
            <span>{{ draftOpen || state.mode === 'clarification' ? '澄清中 · 不修改代码' : '开发中' }}</span>
            <button v-if="!draftOpen && selectedClarification && state.mode === 'clarification'" type="button" class="primary" :disabled="state.busy || submitting || firstSubmitting" title="请 AI 检查需求是否已澄清，未完成时继续提问" @click="beginDevelopment">开始开发 →</button>
          </div>
        </ChatComposer>
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
  <Teleport to="body">
    <dialog ref="specDialog" class="spec-dialog" aria-labelledby="spec-title" @click="($event.target === specDialog) && specDialog.close()">
      <section class="spec-panel">
        <header class="spec-panel-heading">
          <div><h2 id="spec-title">需求说明</h2><small>{{ requirement.title }}</small></div>
          <button aria-label="关闭需求说明" autofocus @click="specDialog.close()">关闭 ✕</button>
        </header>
        <div class="spec-panel-content">
          <h3>原始需求</h3>
          <p class="spec-content">{{ requirement.originalDescription }}</p>
          <h3>澄清后需求</h3>
          <div class="markdown spec-markdown" v-html="renderedSpec"></div>
        </div>
      </section>
    </dialog>
  </Teleport>
</template>

<style scoped>
.backend-choice { display: grid; gap: 6px; font-size: 12px; }
.backend-choice select { max-width: 100%; padding: 8px; border: 1px solid #d9e2dd; border-radius: 6px; background: white; color: inherit; }
</style>
