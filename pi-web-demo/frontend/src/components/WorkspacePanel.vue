<script setup>
import { computed, onUnmounted, ref, watch } from "vue";
const props = defineProps({
  state: { type: Object, required: true },
  api: { type: Function, required: true },
});
const emit = defineEmits(["close", "error"]);
const tab = ref("preview"),
  files = ref([]),
  selectedFile = ref(""),
  content = ref(""),
  revision = ref(0),
  reviewing = ref(null);
const viewedTurn = computed(
  () =>
    props.state.turns.find((t) => t.id === reviewing.value) ||
    props.state.turns.at(-1),
);
const changeCount = computed(
  () => props.state.turns.at(-1)?.changes.length || 0,
);
const previewSrc = computed(
  () => `${props.state.previewUrl}/?revision=${revision.value}`,
);
let listRequest = 0,
  fileRequest = 0,
  disposed = false;
async function refresh() {
  const request = ++listRequest;
  try {
    const result = await props.api("/api/files");
    if (disposed || request !== listRequest) return;
    files.value = result;
    if (!result.includes(selectedFile.value))
      selectedFile.value = result[0] || "";
    revision.value++;
  } catch (e) {
    if (!disposed && request === listRequest) emit("error", e.message);
  }
}
watch(
  () => {
    const t = props.state.turns.at(-1);
    return props.state.session
      ? `${props.state.appID}:${props.state.session}:${t?.id}:${t?.status}`
      : "";
  },
  (marker) => {
    if (marker) void refresh();
  },
  { immediate: true },
);
function review(id) {
  reviewing.value = id;
  tab.value = "diff";
}
defineExpose({ review });
watch([selectedFile, tab, revision], async ([file, active], _, onCleanup) => {
  const request = ++fileRequest;
  if (active !== "files" || !file) return;
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  content.value = "正在读取…";
  try {
    const result = await props.api(
      "/api/file?path=" + encodeURIComponent(file),
      undefined,
      controller.signal,
    );
    if (request === fileRequest) content.value = result.content;
  } catch (e) {
    if (e.name !== "AbortError" && request === fileRequest) {
      content.value = "读取失败";
      emit("error", e.message);
    }
  }
});
onUnmounted(() => {
  disposed = true;
  listRequest++;
  fileRequest++;
});
function selectTab(value) {
  tab.value = value;
  reviewing.value = null;
}
function lineClass(line) {
  return line.startsWith("+")
    ? "add"
    : line.startsWith("-")
      ? "del"
      : line.startsWith("@@")
        ? "hunk"
        : "";
}
</script>
<template>
  <aside id="workspace">
    <div class="panel-heading">
      <div>
        <strong>工作区</strong
        ><small id="file-count">{{ files.length }} 个文件</small>
      </div>
      <button
        id="close-panel"
        class="quiet"
        aria-label="收起工作区"
        @click="emit('close')"
      >
        ×
      </button>
    </div>
    <nav class="tabs">
      <button
        :class="{ active: tab === 'preview' }"
        @click="selectTab('preview')"
      >
        预览</button
      ><button :class="{ active: tab === 'files' }" @click="selectTab('files')">
        文件</button
      ><button :class="{ active: tab === 'diff' }" @click="selectTab('diff')">
        变更 <span>{{ changeCount }}</span>
      </button>
    </nav>
    <div class="panel-tools">
      <span id="panel-label">{{
        tab === "preview"
          ? "index.html"
          : tab === "files"
            ? "项目文件"
            : viewedTurn?.status === "undone"
              ? "历史变更（已撤销）"
              : "本轮文件变更"
      }}</span
      ><button
        id="refresh"
        class="quiet"
        aria-label="刷新工作区"
        @click="refresh"
      >
        ↻</button
      ><a
        v-if="files.includes('index.html')"
        id="open-preview"
        :href="state.previewUrl"
        target="_blank"
        rel="noopener"
        >新窗口 ↗</a
      >
    </div>
    <div id="panel-content">
      <template v-if="tab === 'preview'"
        ><iframe
          v-if="files.includes('index.html')"
          title="运行预览"
          sandbox="allow-scripts allow-same-origin"
          :src="previewSrc"
        ></iframe>
        <div v-else class="empty-panel">
          <div class="symbol">⌘</div>
          <strong>你的作品会出现在这里</strong>
          <p>发送一个需求，生成网页后即可在这里直接操作。</p>
        </div></template
      >
      <template v-else-if="tab === 'files'"
        ><template v-if="files.length"
          ><div class="file-list">
            <button
              v-for="file in files"
              :key="file"
              :class="{ selected: file === selectedFile }"
              @click="selectedFile = file"
            >
              ⌑ &nbsp;{{ file }}
            </button>
          </div>
          <pre class="file-code">{{ content }}</pre>
        </template>
        <div v-else class="empty-panel">
          <strong>工作区还是空的</strong>
          <p>对话生成的文件会保存在这里。</p>
        </div></template
      >
      <template v-else
        ><template v-if="viewedTurn?.changes.length"
          ><details
            v-for="change in viewedTurn.changes"
            :key="`${viewedTurn.id}:${change.path}`"
            class="diff-file"
            open
          >
            <summary>
              {{ change.path }} &nbsp;
              <span class="plus">+{{ change.added }}</span>
              <span class="minus">−{{ change.removed }}</span>
            </summary>
            <pre><span v-for="(line,index) in change.patch.split('\n')" :key="index" class="diff-line" :class="lineClass(line)">{{ line }}</span></pre>
          </details></template
        >
        <div v-else class="empty-panel">
          <strong>暂无文件变更</strong>
          <p>每一轮完成后，这里会显示真实的代码差异。</p>
        </div></template
      >
    </div>
    <div class="workspace-foot">
      <span>workspace /</span
      ><span>{{ state.busy ? "正在更新代码" : "已就绪" }}</span>
    </div>
  </aside>
</template>
