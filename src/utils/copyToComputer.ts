type ClipboardModule = { setString: (value: string) => void };

let clipboardModule: ClipboardModule | null = null;
let clipboardChecked = false;

function getClipboardModule(): ClipboardModule | null {
  if (clipboardChecked) { return clipboardModule; }
  clipboardChecked = true;
  try {
    // Check native module exists first — getEnforcing() inside the clipboard
    // package throws a fatal Invariant Violation that bypasses try/catch.
    const { TurboModuleRegistry } = require('react-native');
    if (!TurboModuleRegistry.get('RNCClipboard')) {
      return null;
    }
    clipboardModule = require('@react-native-clipboard/clipboard').default;
  } catch {
    clipboardModule = null;
  }
  return clipboardModule;
}

export function hasClipboard(): boolean {
  return getClipboardModule() !== null;
}

export interface CopyChannels {
  copyPhone?: (text: string) => void | Promise<void>;
  recordConsole?: (text: string, label?: string) => void;
  sendHub?: (text: string, label?: string) => Promise<'delivered' | 'unavailable'>;
}

export interface CopyOptions {
  label?: string;
  enabled: boolean;
  channels: CopyChannels;
}

/** Resolve this optional capability when the host builds its explicit channels. */
export function phoneCopyChannel(): CopyChannels['copyPhone'] {
  const clipboard = getClipboardModule();
  return clipboard ? (text) => clipboard.setString(text) : undefined;
}

const MAX_LOG_SIZE = 10 * 1024; // 10KB

/**
 * Format data for copying (pretty JSON or raw string).
 */
export function fmt(data: unknown): string {
  if (!data) { return ''; }
  try {
    return JSON.stringify(typeof data === 'string' ? JSON.parse(data) : data, null, 2);
  } catch {
    return String(data);
  }
}

/**
 * Log content to console (Metro terminal / DevTools) with a structured prefix.
 * ConsoleLogFeature intercepts console.log but still calls the original first,
 * so output reliably appears in Metro terminal.
 */
export function logToComputer(content: string, label?: string): void {
  try {
    const header = label ? `[DebugToolkit:Copy] ─── ${label} ───` : '[DebugToolkit:Copy] ─── Content ───';
    console.log(header);

    if (content.length > MAX_LOG_SIZE) {
      console.log(content.slice(0, MAX_LOG_SIZE));
      console.log(`[DebugToolkit:Copy] ... truncated (${content.length} bytes total)`);
    } else {
      console.log(content);
    }

    console.log('[DebugToolkit:Copy] ─── END ───');
  } catch {
    // Silently fail — console may not be available in all environments
  }
}

/** User-triggered delivery. Each channel reports only its own observed result. */
export async function copyToComputer(content: string, options: CopyOptions): Promise<CopyResult> {
  if (!options.enabled) {
    return { status: 'disabled', phone: { status: 'disabled' }, console: { status: 'disabled' }, hub: { status: 'disabled' } };
  }
  const deliver = async (channel: (() => unknown) | undefined, confirmed = false): Promise<CopyResult['phone']> => {
    if (!channel) { return { status: 'unavailable', reason: 'Channel is not configured.' }; }
    try {
      const result = await channel();
      return confirmed && result !== 'delivered'
        ? { status: 'unavailable', reason: 'Computer delivery was not confirmed.' }
        : { status: 'success' };
    } catch (error) {
      return { status: 'error', reason: error instanceof Error ? error.message : 'Delivery failed.' };
    }
  };
  const { copyPhone, recordConsole, sendHub } = options.channels;
  const [phone, consoleResult, hub] = await Promise.all([
    deliver(copyPhone && (() => copyPhone(content))),
    deliver(recordConsole && (() => recordConsole(content, options.label))),
    deliver(sendHub && (() => sendHub(content, options.label)), true),
  ]);
  return { status: 'completed', phone, console: consoleResult, hub };
}

export function describeCopyResult(result: CopyResult): string {
  const describe = (channel: CopyResult['phone']) => `${channel.status}${channel.reason ? ` (${channel.reason})` : ''}`;
  return `Phone: ${describe(result.phone)}\nConsole: ${describe(result.console)}\nHub: ${describe(result.hub)}`;
}
import type { CopyResult } from '../types/debug';
export type { CopyResult } from '../types/debug';
