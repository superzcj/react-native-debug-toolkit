const values = new Map<string, string>();

export const createMMKV = jest.fn(() => ({
  getString: (key: string) => values.get(key),
  set: (key: string, value: string) => values.set(key, value),
  remove: (key: string) => values.delete(key),
}));

export function resetMMKVMock(): void {
  values.clear();
  createMMKV.mockClear();
}
