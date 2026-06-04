import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../ui/theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../../ui/theme/layout';
import { copyToComputer } from '../../utils/copyToComputer';
import type { DebugFeatureRenderProps } from '../../types';

export const ClipboardTab: React.FC<DebugFeatureRenderProps<null>> = React.memo(() => {
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleCopy = useCallback(() => {
    if (!text) return;
    try {
      const result = copyToComputer(text, { label: 'Clipboard' });
      setFeedback(result.method === 'clipboard' ? 'Copied' : 'Logged');
    } catch {
      setFeedback('Logged');
    }
    setTimeout(() => setFeedback(null), 2000);
  }, [text]);

  return (
    <View style={s.container}>
      <TextInput
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder="Paste or type text here..."
        placeholderTextColor={Colors.textMuted}
        multiline
        textAlignVertical="top"
      />
      <View style={s.footer}>
        {text ? (
          <TouchableOpacity style={s.copyBtn} onPress={handleCopy} activeOpacity={0.7}>
            <Text style={s.copyBtnText}>{feedback ?? 'Copy'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.hint}>Paste or type content above, then copy to computer</Text>
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
