import { ref, onUnmounted } from "vue";
export async function api(route, body, method = body ? "POST" : "GET") {
  const r = await fetch(route, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export function useSession() {
  const state = ref({ turns: [], busy: false }),
    error = ref(""),
    submitting = ref(false),
    id = ref("");
  let stream,
    generation = 0;
  async function select(value) {
    const current = ++generation;
    stream?.close();
    id.value = value;
    state.value = { turns: [], busy: false };
    error.value = "";
    try {
      const initial = await api(`/api/conversations/${value}/state`);
      if (current !== generation) return;
      state.value = initial;
      stream = new EventSource(`/api/conversations/${value}/events`);
      stream.onmessage = (e) => {
        if (current === generation) {
          state.value = JSON.parse(e.data);
          error.value = "";
        }
      };
      stream.onerror = () => {
        if (current === generation) error.value = "连接中断，正在重新连接…";
      };
    } catch (e) {
      if (current === generation) error.value = e.message;
    }
  }
  async function send(message, skillNames = []) {
    submitting.value = true;
    error.value = "";
    try {
      await api(`/api/conversations/${id.value}/chat`, { message, skillNames });
      return true;
    } catch (e) {
      error.value = e.message;
      return false;
    } finally {
      submitting.value = false;
    }
  }
  async function stop() {
    try {
      await api(`/api/conversations/${id.value}/stop`, {});
    } catch (e) {
      error.value = e.message;
    }
  }
  onUnmounted(() => {
    generation++;
    stream?.close();
  });
  return { state, error, submitting, id, select, send, stop };
}
