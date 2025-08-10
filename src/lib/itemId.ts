export function buildItemId(opts: {
  type: string; line: string; inch: number | string; tag: string; lengthMm: number | string;
}) {
  const inchStr = String(opts.inch);          // 필요시 .을 _로 바꾸고 싶으면 replace(".", "_")
  const lenStr = `L${Number(opts.lengthMm)}`;
  return `${opts.type}_${opts.line}_${inchStr}_${opts.process_tag}_${lenStr}`;
}

export type ItemDoc = {
  itemId: string;
  type: string;
  line: string;           // LIQ/VAP/BOG 또는 30T/40T 등
  inch: number;
  process: string;           // 0.5, 1.25 ...
  process_tag: string;            // cw/fo/pl...
  length_mm: number;      // 1000 등
  created_at: any;
};
