import { createRouter, createWebHistory } from "vue-router";
import BulkItems from "./pages/BulkItemsGenerator.vue";
import ItemManage from "./pages/ItemManage.vue";
import ProductionHist from "./pages/ProductionHist.vue";
import ProduceFo from "./pages/ProduceFo.vue";
import MastersAd from "./pages/MastersAdmin.vue";
import AdminSeed from "./pages/AdminSeed.vue";
import SchemaInspect from "./pages/SchemaInspector.vue";
import SchemaEditor from "./pages/SchemaEditor.vue";
import BomBulk from "./pages/BomBulk.vue";
import BomManage from "./pages/bomManage.vue"
import ProduceFRP from "./pages/ProduceFRP.vue"


export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/produce" },
    { path: "/production-history", component: ProductionHist},
    { path: "/bulk-items", component: BulkItems },
    { path: "/items-manage", component: ItemManage},
    { path: "/produce-fo", component: ProduceFo},
    { path: "/tools/masters-admin", component: MastersAd},
    { path: "/tools/admin-seed", component: AdminSeed},
    { path: "/tools/schema", component: SchemaInspect},
    { path: "/tools/schema-editor", component: SchemaEditor},
    { path: "/bulk-boms", component: BomBulk},
    { path: "/boms-manage", component: BomManage},
    { path: "/produce-FRP", component: ProduceFRP},
    
  ],
});
