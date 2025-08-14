<template>
  <div class="p-6 max-w-7xl mx-auto space-y-6">
    <!-- Header / Filters -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">Inventory</h1>
      <div class="flex flex-wrap gap-3">
        <input v-model="filters.search" type="text" placeholder="Search itemId / label" class="input" />
        <select v-model="filters.status" class="select">
          <option value="all">All</option>
          <option value="ok">OK</option>
          <option value="low">Low</option>
          <option value="none">None</option>
        </select>
      </div>
    </div>

    <!-- KPI Bar -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <div class="text-xs text-gray-500">SKUs</div>
        <div class="text-xl font-semibold mt-1">{{ kpi.totalSkus }}</div>
      </div>
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <div class="text-xs text-gray-500">Total Stock</div>
        <div class="text-xl font-semibold mt-1">{{ kpi.totalStock }}</div>
      </div>
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <div class="text-xs text-gray-500">Low / None</div>
        <div class="text-xl font-semibold mt-1">{{ kpi.lowCount }} / {{ kpi.noneCount }}</div>
      </div>
      <div class="rounded-2xl border bg-white p-4 shadow-sm">
        <div class="text-xs text-gray-500">Selected Buildable</div>
        <div class="text-xl font-semibold mt-1">{{ selectedBuildableText }}</div>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div class="grid grid-cols-[32px,2fr,1fr,1fr,1fr,100px] px-4 py-3 text-sm font-medium text-gray-600 bg-gray-50">
        <div></div>
        <div>Item</div>
        <div class="text-right">Stock</div>
        <div class="text-right">Buildable</div>
        <div class="text-right">7d In / Out</div>
        <div class="text-right">Status</div>
      </div>

      <TransitionGroup name="list" tag="div">
        <div v-for="row in filteredRows" :key="row.itemId" class="border-t">
          <!-- Row -->
          <div class="grid grid-cols-[32px,2fr,1fr,1fr,1fr,100px] items-center px-4 py-3">
            <button @click="toggle(row.itemId)" class="h-7 w-7 rounded-xl border flex items-center justify-center hover:bg-gray-50">
              <span :class="expanded[row.itemId] ? 'rotate-90' : ''" class="transition-transform">▶</span>
            </button>
            <div class="truncate">
              <div class="font-medium">{{ row.itemId }}</div>
              <div class="text-xs text-gray-500" v-if="row.label">{{ row.label }}</div>
            </div>
            <div class="text-right tabular-nums">{{ formatQty(row.stock, row.uom) }}</div>
            <div class="text-right tabular-nums">{{ row.buildable ?? '—' }}</div>
            <div class="text-right text-xs text-gray-500">{{ row.recent7 }}</div>
            <div class="text-right">
              <span :class="statusClass(row.status)" class="text-xs px-2 py-1 rounded-lg">{{ statusText(row.status) }}</span>
            </div>
          </div>

          <!-- Expand Panel -->
          <div v-if="expanded[row.itemId]" class="px-4 pb-5">
            <div class="rounded-xl border bg-gray-50 p-4">
              <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div class="text-sm text-gray-600">BOM & Buildability</div>
                <div class="flex items-center gap-2">
                  <label class="text-xs text-gray-500">Target build</label>
                  <input v-model.number="whatIf[row.itemId]" type="number" min="0" class="input h-8 w-28" />
                </div>
              </div>

              <div class="grid md:grid-cols-2 gap-4">
                <!-- Left: BOM Tree (direct children) -->
                <div class="rounded-xl bg-white border">
                  <div class="px-3 py-2 text-xs font-medium text-gray-500 border-b">Direct Components</div>
                  <div v-if="bomIndex.get(row.itemId)?.length" class="divide-y">
                    <div v-for="edge in bomIndex.get(row.itemId)" :key="edge.childId" class="px-3 py-2 flex items-center gap-3">
                      <div class="grow min-w-0">
                        <div class="truncate text-sm font-medium">{{ edge.childId }}</div>
                        <div class="text-xs text-gray-500">need {{ edge.qtyPerParent }} / {{ edge.uomChild }}</div>
                      </div>
                      <div class="text-right">
                        <div class="text-sm tabular-nums">{{ formatQty(stockMap.get(edge.childId) || 0, edge.uomChild) }}</div>
                        <div class="text-xs" :class="shortage(row.itemId, edge) > 0 ? 'text-red-600' : 'text-gray-400'">
                          <template v-if="whatIf[row.itemId]">
                            부족 {{ shortage(row.itemId, edge) }}
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-else class="p-4 text-sm text-gray-500">No direct BOM rows.</div>
                </div>

                <!-- Right: Summary -->
                <div class="rounded-xl bg-white border p-3 space-y-2">
                  <div class="text-sm">
                    <span class="text-gray-500">Current stock: </span>
                    <span class="font-semibold">{{ formatQty(row.stock, row.uom) }}</span>
                  </div>
                  <div class="text-sm">
                    <span class="text-gray-500">Buildable (1-hop): </span>
                    <span class="font-semibold">{{ row.buildable ?? '—' }}</span>
                  </div>
                  <div class="text-sm" v-if="whatIf[row.itemId]">
                    <span class="text-gray-500">Target build check: </span>
                    <span :class="canBuildTarget(row.itemId) ? 'text-emerald-600' : 'text-red-600'" class="font-semibold">
                      {{ canBuildTarget(row.itemId) ? 'OK' : 'Insufficient' }}
                    </span>
                  </div>
                  <div class="pt-2">
                    <button class="btn" @click="refreshRow(row.itemId)">Refresh row</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { db } from '@/firebase'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'

/* ---------- Types ---------- */
interface Item {
  itemId: string
  label?: string
  uom: 'EA' | 'M' | 'ST'
  product_level: number
  active: boolean
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
  stock: number
  buildable?: number
  recent7: string
  status: 'ok' | 'low' | 'none'
}

/* ---------- UI State ---------- */
const filters = reactive({ search: '', status: 'all' as 'all' | 'ok' | 'low' | 'none' })
const expanded = reactive<Record<string, boolean>>({})
const whatIf = reactive<Record<string, number>>({})

/* ---------- Data Stores ---------- */
const products = ref<Item[]>([])
const rows = ref<RowVM[]>([])
const bomIndex = ref<Map<string, BomEdge[]>>(new Map())
const stockMap = ref<Map<string, number>>(new Map())

/* ---------- Helpers ---------- */
function formatQty(qty: number, uom?: string) {
  return `${(qty || 0).toLocaleString()}${uom ? ' ' + uom : ''}`
}
function statusClass(level: 'ok' | 'low' | 'none') {
  if (level === 'ok') return 'bg-emerald-100 text-emerald-700'
  if (level === 'low') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}
function statusText(level: 'ok' | 'low' | 'none') {
  return level === 'ok' ? 'OK' : level === 'low' ? 'LOW' : 'NONE'
}

/* ---------- Firestore Fetchers ---------- */
async function fetchFinishedItems() {
  const q = query(
    collection(db, 'items'),
    where('product_level', '==', 1),
    where('active', '==', true)
  )
  const snap = await getDocs(q)
  products.value = snap.docs.map(d => d.data() as Item)
}

async function fetchBomFor(parentId: string) {
  if (bomIndex.value.has(parentId)) return bomIndex.value.get(parentId)!
  const q = query(collection(db, 'bom'), where('parentId', '==', parentId))
  const snap = await getDocs(q)
  const edges: BomEdge[] = snap.docs.map(d => d.data() as BomEdge)
  bomIndex.value.set(parentId, edges)
  return edges
}

async function computeStock(itemId: string): Promise<number> {
  const q = query(collection(db, 'productions'), where('itemId', '==', itemId))
  const snap = await getDocs(q)
  let s = 0
  snap.forEach(d => {
    const r = d.data() as any
    const sign = r.isProduction ? 1 : -1
    s += (r.qty || 0) * sign
  })
  stockMap.value.set(itemId, s)
  return s
}

async function computeRecent7(itemId: string): Promise<string> {
  const since = Timestamp.fromDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
  const q = query(collection(db, 'productions'), where('itemId', '==', itemId), where('ts', '>=', since))
  const snap = await getDocs(q)
  let inQty = 0, outQty = 0
  snap.forEach(d => {
    const r = d.data() as any
    if (r.isProduction) inQty += (r.qty || 0)
    else outQty += (r.qty || 0)
  })
  return `${inQty} / ${outQty}`
}

/* ---------- Buildable ---------- */
function buildableOneHop(parentId: string): number | undefined {
  const edges = bomIndex.value.get(parentId) || []
  if (!edges.length) return undefined
  let minUnits = Infinity
  for (const e of edges) {
    const childStock = stockMap.value.get(e.childId) || 0
    if (e.qtyPerParent <= 0) continue
    const unitsByChild = Math.floor(childStock / e.qtyPerParent)
    minUnits = Math.min(minUnits, unitsByChild)
  }
  return isFinite(minUnits) ? minUnits : 0
}

function canBuildTarget(parentId: string): boolean {
  const target = whatIf[parentId]
  if (!target || target <= 0) return true
  const edges = bomIndex.value.get(parentId) || []
  for (const e of edges) {
    const childStock = stockMap.value.get(e.childId) || 0
    if (childStock < target * e.qtyPerParent) return false
  }
  return true
}

function shortage(parentId: string, e: BomEdge): number {
  const target = whatIf[parentId]
  if (!target || target <= 0) return 0
  const need = target * e.qtyPerParent
  const have = stockMap.value.get(e.childId) || 0
  return Math.max(0, Math.ceil(need - have))
}

/* ---------- Row orchestration ---------- */
async function hydrateRow(item: Item): Promise<RowVM> {
  const [stock, recent7] = await Promise.all([
    computeStock(item.itemId),
    computeRecent7(item.itemId)
  ])
  // Preload BOM + children stock for buildable
  const edges = await fetchBomFor(item.itemId)
  await Promise.all(edges.map(e => stockMap.value.has(e.childId) ? Promise.resolve() : computeStock(e.childId)))
  const b = buildableOneHop(item.itemId)
  const status: RowVM['status'] = stock <= 0 ? 'none' : (b !== undefined && b <= 0 ? 'low' : 'ok')
  return { itemId: item.itemId, label: (item as any).label, uom: item.uom, stock, buildable: b, recent7, status }
}

async function refreshAll() {
  await fetchFinishedItems()
  const hydrated = [] as RowVM[]
  for (const it of products.value) hydrated.push(await hydrateRow(it))
  rows.value = hydrated
}

async function refreshRow(itemId: string) {
  const item = products.value.find(p => p.itemId === itemId)
  if (!item) return
  const vm = await hydrateRow(item)
  const idx = rows.value.findIndex(r => r.itemId === itemId)
  if (idx >= 0) rows.value[idx] = vm
}

function toggle(id: string) { expanded[id] = !expanded[id] }

/* ---------- Computed ---------- */
const filteredRows = computed(() => {
  let r = rows.value
  if (filters.search.trim()) {
    const s = filters.search.toLowerCase()
    r = r.filter(x => x.itemId.toLowerCase().includes(s) || (x.label?.toLowerCase().includes(s)))
  }
  if (filters.status !== 'all') r = r.filter(x => x.status === filters.status)
  return r
})

const kpi = computed(() => {
  const totalSkus = rows.value.length
  const totalStock = rows.value.reduce((a, b) => a + (b.stock || 0), 0)
  const lowCount = rows.value.filter(r => r.status === 'low').length
  const noneCount = rows.value.filter(r => r.status === 'none').length
  return { totalSkus, totalStock, lowCount, noneCount }
})

const selectedBuildableText = computed(() => {
  const id = Object.keys(expanded).find(k => expanded[k])
  if (!id) return '-'
  const b = buildableOneHop(id)
  return b === undefined ? '—' : String(b)
})

/* ---------- Mount ---------- */
onMounted(() => { refreshAll() })
</script>

<style scoped>
.input { @apply border rounded-lg h-10 px-3 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400; }
.select { @apply border rounded-lg h-10 px-3 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400; }
.btn { @apply inline-flex items-center justify-center h-9 px-3 rounded-xl border bg-white hover:bg-gray-50 active:scale-[.99]; }
.list-move, .list-enter-active, .list-leave-active { transition: all .2s ease; }
.list-enter-from, .list-leave-to { opacity: 0; transform: translateY(4px); }
</style>
