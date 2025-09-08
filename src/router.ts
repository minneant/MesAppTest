import { createRouter, createWebHistory } from "vue-router";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import Home from "./pages/Home.vue";
import BulkItems from "./pages/BulkItems.vue";
import ItemManage from "./pages/ItemManage.vue";
import ProductionHist from "./pages/ProductionHist.vue";
import ProduceFoaming from "./pages/ProduceFoaming.vue";
import MasterManage from "./pages/MasterManage.vue";
import SchemaInspector from "./pages/SchemaInspector.vue";
import SchemaEditor from "./pages/SchemaEditor.vue";
import BulkBoms from "./pages/BulkBoms.vue";
import BomManage from "./pages/BomManage.vue";
import ProduceFRP from "./pages/ProduceFRP.vue";
import ProduceFinishing from "./pages/ProduceFinishing.vue";
import ProducePackaging from "./pages/ProducePackaging.vue";
import Inventory from "./pages/Inventory.vue";
import Login from "./pages/Login.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Home, name: "home" },
    { path: "/login", component: Login, name: "login" }, // 공개
    { path: "/production-history", component: ProductionHist, name: "production-history" },
    { path: "/inventory", component: Inventory, name: "inventory" },
    { path: "/bulk-boms", component: BulkBoms, name: "bulk-boms" },
    { path: "/bom-manage", component: BomManage, name: "bom-manage" },
    { path: "/bulk-items", component: BulkItems, name: "bulk-items" },
    { path: "/item-manage", component: ItemManage, name: "item-manage" },
    { path: "/master-manage", component: MasterManage, name: "master-manage" },
    { path: "/produce-foaming", component: ProduceFoaming, name: "produce-foaming" },
    { path: "/produce-frp", component: ProduceFRP, name: "produce-frp" },
    { path: "/produce-finishing", component: ProduceFinishing, name: "produce-finishing" },
    { path: "/produce-packaging", component: ProducePackaging, name: "produce-packaging" },
    { path: "/schema-inspector", component: SchemaInspector, name: "schema-inspector" },
    { path: "/schema-editor", component: SchemaEditor, name: "schema-editor" },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

export default router;

// ---- 전역 가드 ----
const PUBLIC_ROUTE_NAMES = new Set<string>(["login"]);
function waitForAuth() {
  const auth = getAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}

router.beforeEach(async (to) => {
  if (to.name && PUBLIC_ROUTE_NAMES.has(String(to.name))) return true;
  const auth = getAuth();
  const user = auth.currentUser ?? (await waitForAuth());
  if (!user) return { name: "login", query: { redirect: to.fullPath } };
  return true;
});
