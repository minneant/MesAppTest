import { createRouter, createWebHistory } from "vue-router";
import BulkItems from "./pages/BulkFromMatrix.vue";
import ItemManage from "./pages/ItemManage.vue";
import ProductionHist from "./pages/ProductionHist.vue";
import ProduceFo from "./pages/ProduceFo.vue";
import MastersAd from "./pages/MastersAdmin.vue";
import AdminSeed from "./pages/AdminSeed.vue"

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/produce" },
    { path: "/production-history", component: ProductionHist},
    { path: "/bulk-items", component: BulkItems },
    { path: "/items-manage", component: ItemManage},
    { path: "/produce-fo", component: ProduceFo},
    { path: "/masters-admin", component: MastersAd},
    { path: "/admin-seed", component: AdminSeed},
  ],
});
