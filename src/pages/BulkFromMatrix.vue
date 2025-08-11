<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { db } from "@/firebase";
import { doc, onSnapshot, writeBatch, serverTimestamp } from "firebase/firestore";
import { useMasters } from "@/composables/useMasters";

/* ---------------- Masters (DB) ---------------- */
const { types, processes } = useMasters(); // [{code,label?}], [{code,label?, tag}]
const TYPE_CODES = computed(() => (types.value || []).map(t => t.code));
const PROC_OPTS = computed(() =>
  (processes.value || [])
    .map(p => ({ name: p.code, tag: (p as any).tag ?? "" }))
    .filter(p => p.tag)
);

/* ---------------- Matrix (DB 우선, 없으면 기본값) ---------------- */
type Matrix = Record<string, Record<string, boolean>>;

const defaultMatrix: Matrix = {
  ST1: { cw:true, fo:true, pl:true, cl:false, fc:false, fm:false, ac:true,  ce:false, gl:false, sa:true,  pa:false, sh:false },
  ST2: { cw:true, fo:true, pl:true, cl:false, fc:true,  fm:false, ac:false, ce:false, gl:false, sa:true,  pa:false, sh:false },
  HD1: { cw:true, fo:true, pl:true, cl:true,  fc:false, fm:false, ac:true,  ce:false, gl:false, sa:true,  pa:false, sh:false },
  HD2: { cw:true, fo:true, pl:true, cl:true,  fc:true,  fm:false, ac:false, ce:false, gl:false, sa:true,  pa:false, sh:false },
  EL1: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:true,  gl:true,  sa:false, pa:false, sh:false },
  EL2: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:true,  gl:true,  sa:false, pa:false, sh:false },
  END: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:true,  ac:false, ce:false, gl:false, sa:true,  pa:false, sh:false },
  CON: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:true,  ac:false, ce:false, gl:false, sa:true,  pa:false, sh:false },
  PCO: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:true,  ac:false, ce:false, gl:false, sa:true,  pa:false, sh:false },
  STM: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  HDS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  ELS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  ENS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  COS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  PCS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
};
const matrix = ref<Matrix>({ ...defaultMatrix });
let unsubMatrix: (() => void) | null = null;

onMounted(() => {
  unsubMatrix = onSnapshot(doc(db, "masters", "process_matrix"), snap => {
    const m = (snap.data() || {}) as Matrix;
    if (m && Object.keys(m).length) matrix.value = m;
  });
});
onUnmounted(() => { unsubMatrix?.(); });

/* ---------------- 타입별 기본 길이 (DB 우선) ---------------- */
const typeDefaults = ref<Record<string, number>>({
  ST1:1000, ST2:1000, HD1:1000, HD2:1000, EL1:90, EL2:90,
  END:1, CON:1, PCO:1, STM:1, HDS:1, ELS:1, ENS:1, COS:1, PCS:1,
});
let unsubTypeDefaults: (() => void) | null = null;
onMounted(() => {
  unsubTypeDefaults = onSnapshot(doc(db, "masters", "type_defaults"), snap => {
    const d = (snap.data() || {}) as Record<string, number>;
    if (d && Object.keys(d).length) typeDefaults.value = { ...typeDefaults.value, ...d };
  });
});
onUnmounted(() => { unsubTypeDefaults?.(); });

/* ---------------- 파라미터 ---------------- */
const LINES = ref("LIQ,VAP,BOG");
const INCHES = ref("0.5,0.75,1,1.25,1.5,2,2.5");
/** Fallback 길이 입력(콤마 가능) */
const FALLBACKS = ref("1000");

/** 선택된 타입/공정 토글 */
const selectedTypes = ref<string[]>([]);
const selectedProcTags = ref<string[]>([]);

/* 마스터 로드 시 초기 선택값 지정 */
watch(TYPE_CODES, (list) => {
  if (!selectedTypes.value.length && list.length) {
    selectedTypes.value = list.slice(0, Math.min(2, list.length));
  }
}, { immediate: true });
watch(PROC_OPTS, (list) => {
  if (!selectedProcTags.value.length && list.length) {
    selectedProcTags.value = list.map(p => p.tag); // 디폴트 전체 선택
  }
}, { immediate: true });

/* ---------------- 유틸 ---------------- */
const split = (s:string)=> s.split(",").map(x=>x.trim()).filter(Boolean);
const splitNum = (s:string)=> split(s).map(Number).filter(n=>!Number.isNaN(n));

const linesArr  = computed(()=> split(LINES.value));
const inchesArr = computed(()=> splitNum(INCHES.value));
/** fallback 길이 목록(없으면 [1000]) */
const fallbackLens = computed<number[]>(() => {
  const arr = splitNum(FALLBACKS.value);
  return arr.length ? arr : [1000];
});

function getLens(type:string): number[] {
  const d = typeDefaults.value[type];
  return (typeof d === "number" && !Number.isNaN(d)) ? [d] : fallbackLens.value;
}
function buildItemId(type:string,line:string,inch:number,tag:string,lengthMm:number) {
  return `${type}_${line}_${inch}_${tag}_L${lengthMm}`;
}

/* 선택된 공정(칩) + 매트릭스 함께 반영 */
const activeProcesses = computed(() =>
  PROC_OPTS.value.filter(p => selectedProcTags.value.includes(p.tag))
);

/* ---------------- 미리보기/카운트 ---------------- */
const preview = computed(()=>{
  const out:string[] = [];
  for (const type of selectedTypes.value) {
    const lens = getLens(type);
    for (const p of activeProcesses.value) {
      if (!matrix.value[type]?.[p.tag]) continue;
      for (const line of linesArr.value) {
        for (const inch of inchesArr.value) {
          for (const L of lens) {
            out.push(buildItemId(type,line,inch,p.tag,L));
            if (out.length >= 12) return out;
          }
        }
      }
    }
  }
  return out;
});

const expectedCount = computed(()=>{
  let total = 0;
  for (const t of selectedTypes.value) {
    const lens = getLens(t).length;
    const procCnt = activeProcesses.value.filter(p => matrix.value[t]?.[p.tag]).length;
    total += procCnt * linesArr.value.length * inchesArr.value.length * lens;
  }
  return total;
});

/* ---------------- 액션 ---------------- */
function toggleAllTypes(on:boolean) {
  selectedTypes.value = on ? [...TYPE_CODES.value] : [];
}
function toggleAllProcs(on:boolean) {
  selectedProcTags.value = on ? PROC_OPTS.value.map(p => p.tag) : [];
}

async function upload(){
  if (!selectedTypes.value.length) { alert("타입을 선택하세요."); return; }
  if (!selectedProcTags.value.length) { alert("공정을 선택하세요."); return; }
  if (!linesArr.value.length) { alert("Lines를 확인하세요."); return; }
  if (!inchesArr.value.length) { alert("Inches를 확인하세요."); return; }

  let batch = writeBatch(db);
  let count = 0;

  for (const type of selectedTypes.value) {
    const lens = getLens(type);

    for (const proc of activeProcesses.value) {
      if (!matrix.value[type]?.[proc.tag]) continue;

      for (const line of linesArr.value) {
        for (const inch of inchesArr.value) {
          for (const L of lens) {
            const itemId = buildItemId(type,line,inch,proc.tag,L);
            const ref = doc(db,"items",itemId);
            batch.set(ref, {
              itemId, type, line, inch,
              process_tag: proc.tag,
              process: proc.name,
              length_mm: L,
              created_at: serverTimestamp()
            }, { merge:true });
            count++;
            if (count % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
          }
        }
      }
    }
  }
  await batch.commit();
  alert(`업로드 완료 (${count}개)`);
}
</script>

<template>
  <section class="wrap">
    <!-- 헤더 -->
    <header class="topbar">
      <h2 class="title">매트릭스 기반 아이템 대량 생성</h2>
      <div class="right">
        <span class="muted">예상 생성: <b>{{ expectedCount }}</b> 건</span>
        <button class="btn-blue" @click="upload">업로드</button>
      </div>
    </header>

    <!-- 카드 그리드 -->
    <div class="grid">
      <!-- 타입 선택 -->
      <div class="card">
        <div class="card-h">
          <h3>타입 선택</h3>
          <div class="card-actions">
            <button class="btn" @click="toggleAllTypes(true)">전체</button>
            <button class="btn" @click="toggleAllTypes(false)">해제</button>
          </div>
        </div>

        <div class="chips">
          <label v-for="t in TYPE_CODES" :key="t" class="chip" :class="{on:selectedTypes.includes(t)}">
            <input type="checkbox" v-model="selectedTypes" :value="t" />
            <span class="mono">{{ t }}</span>
            <span class="badge">{{ getLens(t).join(',') }}mm</span>
          </label>
        </div>

        <p class="hint">기본 길이: masters/type_defaults → 미설정 시 아래 Fallback × 조합</p>
      </div>

      <!-- 파라미터 + 공정 선택 -->
      <div class="card">
        <div class="card-h">
          <h3>곱하기 파라미터</h3>
        </div>

        <div class="form">
          <label>
            <span>Lines (콤마)</span>
            <input v-model="LINES" class="input" placeholder="LIQ,VAP,BOG" />
          </label>
          <label>
            <span>Inches (콤마 숫자)</span>
            <input v-model="INCHES" class="input" placeholder="0.5,0.75,1,1.25…" />
          </label>
          <label>
            <span>Fallback 길이(mm, 콤마 가능)</span>
            <input v-model="FALLBACKS" class="input" placeholder="1000 또는 1000,1200,1500" />
          </label>
        </div>

        <div class="card-h" style="margin-top:8px">
          <h3>공정 선택</h3>
          <div class="card-actions">
            <button class="btn" @click="toggleAllProcs(true)">전체</button>
            <button class="btn" @click="toggleAllProcs(false)">해제</button>
          </div>
        </div>
        <div class="chips">
          <label v-for="p in PROC_OPTS" :key="p.tag" class="chip" :class="{on:selectedProcTags.includes(p.tag)}">
            <input type="checkbox" v-model="selectedProcTags" :value="p.tag" />
            <span>{{ p.name }}</span>
            <span class="badge mono">{{ p.tag }}</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 미리보기 -->
    <div class="card">
      <div class="card-h">
        <h3>미리보기 <small>(최대 12개)</small></h3>
      </div>
      <ul class="preview">
        <li v-for="id in preview" :key="id" class="mono">{{ id }}</li>
        <li v-if="!preview.length" class="muted">조합이 없습니다. 타입/라인/인치/공정/길이를 확인하세요.</li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
/* Layout */
.wrap { padding:16px; display:grid; gap:12px; }
.topbar { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.title { margin:0; font-size:18px; font-weight:700; }
.right { display:flex; align-items:center; gap:8px; }
.grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
@media (max-width: 960px) { .grid { grid-template-columns: 1fr; } }

/* Card */
.card { border:1px solid #e5e7eb; border-radius:12px; background:#fff; padding:12px; }
.card-h { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; }
.card-actions { display:flex; gap:6px; }
.hint { margin:.25rem 0 0; font-size:12px; color:#6b7280; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

/* Buttons */
.btn { display:inline-flex; align-items:center; border:1px solid #d1d5db; background:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; transition:.15s; }
.btn:hover { background:#f9fafb; }
.btn:active { transform:scale(.98); }
.btn-blue { display:inline-flex; align-items:center; border:1px solid #2563eb; background:#2563eb; color:#fff; padding:.45rem .9rem; border-radius:.65rem; font-size:.9rem; transition:.15s; }
.btn-blue:hover { background:#1d4ed8; }

/* Input */
.input { width:100%; border:1px solid #d1d5db; border-radius:.5rem; padding:.45rem .6rem; outline:none; }
.input:focus { box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }
.form { display:grid; gap:10px; }
.form > label { display:grid; gap:6px; font-size:.9rem; color:#374151; }

/* Chips */
.chips { display:flex; flex-wrap:wrap; gap:8px; }
.chip { display:inline-flex; align-items:center; gap:6px; border:1px solid #e5e7eb; border-radius:999px; padding:.25rem .6rem; background:#fff; cursor:pointer; user-select:none; }
.chip input { display:none; }
.chip .badge { font-size:11px; color:#1f2937; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:999px; padding:.05rem .4rem; }
.chip.on { border-color:#93c5fd; background:#eff6ff; }
.chip.on .badge { background:#dbeafe; border-color:#93c5fd; }

/* Preview */
.preview { list-style:none; margin:0; padding:8px; border:1px dashed #e5e7eb; border-radius:8px; max-height:260px; overflow:auto; background:#fafafa; }
.preview li { padding:.1rem 0; }
.muted { color:#6b7280; font-size:.9rem; }
</style>
