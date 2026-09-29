<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import { api } from "../composables/useSession.js";
const props = defineProps({
  busy: Boolean,
  configured: Boolean,
  submitting: Boolean,
  error: String,
  model: String,
  initialDraft: { type: String, default: "" },
  clarification: Boolean,
});
const emit = defineEmits(["send", "stop", "draft-change"]);
const draft = ref(props.initialDraft);
watch(draft, value => emit("draft-change", value));
const input = ref(null);
const anchor = ref(null), dock = ref(null), dockStyle = ref({ visibility: "hidden" }), reservedHeight = ref(0);
let observer;
function placeDock() {
  if (!anchor.value || !dock.value) return;
  const rect = anchor.value.getBoundingClientRect();
  dockStyle.value = { left: `${rect.left + 8}px`, width: `${Math.max(0, rect.width - 16)}px` };
  reservedHeight.value = dock.value.getBoundingClientRect().height + 32;
}
onMounted(() => {
  observer = new ResizeObserver(placeDock);
  observer.observe(anchor.value);
  observer.observe(dock.value);
  window.addEventListener("resize", placeDock);
  window.addEventListener("scroll", placeDock, { passive: true });
  placeDock();
});
onUnmounted(() => {
  observer?.disconnect();
  window.removeEventListener("resize", placeDock);
  window.removeEventListener("scroll", placeDock);
});
const skills = ref([]), selectedSkills = ref([]), skillDirectory = ref(""), skillError = ref("");
async function refreshSkills() {
  try {
    const catalog = await api("/api/skills");
    skills.value = catalog.skills;
    skillDirectory.value = catalog.directory;
    selectedSkills.value = selectedSkills.value.filter(n => skills.value.some(s => s.name === n));
    skillError.value = catalog.diagnostics.map(d => d.message).join("；");
  } catch (e) { skillError.value = e.message; }
}
onMounted(refreshSkills);
function submit() {
  if (
    !props.busy &&
    !props.submitting &&
    props.configured &&
    draft.value.trim()
  )
    emit("send", draft.value.trim(), [...selectedSkills.value]);
}
function keydown(event) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}
defineExpose({
  suggest(text) {
    draft.value = text;
    input.value?.focus();
  },
  clear(sent) {
    if (draft.value.trim() === sent) draft.value = "";
  },
});
</script>
<template>
  <div ref="anchor" class="composer-anchor" :style="{ height: `${reservedHeight}px` }">
  <div ref="dock" class="compose-wrap" :class="{ 'clarification-composer': clarification }" :style="dockStyle">
    <div v-if="error" id="error" role="alert">{{ error }}</div>
    <form id="composer" @submit.prevent="submit">
      <slot />
      <details class="skill-picker">
        <summary>Skill · {{ selectedSkills.length ? `已选择 ${selectedSkills.length} 个` : "自动匹配" }}</summary>
        <p>共享可读写目录：{{ skillDirectory }} · Agent 可优化，下一轮生效</p>
        <button type="button" @click="refreshSkills">刷新 Skill 列表</button>
        <label v-for="skill in skills" :key="skill.name" class="skill-option">
          <input type="checkbox" v-model="selectedSkills" :value="skill.name" />
          <span>{{ skill.name }}{{ skill.disableModelInvocation ? "（仅手动）" : "" }}<small>{{ skill.description }}</small></span>
        </label>
        <p v-if="!skills.length">暂无 Skill，将 SKILL.md 放入目录后刷新。</p>
        <p v-if="skillError" role="alert">{{ skillError }}</p>
      </details>
      <textarea
        id="prompt"
        ref="input"
        v-model="draft"
        rows="3"
        placeholder="描述你想实现的功能，或继续修改代码…"
        aria-label="编码需求"
        maxlength="20000"
        @keydown="keydown"
      ></textarea>
      <div class="compose-bottom">
        <span
          class="access"
          title="命令在本机执行，工作目录为当前需求工作区；不是系统沙箱"
          >⌘ 本地代码开发</span
        >
        <div>
          <span class="model">{{ model }}</span
          ><button
            v-if="busy"
            id="stop"
            class="send"
            type="button"
            aria-label="停止生成"
            @click="emit('stop')"
          >
            ■</button
          ><button
            v-else
            id="send"
            class="send"
            type="submit"
            aria-label="发送需求"
            :disabled="!configured || submitting"
          >
            ↑
          </button>
        </div>
      </div>
    </form>
    <p class="hint">
      Enter 发送 · Shift + Enter 换行<span>由 Pi Agent 驱动</span>
    </p>
  </div>
  </div>
</template>
