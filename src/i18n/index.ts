import { I18nManager, NativeModules, Settings } from 'react-native';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

export type DebugLocale = 'en' | 'zh-CN';
export type DebugLocaleOption = DebugLocale | 'auto';
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number | boolean | null | undefined>;

const dictionaries: Record<DebugLocale, Record<string, string>> = {
  en,
  'zh-CN': zhCN,
};

let configuredLocale: DebugLocale = 'en';

function readDeviceLocale(): string | undefined {
  try {
    const publicSettings = Settings as unknown as {
      get?: (key: string) => unknown;
    } | undefined;
    const publicLanguages = publicSettings?.get?.('AppleLanguages');
    const publicLocale = publicSettings?.get?.('AppleLocale');
    if (Array.isArray(publicLanguages) && typeof publicLanguages[0] === 'string') {
      return publicLanguages[0];
    }
    if (typeof publicLocale === 'string') return publicLocale;

    const settingsModule = NativeModules?.SettingsManager ?? NativeModules?.Settings;
    const settings = settingsModule?.settings as {
      AppleLocale?: string;
      AppleLanguages?: string[];
      localeIdentifier?: string;
    } | undefined;
    const getSetting = typeof settingsModule?.get === 'function'
      ? (key: string) => settingsModule.get(key) as unknown
      : undefined;
    const preferredLanguages = settings?.AppleLanguages ?? getSetting?.('AppleLanguages') as string[] | undefined;
    const locale = settings?.AppleLocale ?? getSetting?.('AppleLocale') as string | undefined;
    const nativeLocale = preferredLanguages?.[0] || locale;
    if (nativeLocale) return nativeLocale;
  } catch {
    // Native settings are optional on all supported platforms.
  }

  try {
    const publicConstants = (I18nManager as unknown as {
      getConstants?: () => unknown;
    } | undefined)?.getConstants?.() as {
      localeIdentifier?: string;
    } | undefined;
    if (typeof publicConstants?.localeIdentifier === 'string') {
      return publicConstants.localeIdentifier;
    }

    const constants = NativeModules?.I18nManager?.getConstants?.() as {
      localeIdentifier?: string;
    } | undefined;
    if (typeof constants?.localeIdentifier === 'string') return constants.localeIdentifier;
  } catch {
    // Android's public locale API is optional in test and web runtimes.
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
}

function isSimplifiedChinese(locale: string): boolean {
  const normalized = locale.replace(/_/g, '-').toLowerCase();
  if (!/^zh(?:-|$)/.test(normalized)) return false;
  if (/(?:^|-)(?:hant)(?:-|$)/.test(normalized)) return false;
  return /(?:^|-)hans(?:-|$)/.test(normalized) || /^zh-(?:cn|sg)(?:-|$)/.test(normalized);
}

export function resolveLocale(
  option: DebugLocaleOption = 'auto',
  detectedLocale?: string,
): DebugLocale {
  if (option === 'en' || option === 'zh-CN') return option;
  return detectedLocale && isSimplifiedChinese(detectedLocale) ? 'zh-CN' : 'en';
}

export function configureLocale(option: DebugLocaleOption = 'auto'): void {
  configuredLocale = resolveLocale(option, option === 'auto' ? readDeviceLocale() : undefined);
}

export function getLocale(): DebugLocale {
  return configuredLocale;
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  const localized = dictionaries[configuredLocale][key] ?? dictionaries.en[key] ?? String(key);
  if (!params) return localized;

  return localized.replace(/\{\{?\s*([\w.-]+)\s*\}?\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}
