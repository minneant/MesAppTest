<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { db } from "@/firebase";
import {
  collection, getDocs, orderBy, query, limit,
  doc, setDoc, getDoc, deleteDoc, serverTimestamp, writeBatch
} from "firebase/firestore";
import { useMasters } from "@/composables/useMasters";

/* ---------------- Types ---------------- */
type BomRow = {
  id: string;            // docId = parentId__childId
  parentId: string;
  childId: string;
  qtyPerParent: number;
  uomParent: string;
  uomChild: string;
  created_at?: any;
  updated_at?: any;
};

/* ---------------- Masters (types -> uom) ---------------- */
const { types } = useMasters();
const TYPE_UOM_MAP = computed<Record<string,string>>(()=>{
  const m: Record<string,string> = {};
  (types.value || []).forEach((t:any)=>{ if (t?.code) m[t.code] = t.uom || "EA"; });
  return m;
});
const typeOfItemId = (itemId: string) => (itemId || "").split("_")[0] || "";
const uomOfItemId  = (itemId: string) => TYPE_UOM_MAP.value[typeOfItemId(itemId)] || "EA";

/* ---------------- State ---------------- */
const rows = ref<BomRow[]>([]);
const loading = ref(false);
const errorMsg = ref("");

/* Filters & table state */
const fSearch = ref("");
const selectedIds = ref<Set<string>>(new Set());

const filtered = computed(() => {
  const s = (fSearch.value || "").toLowerCase().trim();
  if (!s) return rows.value;
  return rows.value.filter(r =>
    r.id.toLowerCase().includes(s) ||
    r.parentId.toLowerCase().includes(s) ||
    r.childId.toLowerCase().includes(s)
  );
});

/* Sort */
type SortKey = "id"|"parentId"|"childId"|"qtyPerParent"|"uomParent"|"uomChild";
const sortKey = ref<SortKey>("id");
const sortDir = ref<"asc"|"desc">("asc");
function toggleSort(k: SortKey) {
  if (sortKey.value === k) sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
  else { sortKey.value = k; sortDir.value = "asc"; }
}
const sorted = computed(() => {
  const arr = [...filtered.value];
  const dir = sortDir.value === "asc" ? 1 : -1;
  const k = sortKey.value;
  return arr.sort((a,b)=>{
    const va: any = (a as any)[k]; const vb: any = (b as any)[k];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
});

/* Select all */
const allChecked = computed({
  get() {
    const ids = filtered.value.map(r => r.id);
    return ids.length > 0 && ids.every(id => selectedIds.value.has(id));
  },
  set(v: boolean) {
    const ids = filtered.value.map(r => r.id);
    if (v) ids.forEach(id => selectedIds.value.add(id));
    else ids.forEach(id => selectedIds.value.delete(id));
  }
});

/* ---------------- Load ---------------- */
onMounted(load);
async function load() {
  loading.value = true; errorMsg.value = "";
  try {
    const qy = query(collection(db,"bom"), orderBy("parentId"), limit(10000));
    const snap = await getDocs(qy);
    rows.value = snap.docs.map(d => {
      const x = d.data() as any;
      return {
        id: d.id,
        parentId: String(x.parentId || ""),
        childId: String(x.childId || ""),
        qtyPerParent: Number(x.qtyPerParent ?? 0) || 0,
        uomParent: String(x.uomParent || "EA"),
        uomChild: String(x.uomChild || "EA"),
        created_at: x.created_at,
        updated_at: x.updated_at,
      } as BomRow;
    });
  } catch (e:any) {
    errorMsg.value = e?.message ?? String(e);
  } finally {
    loading.value = false;
  }
}

/* ---------------- Create ---------------- */
const showCreate = ref(false);
const c_parentId = ref("");
const c_childId = ref("");
const c_qty = ref<number | null>(1);

const c_docId = computed(()=> `${(c_parentId.value||"").trim()}__${(c_childId.value||"").trim()}`);
const c_uomParent = computed(()=> uomOfItemId(c_parentId.value));
const c_uomChild  = computed(()=> uomOfItemId(c_childId.value));

function openCreate(){ showCreate.value = true; }
async function createBom() {
  const parentId = c_parentId.value.trim();
  const childId  = c_childId.value.trim();
  const qty = Number(c_qty.value ?? 0);
  if (!parentId || !childId || !(qty>0)) { alert("parentId, childId, qtyPerParent(>0)을 확인하세요."); return; }

  const id = `${parentId}__${childId}`;
  const ref = doc(db, "bom", id);
  const exist = await getDoc(ref);
  if (exist.exists() && !confirm("동일한 문서가 있습니다. 덮어쓸까요?")) return;

  const payload: BomRow = {
    id, parentId, childId, qtyPerParent: qty,
    uomParent: c_uomParent.value, uomChild: c_uomChild.value,
    created_at: serverTimestamp(), updated_at: serverTimestamp(),
  } as any;

  await setDoc(ref, payload, { merge: true });
  rows.value.unshift({ ...payload, created_at: new Date() });
  showCreate.value = false;
  c_parentId.value = ""; c_childId.value = ""; c_qty.value = 1;
}

/* ---------------- Edit ---------------- */
const editingId = ref<string | null>(null);
const editCache = ref<BomRow | null>(null);

function startEdit(r: BomRow) { editingId.value = r.id; editCache.value = { ...r }; }
function cancelEdit() { editingId.value = null; editCache.value = null; }
function onEditParentChange() { if (editCache.value) editCache.value.uomParent = uomOfItemId(editCache.value.parentId); }
function onEditChildChange()  { if (editCache.value) editCache.value.uomChild  = uomOfItemId(editCache.value.childId); }

async function saveEdit(orig: BomRow) {
  if (!editCache.value) return;
  const e = editCache.value;
  const parentId = e.parentId.trim();
  const childId  = e.childId.trim();
  const qty = Number(e.qtyPerParent ?? 0);
  if (!parentId || !childId || !(qty>0)) { alert("필수값을 확인하세요."); return; }

  const newId = `${parentId}__${childId}`;
  const payload = {
    parentId, childId, qtyPerParent: qty,
    uomParent: uomOfItemId(parentId),
    uomChild:  uomOfItemId(childId),
    created_at: orig.created_at ?? serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  if (newId === orig.id) {
    await setDoc(doc(db,"bom", newId), payload, { merge: true });
    const idx = rows.value.findIndex(r => r.id === orig.id);
    if (idx >= 0) rows.value[idx] = { id:newId, ...payload } as any;
  } else {
    const newRef = doc(db,"bom", newId);
    const exist = await getDoc(newRef);
    if (exist.exists() && !confirm("변경된 문서ID가 이미 존재합니다. 덮어쓸까요?")) return;
    await setDoc(newRef, payload, { merge: true });
    await deleteDoc(doc(db,"bom", orig.id));
    const idx = rows.value.findIndex(r => r.id === orig.id);
    if (idx >= 0) rows.value.splice(idx, 1, { id:newId, ...payload } as any);
  }

  editingId.value = null; editCache.value = null;
}

/* ---------------- Delete ---------------- */
async function removeOne(r: BomRow) {
  if (!confirm(`삭제할까요?\n${r.id}`)) return;
  await deleteDoc(doc(db,"bom", r.id));
  const idx = rows.value.findIndex(x => x.id === r.id);
  if (idx >= 0) rows.value.splice(idx, 1);
  selectedIds.value.delete(r.id);
}
async function deleteSelected() {
  const ids = Array.from(selectedIds.value);
  if (!ids.length) { alert("선택된 항목이 없습니다."); return; }
  if (!confirm(`선택 ${ids.length}건을 삭제할까요?`)) return;
  for (let i=0;i<ids.length;i+=450) {
    const batch = writeBatch(db);
    ids.slice(i,i+450).forEach(id => batch.delete(doc(db,"bom", id)));
    await batch.commit();
  }
  await load(); selectedIds.value.clear();
}

/* ---------------- CSV export/import ---------------- */
function toCSV(records: BomRow[]) {
  const headers = ["id","parentId","childId","qtyPerParent","uomParent","uomChild","created_at","updated_at"];
  const esc = (v:any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  };
  const lines = records.map(r => [
    r.id, r.parentId, r.childId, r.qtyPerParent, r.uomParent, r.uomChild,
    r.created_at ? new Date(r.created_at?.toDate?.() ?? r.created_at).toISOString() : "",
    r.updated_at ? new Date(r.updated_at?.toDate?.() ?? r.updated_at).toISOString() : ""
  ].map(esc).join(","));
  return [headers.join(","), ...lines].join("\n");
}
function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
const fileInput = ref<HTMLInputElement | null>(null);
function exportSelectedCSV() {
  const sel = rows.value.filter(r => selectedIds.value.has(r.id));
  if (!sel.length) { alert("선택된 항목이 없습니다."); return; }
  download(`bom_selected_${new Date().toISOString().slice(0,19)}.csv`, toCSV(sel));
}

/* CSV 파서 (따옴표/줄바꿈 대응) */
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
  const hdr = ["id","parentId","childId","qtyPerParent","uomParent","uomChild","created_at","updated_at"];
  if (!hdr.every((h,i)=> header[i]===h)) {
    alert("CSV 헤더가 올바르지 않습니다.\n" + hdr.join(","));
    input.value=""; return;
  }

  // upsert in batches
  const batchSize = 400;
  let buf:any[]=[];
  const flush = async ()=>{
    if (!buf.length) return;
    const batch = writeBatch(db);
    buf.forEach(p => batch.set(doc(db,"bom",p.id), p, { merge:true }));
    await batch.commit(); buf = [];
  };

  for (const c of arr) {
    const col = (i:number)=> (c[i] ?? "").trim();
    const id = col(0), parentId = col(1), childId = col(2);
    const qty = Number(col(3)) || 0;
    const up = col(4) || uomOfItemId(parentId);
    const uc = col(5) || uomOfItemId(childId);

    let created:any = serverTimestamp();
    if (col(6)) {
      const n = Number(col(6)); const d = isNaN(n) ? new Date(col(6)) : new Date(n);
      if (!isNaN(d.getTime())) created = d;
    }
    let updated:any = serverTimestamp();
    if (col(7)) {
      const n = Number(col(7)); const d = isNaN(n) ? new Date(col(7)) : new Date(n);
      if (!isNaN(d.getTime())) updated = d;
    }

    if (!id || !parentId || !childId || !(qty>0)) continue;

    buf.push({
      id, parentId, childId,
      qtyPerParent: qty, uomParent: up, uomChild: uc,
      created_at: created, updated_at: updated
    });

    if (buf.length >= batchSize) await flush();
  }
  await flush();
  await load(); input.value = "";
  alert("CSV 업로드 완료");
}
function triggerCSVUpload(){ fileInput.value?.click(); }

/* ---------------- close details on outside ---------------- */
function closeAllDetails(e?: Event) {
  const opens = document.querySelectorAll("details[open]");
  opens.forEach((d:any) => {
    if (e && e.target instanceof Node && d.contains(e.target)) return;
    d.open = false;
  });
}
function onDocClick(e: MouseEvent) { closeAllDetails(e); }
function onEsc(e: KeyboardEvent) { if (e.key === "Escape") closeAllDetails(); }
onMounted(()=>{ document.addEventListener("click", onDocClick, true); document.addEventListener("keydown", onEsc, true); });
onUnmounted(()=>{ document.removeEventListener("click", onDocClick, true); document.removeEventListener("keydown", onEsc, true); });
</script>

<template>
  <section class="p-4 grid gap-3">
    <!-- Top bar -->
    <header class="sticky top-0 z-30 bg-white/90 backdrop-blur pb-2 flex items-center justify-between">
      <h2 class="text-lg font-semibold">BOM 관리</h2>
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">표시: <b>{{ filtered.length }}</b> / 전체 {{ rows.length }}</span>

        <button type="button" class="btn" @click="load" :disabled="loading">새로고침</button>

        <button type="button" class="btn-outline blue"
                @click="exportSelectedCSV" :disabled="!selectedIds.size">
          CSV 내보내기(선택)
        </button>

        <button type="button" class="btn-outline blue" @click="triggerCSVUpload">CSV 올리기</button>
        <input ref="fileInput" type="file" accept=".csv,text/csv" class="file-hidden" @change="onCSVChoose"/>

        <button type="button" class="btn-rose"
                @click="deleteSelected" :disabled="!selectedIds.size">선택 삭제</button>

        <button type="button" class="btn-blue" @click="openCreate">+ 새 항목</button>

        <input v-model="fSearch" placeholder="id/parent/child 검색" class="input ml-2 w-[18rem]" />
      </div>
    </header>

    <div v-if="errorMsg" class="text-red-600 text-sm">{{ errorMsg }}</div>
    <div v-else-if="loading" class="py-3">불러오는 중…</div>

    <!-- Flex Table -->
    <div v-else class="card">
      <!-- Header row -->
      <div class="row head">
        <div class="cell chk">
          <input type="checkbox" :checked="allChecked" @change="allChecked = ($event.target as HTMLInputElement).checked"/>
        </div>

        <button class="cell hdr id"       @click="toggleSort('id')">문서id <span v-if="sortKey==='id'">{{ sortDir==='asc'?'▲':'▼' }}</span></button>
        <button class="cell hdr parentId" @click="toggleSort('parentId')">parentId <span v-if="sortKey==='parentId'">{{ sortDir==='asc'?'▲':'▼' }}</span></button>
        <button class="cell hdr childId"  @click="toggleSort('childId')">childId <span v-if="sortKey==='childId'">{{ sortDir==='asc'?'▲':'▼' }}</span></button>
        <button class="cell hdr qty"      @click="toggleSort('qtyPerParent')">qtyPerParent <span v-if="sortKey==='qtyPerParent'">{{ sortDir==='asc'?'▲':'▼' }}</span></button>
        <button class="cell hdr uomP"     @click="toggleSort('uomParent')">uomParent <span v-if="sortKey==='uomParent'">{{ sortDir==='asc'?'▲':'▼' }}</span></button>
        <button class="cell hdr uomC"     @click="toggleSort('uomChild')">uomChild <span v-if="sortKey==='uomChild'">{{ sortDir==='asc'?'▲':'▼' }}</span></button>
        <div class="cell hdr actions">액션</div>
      </div>

      <!-- Body rows -->
      <div v-for="r in sorted" :key="r.id" class="row body" role="row">
        <template v-if="editingId !== r.id">
          <div class="cell chk">
            <input type="checkbox"
              :checked="selectedIds.has(r.id)"
              @change="(ev: Event)=>{ const c=(ev.target as HTMLInputElement).checked; c?selectedIds.add(r.id):selectedIds.delete(r.id) }"/>
          </div>

          <div class="cell id mono ellipsis" :title="r.id">{{ r.id }}</div>
          <div class="cell parentId mono ellipsis" :title="r.parentId">{{ r.parentId }}</div>
          <div class="cell childId mono ellipsis" :title="r.childId">{{ r.childId }}</div>
          <div class="cell qty">{{ r.qtyPerParent }}</div>
          <div class="cell uomP"><span class="uom-badge">{{ r.uomParent }}</span></div>
          <div class="cell uomC"><span class="uom-badge">{{ r.uomChild }}</span></div>

          <div class="cell actions gap-2">
            <button type="button" class="btn" @click="startEdit(r)">수정</button>
            <button type="button" class="btn" @click="removeOne(r)">삭제</button>
          </div>
        </template>

        <template v-else>
          <div class="cell chk"><input type="checkbox" disabled/></div>

          <div class="cell id mono ellipsis" :title="`${editCache!.parentId}__${editCache!.childId}`">
            {{ `${editCache!.parentId}__${editCache!.childId}` }}
          </div>

          <div class="cell parentId">
            <input v-model="editCache!.parentId" class="input mono w-full" @input="onEditParentChange"/>
          </div>

          <div class="cell childId">
            <input v-model="editCache!.childId" class="input mono w-full" @input="onEditChildChange"/>
          </div>

          <div class="cell qty">
            <input type="number" min="0" step="1" v-model.number="editCache!.qtyPerParent" class="input text-center w-full"/>
          </div>

          <div class="cell uomP"><span class="uom-badge">{{ uomOfItemId(editCache!.parentId) }}</span></div>
          <div class="cell uomC"><span class="uom-badge">{{ uomOfItemId(editCache!.childId) }}</span></div>

          <div class="cell actions gap-2">
            <button type="button" class="btn-blue" @click="saveEdit(r)">저장</button>
            <button type="button" class="btn" @click="cancelEdit">취소</button>
          </div>
        </template>
      </div>
    </div>

    <!-- Create modal -->
    <div v-if="showCreate" class="fixed inset-0 z-[9999] bg-black/40 flex items-start justify-center p-6">
      <div class="w-[min(720px,92vw)] max-h-[80vh] overflow-auto rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-base font-semibold">새 BOM 추가</h3>
          <button type="button" class="btn" @click="showCreate = false">닫기</button>
        </div>

        <div class="grid grid-cols-2 gap-3 my-2">
          <label class="text-sm text-gray-600">parentId
            <input v-model="c_parentId" class="mt-1 input w-full font-mono" />
          </label>
          <label class="text-sm text-gray-600">childId
            <input v-model="c_childId" class="mt-1 input w-full font-mono" />
          </label>

          <label class="text-sm text-gray-600">qtyPerParent
            <input type="number" min="0" step="1" v-model.number="c_qty" class="mt-1 input w-full"/>
          </label>

          <label class="text-sm text-gray-600">docId (자동 미리보기)
            <input :value="c_docId" class="mt-1 input w-full font-mono bg-gray-50 border-gray-200" readonly />
          </label>

          <div class="col-span-2 grid grid-cols-2 gap-3">
            <div class="text-sm text-gray-600">uomParent
              <div class="mt-1 uom-badge inline-block">{{ c_uomParent }}</div>
            </div>
            <div class="text-sm text-gray-600">uomChild
              <div class="mt-1 uom-badge inline-block">{{ c_uomChild }}</div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-3">
          <button type="button" class="btn-blue" @click="createBom">추가</button>
          <button type="button" class="btn" @click="showCreate = false">닫기</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
:where(button, input, select) { all: revert; font: inherit; }

/* 카드(테이블 컨테이너) */
.card{
  border:1px solid #e5e7eb; border-radius:12px; background:#fff;
  overflow:hidden; /* 라운드 유지 */
}

/* 행/셀: 전부 flex */
.row{
  display:flex; align-items:center; width:100%;
}
.row.head{
  position:sticky; top:0; z-index:20;
  background:#f9fafb; border-bottom:1px solid #e5e7eb;
}
.row.body{ border-top:1px solid #f3f4f6; }
.row.body:hover{ background: rgba(37,99,235,.06); }

/* 셀 공통 */
.cell{
  min-width:0;                /* 자식이 말줄임 되려면 필수 */
  padding:.5rem .75rem;
  display:flex; align-items:center; justify-content:flex-start;
  gap:8px; height:2.75rem;    /* 헤더/바디 동일 높이 */
  box-sizing:border-box;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

/* 헤더 셀(버튼) */
.cell.hdr{
  background:transparent; border:none; cursor:pointer; user-select:none;
  font-weight:600; color:#374151; justify-content:center;
}
.cell.hdr:hover{ background:#eef2ff; }

/* 체크박스 칼럼은 고정폭 */
.cell.chk{ flex:0 0 40px; justify-content:center; }

/* 칼럼 비율(원하는 비율로 조정 가능) */
.cell.id       { flex: 2.2 1 0; }
.cell.parentId { flex: 1.6 1 0; }
.cell.childId  { flex: 1.6 1 0; }
.cell.qty      { flex: 0.8 1 0; justify-content:center; }
.cell.uomP     { flex: 0.8 1 0; justify-content:center; }
.cell.uomC     { flex: 0.8 1 0; justify-content:center; }
.cell.actions  { flex: 1.0 1 0; justify-content:center; }

/* 아주 작은 화면에서 액션칸이 너무 커지면 약간 축소 */
@media (max-width: 920px){
  .cell.actions{ flex: .8 1 0; }
}

/* 입력박스(수정 모드) */
.input{
  border:1px solid #d1d5db; border-radius:.5rem;
  padding:.375rem .5rem; outline:none; box-sizing:border-box; height:2.25rem;
  width:100%; min-width:0; /* flex 안에서 축소 허용 */
}
.input:focus{ box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }

/* 모노스페이스 + 말줄임 */
.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace; }
.ellipsis{ overflow:hidden; text-overflow:ellipsis; }

/* 버튼 */
.btn {
  display:inline-flex; align-items:center;
  border:1px solid #d1d5db; background:#fff;
  padding:.45rem 1rem; border-radius:.5rem; font-size:.875rem;
  transition:.15s;
}
.btn:hover { background:#f9fafb; }
.btn:active { transform:scale(.98); }

.btn-blue {
  display:inline-flex; align-items:center;
  border:1px solid #2563eb; background:#2563eb; color:#fff;
  padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem;
  transition:.15s;
}
.btn-blue:hover { background:#1d4ed8; }

.btn-rose {
  display:inline-flex; align-items:center;
  border:1px solid #e11d48; background:#e11d48; color:#fff;
  padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem;
  transition:.15s;
}
.btn-rose:hover { background:#be123c; }

.btn-outline.blue {
  display:inline-flex; align-items:center;
  border:1px solid #93c5fd; background:#fff; color:#1d4ed8;
  padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem;
  transition:.15s;
}
.btn-outline.blue:hover { background:#eff6ff; }

/* 파일 input 숨김 */
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

/* badge */
.uom-badge {
  display:inline-flex; align-items:center; justify-content:center;
  padding:.18rem .5rem; border-radius:.5rem;
  background:#f3f4f6; color:#374151; border:1px solid #e5e7eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
  font-size:.8rem; white-space:nowrap;
}
</style>
