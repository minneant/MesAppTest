<template>
  <div class="min-h-screen flex items-center justify-center p-6 bg-gray-50">
    <div class="w-full max-w-sm space-y-4 bg-white border rounded-xl p-6">
      <h1 class="text-xl font-semibold text-center">로그인</h1>
      <form @submit.prevent="onSubmit" class="space-y-3">
        <div>
          <label class="text-sm text-gray-600">아이디</label>
          <input v-model.trim="id" class="w-full border rounded px-3 py-2" placeholder="예) staff_daewon" required />
        </div>
        <div>
          <label class="text-sm text-gray-600">비밀번호</label>
          <input v-model="pw" type="password" class="w-full border rounded px-3 py-2" required minlength="6" />
        </div>
        <button :disabled="loading" class="w-full rounded px-3 py-2 bg-gray-900 text-white">
          {{ loading ? "로그인 중..." : "로그인" }}
        </button>
        <p v-if="err" class="text-sm text-red-600 whitespace-pre-line">{{ err }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { signInWithIdPw } from "@/auth";

const id = ref(""); const pw = ref("");
const loading = ref(false); const err = ref("");
const route = useRoute(); const router = useRouter();

async function onSubmit() {
  err.value = ""; loading.value = true;
  try {
    await signInWithIdPw(id.value, pw.value);
    router.replace((route.query.redirect as string) || "/");
  } catch (e:any) {
    const m = String(e?.code || e?.message || "");
    if (m.includes("auth/invalid-email")) err.value = "아이디 형식이 올바르지 않습니다.";
    else if (m.includes("auth/invalid-credential")) err.value = "아이디 또는 비밀번호가 올바르지 않습니다.";
    else if (m.includes("auth/too-many-requests")) err.value = "요청이 많습니다. 잠시 후 다시 시도하세요.";
    else err.value = `로그인 오류: ${m}`;
  } finally { loading.value = false; }
}
</script>

<style scoped></style>
