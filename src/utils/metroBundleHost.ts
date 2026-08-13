import { NativeModules } from 'react-native';

type ScriptURLSource = {
  getScriptURL?: () => string | null | undefined;
};

/**
 * Read Metro's bundle host from React Native's internal SourceCode.scriptURL.
 * Kept in one adapter so UI and network clients do not touch RN internals directly.
 */
export function getMetroBundleHost(source?: ScriptURLSource): string | null {
  const getScriptURL = source?.getScriptURL ?? defaultGetScriptURL;
  const scriptURL = getScriptURL();
  if (!scriptURL || typeof scriptURL !== 'string') {
    return null;
  }

  try {
    const url = new URL(scriptURL);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    if (!url.hostname) {
      return null;
    }
    return url.hostname;
  } catch {
    return null;
  }
}

function defaultGetScriptURL(): string | null {
  try {
    const sourceCode = (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode;
    const scriptURL = sourceCode?.scriptURL;
    return typeof scriptURL === 'string' ? scriptURL : null;
  } catch {
    return null;
  }
}
