<script setup lang="ts">
import { db } from "@/firebase";
import {
  collection, doc, setDoc, getDocs, writeBatch, serverTimestamp,
  query, where, documentId
} from "firebase/firestore";
import { ref } from "vue";

/* ---------------- 로그 ---------------- */
const log = ref("");
function append(msg: string) {
  log.value += msg + "\n";
}

/* ---------------- Ship-tos 시드 ---------------- */
// 초기 수령처 데이터
const SHIP_TOS = [
  {
    id: "전남목포정민호",
    label: "전남목포정민호",
    personInCharge: "고종오 차장(010-9327-1865)",
    address: "전남 여수시율촌면  율촌산단6로124 (율촌면 여동리 372-3) 유성 ENG"
  },
  {
    id: "거제샾",
    label: "거제샾",
    personInCharge: "이충재 차장(010-3008-8869)",
    address: "경상남도 거제시 하청면 유계6길5 한국카본 거제공장"
  },
  {
    id: "거제(삼성)김태성",
    label: "거제(삼성)김태성",
    personInCharge: "윤현보 차장 010-9302-9411, 강종혁 반장 010-6657-5072",
    address: "경남 거제시 삼성중공업 KD안벽"
  }
];

async function seedShipTos() {
  append("▶ ship_tos 시드 시작");
  for (const sto of SHIP_TOS) {
    await setDoc(doc(db, "ship_tos", sto.id), {
      ...sto,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    }, { merge: true });
    append(` - ${sto.id} (${sto.label}) OK`);
  }
  append("✔ ship_tos 완료\n");
}

/* ---------------- UoM Rules 시드 ---------------- */
const UOM_RULES = [
  { key: "STM_LIQ_8_pa_L1000", base_uom: "M", ea_per_m: 4, note: "1m당 내피2 + 외피2" },
  { key: "STM_LIQ_8_pa_L1000", base_uom: "M", ea_per_m: 4, note: "동일" },
];

async function seedUomRules() {
  append("▶ uom_rules 시드 시작");
  for (const r of UOM_RULES) {
    await setDoc(doc(db, "uom_rules", r.key), {
      ...r,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    }, { merge: true });
    append(` - uom_rules/${r.key} OK`);
  }
  append("✔ uom_rules 완료\n");
}

/* ---------------- Packing Status 시드 ---------------- */
const PACKING_STATUSES = [
  { code: "PLANNED", label: "계획", order: 10, enabled: true },
  { code: "PACKED",  label: "포장완료", order: 30, enabled: true },
  { code: "SHIPPED", label: "출하완료", order: 40, enabled: true },
  { code: "CANCELLED", label: "취소", order: 90, enabled: true },
];

async function seedPackingStatuses() {
  append("▶ masters/packing_statuses 라벨 시드 시작");
  for (const it of PACKING_STATUSES) {
    await setDoc(doc(db, "masters", "packing_statuses", "list", it.code), {
      code: it.code,
      label: it.label,
      order: it.order,
      enabled: it.enabled,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    }, { merge: true });
    append(` - packing_statuses/${it.code} OK`);
  }
  append("✔ packing_statuses 완료\n");
}

/* ---------------- items 패치 ---------------- */
async function patchItemsAddFamilyUom() {
  append("▶ items에 family/uom 기본값 추가(없는 문서만)");
  const snap = await getDocs(collection(db, "items"));
  let batch = writeBatch(db);
  let ops = 0, updated = 0;

  for (const d of snap.docs) {
    const data = d.data() as any;
    const patch: any = {};
    if (typeof data.family === "undefined") patch.family = "SEMI";
    if (typeof data.uom === "undefined")    patch.uom = "EA";

    if (Object.keys(patch).length === 0) continue;

    patch.updated_at = serverTimestamp();
    batch.update(d.ref, patch);
    ops++; updated++;

    if (ops === 450) {
      await batch.commit();
      append(` - batch commit (누적 ${updated})`);
      batch = writeBatch(db);
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
    append(` - 마지막 commit (총 ${updated})`);
  }
  append("✔ items 패치 완료\n");
}

/* ---------------- bom -> items.has_bom=true (product_level < 3) ---------------- */
/**
 * 1) bom 컬렉션 전수 스캔 → parentId 수집
 * 2) items에서 해당 parentId 문서들 중 product_level < 3만 선별
 * 3) has_bom: true 로 일괄 머지 (450건 단위 커밋)
 */
async function markItemsHasBomFromBomLT3() {
  try {
    append("▶ bom 스캔 → items.has_bom=true 시작 (product_level < 4)");

    // 1) 모든 bom 문서에서 parentId 수집
    const bomSnap = await getDocs(collection(db, "bom"));
    const parentIds = new Set<string>();
    for (const d of bomSnap.docs) {
      const data = d.data() as any;
      const pid = data?.parentId;
      if (typeof pid === "string" && pid.trim().length > 0) {
        parentIds.add(pid.trim());
      }
    }
    const allParentIds = Array.from(parentIds);
    append(` - BOM 부모 후보 수: ${allParentIds.length}`);

    if (allParentIds.length === 0) {
      append("✔ 대상 parentId가 없습니다.\n");
      return;
    }

    // 2) items에서 product_level < 3 인 parent만 선별 (documentId() in []는 10개 제한이므로 청크)
    const CHUNK = 10;
    const targets: string[] = [];
    for (let i = 0; i < allParentIds.length; i += CHUNK) {
      const chunk = allParentIds.slice(i, i + CHUNK);
      const qRef = query(
        collection(db, "items"),
        where(documentId(), "in", chunk)
      );
      const snap = await getDocs(qRef);
      snap.forEach(d => {
        const data = d.data() as any;
        const lvl = Number(data?.product_level);
        if (Number.isFinite(lvl) && lvl < 4) {
          targets.push(d.id);
        }
      });
      append(`  · 청크 ${Math.floor(i/CHUNK)+1}: 조회 ${chunk.length} → 대상 누적 ${targets.length}`);
    }
    append(` - 최종 대상 아이템 수(product_level<3): ${targets.length}`);

    if (targets.length === 0) {
      append("✔ 업데이트할 대상 없음\n");
      return;
    }

    // 3) has_bom:true로 배치 업데이트 (450건 단위 커밋)
    let batch = writeBatch(db);
    let ops = 0, updated = 0;
    const now = serverTimestamp();

    for (const pid of targets) {
      batch.set(doc(db, "items", pid), {
        has_bom: true,
        updated_at: now,
      }, { merge: true });
      ops++; updated++;

      if (ops === 450) {
        await batch.commit();
        append(` - batch commit (누적 ${updated})`);
        batch = writeBatch(db);
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
      append(` - 마지막 commit (총 ${updated})`);
    }
    append("✔ bom → items.has_bom 패치 완료\n");
  } catch (err: any) {
    append(`에러: ${err?.message || String(err)}`);
  }
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-4">
    <h1 class="text-2xl font-semibold">초기 시드 도구</h1>
    <p class="text-sm text-gray-600">필요한 버튼만 눌러 실행하세요.</p>

    <div class="grid grid-cols-1 gap-3">
      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="seedShipTos">
        1) Ship-tos 시드 (label/personInCharge/address)
      </button>
      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="seedUomRules">
        2) UoM Rules 시드 (EA→M 환산)
      </button>
      <button class="px-4 py-2 rounded bg-blue-600 text-white" @click="seedPackingStatuses">
        3) Packing Status 라벨 시드
      </button>
      <button class="px-4 py-2 rounded bg-amber-600 text-white" @click="patchItemsAddFamilyUom">
        4) items에 family/uom 기본값 추가
      </button>
      <button class="px-4 py-2 rounded bg-emerald-600 text-white" @click="markItemsHasBomFromBomLT3">
        5) bom 스캔 → items.has_bom = true (product_level 0~3)
      </button>
    </div>

    <pre class="bg-gray-100 p-3 rounded text-xs whitespace-pre-wrap">{{ log }}</pre>
  </div>
</template>
