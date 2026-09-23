<script setup>
import { onUnmounted, ref } from "vue";
const dialog = ref(null),
  message = ref("");
let resolve;
function finish(answer) {
  dialog.value?.close();
  resolve?.(answer);
  resolve = undefined;
}
defineExpose({
  ask(text) {
    finish(false);
    message.value = text;
    dialog.value.showModal();
    return new Promise((done) => {
      resolve = done;
    });
  },
});
onUnmounted(() => finish(false));
</script>
<template>
  <dialog
    id="confirm-dialog"
    ref="dialog"
    aria-labelledby="confirm-title"
    @cancel.prevent="finish(false)"
  >
    <h3 id="confirm-title">确认操作</h3>
    <p>{{ message }}</p>
    <div class="dialog-actions">
      <button @click="finish(false)">取消</button
      ><button id="confirm-ok" @click="finish(true)">确认</button>
    </div>
  </dialog>
</template>
