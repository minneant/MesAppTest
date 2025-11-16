<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <h1 class="text-2xl font-semibold">FRP Production (Coating / Mold)</h1>

    <!-- 상단 선택 -->
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
                <select v-model="row.type" @change="onTypeChange(row)"
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
import {
  getFirestore, collection, addDoc, serverTimestamp, getDocs, query, where,
  doc, getDoc
} from 'firebase/firestore'
import { useMasters } from "@/composables/useMasters"

/** ─────────────────────────────────────────────
 * 고정 타입(같은 화면에서 Coating/Mold 전환)
 * ───────────────────────────────────────────── */
type TType = 'ST2' | 'HD2' | 'END' | 'CON' | 'EL2'
const TYPES: TType[] = ['ST2','HD2','END','CON','EL2']

/** masters: lines/processes */
const { lines, processes } = useMasters()
const LINE_CODES = computed(() => (lines.value || []).map((l:any)=> l.code))

/** 타입→공정 코드 매핑(태그는 마스터에서 추출) */
const PROCESS_CODE_BY_TYPE: Record<TType, string> = {
  ST2: 'FRP_Coating',
  HD2: 'FRP_Coating',
  END: 'FRP_Mold',
  CON: 'FRP_Mold',
  EL2: 'FRP_Coating',      // ⬅ 엘보우는 코팅 공정으로 처리
}
/** processes 마스터에서 code→tag 맵 (fc/fm 폴백 포함) */
const TAG_BY_PROCESS_CODE = computed<Record<string, string>>(()=>{
  const m: Record<string,string> = {}
  ;(processes.value || []).forEach((p:any)=>{
    if (p?.code) m[p.code] = p.tag || ''
  })
  // 안전 폴백
  if (!m['FRP_Coating']) m['FRP_Coating'] = 'fc'
  if (!m['FRP_Mold'])    m['FRP_Mold']    = 'fm'
  return m
})
const getProcForType = (t:TType) => {
  const code = PROCESS_CODE_BY_TYPE[t]
  const tag  = TAG_BY_PROCESS_CODE.value[code] || (code==='FRP_Coating'?'fc':'fm')
  return { code, tag }
}

/** ─────────────────────────────────────────────
 * 상태
 * ───────────────────────────────────────────── */
const db = getFirestore()
const stationId = ref('TAB-01')
const form = ref<{type:TType; line:string}>({ type:'ST2', line:'' }) // line은 masters 로드 후 채움

type Row = {
  uid: string
  type: TType
  line: string
  inch: number
  length_mm: number
  qty: number
  itemId: string
}
const rows = ref<Row[]>([])
const inchOptions = ref<number[]>([])
const loadingInches = ref(false)

/** ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */
function shortLine(line: string) {
  if (line === 'LIQUID') return 'LIQ'
  if (line === 'VAPOUR') return 'VAP'
  return line
}
function inchToStr(n:number){
  if (Number.isInteger(n)) return String(n)
  return String(n).replace(/(\.\d*?[1-9])0+$/,'$1').replace(/\.0+$/,'')
}
function formatInch(v:number){ return inchToStr(v) }
function defaultLenFor(type:TType){ return type==='ST2' ? 1000 : 0 }
/** itemId 규칙: type_line_inch_tag + (length>0 && !==1000이면 _length) */
function makeItemId(type:TType, line:string, inch:number, length_mm:number){
  const { tag } = getProcForType(type)
  const base = `${type}_${shortLine(line)}_${inchToStr(inch)}_${tag}`
  return (length_mm>0 && length_mm!==1000) ? `${base}_${length_mm}` : base
}
function yymmdd(d=new Date()){
  const yy=String(d.getFullYear()%100).padStart(2,'0')
  const mm=String(d.getMonth()+1).padStart(2,'0')
  const dd=String(d.getDate()).padStart(2,'0')
  return `${yy}${mm}${dd}`
}
const FIXED_UOM = 'EA' as const
const canUpload = computed(()=> !!stationId.value && rows.value.length>0)

/** 파서/유틸: items 메타가 없을 때 childId에서 최소치 뽑기 */
function parseItemId(id: string) {
  const parts = id.split('_')
  if (parts.length < 4) return null
  const [type, line, inchStr, tag, maybeLen] = parts
  const inch = Number(inchStr)
  const length_mm = (parts.length >= 5 && /^\d+(\.\d+)?$/.test(maybeLen ?? '')) ? Number(maybeLen) : 0
  return {
    type,
    line, // 축약형
    inch: Number.isFinite(inch) ? inch : undefined,
    tag,
    length_mm
  }
}
const num = (v:any, def=0)=> {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

/** ─────────────────────────────────────────────
 * 초기 line 세팅
 * ───────────────────────────────────────────── */
onMounted(()=>{
  const stop = watch(LINE_CODES, (codes)=>{
    if (codes.length && !form.value.line){
      form.value.line = codes[0] // masters 첫 코드 사용
      refreshInches()
      stop()
    }
  }, { immediate:true })
})

/** ─────────────────────────────────────────────
 * items에서 인치 로드 (type/line + master tag)
 * ───────────────────────────────────────────── */
async function refreshInches(){
  if (!form.value.type || !form.value.line) return
  loadingInches.value = true
  try {
    const { tag } = getProcForType(form.value.type)
    const qRef = query(
      collection(db,'items'),
      where('process_tag','==', tag),
      where('type','==', form.value.type),
      where('line','==', shortLine(form.value.line))
    )
    const snap = await getDocs(qRef)
    const set = new Set<number>()
    snap.forEach(d=>{
      const inch = (d.data() as any).inch
      if (typeof inch === 'number') set.add(inch)
      else if (inch!=null){ const n=Number(inch); if(!Number.isNaN(n)) set.add(n) }
    })
    inchOptions.value = Array.from(set).sort((a,b)=>a-b)
  } finally { loadingInches.value = false }
}
/** processes/line/type 변하면 재조회 (tag가 늦게 올 수도 있음) */
watch(() => [form.value.type, form.value.line, TAG_BY_PROCESS_CODE.value], refreshInches, { deep:true })

/** ─────────────────────────────────────────────
 * Inch 버튼 동작/표시
 * ───────────────────────────────────────────── */
function inchCount(inch:number){
  return rows.value
    .filter(r=> r.type===form.value.type && r.line===form.value.line && r.inch===inch)
    .reduce((s,r)=> s+(Number(r.qty)||0), 0)
}
function inchButtonClass(inch:number){
  const c = inchCount(inch)
  const base='relative rounded-xl py-4 text-lg font-medium border-2 transition hover:scale-105 active:scale-95'
  return c>0 ? `${base} bg-green-500 text-white border-green-600 shadow-sm`
             : `${base} bg-white text-gray-800 border-gray-300 hover:bg-emerald-50`
}
function inchButtonStyle(inch:number){
  const c=inchCount(inch); if(c<=0) return {}
  const op=Math.min(1, 0.35 + c*0.15); return { opacity:String(op) }
}

/** ─────────────────────────────────────────────
 * 리스트 조작
 * ───────────────────────────────────────────── */
function handleInchClick(inch:number){ addOrBump(inch) }
function addCustomInch(){
  const v=window.prompt('Inch 값을 숫자로 입력하세요'); if(!v?.trim()) return
  const n=Number(v.trim()); if(!Number.isNaN(n)) addOrBump(n)
}
function addOrBump(inch: number){
  const L = defaultLenFor(form.value.type)
  const newRow: Row = {
    uid: crypto.randomUUID(),
    type: form.value.type,
    line: form.value.line,
    inch,
    length_mm: L,
    qty: 1,
    itemId: makeItemId(form.value.type, form.value.line, inch, L)
  }
  const key = (r:Row)=> `${r.type}|${r.line}|${r.inch}|${r.length_mm}`
  const idx = rows.value.findIndex(r=> key(r)===key(newRow))
  if (idx>=0) rows.value[idx].qty += 1
  else rows.value.unshift(newRow)
}
function onTypeChange(row:Row){
  row.length_mm = defaultLenFor(row.type) // ST2=1000, 나머지(HD2/END/CON/EL2)=0
  syncItemId(row)
}
function syncItemId(row:Row){ row.itemId = makeItemId(row.type, row.line, row.inch, row.length_mm) }
function remove(i:number){ rows.value.splice(i,1) }
function clearAll(){ rows.value = [] }

/** ─────────────────────────────────────────────
 * 업로드: 생산(부모) + BOM 소진(자식) 동시 기록
 *  - 부모: isProduction=true, itemId=parentId
 *  - 자식: isProduction=false, itemId=childId (스키마 필드 자동 주입)
 * ───────────────────────────────────────────── */
const uploading = ref(false)
async function upload(){
  if (!canUpload.value || uploading.value) return
  uploading.value = true
  try {
    const tsNow = serverTimestamp()
    const today = yymmdd()

    for (const r of rows.value){
      const { code: processCode, tag: process_tag } = getProcForType(r.type)
      const parentId = r.itemId
      const lotId = `${parentId}_${today}`

      // 부모(생산 실적)
      const prodParent = {
        ts: tsNow,
        lotId,
        itemId: parentId,
        process: processCode,
        process_tag,
        type: r.type,
        line: shortLine(r.line),
        inch: r.inch,
        length_mm: r.length_mm,
        qty: r.qty,
        stationId: stationId.value,
        uom: FIXED_UOM,
        isProduction: true
      }

      // 자식(소진 실적) - BOM 조회
      const prodCol = collection(db,'productions')
      const useDocs:any[] = []
      const qRef = query(collection(db,'bom'), where('parentId','==', parentId))
      const bomSnap = await getDocs(qRef)

      // child 메타 채우기(items 우선, 없으면 itemId 파싱 폴백)
      for (const d of bomSnap.docs) {
        const b = d.data() as any
        const childId = b.childId
        const qtyPerParent = num(b.qtyPerParent, 0)
        if (!childId || qtyPerParent <= 0) continue

        let cType = '', cLine = '', cInch = 0, cLen = 0, cUom = FIXED_UOM
        try {
          const childSnap = await getDoc(doc(db, 'items', childId))
          if (childSnap.exists()) {
            const ci:any = childSnap.data()
            cType = ci.type ?? ''
            cLine = ci.line ?? ''
            // inch: items에 문자열로 저장됐을 수도 있으니 숫자 변환 안전 처리
            cInch = num(ci.inch, num(ci.inchStr, 0))
            cLen  = num(ci.length_mm, 0)
            cUom  = b.uomChild || ci.uom || FIXED_UOM
          } else {
            const p = parseItemId(childId)
            if (p) {
              cType = p.type; cLine = p.line; cInch = num(p.inch, 0); cLen = num(p.length_mm, 0)
            }
            cUom = b.uomChild || FIXED_UOM
          }
        } catch {
          const p = parseItemId(childId)
          if (p) {
            cType = p.type; cLine = p.line; cInch = num(p.inch, 0); cLen = num(p.length_mm, 0)
          }
          cUom = b.uomChild || FIXED_UOM
        }

        useDocs.push({
          ts: tsNow,
          lotId,
          parentId,                 // 추적
          itemId: childId,
          process: processCode,
          process_tag,
          // productions 스키마 정합성 확보
          type: cType,
          line: cLine,
          inch: cInch,
          length_mm: cLen,
          qty: qtyPerParent * r.qty,
          uom: cUom,
          isProduction: false,
          stationId: stationId.value
        })
      }

      // 쓰기(부모 + 자식N)
      const writes:Promise<any>[] = [ addDoc(prodCol, prodParent) ]
      useDocs.forEach(docData => writes.push(addDoc(prodCol, docData)))
      await Promise.all(writes)
    }

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
