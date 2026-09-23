<script setup>
import { ref } from "vue";
const props = defineProps({
  busy: Boolean,
  configured: Boolean,
  submitting: Boolean,
  error: String,
  model: String,
});
const emit = defineEmits(["send", "stop"]);
const draft = ref("");
const input = ref(null);
function submit() {
  if (
    !props.busy &&
    !props.submitting &&
    props.configured &&
    draft.value.trim()
  )
    emit("send", draft.value.trim());
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
  <div class="compose-wrap">
    <div v-if="error" id="error" role="alert">{{ error }}</div>
    <form id="composer" @submit.prevent="submit">
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
          title="命令在本机执行，工作目录为 demo/workspace；不是系统沙箱"
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
</template>
