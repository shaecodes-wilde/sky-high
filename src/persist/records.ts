import { MOVEMENT_RULES_VERSION, type AssistMode } from '../config/movement';

// Local Time Trial records, versioned by level, movement rules and assist
// mode so that records made under different rules never mix. Only clean
// full runs are submitted; practice attempts are never stored as records.

export interface KVStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RunRecord {
  bestTime: number | null;
  /** Split times at each checkpoint for the best run. */
  bestSplits: (number | null)[];
  /** Fastest time ever recorded for each individual segment (for comparisons). */
  bestSegments: (number | null)[];
  cleanRuns: number;
}

const STORAGE_KEY = 'cloudbloom.records.v1';

export function recordKey(levelId: string, assist: AssistMode): string {
  return `${levelId}|rules${MOVEMENT_RULES_VERSION}|assist-${assist}`;
}

function loadAll(store: KVStore): Record<string, RunRecord> {
  try {
    const raw = store.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getRecord(store: KVStore, key: string): RunRecord {
  return loadAll(store)[key] ?? { bestTime: null, bestSplits: [], bestSegments: [], cleanRuns: 0 };
}

/** Segment durations from cumulative split times (last segment ends at `total`). */
export function segmentsOf(splits: (number | null)[], total: number): (number | null)[] {
  const out: (number | null)[] = [];
  let prev = 0;
  for (const s of [...splits, total]) {
    if (s === null) {
      out.push(null);
      continue;
    }
    out.push(s - prev);
    prev = s;
  }
  return out;
}

export interface SubmitResult {
  record: RunRecord;
  previousBest: number | null;
  newBest: boolean;
}

export function submitCleanRun(store: KVStore, key: string, time: number, splits: (number | null)[]): SubmitResult {
  const all = loadAll(store);
  const rec = all[key] ?? { bestTime: null, bestSplits: [], bestSegments: [], cleanRuns: 0 };
  const previousBest = rec.bestTime;
  const newBest = previousBest === null || time < previousBest;
  const segs = segmentsOf(splits, time);
  const next: RunRecord = {
    bestTime: newBest ? time : previousBest,
    bestSplits: newBest ? splits.slice() : rec.bestSplits,
    bestSegments: segs.map((s, i) => {
      const old = rec.bestSegments[i] ?? null;
      if (s === null) return old;
      return old === null ? s : Math.min(old, s);
    }),
    cleanRuns: rec.cleanRuns + 1,
  };
  all[key] = next;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: records are best-effort */
  }
  return { record: next, previousBest, newBest };
}

export function formatTime(t: number | null): string {
  if (t === null || !isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

export function formatDelta(d: number): string {
  const sign = d < 0 ? '−' : '+';
  return `${sign}${Math.abs(d).toFixed(2)}`;
}

export function safeStorage(): KVStore {
  try {
    const k = '__cloudbloom_probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  }
}
