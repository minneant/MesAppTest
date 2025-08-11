<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { db } from "@/firebase";
import {
  collection, getDocs, orderBy, query, limit,
  doc, setDoc, getDoc, deleteDoc, serverTimestamp, writeBatch
} from "firebase/firestore";

/* ---------------- Types ---------------- */
type ItemRow = {
  itemId: string;
  type: string;
  line: string;
  inch: number;
  process_tag: string;
  process?: string;
  length_mm: number;
  created_at?: any;
};

/* ---------------- Master lists (user-provided) ---------------- */
const TYPE_MASTER = ["ST1","ST2","HD1","HD2","EL1","EL2","END","CON","PCO"];
const LINE_MASTER = ["LIQ","VAP","BOG","30T","40T","50T","60T","80T"];

/* ---------------- process -> tag map ---------------- */
const PROCESS_TAGS: Record<string, string> = {
  Cutting_Wire: "cw",
  Foaming: "fo",
  Planing: "pl",
  Cutting_length: "cl",
  FRP_Coating: "fc",
  Al_Coating: "ac",
  Cutting_Elbow: "ce",
  Glue: "gl",
  Sanding: "sa",
  Packaging: "pa",
  Shipping: "sh",
};

/* ---------------- State ---------------- */
const rows = ref<ItemRow[]>([]);
const loading = ref(false);
const errorMsg = ref("");

/* Filters (UI 상태) */
const fTypes = ref<string[]>([]);
const fLines = ref<string[]>([]);
const fTags = ref<string[]>([]);
const fProcesses = ref<string[]>([]);
const fInches = ref<number[]>([]);
const fLens = ref<number[]>([]);              // length 멀티 선택
const fCreatedSince = ref<string>("");        // created_at '이후' 단일 필터
const fSearch = ref<string>("");

/* Multi-select */
const selectedIds = ref<Set<string>>(new Set());
const selectedRows = computed(() => filtered.value.filter(r => selectedIds.value.has(r.itemId)));
const allChecked = computed({
  get() {
    const ids = filtered.value.map(r => r.itemId);
    return ids.length > 0 && ids.every(id => selectedIds.value.has(id));
  },
  set(v: boolean) {
    const ids = filtered.value.map(r => r.itemId);
    if (v) ids.forEach(id => selectedIds.value.add(id));
    else ids.forEach(id => selectedIds.value.delete(id));
  }
});

/* Create modal */
const showCreate = ref(false);
const createType = ref("");
const createLine = ref("");
const createInch = ref<number | null>(null);
const createProc = ref("");
const createTag = ref("");
const createLen = ref<number | null>(null);

/* Edit */
const editingId = ref<string | null>(null);
const editCache = ref<ItemRow | null>(null);

/* CSV input */
const fileInput = ref<HTMLInputElement | null>(null);

/* ---------------- Init ---------------- */
onMounted(load);
async function load() {
  loading.value = true; errorMsg.value = "";
  try {
    const q = query(collection(db, "items"), orderBy("itemId"), limit(8000));
    const snap = await getDocs(q);
    rows.value = snap.docs.map(d => d.data() as ItemRow);
  } catch (e: any) {
    errorMsg.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

/* ---------------- Helpers ---------------- */
const lc = (s?: string) => (s ?? "").toLowerCase();
function buildItemId(type: string, line: string, inch: number, tag: string, length_mm: number) {
  return `${type}_${line}_${inch}_${tag}_L${length_mm}`;
}
function createdAtMs(v:any): number | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") { const d=new Date(v); return isNaN(d.getTime())?null:d.getTime(); }
  return null;
}
function fmtCreatedShort(v:any) {
  const ms = createdAtMs(v); if (ms==null) return "";
  const d = new Date(ms); const p=(n:number)=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function formatCreatedAt(v:any) {
  const ms = createdAtMs(v); return ms==null ? "" : new Date(ms).toISOString();
}

/* ---------- “필터 옵션을 동적으로” 생성하기 ---------- */
/* (핵심) 특정 필드를 제외하고 현재 필터를 적용한 후, 남은 행에서 옵션을 계산 */
type FilterField = "type"|"line"|"tag"|"process"|"inch"|"length";
function passesExcept(r: ItemRow, exclude: FilterField | null): boolean {
  const sinceMs = fCreatedSince.value ? new Date(fCreatedSince.value).getTime() : null;
  const sTxt = lc(fSearch.value);

  if (exclude !== "type"    && fTypes.value.length     && !fTypes.value.includes(r.type)) return false;
  if (exclude !== "line"    && fLines.value.length     && !fLines.value.includes(r.line)) return false;
  if (exclude !== "tag"     && fTags.value.length      && !fTags.value.includes(r.process_tag)) return false;
  if (exclude !== "process" && fProcesses.value.length && !fProcesses.value.includes(r.process ?? "")) return false;
  if (exclude !== "inch"    && fInches.value.length    && !fInches.value.includes(r.inch)) return false;
  if (exclude !== "length"  && fLens.value.length      && !fLens.value.includes(r.length_mm)) return false;

  if (sinceMs!=null) {
    const ms = createdAtMs(r.created_at);
    if (ms==null || ms < sinceMs) return false;
  }
  if (sTxt && !lc(r.itemId).includes(sTxt)) return false;
  return true;
}

/* 각 필터용 동적 옵션 */
const fTypeOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"type")).map(r => r.type))).sort()
);
const fLineOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"line")).map(r => r.line))).sort()
);
const fTagOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"tag")).map(r => r.process_tag))).sort()
);
const fProcessOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"process")).map(r => r.process).filter(Boolean) as string[])).sort()
);
const fInchOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"inch")).map(r => r.inch))).sort((a,b)=>a-b)
);
const fLengthOpts = computed(() =>
  Array.from(new Set(rows.value.filter(r => passesExcept(r,"length")).map(r => r.length_mm))).sort((a,b)=>a-b)
);

/* (생성 모달 datalist) 입력 추천은 마스터+데이터 union 유지 */
const dlTypeOptions = computed(() => {
  const s = new Set<string>(TYPE_MASTER);
  rows.value.forEach(r => s.add(r.type));
  return Array.from(s).sort();
});
const dlLineOptions = computed(() => {
  const s = new Set<string>(LINE_MASTER);
  rows.value.forEach(r => s.add(r.line));
  return Array.from(s).sort();
});

/* 1차 필터(길이 포함) 후 최종 목록 */
const filtered = computed(() => rows.value.filter(r => passesExcept(r, null)));

/* 요약 텍스트 */
const lengthSummary = computed(() =>
  fLens.value.length ? (fLens.value.length <= 3 ? fLens.value.join(", ") : `${fLens.value.length}개 선택`) : "전체"
);

/* Reset */
function resetAll() {
  fTypes.value = []; fLines.value = []; fTags.value = []; fProcesses.value = []; fInches.value = [];
  fSearch.value = ""; fLens.value = [];
  fCreatedSince.value = "";
}

/* 사용 불가해진 선택값 자동 정리(prune) */
function pruneMulti<T>(model: T[], valid: Set<T>) {
  const next = model.filter(v => valid.has(v));
  if (next.length !== model.length) return next;
  return model;
}
watch([fTypeOpts], () => {
  fTypes.value = pruneMulti(fTypes.value, new Set(fTypeOpts.value)) as string[];
});
watch([fLineOpts], () => {
  fLines.value = pruneMulti(fLines.value, new Set(fLineOpts.value)) as string[];
});
watch([fTagOpts], () => {
  fTags.value = pruneMulti(fTags.value, new Set(fTagOpts.value)) as string[];
});
watch([fProcessOpts], () => {
  fProcesses.value = pruneMulti(fProcesses.value, new Set(fProcessOpts.value)) as string[];
});
watch([fInchOpts], () => {
  fInches.value = pruneMulti(fInches.value, new Set(fInchOpts.value)) as number[];
});
watch([fLengthOpts], () => {
  fLens.value = pruneMulti(fLens.value, new Set(fLengthOpts.value)) as number[];
});

/* ---------------- Create ---------------- */
watch(createProc, (p) => { createTag.value = p ? (PROCESS_TAGS[p] ?? "") : ""; });

const computedCreateId = computed(() => {
  if (!createType.value || !createLine.value || createInch.value == null || !createTag.value || createLen.value == null) return "";
  return buildItemId(createType.value, createLine.value, Number(createInch.value), createTag.value, Number(createLen.value));
});

function openCreate() {
  showCreate.value = true;
  if (createLen.value == null) createLen.value = 1000;
}

async function createItem() {
  if (!computedCreateId.value) { alert("필수값을 모두 입력하세요."); return; }
  const payload: ItemRow = {
    itemId: computedCreateId.value,
    type: createType.value,
    line: createLine.value,
    inch: Number(createInch.value),
    process_tag: createTag.value,
    process: createProc.value || undefined,
    length_mm: Number(createLen.value),
    created_at: serverTimestamp()
  };
  const ref = doc(db, "items", payload.itemId);
  const exist = await getDoc(ref);
  if (exist.exists() && !confirm("같은 itemId가 있습니다. 덮어쓸까요?")) return;
  await setDoc(ref, payload, { merge: true });
  rows.value.unshift({ ...payload, created_at: new Date() });
  showCreate.value = false;
  createType.value = createLine.value = "";
  createProc.value = createTag.value = "";
  createInch.value = null; createLen.value = 1000;
}

/* ---------------- Edit ---------------- */
function startEdit(r: ItemRow) { editingId.value = r.itemId; editCache.value = { ...r }; }
function cancelEdit() { editingId.value = null; editCache.value = null; }
const computedEditId = computed(() => {
  const e = editCache.value; if (!e) return "";
  return buildItemId(e.type, e.line, Number(e.inch), e.process_tag, Number(e.length_mm));
});
function onEditProcessChange() {
  if (!editCache.value) return;
  const p = editCache.value.process || "";
  editCache.value.process_tag = PROCESS_TAGS[p] ?? editCache.value.process_tag;
}
async function saveEdit(orig: ItemRow) {
  if (!editCache.value) return;
  const e = editCache.value, newId = computedEditId.value;
  if (!newId) { alert("필수값을 확인하세요."); return; }

  const newPayload: ItemRow = {
    itemId: newId,
    type: e.type,
    line: e.line,
    inch: Number(e.inch),
    process_tag: e.process_tag,
    process: e.process || undefined,
    length_mm: Number(e.length_mm),
    created_at: orig.created_at ?? serverTimestamp(),
  };

  if (newId === orig.itemId) {
    await setDoc(doc(db, "items", newId), newPayload, { merge: true });
    const idx = rows.value.findIndex(x => x.itemId === orig.itemId);
    if (idx >= 0) rows.value[idx] = { ...newPayload };
  } else {
    const newRef = doc(db, "items", newId);
    const exist = await getDoc(newRef);
    if (exist.exists() && !confirm("변경된 itemId가 이미 존재합니다. 덮어쓸까요?")) return;
    await setDoc(newRef, newPayload, { merge: true });
    await deleteDoc(doc(db, "items", orig.itemId));
    const idx = rows.value.findIndex(x => x.itemId === orig.itemId);
    if (idx >= 0) rows.value.splice(idx, 1, { ...newPayload });
  }
  editingId.value = null; editCache.value = null;
}

/* ---------------- Delete ---------------- */
async function removeItem(r: ItemRow) {
  if (!confirm(`삭제할까요?\n${r.itemId}`)) return;
  await deleteDoc(doc(db, "items", r.itemId));
  const idx = rows.value.findIndex(x => x.itemId === r.itemId);
  if (idx >= 0) rows.value.splice(idx, 1);
  selectedIds.value.delete(r.itemId);
}
async function deleteByIds(ids: string[]) {
  const chunk = 450;
  for (let i=0;i<ids.length;i+=chunk) {
    const batch = writeBatch(db);
    ids.slice(i, i+chunk).forEach(id => batch.delete(doc(db,"items",id)));
    await batch.commit();
  }
}
async function deleteSelected() {
  const ids = Array.from(selectedIds.value);
  if (!ids.length) { alert("선택된 항목이 없습니다."); return; }
  if (!confirm(`선택 ${ids.length}건을 삭제할까요?`)) return;
  await deleteByIds(ids);
  await load();
  selectedIds.value.clear();
}

/* ---------------- CSV export/import ---------------- */
function toCSV(records: ItemRow[]) {
  const headers = ["itemId","type","line","inch","process","process_tag","length_mm","created_at"];
  const esc = (v:any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = records.map(r => [
    r.itemId, r.type, r.line, r.inch,
    r.process ?? "", r.process_tag, r.length_mm, formatCreatedAt(r.created_at)
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
  download(`items_selected_${new Date().toISOString().slice(0,19)}.csv`, toCSV(selectedRows.value));
}
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
  const txt = await file.text();

  const arr = parseCSV(txt).filter(r => r.length && r.some(c=>c!==""));
  const header = arr.shift()!;
  const need = ["itemId","type","line","inch","process","process_tag","length_mm","created_at"];
  if (!header || need.some((h,i)=> (header[i]||"").trim() !== h)) {
    alert("CSV 헤더가 올바르지 않습니다.\n필요 헤더: " + need.join(",")); input.value=""; return;
  }

  const batchSize = 400;
  let buf: ItemRow[] = [];
  const flush = async () => {
    if (!buf.length) return;
    const batch = writeBatch(db);
    buf.forEach(p => batch.set(doc(db,"items",p.itemId), p, { merge:true }));
    await batch.commit(); buf = [];
  };

  for (const c of arr) {
    const [,_type,_line,_inch,_proc,_tag,_len,_created] = c;
    const type=_type, line=_line;
    const inch=Number(_inch), length_mm=Number(_len);
    const process=_proc || undefined;
    const process_tag = process ? (PROCESS_TAGS[process] ?? _tag) : _tag;

    let created:any = serverTimestamp();
    if (_created && _created.trim()) {
      const n = Number(_created); const d = isNaN(n) ? new Date(_created) : new Date(n);
      if (!isNaN(d.getTime())) created = d;
    }

    const id = buildItemId(type, line, inch, process_tag, length_mm);
    buf.push({ itemId:id, type, line, inch, process, process_tag, length_mm, created_at: created });
    if (buf.length >= batchSize) await flush();
  }
  await flush();
  await load(); input.value = "";
  alert(`CSV 업로드 완료`);
}
function triggerCSVUpload(){ fileInput.value?.click(); }

/* ---------------- Sort ---------------- */
type SortKey = "itemId" | "type" | "line" | "inch" | "process_tag" | "process" | "length_mm" | "created_at";
const sortKey = ref<SortKey>("itemId");
const sortDir = ref<"asc" | "desc">("asc");

function toggleSort(k: SortKey) {
  if (sortKey.value === k) {
    sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  } else {
    sortKey.value = k;
    sortDir.value = "asc";
  }
}
function getSortable(r: ItemRow, k: SortKey) {
  if (k === "created_at") {
    const ms = createdAtMs(r.created_at);
    return ms ?? 0;
  }
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
      <h2 class="text-lg font-semibold">Item 관리</h2>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">표시: <b>{{ filtered.length }}</b> / 전체 {{ rows.length }}</span>

        <button type="button"
                class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 active:scale-[.98] transition"
                @click="load" :disabled="loading">새로고침</button>

        <button type="button"
                class="inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 active:scale-[.98] transition disabled:opacity-50"
                @click="exportSelectedCSV" :disabled="!selectedRows.length">CSV 내보내기(선택)</button>

        <button type="button"
                class="inline-flex items-center rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 active:scale-[.98] transition"
                @click="triggerCSVUpload">CSV 올리기</button>
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="hidden" @change="onCSVChoose"/>

        <button type="button"
                class="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-sm text-white shadow-sm hover:bg-rose-700 active:scale-[.98] transition disabled:opacity-50"
                @click="deleteSelected" :disabled="!selectedRows.length">선택 삭제</button>

        <button type="button"
                class="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white shadow-sm hover:bg-blue-700 active:scale-[.98] transition"
                @click="openCreate">+ 새 항목</button>

        <button type="button"
                class="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200 active:scale-[.98] transition"
                @click="resetAll">필터 초기화</button>
      </div>
    </header>

    <div v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</div>
    <div v-else-if="loading" class="py-3">불러오는 중…</div>

    <!-- Table -->
    <div v-else class="relative overflow-auto rounded-xl border border-gray-200">
      <table class="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col style="width:3rem"/>
          <col style="width:24rem"/>
          <col style="width:6.5rem"/>
          <col style="width:6.5rem"/>
          <col style="width:5rem"/>
          <col style="width:7rem"/>
          <col style="width:10rem"/>
          <col style="width:9rem"/>
          <col style="width:13rem"/>
          <col style="width:8rem"/>
        </colgroup>

        <thead>
          <!-- 1줄 헤더 (정렬) -->
          <tr class="sticky top-0 z-20 bg-gray-50 h-12 select-none">
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">
              <input type="checkbox" :checked="allChecked" @change="allChecked = ($event.target as HTMLInputElement).checked"/>
            </th>

            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('itemId')">
              itemId <span v-if="sortKey==='itemId'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('type')">
              type <span v-if="sortKey==='type'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('line')">
              line <span v-if="sortKey==='line'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('inch')">
              inch <span v-if="sortKey==='inch'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('process_tag')">
              tag <span v-if="sortKey==='process_tag'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('process')">
              process <span v-if="sortKey==='process'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('length_mm')">
              length (mm) <span v-if="sortKey==='length_mm'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-100"
                @click="toggleSort('created_at')">
              created_at <span v-if="sortKey==='created_at'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>

            <th class="px-3 py-2 text-left font-semibold text-gray-700 border-b border-gray-200">액션</th>
          </tr>

          <!-- 2줄: 필터 (옵션 동적) -->
          <tr class="sticky top-12 z-10 bg-white border-b">
            <th></th>
            <th class="px-3 py-2">
              <input v-model="fSearch" placeholder="itemId 검색(부분)"
                     class="w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/>
            </th>

            <!-- type -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fTypes.length ? fTypes.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fTypeOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fTypes" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- line -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fLines.length ? fLines.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fLineOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fLines" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- inch -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fInches.length ? fInches.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fInchOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fInches" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- tag -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fTags.length ? fTags.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fTagOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fTags" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- process -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ fProcesses.length ? fProcesses.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fProcessOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fProcesses" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- length (mm): 멀티체크 드롭다운 -->
            <th class="px-3 py-2">
              <details class="relative">
                <summary class="select-like">{{ lengthSummary }}</summary>
                <div class="dd">
                  <label v-for="v in fLengthOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fLens" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- created_at: '이후' 단일 입력 -->
            <th class="px-3 py-2">
              <input type="datetime-local" v-model="fCreatedSince"
                     class="w-[12rem] rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/>
            </th>

            <th></th>
          </tr>
        </thead>

        <tbody class="[&>tr:nth-child(odd)]:bg-gray-50">
          <tr v-for="r in sorted" :key="r.itemId" class="border-b hover:bg-blue-50/50">
            <template v-if="editingId !== r.itemId">
              <td class="px-3 py-2"><input type="checkbox"
                    :checked="selectedIds.has(r.itemId)"
                    @change="($e)=>{ const c = ($e.target as HTMLInputElement).checked; c?selectedIds.add(r.itemId):selectedIds.delete(r.itemId) }"/></td>
              <td class="px-3 py-2 font-mono text-[12.5px]">{{ r.itemId }}</td>
              <td class="px-3 py-2">{{ r.type }}</td>
              <td class="px-3 py-2">{{ r.line }}</td>
              <td class="px-3 py-2">{{ r.inch }}</td>
              <td class="px-3 py-2">{{ r.process_tag }}</td>
              <td class="px-3 py-2">{{ r.process || '—' }}</td>
              <td class="px-3 py-2">{{ r.length_mm }}</td>
              <td class="px-3 py-2">{{ fmtCreatedShort(r.created_at) }}</td>
              <td class="px-3 py-2">
                <div class="flex gap-2">
                  <button type="button"
                          class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 active:scale-[.98] transition"
                          @click="startEdit(r)">수정</button>
                  <button type="button"
                          class="inline-flex items-center rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200 active:scale-[.98] transition"
                          @click="removeItem(r)">삭제</button>
                </div>
              </td>
            </template>

            <template v-else>
              <td class="px-3 py-2"><input type="checkbox" disabled/></td>
              <td class="px-3 py-2 font-mono text-[12.5px]">{{ computedEditId }}</td>
              <td class="px-3 py-2">
                <input v-model="editCache!.type" list="typeList"
                       class="w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/>
              </td>
              <td class="px-3 py-2">
                <input v-model="editCache!.line" list="lineList"
                       class="w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/>
              </td>
              <td class="px-3 py-2"><input type="number" step="0.25" v-model.number="editCache!.inch" class="w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/></td>
              <td class="px-3 py-2"><input :value="editCache!.process_tag" class="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5" readonly/></td>
              <td class="px-3 py-2">
                <select v-model="editCache!.process" @change="onEditProcessChange" class="w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400">
                  <option value="" disabled>선택</option>
                  <option v-for="p in fProcessOpts" :key="p" :value="p">{{ p }}</option>
                </select>
              </td>
              <td class="px-3 py-2"><input type="number" v-model.number="editCache!.length_mm" class="w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/></td>
              <td class="px-3 py-2">{{ fmtCreatedShort(editCache!.created_at) }}</td>
              <td class="px-3 py-2">
                <div class="flex gap-2">
                  <button type="button"
                          class="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white shadow-sm hover:bg-blue-700 active:scale-[.98] transition"
                          @click="saveEdit(r)">저장</button>
                  <button type="button"
                          class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 active:scale-[.98] transition"
                          @click="cancelEdit">취소</button>
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>

      <!-- datalist: 생성 모달 추천 -->
      <datalist id="typeList">
        <option v-for="t in dlTypeOptions" :key="t" :value="t" />
      </datalist>
      <datalist id="lineList">
        <option v-for="l in dlLineOptions" :key="l" :value="l" />
      </datalist>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="fixed inset-0 z-[9999] bg-black/40 flex items-start justify-center p-6">
      <div class="w-[min(720px,92vw)] max-h-[80vh] overflow-auto rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-base font-semibold">새 항목 추가</h3>
          <button type="button"
                  class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 active:scale-[.98] transition"
                  @click="showCreate = false">닫기</button>
        </div>

        <div class="grid grid-cols-2 gap-3 my-2">
          <label class="text-sm text-gray-600">type
            <input v-model="createType" list="typeList"
                   class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
          </label>
          <label class="text-sm text-gray-600">line
            <input v-model="createLine" list="lineList"
                   class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400" />
          </label>

          <label class="text-sm text-gray-600">inch
            <input type="number" step="0.25" v-model.number="createInch"
                   class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/>
          </label>

          <label class="text-sm text-gray-600">process
            <select v-model="createProc"
                    class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400">
              <option value="" disabled>선택</option>
              <option v-for="p in dlTypeOptions && dlLineOptions ? Object.keys(PROCESS_TAGS) : Object.keys(PROCESS_TAGS)" :key="p" :value="p">{{ p }}</option>
            </select>
          </label>

          <label class="text-sm text-gray-600">tag
            <input v-model="createTag" readonly
                   class="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5"/>
          </label>

          <label class="text-sm text-gray-600">length(mm)
            <input type="number" v-model.number="createLen"
                   class="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"/>
          </label>
        </div>

        <p class="font-mono text-sm">생성될 itemId: <b>{{ computedCreateId || "(필수값 입력 필요)" }}</b></p>

        <div class="flex justify-end gap-2 mt-3">
          <button type="button"
                  class="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white shadow-sm hover:bg-blue-700 active:scale-[.98] transition"
                  @click="createItem">추가</button>
          <button type="button"
                  class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 active:scale-[.98] transition"
                  @click="showCreate = false">닫기</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
:where(button, input, select) { all: revert; font: inherit; }
.select-like { display:inline-flex; align-items:center; height:2.25rem; border:1px solid #d1d5db; border-radius:0.5rem; padding:0 0.75rem; background:#fff; color:#374151; cursor:pointer; user-select:none; }
.dd {
  position: absolute; left: 0; top: 100%; margin-top: 4px;
  width: 14rem; max-height: 14rem; overflow: auto;
  background: #fff; border: 1px solid #e5e7eb; border-radius: .75rem;
  padding: .5rem; box-shadow: 0 10px 24px rgba(0,0,0,.08); z-index: 50;
}
</style>
