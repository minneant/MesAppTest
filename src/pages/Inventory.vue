<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header / Filters -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Factory Inventory</h1>

      <div class="flex flex-wrap gap-3 items-center">
        <input v-model="filters.search" type="text" placeholder="Search itemId / label" class="input w-56" />
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" v-model="filters.hasStocks" /> Only items with Stocks
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-600">
          <span>Qty ≥</span>
          <input v-model.number="filters.minQty" type="number" class="input h-9 w-20" />
        </label>
        <button class="btn" @click="clearFilters">Clear</button>
        <button class="btn !ml-4" :disabled="selectedIds.size===0" @click="openShipModal">
          출하 입력 ({{ selectedIds.size }})
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-auto rounded-2xl border bg-white shadow-sm relative">
      <table class="min-w-[1150px] w-full table-fixed">
        <thead class="sticky top-0 z-10 bg-gray-50 border-b">
          <tr>
            <th class="th w-12">
              <input type="checkbox" :checked="allOnPageSelected" @change="toggleSelectPage($event)" />
            </th>
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
                      <input type="checkbox" :checked="filters.types.length===0" @change="filters.types=[]" />
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
                      <input type="checkbox" :checked="filters.lines.length===0" @change="filters.lines=[]" />
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
                      <input type="checkbox" :checked="filters.inches.length===0" @change="filters.inches=[]" />
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
            <th class="th w-40">
              <button @click="sortBy('computedQty')">qty (pa + from PL2) <span class="sort">{{ sortIcon('computedQty') }}</span></button>
            </th>

            <!-- uom -->
            <th class="th w-24">
              <div class="flex items-center justify-end gap-1 relative">
                <button @click="sortBy('uom')">uom <span class="sort">{{ sortIcon('uom') }}</span></button>
                <button class="h-6 w-6 rounded border text-xs" @click.stop="toggleHeadFilter('uom')">▼</button>
                <div v-if="headFilter.open==='uom'" class="popover" @click.stop>
                  <div class="p-2 text-sm">
                    <label class="flex items-center gap-2 mb-1">
                      <input type="checkbox" :checked="filters.uoms.length===0" @change="filters.uoms=[]" />
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
                <input type="checkbox" :checked="selectedIds.has(row.itemId)" @change="toggleSelect(row.itemId, $event)" />
              </td>
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
              <td class="px-3 py-2 text-right tabular-nums">
                <div class="font-semibold">{{ (row.computedQty ?? 0).toLocaleString() }}</div>
                <div class="text-[11px] text-gray-500">
                  pa {{ (row.stockPa ?? 0).toLocaleString() }} + from PL2 {{ (row.fromPl2 ?? 0).toLocaleString() }}
                </div>
              </td>
              <td class="px-3 py-2 text-right">{{ row.uom }}</td>
            </tr>

            <!-- Expand row (BOM auto-depth) -->
            <tr v-if="expanded[row.itemId]" class="bg-gray-50">
              <td class="px-3 py-3" colspan="9">
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

    <!-- Shipping Modal -->
    <div v-if="ship.open" class="fixed inset-0 bg-black/40 z-30 flex items-center justify-center" @click.self="ship.open=false">
      <div class="bg-white rounded-2xl shadow-xl w-[min(900px,95vw)] max-h-[85vh] overflow-auto p-5">
        <div class="flex items-center justify-between mb-3">
          <div class="text-lg font-semibold">출하 입력</div>
          <button class="btn" @click="ship.open=false">닫기</button>
        </div>

        <table class="w-full border rounded-xl overflow-hidden">
          <thead class="bg-gray-50 border-b text-xs text-gray-500">
            <tr>
              <th class="px-3 py-2 text-left">itemId</th>
              <th class="px-3 py-2 text-right">가능수량(표시 qty)</th>
              <th class="px-3 py-2 text-right">요청 출하 수량</th>
              <th class="px-3 py-2 text-right">미출하</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in ship.entries" :key="it.itemId" class="border-t">
              <td class="px-3 py-2">
                <div class="font-medium">{{ it.itemId }}</div>
                <div class="text-xs text-gray-500">uom: {{ it.uom }}</div>
              </td>
              <td class="px-3 py-2 text-right tabular-nums">{{ (it.available ?? 0).toLocaleString() }}</td>
              <td class="px-3 py-2 text-right">
                <input type="number" class="input h-9 w-28 text-right" v-model.number="it.toShip" min="0" />
              </td>
              <td class="px-3 py-2 text-right tabular-nums text-rose-600">
                {{ Math.max(0, (it.toShip||0) - (it.feasible||0)).toLocaleString() }}
              </td>
            </tr>
          </tbody>
        </table>

        <div class="flex justify-end gap-2 mt-4">
          <button class="btn" @click="recalcShipFeasible">재계산</button>
          <button class="btn" :disabled="shipUploading" @click="uploadShipping">{{ shipUploading ? 'Uploading…' : 'Upload' }}</button>
        </div>

        <div v-if="ship.errors.length" class="mt-3 text-sm text-rose-600">
          <div v-for="e in ship.errors" :key="e">• {{ e }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { db } from '@/firebase'
import { collection, query, where, getDocs, getDoc, doc, addDoc, serverTimestamp } from 'firebase/firestore'

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
  stockPa: number | null          // PL1 stock
  fromPl2: number | null          // buildable from PL2
  computedQty: number | null      // stockPa + fromPl2
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
  hasStocks: false,  // qty 0 제외
  minQty: 0,
  types: [] as string[],
  lines: [] as string[],
  inches: [] as string[],
  uoms: [] as string[],
})
const expanded = reactive<Record<string, boolean>>({})
const headFilter = reactive<{open:''|'type'|'line'|'inch'|'uom'}>({ open: '' })
function toggleHeadFilter(k:'type'|'line'|'inch'|'uom'){ headFilter.open = (headFilter.open===k ? '' : k) }

/* ---------- Data Stores ---------- */
const products = ref<Item[]>([])                       // PL1 only
const itemsById = ref<Map<string, Item>>(new Map())    // meta lookup
const rows = ref<RowVM[]>([])
const bomIndex = ref<Map<string, BomEdge[]>>(new Map())
const stockMap = ref<Map<string, number>>(new Map())   // any item stock
const deepRowsByParent = ref<Map<string, DeepRow[]>>(new Map())
const buildablePl2Map = ref<Map<string, number>>(new Map()) // parentId -> buildable from PL2

/* ---------- Selection ---------- */
const selectedIds = ref<Set<string>>(new Set())
function toggleSelect(id:string, ev:Event){
  const on = (ev.target as HTMLInputElement).checked
  on ? selectedIds.value.add(id) : selectedIds.value.delete(id)
}
const allOnPageSelected = computed(()=> pagedRows.value.length>0 && pagedRows.value.every(r=>selectedIds.value.has(r.itemId)))
function toggleSelectPage(ev:Event){
  const on = (ev.target as HTMLInputElement).checked
  pagedRows.value.forEach(r=> on ? selectedIds.value.add(r.itemId) : selectedIds.value.delete(r.itemId))
}

/* ---------- Sort / Pagination ---------- */
const sort = reactive<{ key: keyof RowVM | 'length_mm' | 'computedQty'; dir: 'asc'|'desc' }>({ key:'itemId', dir:'asc' })
function sortBy(k: keyof RowVM | 'length_mm' | 'computedQty'){ if (sort.key===k) sort.dir = (sort.dir==='asc'?'desc':'asc'); else { sort.key=k; sort.dir='asc' } }
function sortIcon(k: keyof RowVM | 'length_mm' | 'computedQty'){ return sort.key===k ? (sort.dir==='asc'?'▲':'▼') : '' }

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
  filters.search=''; filters.hasStocks=false; filters.minQty=0
  filters.types=[]; filters.lines=[]; filters.inches=[]; filters.uoms=[]; headFilter.open=''
}
function formatQty(qty:number, uom?:string){ return `${(qty||0).toLocaleString()}${uom ? ' '+uom : ''}` }
function yyyymmddLocal(){
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const day = String(d.getDate()).padStart(2,'0')
  return `${y}${m}${day}`
}

/* ---------- ItemId 조립: makeItemId 최우선 사용, 미존재 시 안전 폴백 ---------- */
function replaceTagInItemId(originalId: string, newTag: string): string {
  const parts = originalId.split('_')
  if (parts.length < 2) return originalId + '_' + newTag
  const last = parts[parts.length-1]
  const hasLengthSuffix = /^L\d+$/i.test(last)
  const tagIndex = hasLengthSuffix ? parts.length-2 : parts.length-1
  parts[tagIndex] = newTag
  return parts.join('_')
}
function buildItemIdFromMeta(meta: Item, newTag: string): string {
  // 1) 프로젝트 전역/유틸에 이미 있는 makeItemId가 있으면 그걸 사용
  try {
    // @ts-ignore
    if (typeof makeItemId === 'function') {
      // @ts-ignore
      return makeItemId(meta.type, meta.line, Number(meta.inch), newTag, Number(meta.length_mm))
    }
  } catch {}
  // 2) 없으면 안전하게 기존 id의 tag만 교체
  return replaceTagInItemId(meta.itemId, newTag)
}

/* ---------- Process Tags (masters/processes) ---------- */
const processTags = ref<Record<string,string>>({})
async function fetchProcessTags(){
  // masters/processes: { list: [{name:'Packaging', tag:'pa'}, {name:'Shipping', tag:'sh'}, ...] }
  const snap = await getDoc(doc(db, 'masters', 'processes'))
  const data = snap.exists() ? snap.data() as any : {}
  const list = Array.isArray(data?.list) ? data.list : []
  const map: Record<string,string> = {}
  for (const p of list){ if (p?.name && p?.tag) map[p.name] = p.tag }
  if (!map['Packaging']) map['Packaging'] = 'pa'
  if (!map['Shipping']) map['Shipping'] = 'sh'
  processTags.value = map
}
function tagOf(name:string){ return processTags.value[name] || name.toLowerCase() }

/* ---------- Firestore ---------- */
async function fetchAllItemsToMap(){
  const snap = await getDocs(collection(db,'items'))
  itemsById.value = new Map(snap.docs.map(d=> {
    const it = d.data() as Item
    return [it.itemId, it]
  }))
}
async function fetchFinishedItems(){
  const q = query(collection(db,'items'), where('product_level','==',1), where('active','==',true))
  const snap = await getDocs(q)
  products.value = snap.docs.map(d=> d.data() as Item)
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

/* ---------- Buildable (PL2 only) ---------- */
async function buildableFromPL2(parentId:string): Promise<number>{
  if (buildablePl2Map.value.has(parentId)) return buildablePl2Map.value.get(parentId)!
  const edges = await fetchBomFor(parentId)
  if (!edges.length) { buildablePl2Map.value.set(parentId, 0); return 0 }

  // PL2 자식만 대상으로 병목 계산
  let minUnits = Number.POSITIVE_INFINITY
  let anyPl2 = false
  for (const e of edges){
    const child = itemsById.value.get(e.childId)
    if (!child || child.product_level !== 2) continue
    anyPl2 = true
    const stock = await computeStock(e.childId)
    const units = e.qtyPerParent ? Math.floor(stock / e.qtyPerParent) : 0
    minUnits = Math.min(minUnits, units)
  }
  const val = anyPl2 ? (isFinite(minUnits) ? minUnits : 0) : 0
  buildablePl2Map.value.set(parentId, val)
  return val
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
  return {
    itemId:item.itemId, label:(item as any).label, uom:item.uom,
    stockPa: null, fromPl2: null, computedQty: null,
    type:item.type, line:item.line, inch:item.inch, length_mm:item.length_mm
  }
}
async function refreshAll(){
  await fetchProcessTags()
  await fetchAllItemsToMap()
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

  // qty 0 제외
  if (filters.hasStocks) r = r.filter(x => ((x.computedQty ?? 0) > 0))

  r = [...r].sort((a:any,b:any)=>{
    const k = sort.key as string, av = a[k], bv = b[k]
    if (typeof av === 'number' && typeof bv === 'number') return sort.dir==='asc' ? av-bv : bv-av
    return sort.dir==='asc' ? String(av ?? '').localeCompare(String(bv ?? '')) : String(bv ?? '').localeCompare(String(av ?? ''))
  })

  if (filters.minQty) r = r.filter(x => ((x.computedQty ?? 0) >= filters.minQty))
  return r
})
const pageCount = computed(()=> Math.max(1, Math.ceil(filteredRows.value.length / page.size)))
const pagedRows = computed(()=> filteredRows.value.slice(page.index*page.size, (page.index+1)*page.size))

/* ---------- Progressive loading ---------- */
async function computeQtyFor(list: RowVM[]) {
  await Promise.all(list.map(async (row) => {
    if (row.stockPa === null) row.stockPa = await computeStock(row.itemId)
    if (row.fromPl2 === null) row.fromPl2 = await buildableFromPL2(row.itemId)
    row.computedQty = (row.stockPa || 0) + (row.fromPl2 || 0)
  }))
}
async function computeQtyForAll() { await computeQtyFor(rows.value) }

watch(pagedRows, async (list) => {
  await nextTick()
  await computeQtyFor(list)    // 페이지 단위 지연 계산
}, { immediate: true })

// "Only items with Stocks"나 수량 조건이 켜지면 즉시 전 품목 선계산 → 필터 바로 반영
watch(() => [filters.hasStocks, filters.minQty, sort.key === 'computedQty'], async ([has, min, byQty]) => {
  if (has || (min || 0) > 0 || byQty) await computeQtyForAll()
})

window.addEventListener('click', () => { headFilter.open='' })

/* ---------- Expand orchestration ---------- */
async function onExpand(parentId:string){
  expanded[parentId] = !expanded[parentId]
  if (!expanded[parentId]) return
  await buildDeepRows(parentId) // 리프까지
}

/* ---------- Shipping Modal / Logic ---------- */
const ship = reactive<{ open:boolean, entries: {itemId:string,uom:string,available:number|undefined,feasible:number|undefined,toShip:number}[], errors:string[] }>({
  open:false, entries:[], errors:[]
})
const shipUploading = ref(false)

function openShipModal(){
  ship.errors = []
  ship.entries = Array.from(selectedIds.value).map(id=>{
    const r = rows.value.find(x=>x.itemId===id)!
    return { itemId:id, uom:r.uom, available:r.computedQty ?? 0, feasible:r.computedQty ?? 0, toShip:0 }
  })
  ship.open = true
}

async function recalcShipFeasible(){
  ship.errors = []
  for (const e of ship.entries){
    const pa = await computeStock(e.itemId)
    const from2 = await buildableFromPL2(e.itemId)
    e.available = pa + from2
    e.feasible = e.available
  }
}

/* ---------- Upload Shipping ---------- */
async function uploadShipping(){
  shipUploading.value = true
  ship.errors = []
  try{
    const tagShipping = tagOf('Shipping')
    const tagPackaging = tagOf('Packaging')

    for (const entry of ship.entries){
      const want = Math.max(0, entry.toShip || 0)
      if (!want) continue

      // 최신 재고/병목 재계산
      const paStock = await computeStock(entry.itemId)
      const edges = await fetchBomFor(entry.itemId)
      const pl2Edges = edges.filter(e => (itemsById.value.get(e.childId)?.product_level === 2))
      const buildable2 = await buildableFromPL2(entry.itemId)

      // 1) Shipping 공정 "생산" 기록 (makeItemId 규칙으로 재조합 + lotId 규칙 itemId+"_YYYYMMDD")
      const parentMeta = itemsById.value.get(entry.itemId)
      const shippingItemId = buildItemIdFromMeta(parentMeta!, tagShipping)
      const shippingLotId = `${shippingItemId}_${yyyymmddLocal()}`

      await addDoc(collection(db,'productions'), {
        ts: serverTimestamp(),
        lotId: shippingLotId,
        itemId: shippingItemId,
        type: parentMeta?.type ?? '',
        line: parentMeta?.line ?? '',
        inch: parentMeta?.inch ?? '',
        length_mm: parentMeta?.length_mm ?? 0,
        qty: want,
        isProduction: true,
        process: 'Shipping',
        process_tag: tagShipping,
        stationId: 'inventory-ui',
        uom: entry.uom
      })

      // 2) 포장 부족분 Packaging "생산" (부족분만) — lotId도 itemId+"_YYYYMMDD"
      const shortage = Math.max(0, want - paStock)
      const canByPl2 = Math.min(shortage, buildable2)
      if (canByPl2 > 0){
        const paLot = `${entry.itemId}_${yyyymmddLocal()}`
        await addDoc(collection(db,'productions'), {
          ts: serverTimestamp(),
          lotId: paLot,
          itemId: entry.itemId,
          type: parentMeta?.type ?? '',
          line: parentMeta?.line ?? '',
          inch: parentMeta?.inch ?? '',
          length_mm: parentMeta?.length_mm ?? 0,
          qty: canByPl2,
          isProduction: true,
          process: 'Packaging',
          process_tag: tagPackaging,
          stationId: 'inventory-ui',
          uom: entry.uom
        })
        stockMap.value.set(entry.itemId, paStock + canByPl2)
      }

      // 3) Packaging에 사용된 PL2 소진 (lotId 규칙 동일: child.itemId+"_YYYYMMDD")
      if (canByPl2 > 0){
        for (const e of pl2Edges){
          const need = (e.qtyPerParent || 0) * canByPl2
          if (need <= 0) continue
          const childMeta = itemsById.value.get(e.childId)
          const childLot = `${e.childId}_${yyyymmddLocal()}`
          await addDoc(collection(db,'productions'), {
            ts: serverTimestamp(),
            lotId: childLot,
            itemId: e.childId,
            type: childMeta?.type ?? '',
            line: childMeta?.line ?? '',
            inch: childMeta?.inch ?? '',
            length_mm: childMeta?.length_mm ?? 0,
            qty: need,
            isProduction: false,
            process: 'Packaging',
            process_tag: tagPackaging,
            stationId: 'inventory-ui',
            uom: e.uomChild
          })
          const cur = await computeStock(e.childId)
          stockMap.value.set(e.childId, cur - need)
        }
      }

      // 4) Shipping 소진 (원본 itemId) — lotId: 원본 itemId+"_YYYYMMDD"
      const shippingUseLot = `${entry.itemId}_${yyyymmddLocal()}`
      await addDoc(collection(db,'productions'), {
        ts: serverTimestamp(),
        lotId: shippingUseLot,
        itemId: entry.itemId,
        type: parentMeta?.type ?? '',
        line: parentMeta?.line ?? '',
        inch: parentMeta?.inch ?? '',
        length_mm: parentMeta?.length_mm ?? 0,
        qty: want,
        isProduction: false,
        process: 'Shipping',
        process_tag: tagShipping,
        stationId: 'inventory-ui',
        uom: entry.uom
      })

      // 캐시 반영
      const newPa = (paStock + canByPl2) - want
      stockMap.value.set(entry.itemId, newPa)

      // 미출하 안내
      const remaining = want - (Math.min(want, paStock) + canByPl2)
      if (remaining > 0){
        ship.errors.push(`${entry.itemId}: 재고/병목으로 ${remaining} 미출하`)
      }
    }

    // 화면 수량 재계산 (전체)
    await computeQtyForAll()

    if (ship.errors.length===0) { ship.open = false; selectedIds.value.clear() }
  } finally {
    shipUploading.value = false
  }
}

/* ---------- Mount ---------- */
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