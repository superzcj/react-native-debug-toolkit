type ClipboardModule = { setString: (value: string) => void };

let clipboardModule: ClipboardModule | null = null;
let clipboardChecked = false;

function getClipboardModule(): ClipboardModule | null {
  if (clipboardChecked) return clipboardModule;
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

export type CopyMethod = 'clipboard' | 'console' | 'none';

export interface CopyResult {
  success: boolean;
  method: CopyMethod;
}

export interface CopyOptions {
  /** Descriptive label for console.log identification */
  label?: string;
  /** If true, only copy to clipboard without console.log */
  silent?: boolean;
}

const MAX_LOG_SIZE = 10 * 1024; // 10KB

/**
 * Format data for copying (pretty JSON or raw string).
 */
export function fmt(data: unknown): string {
  if (!data) return '';
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

/**
 * Copy content to computer via the best available method.
 *
 * 1. Attempts device clipboard (if @react-native-clipboard/clipboard is installed)
 * 2. Always console.logs with structured prefix (appears in Metro terminal)
 * 3. Returns result indicating what succeeded
 */
export function copyToComputer(content: string, options?: CopyOptions): CopyResult {
  let method: CopyMethod = 'none';

  // Try clipboard
  try {
    const clipboard = getClipboardModule();
    if (clipboard) {
      clipboard.setString(content);
      method = 'clipboard';
    }
  } catch {
    // Clipboard may fail, continue
  }

  // Always log to computer console (unless silent)
  if (!options?.silent) {
    logToComputer(content, options?.label);
    if (method === 'none') {
      method = 'console';
    }
  }

  return { success: true, method };
}
