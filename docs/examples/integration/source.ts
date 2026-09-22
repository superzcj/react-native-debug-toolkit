import type { DebugSource } from 'react-native-debug-toolkit';

export interface SessionSnapshot { accountId: string | null; count: number }
let snapshot: SessionSnapshot = { accountId: null, count: 0 };
const listeners = new Set<() => void>();

// Read-only source: return the SAME object until the business state changes.
export const sessionSource: DebugSource<SessionSnapshot> = {
  getSnapshot: () => snapshot,
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
export function updateSession(patch: Partial<SessionSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}
