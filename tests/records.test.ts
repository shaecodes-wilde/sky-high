import { describe, expect, it } from 'vitest';
import { MOVEMENT_RULES_VERSION } from '../src/config/movement';
import { formatTime, getRecord, recordKey, segmentsOf, submitCleanRun, type KVStore } from '../src/persist/records';

function memStore(): KVStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe('local records', () => {
  it('are versioned by level, movement rules and assist mode', () => {
    const a = recordKey('lvl', 'none');
    const b = recordKey('lvl', 'gentle');
    expect(a).not.toBe(b);
    expect(a).toContain(`rules${MOVEMENT_RULES_VERSION}`);
    const s = memStore();
    submitCleanRun(s, a, 70, [10, 20]);
    expect(getRecord(s, b).bestTime).toBeNull();
  });

  it('keep the best clean time and best splits', () => {
    const s = memStore();
    const k = recordKey('lvl', 'none');
    expect(submitCleanRun(s, k, 80, [10, 30]).newBest).toBe(true);
    const slower = submitCleanRun(s, k, 90, [9, 40]);
    expect(slower.newBest).toBe(false);
    expect(getRecord(s, k).bestTime).toBe(80);
    expect(getRecord(s, k).bestSplits).toEqual([10, 30]);
    // Best individual segments still improve from slower runs.
    expect(getRecord(s, k).bestSegments[0]).toBe(9);
    const faster = submitCleanRun(s, k, 75, [10, 28]);
    expect(faster.newBest).toBe(true);
    expect(faster.previousBest).toBe(80);
  });

  it('computes segments from cumulative splits', () => {
    expect(segmentsOf([10, null, 30], 45)).toEqual([10, null, 20, 15]);
  });

  it('survives corrupt storage', () => {
    const s = memStore();
    s.setItem('cloudbloom.records.v1', '{nope');
    expect(getRecord(s, 'x').bestTime).toBeNull();
  });

  it('formats times', () => {
    expect(formatTime(65.4)).toBe('1:05.40');
    expect(formatTime(null)).toBe('--:--.--');
  });
});
