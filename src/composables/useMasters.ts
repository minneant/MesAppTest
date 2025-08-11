import { ref, computed, onMounted, onUnmounted } from "vue";
import { db } from "@/firebase";
import { doc, onSnapshot } from "firebase/firestore";

type MasterEntry = { code: string; label?: string; enabled?: boolean; order?: number | null };
type ProcessEntry = MasterEntry & { tag?: string };

function sortByOrder<T extends MasterEntry>(a: T, b: T) {
  const ao = a.order ?? 999999, bo = b.order ?? 999999;
  return ao !== bo ? ao - bo : (a.code || "").localeCompare(b.code || "");
}

export function useMasters() {
  const types = ref<MasterEntry[]>([]);
  const lines = ref<MasterEntry[]>([]);
  const processes = ref<ProcessEntry[]>([]);
  let unsubs: Array<() => void> = [];

  onMounted(() => {
    const u1 = onSnapshot(doc(db, "masters", "types"), snap => {
      const list = (snap.data()?.list ?? []) as MasterEntry[];
      types.value = list.filter(v => v.enabled !== false).sort(sortByOrder);
    });
    const u2 = onSnapshot(doc(db, "masters", "lines"), snap => {
      const list = (snap.data()?.list ?? []) as MasterEntry[];
      lines.value = list.filter(v => v.enabled !== false).sort(sortByOrder);
    });
    const u3 = onSnapshot(doc(db, "masters", "processes"), snap => {
      const list = (snap.data()?.list ?? []) as ProcessEntry[];
      processes.value = list.filter(v => v.enabled !== false).sort(sortByOrder);
    });
    unsubs = [u1, u2, u3];
  });

  onUnmounted(() => unsubs.forEach(u => u()));

  const typeCodes = computed(() => types.value.map(v => v.code));
  const lineCodes = computed(() => lines.value.map(v => v.code));
  const processCodes = computed(() => processes.value.map(v => v.code));
  const processTagMap = computed<Record<string,string>>(
    () => Object.fromEntries(processes.value.map(p => [p.code, p.tag ?? ""]))
  );
  const getProcessTag = (proc: string) => processTagMap.value[proc] ?? "";

  return { types, lines, processes, typeCodes, lineCodes, processCodes, processTagMap, getProcessTag };
}
