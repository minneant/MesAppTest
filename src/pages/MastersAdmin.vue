<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { db } from "@/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

/* ---------------- Types ---------------- */
type MasterEntry = { code: string; label?: string; enabled?: boolean; order?: number | null };
type ProcessEntry = MasterEntry & { tag?: string };
type Kind = "types" | "lines" | "processes";

/* ---------------- State ---------------- */
const types = ref<MasterEntry[]>([]);
const lines = ref<MasterEntry[]>([]);
const processes = ref<ProcessEntry[]>([]);

const chosenFileName = ref<{[K in Kind]?: string}>({ types: "선택된 파일 없음", lines: "선택된 파일 없음", processes: "선택된 파일 없음" });

let unsubs: Array<() => void> = [];

/* ---------------- Load (live) ---------------- */
onMounted(() => {
  const u1 = onSnapshot(doc(db, "masters", "types"), snap => {
    const list = (snap.data()?.list ?? []) as MasterEntry[];
    types.value = normalizeList(list);
  });
  const u2 = onSnapshot(doc(db, "masters", "lines"), snap => {
    const list = (snap.data()?.list ?? []) as MasterEntry[];
    lines.value = normalizeList(list);
  });
  const u3 = onSnapshot(doc(db, "masters", "processes"), snap => {
    const list = (snap.data()?.list ?? []) as ProcessEntry[];
    processes.value = normalizeProcList(list);
  });
  unsubs = [u1, u2, u3];
});
onUnmounted(() => unsubs.forEach(u => u()));

/* ---------------- Helpers ---------------- */
function sortByOrder<T extends MasterEntry>(a: T, b: T) {
  const ao = a.order ?? 999999, bo = b.order ?? 999999;
  return ao !== bo ? ao - bo : (a.code || "").localeCompare(b.code || "");
}
function normalizeList(list: MasterEntry[]) {
  return [...list].map(v => ({
    code: v.code ?? "",
    label: v.label ?? v.code ?? "",
    enabled: v.enabled !== false,
    order: v.order ?? null
  })).sort(sortByOrder);
}
function normalizeProcList(list: ProcessEntry[]) {
  return [...list].map(v => ({
    code: v.code ?? "",
    label: v.label ?? v.code ?? "",
    tag: v.tag ?? "",
    enabled: v.enabled !== false,
    order: v.order ?? null
  })).sort(sortByOrder);
}
function nextOrder(arr: MasterEntry[]) {
  const nums = arr.map(v => v.order ?? 0);
  return (nums.length ? Math.max(...nums) : 0) + 10;
}

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
    setDoc(doc(db, "masters", "processes"), { list: processes.value }, { merge: true })
  ]);
  alert("모두 저장 완료");
}

/* Add / Remove rows */
function addRow(kind: Kind) {
  if (kind === "types") {
    types.value.push({ code: "", label: "", enabled: true, order: nextOrder(types.value) });
  } else if (kind === "lines") {
    lines.value.push({ code: "", label: "", enabled: true, order: nextOrder(lines.value) });
  } else {
    processes.value.push({ code: "", label: "", tag: "", enabled: true, order: nextOrder(processes.value) });
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
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function esc(v:any) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function toCSV(kind: Kind): string {
  if (kind === "types" || kind === "lines") {
    const header = ["code","label","enabled","order"];
    const arr = (kind === "types" ? types.value : lines.value);
    const rows = arr.map(v => [v.code, v.label ?? v.code, v.enabled !== false, v.order ?? ""].map(esc).join(","));
    return [header.join(","), ...rows].join("\n");
  } else {
    const header = ["code","label","tag","enabled","order"];
    const arr = processes.value;
    const rows = arr.map(v => [v.code, v.label ?? v.code, v.tag ?? "", v.enabled !== false, v.order ?? ""].map(esc).join(","));
    return [header.join(","), ...rows].join("\n");
  }
}
function exportCSV(kind: Kind) {
  const now = new Date().toISOString().slice(0,19).replace(/:/g,"");
  download(`masters_${kind}_${now}.csv`, toCSV(kind));
}

/* Simple CSV parser */
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

async function onFileChoose(kind: Kind, e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0]; if (!file) return;
  chosenFileName.value[kind] = file.name;
  const txt = await file.text();
  const arr = parseCSV(txt).filter(r => r.length && r.some(c=>c!==""));
  const header = arr.shift()!.map(h => (h || "").trim());

  if (kind === "types" || kind === "lines") {
    const need = ["code","label","enabled","order"];
    if (header.join(",") !== need.join(",")) {
      alert(`CSV 헤더가 올바르지 않습니다.\n필요 헤더: ${need.join(",")}`); input.value=""; return;
    }
    const next: MasterEntry[] = arr.map(c => ({
      code: c[0] ?? "",
      label: c[1] ?? c[0] ?? "",
      enabled: String(c[2] ?? "true").toLowerCase() !== "false",
      order: c[3] ? Number(c[3]) : null
    }));
    if (kind === "types") types.value = normalizeList(next);
    else lines.value = normalizeList(next);
  } else {
    const need = ["code","label","tag","enabled","order"];
    if (header.join(",") !== need.join(",")) {
      alert(`CSV 헤더가 올바르지 않습니다.\n필요 헤더: ${need.join(",")}`); input.value=""; return;
    }
    const next: ProcessEntry[] = arr.map(c => ({
      code: c[0] ?? "",
      label: c[1] ?? c[0] ?? "",
      tag: c[2] ?? "",
      enabled: String(c[3] ?? "true").toLowerCase() !== "false",
      order: c[4] ? Number(c[4]) : null
    }));
    processes.value = normalizeProcList(next);
  }
}

/* Triggers */
const fileInputs = {
  types: ref<HTMLInputElement | null>(null),
  lines: ref<HTMLInputElement | null>(null),
  processes: ref<HTMLInputElement | null>(null),
};
function triggerFile(kind: Kind){ fileInputs[kind].value?.click(); }

/* ---------------- Seed (기본값 채우기) ---------------- */
const DEFAULT_TYPES: MasterEntry[] = [
  { code:"ST1", label:"ST1", enabled:true, order:10 },
  { code:"ST2", label:"ST2", enabled:true, order:20 },
  { code:"HD1", label:"HD1", enabled:true, order:30 },
  { code:"HD2", label:"HD2", enabled:true, order:40 },
  { code:"EL1", label:"EL1", enabled:true, order:50 },
  { code:"EL2", label:"EL2", enabled:true, order:60 },
  { code:"END", label:"END", enabled:true, order:70 },
  { code:"CON", label:"CON", enabled:true, order:80 },
  { code:"PCO", label:"PCO", enabled:true, order:90 },
];
const DEFAULT_LINES: MasterEntry[] = [
  { code:"LIQ", label:"LIQ", enabled:true, order:10 },
  { code:"VAP", label:"VAP", enabled:true, order:20 },
  { code:"BOG", label:"BOG", enabled:true, order:30 },
  { code:"30T", label:"30T", enabled:true, order:40 },
  { code:"40T", label:"40T", enabled:true, order:50 },
  { code:"50T", label:"50T", enabled:true, order:60 },
  { code:"60T", label:"60T", enabled:true, order:70 },
  { code:"80T", label:"80T", enabled:true, order:80 },
];
const DEFAULT_PROCESSES: ProcessEntry[] = [
  { code:"Cutting_Wire",  label:"Cutting_Wire",  tag:"cw", enabled:true, order:10 },
  { code:"Foaming",       label:"Foaming",       tag:"fo", enabled:true, order:20 },
  { code:"Planing",       label:"Planing",       tag:"pl", enabled:true, order:30 },
  { code:"Cutting_length",label:"Cutting_length",tag:"cl", enabled:true, order:40 },
  { code:"FRP_Coating",   label:"FRP_Coating",   tag:"fc", enabled:true, order:50 },
  { code:"Al_Coating",    label:"Al_Coating",    tag:"ac", enabled:true, order:60 },
  { code:"Cutting_Elbow", label:"Cutting_Elbow", tag:"ce", enabled:true, order:70 },
  { code:"Glue",          label:"Glue",          tag:"gl", enabled:true, order:80 },
  { code:"Sanding",       label:"Sanding",       tag:"sa", enabled:true, order:90 },
  { code:"Packaging",     label:"Packaging",     tag:"pa", enabled:true, order:100 },
  { code:"Shipping",      label:"Shipping",      tag:"sh", enabled:true, order:110 },
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
          <input ref="fileInputs.types" type="file" accept=".csv,text/csv" class="file-hidden" @change="(e)=>onFileChoose('types',e)"/>
          <span class="badge" :title="chosenFileName.types">{{ chosenFileName.types }}</span>
        </div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="th th-center" style="width:14rem">code</th>
              <th class="th th-center">label</th>
              <th class="th th-center" style="width:7rem">enabled</th>
              <th class="th th-center" style="width:7rem">order</th>
              <th class="th th-center" style="width:7rem">액션</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r,i) in types" :key="'t'+i" class="row">
              <td class="td"><input v-model="r.code" class="input w-full"/></td>
              <td class="td"><input v-model="r.label" class="input w-full"/></td>
              <td class="td td-center"><input type="checkbox" v-model="r.enabled"/></td>
              <td class="td"><input type="number" v-model.number="r.order" class="input w-full"/></td>
              <td class="td td-center">
                <button type="button" class="btn" @click="removeRow('types', i)">삭제</button>
              </td>
            </tr>
          </tbody>
        </table>
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
          <input ref="fileInputs.lines" type="file" accept=".csv,text/csv" class="file-hidden" @change="(e)=>onFileChoose('lines',e)"/>
          <span class="badge" :title="chosenFileName.lines">{{ chosenFileName.lines }}</span>
        </div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="th th-center" style="width:14rem">code</th>
              <th class="th th-center">label</th>
              <th class="th th-center" style="width:7rem">enabled</th>
              <th class="th th-center" style="width:7rem">order</th>
              <th class="th th-center" style="width:7rem">액션</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r,i) in lines" :key="'l'+i" class="row">
              <td class="td"><input v-model="r.code" class="input w-full"/></td>
              <td class="td"><input v-model="r.label" class="input w-full"/></td>
              <td class="td td-center"><input type="checkbox" v-model="r.enabled"/></td>
              <td class="td"><input type="number" v-model.number="r.order" class="input w-full"/></td>
              <td class="td td-center">
                <button type="button" class="btn" @click="removeRow('lines', i)">삭제</button>
              </td>
            </tr>
          </tbody>
        </table>
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
          <input ref="fileInputs.processes" type="file" accept=".csv,text/csv" class="file-hidden" @change="(e)=>onFileChoose('processes',e)"/>
          <span class="badge" :title="chosenFileName.processes">{{ chosenFileName.processes }}</span>
        </div>
      </div>
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="th th-center" style="width:14rem">code</th>
              <th class="th th-center">label</th>
              <th class="th th-center" style="width:10rem">tag</th>
              <th class="th th-center" style="width:7rem">enabled</th>
              <th class="th th-center" style="width:7rem">order</th>
              <th class="th th-center" style="width:7rem">액션</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r,i) in processes" :key="'p'+i" class="row">
              <td class="td"><input v-model="r.code" class="input w-full"/></td>
              <td class="td"><input v-model="r.label" class="input w-full"/></td>
              <td class="td"><input v-model="r.tag" class="input w-full"/></td>
              <td class="td td-center"><input type="checkbox" v-model="r.enabled"/></td>
              <td class="td"><input type="number" v-model.number="r.order" class="input w-full"/></td>
              <td class="td td-center">
                <button type="button" class="btn" @click="removeRow('processes', i)">삭제</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

  </section>
</template>

<style scoped>
:where(button, input, select) { all: revert; font: inherit; }

/* Layout */
.card { border:1px solid #e5e7eb; border-radius: .75rem; background:#fff; }
.card-head { display:flex; align-items:center; justify-content:space-between; padding:.75rem .75rem; border-bottom:1px solid #e5e7eb; }
.card-title { font-weight:600; font-size:1rem; }
.actions { display:flex; gap:.5rem; align-items:center; }
.tbl-wrap { overflow:auto; }
.tbl { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; }
.th { padding:.5rem .75rem; color:#374151; border-bottom:1px solid #e5e7eb; font-weight:600; background:#f9fafb; }
.th-center { text-align:center; }
.td { padding:.5rem .75rem; border-bottom:1px solid #f3f4f6; }
.td-center { text-align:center; }
.row:nth-child(odd) { background:#fafafa; }

/* Controls */
.input { border:1px solid #d1d5db; border-radius:.5rem; padding:.375rem .5rem; outline:none; }
.input:focus { box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }

/* Buttons */
.btn { display:inline-flex; align-items:center; border:1px solid #d1d5db; background:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn:hover { background:#f9fafb; }
.btn:active { transform:scale(.98); }
.btn-outline.blue { display:inline-flex; align-items:center; border:1px solid #93c5fd; background:#fff; color:#1d4ed8; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn-outline.blue:hover { background:#eff6ff; }

/* Badge + file input */
.badge { display:inline-flex; align-items:center; border:1px solid #e5e7eb; padding:.375rem .5rem; border-radius:.5rem; font-size:.75rem; color:#374151; background:#fff; max-width:16rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

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
