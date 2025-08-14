import { createRouter, createWebHistory } from "vue-router";

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

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ✅ 루트는 Home으로! (예전의 redirect 라인을 꼭 지워주세요)
    { path: "/", component: Home },

    // 생산실적 조회
    { path: "/production-history", component: ProductionHist },

    // 재고 조회
    { path: "/inventory", component: Inventory },

    // 아이템 관리
    { path: "/bulk-boms", component: BulkBoms },
    { path: "/bom-manage", component: BomManage },
    { path: "/bulk-items", component: BulkItems },
    { path: "/item-manage", component: ItemManage },
    { path: "/master-manage", component: MasterManage },

    // 생산실적 입력
    { path: "/produce-foaming", component: ProduceFoaming },
    { path: "/produce-frp", component: ProduceFRP },
    { path: "/produce-finishing", component: ProduceFinishing },
    { path: "/produce-packaging", component: ProducePackaging },

    // 기타
    { path: "/schema-inspector", component: SchemaInspector },
    { path: "/schema-editor", component: SchemaEditor },

    // 404는 홈으로 보내기 (선택)
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});

export default router;
