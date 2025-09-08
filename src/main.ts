import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./assets/main.css";

// Firebase 초기화 파일을 한 번만 import (이미 firebase.ts가 있다면)
import "./firebase";

import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";

async function bootstrap() {
  await setPersistence(getAuth(), browserLocalPersistence); // 옵션
  createApp(App).use(router).mount("#app");
}
bootstrap();
