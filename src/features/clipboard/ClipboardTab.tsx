import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import { copyToComputer } from '../../utils/copyToComputer';
import type { DebugFeatureRenderProps } from '../../types';
import { t } from '../../i18n';

export const ClipboardTab: React.FC<DebugFeatureRenderProps<null>> = React.memo(() => {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCopy = useCallback(() => {
    if (!text) return;
    try {
      const result = copyToComputer(text, { label: 'Clipboard' });
      setFeedback(result.method === 'clipboard' ? t('common.copied') : t('common.sent'));
    } catch {
      setFeedback(t('common.sent'));
    }
    setTimeout(() => setFeedback(null), 2000);
  }, [text]);

  return (
    <View style={s.container}>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder={t('clipboard.placeholder')}
        placeholderTextColor={Colors.textMuted}
        multiline
        textAlignVertical="top"
      />
      <View style={s.footer}>
        {text ? (
          <TouchableOpacity style={s.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
            <Text style={s.copyBtnText}>{feedback ?? t('common.copy')}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.hint}>{t('clipboard.hint')}</Text>
        )}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.MD,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.LG,
    padding: Spacing.MD,
    fontSize: FontSize.MD,
    color: Colors.text,
    lineHeight: 20,
  },
  footer: {
    paddingTop: Spacing.SM,
    minHeight: 36,
    alignItems: 'flex-end',
  },
  hint: {
    fontSize: FontSize.XS,
    color: Colors.textMuted,
  },
  copyBtn: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.LG,
    paddingVertical: Spacing.XS,
    borderRadius: Radius.SM,
  },
  copyBtnText: {
    fontSize: FontSize.SM,
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
});
