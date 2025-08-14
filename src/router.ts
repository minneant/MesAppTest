import { createRouter, createWebHistory } from "vue-router";
import BulkItems from "./pages/BulkItems.vue";
import ItemManage from "./pages/ItemManage.vue";
import ProductionHist from "./pages/ProductionHist.vue";
import ProduceFo from "./pages/ProduceFo.vue";
import MasterManage from "./pages/MasterManage.vue";
import SchemaInspect from "./pages/SchemaInspector.vue";
import SchemaEditor from "./pages/SchemaEditor.vue";
import BulkBoms from "./pages/BulkBoms.vue";
import BomManage from "./pages/bomManage.vue"
import ProduceFRP from "./pages/ProduceFRP.vue"
import ProduceFinishing from "./pages/ProduceFinishing.vue"
import ProducePackaging from "./pages/ProducePackaging.vue"


export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", redirect: "/produce" },
    { path: "/production-history", component: ProductionHist},
    { path: "/bulk-items", component: BulkItems },
    { path: "/items-manage", component: ItemManage},
    { path: "/produce-fo", component: ProduceFo},
    { path: "/tools/masters-admin", component: MasterManage},
    { path: "/tools/schema", component: SchemaInspect},
    { path: "/tools/schema-editor", component: SchemaEditor},
    { path: "/bulk-boms", component: BulkBoms},
    { path: "/boms-manage", component: BomManage},
    { path: "/produce-frp", component: ProduceFRP},
    { path: "/produce-finishing", component: ProduceFinishing},
    { path: "/produce-packaging", component: ProducePackaging},
  ],
});
