<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { db } from "@/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

/* ---------- State ---------- */
const loading = ref(false);
const saving  = ref(false);
const errors  = ref<string[]>([]);
const infoMsg = ref<string>("");

const metaObj = reactive<MetaDoc>({
  schemaVersion: "0.3.0",
  notes: "초기 템플릿. 업데이트 후 저장하세요.",
  collections: {}
});

const jsonPreview = ref<string>("");

/* ---------- 기본 템플릿 ---------- */
function getDefaultTemplate(): MetaDoc {
  return {
    schemaVersion: "0.3.0",
    notes: "초기 템플릿. 업데이트 후 저장하세요.",
    collections: {
      items: {
        key: "itemId",
        fields: [
          "created_at: Timestamp",
          "itemId: string",
          "type: string", "line: string", "inch: string",
          "length_mm: number",
          "process: string", "process_tag: string",
          "label?: string",
          "family?: 'SEMI'|'FINISHED'",
          "uom?: 'EA'|'M'|'ST'",
          "active?: boolean",
          "updated_at?: Timestamp"
        ],
        desc: "품목 마스터(반제품/완제품 혼재, 표시용 label/단위/활성여부 포함)"
      },
      productions: {
        key: "(auto)",
        fields: [
          "ts: Timestamp",
          "lotId: string",
          "itemId: string", "type: string", "line: string", "inch: string",
          "length_mm: number",
          "process: string", "process_tag: string",
          "qty: number",
          "stationId: string"
        ],
        desc: "공정 실적 로그"
      },
      masters: {
        docs: {
          types: { list: "[{ code, label, enabled, order }]" },
          lines: { list: "[{ code, label, enabled, order }]" },
          processes: { list: "[{ code, label, tag, uom, enabled, order }]" },
          packing_statuses: { list: "[{ code, label, enabled, order }]" },
          meta: "이 문서 자체"
        },
        desc: "드롭다운/라벨/공정 기본정보"
      },
      ship_tos: {
        key: "id",
        fields: [
          "label: string",
          "personInCharge: string",
          "address: string",
          "created_at: Timestamp",
          "updated_at: Timestamp"
        ],
        desc: "수령처 마스터(드롭박스 표시용 라벨/담당/주소)"
      },
      uom_rules: {
        key: "key = `${type}_${line}_${inch}` (권장)",
        fields: [
          "base_uom: 'M'", "ea_per_m?: number", "note?: string",
          "created_at: Timestamp", "updated_at: Timestamp"
        ],
        desc: "EA↔M 환산(집계 기준을 M로 통일할 때 사용)"
      },
      packing_headers: {
        key: "packing_no",
        fields: [
          "packing_no: string",
          "date: string",
          "ship_to_id: string",
          "ship_to_location_id: string",
          "ship_to_snapshot: object",
          "created_at: Timestamp",
          "updated_at: Timestamp"
        ],
        subcollections: {
          lines: {
            key: "(auto)",
            fields: [
              "hull: string",
              "hull_order: number",
              "type: string", "line: string", "inch: string",
              "length_mm: number",
              "qty: number", "uom: string", "qty_m: number",
              "date: string",
              "ship_to_id: string",
              "packing_no: string"
            ],
            desc: "포장 상세 라인"
          }
        },
        desc: "포장 헤더 + 세부 라인 목록"
      }
    },
    indexes: [],
    policies: {
      packaging_uom_resolution: "packaging_rules priority asc 매칭 → uom_result/환산 적용.",
      uom_base: "대시보드 M 기준. EA/ST 입력 시 환산 캐시(qty_m) 저장."
    },
    updated_at: new Date()
  };
}

/* ---------- 로드/저장 ---------- */
async function loadMeta() {
  loading.value = true; errors.value = []; infoMsg.value = "";
  try {
    const snap = await getDoc(doc(db, "masters", "meta"));
    const data = snap.exists() ? (snap.data() as MetaDoc) : getDefaultTemplate();
    Object.assign(metaObj, data);
    if (!metaObj.collections) metaObj.collections = {};
    refreshJsonPreview();
    infoMsg.value = snap.exists() ? "meta 불러옴" : "초기 템플릿 사용 중";
  } catch (e:any) {
    errors.value.push(`불러오기 실패: ${e?.message || e}`);
  } finally {
    loading.value = false;
  }
}

async function saveMeta() {
  saving.value = true; errors.value = []; infoMsg.value = "";
  try {
    const body: MetaDoc = JSON.parse(jsonPreview.value);
    body.updated_at = new Date();
    await setDoc(doc(db, "masters", "meta"), body, { merge: true });
    Object.assign(metaObj, body);
    infoMsg.value = "저장 완료";
  } catch (e:any) {
    errors.value.push(`저장 실패: ${e?.message || e}`);
  } finally {
    saving.value = false;
  }
}

/* ---------- 미리보기 / 유틸 ---------- */
function stableSortObject(obj: any): any {
  if (Array.isArray(obj)) return obj.map(stableSortObject);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const k of Object.keys(obj).sort()) out[k] = stableSortObject(obj[k]);
    return out;
  }
  return obj;
}
function refreshJsonPreview(pretty = true) {
  const clone = stableSortObject(metaObj);
  jsonPreview.value = pretty ? JSON.stringify(clone, null, 2) : JSON.stringify(clone);
}

/* ---------- fields 열맞춤(보기용) ---------- */
function alignFieldColumnsInOneList(list: string[]): string[] {
  const rows = list.map(raw => {
    const s = String(raw ?? "").trim();
    const hashIdx = s.indexOf("#");
    const body = hashIdx >= 0 ? s.slice(0, hashIdx).trim() : s;
    const comment = hashIdx >= 0 ? s.slice(hashIdx) : "";
    const parts = body.split(":");
    if (parts.length < 2) return { left: body, right: "", comment };
    const left = parts.shift()!.trim();
    const right = parts.join(":").trim();
    return { left, right, comment };
  });
  const maxLeft = rows.reduce((m, r) => Math.max(m, (r.left || "").length), 0);
  return rows.map(r => {
    if (!r.right) return r.left + (r.comment ? " " + r.comment : "");
    const pad = " ".repeat(maxLeft - r.left.length);
    return `${r.left}${pad} : ${r.right}${r.comment ? " " + r.comment : ""}`;
  });
}
function alignAllFields() {
  const cols = metaObj.collections || {};
  for (const [, def] of Object.entries(cols)) {
    if (Array.isArray(def.fields)) def.fields = alignFieldColumnsInOneList(def.fields as string[]);
    if (def.subcollections && typeof def.subcollections === "object") {
      for (const [, sd] of Object.entries(def.subcollections)) {
        if (Array.isArray(sd.fields)) sd.fields = alignFieldColumnsInOneList(sd.fields as string[]);
      }
    }
  }
  refreshJsonPreview();
}

/* ---------- 컬렉션 조작 ---------- */
function addCollection() {
  const name = prompt("새 컬렉션 이름?");
  if (!name) return;
  if (!metaObj.collections) metaObj.collections = {};
  if (metaObj.collections[name]) { alert("이미 존재하는 이름입니다."); return; }
  metaObj.collections[name] = { key: "", fields: [], desc: "" };
  refreshJsonPreview();
}
function renameCollection(oldName: string) {
  const newName = prompt(`컬렉션명 변경: ${oldName} →`, oldName);
  if (!newName || newName === oldName) return;
  if (!metaObj.collections) return;
  if (metaObj.collections[newName]) { alert("이미 같은 이름의 컬렉션이 있습니다."); return; }
  metaObj.collections[newName] = metaObj.collections[oldName];
  delete metaObj.collections[oldName];
  refreshJsonPreview();
}
function removeCollection(name: string) {
  if (!confirm(`${name} 컬렉션을 삭제할까요?`)) return;
  if (!metaObj.collections) return;
  delete metaObj.collections[name];
  refreshJsonPreview();
}

/* ---------- 필드 조작 ---------- */
function addField(def: CollectionDef | SubCollection) {
  if (!def.fields) def.fields = [];
  def.fields.push("newField: string");
  refreshJsonPreview();
}
function editField(def: CollectionDef | SubCollection, idx: number) {
  if (!def.fields) return;
  const cur = def.fields[idx] || "";
  const ne = prompt("필드 라인 편집 (예: label?: string)", String(cur));
  if (!ne) return;
  def.fields[idx] = ne;
  refreshJsonPreview();
}
function removeField(def: CollectionDef | SubCollection, idx: number) {
  if (!def.fields) return;
  def.fields.splice(idx, 1);
  refreshJsonPreview();
}
function moveField(def: CollectionDef | SubCollection, idx: number, dir: -1 | 1) {
  if (!def.fields) return;
  const j = idx + dir;
  if (j < 0 || j >= def.fields.length) return;
  [def.fields[idx], def.fields[j]] = [def.fields[j], def.fields[idx]];
  refreshJsonPreview();
}

/* ---------- 서브컬렉션 조작 ---------- */
function ensureSub(def: CollectionDef) {
  if (!def.subcollections) def.subcollections = {};
}
function addSubCollection(def: CollectionDef) {
  ensureSub(def);
  const name = prompt("서브컬렉션 이름?");
  if (!name) return;
  if (def.subcollections![name]) { alert("이미 존재합니다."); return; }
  def.subcollections![name] = { key: "", fields: [], desc: "" };
  refreshJsonPreview();
}
function renameSubCollection(def: CollectionDef, oldName: string) {
  ensureSub(def);
  const newName = prompt(`서브컬렉션명 변경: ${oldName} →`, oldName);
  if (!newName || newName === oldName) return;
  if (def.subcollections![newName]) { alert("이미 같은 이름이 있습니다."); return; }
  def.subcollections![newName] = def.subcollections![oldName];
  delete def.subcollections![oldName];
  refreshJsonPreview();
}
function removeSubCollection(def: CollectionDef, name: string) {
  ensureSub(def);
  if (!confirm(`서브컬렉션 ${name} 삭제?`)) return;
  delete def.subcollections![name];
  refreshJsonPreview();
}
function setKey(def: CollectionDef | SubCollection, v: string) {
  def.key = v; refreshJsonPreview();
}
function setDesc(def: CollectionDef | SubCollection, v: string) {
  def.desc = v; refreshJsonPreview();
}

/* ---------- masters.docs list 시그니처 편집 ---------- */
// 예: "[{ code, label, tag, uom, enabled, order }]" → ["code","label","tag","uom","enabled","order"]
function parseListSignature(sig: string): string[] {
  if (typeof sig !== "string") return [];
  const m = sig.match(/\[\{\s*([^}]*)\s*\}\]/);
  const inner = m ? m[1] : sig;
  return inner.split(",").map(s => s.trim()).filter(Boolean);
}
// ["code","label"] → "[{ code, label }]"
function stringifyListSignature(fields: string[]): string {
  const inner = fields.map(f => f.trim()).filter(Boolean).join(", ");
  return `[{ ${inner} }]`;
}
function addListField(docsObj: Record<string, any>, docKey: string) {
  const cur = docsObj[docKey];
  const listStr = typeof cur?.list === "string" ? cur.list : "";
  const arr = parseListSignature(listStr);
  const name = prompt("추가할 필드명?", "newField");
  if (!name) return;
  if (arr.includes(name)) { alert("이미 존재하는 필드입니다."); return; }
  arr.push(name);
  docsObj[docKey] = { ...(cur || {}), list: stringifyListSignature(arr) };
  refreshJsonPreview();
}
function editListField(docsObj: Record<string, any>, docKey: string, idx: number) {
  const cur = docsObj[docKey];
  const arr = parseListSignature(cur?.list || "");
  const next = prompt("필드명 수정", arr[idx] || "");
  if (!next) return;
  if (arr.includes(next) && next !== arr[idx]) { alert("동일 이름이 이미 있습니다."); return; }
  arr[idx] = next;
  docsObj[docKey] = { ...(cur || {}), list: stringifyListSignature(arr) };
  refreshJsonPreview();
}
function removeListField(docsObj: Record<string, any>, docKey: string, idx: number) {
  const cur = docsObj[docKey];
  const arr = parseListSignature(cur?.list || "");
  if (!confirm(`"${arr[idx]}" 필드를 삭제할까요?`)) return;
  arr.splice(idx, 1);
  docsObj[docKey] = { ...(cur || {}), list: stringifyListSignature(arr) };
  refreshJsonPreview();
}
function moveListField(docsObj: Record<string, any>, docKey: string, idx: number, dir: -1 | 1) {
  const cur = docsObj[docKey];
  const arr = parseListSignature(cur?.list || "");
  const j = idx + dir; if (j < 0 || j >= arr.length) return;
  [arr[idx], arr[j]] = [arr[j], arr[idx]];
  docsObj[docKey] = { ...(cur || {}), list: stringifyListSignature(arr) };
  refreshJsonPreview();
}

/* ---------- Lifecycle ---------- */
onMounted(loadMeta);
</script>

<template>
  <section class="wrap">
    <header class="topbar">
      <h2>Schema Tree Admin</h2>
      <div class="actions">
        <button class="btn" :disabled="loading" @click="loadMeta">불러오기</button>
        <button class="btn" @click="alignAllFields">Fields 칼럼 맞춤</button>
        <button class="btn primary" :disabled="saving" @click="saveMeta">저장</button>
      </div>
    </header>

    <div v-if="errors.length" class="alert error">
      <div v-for="(e,i) in errors" :key="i">{{ e }}</div>
    </div>
    <div v-if="infoMsg" class="alert info">{{ infoMsg }}</div>

    <div class="grid">
      <!-- LEFT: 트리 편집 -->
      <div class="pane">
        <div class="pane-head">
          <h3>구조 트리 편집</h3>
          <button class="btn" @click="addCollection">+ 컬렉션</button>
        </div>

        <div class="tree-scroll">
          <div v-if="!metaObj.collections || !Object.keys(metaObj.collections).length" class="empty">
            컬렉션이 없습니다. [+ 컬렉션]을 눌러 추가하세요.
          </div>

          <div v-for="(def, name) in metaObj.collections" :key="name" class="node">
            <div class="node-head">
              <span class="badge">Collection</span>
              <strong class="mono">{{ name }}</strong>
              <div class="gap"></div>
              <button class="sm" @click="renameCollection(name)">이름변경</button>
              <button class="sm danger" @click="removeCollection(name)">삭제</button>
            </div>

            <div class="row">
              <label>key</label>
              <input class="input" :value="def.key || ''" @input="(e:any)=>setKey(def, e.target.value)" placeholder="문서ID 규칙 또는 키 필드명" />
            </div>
            <div class="row">
              <label>desc</label>
              <input class="input" :value="def.desc || ''" @input="(e:any)=>setDesc(def, e.target.value)" placeholder="설명" />
            </div>

            <!-- fields -->
            <div class="sub">
              <div class="sub-head">
                <span class="badge gray">fields</span>
                <button class="sm" @click="addField(def)">+ 필드</button>
              </div>
              <div v-if="!def.fields || !def.fields.length" class="muted">필드 없음</div>
              <ul class="fields">
                <li v-for="(f, i) in (def.fields || [])" :key="i">
                  <span class="mono">{{ f }}</span>
                  <div class="gap"></div>
                  <button class="xs" @click="moveField(def, i, -1)">▲</button>
                  <button class="xs" @click="moveField(def, i, +1)">▼</button>
                  <button class="xs" @click="editField(def, i)">수정</button>
                  <button class="xs danger" @click="removeField(def, i)">삭제</button>
                </li>
              </ul>
            </div>

            <!-- subcollections -->
            <div class="sub">
              <div class="sub-head">
                <span class="badge gray">subcollections</span>
                <button class="sm" @click="addSubCollection(def)">+ 서브컬렉션</button>
              </div>
              <div v-if="!def.subcollections || !Object.keys(def.subcollections).length" class="muted">서브컬렉션 없음</div>

              <div v-for="(sd, sname) in (def.subcollections || {})" :key="sname" class="subnode">
                <div class="node-head">
                  <span class="badge">Sub</span>
                  <strong class="mono">{{ sname }}</strong>
                  <div class="gap"></div>
                  <button class="xs" @click="renameSubCollection(def, sname)">이름변경</button>
                  <button class="xs danger" @click="removeSubCollection(def, sname)">삭제</button>
                </div>

                <div class="row">
                  <label>key</label>
                  <input class="input" :value="sd.key || ''" @input="(e:any)=>setKey(sd, e.target.value)" placeholder="문서ID 규칙 또는 키 필드명" />
                </div>
                <div class="row">
                  <label>desc</label>
                  <input class="input" :value="sd.desc || ''" @input="(e:any)=>setDesc(sd, e.target.value)" placeholder="설명" />
                </div>

                <div class="sub">
                  <div class="sub-head">
                    <span class="badge gray">fields</span>
                    <button class="sm" @click="addField(sd)">+ 필드</button>
                  </div>
                  <div v-if="!sd.fields || !sd.fields.length" class="muted">필드 없음</div>
                  <ul class="fields">
                    <li v-for="(f, i) in (sd.fields || [])" :key="i">
                      <span class="mono">{{ f }}</span>
                      <div class="gap"></div>
                      <button class="xs" @click="moveField(sd, i, -1)">▲</button>
                      <button class="xs" @click="moveField(sd, i, +1)">▼</button>
                      <button class="xs" @click="editField(sd, i)">수정</button>
                      <button class="xs danger" @click="removeField(sd, i)">삭제</button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- masters.docs 강화 편집기 -->
            <div v-if="def.docs" class="sub">
              <div class="sub-head">
                <span class="badge gray">docs (특수)</span>
              </div>

              <div class="subnode" v-for="(docDef, docKey) in def.docs" :key="docKey">
                <div class="node-head">
                  <span class="badge">Doc</span>
                  <strong class="mono">{{ String(docKey) }}</strong>
                </div>

                <!-- list 시그니처가 있는 경우 -->
                <div v-if="docDef && typeof docDef === 'object' && typeof docDef.list === 'string'">
                  <div class="row">
                    <label>list (원문)</label>
                    <input
                      class="input"
                      :value="docDef.list"
                      @input="(e:any)=>{ docDef.list = e.target.value; refreshJsonPreview(); }"
                      placeholder="[{ code, label, ... }]"
                    />
                  </div>

                  <div class="sub">
                    <div class="sub-head">
                      <span class="badge gray">list 필드(편집기)</span>
                      <button class="sm" @click="addListField(def.docs as any, String(docKey))">+ 필드</button>
                    </div>
                    <ul class="fields" v-if="parseListSignature(docDef.list).length">
                      <li v-for="(fname, idx) in parseListSignature(docDef.list)" :key="idx">
                        <span class="mono">{{ fname }}</span>
                        <div class="gap"></div>
                        <button class="xs" @click="moveListField(def.docs as any, String(docKey), idx, -1)">▲</button>
                        <button class="xs" @click="moveListField(def.docs as any, String(docKey), idx, +1)">▼</button>
                        <button class="xs" @click="editListField(def.docs as any, String(docKey), idx)">수정</button>
                        <button class="xs danger" @click="removeListField(def.docs as any, String(docKey), idx)">삭제</button>
                      </li>
                    </ul>
                    <div v-else class="muted">필드 없음</div>
                  </div>
                </div>

                <!-- 일반 문자열/값 -->
                <div v-else>
                  <div class="row">
                    <label>value</label>
                    <input
                      class="input"
                      :value="String(docDef)"
                      @input="(e:any)=>{ def.docs[docKey] = e.target.value; refreshJsonPreview(); }"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div> <!-- /node -->
        </div>   <!-- /tree-scroll -->
      </div>     <!-- /pane(left) -->

      <!-- RIGHT: JSON 미리보기 -->
      <div class="pane">
        <div class="pane-head">
          <h3>JSON 미리보기</h3>
          <div class="right-actions">
            <button class="sm" @click="refreshJsonPreview(true)">예쁘게</button>
            <button class="sm" @click="refreshJsonPreview(false)">압축</button>
          </div>
        </div>
        <div class="json-scroll">
          <pre class="json">{{ jsonPreview }}</pre>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
:where(button, input, select) { all: revert; font: inherit; }
.wrap { display:grid; gap:1rem; padding:1rem; }
.topbar { display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; background:#fff; padding:.5rem 0; z-index:10; }
.actions { display:flex; gap:.5rem; }
.btn { border:1px solid #d1d5db; background:#fff; padding:.375rem .75rem; border-radius:.5rem; font-size:.875rem; cursor:pointer; }
.btn.primary { border-color:#2563eb; color:#fff; background:#2563eb; }
.btn:disabled { opacity:.6; cursor:not-allowed; }

.grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; }
.pane { border:1px solid #e5e7eb; border-radius:.75rem; display:flex; flex-direction:column; min-height:65vh; background:#fff; overflow:hidden; }
.pane-head { display:flex; align-items:center; justify-content:space-between; padding:.5rem .75rem; border-bottom:1px solid #e5e7eb; background:#f9fafb; }

.tree-scroll, .json-scroll { overflow:auto; padding:.75rem; height: calc(100% - 48px); }
.node { border:1px solid #f1f5f9; border-radius:.5rem; padding:.75rem; margin-bottom:.75rem; background:#fcfcfd; }
.node-head { display:flex; align-items:center; gap:.5rem; margin-bottom:.5rem; }
.sub { border-top:1px dashed #e5e7eb; padding-top:.5rem; margin-top:.5rem; }
.sub-head { display:flex; align-items:center; gap:.5rem; margin-bottom:.25rem; flex-wrap:wrap; }
.badge { font-size:.75rem; border:1px solid #e5e7eb; border-radius:.5rem; padding:.1rem .35rem; }
.badge.gray { background:#f3f4f6; color:#374151; }
.muted { color:#6b7280; font-size:.85rem; padding:.25rem 0; }
.row { display:grid; grid-template-columns:7rem 1fr; gap:.5rem; align-items:center; margin:.25rem 0; }
.input { border:1px solid #d1d5db; border-radius:.5rem; padding:.375rem .5rem; }
.kv { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; align-items:center; margin:.25rem 0; }
.fields { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:.25rem; }
.fields li { display:flex; align-items:center; gap:.5rem; border:1px dashed #e5e7eb; padding:.25rem .5rem; border-radius:.5rem; background:#fff; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.sm { font-size:.75rem; border:1px solid #d1d5db; background:#fff; padding:.2rem .45rem; border-radius:.35rem; cursor:pointer; }
.xs { font-size:.7rem; border:1px solid #d1d5db; background:#fff; padding:.1rem .35rem; border-radius:.35rem; cursor:pointer; }
.danger { color:#b91c1c; border-color:#fecaca; background:#fff5f5; }
.alert { border-radius:.5rem; padding:.5rem .75rem; }
.alert.error { border:1px solid #fecaca; background:#fff5f5; color:#991b1b; }
.alert.info  { border:1px solid #bfdbfe; background:#eff6ff; color:#1e3a8a; }
.gap { flex:1; }
.json { white-space: pre; font-size:.9rem; line-height:1.4; }
.empty { color:#6b7280; font-style:italic; padding:.5rem; }

@media (max-width: 1024px){
  .grid { grid-template-columns:1fr; }
}
</style>