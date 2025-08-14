<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <h1 class="text-2xl font-semibold">Finishing (Pipe / P Covers) Production</h1>

    <!-- 상단 선택 -->
    <div class="flex flex-wrap justify-center gap-6 bg-white border rounded-xl p-4 shadow-sm">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Type</span>
        <select v-model="form.type" @change="onTypeChange" class="px-3 py-2 border rounded-lg bg-white hover:bg-gray-50">
          <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Line</span>
        <select v-model="form.line" class="px-3 py-2 border rounded-lg bg-white hover:bg-gray-50">
          <option v-for="l in LINE_CODES" :key="l" :value="l">{{ l }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Process</span>
        <input :value="mappedProcess" readonly class="px-3 py-2 border rounded-lg bg-gray-50 text-gray-700 w-56" />
        <span class="text-xs text-gray-500">tag: {{ mappedTag || '—' }}</span>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Station</span>
        <input v-model="stationId" placeholder="TAB-01" class="px-3 py-2 border rounded-lg bg-white" />
      </div>
    </div>

    <!-- Inch 버튼 -->
    <div>
      <div class="flex items-baseline justify-between mb-3">
        <h2 class="text-lg font-medium">Inch</h2>
        <div class="text-sm text-gray-500" v-if="loadingInches">불러오는 중…</div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <button
          v-for="inch in inchOptions"
          :key="inch"
          :class="inchButtonClass(inch)"
          :style="inchButtonStyle(inch)"
          @click="addOrBump(inch)"
        >
          {{ formatInch(inch) }}
          <span
            v-if="inchCount(inch) > 0"
            class="absolute top-1 right-1 bg-green-700 text-white text-xs rounded-full px-1"
          >
            {{ inchCount(inch) }}
          </span>
        </button>

        <!-- Empty -->
        <button
          class="relative border-2 border-dashed rounded-xl py-4 text-lg font-medium hover:bg-gray-100 active:scale-95 transition"
          @click="addCustomInch"
        >Empty</button>
      </div>
    </div>

    <!-- List -->
    <div>
      <h2 class="text-lg font-medium mb-3">List</h2>
      <div class="overflow-x-auto border rounded-md bg-white shadow p-2">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50">
            <tr>
              <th class="text-left px-3 py-2 border-b">Type</th>
              <th class="text-left px-3 py-2 border-b">Line</th>
              <th class="text-left px-3 py-2 border-b">Inch</th>
              <th class="text-left px-3 py-2 border-b">Length (mm)</th>
              <th class="text-left px-3 py-2 border-b">Qty</th>
              <th class="text-left px-3 py-2 border-b">Process</th>
              <th class="text-left px-3 py-2 border-b">itemId</th>
              <th class="text-left px-3 py-2 border-b">삭제</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in rows" :key="row.uid" class="border-t">
              <td class="px-3 py-2">
                <select v-model="row.type" @change="onRowTypeChange(row)" class="px-2 py-1 border rounded bg-white">
                  <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <select v-model="row.line" @change="syncItemId(row)" class="px-2 py-1 border rounded bg-white">
                  <option v-for="l in LINE_CODES" :key="l" :value="l">{{ l }}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <input type="number" step="any" v-model.number="row.inch" class="px-2 py-1 border rounded w-20 text-center" @input="syncItemId(row)" />
              </td>
              <td class="px-3 py-2">
                <input type="number" v-model.number="row.length_mm" class="px-2 py-1 border rounded w-24 text-center" @input="syncItemId(row)" />
              </td>
              <td class="px-3 py-2">
                <div class="inline-flex items-center gap-2">
                  <button class="px-3 py-1 border rounded hover:bg-gray-100" @click="row.qty=Math.max(1,row.qty-1)">−</button>
                  <input type="number" min="1" v-model.number="row.qty" class="px-2 py-1 border rounded w-16 text-center" />
                  <button class="px-3 py-1 border rounded hover:bg-gray-100" @click="row.qty+=1">＋</button>
                </div>
              </td>
              <td class="px-3 py-2">
                <span class="px-2 py-1 rounded bg-gray-100 border text-xs">{{ row.process }}</span>
                <span class="ml-1 text-xs text-gray-500">({{ row.process_tag }})</span>
              </td>
              <td class="px-3 py-2 font-mono text-xs break-all">{{ row.itemId }}</td>
              <td class="px-3 py-2">
                <button class="px-3 py-1 border rounded bg-red-50 hover:bg-red-100 text-red-700" @click="remove(idx)">삭제</button>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td class="px-3 py-6 text-center text-gray-400" colspan="8">추가된 항목이 없습니다.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center justify-center gap-3">
      <button
        :disabled="!canUpload || uploading"
        class="inline-flex items-center justify-center px-6 py-3 rounded-xl border
               text-white bg-emerald-600 border-emerald-600 shadow-sm
               transition-all duration-150 hover:bg-emerald-700 hover:border-emerald-700
               active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        @click="upload">
        {{ uploading ? 'Uploading…' : 'Upload' }}
      </button>

      <button
        :disabled="uploading || rows.length===0"
        class="inline-flex items-center justify-center px-6 py-3 rounded-xl border
               bg-white border-gray-300 text-gray-800 shadow-sm
               transition-all duration-150 hover:bg-gray-50 active:scale-95
               disabled:opacity-50 disabled:cursor-not-allowed"
        @click="clearAll">
        초기화
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, where, doc, getDoc, setDoc } from 'firebase/firestore'
import { useMasters } from '@/composables/useMasters'

/* ---- Masters ---- */
const { lines, processes, types } = useMasters()
const LINE_CODES = computed(() => {
  const codes = (lines.value || []).map((l:any) => l.code)
  // LIQ가 반드시 포함되게 앞쪽에 보장 (없으면 prepend)
  return codes.includes('LIQ') ? codes : ['LIQ', ...codes]
})

/* ---- 상수 ---- */
type TType = 'ST1'|'ST2'|'HD1'|'HD2'|'END'|'CON'
const TYPES: TType[] = ['ST1','ST2','HD1','HD2','END','CON']

// 타입 → 공정 매핑
const TYPE_TO_PROCESS: Record<TType, string> = {
  ST1: 'InnerP_Finishing',
  ST2: 'OuterP_Finishing',
  HD1: 'InnerP_Finishing',
  HD2: 'OuterP_Finishing',
  END: 'FRP(Mold)_Finishing',
  CON: 'FRP(Mold)_Finishing',
}

// 타입 → 기본 길이(mm)
function defaultLenOf(type: TType): number { return (type === 'ST1' || type === 'ST2') ? 1000 : 0 }

// 타입 → UOM (masters.types에 uom 있으면 반영)
const TYPE_UOM_MAP = computed<Record<string,string>>(()=>{
  const m: Record<string,string> = {}
  ;(types.value||[]).forEach((t:any)=>{ if(t?.code) m[t.code] = t.uom || 'EA' })
  return m
})

/* ---- Helpers ---- */
const db = getFirestore()
const stationId = ref('TAB-01')

const form = ref<{ type: TType, line: string }>({
  type: 'ST1',
  line: 'LIQ',  // 기본값은 반드시 LIQ
})

function shortLine(line: string) {
  if (line === 'LIQUID') return 'LIQ'
  if (line === 'VAPOUR') return 'VAP'
  return line
}
function formatInch(v: number) { return Number.isInteger(v) ? String(v) : String(v) }

// itemId: base + (len && len!==0 && len!==1000) ? _len : ''
function makeItemId(type: string, line: string, inch: number, tag: string, length_mm: number) {
  let id = `${type}_${shortLine(line)}_${formatInch(inch)}_${tag}`
  const L = Number(length_mm)
  const addLen = Number.isFinite(L) && L !== 0 && L !== 1000
  if (addLen) id += `_${L}`
  return id
}

// itemId 파서(소진문서 필드 세팅용, suffix 없으면 1000으로 간주)
function parseItemId(id: string) {
  const parts = id.split('_')
  const [type,line,inchStr,tag,maybeLen] = parts
  const inch = Number(inchStr)
  const length_mm = parts.length >= 5 ? Number(maybeLen) : 1000
  return { type, line, inch: Number.isFinite(inch)?inch:0, tag, length_mm: Number.isFinite(length_mm)?length_mm:1000 }
}

// masters.processes → code->tag 맵
const PROC_TAG_MAP = computed<Record<string,string>>(()=>{
  const m: Record<string,string> = {}
  ;(processes.value||[]).forEach((p:any)=>{ if(p?.code) m[p.code] = p.tag || '' })
  return m
})
const mappedProcess = computed(()=> TYPE_TO_PROCESS[form.value.type])
const mappedTag = computed(()=> PROC_TAG_MAP.value[mappedProcess.value] || '')

/* ---- Rows ---- */
type Row = {
  uid: string
  type: TType
  line: string
  inch: number
  length_mm: number
  qty: number
  process: string
  process_tag: string
  itemId: string
}
const rows = ref<Row[]>([])

const canUpload = computed(() => !!stationId.value && rows.value.length > 0)

/* ---- Inch options ---- */
const inchOptions = ref<number[]>([])
const loadingInches = ref(false)

// masters(process tag)/type/line 준비되면 즉시 인치 재조회
watch(
  [() => mappedTag.value, () => form.value.type, () => form.value.line],
  ([tag]) => {
    if (!tag) return
    refreshInches()
  },
  { immediate: true }
)

async function refreshInches() {
  loadingInches.value = true
  try {
    const tag = mappedTag.value
    if (!tag) { inchOptions.value = []; return }
    const qRef = query(
      collection(db, 'items'),
      where('process_tag', '==', tag),
      where('type', '==', form.value.type),
      where('line', '==', shortLine(form.value.line))
    )
    const snap = await getDocs(qRef)
    const set = new Set<number>()
    snap.forEach(d => {
      const inch = (d.data() as any).inch
      const n = typeof inch === 'number' ? inch : Number(inch)
      if (!Number.isNaN(n)) set.add(n)
    })
    inchOptions.value = Array.from(set).sort((a,b)=>a-b)
  } finally { loadingInches.value = false }
}

function onTypeChange() {
  // 타입 바뀌면 인치 다시 로드 & 기본 길이 안내는 행 추가 시 반영
  // refreshInches()는 위 watch에서 자동 호출됨
}
function onRowTypeChange(row: Row) {
  // 타입이 바뀌면 공정/태그/기본길이 갱신
  row.process = TYPE_TO_PROCESS[row.type]
  row.process_tag = PROC_TAG_MAP.value[row.process] || ''
  if (row.length_mm == null || row.length_mm === 0 || row.length_mm === 1000) {
    row.length_mm = defaultLenOf(row.type)
  }
  syncItemId(row)
}

/* ---- Inch 버튼 UI ---- */
function inchCount(inch: number) {
  return rows.value
    .filter(r => r.type === form.value.type && r.line === form.value.line && r.inch === inch)
    .reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
}
function inchButtonClass(inch: number) {
  const c = inchCount(inch)
  const base = 'relative rounded-xl py-4 text-lg font-medium border-2 transition hover:scale-105 active:scale-95'
  return c > 0
    ? `${base} bg-green-500 text-white border-green-600 shadow-sm`
    : `${base} bg-white text-gray-800 border-gray-300 hover:bg-emerald-50`
}
function inchButtonStyle(inch: number) {
  const c = inchCount(inch)
  if (c <= 0) return {}
  const op = Math.min(1, 0.35 + c * 0.15)
  return { opacity: String(op) }
}

/* ---- 리스트 조작 ---- */
function addCustomInch() {
  const v = window.prompt('Inch 값을 숫자로 입력하세요')
  if (!v?.trim()) return
  const n = Number(v.trim())
  if (!Number.isNaN(n)) addOrBump(n)
}
function addOrBump(inch: number) {
  const key = (r: Row) => `${r.type}|${r.line}|${r.inch}|${r.length_mm}|${r.process}`
  const L = defaultLenOf(form.value.type)
  const proc = TYPE_TO_PROCESS[form.value.type]
  const tag = PROC_TAG_MAP.value[proc] || ''

  const newRow: Row = {
    uid: crypto.randomUUID(),
    type: form.value.type,
    line: form.value.line,
    inch,
    length_mm: L,
    qty: 1,
    process: proc,
    process_tag: tag,
    itemId: makeItemId(form.value.type, form.value.line, inch, tag, L),
  }
  const idx = rows.value.findIndex(r => key(r) === key(newRow))
  if (idx >= 0) rows.value[idx].qty += 1
  else rows.value.unshift(newRow)
}
function syncItemId(row: Row) {
  row.process = TYPE_TO_PROCESS[row.type]
  row.process_tag = PROC_TAG_MAP.value[row.process] || ''
  row.itemId = makeItemId(row.type, row.line, row.inch, row.process_tag, row.length_mm)
}
function remove(i: number) { rows.value.splice(i, 1) }
function clearAll() { rows.value = [] }

/* ---- 업로드 ---- */
const uploading = ref(false)

async function upsertItemIfNeeded(row: Row) {
  const refItem = doc(db, 'items', row.itemId)
  const snap = await getDoc(refItem)
  if (snap.exists()) return

  await setDoc(refItem, {
    itemId: row.itemId,
    type: row.type,
    line: shortLine(row.line),
    inch: row.inch,
    length_mm: row.length_mm,
    process: row.process,
    process_tag: row.process_tag,
    product_level: 3, // 반제품
    uom: TYPE_UOM_MAP.value[row.type] || 'EA',
    active: true,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }, { merge: true })
}

// lotId: YYYYMMDD
function yyyymmdd(d = new Date()) {
  const yy = d.getFullYear()
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return `${yy}${mm}${dd}`
}

async function upload() {
  if (!canUpload.value || uploading.value) return
  uploading.value = true
  try {
    const colProd = collection(db, 'productions')
    const tsNow = serverTimestamp()
    const today = yyyymmdd()

    for (const r of rows.value) {
      // 1) items 업서트
      await upsertItemIfNeeded(r)

      // 2) 생산 실적 문서
      const lotIdParent = `${r.itemId}_${today}`
      const prodDoc = {
        ts: tsNow,
        lotId: lotIdParent,
        itemId: r.itemId,
        type: r.type,
        line: shortLine(r.line),
        inch: r.inch,
        length_mm: r.length_mm,
        process: r.process,
        process_tag: r.process_tag,
        qty: r.qty,
        stationId: stationId.value,
        uom: TYPE_UOM_MAP.value[r.type] || 'EA',
        isProduction: true,
      }
      await addDoc(colProd, prodDoc)

      // 3) BOM 소진 생성: parentId == r.itemId
      const qBom = query(collection(db, 'bom'), where('parentId', '==', r.itemId))
      const bomSnap = await getDocs(qBom)
      if (!bomSnap.empty) {
        for (const b of bomSnap.docs) {
          const { parentId, childId, qtyPerParent } = b.data() as any
          const childParsed = parseItemId(childId)
          const consDoc = {
            ts: tsNow,
            lotId: lotIdParent,     // 부모 lotId와 묶음
            parentId: parentId,     // 어떤 부모로 소진됐는지
            itemId: childId,        // 소진된 자재
            type: childParsed.type,
            line: childParsed.line,
            inch: childParsed.inch,
            length_mm: childParsed.length_mm,
            process: r.process,
            process_tag: r.process_tag,
            qty: Number(r.qty) * Number(qtyPerParent || 0),
            stationId: stationId.value,
            uom: TYPE_UOM_MAP.value[childParsed.type] || 'EA',
            isProduction: false,
          }
          await addDoc(colProd, consDoc)
        }
      }
    }

    clearAll()
    alert('업로드 완료!')
  } finally { uploading.value = false }
}
</script>

<style scoped>
/* 원하면 살짝 팝 애니메이션
@keyframes tap-pop { 0%{transform:scale(1)} 60%{transform:scale(.96)} 100%{transform:scale(1)} }
button:active { animation: tap-pop 140ms ease-out; }
*/
</style>
