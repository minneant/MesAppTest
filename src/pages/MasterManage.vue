<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import draggable from "vuedraggable"; // ✅ Vue3용 v4 (default export)
import { db } from "@/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

/* ---------------- Types ---------------- */
type UomType = "" | "EA" | "M" | "ST";
type ProductLevel = 0 | 1 | 2 | 3 | 4;

type BaseEntry = { code: string; label?: string; enabled?: boolean; order?: number | null };
type TypeEntry = BaseEntry & { uom?: UomType };
type LineEntry = BaseEntry;
type ProcessEntry = BaseEntry & { tag?: string; product_level?: ProductLevel | null };
type Kind = "types" | "lines" | "processes";

/* ---------------- State ---------------- */
const types = ref<TypeEntry[]>([]);
const lines = ref<LineEntry[]>([]);
const processes = ref<ProcessEntry[]>([]);

const chosenFileName = ref<{ types: string; lines: string; processes: string }>({
  types: "선택된 파일 없음",
  lines: "선택된 파일 없음",
  processes: "선택된 파일 없음",
});

let unsubs: Array<() => void> = [];

/* ---------------- Helpers ---------------- */
const UOM_OPTIONS: UomType[] = ["", "EA", "M", "ST"]; // ""=미지정
const LEVEL_OPTIONS: Array<{ value: ProductLevel; label: string }> = [
  { value: 0, label: "0 출하" },
  { value: 1, label: "1 포장된제품" },
  { value: 2, label: "2 공정끝난제품" },
  { value: 3, label: "3 반제품" },
  { value: 4, label: "4 원재료" },
];

function normalizeBaseList<T extends BaseEntry>(list: T[]) {
  return [...list]
    .map((v) => ({
      code: v.code ?? "",
      label: v.label ?? v.code ?? "",
      enabled: v.enabled !== false,
      order: v.order ?? null,
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}
function coerceUom(raw: any): UomType {
  const up = String(raw ?? "").toUpperCase();
  return up === "EA" || up === "M" || up === "ST" ? (up as UomType) : "";
}
function coerceLevel(raw: any): ProductLevel | null {
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 4) return n as ProductLevel;
  return null;
}
function normalizeTypeList(list: TypeEntry[]) {
  return [...list]
    .map((v) => ({
      code: v.code ?? "",
      label: v.label ?? v.code ?? "",
      enabled: v.enabled !== false,
      order: v.order ?? null,
      uom: coerceUom(v.uom),
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}
function normalizeProcList(list: ProcessEntry[]) {
  return [...list]
    .map((v) => ({
      code: v.code ?? "",
      label: v.label ?? v.code ?? "",
      tag: v.tag ?? "",
      enabled: v.enabled !== false,
      order: v.order ?? null,
      product_level: coerceLevel(v.product_level) ?? 3,
    }))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

function nextOrder(arr: BaseEntry[]) {
  const nums = arr.map((v) => v.order ?? 0);
  return (nums.length ? Math.max(...nums) : 0) + 10;
}

/** 초기 로딩 시 order가 null인 항목에 순번 채워 넣기 (드래그 안정화) */
function ensureOrders<T extends BaseEntry>(arr: T[]) {
  let changed = false;
  let base = Math.max(0, ...arr.map((v) => Number(v.order ?? 0)));
  for (const r of arr) {
    if (!(typeof r.order === "number" && Number.isFinite(r.order))) {
      base += 10;
      r.order = base;
      changed = true;
    }
  }
  return changed;
}

/** 드래그 종료 후 10단위로 재매김 */
function recalculateOrder(kind: Kind) {
  const arr = kind === "types" ? types.value : kind === "lines" ? lines.value : processes.value;
  arr.forEach((item, index) => (item.order = (index + 1) * 10));
}

/* ---------------- Load (live) ---------------- */
onMounted(() => {
  const u1 = onSnapshot(doc(db, "masters", "types"), (snap) => {
    const list = normalizeTypeList((snap.data()?.list ?? []) as TypeEntry[]);
    if (ensureOrders(list)) {
      // 초기 order 채워졌어도, 자동 저장은 안 함 (의도적으로 수동 저장)
    }
    types.value = list;
  });
  const u2 = onSnapshot(doc(db, "masters", "lines"), (snap) => {
    const list = normalizeBaseList((snap.data()?.list ?? []) as LineEntry[]);
    if (ensureOrders(list)) {}
    lines.value = list;
  });
  const u3 = onSnapshot(doc(db, "masters", "processes"), (snap) => {
    const list = normalizeProcList((snap.data()?.list ?? []) as ProcessEntry[]);
    if (ensureOrders(list)) {}
    processes.value = list;
  });
  unsubs = [u1, u2, u3];
});
onUnmounted(() => unsubs.forEach((u) => u()));

/* ---------------- Mutations ---------------- */
async function saveOne(kind: Kind) {
  if (kind === "types") {
    await setDoc(doc(db, "masters", "types"), { list: types.value }, { merge: true });
    alert("types 저장 완료");
  } else if (kind === "lines") {
    await setDoc(doc(db, "masters", "lines"), { list: lines.value }, { merge: true });
    alert("lines 저장 완료");
  } else {
    await setDoc(doc(db, "masters", "processes"), { list: processes.value }, { merge: true });
    alert("processes 저장 완료");
  }
}
async function saveAll() {
  await Promise.all([
    setDoc(doc(db, "masters", "types"), { list: types.value }, { merge: true }),
    setDoc(doc(db, "masters", "lines"), { list: lines.value }, { merge: true }),
    setDoc(doc(db, "masters", "processes"), { list: processes.value }, { merge: true }),
  ]);
  alert("모두 저장 완료");
}

/* Add / Remove rows */
function addRow(kind: Kind) {
  if (kind === "types") {
    types.value.push({ code: "", label: "", uom: "", enabled: true, order: nextOrder(types.value) });
  } else if (kind === "lines") {
    lines.value.push({ code: "", label: "", enabled: true, order: nextOrder(lines.value) });
  } else {
    processes.value.push({
      code: "",
      label: "",
      tag: "",
      enabled: true,
      product_level: 3,
      order: nextOrder(processes.value),
    });
  }
}
function removeRow(kind: Kind, idx: number) {
  if (!confirm("삭제할까요?")) return;
  if (kind === "types") types.value.splice(idx, 1);
  else if (kind === "lines") lines.value.splice(idx, 1);
  else processes.value.splice(idx, 1);
}

/* ---------------- CSV Export/Import ---------------- */
function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function esc(v: any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(kind: Kind): string {
  if (kind === "types") {
    const header = ["code", "label", "uom", "enabled", "order"];
    const arr = types.value;
    const rows = arr.map((v) =>
      [v.code, v.label ?? v.code, v.uom ?? "", v.enabled !== false, v.order ?? ""]
        .map(esc)
        .join(",")
    );
    return [header.join(","), ...rows].join("\n");
  } else if (kind === "lines") {
    const header = ["code", "label", "enabled", "order"];
    const arr = lines.value;
    const rows = arr.map((v) =>
      [v.code, v.label ?? v.code, v.enabled !== false, v.order ?? ""].map(esc).join(",")
    );
    return [header.join(","), ...rows].join("\n");
  } else {
    const header = ["code", "label", "tag", "product_level", "enabled", "order"];
    const arr = processes.value;
    const rows = arr.map((v) =>
      [v.code, v.label ?? v.code, v.tag ?? "", v.product_level ?? "", v.enabled !== false, v.order ?? ""]
        .map(esc)
        .join(",")
    );
    return [header.join(","), ...rows].join("\n");
  }
}
function exportCSV(kind: Kind) {
  const now = new Date().toISOString().slice(0, 19).replace(/:/g, "");
  download(`masters_${kind}_${now}.csv`, toCSV(kind));
}

/* Simple CSV parser */
function parseCSV(text: string): string[][] {
  const out: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch == '"') {
        if (text[i + 1] == '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else {
      if (ch == '"') q = true;
      else if (ch == ",") {
        row.push(cell);
        cell = "";
      } else if (ch == "\n" || ch == "\r") {
        if (ch == "\r" && text[i + 1] == "\n") i++;
        row.push(cell);
        out.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    out.push(row);
  }
  return out;
}

async function onFileChoose(kind: Kind, e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  chosenFileName.value[kind] = file.name;
  const txt = await file.text();
  const arr = parseCSV(txt).filter((r) => r.length && r.some((c) => c !== ""));
  const header = arr.shift()!.map((h) => (h || "").trim());

  if (kind === "types") {
    const needNew = ["code", "label", "uom", "enabled", "order"];
    const needOld = ["code", "label", "enabled", "order"];
    let mode: "new" | "old";
    if (header.join(",") === needNew.join(",")) mode = "new";
    else if (header.join(",") === needOld.join(",")) mode = "old";
    else {
      alert(`CSV 헤더가 올바르지 않습니다.\n허용 헤더:\n- ${needNew.join(",")}\n- ${needOld.join(",")}`);
      input.value = "";
      return;
    }

    const next: TypeEntry[] = arr.map((c) => ({
      code: c[0] ?? "",
      label: c[1] ?? c[0] ?? "",
      uom: coerceUom(mode === "new" ? c[2] : ""),
      enabled: String(c[mode === "new" ? 3 : 2] ?? "true").toLowerCase() !== "false",
      order: (mode === "new" ? c[4] : c[3]) ? Number(mode === "new" ? c[4] : c[3]) : null,
    }));
    const norm = normalizeTypeList(next);
    ensureOrders(norm);
    types.value = norm;
  } else if (kind === "lines") {
    const need = ["code", "label", "enabled", "order"];
    if (header.join(",") !== need.join(",")) {
      alert(`CSV 헤더가 올바르지 않습니다.\n필요 헤더: ${need.join(",")}`);
      input.value = "";
      return;
    }
    const next: LineEntry[] = arr.map((c) => ({
      code: c[0] ?? "",
      label: c[1] ?? c[0] ?? "",
      enabled: String(c[2] ?? "true").toLowerCase() !== "false",
      order: c[3] ? Number(c[3]) : null,
    }));
    const norm = normalizeBaseList(next);
    ensureOrders(norm);
    lines.value = norm;
  } else {
    const needNew = ["code", "label", "tag", "product_level", "enabled", "order"];
    const needOld = ["code", "label", "tag", "uom", "enabled", "order"]; // 과거 포맷
    let mode: "new" | "old";
    if (header.join(",") === needNew.join(",")) mode = "new";
    else if (header.join(",") === needOld.join(",")) mode = "old";
    else {
      alert(`CSV 헤더가 올바르지 않습니다.\n허용 헤더: \n- ${needNew.join(",")}\n- ${needOld.join(",")}`);
      input.value = "";
      return;
    }

    const next: ProcessEntry[] = arr.map((c) => {
      const enabledIdx = 4;
      const orderIdx = 5;
      const levelIdx = mode === "new" ? 3 : null;
      return {
        code: c[0] ?? "",
        label: c[1] ?? c[0] ?? "",
        tag: c[2] ?? "",
        product_level: levelIdx !== null ? (coerceLevel(c[levelIdx]) ?? 3) : 3,
        enabled: String(c[enabledIdx] ?? "true").toLowerCase() !== "false",
        order: c[orderIdx] ? Number(c[orderIdx]) : null,
      };
    });
    const norm = normalizeProcList(next);
    ensureOrders(norm);
    processes.value = norm;
  }
}

/* Triggers (파일 입력) */
const fileInputTypes = ref<HTMLInputElement | null>(null);
const fileInputLines = ref<HTMLInputElement | null>(null);
const fileInputProcesses = ref<HTMLInputElement | null>(null);
function triggerFile(kind: Kind) {
  (kind === "types" ? fileInputTypes : kind === "lines" ? fileInputLines : fileInputProcesses).value?.click();
}

/* ---------------- Seed (기본값) ---------------- */
const DEFAULT_TYPES: TypeEntry[] = [
  { code: "ST1", label: "ST1", uom: "M", enabled: true, order: 10 },
  { code: "ST2", label: "ST2", uom: "M", enabled: true, order: 20 },
  { code: "HD1", label: "HD1", uom: "M", enabled: true, order: 30 },
  { code: "HD2", label: "HD2", uom: "M", enabled: true, order: 40 },
  { code: "EL1", label: "EL1", uom: "EA", enabled: true, order: 50 },
  { code: "EL2", label: "EL2", uom: "EA", enabled: true, order: 60 },
  { code: "END", label: "END", uom: "EA", enabled: true, order: 70 },
  { code: "CON", label: "CON", uom: "EA", enabled: true, order: 80 },
  { code: "PCO", label: "PCO", uom: "EA", enabled: true, order: 90 },
];

const DEFAULT_LINES: LineEntry[] = [
  { code: "LIQ", label: "LIQUID", enabled: true, order: 10 },
  { code: "VAP", label: "VAPOUR", enabled: true, order: 20 },
  { code: "BOG", label: "BOG", enabled: true, order: 30 },
  { code: "30T", label: "30T", enabled: true, order: 40 },
  { code: "40T", label: "40T", enabled: true, order: 50 },
  { code: "50T", label: "50T", enabled: true, order: 60 },
  { code: "60T", label: "60T", enabled: true, order: 70 },
  { code: "80T", label: "80T", enabled: true, order: 80 },
];

const DEFAULT_PROCESSES: ProcessEntry[] = [
  { code: "Cutting_Wire", label: "Cutting_Wire", tag: "cw", enabled: true, order: 10, product_level: 3 },
  { code: "Foaming", label: "Foaming", tag: "fo", enabled: true, order: 20, product_level: 3 },
  { code: "Planing", label: "Planing", tag: "pl", enabled: true, order: 30, product_level: 3 },
  { code: "Cutting_length", label: "Cutting_length", tag: "cl", enabled: true, order: 40, product_level: 2 },
  { code: "FRP_Coating", label: "FRP_Coating", tag: "fc", enabled: true, order: 50, product_level: 2 },
  { code: "Al_Coating", label: "Al_Coating", tag: "ac", enabled: true, order: 60, product_level: 2 },
  { code: "Cutting_Elbow", label: "Cutting_Elbow", tag: "ce", enabled: true, order: 70, product_level: 3 },
  { code: "Glue", label: "Glue", tag: "gl", enabled: true, order: 80, product_level: 3 },
  { code: "Sanding", label: "Sanding", tag: "sa", enabled: true, order: 90, product_level: 3 },
  { code: "Packaging", label: "Packaging", tag: "pa", enabled: true, order: 100, product_level: 1 },
  { code: "Shipping", label: "Shipping", tag: "sh", enabled: true, order: 110, product_level: 0 },
];

async function seedDefaults() {
  if (!confirm("masters 컬렉션에 기본값을 저장할까요? (기존 값을 덮어쓸 수 있습니다)")) return;
  await Promise.all([
    setDoc(doc(db, "masters", "types"), { list: DEFAULT_TYPES }, { merge: true }),
    setDoc(doc(db, "masters", "lines"), { list: DEFAULT_LINES }, { merge: true }),
    setDoc(doc(db, "masters", "processes"), { list: DEFAULT_PROCESSES }, { merge: true }),
  ]);
  alert("기본값 저장 완료");
}
</script>

<template>
  <section class="p-4 grid gap-4">
    <!-- Top bar -->
    <header class="sticky top-0 z-30 bg-white/90 backdrop-blur pb-2 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Masters Admin</h2>
      <div class="flex items-center gap-2">
        <button type="button" class="btn" @click="saveAll">모두 저장</button>
        <button type="button" class="btn-outline blue" @click="seedDefaults">기본값 생성</button>
      </div>
    </header>

    <!-- Types -->
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Types</h3>
        <div class="actions">
          <button type="button" class="btn" @click="addRow('types')">+ 행 추가</button>
          <button type="button" class="btn" @click="saveOne('types')">저장</button>
          <button type="button" class="btn-outline blue" @click="exportCSV('types')">CSV 내보내기</button>
          <button type="button" class="btn-outline blue" @click="triggerFile('types')">CSV 올리기</button>
          <input ref="fileInputTypes" type="file" accept=".csv,text/csv" class="file-hidden" @change="(e)=>onFileChoose('types',e)" />
          <span class="badge" :title="chosenFileName.types">{{ chosenFileName.types }}</span>
        </div>
      </div>

      <div class="grid-style-wrap">
        <!-- Header -->
        <div class="grid-style-header-types">
          <div class="th"><!-- drag handle --></div>
          <div class="th">code</div>
          <div class="th">label</div>
          <div class="th">uom</div>
          <div class="th text-center">enabled</div>
          <div class="th text-center">액션</div>
        </div>

        <!-- Body (slot API) -->
        <draggable
          v-model="types"
          item-key="order"
          handle=".drag-handle"
          tag="div"
          :animation="150"
          @end="recalculateOrder('types')"
        >
          <template #item="{ element: r, index: i }">
            <div class="grid-style-row-types">
              <div class="drag-handle"></div>
              <input v-model="r.code" class="input" />
              <input v-model="r.label" class="input" />
              <select v-model="r.uom" class="input">
                <option v-for="opt in UOM_OPTIONS" :key="opt" :value="opt">{{ opt || "(미지정)" }}</option>
              </select>
              <input type="checkbox" v-model="r.enabled" class="justify-self-center" />
              <div class="text-center">
                <button type="button" class="btn" @click="removeRow('types', i)">삭제</button>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <!-- Lines -->
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Lines</h3>
        <div class="actions">
          <button type="button" class="btn" @click="addRow('lines')">+ 행 추가</button>
          <button type="button" class="btn" @click="saveOne('lines')">저장</button>
          <button type="button" class="btn-outline blue" @click="exportCSV('lines')">CSV 내보내기</button>
          <button type="button" class="btn-outline blue" @click="triggerFile('lines')">CSV 올리기</button>
          <input ref="fileInputLines" type="file" accept=".csv,text/csv" class="file-hidden" @change="(e)=>onFileChoose('lines',e)" />
          <span class="badge" :title="chosenFileName.lines">{{ chosenFileName.lines }}</span>
        </div>
      </div>

      <div class="grid-style-wrap">
        <!-- Header -->
        <div class="grid-style-header-lines">
          <div class="th"><!-- drag handle --></div>
          <div class="th">code</div>
          <div class="th">label</div>
          <div class="th text-center">enabled</div>
          <div class="th text-center">액션</div>
        </div>

        <!-- Body (slot API) -->
        <draggable
          v-model="lines"
          item-key="order"
          handle=".drag-handle"
          tag="div"
          :animation="150"
          @end="recalculateOrder('lines')"
        >
          <template #item="{ element: r, index: i }">
            <div class="grid-style-row-lines">
              <div class="drag-handle"></div>
              <input v-model="r.code" class="input" />
              <input v-model="r.label" class="input" />
              <input type="checkbox" v-model="r.enabled" class="justify-self-center" />
              <div class="text-center">
                <button type="button" class="btn" @click="removeRow('lines', i)">삭제</button>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </div>

    <!-- Processes -->
    <div class="card">
      <div class="card-head">
        <h3 class="card-title">Processes</h3>
        <div class="actions">
          <button type="button" class="btn" @click="addRow('processes')">+ 행 추가</button>
          <button type="button" class="btn" @click="saveOne('processes')">저장</button>
          <button type="button" class="btn-outline blue" @click="exportCSV('processes')">CSV 내보내기</button>
          <button type="button" class="btn-outline blue" @click="triggerFile('processes')">CSV 올리기</button>
          <input ref="fileInputProcesses" type="file" accept=".csv,text/csv" class="file-hidden" @change="(e)=>onFileChoose('processes',e)" />
          <span class="badge" :title="chosenFileName.processes">{{ chosenFileName.processes }}</span>
        </div>
      </div>

      <div class="grid-style-wrap">
        <!-- Header -->
        <div class="grid-style-header-proc">
          <div class="th"><!-- drag handle --></div>
          <div class="th">code</div>
          <div class="th">label</div>
          <div class="th">tag</div>
          <div class="th">product_level</div>
          <div class="th text-center">enabled</div>
          <div class="th text-center">액션</div>
        </div>

        <!-- Body (slot API) -->
        <draggable
          v-model="processes"
          item-key="order"
          handle=".drag-handle"
          tag="div"
          :animation="150"
          @end="recalculateOrder('processes')"
        >
          <template #item="{ element: r, index: i }">
            <div class="grid-style-row-proc">
              <div class="drag-handle"></div>
              <input v-model="r.code" class="input" />
              <input v-model="r.label" class="input" />
              <input v-model="r.tag" class="input" />
              <select v-model.number="r.product_level" class="input">
                <option v-for="lv in LEVEL_OPTIONS" :key="lv.value" :value="lv.value">{{ lv.label }}</option>
              </select>
              <div class="cell-center">
                <input type="checkbox" v-model="r.enabled" />
              </div>
              <div class="cell-center">
                <button type="button" class="btn" @click="removeRow('processes', i)">삭제</button>
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* === Reset === */
:where(button, input, select) { all: revert; font: inherit; }

/* === Drag handle === */
.drag-handle { cursor: grab; padding:.5rem; display:flex; align-items:center; justify-content:center; }
.drag-handle::before { content:"\2261"; font-size:1.5rem; color:#ccc; }
.drag-handle:active { cursor:grabbing; }

/* === Card / header === */
.card { border:1px solid #e5e7eb; border-radius:.75rem; background:#fff; }
.card-head { display:flex; align-items:center; justify-content:space-between; padding:.75rem 1rem; border-bottom:1px solid #e5e7eb; }
.card-title { font-weight:600; font-size:1rem; }
.actions { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; }

/* === CSV badge & hidden input === */
.badge { display:inline-flex; align-items:center; border:1px solid #e5e7eb; padding:.375rem .5rem; border-radius:.5rem; font-size:.75rem; color:#374151; background:#fff; max-width:16rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.file-hidden{ position:absolute !important; left:-9999px !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0) !important; white-space:nowrap !important; opacity:0 !important; }

/* === Buttons === */
.btn { display:inline-flex; align-items:center; border:1px solid #d1d5db; background:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn:hover { background:#f9fafb; }
.btn:active { transform:scale(.98); }
.btn-outline.blue { display:inline-flex; align-items:center; border:1px solid #93c5fd; background:#fff; color:#1d4ed8; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn-outline.blue:hover { background:#eff6ff; }

/* === Table wrappers === */
.grid-style-wrap { border:1px solid #e5e7eb; border-radius:.75rem; overflow:hidden; }

/* 공통 레이아웃(헤더/로우) + 여백 */
.grid-style-header-types, .grid-style-row-types,
.grid-style-header-lines, .grid-style-row-lines,
.grid-style-header-proc,  .grid-style-row-proc {
  display:grid;
  align-items:center;
  gap:1rem;            /* 칸 사이 여백 */
  padding:.7rem 1rem;  /* 행 안쪽 여백 */
}

/* 헤더 공통 스타일 */
.grid-style-header-types, .grid-style-header-lines, .grid-style-header-proc {
  background:#f9fafb; font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb;
}

/* 바디 로우 구분선 */
.grid-style-row-types, .grid-style-row-lines, .grid-style-row-proc { border-bottom:1px solid #f3f4f6; }
.grid-style-row-types:last-child, .grid-style-row-lines:last-child, .grid-style-row-proc:last-child { border-bottom:none; }

/* 헤더 셀: 중앙 정렬(통일) */
.th { padding:0; color:#374151; font-weight:600; background:transparent; text-align:center; border-bottom:none; }

/* === Columns 정의 === */
/* Types: handle | code | label | uom | enabled | action */
.grid-style-header-types, .grid-style-row-types {
  grid-template-columns:
    3rem
    minmax(120px, 1fr)
    minmax(160px, 1.3fr)
    minmax(100px, .9fr)
    5.5rem
    6.5rem;
}
/* Lines: handle | code | label | enabled | action */
.grid-style-header-lines, .grid-style-row-lines {
  grid-template-columns:
    3rem
    minmax(120px, 1fr)
    minmax(160px, 1.3fr)
    5.5rem
    6.5rem;
}
/* Processes: handle | code | label | tag | product_level | enabled | action */
.grid-style-header-proc, .grid-style-row-proc {
  grid-template-columns:
    3rem
    minmax(120px, 1fr)
    minmax(160px, 1.3fr)
    minmax(120px, 1fr)
    minmax(160px, 1.1fr)
    5.5rem
    6.5rem;
}

/* === Inputs: 중앙정렬 + 여백 === */
.input{
  box-sizing:border-box;
  border:1px solid #d1d5db; border-radius:.5rem;
  padding:.45rem .7rem;
  width:100%; min-width:0;         /* grid/flex 수축 허용 */
  margin-inline:.25rem;             /* 좌우 살짝 공백 */
  margin-block:.25rem;              /* 위아래 살짝 공백 */
  text-align:center;                /* 텍스트 중앙 */
}
.input:focus { box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }
/* select 중앙정렬 보정 */
select.input { text-align-last:center; }
select.input option { text-align:center; }

/* 체크박스/버튼용 중앙 정렬 유틸 */
.cell-center { display:flex; align-items:center; justify-content:center; }
/* 체크박스는 여백 규칙 제외 */
input[type="checkbox"].input, input[type="checkbox"]{ margin:0; width:auto; min-width:auto; padding:0; }

/* === Responsive === */
@media (max-width:1024px){
  .grid-style-header-types, .grid-style-row-types {
    grid-template-columns:
      2.75rem
      minmax(100px, 1fr)
      minmax(140px, 1.2fr)
      minmax(90px, .9fr)
      5rem
      6rem;
  }
  .grid-style-header-lines, .grid-style-row-lines {
    grid-template-columns:
      2.75rem
      minmax(100px, 1fr)
      minmax(140px, 1.2fr)
      5rem
      6rem;
  }
  .grid-style-header-proc, .grid-style-row-proc {
    grid-template-columns:
      2.75rem
      minmax(100px, 1fr)
      minmax(140px, 1.2fr)
      minmax(100px, .9fr)
      minmax(120px, 1fr)
      5rem
      6rem;
  }
}
@media (max-width:640px){
  .grid-style-header-types, .grid-style-row-types {
    grid-template-columns:
      2.5rem
      minmax(84px, 1fr)
      minmax(100px, 1fr)
      minmax(84px, .9fr)
      4.5rem
      5.5rem;
  }
  .grid-style-header-lines, .grid-style-row-lines {
    grid-template-columns:
      2.5rem
      minmax(84px, 1fr)
      minmax(100px, 1fr)
      4.5rem
      5.5rem;
  }
  .grid-style-header-proc, .grid-style-row-proc {
    grid-template-columns:
      2.5rem
      minmax(84px, 1fr)
      minmax(100px, 1fr)
      minmax(84px, .9fr)
      minmax(100px, 1fr)
      4.5rem
      5.5rem;
  }
}
</style>
