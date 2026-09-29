<script setup>
import { ref, onMounted, onUnmounted, computed } from "vue";
import DevelopmentPage from "./pages/DevelopmentPage.vue";
const items = ref([]),
  selected = ref(null),
  error = ref(""),
  creating = ref(false),
  query = ref(""),
  saving = ref(false);
const form = ref({ originalDescription: "", repositoryPath: "" });
const repositoryPaths = ref([]);
const developmentPage = ref(null);
const filtered = computed(() =>
  items.value.filter((r) =>
    `${r.title} ${r.originalDescription}`.includes(query.value),
  ),
);
async function api(route, body) {
  const r = await fetch(route, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data.error), { code: data.code });
  return data;
}
async function load() {
  error.value = "";
  selected.value = null;
  try {
    const id = location.hash.match(/^#\/requirements\/([^/]+)/)?.[1];
    if (id)
      selected.value = await api(`/api/requirements/${encodeURIComponent(id)}`);
    else items.value = await api("/api/requirements");
  } catch (e) {
    error.value = e.message;
  }
}
async function create() {
  saving.value = true;
  error.value = "";
  try {
    const payload = { ...form.value, title: form.value.originalDescription };
    let req;
    try {
      req = await api("/api/requirements", payload);
    } catch (e) {
      if (e.code !== "EMPTY_REPOSITORY") throw e;
      if (!window.confirm(`仓库尚无提交：${payload.repositoryPath}\n\n是否创建空的初始提交并继续？\n不会提交现有文件（包括已暂存文件），也不会将它们复制到需求工作区。`)) return;
      req = await api("/api/requirements", { ...payload, initializeEmptyRepository: true });
    }
    creating.value = false;
    location.hash = `/requirements/${req.id}`;
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
onMounted(() => {
  api("/api/config").then((config) => {
    repositoryPaths.value = config.repositoryPaths || [];
    if (!form.value.repositoryPath) form.value.repositoryPath = config.defaultRepositoryPath || "";
  }).catch((e) => { error.value = e.message; });
  load();
  window.addEventListener("hashchange", load);
});
onUnmounted(() => window.removeEventListener("hashchange", load));
</script>
<template>
  <div class="app-shell">
    <aside class="sidebar">
      <a href="#/requirements" class="brand"
        ><b>ƒ</b><strong>forge</strong><small>本地 MVP</small></a
      >
      <div class="workspace-label">
        需求开发工作空间<small>一个需求，一处代码现场</small>
      </div>
      <a href="#/requirements" class="nav-active">☷　统一需求池</a>
      <div class="sidebar-foot">
        LOCAL MAC · PI AGENT<br />Vue / Bun / MySQL
      </div>
    </aside>
    <main>
      <div class="topbar" :class="{ 'has-requirement': selected }">
        <nav class="topbar-breadcrumb" aria-label="面包屑导航">
          <a href="#/requirements">统一需求池</a>
          <template v-if="selected"><span aria-hidden="true">/</span><span aria-current="page">需求开发</span></template>
        </nav>
        <button
          v-if="selected"
          class="topbar-requirement"
          aria-label="查看需求详情"
          title="点击查看需求详情"
          @click="developmentPage?.openRequirementDetails()"
        >
          <span class="topbar-requirement-label">当前需求</span>
          <span class="topbar-requirement-text">{{ selected.originalDescription || selected.title }}</span>
          <span class="topbar-requirement-action">查看详情 ↗</span>
        </button>
        <span v-if="!selected">本地执行</span>
      </div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <DevelopmentPage
        v-if="selected"
        ref="developmentPage"
        :key="selected.id"
        :requirement="selected"
      />
      <section v-else class="pool">
        <div class="page-heading">
          <div>
            <small>REQUIREMENTS</small>
            <h1>统一需求池</h1>
            <p>提出需求，与 AI 一起完成代码开发。</p>
          </div>
          <button class="primary" @click="creating = true">提出需求</button>
        </div>
        <input v-model="query" placeholder="搜索需求" aria-label="搜索需求" />
        <table>
          <thead>
            <tr>
              <th>需求</th>
              <th>工作分支</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in filtered" :key="r.id">
              <td>
                <a :href="`#/requirements/${r.id}`">{{ r.title }}</a
                ><small>{{ r.originalDescription }}</small>
              </td>
              <td class="mono">{{ r.branchName }}</td>
              <td>{{ new Date(r.updatedAt).toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="!filtered.length" class="empty">
          还没有需求，创建第一个需求开始开发。
        </p>
      </section>
    </main>
  </div>
  <div v-if="creating" class="modal-backdrop">
    <form class="modal" @submit.prevent="create">
      <h2>创建需求</h2>
      <label
        >需求描述（原始需求）<textarea
          v-model="form.originalDescription"
          aria-label="原始需求"
          required
          maxlength="255"
          rows="4"
        ></textarea></label
      ><label
        v-if="repositoryPaths.length > 1"
        >预置仓库<select aria-label="预置仓库" :value="form.repositoryPath" @change="form.repositoryPath = $event.target.value">
          <option value="" disabled>选择预置仓库，或在下方输入路径</option>
          <option v-for="p in repositoryPaths" :key="p" :value="p">{{ p }}</option>
        </select></label
      ><label
        >本地 Git 仓库路径<input
          v-model="form.repositoryPath"
          aria-label="本地 Git 仓库路径"
          required
          placeholder="/Users/…/project"
      /></label>
      <p>需求标题自动使用描述内容，最多 255 字。</p>
      <p>从当前已提交代码建立独立分支，不复制未提交改动。</p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <footer>
        <button type="button" @click="creating = false">取消</button
        ><button class="primary" :disabled="saving">
          {{ saving ? "正在创建…" : "创建并开发" }}
        </button>
      </footer>
    </form>
  </div>
</template>
