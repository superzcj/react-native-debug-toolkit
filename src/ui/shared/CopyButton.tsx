import React, { useCallback, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import { copyToComputer, hasClipboard } from '../../utils/copyToComputer';

interface CopyButtonProps {
  text: string;
  label?: string;
  compact?: boolean;
}

const defaultLabel = hasClipboard() ? 'Copy' : 'Send';

export const CopyButton: React.FC<CopyButtonProps> = ({ text, label, compact }) => {
  const [feedback, setFeedback] = useState<'copied' | 'logged' | null>(null);

  const handleCopy = useCallback(() => {
    try {
      const result = copyToComputer(text, { label });
      setFeedback(result.method === 'clipboard' ? 'copied' : 'logged');
    } catch {
      setFeedback('logged');
    }
    setTimeout(() => setFeedback(null), 2000);
  }, [text, label]);

  if (!text) return null;

  const feedbackLabel =
    feedback === 'copied' ? 'Copied' :
    feedback === 'logged' ? 'Sent' :
    null;

  return (
    <TouchableOpacity
      style={[s.copyBtn, compact && s.copyBtnCompact, feedback && s.copyBtnFeedback]}
      onPress={handleCopy}
      activeOpacity={0.7}
    >
      <Text style={[s.copyBtnText, feedback && s.copyBtnTextFeedback]}>
        {feedbackLabel ?? defaultLabel}
      </Text>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  copyBtn: {
    backgroundColor: 'transparent',
    paddingHorizontal: Spacing.MD,
    paddingVertical: Spacing.XS,
    borderRadius: Radius.SM,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-end',
  },
  copyBtnCompact: {
    paddingHorizontal: Spacing.SM,
    paddingVertical: 2,
    borderRadius: Radius.XS,
  },
  copyBtnFeedback: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryGhost,
  },
  copyBtnText: {
    fontSize: FontSize.XS,
    color: Colors.textSecondary,
    fontWeight: FontWeight.semibold,
  },
  copyBtnTextFeedback: {
    color: Colors.primary,
  },
});
