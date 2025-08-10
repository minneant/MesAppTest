import { createRouter, createWebHistory } from "vue-router";
import BulkItems from "./pages/BulkFromMatrix.vue";
import ItemManage from "./pages/ItemManage.vue";
import Produce from "./pages/Produce.vue";
import ProduceFo from "./pages/ProduceFo.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/produce" },
    { path: "/produce", component: Produce },
    { path: "/bulk-items", component: BulkItems },
    { path: "/items-manage", component: ItemManage},
    { path: "/produce-fo", component: ProduceFo},
  ],
});
