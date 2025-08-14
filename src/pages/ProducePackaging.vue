<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <h1 class="text-2xl font-semibold">Packaging</h1>

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
        <input :value="PROCESS_CODE" readonly class="px-3 py-2 border rounded-lg bg-gray-50 text-gray-700 w-44" />
        <span class="text-xs text-gray-500">tag: {{ packagingTag || '—' }}</span>
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
import {
  getFirestore, collection, addDoc, serverTimestamp, getDocs, query, where,
  doc, getDoc, setDoc, orderBy, startAt, endAt
} from 'firebase/firestore'
import { useMasters } from '@/composables/useMasters'

/* ---- Masters ---- */
const { lines, processes, types } = useMasters()
const LINE_CODES = computed(() => {
  const codes = (lines.value || []).map((l:any) => l.code)
  return codes.includes('LIQ') ? codes : ['LIQ', ...codes] // 기본 LIQ 보장
})

/* ---- 상수 ---- */
type TType = 'STRM'|'HDPS'|'ELBS'|'ENDS'|'CONS'|'PCOS'
const TYPES: TType[] = ['STRM','HDPS','ELBS','ENDS','CONS','PCOS']
const PROCESS_CODE = 'Packaging' // 고정 표기

/* ---- Helpers ---- */
const db = getFirestore()
const stationId = ref('TAB-01')

const form = ref<{ type: TType, line: string }>({
  type: 'STRM',
  line: 'LIQ', // 기본값은 반드시 LIQ
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
  if (Number.isFinite(L) && L !== 0 && L !== 1000) id += `_${L}`
  return id
}
function baseParentId(type: string, line: string, inch: number, tag: string) {
  return `${type}_${shortLine(line)}_${formatInch(inch)}_${tag}` // BOM parentId 키 (suffix 없음)
}
function parseItemId(id: string) {
  const parts = id.split('_')
  const [type,line,inchStr,tag,maybeLen] = parts
  const inch = Number(inchStr)
  const length_mm = parts.length >= 5 ? Number(maybeLen) : 1000
  return { type, line, inch: Number.isFinite(inch)?inch:0, tag, length_mm: Number.isFinite(length_mm)?length_mm:1000 }
}

// masters.processes → 'Packaging' 태그 검색 (없으면 'pa')
const PACKAGING_TAG = computed(() => {
  const list:any[] = processes.value || []
  const p = list.find(x => x?.code === PROCESS_CODE)
  return (p?.tag || '').trim()
})
const packagingTag = computed(() => PACKAGING_TAG.value || 'pa')

/* ---- UOM (masters.types 우선) ---- */
const TYPE_UOM_MAP = computed<Record<string,string>>(()=>{
  const m: Record<string,string> = {}
  ;(types.value||[]).forEach((t:any)=>{ if(t?.code) m[t.code] = t.uom || 'EA' })
  return m
})

/* ---- 기본 길이: STRM만 1000, 나머지는 0 ---- */
function defaultLenOf(type: TType): number { return type === 'STRM' ? 1000 : 0 }

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

/* ---- Inch options from BOM ---- */
const inchOptions = ref<number[]>([])
const loadingInches = ref(false)

// type/line 준비되면 인치 재조회
watch([() => form.value.type, () => form.value.line], () => refreshInches(), { immediate: true })

async function refreshInches() {
  loadingInches.value = true
  try {
    const type = form.value.type
    const line = shortLine(form.value.line)
    const tag = packagingTag.value
    const prefix = `${type}_${line}_` // parentId prefix

    const qRef = query(
      collection(db, 'bom'),
      orderBy('parentId'),
      startAt(prefix),
      endAt(prefix + '\uf8ff')
    )
    const snap = await getDocs(qRef)
    const set = new Set<number>()
    snap.forEach(d => {
      const data = d.data() as any
      const pid = String(data.parentId || '')
      if (!pid) return
      // 예: STRM_LIQ_1_pa → parts[2]가 inch, 끝이 _pa인지 확인
      const parts = pid.split('_')
      if (parts.length < 4) return
      if (!pid.endsWith(`_${tag}`)) return // Packaging 전용
      const inch = Number(parts[2])
      if (!Number.isNaN(inch)) set.add(inch)
    })
    inchOptions.value = Array.from(set).sort((a,b)=>a-b)
  } finally { loadingInches.value = false }
}

function onTypeChange() {
  // 타입 변경 시, 행 추가 시 기본 길이만 달라짐 (인치는 위 watch로 재조회)
}

/* ---- List 조작 ---- */
function addCustomInch() {
  const v = window.prompt('Inch 값을 숫자로 입력하세요')
  if (!v?.trim()) return
  const n = Number(v.trim())
  if (!Number.isNaN(n)) addOrBump(n)
}
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

function addOrBump(inch: number) {
  const key = (r: Row) => `${r.type}|${r.line}|${r.inch}|${r.length_mm}|${r.process}`
  const L = defaultLenOf(form.value.type)
  const proc = PROCESS_CODE
  const tag = packagingTag.value

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
function onRowTypeChange(row: Row) {
  // Packaging은 공정 고정, tag만 유지
  row.process = PROCESS_CODE
  row.process_tag = packagingTag.value
  if (row.length_mm == null || row.length_mm === 0 || row.length_mm === 1000) {
    row.length_mm = defaultLenOf(row.type)
  }
  syncItemId(row)
}
function syncItemId(row: Row) {
  row.process = PROCESS_CODE
  row.process_tag = packagingTag.value
  row.itemId = makeItemId(row.type, row.line, row.inch, row.process_tag, row.length_mm)
}
function remove(i: number) { rows.value.splice(i, 1) }
function clearAll() { rows.value = [] }

/* ---- 업로드 ---- */
const uploading = ref(false)

async function upsertParentItemIfNeeded(row: Row, uomFromBom?: string) {
  const refItem = doc(db, 'items', row.itemId)
  const snap = await getDoc(refItem)
  if (snap.exists()) return

  await setDoc(refItem, {
    itemId: row.itemId,
    type: row.type,
    line: shortLine(row.line),
    inch: row.inch,
    length_mm: row.length_mm,
    process: PROCESS_CODE,
    process_tag: packagingTag.value,
    product_level: 1, // 출하대기 제품
    uom: (uomFromBom || TYPE_UOM_MAP.value[row.type] || 'EA'),
    active: true,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  }, { merge: true })
}

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
    const tag = packagingTag.value

    for (const r of rows.value) {
      const lotIdParent = `${r.itemId}_${today}`
      const parentBase = baseParentId(r.type, r.line, r.inch, tag)

      // 1) BOM 조회 (parentId == base)
      const qBom = query(collection(db, 'bom'), where('parentId', '==', parentBase))
      const bomSnap = await getDocs(qBom)
      let uomParentFromBom: string | undefined
      if (!bomSnap.empty) {
        const anyDoc = bomSnap.docs[0].data() as any
        if (anyDoc?.uomParent) uomParentFromBom = anyDoc.uomParent
      } else {
        alert(`경고: BOM이 없어 소진 기록 없이 생산만 등록합니다.\nparentId = ${parentBase}`)
      }

      // 2) items 업서트(부모)
      await upsertParentItemIfNeeded(r, uomParentFromBom)

      // 3) 생산 실적(부모)
      const prodDoc = {
        ts: tsNow,
        lotId: lotIdParent,
        itemId: r.itemId,
        type: r.type,
        line: shortLine(r.line),
        inch: r.inch,
        length_mm: r.length_mm,
        process: PROCESS_CODE,
        process_tag: tag,
        qty: r.qty,
        stationId: stationId.value,
        uom: (uomParentFromBom || TYPE_UOM_MAP.value[r.type] || 'EA'),
        isProduction: true,
      }
      await addDoc(colProd, prodDoc)

      // 4) 소진 실적(자식들)
      if (!bomSnap.empty) {
        for (const b of bomSnap.docs) {
          const { parentId, childId, qtyPerParent, uomChild } = b.data() as any
          const childParsed = parseItemId(childId)
          const consDoc = {
            ts: tsNow,
            lotId: lotIdParent,     // 부모 lotId와 묶음
            parentId: parentId,     // suffix 없는 base
            itemId: childId,        // 소진된 자재
            type: childParsed.type,
            line: childParsed.line,
            inch: childParsed.inch,
            length_mm: childParsed.length_mm,
            process: PROCESS_CODE,
            process_tag: tag,
            qty: Number(r.qty) * Number(qtyPerParent || 0),
            stationId: stationId.value,
            uom: String(uomChild || TYPE_UOM_MAP.value[childParsed.type] || 'EA'),
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
/* 버튼 팝 효과 원하면 주석 해제
@keyframes tap-pop { 0%{transform:scale(1)} 60%{transform:scale(.96)} 100%{transform:scale(1)} }
button:active { animation: tap-pop 140ms ease-out; }
*/
</style>
