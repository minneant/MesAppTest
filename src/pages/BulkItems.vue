<script setup lang="ts">
import { ref, computed } from "vue";
import { db } from "@/firebase";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { buildItemId, type ItemDoc } from "@/lib/itemId";

const types      = ref<string>("ST1,ST2,HD1,HD2,EL1,EL2");      // 콤마로 구분
const lines      = ref<string>("LIQ,VAP,BOG,30T,40T,50T,60T,80T");
const inches     = ref<string>("0.5,0.75,1,1.25,1.5,2,2.5,3,4,5,6");
const tags       = ref<string>("cw,fo,pl,cl,fc,ac,ce,gl,sa,pa,sh");
const lengthMm   = ref<number>(1000);                            // 공통 길이(수기)

const preview = computed(() => {
  const T = split(types.value), L = split(lines.value), I = splitNum(inches.value), G = split(tags.value);
  const sample: string[] = [];
  for (const t of T) for (const l of L) for (const i of I) for (const g of G) {
    sample.push(buildItemId({ type:t, line:l, inch:i, tag:g, lengthMm:lengthMm.value }));
    if (sample.length >= 10) return sample; // 미리보기 10개만
  }
  return sample;
});

function split(s: string){ return s.split(",").map(x=>x.trim()).filter(Boolean); }
function splitNum(s: string){ return split(s).map(Number).filter(n=>!Number.isNaN(n)); }

async function upload() {
  const T = split(types.value), L = split(lines.value), I = splitNum(inches.value), G = split(tags.value);
  if (!T.length || !L.length || !I.length || !G.length) { alert("입력 리스트를 확인하세요."); return; }

  const batch = writeBatch(db);
  let count = 0;

  for (const t of T) for (const l of L) for (const i of I) for (const g of G) {
    const itemId = buildItemId({ type:t, line:l, inch:i, tag:g, lengthMm:lengthMm.value });
    const docRef = doc(db, "items", itemId); // 문서ID를 itemId로 고정
    const payload: ItemDoc = {
      itemId, type: t, line: l, inch: i, tag: g,
      length_mm: Number(lengthMm.value),
      created_at: serverTimestamp()
    };
    batch.set(docRef, payload, { merge: true });
    count++;
    // Firestore batch는 500개 제한 → 끊어서 커밋
    if (count % 450 === 0) { await batch.commit(); console.log("Committed chunk"); }
  }
  // 남은 잔여 커밋
  await batch.commit();
  alert("업로드 완료");
}
</script>

<template>
  <section style="padding:16px; display:grid; gap:12px; max-width:900px">
    <h2>아이템 대량 생성 / 업로드</h2>
    <label>Type들(콤마): <input v-model="types" style="width:100%"></label>
    <label>Line들(콤마): <input v-model="lines" style="width:100%"></label>
    <label>Inch들(콤마, 숫자): <input v-model="inches" style="width:100%"></label>
    <label>태그들(콤마): <input v-model="tags" style="width:100%"></label>
    <label>길이(mm): <input type="number" v-model.number="lengthMm"></label>

    <button @click="upload">업로드</button>

    <div>
      <h3>미리보기(최대 10개)</h3>
      <ul>
        <li v-for="id in preview" :key="id">{{ id }}</li>
      </ul>
    </div>
  </section>
</template>
