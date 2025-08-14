<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { db } from "@/firebase";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { useMasters } from "@/composables/useMasters";

/* ---------------- Masters ---------------- */
// types: [{ code, uom, enabled, order }]
// processes: [{ code, tag, enabled, order }]
const { types, processes } = useMasters();

const TYPE_MAP = computed(() => {
  const m: Record<string, { uom?: string }> = {};
  (types.value || []).forEach((t:any)=>{ if (t?.code) m[t.code] = { uom: t.uom }; });
  return m;
});
const TYPE_CODES = computed(() => (types.value || []).map((t:any)=>t.code));

const PROC_OPTS = computed(() =>
  (processes.value || [])
    .map((p:any)=>({ code:p.code, tag:p.tag || "" }))
    .filter(p=>p.tag) // tag 없는 공정 제외
);
const PROC_TAG = (code:string)=> PROC_OPTS.value.find(p=>p.code===code)?.tag || "";

/* ---------------- 상태 ---------------- */
// 부모 타입(다중)
const selectedTypes = ref<string[]>([]);

// 부모/자식 공정 (기본모드에서 childProc 사용, 믹스모드에선 각 행에서 별도 선택)
const parentProc = ref<string>("");
const childProc  = ref<string>("");

// 파라미터
const LINES  = ref("LIQ,VAP");
const INCHES = ref("1,2,3");

// 기본 모드 전용
const childTypeOverride = ref<string>(""); // 비우면 자식 타입=부모 타입
const qtyPerParent = ref<number>(1);

// 믹스 모드
type MixRow = { childType: string; childProc: string; qty: number };
const mixOn   = ref(false);
const mixRows = ref<MixRow[]>([]);

/* ---------------- 유틸 ---------------- */
const split = (s:string)=> s.split(",").map(v=>v.trim()).filter(Boolean);
const splitNum = (s:string)=> split(s).map(Number).filter(n=>!Number.isNaN(n));
function inchToStr(n:number){ return Number.isInteger(n) ? String(n) : String(n).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,''); }
function buildItemId(type:string, line:string, inchNum:number, procTag:string) {
  return `${type}_${line}_${inchToStr(inchNum)}_${procTag}`;
}
function uomOfType(type:string){ return TYPE_MAP.value[type]?.uom || "EA"; }

/* ---------------- 파생 ---------------- */
const linesArr  = computed(()=> split(LINES.value));
const inchesArr = computed(()=> splitNum(INCHES.value));

const expectedCount = computed(()=>{
  const baseComb = selectedTypes.value.length * linesArr.value.length * inchesArr.value.length;
  if (!baseComb) return 0;
  return mixOn.value ? baseComb * mixRows.value.length : baseComb * 1;
});

/* ---------------- 미리보기 ---------------- */
const preview = computed(()=>{
  const out:string[] = [];
  const pTag = PROC_TAG(parentProc.value);
  if (!pTag) return out;

  for (const pType of selectedTypes.value) {
    for (const line of linesArr.value) {
      for (const inch of inchesArr.value) {
        const parentId = buildItemId(pType, line, inch, pTag);

        if (mixOn.value) {
          for (const row of mixRows.value) {
            const cTag = PROC_TAG(row.childProc);
            if (!row.childType || !cTag || !(row.qty>0)) continue;
            const childId = buildItemId(row.childType, line, inch, cTag);
            out.push(`${parentId}__${childId}  (qty=${row.qty})`);
            if (out.length >= 12) return out;
          }
        } else {
          const cType = childTypeOverride.value.trim() || pType;
          const cTag = PROC_TAG(childProc.value);
          if (!cTag || !(qtyPerParent.value>0)) continue;
          const childId = buildItemId(cType, line, inch, cTag);
          out.push(`${parentId}__${childId}  (qty=${qtyPerParent.value})`);
          if (out.length >= 12) return out;
        }
      }
    }
  }
  return out;
});

/* ---------------- 액션 ---------------- */
function addMixRow() {
  const firstType = childTypeOverride.value || selectedTypes.value[0] || TYPE_CODES.value[0] || "";
  const defaultChildProc = childProc.value || PROC_OPTS.value[0]?.code || "";
  mixRows.value.push({ childType: firstType, childProc: defaultChildProc, qty: 1 });
}
function removeMixRow(i:number){ mixRows.value.splice(i,1); }

async function upload(){
  // 공통 검증
  if (!selectedTypes.value.length) { alert("부모 타입을 1개 이상 선택하세요."); return; }
  if (!linesArr.value.length) { alert("Lines를 입력하세요."); return; }
  if (!inchesArr.value.length) { alert("Inches를 입력하세요."); return; }
  const pTag = PROC_TAG(parentProc.value);
  if (!pTag) { alert("부모 공정을 선택하세요."); return; }

  // 모드별 검증
  if (mixOn.value) {
    if (!mixRows.value.length) { alert("자식 믹스 행을 추가하세요."); return; }
    for (const [i,row] of mixRows.value.entries()) {
      if (!row.childType) { alert(`믹스 ${i+1}행: childType이 비었습니다.`); return; }
      if (!PROC_TAG(row.childProc)) { alert(`믹스 ${i+1}행: child 공정을 선택하세요.`); return; }
      if (!(row.qty>0)) { alert(`믹스 ${i+1}행: qty는 1 이상이어야 합니다.`); return; }
    }
  } else {
    if (!(qtyPerParent.value>0)) { alert("qtyPerParent는 1 이상이어야 합니다."); return; }
    if (!PROC_TAG(childProc.value)) { alert("자식 공정을 선택하세요."); return; }
  }

  let batch = writeBatch(db);
  let count = 0;
  const now = serverTimestamp();

  const pushDoc = (parentId:string, childId:string, qty:number) => {
    const parentTypeToken = parentId.split("_")[0];
    const childTypeToken  = childId.split("_")[0];
    const docId = `${parentId}__${childId}`;
    batch.set(doc(db, "bom", docId), {
      parentId, childId,
      qtyPerParent: qty,
      uomParent: uomOfType(parentTypeToken),
      uomChild:  uomOfType(childTypeToken),
      created_at: now,
      updated_at: now,
    }, { merge:true });
    count++;
  };

  for (const pType of selectedTypes.value) {
    for (const line of linesArr.value) {
      for (const inch of inchesArr.value) {
        const parentId = buildItemId(pType, line, inch, pTag);

        if (mixOn.value) {
          for (const row of mixRows.value) {
            const cTag = PROC_TAG(row.childProc);
            const childId = buildItemId(row.childType, line, inch, cTag);
            pushDoc(parentId, childId, Number(row.qty));
            if (count % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
          }
        } else {
          const cType = childTypeOverride.value.trim() || pType;
          const cTag = PROC_TAG(childProc.value);
          const childId = buildItemId(cType, line, inch, cTag);
          pushDoc(parentId, childId, Number(qtyPerParent.value));
          if (count % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
        }
      }
    }
  }

  await batch.commit();
  alert(`업로드 완료 (${count}건)`);
}

/* ---------------- 초기 선택 도움 ---------------- */
watch(PROC_OPTS, (list) => {
  if (!parentProc.value && list.length) parentProc.value = list[0].code;
  if (!childProc.value && list.length)  childProc.value = list[Math.min(1, list.length-1)]?.code || list[0].code;
}, { immediate: true });

watch(types, (list) => {
  if (!selectedTypes.value.length && list?.length) {
    // END/CON 흐름 유사 → 둘 다 기본 체크 시도
    const init = list.map((t:any)=>t.code).filter((c:string)=>c==="END"||c==="CON");
    selectedTypes.value = init.length ? init : [list[0].code];
  }
}, { immediate: true });
</script>

<template>
  <section class="wrap">
    <!-- 헤더 -->
    <header class="topbar">
      <h2 class="title">BOM 대량 생성 (부모 다중 + 자식 믹스)</h2>
      <div class="right">
        <span class="muted">예상 생성: <b>{{ expectedCount }}</b> 건</span>
        <button class="btn-blue" @click="upload">업로드</button>
      </div>
    </header>

    <div class="grid">
      <!-- 타입/공정 -->
      <div class="card">
        <div class="card-h">
          <h3>부모 타입 선택</h3>
        </div>

        <div class="chips">
          <label v-for="t in (types||[])" :key="t.code" class="chip" :class="{on:selectedTypes.includes(t.code)}">
            <input type="checkbox" v-model="selectedTypes" :value="t.code" />
            <span class="mono">{{ t.code }}</span>
            <span class="badge mono" v-if="t.uom">{{ t.uom }}</span>
          </label>
        </div>

        <div class="card-h" style="margin-top:8px">
          <h3>공정 선택</h3>
        </div>

        <div class="form two">
          <label>
            <span>부모 공정</span>
            <select v-model="parentProc" class="input">
              <option v-for="p in PROC_OPTS" :key="p.code" :value="p.code">{{ p.code }} ({{ p.tag }})</option>
            </select>
          </label>

          <!-- 기본 모드에서만 보이는 영역 -->
          <label v-if="!mixOn">
            <span>자식 공정</span>
            <select v-model="childProc" class="input">
              <option v-for="p in PROC_OPTS" :key="p.code" :value="p.code">{{ p.code }} ({{ p.tag }})</option>
            </select>
          </label>
        </div>

        <div class="btn-row">
          <button type="button" class="btn" :class="{active: mixOn}" @click="mixOn = !mixOn">
            자식 믹스 모드 {{ mixOn ? '끄기' : '켜기' }}
          </button>
        </div>
      </div>

      <!-- 파라미터 -->
      <div class="card">
        <div class="card-h">
          <h3>파라미터</h3>
        </div>

        <div class="form">
          <label>
            <span>Lines (콤마)</span>
            <input v-model="LINES" class="input" placeholder="LIQ,VAP" />
          </label>
          <label>
            <span>Inches (콤마 숫자)</span>
            <input v-model="INCHES" class="input" placeholder="1,2,3" />
          </label>
        </div>

        <!-- 기본 모드 옵션 -->
        <template v-if="!mixOn">
          <div class="card-h" style="margin-top:8px">
            <h3>기본 모드 옵션</h3>
          </div>
          <div class="form">
            <label>
              <span>자식 타입 오버라이드(선택)</span>
              <input v-model="childTypeOverride" class="input mono" placeholder="비워두면 부모 타입 그대로"/>
            </label>
            <label>
              <span>qtyPerParent</span>
              <input type="number" min="1" v-model.number="qtyPerParent" class="input"/>
            </label>
          </div>
        </template>

        <!-- 믹스 모드 테이블 -->
        <template v-else>
          <div class="card-h" style="margin-top:8px">
            <h3>자식 믹스 행</h3>
            <div class="card-actions">
              <button type="button" class="btn-blue" @click="addMixRow">+ 행 추가</button>
            </div>
          </div>

          <div class="mix-table">
            <div class="mix-head">
              <div class="col type">childType</div>
              <div class="col qty">qtyPerParent</div>
              <div class="col proc">childProcess</div>
              <div class="col act">액션</div>
            </div>

            <div v-if="!mixRows.length" class="mix-empty">행을 추가해 주세요.</div>

            <div v-for="(row, i) in mixRows" :key="i" class="mix-row">
              <div class="col type">
                <select v-model="row.childType" class="input">
                  <option v-for="t in TYPE_CODES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="col qty">
                <input type="number" min="1" v-model.number="row.qty" class="input text-center"/>
              </div>
              <div class="col proc">
                <select v-model="row.childProc" class="input">
                  <option v-for="p in PROC_OPTS" :key="p.code" :value="p.code">{{ p.code }} ({{ p.tag }})</option>
                </select>
              </div>
              <div class="col act">
                <button type="button" class="btn" @click="removeMixRow(i)">삭제</button>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 미리보기 -->
    <div class="card">
      <div class="card-h">
        <h3>미리보기 <small>(최대 12개)</small></h3>
      </div>
      <ul class="preview">
        <li v-for="id in preview" :key="id" class="mono">{{ id }}</li>
        <li v-if="!preview.length" class="muted">조합이 없습니다. 타입/라인/인치/공정을 확인하세요.</li>
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

/* Buttons (넓게) */
.btn { display:inline-flex; align-items:center; justify-content:center; border:1px solid #d1d5db; background:#fff; padding:.45rem 1rem; min-width:96px; height:36px; border-radius:.5rem; font-size:.9rem; transition:.15s; }
.btn:hover { background:#f9fafb; }
.btn:active { transform:scale(.98); }
.btn-blue { display:inline-flex; align-items:center; justify-content:center; border:1px solid #2563eb; background:#2563eb; color:#fff; padding:.5rem 1rem; min-width:110px; height:38px; border-radius:.65rem; font-size:.92rem; transition:.15s; }
.btn-blue:hover { background:#1d4ed8; }

/* Input */
.input { width:100%; border:1px solid #d1d5db; border-radius:.5rem; padding:.45rem .6rem; outline:none; }
.input:focus { box-shadow:0 0 0 3px rgba(59,130,246,.2); border-color:#60a5fa; }
.form { display:grid; gap:10px; }
.form.two { grid-template-columns: 1fr 1fr; }
@media (max-width: 720px){ .form.two { grid-template-columns: 1fr; } }
.form > label { display:grid; gap:6px; font-size:.9rem; color:#374151; }

/* Chips */
.chips { display:flex; flex-wrap:wrap; gap:8px; }
.chip { display:inline-flex; align-items:center; gap:6px; border:1px solid #e5e7eb; border-radius:999px; padding:.25rem .6rem; background:#fff; cursor:pointer; user-select:none; }
.chip input { display:none; }
.chip .badge { font-size:11px; color:#1f2937; background:#f3f4f6; border:1px solid #e5e7eb; border-radius:999px; padding:.05rem .4rem; }
.chip.on { border-color:#93c5fd; background:#eff6ff; }
.chip.on .badge { background:#dbeafe; border-color:#93c5fd; }

/* Mix table */
.mix-table { border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; }
.mix-head, .mix-row { display:grid; grid-template-columns: 1.5fr 1fr 1.6fr .8fr; }
.mix-head { background:#f9fafb; border-bottom:1px solid #e5e7eb; font-weight:600; }
.mix-row  { border-top:1px solid #f3f4f6; }
.col { padding:.5rem .6rem; display:flex; align-items:center; gap:8px; }
.col.type select, .col.proc select, .col.qty input { width:100%; }
.mix-empty { padding:.6rem; color:#6b7280; }

/* Preview */
.preview { list-style:none; margin:0; padding:8px; border:1px dashed #e5e7eb; border-radius:8px; max-height:260px; overflow:auto; background:#fafafa; }
.preview li { padding:.1rem 0; }
.muted { color:#6b7280; font-size:.9rem; }
</style>
