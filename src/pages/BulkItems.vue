<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { db } from "@/firebase";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { useMasters } from "@/composables/useMasters";

/* ---------------- Masters (DB) ---------------- */
// types: [{ code, label?, uom, enabled, order }]
// processes: [{ code, label?, tag, enabled, order, product_level }]
const { types, processes } = useMasters();

/* 맵/옵션 */
const TYPE_CODES = computed(() => (types.value || []).map(t => t.code));
const TYPE_MAP = computed(() => {
  const m: Record<string, { code:string; uom?: string }> = {};
  (types.value || []).forEach(t => { m[t.code] = { code: t.code, uom: (t as any).uom }; });
  return m;
});
const PROC_OPTS = computed(() =>
  (processes.value || [])
    .map(p => ({ name: p.code, tag: (p as any).tag ?? "", product_level: (p as any).product_level }))
    .filter(p => p.tag) // tag 없는 건 제외
);

/* ---------------- 사용자 파라미터 ---------------- */
/** 콤마로 라인/인치/길이 입력 */
const LINES   = ref("LIQ,VAP,BOG");
const INCHES  = ref("0.5,0.75,1,1.25,1.5,2,2.5");
/** 길이: 비워도 됨(내부적으로 [0]으로 간주) */
const LENGTHS = ref("1000");

/** 선택 타입/공정 */
const selectedTypes = ref<string[]>([]);
const selectedProcTags = ref<string[]>([]);

/* 초기 선택값 */
watch(TYPE_CODES, (list) => {
  if (!selectedTypes.value.length && list.length) {
    selectedTypes.value = list.slice(0, Math.min(2, list.length));
  }
}, { immediate: true });

watch(PROC_OPTS, (list) => {
  if (!selectedProcTags.value.length && list.length) {
    // 공정은 기본 전체 선택
    selectedProcTags.value = list.map(p => p.tag);
  }
}, { immediate: true });

/* ---------------- 유틸 ---------------- */
const split = (s:string)=> s.split(",").map(x=>x.trim()).filter(Boolean);
const splitNum = (s:string)=> split(s).map(Number).filter(n=>!Number.isNaN(n));

const linesArr  = computed(()=> split(LINES.value));
const inchesNum = computed(()=> splitNum(INCHES.value));
/** 길이 입력이 비면 [0]으로 대체하여 '길이 없음' 의미 부여 */
const lengthsArr = computed(()=>{
  const arr = splitNum(LENGTHS.value);
  return arr.length ? arr : [0];
});

/** inch 숫자를 itemId/DB용 문자열로 안정 변환 */
function inchToStr(n:number) {
  // 소수점 불필요한 2.0 → "2" 정규화
  if (Number.isInteger(n)) return String(n);
  // 불필요한 0 제거
  return String(n).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'');
}

/** itemId 생성 규칙 */
function buildItemId(
  type:string,
  line:string,
  inchNum:number,
  tag:string,
  lengthMm:number
) {
  const inch = inchToStr(inchNum);
  let id = `${type}_${line}_${inch}_${tag}`;
  // length_mm가 비었거나(=0) 또는 1000이 아닌 경우에만 suffix 부여
  if (lengthMm > 0 && lengthMm !== 1000) {
    id += `_${lengthMm}`;
  }
  return id;
}

/** 선택된 공정 목록 */
const activeProcesses = computed(() =>
  PROC_OPTS.value.filter(p => selectedProcTags.value.includes(p.tag))
);

/* ---------------- 미리보기/카운트 ---------------- */
const preview = computed(()=>{
  const out:string[] = [];
  for (const type of selectedTypes.value) {
    for (const p of activeProcesses.value) {
      for (const line of linesArr.value) {
        for (const inch of inchesNum.value) {
          for (const L of lengthsArr.value) {
            out.push(buildItemId(type,line,inch,p.tag,L));
            if (out.length >= 12) return out;
          }
        }
      }
    }
  }
  return out;
});

const expectedCount = computed(()=>(
  selectedTypes.value.length *
  activeProcesses.value.length *
  linesArr.value.length *
  inchesNum.value.length *
  lengthsArr.value.length
));

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
  if (!inchesNum.value.length) { alert("Inches를 확인하세요."); return; }
  // LENGTHS는 비워도 동작(내부적으로 [0])

  let batch = writeBatch(db);
  let count = 0;

  for (const type of selectedTypes.value) {
    const typeUom = TYPE_MAP.value[type]?.uom ?? null; // masters.types.uom
    for (const proc of activeProcesses.value) {
      const productLevel = proc.product_level ?? null; // masters.processes.product_level
      for (const line of linesArr.value) {
        for (const inchN of inchesNum.value) {
          const inchStr = inchToStr(inchN);
          for (const L of lengthsArr.value) {
            const itemId = buildItemId(type, line, inchN, proc.tag, L);
            const ref = doc(db, "items", itemId);
            batch.set(ref, {
              /* Keys */
              itemId,
              /* Master dims */
              type,
              line,
              inch: inchStr,                 // 스키마에 맞게 string 저장
              length_mm: L,                  // 필드는 유지(0 허용)
              process: proc.name,            // 공정 코드
              process_tag: proc.tag,

              /* New fields from masters */
              product_level: productLevel,   // processes.product_level
              uom: typeUom || 'EA',          // types.uom (없으면 기본값 'EA')

              /* Meta */
              active: true,
              created_at: serverTimestamp(),
            }, { merge: true });

            count++;
            if (count % 450 === 0) {
              await batch.commit();
              batch = writeBatch(db);
            }
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
      <h2 class="title">아이템 대량 생성 (곱하기 방식)</h2>
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
            <!-- 미묘하지만 uom 힌트가 필요하면 아래처럼 노출 가능
            <span class="badge mono" v-if="TYPE_MAP[t]?.uom">{{ TYPE_MAP[t]?.uom }}</span>
            -->
          </label>
        </div>

        <p class="hint">길이값은 대부분 쓰지 않으며, <b>비었거나 0 또는 1000≠값</b>일 때만 itemId 뒤에 붙습니다.</p>
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
            <span>Lengths(mm, 콤마 숫자 / 비워도 됨)</span>
            <input v-model="LENGTHS" class="input" placeholder="예) 1000 또는 공백" />
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
          <label
            v-for="p in PROC_OPTS"
            :key="p.tag"
            class="chip"
            :class="{on:selectedProcTags.includes(p.tag)}"
            title="product_level은 저장 시 자동 반영"
          >
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
