<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { db } from "@/firebase";
import {
  collection, getDocs, orderBy, query, limit,
  doc, setDoc, deleteDoc, serverTimestamp, writeBatch
} from "firebase/firestore";

/* ---------------- Types ---------------- */
type ProdRow = {
  _id?: string;
  ts: any;
  lotId: string;      // 화면엔 숨김(검색/CSV/DB용)
  itemId: string;
  type: string;
  line: string;
  inch: number;
  process: string;
  process_tag?: string; // CSV/DB만
  length_mm: number;
  qty: number;
};

/* ---------------- Masters ---------------- */
const TYPE_MASTER = ["ST1","ST2","HD1","HD2","EL1","EL2","END","CON","PCO"];
const LINE_MASTER = ["LIQ","VAP","BOG","30T","40T","50T","60T","80T"];
const PROCESS_MASTER = [
  "Cutting_Wire","Foaming","Planing","Cutting_length","FRP_Coating",
  "Al_Coating","Cutting_Elbow","Glue","Sanding","Packaging","Shipping"
];
const PROCESS_TAGS: Record<string,string> = {
  Cutting_Wire:"cw", Foaming:"fo", Planing:"pl", Cutting_length:"cl",
  FRP_Coating:"fc", Al_Coating:"ac", Cutting_Elbow:"ce", Glue:"gl",
  Sanding:"sa", Packaging:"pa", Shipping:"sh",
};

/* ---------------- State ---------------- */
const rows = ref<ProdRow[]>([]);
const loading = ref(false);
const errorMsg = ref("");

/* Filters */
const fTypes = ref<string[]>([]);
const fLines = ref<string[]>([]);
const fProcesses = ref<string[]>([]);
const fInches = ref<number[]>([]);
const fLens = ref<number[]>([]);
const fQtys = ref<number[]>([]);
const fSearch = ref<string>("");    // itemId / lotId 부분검색
const fFromDate = ref<string>("");  // YYYY-MM-DD
const fToDate   = ref<string>("");  // YYYY-MM-DD

/* Multi-select */
const selectedIds = ref<Set<string>>(new Set());
const selKeyOf = (r: ProdRow) => r._id || `${r.lotId}__${r.itemId}__${tsMs(r.ts)}`;
const selectedRows = computed(() => filtered.value.filter(r => selectedIds.value.has(selKeyOf(r))));
const allChecked = computed({
  get() {
    const ids = filtered.value.map(selKeyOf);
    return ids.length > 0 && ids.every(id => selectedIds.value.has(id));
  },
  set(v: boolean) {
    const ids = filtered.value.map(selKeyOf);
    if (v) ids.forEach(id => selectedIds.value.add(id));
    else ids.forEach(id => selectedIds.value.delete(id));
  }
});

/* CSV input (styled) */
const fileInput = ref<HTMLInputElement | null>(null);
const chosenFileName = ref<string>("선택된 파일 없음");

/* ---------------- Init ---------------- */
onMounted(load);
async function load() {
  loading.value = true; errorMsg.value = "";
  try {
    const q = query(collection(db, "productions"), orderBy("ts", "desc"), limit(8000));
    const snap = await getDocs(q);
    rows.value = snap.docs.map(d => ({ _id: d.id, ...(d.data() as ProdRow) }));
  } catch (e: any) {
    errorMsg.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

/* ---------------- Helpers ---------------- */
const lc = (s?: string) => (s ?? "").toLowerCase();
function tsMs(v:any): number {
  if (!v) return 0;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  return 0;
}
function fmtTsShort(v:any) {
  const ms = tsMs(v); if (!ms) return "";
  const d = new Date(ms); const p=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function formatIso(v:any) {
  const ms = tsMs(v); return ms ? new Date(ms).toISOString() : "";
}

/* ---------- 동적 옵션 생성을 위한 필터 ---------- */
type FilterField = "type"|"line"|"process"|"inch"|"length_mm"|"qty";
function passesExcept(r: ProdRow, exclude: FilterField | null): boolean {
  const sTxt = lc(fSearch.value);

  // 날짜 범위(일 단위, inclusive)
  const ts = tsMs(r.ts);
  if (fFromDate.value) {
    const from = new Date(`${fFromDate.value}T00:00:00`).getTime();
    if (!ts || ts < from) return false;
  }
  if (fToDate.value) {
    const to = new Date(`${fToDate.value}T23:59:59.999`).getTime();
    if (!ts || ts > to) return false;
  }

  if (exclude !== "type"      && fTypes.value.length     && !fTypes.value.includes(r.type)) return false;
  if (exclude !== "line"      && fLines.value.length     && !fLines.value.includes(r.line)) return false;
  if (exclude !== "process"   && fProcesses.value.length && !fProcesses.value.includes(r.process ?? "")) return false;
  if (exclude !== "inch"      && fInches.value.length    && !fInches.value.includes(r.inch)) return false;
  if (exclude !== "length_mm" && fLens.value.length      && !fLens.value.includes(r.length_mm)) return false;
  if (exclude !== "qty"       && fQtys.value.length      && !fQtys.value.includes(r.qty)) return false;

  if (sTxt && !(lc(r.itemId).includes(sTxt) || lc(r.lotId).includes(sTxt))) return false;
  return true;
}

/* 동적 옵션 */
const fTypeOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"type")).map(r => r.type))).sort()
);
const fLineOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"line")).map(r => r.line))).sort()
);
const fProcessOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"process")).map(r => r.process).filter(Boolean) as string[])).sort()
);
const fInchOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"inch")).map(r => r.inch))).sort((a,b)=>a-b)
);
const fLengthOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"length_mm")).map(r => r.length_mm))).sort((a,b)=>a-b)
);
const fQtyOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"qty")).map(r => r.qty))).sort((a,b)=>a-b)
);

/* 최종 목록 & 총합 */
const filtered = computed(() => rows.value.filter(r => passesExcept(r, null)));
const totalQty = computed(() => filtered.value.reduce((s,r)=> s + (Number(r.qty)||0), 0));

/* Reset */
function resetAll() {
  fTypes.value = []; fLines.value = []; fProcesses.value = [];
  fInches.value = []; fLens.value = []; fQtys.value = [];
  fSearch.value = ""; fFromDate.value = ""; fToDate.value = "";
}

/* 사용 불가해진 선택값 자동 정리 */
function pruneMulti<T>(model: T[], valid: Set<T>) {
  const next = model.filter(v => valid.has(v));
  if (next.length !== model.length) return next;
  return model;
}
watch([fTypeOpts],     () => { fTypes.value     = pruneMulti(fTypes.value,     new Set(fTypeOpts.value)) as string[]; });
watch([fLineOpts],     () => { fLines.value     = pruneMulti(fLines.value,     new Set(fLineOpts.value)) as string[]; });
watch([fProcessOpts],  () => { fProcesses.value = pruneMulti(fProcesses.value, new Set(fProcessOpts.value)) as string[]; });
watch([fInchOpts],     () => { fInches.value    = pruneMulti(fInches.value,    new Set(fInchOpts.value)) as number[]; });
watch([fLengthOpts],   () => { fLens.value      = pruneMulti(fLens.value,      new Set(fLengthOpts.value)) as number[]; });
watch([fQtyOpts],      () => { fQtys.value      = pruneMulti(fQtys.value,      new Set(fQtyOpts.value)) as number[]; });

/* ---------------- Edit ---------------- */
const editingKey = ref<string | null>(null);
const editCache = ref<ProdRow | null>(null);
function startEdit(r: ProdRow) { editingKey.value = selKeyOf(r); editCache.value = { ...r }; }
function cancelEdit() { editingKey.value = null; editCache.value = null; }

async function saveEdit(orig: ProdRow) {
  if (!editCache.value) return;
  const e = editCache.value;

  if (!e.itemId || !e.type || !e.line || e.inch == null || !e.process || e.length_mm == null || e.qty == null) {
    alert("필수값을 확인하세요."); return;
  }

  // ts 변환
  let tsVal: any = e.ts;
  if (typeof e.ts === "string" && e.ts) {
    const num = Number(e.ts);
    tsVal = isNaN(num) ? new Date(e.ts) : new Date(num);
    if (isNaN(tsVal.getTime())) tsVal = serverTimestamp();
  }

  const payload: ProdRow = {
    ts: tsVal,
    lotId: e.lotId,
    itemId: e.itemId,
    type: e.type,
    line: e.line,
    inch: Number(e.inch),
    process: e.process,
    process_tag: PROCESS_TAGS[e.process] ?? e.process_tag ?? "",
    length_mm: Number(e.length_mm),
    qty: Number(e.qty),
  };

  if (orig._id) {
    await setDoc(doc(db, "productions", orig._id), payload, { merge: true });
    const idx = rows.value.findIndex(x => x._id === orig._id);
    if (idx >= 0) rows.value[idx] = { ...payload, _id: orig._id };
  } else {
    const refNew = doc(collection(db, "productions"));
    await setDoc(refNew, payload);
    const idx = rows.value.findIndex(x => selKeyOf(x) === selKeyOf(orig));
    if (idx >= 0) rows.value.splice(idx, 1, { ...payload, _id: refNew.id });
  }

  editingKey.value = null; editCache.value = null;
}

/* ---------------- Delete ---------------- */
async function removeRow(r: ProdRow) {
  if (!confirm(`삭제할까요?\n${r.itemId}`)) return;
  if (r._id) {
    await deleteDoc(doc(db, "productions", r._id));
    const idx = rows.value.findIndex(x => x._id === r._id);
    if (idx >= 0) rows.value.splice(idx, 1);
  }
  selectedIds.value.delete(selKeyOf(r));
}
async function deleteSelected() {
  const keys = Array.from(selectedIds.value);
  if (!keys.length) { alert("선택된 항목이 없습니다."); return; }
  if (!confirm(`선택 ${keys.length}건을 삭제할까요?`)) return;

  const ids = filtered.value
    .filter(r => keys.includes(selKeyOf(r)))
    .map(r => r._id)
    .filter(Boolean) as string[];

  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    ids.slice(i, i+450).forEach(id => batch.delete(doc(db, "productions", id)));
    await batch.commit();
  }
  await load();
  selectedIds.value.clear();
}

/* ---------------- CSV export/import ---------------- */
function toCSV(records: ProdRow[]) {
  const headers = ["ts","lotId","itemId","type","line","inch","process","process_tag","length_mm","qty"];
  const esc = (v:any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = records.map(r => [
    formatIso(r.ts), r.lotId, r.itemId, r.type, r.line, r.inch,
    r.process, (PROCESS_TAGS[r.process] ?? r.process_tag ?? ""),
    r.length_mm, r.qty
  ].map(esc).join(","));
  return [headers.join(","), ...lines].join("\n");
}
function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function exportSelectedCSV() {
  if (!selectedRows.value.length) { alert("선택된 항목이 없습니다."); return; }
  download(`productions_selected_${new Date().toISOString().slice(0,19)}.csv`, toCSV(selectedRows.value));
}

/* 간단 CSV 파서 */
function parseCSV(text: string): string[][] {
  const out:string[][]=[]; let cell=""; let row:string[]=[]; let q=false;
  for (let i=0;i<text.length;i++){
    const ch=text[i];
    if (q){ if (ch=='"'){ if (text[i+1]=='"'){ cell+='"'; i++; } else q=false; } else cell+=ch; }
    else { if (ch=='"') q=true;
      else if (ch==','){ row.push(cell); cell=""; }
      else if (ch=='\n'||ch=='\r'){ if (ch=='\r' && text[i+1]=='\n') i++; row.push(cell); out.push(row); row=[]; cell=""; }
      else cell+=ch;
    }
  }
  if (cell.length || row.length){ row.push(cell); out.push(row); }
  return out;
}

async function onCSVChoose(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  chosenFileName.value = file.name;

  const txt = await file.text();
  const arr = parseCSV(txt).filter(r => r.length && r.some(c=>c!==""));
  const header = arr.shift()!.map(h => (h || "").trim());

  const needFull = ["ts","lotId","itemId","type","line","inch","process","process_tag","length_mm","qty"];
  const needLite = ["ts","lotId","itemId","type","line","inch","process","length_mm","qty"];
  const mode = header.join(",") === needFull.join(",") ? "full"
            : header.join(",") === needLite.join(",") ? "lite" : "";

  if (!mode) {
    alert("CSV 헤더가 올바르지 않습니다.\n허용 헤더:\n" + needFull.join(",") + "\n또는\n" + needLite.join(","));
    input.value=""; chosenFileName.value="선택된 파일 없음"; return;
  }

  const batchSize = 400;
  let buf: ProdRow[] = [];
  const flush = async () => {
    if (!buf.length) return;
    const batch = writeBatch(db);
    buf.forEach(p => {
      const refNew = p._id ? doc(db,"productions",p._id) : doc(collection(db,"productions"));
      batch.set(refNew, p, { merge:true });
    });
    await batch.commit(); buf = [];
  };

  for (const c of arr) {
    let tsStr, lotId, itemId, type, line, inchStr, process, process_tag, lengthStr, qtyStr;

    if (mode === "full") {
      [tsStr,lotId,itemId,type,line,inchStr,process,process_tag,lengthStr,qtyStr] = c;
    } else {
      [tsStr,lotId,itemId,type,line,inchStr,process,lengthStr,qtyStr] = c;
      process_tag = "";
    }

    const inch = Number(inchStr);
    const length_mm = Number(lengthStr);
    const qty = Number(qtyStr);

    let tsVal: any = serverTimestamp();
    if (tsStr && tsStr.trim()) {
      const n = Number(tsStr); const d = isNaN(n) ? new Date(tsStr) : new Date(n);
      if (!isNaN(d.getTime())) tsVal = d;
    }

    const tagFixed = PROCESS_TAGS[process] ?? (process_tag || "");

    const payload: ProdRow = {
      ts: tsVal, lotId, itemId, type, line,
      inch: Number.isFinite(inch) ? inch : 0,
      process, process_tag: tagFixed,
      length_mm: Number.isFinite(length_mm) ? length_mm : 0,
      qty: Number.isFinite(qty) ? qty : 0,
    };

    buf.push(payload);
    if (buf.length >= batchSize) await flush();
  }

  await flush();
  await load();
}
function triggerCSVUpload(){ fileInput.value?.click(); }

/* ---------------- Sort ---------------- */
type SortKey = "ts"|"itemId"|"type"|"line"|"inch"|"process"|"length_mm"|"qty";
const sortKey = ref<SortKey>("ts");
const sortDir = ref<"asc" | "desc">("desc");

function toggleSort(k: SortKey) {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = k;
    sortDir.value = "asc";
  }
}
function getSortable(r: ProdRow, k: SortKey) {
  if (k === "ts") return tsMs(r.ts) ?? 0;
  return (r as any)[k] ?? "";
}
const sorted = computed(() => {
  const arr = [...filtered.value];
  const dir = sortDir.value === "asc" ? 1 : -1;
  const k = sortKey.value;
  return arr.sort((a, b) => {
    const va = getSortable(a, k);
    const vb = getSortable(b, k);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
});

/* ---------------- Close <details> on outside click / ESC ---------------- */
function closeAllDetails(e?: Event) {
  const opens = document.querySelectorAll("details[open]");
  opens.forEach((d:any) => {
    if (e && e.target instanceof Node && d.contains(e.target)) return;
    d.open = false;
  });
}
function onDocClick(e: MouseEvent) { closeAllDetails(e); }
function onEsc(e: KeyboardEvent) { if (e.key === "Escape") closeAllDetails(); }
onMounted(() => {
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onEsc, true);
});
onUnmounted(() => {
  document.removeEventListener("click", onDocClick, true);
  document.removeEventListener("keydown", onEsc, true);
});
</script>

<template>
  <section class="p-4 grid gap-3">
    <!-- Top bar -->
    <header class="sticky top-0 z-30 bg-white/90 backdrop-blur pb-2 flex items-center justify-between">
      <h2 class="text-lg font-semibold">Production History</h2>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">표시: <b>{{ filtered.length }}</b> / 전체 {{ rows.length }}</span>

        <button type="button" class="btn" @click="load" :disabled="loading">새로고침</button>
        <button type="button" class="btn-outline blue" @click="exportSelectedCSV" :disabled="!selectedRows.length">CSV 내보내기(선택)</button>

        <!-- Styled CSV upload -->
        <button type="button" class="btn-outline blue" @click="triggerCSVUpload">CSV 올리기</button>
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="file-hidden" @change="onCSVChoose"/>
        <span class="badge" :title="chosenFileName">{{ chosenFileName }}</span>

        <button type="button" class="btn-rose" @click="deleteSelected" :disabled="!selectedRows.length">선택 삭제</button>
        <button type="button" class="btn" @click="resetAll">필터 초기화</button>
      </div>
    </header>

    <div v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</div>
    <div v-else-if="loading" class="py-3">불러오는 중…</div>

    <!-- Table -->
    <div v-else class="relative overflow-auto rounded-xl border border-gray-200">
      <table class="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col style="width:3rem"/>
          <col style="width:13.5rem"/> <!-- ts 넓힘 -->
          <col style="width:16rem"/>    <!-- itemId -->
          <col style="width:6.5rem"/>
          <col style="width:7rem"/>
          <col style="width:6.5rem"/>
          <col style="width:8rem"/>
          <col style="width:6.5rem"/>   <!-- length_mm -->
          <col style="width:6.5rem"/>   <!-- qty -->
          <col style="width:9.5rem"/>   <!-- Total header -->
          <col style="width:8.5rem"/>   <!-- 액션 -->
        </colgroup>

        <thead>
          <!-- 1줄 헤더 (정렬) -->
          <tr class="sticky top-0 z-20 bg-gray-50 h-12 select-none">
            <th class="th th-center">
              <input type="checkbox" :checked="allChecked" @change="allChecked = ($event.target as HTMLInputElement).checked"/>
            </th>

            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('ts')">
              ts <span v-if="sortKey==='ts'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('itemId')">
              itemId <span v-if="sortKey==='itemId'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('type')">
              type <span v-if="sortKey==='type'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('line')">
              line <span v-if="sortKey==='line'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('inch')">
              inch <span v-if="sortKey==='inch'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('process')">
              process <span v-if="sortKey==='process'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('length_mm')">
              length (mm) <span v-if="sortKey==='length_mm'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('qty')">
              qty <span v-if="sortKey==='qty'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center">Total: <b>{{ totalQty }}</b></th>
            <th class="th th-center">액션</th>
          </tr>

          <!-- 2줄: 필터 -->
          <tr class="sticky top-12 z-10 bg-white border-b">
            <th></th>

            <!-- ts: 기간 from~to -->
            <th class="px-3 py-2">
              <div class="flex items-center gap-1 justify-center">
                <input type="date" v-model="fFromDate" class="date-input"/>
                <span class="text-gray-400">~</span>
                <input type="date" v-model="fToDate" class="date-input"/>
              </div>
            </th>

            <!-- 검색 -->
            <th class="px-3 py-2">
              <input v-model="fSearch" placeholder="itemId / lotId 검색(부분)"
                     class="w-full input"/>
            </th>

            <!-- type -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fTypes.length ? fTypes.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fTypeOpts" :key="v" class="opt">
                    <input type="checkbox" :value="v" v-model="fTypes" class="ck"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- line -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fLines.length ? fLines.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fLineOpts" :key="v" class="opt">
                    <input type="checkbox" :value="v" v-model="fLines" class="ck"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- inch -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fInches.length ? fInches.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fInchOpts" :key="v" class="opt">
                    <input type="checkbox" :value="v" v-model="fInches" class="ck"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- process -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fProcesses.length ? fProcesses.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fProcessOpts" :key="v" class="opt">
                    <input type="checkbox" :value="v" v-model="fProcesses" class="ck"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- length_mm -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">
                  {{ fLens.length ? (fLens.length<=3?fLens.join(", "):`${fLens.length}개 선택`) : "전체" }}
                </summary>
                <div class="dd">
                  <label v-for="v in fLengthOpts" :key="v" class="opt">
                    <input type="checkbox" :value="v" v-model="fLens" class="ck"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- qty -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">
                  {{ fQtys.length ? (fQtys.length<=3?fQtys.join(", "):`${fQtys.length}개 선택`) : "전체" }}
                </summary>
                <div class="dd">
                  <label v-for="v in fQtyOpts" :key="v" class="opt">
                    <input type="checkbox" :value="v" v-model="fQtys" class="ck"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- Total 열: 필터 없음 -->
            <th></th>

            <!-- 액션 라벨 -->
            <th class="px-3 py-2 text-center text-xs text-gray-500">액션</th>
          </tr>
        </thead>

        <tbody class="[&>tr:nth-child(odd)]:bg-gray-50">
          <tr v-for="r in sorted" :key="selKeyOf(r)" class="border-b hover:bg-blue-50/50">
            <template v-if="editingKey !== selKeyOf(r)">
              <td class="px-3 py-2">
                <input type="checkbox"
                  :checked="selectedIds.has(selKeyOf(r))"
                  @change="($e)=>{ const c = ($e.target as HTMLInputElement).checked; c?selectedIds.add(selKeyOf(r)):selectedIds.delete(selKeyOf(r)) }"/>
              </td>

              <td class="px-3 py-2 text-center">{{ fmtTsShort(r.ts) }}</td>
              <td class="px-3 py-2 font-mono text-[12.5px]">{{ r.itemId }}</td>
              <td class="px-3 py-2 text-center">{{ r.type }}</td>
              <td class="px-3 py-2 text-center">{{ r.line }}</td>
              <td class="px-3 py-2 text-center">{{ r.inch }}</td>
              <td class="px-3 py-2 text-center">{{ r.process }}</td>
              <td class="px-3 py-2 text-center">{{ r.length_mm }}</td>
              <td class="px-3 py-2 text-center">{{ r.qty }}</td>
              <td class="px-3 py-2 text-center">—</td>
              <td class="px-3 py-2">
                <div class="flex gap-2 justify-center">
                  <button type="button" class="btn" @click="startEdit(r)">수정</button>
                  <button type="button" class="btn" @click="removeRow(r)">삭제</button>
                </div>
              </td>
            </template>

            <template v-else>
              <td class="px-3 py-2"><input type="checkbox" disabled/></td>
              <td class="px-3 py-2">
                <input type="datetime-local"
                  :value="formatIso(editCache!.ts).slice(0,16)"
                  @change="(e:any)=>{ const v=e.target.value; editCache!.ts = v? new Date(v): editCache!.ts }"
                  class="w-[12rem] input"/>
              </td>
              <td class="px-3 py-2"><input v-model="editCache!.itemId" class="w-full input font-mono"/></td>
              <td class="px-3 py-2"><input v-model="editCache!.type" list="typeList" class="w-full input"/></td>
              <td class="px-3 py-2"><input v-model="editCache!.line" list="lineList" class="w-full input"/></td>
              <td class="px-3 py-2"><input type="number" step="0.25" v-model.number="editCache!.inch" class="w-full input"/></td>
              <td class="px-3 py-2">
                <select v-model="editCache!.process" class="w-full input">
                  <option disabled value="">선택</option>
                  <option v-for="p in PROCESS_MASTER" :key="p" :value="p">{{ p }}</option>
                </select>
              </td>
              <td class="px-3 py-2"><input type="number" v-model.number="editCache!.length_mm" class="w-full input"/></td>
              <td class="px-3 py-2"><input type="number" v-model.number="editCache!.qty" class="w-full input"/></td>
              <td class="px-3 py-2 text-center">—</td>
              <td class="px-3 py-2">
                <div class="flex gap-2 justify-center">
                  <button type="button" class="btn-blue" @click="saveEdit(r)">저장</button>
                  <button type="button" class="btn" @click="cancelEdit">취소</button>
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <!-- datalist -->
      <datalist id="typeList"><option v-for="t in TYPE_MASTER" :key="t" :value="t" /></datalist>
      <datalist id="lineList"><option v-for="l in LINE_MASTER" :key="l" :value="l" /></datalist>
    </div>
  </section>
</template>

<style scoped>
:where(button, input, select) { all: revert; font: inherit; }

/* Buttons */
.btn { display:inline-flex; align-items:center; border:1px solid #d1d5db; background:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn:hover { background:#f9fafb; }
.btn:active { transform:scale(.98); }
.btn-blue { display:inline-flex; align-items:center; border:1px solid #2563eb; background:#2563eb; color:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn-blue:hover { background:#1d4ed8; }
.btn-rose { display:inline-flex; align-items:center; border:1px solid #e11d48; background:#e11d48; color:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn-rose:hover { background:#be123c; }
.btn-outline.blue { display:inline-flex; align-items:center; border:1px solid #93c5fd; background:#fff; color:#1d4ed8; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn-outline.blue:hover { background:#eff6ff; }

/* Badges */
.badge { display:inline-flex; align-items:center; border:1px solid #e5e7eb; padding:.375rem .5rem; border-radius:.5rem; font-size:.75rem; color:#374151; background:#fff; max-width:16rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Table */
.th { padding:.5rem .75rem; color:#374151; border-bottom:1px solid #e5e7eb; font-weight:600; }
.th-center { text-align:center; }
.input { border:1px solid #d1d5db; border-radius:.5rem; padding:.375rem .5rem; outline:none; }
.input:focus { box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }

/* date inputs small */
.date-input { width:8.6rem; border:1px solid #d1d5db; border-radius:.5rem; padding:.25rem .5rem; outline:none; }
.date-input:focus { box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }

/* Multiselect dropdowns */
.select-like { display:inline-flex; align-items:center; height:2.25rem; border:1px solid #d1d5db; border-radius:0.5rem; padding:0 0.75rem; background:#fff; color:#374151; cursor:pointer; user-select:none; }
.dd {
  position: absolute; left: 0; top: 100%; margin-top: 4px;
  width: 14rem; max-height: 14rem; overflow: auto;
  background: #fff; border: 1px solid #e5e7eb; border-radius: .75rem;
  padding: .5rem; box-shadow: 0 10px 24px rgba(0,0,0,.08); z-index: 50;
}
.opt { display:flex; align-items:center; gap:.5rem; height:2rem; line-height:2rem; font-size:.875rem; }
.ck { width:1rem; height:1rem; }
.file-hidden{
  position:absolute !important;
  left:-9999px !important;
  width:1px !important;
  height:1px !important;
  overflow:hidden !important;
  clip:rect(0 0 0 0) !important;
  white-space:nowrap !important;
  opacity:0 !important;
}
</style>
