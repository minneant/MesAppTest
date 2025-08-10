<script setup lang="ts">
import { ref } from "vue";
import { db } from "@/firebase";
import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp
} from "firebase/firestore";
import { buildItemId } from "@/lib/itemId";

// 드롭다운 기본값(원하면 items에서 읽어와도 됨)
const TYPES   = ["ST1","ST2","HD1","HD2","EL1","EL2","END","CON","PCO"];
const LINES   = ["LIQ","VAP","BOG","30T","40T","50T","60T","80T"]; // 혼용 중이면 둘 다 둠
const INCHES  = [0.5,0.75,1,1.25,1.5,2,2.5,3,4,5,6,8,10,12,14,16,18,20];
const TAGS    = ["cw","fo","pl","cl","fc","ac","ce","gl","sa","pa","sh"];

const type     = ref("ST1");
const line     = ref("LIQ");
const inch     = ref<number>(0.5);
const tag      = ref("cw");
const lengthMm = ref<number>(1000);

const stationId = "TAB-01"; // 추후 실제 스테이션 값 주입

function currentItemId() {
  return buildItemId({
    type: type.value,
    line: line.value,
    inch: inch.value,
    tag: tag.value,
    lengthMm: lengthMm.value
  });
}

async function ensureItemExists(itemId: string) {
  const docRef = doc(db, "items", itemId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    await setDoc(docRef, {
      itemId,
      type: type.value,
      line: line.value,
      inch: Number(inch.value),
      tag: tag.value,
      length_mm: Number(lengthMm.value),
      created_at: serverTimestamp()
    }, { merge: true });
  }
}

async function plusOne() {
  if (!type.value || !line.value || !tag.value || !inch.value || !lengthMm.value) {
    alert("모든 필드를 입력하세요.");
    return;
  }
  const itemId = currentItemId();

  // 1) items에 없으면 자동 추가
  await ensureItemExists(itemId);

  // 2) productions에 기록
  await addDoc(collection(db, "productions"), {
    itemId,
    qty: 1,
    ts: serverTimestamp(),
    stationId,
    // 기록 보조용 필드(검색/통계에 편리)
    type: type.value,
    line: line.value,
    inch: Number(inch.value),
    tag: tag.value,
    length_mm: Number(lengthMm.value)
  });
}
</script>

<template>
  <section style="padding:16px; display:grid; gap:12px; max-width:920px">
    <h2>생산 입력 (+1, 길이 수기 입력 & 자동 아이템 생성)</h2>

    <div style="display:grid; grid-template-columns: repeat(5, 1fr); gap:8px">
      <label>Type
        <select v-model="type">
          <option v-for="v in TYPES" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label>Line/Thickness
        <select v-model="line">
          <option v-for="v in LINES" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label>Inch
        <select v-model.number="inch">
          <option v-for="v in INCHES" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label>Tag
        <select v-model="tag">
          <option v-for="v in TAGS" :key="v" :value="v">{{ v }}</option>
        </select>
      </label>

      <label>길이(mm)
        <input type="number" v-model.number="lengthMm" min="1" />
      </label>
    </div>

    <div>
      <p>제품ID 미리보기: <b>{{ currentItemId() }}</b></p>
      <button @click="plusOne">+1 저장</button>
    </div>
  </section>
</template>
