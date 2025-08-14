<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header / Filters -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Factory Inventory</h1>

      <div class="flex flex-wrap gap-3 items-center">
        <input v-model="filters.search" type="text" placeholder="Search itemId / label" class="input w-56" />
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" v-model="filters.hasBomOnly" /> Only items with BOM
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <span>Qty ≥</span>
          <input v-model.number="filters.minQty" type="number" class="input h-9 w-20" />
        </label>
        <button class="btn" @click="clearFilters">Clear</button>
      </div>
    </div>

    <!-- Table wrapper (scroll) -->
    <div class="overflow-auto rounded-2xl border bg-white shadow-sm relative">
      <table class="min-w-[1100px] w-full table-fixed">
        <thead class="sticky top-0 z-10 bg-gray-50 border-b">
          <tr>
            <th class="th w-10"></th>

            <!-- itemId -->
            <th class="th text-left">
              <div class="flex items-center gap-1">
                <button class="font-medium text-left" @click="sortBy('itemId')">
                  itemId <span class="sort">{{ sortIcon('itemId') }}</span>
                </button>
              </div>
            </th>

            <!-- type -->
            <th class="th w-36">
              <div class="flex items-center justify-end gap-1 relative">
                <button @click="sortBy('type')">type <span class="sort">{{ sortIcon('type') }}</span></button>
                <button class="h-6 w-6 rounded border text-xs" @click.stop="toggleHeadFilter('type')">▼</button>
                <div v-if="headFilter.open==='type'" class="popover" @click.stop>
                  <div class="p-2 text-sm max-h-64 overflow-auto">
                    <label class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :checked="filters.types.length===0" @change="setTypesAll()" />
                      <span>(all)</span>
                    </label>
                    <label v-for="t in typeOptions" :key="t" class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :value="t" v-model="filters.types" />
                      <span>{{ t }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </th>

            <!-- line -->
            <th class="th w-36">
              <div class="flex items-center justify-end gap-1 relative">
                <button @click="sortBy('line')">line <span class="sort">{{ sortIcon('line') }}</span></button>
                <button class="h-6 w-6 rounded border text-xs" @click.stop="toggleHeadFilter('line')">▼</button>
                <div v-if="headFilter.open==='line'" class="popover" @click.stop>
                  <div class="p-2 text-sm max-h-64 overflow-auto">
                    <label class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :checked="filters.lines.length===0" @change="setLinesAll()" />
                      <span>(all)</span>
                    </label>
                    <label v-for="l in lineOptions" :key="l" class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :value="l" v-model="filters.lines" />
                      <span>{{ l }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </th>

            <!-- inch -->
            <th class="th w-28">
              <div class="flex items-center justify-end gap-1 relative">
                <button @click="sortBy('inch')">inch <span class="sort">{{ sortIcon('inch') }}</span></button>
                <button class="h-6 w-6 rounded border text-xs" @click.stop="toggleHeadFilter('inch')">▼</button>
                <div v-if="headFilter.open==='inch'" class="popover" @click.stop>
                  <div class="p-2 text-sm max-h-64 overflow-auto">
                    <label class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :checked="filters.inches.length===0" @change="setInchesAll()" />
                      <span>(all)</span>
                    </label>
                    <label v-for="i in inchOptions" :key="i" class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :value="i" v-model="filters.inches" />
                      <span>{{ i }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </th>

            <!-- length / uom -->
            <th class="th w-40">
              <button @click="sortBy('length_mm')">length / UOM <span class="sort">{{ sortIcon('length_mm') }}</span></button>
            </th>

            <!-- qty -->
            <th class="th w-28">
              <button @click="sortBy('stock')">qty <span class="sort">{{ sortIcon('stock') }}</span></button>
            </th>

            <!-- uom -->
            <th class="th w-24">
              <div class="flex items-center justify-end gap-1 relative">
                <button @click="sortBy('uom')">uom <span class="sort">{{ sortIcon('uom') }}</span></button>
                <button class="h-6 w-6 rounded border text-xs" @click.stop="toggleHeadFilter('uom')">▼</button>
                <div v-if="headFilter.open==='uom'" class="popover" @click.stop>
                  <div class="p-2 text-sm">
                    <label class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :checked="filters.uoms.length===0" @change="setUomsAll()" />
                      <span>(all)</span>
                    </label>
                    <label class="flex items-center gap-2 mb-1">
                      <input type="checkbox" value="EA" v-model="filters.uoms" /><span>EA</span>
                    </label>
                    <label class="flex items-center gap-2 mb-1">
                      <input type="checkbox" value="M" v-model="filters.uoms" /><span>M</span>
                    </label>
                    <label class="flex items-center gap-2">
                      <input type="checkbox" value="ST" v-model="filters.uoms" /><span>ST</span>
                    </label>
                  </div>
                </div>
              </div>
            </th>
          </tr>
        </thead>

        <tbody @click="headFilter.open=''">
          <template v-for="row in pagedRows" :key="row.itemId">
            <!-- Main row -->
            <tr class="border-t">
              <td class="px-3 py-2 text-center align-middle">
                <button @click.stop="onExpand(row.itemId)" class="h-7 w-7 rounded-xl border flex items-center justify-center hover:bg-gray-50">
                  <span :class="expanded[row.itemId] ? 'rotate-90' : ''" class="transition-transform">▶</span>
                </button>
              </td>
              <td class="px-3 py-2">
                <div class="font-medium truncate">{{ row.itemId }}</div>
                <div v-if="row.label" class="text-xs text-gray-500 truncate">{{ row.label }}</div>
              </td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.type }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.line }}</td>
              <td class="px-3 py-2 text-right tabular-nums">{{ row.inch }}</td>
              <td class="px-3 py-2 text-right tabular-nums">
                <template v-if="row.length_mm && row.length_mm > 0">{{ row.length_mm.toLocaleString() }} mm</template>
                <template v-else>{{ row.uom }}</template>
              </td>
              <td class="px-3 py-2 text-right tabular-nums">{{ (row.stock ?? 0).toLocaleString() }}</td>
              <td class="px-3 py-2 text-right">{{ row.uom }}</td>
            </tr>

            <!-- Expand row -->
            <tr v-if="expanded[row.itemId]" class="bg-gray-50">
              <td class="px-3 py-3" colspan="8">
                <div class="text-sm text-gray-600 mb-2">Components (BOM auto-depth)</div>
                <div class="rounded-xl border bg-white overflow-hidden">
                  <table class="w-full">
                    <thead class="bg-gray-50 border-b text-xs text-gray-500">
                      <tr>
                        <th class="px-3 py-2 text-left">item</th>
                        <th class="px-3 py-2 text-right">stock</th>
                        <th class="px-3 py-2 text-right">need / LV1</th>
                        <th class="px-3 py-2 text-right">buildable LV1</th>
                      </tr>
                    </thead>

                    <tbody v-if="(deepRowsByParent.get(row.itemId) || []).length">
                      <tr
                        v-for="dr in deepRowsByParent.get(row.itemId)"
                        :key="row.itemId + '::' + dr.parentChain.join('>') + '::' + dr.id + '::' + dr.depth"
                        class="border-t"
                        :class="dr.depth>1 ? 'bg-gray-50/40' : ''"
                      >
                        <td class="px-3 py-2">
                          <div class="truncate text-sm">
                            <span :style="{ paddingLeft: (dr.depth*16) + 'px' }">
                              <template v-if="dr.depth>1">└ </template>
                              <span class="font-medium">{{ dr.id }}</span>
                            </span>
                          </div>
                          <div class="text-xs text-gray-500" :style="{ paddingLeft: (dr.depth*16) + 'px' }">
                            uom: {{ dr.uomChild }}
                          </div>
                        </td>
                        <td class="px-3 py-2 text-right text-sm tabular-nums">
                          {{ formatQty(dr.stock, dr.uomChild) }}
                        </td>
                        <td class="px-3 py-2 text-right text-sm tabular-nums">
                          {{ dr.needPerLv1 }} / {{ row.uom }}
                        </td>
                        <td class="px-3 py-2 text-right text-sm tabular-nums">
                          {{ dr.buildableLv1 }}
                        </td>
                      </tr>
                    </tbody>

                    <tbody v-else>
                      <tr><td class="px-3 py-3 text-sm text-gray-500" colspan="4">No BOM rows.</td></tr>
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <!-- Pagination -->
      <div class="flex items-center justify-between px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
        <div>Rows: {{ filteredRows.length }}</div>
        <div class="flex items-center gap-2">
          <button class="btn" @click="prevPage" :disabled="page.index===0">Prev</button>
          <div>{{ page.index+1 }} / {{ pageCount }}</div>
          <button class="btn" @click="nextPage" :disabled="page.index>=pageCount-1">Next</button>
          <select v-model.number="page.size" class="select h-9 w-24">
            <option :value="10">10 / page</option>
            <option :value="20">20 / page</option>
            <option :value="50">50 / page</option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { db } from '@/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

/* ---------- Types ---------- */
interface Item {
  itemId: string
  label?: string
  uom: 'EA' | 'M' | 'ST'
  product_level: number
  active: boolean
  type: string
  line: string
  inch: string
  length_mm: number
}
interface BomEdge {
  parentId: string
  childId: string
  qtyPerParent: number
  uomParent: string
  uomChild: string
}
interface RowVM {
  itemId: string
  label?: string
  uom: 'EA' | 'M' | 'ST'
  stock: number | null
  type: string
  line: string
  inch: string
  length_mm: number
}
interface DeepRow {
  id: string
  uomChild: string
  stock: number
  needPerLv1: number
  buildableLv1: number
  depth: number
  parentChain: string[]
}

/* ---------- UI State ---------- */
const filters = reactive({
  search: '',
  hasBomOnly: false,
  minQty: 0,
  // multi-selects (empty = all)
  types: [] as string[],
  lines: [] as string[],
  inches: [] as string[],
  uoms: [] as string[],
})
const expanded = reactive<Record<string, boolean>>({})
const headFilter = reactive<{open:''|'type'|'line'|'inch'|'uom'}>({ open: '' })
function toggleHeadFilter(k:'type'|'line'|'inch'|'uom'){ headFilter.open = (headFilter.open===k ? '' : k) }

/* ---------- Data Stores ---------- */
const products = ref<Item[]>([])
const rows = ref<RowVM[]>([])
const bomIndex = ref<Map<string, BomEdge[]>>(new Map())
const stockMap = ref<Map<string, number>>(new Map())
const deepRowsByParent = ref<Map<string, DeepRow[]>>(new Map())

/* ---------- Sort / Pagination ---------- */
const sort = reactive<{ key: keyof RowVM | 'length_mm'; dir: 'asc'|'desc' }>({ key:'itemId', dir:'asc' })
function sortBy(k: keyof RowVM | 'length_mm'){ if (sort.key===k) sort.dir = (sort.dir==='asc'?'desc':'asc'); else { sort.key=k; sort.dir='asc' } }
function sortIcon(k: keyof RowVM | 'length_mm'){ return sort.key===k ? (sort.dir==='asc'?'▲':'▼') : '' }

const page = reactive({ index:0, size:20 })
function nextPage(){ if(page.index < pageCount.value-1) page.index++ }
function prevPage(){ if(page.index>0) page.index-- }

/* ---------- Filter Options ---------- */
const typeOptions = computed(() => Array.from(new Set(products.value.map(p=>p.type))).sort())
const lineOptions = computed(() => Array.from(new Set(products.value.map(p=>p.line))).sort())
const inchOptions = computed(() => Array.from(new Set(products.value.map(p=>p.inch))).sort((a,b)=>{
  const na = parseFloat(a as any), nb = parseFloat(b as any)
  if (isNaN(na)||isNaN(nb)) return String(a).localeCompare(String(b))
  return na-nb
}))

/* ---------- Helpers ---------- */
function clearFilters(){
  filters.search=''; filters.hasBomOnly=false; filters.minQty=0
  filters.types=[]; filters.lines=[]; filters.inches=[]; filters.uoms=[]
  headFilter.open=''
}
function setTypesAll(){ filters.types=[] }
function setLinesAll(){ filters.lines=[] }
function setInchesAll(){ filters.inches=[] }
function setUomsAll(){ filters.uoms=[] }
function formatQty(qty:number, uom?:string){ return `${(qty||0).toLocaleString()}${uom ? ' '+uom : ''}` }

/* ---------- Firestore ---------- */
async function fetchFinishedItems(){
  const q = query(collection(db,'items'), where('product_level','==',1), where('active','==',true))
  const snap = await getDocs(q)
  products.value = snap.docs.map(d=>d.data() as Item)
}
async function fetchBomFor(parentId:string){
  if (bomIndex.value.has(parentId)) return bomIndex.value.get(parentId)!
  const q = query(collection(db,'bom'), where('parentId','==', parentId))
  const snap = await getDocs(q)
  const edges = snap.docs.map(d=>d.data() as BomEdge)
  bomIndex.value.set(parentId, edges); return edges
}
async function computeStock(itemId:string): Promise<number>{
  if (stockMap.value.has(itemId)) return stockMap.value.get(itemId)!
  const q = query(collection(db,'productions'), where('itemId','==', itemId))
  const snap = await getDocs(q)
  let s = 0
  snap.forEach(d=>{ const r = d.data() as any; s += (r.isProduction ? 1 : -1) * (r.qty || 0) })
  stockMap.value.set(itemId, s); return s
}

/* ---------- Deep BOM build (auto-depth) ---------- */
async function ensureBomAndStock(itemId: string) {
  await fetchBomFor(itemId)
  if (!stockMap.value.has(itemId)) await computeStock(itemId)
}
async function buildDeepRows(parentId: string, depthLimit = 99) {
  await ensureBomAndStock(parentId)
  const acc: DeepRow[] = []
  const visiting = new Set<string>()

  async function dfs(curParent: string, factor: number, chain: string[], depth: number) {
    if (depth > depthLimit) return
    const edges = bomIndex.value.get(curParent) || []
    if (!edges.length) return
    visiting.add(curParent)

    for (const e of edges) {
      await ensureBomAndStock(e.childId)
      const stock = stockMap.value.get(e.childId) || 0
      const needPerLv1 = (e.qtyPerParent || 0) * factor
      const buildableLv1 = needPerLv1 ? Math.floor(stock / needPerLv1) : 0

      acc.push({
        id: e.childId,
        uomChild: e.uomChild,
        stock,
        needPerLv1,
        buildableLv1,
        depth,
        parentChain: [...chain, curParent]
      })

      const nextEdges = bomIndex.value.get(e.childId) || []
      if (nextEdges.length && !visiting.has(e.childId)) {
        await dfs(e.childId, needPerLv1, [...chain, curParent], depth + 1)
      }
    }
    visiting.delete(curParent)
  }

  await dfs(parentId, 1, [], 1)
  deepRowsByParent.value.set(parentId, acc)
}

/* ---------- Rows ---------- */
async function hydrateRow(item:Item): Promise<RowVM>{
  // 초기 로딩 성능: stock은 지연 계산(null) → 페이지 진입 시만 계산
  return {
    itemId:item.itemId, label:(item as any).label, uom:item.uom,
    stock: null, type:item.type, line:item.line, inch:item.inch, length_mm:item.length_mm
  }
}
async function refreshAll(){
  await fetchFinishedItems()
  rows.value = await Promise.all(products.value.map(hydrateRow))
}

/* ---------- Derived ---------- */
const filteredRows = computed(()=>{
  let r = rows.value
  const s = filters.search.trim().toLowerCase()
  if (s) r = r.filter(x => x.itemId.toLowerCase().includes(s) || (x.label?.toLowerCase().includes(s)))
  if (filters.types.length)  r = r.filter(x => filters.types.includes(x.type))
  if (filters.lines.length)  r = r.filter(x => filters.lines.includes(x.line))
  if (filters.inches.length) r = r.filter(x => filters.inches.includes(x.inch))
  if (filters.uoms.length)   r = r.filter(x => filters.uoms.includes(x.uom))
  // hasBomOnly: 필요한 경우에만 BOM 로드 (페이지 단위로 점진적)
  if (filters.hasBomOnly) {
    r = r.filter(x => (bomIndex.value.get(x.itemId)?.length || 0) > 0)
  }
  // 정렬
  r = [...r].sort((a:any,b:any)=>{
    const k = sort.key as string, av = a[k], bv = b[k]
    if (typeof av === 'number' && typeof bv === 'number') return sort.dir==='asc' ? av-bv : bv-av
    return sort.dir==='asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''))
  })
  // 수량 필터 (stock이 아직 null이면 통과 → 페이지 로딩 시 계산됨)
  if (filters.minQty) r = r.filter(x => (x.stock ?? Infinity) >= filters.minQty)
  return r
})
const pageCount = computed(()=> Math.max(1, Math.ceil(filteredRows.value.length / page.size)))
const pagedRows = computed(()=> filteredRows.value.slice(page.index*page.size, (page.index+1)*page.size))

/* ---------- Progressive loading (performance) ---------- */
// 1) 페이지에 보이는 행들만 stock 병렬 계산 & 캐시
watch(pagedRows, async (list) => {
  await nextTick()
  await Promise.all(list.map(async (row) => {
    if (row.stock === null) row.stock = await computeStock(row.itemId)
  }))
}, { immediate: true })

// 2) hasBomOnly 켜졌을 때만, 아직 모르는 parent의 BOM을 배치로 가져오기 (부하 완화)
watch(() => filters.hasBomOnly, async (on) => {
  if (!on) return
  // 페이지 단위로 점진적 로딩
  const parents = filteredRows.value.map(r => r.itemId)
  // 한 번에 너무 많이 쿼리하지 않도록 청크 처리
  const chunkSize = 20
  for (let i=0; i<parents.length; i+=chunkSize) {
    const chunk = parents.slice(i, i+chunkSize)
    await Promise.all(chunk.map(pid => fetchBomFor(pid)))
  }
})

// 3) 헤더 팝오버 바깥 클릭 시 닫기
window.addEventListener('click', () => { headFilter.open='' })

/* ---------- Expand orchestration ---------- */
async function onExpand(parentId:string){
  expanded[parentId] = !expanded[parentId]
  if (!expanded[parentId]) return
  await buildDeepRows(parentId) // 리프까지
}

onMounted(()=>{ refreshAll() })
</script>

<style scoped>
.input { @apply border rounded-lg h-10 px-3 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400; }
.select { @apply border rounded-lg h-10 px-3 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400; }
.btn { @apply inline-flex items-center justify-center h-9 px-3 rounded-xl border bg-white hover:bg-gray-50 active:scale-[.99]; }
.th { @apply px-3 py-2 text-xs font-medium text-gray-600 text-right align-top; }
.th.text-left { @apply text-left; }
.sort { @apply inline-block w-4 text-gray-400; }
.tabular-nums { font-variant-numeric: tabular-nums; }
.popover { @apply absolute right-0 mt-1 rounded-xl border shadow bg-white z-20; min-width: 180px; }
</style>
