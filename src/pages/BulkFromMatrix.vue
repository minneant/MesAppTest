<script setup lang="ts">
import { ref, computed } from "vue";
import { db } from "@/firebase";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";

// 1) 타입 목록
const TYPES = ["ST1","ST2","HD1","HD2","EL1","EL2","END","CON","PCO","STM","HDS","ELS","ENS","COS","PCS"];

// 2) 공정 정의 (공정후 tag 포함)  ← 표의 우측 두 열
const PROCESSES = [
  { name: "Cutting_Wire", tag: "cw" },
  { name: "Foaming",      tag: "fo" },
  { name: "Planing",      tag: "pl" },
  { name: "Cutting_length", tag: "cl" },
  { name: "FRP_Coating",  tag: "fc" },
  { name: "FRP_Mold",     tag: "fm" },
  { name: "Al_Coating",   tag: "ac" },
  { name: "Cutting_Elbow", tag: "ce" },
  { name: "Glue",         tag: "gl" },
  { name: "Sanding",      tag: "sa" },
  { name: "Packaging",    tag: "pa" },
  { name: "Shipping",     tag: "sh" },
];

// 3) “어떤 타입이 어떤 공정을 거치는지” 매트릭스 (네가 보낸 O표를 여기에 기입)
//   true/false 로만 적으면 됨. 처음엔 대략값 넣어두고 콘솔에서 조금씩 수정해가면 돼.
const MATRIX: Record<string, Record<string, boolean>> = {
  ST1: { cw:true, fo:true, pl:true, cl:false, fc:false, fm:false, ac:true, ce:false, gl:false, sa:true,  pa:false, sh:false },
  ST2: { cw:true, fo:true, pl:true, cl:false, fc:true,  fm:false, ac:false, ce:false, gl:false, sa:true,  pa:false, sh:false },
  HD1: { cw:true, fo:true, pl:true, cl:true,  fc:false, fm:false, ac:true, ce:false, gl:false, sa:true,  pa:false, sh:false },
  HD2: { cw:true, fo:true, pl:true, cl:true,  fc:true, fm:false, ac:false, ce:false, gl:false, sa:true,  pa:false, sh:false },
  EL1: { cw:false,fo:false,pl:false,cl:false, fc:false,  fm:false, ac:false, ce:true,  gl:true,  sa:false, pa:false, sh:false },
  EL2: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:true,  gl:true,  sa:false, pa:false, sh:false },
  END: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:true,  ac:false, ce:false, gl:false, sa:true, pa:false, sh:false },
  CON: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:true,  ac:false, ce:false, gl:false, sa:true, pa:false, sh:false },
  PCO: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:true,  ac:false, ce:false, gl:false, sa:true, pa:false, sh:false },
  STM: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  HDS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  ELS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  ENS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  COS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
  PCS: { cw:false,fo:false,pl:false,cl:false, fc:false, fm:false, ac:false, ce:false, gl:false, sa:false, pa:true,  sh:true  },
};

// 4) 기본 길이(타입별). 요구사항: ST1/ST2는 1000 고정, 나머지는 이후 수기 생성에 맡김(임시 기본값 지정 가능)
const defaultLengthByType: Record<string, number> = {
  ST1: 1000,
  ST2: 1000,
  HD1: 1000,
  HD2: 1000,
  EL1: 90,
  EL2: 90,
  END: 1,
  CON: 1,
  PCO: 1,
  STM: 1,
  HDS: 1,
  ELS: 1,
  ENS: 1,
  COS: 1,
  PCS: 1,

  // 다른 타입은 필요 시 숫자 넣거나 비워두면 아래에서 fallbackLength 사용
};

// 5) 생성 파라미터(곱하기 항목)
const LINES   = ref<string>("LIQ,VAP,BOG");                // 또는 30T/40T 등 두께코드를 쓰려면 여기 바꿔 입력
const INCHES  = ref<string>("0.5,0.75,1,1.25,1.5,2,2.5");  // 필요한 만큼만
const fallbackLength = ref<number>(1000);                  // 기본 길이(타입에 기본값 없을 때 사용)
const selectedTypes  = ref<string[]>(["ST1","ST2"]);       // 처음에는 ST1/ST2만 체크

// 6) 유틸
const split = (s:string)=> s.split(",").map(x=>x.trim()).filter(Boolean);
const splitNum = (s:string)=> split(s).map(Number).filter(n=>!Number.isNaN(n));

function buildItemId(type:string,line:string,inch:number,tag:string,lengthMm:number){
  return `${type}_${line}_${inch}_${tag}_L${lengthMm}`;
}

// 7) 미리보기
const preview = computed(()=>{
  const out:string[] = [];
  const lines = split(LINES.value);
  const inches = splitNum(INCHES.value);
  for (const type of selectedTypes.value) {
    const length = defaultLengthByType[type] ?? fallbackLength.value;
    for (const p of PROCESSES) {
      if (!MATRIX[type]?.[p.tag]) continue;
      for (const line of lines) {
        for (const inch of inches) {
          out.push(buildItemId(type,line,inch,p.tag,length));
          if (out.length >= 12) return out;
        }
      }
    }
  }
  return out;
});

// 8) 업로드
async function upload(){
  const lines = split(LINES.value);
  const inches = splitNum(INCHES.value);
  if (!selectedTypes.value.length || !lines.length || !inches.length) {
    alert("타입/라인/인치를 확인하세요.");
    return;
  }

  let batch = writeBatch(db);
  let count = 0;

  for (const type of selectedTypes.value) {
    const length = defaultLengthByType[type] ?? fallbackLength.value;

    for (const proc of PROCESSES) {
      if (!MATRIX[type]?.[proc.tag]) continue;  // 그 타입이 해당 공정을 안 거치면 skip

      for (const line of lines) {
        for (const inch of inches) {
          const itemId = buildItemId(type,line,inch,proc.tag,length);
          const ref = doc(db,"items",itemId);
          batch.set(ref, {
            itemId, type, line, inch, process_tag: proc.tag,
            length_mm: length,
            process: proc.name,   // 조회용 (선택)
            created_at: serverTimestamp()
          }, { merge:true });
          count++;
          if (count % 450 === 0) { await batch.commit(); batch = writeBatch(db); }
        }
      }
    }
  }
  await batch.commit();
  alert(`업로드 완료 (${count}개)`);
}
</script>

<template>
  <section style="padding:16px; display:grid; gap:12px; max-width:980px">
    <h2>매트릭스 기반 아이템 대량 생성</h2>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px">
      <div>
        <h3>타입 선택</h3>
        <div style="display:flex; flex-wrap:wrap; gap:8px">
          <label v-for="t in TYPES" :key="t"><input type="checkbox" v-model="selectedTypes" :value="t"> {{t}}</label>
        </div>
        <p style="margin-top:8px">기본 길이: ST1=1000, ST2=1000 (그 외는 fallback {{fallbackLength}}mm)</p>
      </div>

      <div>
        <h3>곱하기 파라미터</h3>
        <label>Lines (콤마): <input v-model="LINES" style="width:100%"></label>
        <label>Inches (콤마 숫자): <input v-model="INCHES" style="width:100%"></label>
        <label>Fallback 길이(mm): <input type="number" v-model.number="fallbackLength"></label>
      </div>
    </div>

    <button @click="upload">업로드</button>

    <div>
      <h3>미리보기 (최대 12개)</h3>
      <ul>
        <li v-for="id in preview" :key="id">{{ id }}</li>
      </ul>
    </div>
  </section>
</template>