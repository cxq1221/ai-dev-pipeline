import { onMounted, onUnmounted, ref, shallowRef } from "vue";

// Each mounted demo connects to one app/session; other clients use the same HTTP contract.
export function useSession() {
  const params = new URLSearchParams(window.location.search);
  const identity = Object.freeze({
    appID: params.get("appID") ?? "vue-demo1",
    session: params.get("session") ?? "demo",
    model: params.get("model") ?? "deepseek-flash",
  });
  function scopedUrl(url) {
    const target = new URL(url, window.location.origin);
    for (const [name, value] of Object.entries(identity))
      target.searchParams.set(name, value);
    return target.pathname + target.search;
  }
  const state = shallowRef({ turns: [], busy: false, configured: false });
  const connection = ref("连接中");
  const error = ref("");
  const submitting = ref(false);
  let events;
  let disposed = false;
  async function api(url, body, signal) {
    const response = await fetch(body === undefined ? scopedUrl(url) : url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body:
        body === undefined
          ? undefined
          : JSON.stringify({ ...body, ...identity }),
      signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  }
  async function action(url, body = {}) {
    error.value = "";
    try {
      await api(url, body);
      return true;
    } catch (e) {
      error.value = e.message;
      return false;
    }
  }
  async function send(message) {
    if (state.value.busy || submitting.value || !message.trim()) return false;
    submitting.value = true;
    try {
      return await action("/api/chat", { message });
    } finally {
      submitting.value = false;
    }
  }
  onMounted(async () => {
    try {
      const initial = await api("/api/state");
      if (disposed) return;
      state.value = initial;
      events = new EventSource(scopedUrl("/api/events"));
      events.onmessage = (event) => {
        try {
          state.value = JSON.parse(event.data);
          connection.value = "已连接";
        } catch {
          error.value = "收到无效会话数据，请刷新页面";
        }
      };
      events.onerror = () => {
        connection.value = "连接中断，正在重连";
      };
    } catch (e) {
      error.value = "无法连接服务：" + e.message;
      connection.value = "未连接";
    }
  });
  onUnmounted(() => {
    disposed = true;
    events?.close();
  });
  return { state, connection, error, submitting, api, action, send, identity };
}
