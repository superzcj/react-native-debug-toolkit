import en from '../../i18n/locales/en.json';
import zhCN from '../../i18n/locales/zh-CN.json';
import {
  configureLocale,
  getLocale,
  resolveLocale,
  t,
} from '../../i18n';
import { I18nManager, NativeModules, Settings } from 'react-native';

describe('startup locale', () => {
  it('keeps dictionary keys and interpolation parameters aligned', () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const parameters = (value: string) => (value.match(/\{[\w.-]+\}/g) ?? []).sort();
      expect(parameters(zhCN[key])).toEqual(parameters(en[key]));
    }
  });

  afterEach(() => {
    configureLocale('en');
    delete (NativeModules as Record<string, unknown>).SettingsManager;
    delete (NativeModules as Record<string, unknown>).I18nManager;
    (Settings.get as jest.Mock).mockReset();
    (I18nManager.getConstants as jest.Mock).mockReset();
  });

  it.each([
    ['zh-CN', 'zh-CN'],
    ['zh-SG', 'zh-CN'],
    ['zh-Hans', 'zh-CN'],
    ['zh-Hans-CN', 'zh-CN'],
    ['zh-TW', 'en'],
    ['zh-Hant', 'en'],
    ['zh-Hant-TW', 'en'],
    ['zh-Hant-CN', 'en'],
    ['zh', 'en'],
    ['fr-FR', 'en'],
    [undefined, 'en'],
  ] as const)('resolves auto locale %s to %s', (detected, expected) => {
    expect(resolveLocale('auto', detected)).toBe(expected);
  });

  it('prefers an explicit locale over automatic detection', () => {
    expect(resolveLocale('en', 'zh-CN')).toBe('en');
    expect(resolveLocale('zh-CN', 'en-US')).toBe('zh-CN');
  });

  it('uses the native preferred language before formatting locale', () => {
    (Settings.get as jest.Mock).mockImplementation((key: string) => (
      key === 'AppleLanguages' ? ['zh-Hans'] : 'en_US'
    ));

    configureLocale('auto');

    expect(getLocale()).toBe('zh-CN');
  });

  it('reads the Android locale identifier when iOS settings are unavailable', () => {
    (I18nManager.getConstants as jest.Mock).mockReturnValue({ localeIdentifier: 'zh-CN' });

    configureLocale('auto');

    expect(getLocale()).toBe('zh-CN');
  });

  it('configures the locale once and interpolates values', () => {
    configureLocale('zh-CN');

    expect(getLocale()).toBe('zh-CN');
    expect(t('common.back')).toBe('返回');
    expect(t('panel.itemsCaptured', { count: 3 })).toBe('已捕获 3 条');
  });

  it('falls back to English when a translated message is unavailable', () => {
    configureLocale('zh-CN');

    expect(t('common.copy')).toBe('复制');
    const messages = zhCN as Partial<typeof zhCN>;
    const original = messages['common.copy'];
    try {
      delete messages['common.copy'];
      expect(t('common.copy')).toBe('Copy');
    } finally {
      messages['common.copy'] = original;
    }
  });
});
