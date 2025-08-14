<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <h1 class="text-2xl font-semibold">Foaming Production History</h1>

    <!-- 상단 선택 영역 -->
    <div class="flex flex-wrap justify-center gap-6 bg-white border rounded-xl p-4 shadow-sm">
      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Type</span>
        <select v-model="form.type" @change="refreshInches"
                class="px-3 py-2 border rounded-lg bg-white hover:bg-gray-50">
          <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Line</span>
        <select v-model="form.line" @change="refreshInches"
                class="px-3 py-2 border rounded-lg bg-white hover:bg-gray-50">
          <option v-for="l in LINE_CODES" :key="l" :value="l">{{ l }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-sm text-gray-600">Station</span>
        <input v-model="stationId" placeholder="TAB-01"
               class="px-3 py-2 border rounded-lg bg-white" />
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
          @click="handleInchClick(inch)"
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
              <th class="text-left px-3 py-2 border-b">itemId</th>
              <th class="text-left px-3 py-2 border-b">삭제</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, idx) in rows" :key="row.uid" class="border-t">
              <td class="px-3 py-2">
                <select v-model="row.type" @change="syncItemId(row)"
                        class="px-2 py-1 border rounded bg-white">
                  <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <select v-model="row.line" @change="syncItemId(row)"
                        class="px-2 py-1 border rounded bg-white">
                  <option v-for="l in LINE_CODES" :key="l" :value="l">{{ l }}</option>
                </select>
              </td>
              <td class="px-3 py-2">
                <input type="number" step="any" v-model.number="row.inch"
                       class="px-2 py-1 border rounded w-20 text-center" @input="syncItemId(row)" />
              </td>
              <td class="px-3 py-2">
                <input type="number" v-model.number="row.length_mm"
                       class="px-2 py-1 border rounded w-24 text-center" @input="syncItemId(row)" />
              </td>
              <td class="px-3 py-2">
                <div class="inline-flex items-center gap-2">
                  <button class="px-3 py-1 border rounded hover:bg-gray-100" @click="row.qty=Math.max(1,row.qty-1)">−</button>
                  <input type="number" min="1" v-model.number="row.qty" class="px-2 py-1 border rounded w-16 text-center" />
                  <button class="px-3 py-1 border rounded hover:bg-gray-100" @click="row.qty+=1">＋</button>
                </div>
              </td>
              <td class="px-3 py-2 font-mono text-xs break-all">{{ row.itemId }}</td>
              <td class="px-3 py-2">
                <button class="px-3 py-1 border rounded bg-red-50 hover:bg-red-100 text-red-700" @click="remove(idx)">삭제</button>
              </td>
            </tr>
            <tr v-if="rows.length === 0">
              <td class="px-3 py-6 text-center text-gray-400" colspan="7">추가된 항목이 없습니다.</td>
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
import { ref, computed, onMounted, watch } from 'vue'
import { getFirestore, collection, addDoc, serverTimestamp, getDocs, query, where, doc, setDoc, getDoc } from 'firebase/firestore'

/** ───── 하드코딩 설정 ───── **/
const TYPES = ['ST1', 'ST2', 'HD1', 'HD2'] as const
// 라인은 필요시 마스터로 바꿔도 되지만 지금은 간단히 하드코딩
const LINE_CODES = ['LIQUID', 'VAPOUR', 'BOG', '30T', '40T', '50T', '60T', '80T'] as const

// fo 화면 고정 상수
const FO_PROCESS_TAG  = 'fo'
const FO_PROCESS_CODE = 'Foaming'
const FO_PRODUCT_LEVEL = 3
const FIXED_UOM = 'EA' as const

const db = getFirestore()
const stationId = ref('TAB-01')

// 기본 line은 'LIQUID'
const form = ref<{type: typeof TYPES[number]; line: typeof LINE_CODES[number]}>({
  type: TYPES[0],
  line: 'LIQUID'
})

type Row = {
  uid: string
  type: string
  line: string
  inch: number
  length_mm: number
  qty: number
  itemId: string
}
const rows = ref<Row[]>([])
const inchOptions = ref<number[]>([])
const loadingInches = ref(false)

/** helpers */
function shortLine(line: string) {
  if (line === 'LIQUID') return 'LIQ'
  if (line === 'VAPOUR') return 'VAP'
  return line
}
function inchToStr(n:number) {
  if (Number.isInteger(n)) return String(n)
  return String(n).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'')
}
function formatInch(v: number) { return inchToStr(v) }
const makeItemId = (type: string, line: string, inch: number, length_mm: number) => {
  const inchStr = inchToStr(inch)
  const base = `${type}_${shortLine(line)}_${inchStr}_${FO_PROCESS_TAG}`
  return (length_mm > 0 && length_mm !== 1000) ? `${base}_${length_mm}` : base
}
function yymmdd(d = new Date()) {
  const yy = String(d.getFullYear() % 100).padStart(2,'0')
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return `${yy}${mm}${dd}`
}

const canUpload = computed(() => !!stationId.value && rows.value.length > 0)

/** items에서 인치 로드 (process_tag=fo, type, line) */
async function refreshInches() {
  if (!form.value.type || !form.value.line) return
  loadingInches.value = true
  try {
    const qRef = query(
      collection(db, 'items'),
      where('process_tag', '==', FO_PROCESS_TAG),
      where('type', '==', form.value.type),
      where('line', '==', shortLine(form.value.line))
    )
    const snap = await getDocs(qRef)
    const set = new Set<number>()
    snap.forEach(d => {
      const inch = (d.data() as any).inch
      if (typeof inch === 'number') set.add(inch)
      else if (inch != null) { const n = Number(inch); if (!Number.isNaN(n)) set.add(n) }
    })
    inchOptions.value = Array.from(set).sort((a,b)=>a-b)
  } finally { loadingInches.value = false }
}

// 초기 진입 & 선택값 변경 시 재조회
onMounted(refreshInches)
watch(() => [form.value.type, form.value.line], refreshInches, { deep: true })

/** 현재 선택(type/line) 기준 인치별 총 수량(모든 length 포함) */
function inchCount(inch: number) {
  return rows.value
    .filter(r => r.type === form.value.type && r.line === form.value.line && r.inch === inch)
    .reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
}

/** 인치 버튼 스타일 */
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

/** 리스트 조작 */
function handleInchClick(inch: number) { addOrBump(inch) }
function addCustomInch() {
  const v = window.prompt('Inch 값을 숫자로 입력하세요')
  if (!v?.trim()) return
  const n = Number(v.trim())
  if (!Number.isNaN(n)) addOrBump(n)
}
function addOrBump(inch: number) {
  const key = (r: Row) => `${r.type}|${r.line}|${r.inch}|${r.length_mm}`
  const L = 1000
  const newRow: Row = {
    uid: crypto.randomUUID(),
    type: form.value.type,
    line: form.value.line,
    inch,
    length_mm: L,
    qty: 1,
    itemId: makeItemId(form.value.type, form.value.line, inch, L)
  }
  const idx = rows.value.findIndex(r => key(r) === key(newRow))
  if (idx >= 0) rows.value[idx].qty += 1
  else rows.value.unshift(newRow)
}
function syncItemId(row: Row) { row.itemId = makeItemId(row.type, row.line, row.inch, row.length_mm) }
function remove(i: number) { rows.value.splice(i, 1) }
function clearAll() { rows.value = [] }

/** 업로드: productions 기록 + items upsert(하드코딩 메타 포함) */
const uploading = ref(false)
async function upload() {
  if (!canUpload.value || uploading.value) return
  uploading.value = true
  try {
    const prodCol = collection(db, 'productions')
    const tsNow = serverTimestamp()
    const today = yymmdd()

    // 1) items upsert (없으면 생성, 있으면 보정)
    await Promise.all(rows.value.map(async (r) => {
      const itemRef = doc(db, 'items', r.itemId)
      const snap = await getDoc(itemRef)

      const base = {
        itemId: r.itemId,
        type: r.type,
        line: shortLine(r.line),       // DB에는 축약형 사용
        inch: inchToStr(r.inch),       // DB에는 문자열
        length_mm: r.length_mm,
        process_tag: FO_PROCESS_TAG,   // 하드코딩
        process: FO_PROCESS_CODE,      // 하드코딩
        product_level: FO_PRODUCT_LEVEL, // 하드코딩(반제품=3)
        uom: FIXED_UOM,                // 하드코딩 'EA'
        active: true,
        updated_at: tsNow,
      }

      if (snap.exists()) {
        await setDoc(itemRef, base, { merge: true }) // created_at 보존
      } else {
        await setDoc(itemRef, { ...base, created_at: tsNow }, { merge: true })
      }
    }))

    // 2) productions 기록
    const payloads = rows.value.map(r => ({
      ts: tsNow,
      lotId: `${r.itemId}_${today}`,
      itemId: r.itemId,
      process: FO_PROCESS_CODE,
      process_tag: FO_PROCESS_TAG,
      type: r.type,
      line: shortLine(r.line),  // 기록도 축약형으로 통일해도 OK
      inch: r.inch,             // productions엔 number로
      length_mm: r.length_mm,
      qty: r.qty,
      stationId: stationId.value,
      uom: FIXED_UOM,           // 'EA'
      isProduction: true
    }))
    await Promise.all(payloads.map(p => addDoc(prodCol, p)))

    clearAll()
    alert('업로드 완료!')
  } finally { uploading.value = false }
}
</script>

<style scoped>
/* 원하면 살짝 팝 애니메이션 켜기
@keyframes tap-pop { 0%{transform:scale(1)} 60%{transform:scale(.96)} 100%{transform:scale(1)} }
button:active { animation: tap-pop 140ms ease-out; }
*/
</style>
