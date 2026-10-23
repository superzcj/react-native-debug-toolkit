import type { DebugFeature } from '../../types/feature';
import type { FeatureContext } from '../../core/runtimeTypes';
import type { LogRuntimeContext } from '../../utils/logRuntime';
import type { StorageAdapter } from '../../utils/StorageAdapter';
import {
  sanitizeDebugLogEntry,
  utf8ByteLength,
} from '../../utils/deviceReport';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import type {
  LogChannelConfig,
  LogChannelInput,
  LogChannelEntry,
  LogRecordResult,
} from '../../types/logChannel';

const MAX_ENTRY_BYTES = 16384;
const MAX_SOURCES = 128;
const bytes = (value: unknown) => utf8ByteLength(JSON.stringify(value));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface LogChannelFeature extends DebugFeature<LogChannelEntry[]> {
  readonly limits: { maxLogs: number; maxBytes: number };
  start(context: FeatureContext): Promise<void>;
  dispose(): void;
  record(input: LogChannelInput): LogRecordResult;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

/** Uses the same persisted store as built-in logs; the envelope keeps replay watermarks across clear. */
export function createLogChannelFeature(
  config: LogChannelConfig,
  runtime: LogRuntimeContext,
): LogChannelFeature {
  const key = `channel.${config.id}` as const;
  const maxLogs = config.maxLogs ?? 1000,
    maxBytes = config.maxBytes ?? 2 * 1024 * 1024;
  const sources = new Map<string, number>();
  let nextId = 0,
    ready = false,
    disposed = false,
    context: FeatureContext | undefined;
  const listeners = new Set<() => void>();
  const current = () =>
    !disposed &&
    runtime.active &&
    (!context || (context.isCurrent() && !context.signal.aborted));
  const envelope = (entries: readonly LogChannelEntry[], watermarks = [...sources], id = nextId) => ({
    entries, sources: watermarks, nextId: id,
  });
  const storage: StorageAdapter = {
    async getItem(storageKey) {
      const raw = await runtime.logStorage.getItem(storageKey);
      if (!current() || !raw) {return null;}
      const saved = JSON.parse(raw);
      if (Array.isArray(saved.sources))
        {for (const [id, sequence] of saved.sources.slice(-MAX_SOURCES))
          {if (
            typeof id === 'string' &&
            id.length <= 160 &&
            Number.isSafeInteger(sequence) &&
            sequence >= 0
          )
            {sources.set(id, sequence);}}}
      nextId =
        Number.isSafeInteger(saved.nextId) && saved.nextId >= 0
          ? saved.nextId
          : 0;
      const entries: LogChannelEntry[] = Array.isArray(saved.entries)
        ? saved.entries
        : [];
      const retained = entries
        .filter(
          (entry) =>
            entry &&
            typeof entry.id === 'string' &&
            typeof entry.message === 'string',
        )
        .slice(-maxLogs);
      while (
        retained.length &&
        bytes(envelope(retained)) > maxBytes
      )
        {retained.shift();}
      while (
        sources.size &&
        bytes(envelope(retained)) > maxBytes
      )
        {sources.delete(sources.keys().next().value!);}
      for (const entry of retained)
        {nextId = Math.max(nextId, Number(entry.id) || 0);}
      return JSON.stringify(retained);
    },
    setItem(storageKey, value) {
      return runtime.logStorage.setItem(
        storageKey,
        JSON.stringify(envelope(JSON.parse(value))),
      );
    },
    removeItem: (storageKey) => runtime.logStorage.removeItem(storageKey),
  };
  const store = createPersistedObservableStore<LogChannelEntry>({
    storage,
    storageKey: runtime.sessionManager.getLogStorageKey(key),
    maxPersist: maxLogs,
    maxEntries: maxLogs,
    maxWaitMs: 1000,
    isActive: current,
  });
  const publish = () => {
    if (!current()) {return;}
    context?.setStatus({
      phase: store.getData().length ? 'ready' : 'empty',
      issues: runtime
        .getCapabilityIssues()
        .filter((issue) => issue.path === 'history'),
    });
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* Log observers cannot affect producers. */
      }
    }
  };
  const stopStore = store.subscribe(publish);
  const dispose = () => {
    if (disposed) {return;}
    disposed = true;
    context?.signal.removeEventListener('abort', dispose);
    stopStore();
    store.dispose();
    listeners.clear();
  };
  return {
    name: key,
    label: config.title,
    limits: { maxLogs, maxBytes },
    status: { phase: 'initializing', issues: [] },
    async setup() {
      await store.ready;
      if (current()) {ready = true;}
    },
    async start(ctx) {
      if (context || disposed || ctx.signal.aborted || !ctx.isCurrent()) {return;}
      context = ctx;
      ctx.signal.addEventListener('abort', dispose, { once: true });
      await store.ready;
      if (current()) {
        ready = true;
        publish();
      }
    },
    dispose,
    cleanup: dispose,
    getSnapshot: () => clone(store.getData()),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    clear() {
      if (ready && current()) {store.clearPersisted();}
    },
    record(input) {
      if (!current()) {return 'disabled';}
      if (!ready) {return 'not_ready';}
      try {
        // Snapshot descriptors without calling getters. Limit each record below, not a second text log.
        const value = sanitizeDebugLogEntry(
          input,
          Number.MAX_SAFE_INTEGER,
        ) as LogChannelInput;
        if (
          !value ||
          typeof value.message !== 'string' ||
          value.message === '[Accessor]' ||
          (value.timestamp !== undefined &&
            !Number.isFinite(value.timestamp)) ||
          (value.detail !== undefined && typeof value.detail !== 'boolean') ||
          (value.summary !== undefined && typeof value.summary !== 'string') ||
          (value.category !== undefined &&
            typeof value.category !== 'string') ||
          (value.level !== undefined &&
            ![
              'trace',
              'debug',
              'info',
              'warn',
              'error',
              'fatal',
              'unknown',
            ].includes(value.level))
        )
          {return 'invalid';}
        if (
          value.attachments !== undefined &&
          (!Array.isArray(value.attachments) ||
            value.attachments.some(
              (item) =>
                !item ||
                typeof item.label !== 'string' ||
                typeof item.value !== 'string',
            ))
        )
          {return 'invalid';}
        const source = value.source;
        if (
          source &&
          (typeof source.id !== 'string' ||
            !source.id ||
            source.id.length > 160 ||
            !Number.isSafeInteger(source.sequence) ||
            source.sequence < 0)
        )
          {return 'invalid';}
        if (source && source.sequence <= (sources.get(source.id) ?? -1))
          {return 'duplicate';}
        const receivedAt = Date.now();
        let entry: LogChannelEntry = {
          message: value.message,
          ...(value.summary === undefined ? {} : { summary: value.summary }),
          ...(value.detail === undefined ? {} : { detail: value.detail }),
          ...(value.category === undefined ? {} : { category: value.category }),
          ...(value.level === undefined ? {} : { level: value.level }),
          ...(source ? { source } : {}),
          ...(value.data === undefined ? {} : { data: value.data }),
          ...(value.attachments ? { attachments: value.attachments } : {}),
          id: String(nextId + 1),
          timestamp: value.timestamp ?? receivedAt,
          receivedAt,
          channelTitle: config.title,
        };
        const originalBytes = bytes(entry);
        const envelopeBytes = bytes(envelope([], source ? [[source.id, source.sequence]] : [], nextId + 1));
        const entryBudget = Math.min(
          MAX_ENTRY_BYTES,
          maxBytes - envelopeBytes - 2,
        );
        if (originalBytes > entryBudget) {
          entry = {
            ...entry,
            truncated: true,
            originalBytes,
            data: {
              preview: JSON.stringify(value.data ?? null).slice(0, 2000),
            },
          };
          delete entry.attachments;
          entry.message = entry.message.slice(0, 1000);
          entry.summary = entry.summary?.slice(0, 500);
          entry.category = entry.category?.slice(0, 80);
          // Multi-byte text can exceed a character bound; shrink previews until the serialized entry fits.
          while (bytes(entry) > entryBudget)
            {entry.data = { preview: JSON.stringify(entry.data).slice(0, 500) };}
        }
        nextId++;
        if (source) {
          sources.delete(source.id);
          sources.set(source.id, source.sequence);
        }
        while (sources.size > MAX_SOURCES)
          {sources.delete(sources.keys().next().value!);}
        // Even metadata must fit a small channel. Evict oldest replay sources first.
        while (
          sources.size > 1 &&
          bytes(envelope([entry])) > maxBytes
        )
          {sources.delete(sources.keys().next().value!);}
        const existing = store.getData();
        let count = Math.min(existing.length, maxLogs - 1);
        while (
          count > 0 &&
          bytes(envelope([...existing.slice(-count), entry])) > maxBytes
        )
          {count--;}
        store.push(entry, count + 1);
        return 'recorded';
      } catch {
        return 'invalid';
      }
    },
  };
}
