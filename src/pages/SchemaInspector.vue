<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { db } from "@/firebase";
import {
  doc, onSnapshot,
  collection, query, limit as fbLimit, onSnapshot as colSnapshot,
} from "firebase/firestore";

/* ---------- Types ---------- */
type FieldLine = string;
type SubCollection = {
  key?: string;
  fields?: FieldLine[];
  desc?: string;
};
type CollectionDef = {
  key?: string;
  fields?: FieldLine[];
  desc?: string;
  subcollections?: Record<string, SubCollection>;
  docs?: Record<string, any>;
};
type MetaDoc = {
  schemaVersion?: string;
  notes?: string;
  collections?: Record<string, CollectionDef>;
  indexes?: string[];
  policies?: any;
  updated_at?: any;
};

/* ---------- Router ---------- */
const router = useRouter();
function goSchemaTree()   { router.push({ path: "/admin/schema-tree" }); }
function goSchemaEditor() { router.push({ path: "/admin/schema-admin" }); } // CodeMirror 버전 쓸 때

/* ---------- Live meta subscription ---------- */
const meta = ref<MetaDoc | null>(null);
const metaStatus = ref("구독 준비 중…");
let unsubMeta: (() => void) | null = null;

onMounted(() => {
  unsubMeta = onSnapshot(
    doc(db, "masters", "meta"),
    (snap) => {
      if (snap.exists()) {
        meta.value = snap.data() as MetaDoc;
        metaStatus.value = `업데이트됨 (${new Date().toLocaleString()})`;
      } else {
        meta.value = null;
        metaStatus.value = "문서 없음";
      }
    },
    (err) => { metaStatus.value = `오류: ${err?.message || err}`; }
  );
});
onUnmounted(() => { unsubMeta?.(); });

/* ---------- Collections list derived from meta ---------- */
const collectionNames = computed<string[]>(() => {
  const cols = meta.value?.collections || {};
  return Object.keys(cols).filter(k => typeof (cols as any)[k] === "object");
});

function parseSchemaFields(fields: string[] = []): { name: string; optional: boolean }[] {
  const out: { name: string; optional: boolean }[] = [];
  for (const raw of fields) {
    const s = String(raw || "").trim();
    const left = s.split(":")[0]?.trim() || "";
    const opt = left.endsWith("?");
    const name = opt ? left.slice(0, -1).trim() : left;
    if (!name) continue;
    out.push({ name, optional: opt });
  }
  return out;
}

/* ---------- Selected collection live docs ---------- */
const chosenColl = ref<string>("");
const sampleLimit = ref<number>(50);
const docs = ref<any[]>([]);
const docsStatus = ref("대기 중…");
let unsubColl: (() => void) | null = null;

const schemaFieldList = computed<{ name: string; optional: boolean }[]>(() => {
  if (!chosenColl.value || !meta.value?.collections) return [];
  const def = meta.value.collections[chosenColl.value] || {};
  if (Array.isArray(def.fields)) return parseSchemaFields(def.fields);
  return [];
});

function startListenCollection() {
  stopListenCollection();
  docs.value = [];
  docsStatus.value = "구독 시작…";
  selectedDoc.value = null; // 컬렉션 바뀌면 선택 해제
  if (!chosenColl.value) { docsStatus.value = "컬렉션 미선택"; return; }

  try {
    const q = query(collection(db, chosenColl.value), fbLimit(sampleLimit.value));
    unsubColl = colSnapshot(q, (snap) => {
      docs.value = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      docsStatus.value = `문서 ${docs.value.length}건 (실시간)`;
    }, (err) => {
      docsStatus.value = `오류: ${err?.message || err}`;
    });
  } catch (e: any) {
    docsStatus.value = `오류: ${e?.message || e}`;
  }
}
function stopListenCollection() { if (unsubColl) { unsubColl(); unsubColl = null; } }

watch([chosenColl, sampleLimit], () => { startListenCollection(); });

/* ---------- Diff vs schema ---------- */
function diffDoc(obj: any) {
  const names = new Set(Object.keys(obj || {}).filter(k => k !== "_id"));
  const required = schemaFieldList.value.filter(f => !f.optional).map(f => f.name);
  const optional = new Set(schemaFieldList.value.filter(f => f.optional).map(f => f.name));
  const missing = required.filter(n => !names.has(n));
  const extra = [...names].filter(n => !required.includes(n) && !optional.has(n));
  return { missing, extra };
}

/* ---------- Right pane: JSON Viewer ---------- */
const selectedDoc = ref<any | null>(null);
const rightTab = ref<"doc" | "schema">("doc");
const pretty = ref(true);

const selectedDocJson = computed(() => {
  if (!selectedDoc.value) return "";
  try { return pretty.value ? JSON.stringify(selectedDoc.value, null, 2) : JSON.stringify(selectedDoc.value); }
  catch { return ""; }
});

const schemaJson = computed(() => {
  if (!meta.value?.collections || !chosenColl.value) return "";
  const def = meta.value.collections[chosenColl.value];
  if (!def) return "";
  try { return pretty.value ? JSON.stringify(def, null, 2) : JSON.stringify(def); }
  catch { return ""; }
});

async function copyRightPane() {
  const text = rightTab.value === "doc" ? selectedDocJson.value : schemaJson.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    alert("복사됨!");
  } catch {
    alert("클립보드 복사 실패");
  }
}

/* ---------- Utilities ---------- */
function short(v: any, max = 120) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}
</script>

<template>
  <section class="wrap">
    <!-- Header -->
    <header class="topbar">
      <div class="left">
        <h2>Schema Live Inspector</h2>
        <span class="status">meta: {{ metaStatus }}</span>
      </div>
      <div class="actions">
        <button class="btn" @click="goSchemaTree">스키마 트리 편집</button>
        <button class="btn" @click="goSchemaEditor">스키마 코드 편집</button>
      </div>
    </header>

    <!-- 2-pane layout -->
    <div class="grid">
      <!-- LEFT: Inspector -->
      <div class="pane">
        <div class="pane-head">
          <div class="picker">
            <label>컬렉션</label>
            <select class="input" v-model="chosenColl">
              <option value="" disabled>선택</option>
              <option v-for="c in collectionNames" :key="c" :value="c">{{ c }}</option>
            </select>

            <label>표시 개수</label>
            <input class="input" type="number" min="1" max="500" v-model.number="sampleLimit" />

            <span class="status small">docs: {{ docsStatus }}</span>
          </div>
        </div>

        <div v-if="chosenColl" class="schema-hint">
          <b>스키마 필드</b>:
          <code>
            {{ schemaFieldList.map(f => f.optional ? (f.name + "?") : f.name).join(", ") || "(정의 없음)" }}
          </code>
        </div>

        <div v-if="docs.length" class="tbl-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th class="th" style="width: 14rem;">_id</th>
                <th class="th">fields</th>
                <th class="th" style="width: 12rem;">diff</th>
                <th class="th" style="width: 6rem;">JSON</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(d, i) in docs"
                :key="d._id || i"
                :class="['row', selectedDoc && selectedDoc._id === d._id ? 'row-active' : '']"
                @click="selectedDoc = d"
              >
                <td class="td mono">{{ d._id }}</td>
                <td class="td">
                  <div class="kv" v-for="(v, k) in d" :key="k" v-if="k !== '_id'">
                    <code class="mono key">{{ k }}</code>
                    <span class="val">{{ short(v) }}</span>
                  </div>
                </td>
                <td class="td text-sm">
                  <template v-if="schemaFieldList.length">
                    <div v-if="diffDoc(d).missing.length">
                      <b class="red">누락</b>: {{ diffDoc(d).missing.join(", ") }}
                    </div>
                    <div v-else class="green">누락 없음</div>

                    <div class="mt-1" v-if="diffDoc(d).extra.length">
                      <b class="amber">여분</b>: {{ diffDoc(d).extra.join(", ") }}
                    </div>
                    <div v-else class="green">여분 없음</div>
                  </template>
                  <template v-else>
                    (스키마 fields 정의 없음)
                  </template>
                </td>
                <td class="td td-center">
                  <button class="xs" @click.stop="selectedDoc = d; rightTab = 'doc'">보기</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="empty">
          {{ chosenColl ? "문서가 없거나 구독 중입니다." : "컬렉션을 선택하세요." }}
        </div>
      </div>

      <!-- RIGHT: JSON code viewer -->
      <div class="pane">
        <div class="pane-head">
          <div class="tabs">
            <button
              class="tab"
              :class="{ active: rightTab==='doc' }"
              @click="rightTab = 'doc'"
            >선택 문서 JSON</button>
            <button
              class="tab"
              :class="{ active: rightTab==='schema' }"
              @click="rightTab = 'schema'"
            >스키마 JSON ({{ chosenColl || '-' }})</button>
          </div>
          <div class="right-actions">
            <label class="toggle">
              <input type="checkbox" v-model="pretty" />
              <span>예쁘게</span>
            </label>
            <button class="sm" @click="copyRightPane">복사</button>
          </div>
        </div>

        <div class="json-wrap">
          <pre class="json" v-if="rightTab==='doc'">
{{ selectedDocJson || "// 좌측에서 문서를 선택하세요." }}
          </pre>
          <pre class="json" v-else>
{{ schemaJson || "// 스키마가 없거나 컬렉션이 선택되지 않았습니다." }}
          </pre>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
:where(button, input, select) { all: revert; font: inherit; }

.wrap { padding: 1rem; display: grid; gap: 1rem; }
.topbar { display:flex; align-items:center; justify-content:space-between; }
.left { display:flex; align-items:center; gap:.75rem; }
.status { font-size:.85rem; color:#6b7280; }
.status.small { font-size:.8rem; }
.actions { display:flex; gap:.5rem; }
.btn { border:1px solid #d1d5db; background:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; cursor:pointer; }
.btn:hover { background:#f9fafb; }

/* 2-pane */
.grid { display:grid; grid-template-columns: 1fr 1fr; gap:1rem; }
.pane { border:1px solid #e5e7eb; border-radius:.75rem; display:flex; flex-direction:column; min-height:65vh; background:#fff; overflow:hidden; }
.pane-head { display:flex; align-items:center; justify-content:space-between; padding:.5rem .75rem; border-bottom:1px solid #e5e7eb; background:#f9fafb; }

/* Left */
.picker { display:grid; grid-template-columns: auto 16rem auto 6rem 1fr; gap:.5rem; align-items:center; }
.input { border:1px solid #d1d5db; border-radius:.5rem; padding:.375rem .5rem; width:100%; }
.schema-hint { border-top:1px dashed #e5e7eb; padding:.5rem .75rem; background:#fafafa; font-size:.9rem; }
.tbl-wrap { overflow:auto; }
.tbl { width:100%; table-layout:fixed; border-collapse:separate; border-spacing:0; }
.th { padding:.5rem .75rem; color:#374151; border-bottom:1px solid #e5e7eb; font-weight:600; background:#f9fafb; }
.td { padding:.5rem .75rem; border-bottom:1px solid #f3f4f6; vertical-align:top; }
.td-center { text-align:center; }
.row { cursor:pointer; }
.row-active { outline:2px solid #93c5fd; outline-offset:-2px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.kv { display:grid; grid-template-columns: 14rem 1fr; gap:.25rem .5rem; margin:.15rem 0; }
.kv .key { color:#374151; }
.kv .val { color:#111827; word-break:break-word; }

/* Right */
.tabs { display:flex; gap:.25rem; }
.tab { border:1px solid #d1d5db; background:#fff; padding:.35rem .6rem; border-radius:.5rem; font-size:.85rem; cursor:pointer; }
.tab.active { background:#e5f0ff; border-color:#93c5fd; color:#1d4ed8; }
.right-actions { display:flex; align-items:center; gap:.5rem; }
.sm { font-size:.75rem; border:1px solid #d1d5db; background:#fff; padding:.25rem .5rem; border-radius:.35rem; cursor:pointer; }
.toggle { display:flex; align-items:center; gap:.25rem; font-size:.85rem; color:#374151; }

.json-wrap { flex:1; overflow:auto; padding:.75rem; background:#fff; }
.json { white-space: pre; font-size:.9rem; line-height:1.4; margin:0; }

.red { color:#b91c1c; }
.green { color:#15803d; }
.amber { color:#b45309; }
.empty { color:#6b7280; font-style:italic; padding:.5rem; }

@media (max-width: 1024px){
  .grid { grid-template-columns: 1fr; }
}
.xs { font-size:.7rem; border:1px solid #d1d5db; background:#fff; padding:.1rem .35rem; border-radius:.35rem; cursor:pointer; }
</style>
