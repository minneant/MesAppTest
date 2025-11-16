<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type Ref } from "vue";
import { db } from "@/firebase";
import {
  collection, getDocs, orderBy, query, limit,
  doc, setDoc, getDoc, deleteDoc, serverTimestamp, writeBatch,
  startAfter, where, startAt, endAt, updateDoc, arrayUnion
} from "firebase/firestore";
import { useMasters } from "@/composables/useMasters";

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

  product_level?: number;
  uom?: 'EA'|'M'|'ST';
  active?: boolean;
  updated_at?: any;

  has_bom?: boolean;   // ← BOM 상태(백필/자동 세팅으로 들어옴)
};

/* ---------------- Masters from DB ---------------- */
const { types, lines, processes } = useMasters();
const TYPE_CODES = computed(() => (types.value || []).map(t => t.code));
const LINE_CODES = computed(() => (lines.value || []).map(l => l.code));
const PROCESS_CODES = computed(() => (processes.value || []).map(p => p.code));
const TYPE_UOM_MAP = computed<Record<string, string|undefined>>(() => {
  const m: Record<string, string|undefined> = {};
  (types.value || []).forEach((t:any) => m[t.code] = t.uom);
  return m;
});
const PROCESS_TAG_MAP = computed<Record<string, string>>(() => {
  const m: Record<string, string> = {};
  (processes.value || []).forEach((p: any) => { m[p.code] = p.tag || ""; });
  return m;
});
const PROCESS_LEVEL_MAP = computed<Record<string, number|undefined>>(() => {
  const m: Record<string, number|undefined> = {};
  (processes.value || []).forEach((p: any) => { m[p.code] = p.product_level; });
  return m;
});
const tagOf = (proc?: string) => (proc ? (PROCESS_TAG_MAP.value[proc] || "") : "");

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
const fLens = ref<number[]>([]);
const fCreatedSince = ref<string>("");
const fSearch = ref<string>("");
/* BOM 상태 필터: all | missing | present */
const fBom = ref<'all'|'missing'|'present'>('all');

/* Multi-select */
const selectedIds = ref<Set<string>>(new Set());
const filtered = computed(() => rows.value.filter(r => passesExcept(r, null)));
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

/* ---------------- Paging / Server-side querying ---------------- */
const PAGE_SIZE = 1000;    // 첫 로딩 1000개
const hasMore = ref(true);
const lastCursor = ref<any>(null);
const serverSideApplied = ref<Record<string, boolean>>({}); // 어떤 필터를 서버로 보냈는지 표시

/* ------------- Facet meta (전 컬렉션 기준 드롭다운 옵션) ------------- */
const FACETS = ref<{
  types: string[]; lines: string[]; processes: string[]; tags: string[];
  inches: number[]; lengths: number[];
} | null>(null);

async function loadFacets() {
  try {
    const d = await getDoc(doc(db, "meta", "items_facets"));
    if (d.exists()) {
      const x = d.data() as any;
      FACETS.value = {
        types: x.types || [],
        lines: x.lines || [],
        processes: x.processes || [],
        tags: x.tags || [],
        inches: (x.inches || []).map((n:any)=>Number(n)).filter(Number.isFinite).sort((a:number,b:number)=>a-b),
        lengths: (x.lengths || []).map((n:any)=>Number(n)).filter(Number.isFinite).sort((a:number,b:number)=>a-b),
      };
    } else {
      FACETS.value = { types:[], lines:[], processes:[], tags:[], inches:[], lengths:[] };
    }
  } catch (e:any) { console.error(e); }
}

/* ---------------- Init ---------------- */
onMounted(async () => {
  await loadFacets();
  await loadInitial(); // 빠른 첫 화면: 1000개만
});
async function loadInitial() {
  loading.value = true; errorMsg.value = ""; selectedIds.value.clear();
  try {
    const qy = query(collection(db, "items"), orderBy("itemId"), limit(PAGE_SIZE));
    const snap = await getDocs(qy);
    rows.value = snap.docs.map(d => mapDoc(d.data()));
    lastCursor.value = snap.docs[snap.docs.length - 1] ?? null;
    hasMore.value = snap.size === PAGE_SIZE;
  } catch (e:any) { errorMsg.value = e?.message ?? String(e); }
  finally { loading.value = false; }
}

/* ---------------- Helpers ---------------- */
const lc = (s?: string) => (s ?? "").toLowerCase();
function inchToStr(n:number) { if (Number.isInteger(n)) return String(n); return String(n).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,''); }
function buildItemId(type: string, line: string, inchN: number, tag: string, length_mm: number) {
  const inch = inchToStr(inchN);
  let id = `${type}_${line}_${inch}_${tag}`;
  if (length_mm > 0 && length_mm !== 1000) id += `_${length_mm}`;
  return id;
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
function mapDoc(x:any): ItemRow {
  const inchNum = Number(x.inch ?? x.inch_str ?? x.inchNum);
  return {
    ...x,
    inch: Number.isFinite(inchNum) ? inchNum : 0,
  } as ItemRow;
}

/* ---------- 동적 옵션(데이터 기반) + Facet 우선 ---------- */
type FilterField = "type"|"line"|"tag"|"process"|"inch"|"length"|"bom";
function passesExcept(r: ItemRow, exclude: FilterField | null): boolean {
  const sinceMs = fCreatedSince.value ? new Date(fCreatedSince.value).getTime() : null;
  const sTxt = lc(fSearch.value);

  if (exclude !== "type"    && fTypes.value.length     && !fTypes.value.includes(r.type)) return false;
  if (exclude !== "line"    && fLines.value.length     && !fLines.value.includes(r.line)) return false;
  if (exclude !== "tag"     && fTags.value.length      && !fTags.value.includes(r.process_tag)) return false;
  if (exclude !== "process" && fProcesses.value.length && !fProcesses.value.includes(r.process ?? "")) return false;
  if (exclude !== "inch"    && fInches.value.length    && !fInches.value.includes(r.inch)) return false;
  if (exclude !== "length"  && fLens.value.length      && !fLens.value.includes(r.length_mm)) return false;

  // BOM 상태 필터
  if (exclude !== "bom") {
    if (fBom.value === "missing" && r.has_bom === true) return false;
    if (fBom.value === "present" && r.has_bom !== true) return false;
  }

  if (sinceMs!=null) {
    const ms = createdAtMs(r.created_at);
    if (ms==null || ms < sinceMs) return false;
  }
  if (sTxt && !lc(r.itemId).includes(sTxt)) return false;
  return true;
}
const fTypeOpts    = computed(() => (FACETS.value?.types?.length ? FACETS.value!.types : Array.from(new Set(rows.value.filter(r => passesExcept(r,"type")).map(r => r.type))).sort()));
const fLineOpts    = computed(() => (FACETS.value?.lines?.length ? FACETS.value!.lines : Array.from(new Set(rows.value.filter(r => passesExcept(r,"line")).map(r => r.line))).sort()));
const fTagOpts     = computed(() => (FACETS.value?.tags?.length ? FACETS.value!.tags : Array.from(new Set(rows.value.filter(r => passesExcept(r,"tag")).map(r => r.process_tag))).sort()));
const fProcessOpts = computed(() => (FACETS.value?.processes?.length ? FACETS.value!.processes : Array.from(new Set(rows.value.filter(r => passesExcept(r,"process")).map(r => r.process).filter(Boolean) as string[])).sort()));
const fInchOpts    = computed(() => (FACETS.value?.inches?.length ? FACETS.value!.inches : Array.from(new Set(rows.value.filter(r => passesExcept(r,"inch")).map(r => r.inch))).sort((a,b)=>a-b)));
const fLengthOpts  = computed(() => (FACETS.value?.lengths?.length ? FACETS.value!.lengths : Array.from(new Set(rows.value.filter(r => passesExcept(r,"length")).map(r => r.length_mm))).sort((a,b)=>a-b)));

const lengthSummary = computed(() => fLens.value.length ? (fLens.value.length <= 3 ? fLens.value.join(", ") : `${fLens.value.length}개 선택`) : "전체");

/* Reset */
function resetAll() {
  fTypes.value = []; fLines.value = []; fTags.value = []; fProcesses.value = []; fInches.value = [];
  fSearch.value = ""; fLens.value = [];
  fCreatedSince.value = "";
  fBom.value = 'all';
}

/* 사용 불가해진 선택값 정리 */
function pruneMulti<T>(model: T[], valid: Set<T>) {
  const next = model.filter(v => valid.has(v));
  if (next.length !== model.length) return next;
  return model;
}
watch([fTypeOpts], () => { fTypes.value = pruneMulti(fTypes.value, new Set(fTypeOpts.value)) as string[]; });
watch([fLineOpts], () => { fLines.value = pruneMulti(fLines.value, new Set(fLineOpts.value)) as string[]; });
watch([fTagOpts], () => { fTags.value = pruneMulti(fTags.value, new Set(fTagOpts.value)) as string[]; });
watch([fProcessOpts], () => { fProcesses.value = pruneMulti(fProcesses.value, new Set(fProcessOpts.value)) as string[]; });
watch([fInchOpts], () => { fInches.value = pruneMulti(fInches.value, new Set(fInchOpts.value)) as number[]; });
watch([fLengthOpts], () => { fLens.value = pruneMulti(fLens.value, new Set(fLengthOpts.value)) as number[]; });

/* ---------------- Server-side filter apply & pagination ---------------- */
// 서버 사이드에는 has_bom 조건을 보내지 않고(복잡한 인덱싱 회피), 클라에서만 거름
function pushMulti<T>(name: string, values: T[], push: (cond:any)=>void) {
  if (!values?.length) return false;
  if (values.length === 1) { push(where(name, "==", values[0] as any)); serverSideApplied.value[name]=true; return true; }
  if (values.length <= 10) { push(where(name, "in", values.slice(0,10) as any)); serverSideApplied.value[name]=true; return true; }
  serverSideApplied.value[name]=false;
  return false;
}

function buildServerQueryParts() {
  serverSideApplied.value = {};
  const parts:any[] = [];
  let orderKey: "itemId" | "created_at" = "itemId";
  let addPrefix = false;
  let prefixValue = "";

  // equal/in 가능한 것들
  pushMulti("type", fTypes.value, c=>parts.push(c));
  pushMulti("line", fLines.value, c=>parts.push(c));
  pushMulti("process_tag", fTags.value, c=>parts.push(c));
  pushMulti("process", fProcesses.value, c=>parts.push(c));
  pushMulti("inch", fInches.value, c=>parts.push(c));
  pushMulti("length_mm", fLens.value, c=>parts.push(c));

  // created_at 하한
  const sinceMs = fCreatedSince.value ? new Date(fCreatedSince.value).getTime() : null;
  if (sinceMs!=null) {
    parts.push(where("created_at", ">=", new Date(sinceMs)));
    serverSideApplied.value["created_at"]=true;
    orderKey = "created_at";
  }

  // itemId prefix 검색
  const s = (fSearch.value || "").trim();
  if (s && !s.includes("*") && !s.includes("?")) {
    addPrefix = true;
    prefixValue = s;
    orderKey = "itemId";
  }

  return { parts, orderKey, addPrefix, prefixValue };
}

async function applyFiltersServerSide() {
  loading.value = true; errorMsg.value=""; selectedIds.value.clear();
  try {
    const { parts, orderKey, addPrefix, prefixValue } = buildServerQueryParts();
    let base = query(collection(db,"items"), orderBy(orderKey), ...(parts as any), limit(PAGE_SIZE));
    if (addPrefix) {
      const upper = prefixValue + "\uf8ff";
      base = query(collection(db,"items"), orderBy("itemId"), ...(parts as any), startAt(prefixValue), endAt(upper), limit(PAGE_SIZE));
    }
    const snap = await getDocs(base);
    rows.value = snap.docs.map(d => mapDoc(d.data()));
    lastCursor.value = snap.docs[snap.docs.length-1] ?? null;
    hasMore.value = snap.size === PAGE_SIZE;
  } catch (e:any) { errorMsg.value = e?.message ?? String(e); }
  finally { loading.value = false; }
}

async function loadMore() {
  if (!hasMore.value || !lastCursor.value) return;
  loading.value = true;
  try {
    const { parts, orderKey, addPrefix, prefixValue } = buildServerQueryParts();
    let qy = query(collection(db,"items"), orderBy(orderKey), ...(parts as any), startAfter(lastCursor.value), limit(PAGE_SIZE));
    if (addPrefix) {
      const upper = prefixValue + "\uf8ff";
      qy = query(collection(db,"items"), orderBy("itemId"), ...(parts as any), startAt(prefixValue), endAt(upper), startAfter(lastCursor.value), limit(PAGE_SIZE));
    }
    const snap = await getDocs(qy);
    rows.value.push(...snap.docs.map(d => mapDoc(d.data())));
    lastCursor.value = snap.docs[snap.docs.length-1] ?? null;
    hasMore.value = snap.size === PAGE_SIZE;
  } catch (e:any) { errorMsg.value = e?.message ?? String(e); }
  finally { loading.value = false; }
}

/* ---------------- Facet upsert (생성/수정/업로드 시) ---------------- */
async function upsertFacetsFromItem(p: {
  type?: string; line?: string; process?: string; process_tag?: string;
  inch?: number|string; length_mm?: number;
}) {
  const refm = doc(db, "meta", "items_facets");
  const inchNum = Number(typeof p.inch === "string" ? Number(p.inch) : p.inch);
  const lenNum  = Number(p.length_mm ?? 0);
  const payload:any = {};
  if (p.type)        payload.types     = arrayUnion(p.type);
  if (p.line)        payload.lines     = arrayUnion(p.line);
  if (p.process)     payload.processes = arrayUnion(p.process);
  if (p.process_tag) payload.tags      = arrayUnion(p.process_tag);
  if (Number.isFinite(inchNum)) payload.inches  = arrayUnion(inchNum);
  if (Number.isFinite(lenNum))  payload.lengths = arrayUnion(lenNum);
  if (Object.keys(payload).length) {
    try { await updateDoc(refm, payload); }
    catch { await setDoc(refm, payload, { merge: true }); }
  }
}

/* ---------------- Create ---------------- */
watch(createProc, (p) => { createTag.value = p ? tagOf(p) : ""; });
const computedCreateId = computed(() => {
  if (!createType.value || !createLine.value || createInch.value == null || !createTag.value) return "";
  const L = Number(createLen.value ?? 0);
  return buildItemId(createType.value, createLine.value, Number(createInch.value), createTag.value, L);
});
function openCreate() {
  showCreate.value = true;
  if (createLen.value == null) createLen.value = 1000;
}
async function createItem() {
  if (!computedCreateId.value) { alert("필수값을 모두 입력하세요."); return; }
  const inchStr = inchToStr(Number(createInch.value!));
  const L = Number(createLen.value ?? 0);
  const payload: any = {
    itemId: computedCreateId.value,
    type: createType.value,
    line: createLine.value,
    inch: inchStr,
    process_tag: createTag.value,
    process: createProc.value || undefined,
    length_mm: L,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    uom: (TYPE_UOM_MAP.value[createType.value] as any) || 'EA',
    product_level: PROCESS_LEVEL_MAP.value[createProc.value] ?? undefined,
    active: true,
  };
  const ref = doc(db, "items", payload.itemId);
  const exist = await getDoc(ref);
  if (exist.exists() && !confirm("같은 itemId가 있습니다. 덮어쓸까요?")) return;
  await setDoc(ref, payload, { merge: true });

  rows.value.unshift({ ...(payload as ItemRow), inch: Number(createInch.value), created_at: new Date() });
  await upsertFacetsFromItem(payload);
  await loadFacets();

  showCreate.value = false;
  createType.value = createLine.value = ""; createProc.value = createTag.value = ""; createInch.value = null; createLen.value = null;
}

/* ---------------- Edit ---------------- */
function startEdit(r: ItemRow) { editingId.value = r.itemId; editCache.value = { ...r }; }
function cancelEdit() { editingId.value = null; editCache.value = null; }
function onEditProcessChange() {
  if (!editCache.value) return;
  const p = editCache.value.process || "";
  editCache.value.process_tag = tagOf(p) || editCache.value.process_tag;
  editCache.value.product_level = PROCESS_LEVEL_MAP.value[p] ?? editCache.value.product_level;
}
const computedEditId = computed(() => {
  const e = editCache.value; if (!e) return "";
  return buildItemId(e.type, e.line, Number(e.inch), e.process_tag, Number(e.length_mm));
});
async function saveEdit(orig: ItemRow) {
  if (!editCache.value) return;
  const e = editCache.value, newId = computedEditId.value;
  if (!newId) { alert("필수값을 확인하세요."); return; }
  const inchStr = inchToStr(Number(e.inch));
  const newPayload: any = {
    itemId: newId,
    type: e.type,
    line: e.line,
    inch: inchStr,
    process_tag: e.process_tag,
    process: e.process || undefined,
    length_mm: Number(e.length_mm),
    created_at: orig.created_at ?? serverTimestamp(),
    updated_at: serverTimestamp(),
    uom: (TYPE_UOM_MAP.value[e.type] as any) || 'EA',
    product_level: (e.process && PROCESS_LEVEL_MAP.value[e.process] !== undefined)
      ? PROCESS_LEVEL_MAP.value[e.process]
      : e.product_level,
    active: (orig.active ?? true),
  };
  if (newId === orig.itemId) {
    await setDoc(doc(db, "items", newId), newPayload, { merge: true });
    const idx = rows.value.findIndex(x => x.itemId === orig.itemId);
    if (idx >= 0) rows.value[idx] = { ...e, ...newPayload, inch: Number(e.inch) };
  } else {
    const newRef = doc(db, "items", newId);
    const exist = await getDoc(newRef);
    if (exist.exists() && !confirm("변경된 itemId가 이미 존재합니다. 덮어쓸까요?")) return;
    await setDoc(newRef, newPayload, { merge: true });
    await deleteDoc(doc(db, "items", orig.itemId));
    const idx = rows.value.findIndex(x => x.itemId === orig.itemId);
    if (idx >= 0) rows.value.splice(idx, 1, { ...e, ...newPayload, inch: Number(e.inch) });
  }
  await upsertFacetsFromItem(newPayload);
  await loadFacets();
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
  await applyFiltersServerSide(); // 최신 조회 반영
  selectedIds.value.clear();
}

/* ---------------- CSV export/import ---------------- */
function toCSV(records: ItemRow[]) {
  const headers = ["itemId","type","line","inch","process","process_tag","length_mm","product_level","uom","active","created_at","updated_at","has_bom"];
  const esc = (v:any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = records.map(r => [
    r.itemId, r.type, r.line, inchToStr(r.inch), r.process ?? "", r.process_tag, r.length_mm,
    r.product_level ?? "", r.uom ?? "", r.active ?? "",
    formatCreatedAt(r.created_at), formatCreatedAt(r.updated_at), r.has_bom === true ? "true" : ""
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

/* 업로드 (기존 로직) */
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
  const header = arr.shift()!.map(h => h.trim());
  const newHdr = ["itemId","type","line","inch","process","process_tag","length_mm","product_level","uom","active","created_at","updated_at"];
  const oldHdr = ["itemId","type","line","inch","process","process_tag","length_mm","created_at"];

  let mode:"new"|"old"|null = null;
  if (newHdr.every((h,i)=> header[i]===h)) mode = "new";
  else if (oldHdr.every((h,i)=> header[i]===h)) mode = "old";

  if (!mode) {
    alert("CSV 헤더가 올바르지 않습니다.\n허용 헤더(둘 중 하나):\n" + newHdr.join(",") + "\n" + oldHdr.join(","));
    input.value=""; return;
  }

  const batchSize = 400;
  let buf: any[] = [];
  const flush = async () => {
    if (!buf.length) return;
    const batch = writeBatch(db);
    buf.forEach(p => batch.set(doc(db,"items",p.itemId), p, { merge:true }));
    await batch.commit(); buf = [];
  };

  // Facet 누적
  const facetAcc = {
    types: new Set<string>(), lines: new Set<string>(), processes: new Set<string>(),
    tags: new Set<string>(), inches: new Set<number>(), lengths: new Set<number>()
  };

  for (const c of arr) {
    const col = (i:number)=> (c[i] ?? "").trim();
    if (mode === "new") {
      const [id,_type,_line,_inch,_proc,_tag,_len,_lvl,_uom,_active,_created,_updated] = c;
      const inchStr = col(3);
      const inchNum = Number(inchStr);
      const type = col(1), line = col(2);
      const process = col(4) || undefined;
      const process_tag = process ? (tagOf(process) || col(5)) : col(5);
      const length_mm = Number(col(6)) || 0;
      const product_level = col(7) === "" ? undefined : Number(col(7));
      const uom = (col(8) || undefined) as any;
      const active = col(9)==="" ? undefined : (col(9).toLowerCase() === "true" ? true : col(9).toLowerCase() === "false" ? false : undefined);

      let created:any = serverTimestamp();
      if (col(10)) {
        const n = Number(col(10)); const d = isNaN(n) ? new Date(col(10)) : new Date(n);
        if (!isNaN(d.getTime())) created = d;
      }
      let updated:any = serverTimestamp();
      if (col(11)) {
        const n = Number(col(11)); const d = isNaN(n) ? new Date(col(11)) : new Date(n);
        if (!isNaN(d.getTime())) updated = d;
      }

      const itemId = buildItemId(type, line, Number.isFinite(inchNum)?inchNum:0, process_tag, length_mm);
      buf.push({
        itemId, type, line, inch: inchStr || inchToStr(Number(inchNum)),
        process, process_tag, length_mm,
        product_level, uom, active,
        created_at: created, updated_at: updated,
      });

      facetAcc.types.add(type); facetAcc.lines.add(line);
      if (process) facetAcc.processes.add(process);
      facetAcc.tags.add(process_tag);
      const _inchN = Number.isFinite(inchNum)? inchNum : Number(inchStr);
      if (Number.isFinite(_inchN)) facetAcc.inches.add(_inchN as number);
      facetAcc.lengths.add(length_mm);

    } else {
      const [,_type,_line,_inch,_proc,_tag,_len,_created] = c;
      const type = col(1), line = col(2);
      const inchNum = Number(col(3));
      const process = col(4) || undefined;
      const process_tag = process ? (tagOf(process) || col(5)) : col(5);
      const length_mm = Number(col(6)) || 0;

      let created:any = serverTimestamp();
      if (col(7)) {
        const n = Number(col(7)); const d = isNaN(n) ? new Date(col(7)) : new Date(n);
        if (!isNaN(d.getTime())) created = d;
      }

      const itemId = buildItemId(type, line, inchNum, process_tag, length_mm);
      buf.push({
        itemId, type, line, inch: inchToStr(inchNum),
        process, process_tag, length_mm,
        uom: (TYPE_UOM_MAP.value[type] as any) || 'EA',
        product_level: process ? PROCESS_LEVEL_MAP.value[process] : undefined,
        active: true,
        created_at: created, updated_at: serverTimestamp(),
      });

      facetAcc.types.add(type); facetAcc.lines.add(line);
      if (process) facetAcc.processes.add(process);
      facetAcc.tags.add(process_tag);
      if (Number.isFinite(inchNum)) facetAcc.inches.add(inchNum);
      facetAcc.lengths.add(length_mm);
    }

    if (buf.length >= batchSize) await flush();
  }
  await flush();

  // Facet 병합 반영
  await updateDoc(doc(db,"meta","items_facets"), {
    types:     arrayUnion(...Array.from(facetAcc.types)),
    lines:     arrayUnion(...Array.from(facetAcc.lines)),
    processes: arrayUnion(...Array.from(facetAcc.processes)),
    tags:      arrayUnion(...Array.from(facetAcc.tags)),
    inches:    arrayUnion(...Array.from(facetAcc.inches)),
    lengths:   arrayUnion(...Array.from(facetAcc.lengths)),
  }).catch(async ()=> {
    await setDoc(doc(db,"meta","items_facets"), {
      types: Array.from(facetAcc.types),
      lines: Array.from(facetAcc.lines),
      processes: Array.from(facetAcc.processes),
      tags: Array.from(facetAcc.tags),
      inches: Array.from(facetAcc.inches),
      lengths: Array.from(facetAcc.lengths),
    }, { merge:true });
  });

  await loadFacets();
  await applyFiltersServerSide();
  input.value = "";
  alert(`CSV 업로드 완료`);
}
function triggerCSVUpload(){ fileInput.value?.click(); }

/* ---------------- Sort (클라이언트 정렬) ---------------- */
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

/* ---------------- Admin: Facet 재빌드 / 전체 CSV 다운로드 ---------------- */
async function rebuildFacetsAll() {
  if (!confirm("전수 스캔으로 Facet을 재구성합니다. 시간이 걸릴 수 있어요.")) return;
  const acc = {
    types:new Set<string>(), lines:new Set<string>(), processes:new Set<string>(),
    tags:new Set<string>(), inches:new Set<number>(), lengths:new Set<number>()
  };

  let last:any = null;
  const page = 1000;
  while (true) {
    const qy = last
      ? query(collection(db,"items"), orderBy("itemId"), startAfter(last), limit(page))
      : query(collection(db,"items"), orderBy("itemId"), limit(page));
    const snap = await getDocs(qy);
    if (snap.empty) break;
    snap.docs.forEach(d => {
      const x = d.data() as any;
      if (x.type) acc.types.add(x.type);
      if (x.line) acc.lines.add(x.line);
      if (x.process) acc.processes.add(x.process);
      if (x.process_tag) acc.tags.add(x.process_tag);
      const inchN = Number(x.inch ?? x.inch_str ?? x.inchNum);
      if (Number.isFinite(inchN)) acc.inches.add(inchN);
      const lenN = Number(x.length_mm ?? 0);
      if (Number.isFinite(lenN)) acc.lengths.add(lenN);
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < page) break;
  }

  await setDoc(doc(db,"meta","items_facets"), {
    types: Array.from(acc.types).sort(),
    lines: Array.from(acc.lines).sort(),
    processes: Array.from(acc.processes).sort(),
    tags: Array.from(acc.tags).sort(),
    inches: Array.from(acc.inches).sort((a,b)=>a-b),
    lengths: Array.from(acc.lengths).sort((a,b)=>a-b),
  }, { merge:true });

  await loadFacets();
  alert("Facet 재빌드 완료");
}

async function downloadAllItemsCSV() {
  if (!confirm("items 전체 컬렉션을 CSV로 내려받습니다. 진행할까요?")) return;
  const buf: ItemRow[] = [];
  let last:any = null;
  const page = 1000;
  while (true) {
    const qy = last
      ? query(collection(db,"items"), orderBy("itemId"), startAfter(last), limit(page))
      : query(collection(db,"items"), orderBy("itemId"), limit(page));
    const snap = await getDocs(qy);
    if (snap.empty) break;
    buf.push(...snap.docs.map(d => mapDoc(d.data())));
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < page) break;
  }
  download(`items_all_${new Date().toISOString().slice(0,19)}.csv`, toCSV(buf));
}

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
        <span class="text-sm text-gray-600">표시: <b>{{ filtered.length }}</b> / 로드 {{ rows.length }}개</span>

        <button type="button" class="btn" @click="loadInitial" :disabled="loading">초기 1,000개</button>
        <button type="button" class="btn" @click="applyFiltersServerSide" :disabled="loading">필터 적용(서버 조회)</button>
        <button type="button" class="btn" @click="loadMore" :disabled="loading || !hasMore">더 보기</button>

        <button type="button" class="btn-outline blue"
                @click="exportSelectedCSV" :disabled="!selectedRows.length">
          CSV 내보내기(선택)
        </button>

        <button type="button" class="btn-outline blue" @click="triggerCSVUpload">CSV 올리기</button>
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="file-hidden" @change="onCSVChoose"/>

        <button type="button" class="btn-rose"
                @click="deleteSelected" :disabled="!selectedRows.length">선택 삭제</button>

        <button type="button" class="btn-blue" @click="openCreate">+ 새 항목</button>

        <button type="button" class="btn" @click="resetAll">필터 초기화</button>

        <!-- Admin: Facet 재빌드 & 전체 CSV -->
        <button type="button" class="btn" @click="rebuildFacetsAll">Facet 재빌드</button>
        <button type="button" class="btn" @click="downloadAllItemsCSV">CSV 전체 다운로드</button>
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
          <col style="width:7rem"/>
          <col style="width:7rem"/>
          <col style="width:5.5rem"/>
          <col style="width:7rem"/>
          <col style="width:10rem"/>
          <col style="width:6rem"/>   <!-- BOM -->
          <col style="width:9rem"/>
          <col style="width:13rem"/>
          <col style="width:8.5rem"/>
        </colgroup>

        <thead>
          <tr class="sticky top-0 z-20 bg-gray-50 h-12 select-none">
            <th class="th th-center">
              <input type="checkbox" :checked="allChecked" @change="allChecked = ($event.target as HTMLInputElement).checked"/>
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
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('process_tag')">
              tag <span v-if="sortKey==='process_tag'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('process')">
              process <span v-if="sortKey==='process'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('length_mm')">
              length (mm) <span v-if="sortKey==='length_mm'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>
            <th class="th th-center">BOM</th>
            <th class="th th-center cursor-pointer hover:bg-gray-100" @click="toggleSort('created_at')">
              created_at <span v-if="sortKey==='created_at'">{{ sortDir==='asc'?'▲':'▼' }}</span>
            </th>

            <th class="th th-center">액션</th>
          </tr>

          <!-- 2줄: 필터 -->
          <tr class="sticky top-12 z-10 bg-white border-b">
            <th></th>

            <th class="filter-cell">
              <input v-model="fSearch" placeholder="itemId prefix 검색(옵션)"
                     class="input w-[16rem] mx-auto block"/>
            </th>

            <th class="filter-cell">
              <details class="relative inline-block">
                <summary class="select-like mx-auto">{{ fTypes.length ? fTypes.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fTypeOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fTypes" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <th class="filter-cell">
              <details class="relative inline-block">
                <summary class="select-like mx-auto">{{ fLines.length ? fLines.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fLineOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fLines" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <th class="filter-cell">
              <details class="relative inline-block">
                <summary class="select-like mx-auto">{{ fInches.length ? fInches.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fInchOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fInches" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <th class="filter-cell">
              <details class="relative inline-block">
                <summary class="select-like mx-auto">{{ fTags.length ? fTags.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fTagOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fTags" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <th class="filter-cell">
              <details class="relative inline-block">
                <summary class="select-like mx-auto">{{ fProcesses.length ? fProcesses.join(", ") : "전체" }}</summary>
                <div class="dd">
                  <label v-for="v in fProcessOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fProcesses" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <th class="filter-cell">
              <details class="relative inline-block">
                <summary class="select-like mx-auto">{{ lengthSummary }}</summary>
                <div class="dd">
                  <label v-for="v in fLengthOpts" :key="v" class="flex items-center gap-2 h-8 leading-8 text-sm">
                    <input type="checkbox" :value="v" v-model="fLens" class="h-4 w-4"/> <span>{{ v }}</span>
                  </label>
                </div>
              </details>
            </th>

            <!-- BOM 상태 필터 -->
            <th class="filter-cell">
              <select v-model="fBom" class="input w-[8rem] mx-auto block">
                <option value="all">전체</option>
                <option value="missing">BOM 없음</option>
                <option value="present">BOM 있음</option>
              </select>
            </th>

            <th class="filter-cell">
              <input type="datetime-local" v-model="fCreatedSince" class="input w-[12rem] mx-auto block"/>
            </th>

            <th></th>
          </tr>
        </thead>

        <tbody class="[&>tr:nth-child(odd)]:bg-gray-50">
          <tr v-for="r in sorted" :key="r.itemId" class="border-b hover:bg-blue-50/50">
            <template v-if="editingId !== r.itemId">
              <td class="px-3 py-2">
                <input type="checkbox"
                  :checked="selectedIds.has(r.itemId)"
                  @change="(ev: Event)=>{ const c = (ev.target as HTMLInputElement).checked; c?selectedIds.add(r.itemId):selectedIds.delete(r.itemId) }"/>
              </td>

              <td class="px-3 py-2 font-mono text-[12.5px]">{{ r.itemId }}</td>
              <td class="px-3 py-2 text-center">{{ r.type }}</td>
              <td class="px-3 py-2 text-center">{{ r.line }}</td>
              <td class="px-3 py-2 text-center">{{ r.inch }}</td>
              <td class="px-3 py-2 text-center">{{ r.process_tag }}</td>
              <td class="px-3 py-2 text-center">{{ r.process || '—' }}</td>
              <td class="px-3 py-2 text-center">
                <template v-if="Number(r.length_mm) > 0">
                  {{ r.length_mm }}
                </template>
                <template v-else>
                  <span class="uom-badge">{{ r.uom || 'EA' }}</span>
                </template>
              </td>

              <!-- BOM 표시(Y/N) -->
              <td class="px-3 py-2 text-center">
                <span class="uom-badge" :class="r.has_bom===true ? 'bg-green-50' : 'bg-red-50'">
                  {{ r.has_bom === true ? 'Y' : 'N' }}
                </span>
              </td>

              <td class="px-3 py-2 text-center">{{ fmtCreatedShort(r.created_at) }}</td>
              <td class="px-3 py-2">
                <div class="flex gap-2 justify-center">
                  <button type="button" class="btn" @click="startEdit(r)">수정</button>
                  <button type="button" class="btn" @click="removeItem(r)">삭제</button>
                </div>
              </td>
            </template>

            <template v-else>
              <td class="px-3 py-2"><input type="checkbox" disabled/></td>
              <td class="px-3 py-2 font-mono text-[12.5px] no-wrap">{{ computedEditId }}</td>
              <td class="px-3 py-2">
                <select v-model="editCache!.type" class="input w-full">
                  <option v-for="t in TYPE_CODES" :key="t" :value="t">{{ t }}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <select v-model="editCache!.line" class="input w-full">
                  <option v-for="l in LINE_CODES" :key="l" :value="l">{{ l }}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <input type="number" step="0.25" v-model.number="editCache!.inch" class="input compact-input"/>
              </td>
              <td class="px-3 py-2 text-center text-gray-400">{{ editCache!.process_tag }}</td>
              <td class="px-3 py-2">
                <div class="proc-wrap">
                  <select v-model="editCache!.process" @change="onEditProcessChange" class="input">
                    <option value="" disabled>선택</option>
                    <option v-for="p in PROCESS_CODES" :key="p" :value="p">{{ p }}</option>
                  </select>
                </div>
              </td>
              <td class="px-3 py-2">
                <input type="number" v-model.number="editCache!.length_mm" class="input w-full"/>
              </td>

              <td class="px-3 py-2 text-center">
                <span class="uom-badge">{{ (editCache!.has_bom===true) ? 'Y' : 'N' }}</span>
              </td>

              <td class="px-3 py-2 text-center no-wrap">{{ fmtCreatedShort(editCache!.created_at) }}</td>
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

      <datalist id="typeList"><option v-for="t in TYPE_CODES" :key="t" :value="t" /></datalist>
      <datalist id="lineList"><option v-for="l in LINE_CODES" :key="l" :value="l" /></datalist>
    </div>
  </section>
</template>

<style scoped>
:where(button, input, select) { all: revert; font: inherit; }
.btn { display:inline-flex; align-items:center; border:1px solid #d1d5db; background:#fff;
  padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s;}
.btn:hover { background:#f9fafb; } .btn:active { transform:scale(.98); }
.btn-blue { display:inline-flex; align-items:center; border:1px solid #2563eb; background:#2563eb; color:#fff;
  padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s;}
.btn-blue:hover { background:#1d4ed8; }
.btn-rose { display:inline-flex; align-items:center; border:1px solid #e11d48; background:#e11d48; color:#fff;
  padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s;}
.btn-rose:hover { background:#be123c; }
.btn-outline.blue { display:inline-flex; align-items:center; border:1px solid #93c5fd; background:#fff; color:#1d4ed8;
  padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s;}
.btn-outline.blue:hover { background:#eff6ff; }

.th { padding:.5rem .75rem; color:#374151; border-bottom:1px solid #e5e7eb; font-weight:600; }
.th-center { text-align:center; }
.filter-cell { padding:.5rem .75rem; text-align:center; }

.input { border:1px solid #d1d5db; border-radius:.5rem; padding:.375rem .5rem; outline:none; box-sizing:border-box; }
.input:focus { box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }

.select-like { display:inline-flex; align-items:center; height:2.25rem; border:1px solid #d1d5db; border-radius:0.5rem; padding:0 0.75rem; background:#fff; color:#374151; cursor:pointer; user-select:none; }
.dd { position: absolute; left: 0; top: 100%; margin-top: 4px; width: 14rem; max-height: 14rem; overflow: auto;
  background: #fff; border: 1px solid #e5e7eb; border-radius: .75rem; padding: .5rem; box-shadow: 0 10px 24px rgba(0,0,0,.08); z-index: 50; }

.uom-badge { display:inline-flex; align-items:center; justify-content:center; padding:.25rem .5rem; border-radius:.5rem;
  background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace; font-size:.8rem; white-space:nowrap; }
.no-wrap { white-space:nowrap; }

.file-hidden{ position:absolute !important; left:-9999px !important; width:1px !important; height:1px !important; overflow:hidden !important; clip:rect(0 0 0 0) !important; white-space:nowrap !important; opacity:0 !important; }
.compact-input { width: 6rem !important; text-align: center; }
.proc-wrap { display: inline-flex; align-items: center; gap: .5rem; flex-wrap: wrap; justify-content: center; }
</style>
