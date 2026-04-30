/**
 * Safely stringify a value to JSON, handling circular references
 * and values that can't be serialized.
 */
export function safeStringify(value: unknown, space?: number): string {
  try {
    const seen = new WeakSet();

    return JSON.stringify(
      value,
      (_, val) => {
        if (typeof val === 'object' && val !== null) {
          if (seen.has(val)) {
            return '[Circular]';
          }
          seen.add(val);
        }
        return val;
      },
      space,
    );
  } catch {
    return String(value);
  }
}
