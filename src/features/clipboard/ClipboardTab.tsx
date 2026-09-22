import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, Radius, Spacing } from '../../ui/theme/layout';
import { CopyButton } from '../../ui/shared/CopyButton';
import type { ClipboardSnapshot } from './index';
import type { DebugFeatureRenderProps } from '../../types';
import { t } from '../../i18n';

export const ClipboardTab: React.FC<DebugFeatureRenderProps<ClipboardSnapshot>> = React.memo(({ snapshot }) => {
  const [text, setText] = useState('');

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
          <CopyButton text={text} label="Clipboard" copy={snapshot.copy} />
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
});
