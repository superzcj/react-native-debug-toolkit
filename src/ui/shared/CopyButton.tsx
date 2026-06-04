import React, { useCallback, useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { copyToComputer } from '../../utils/copyToComputer';

interface CopyButtonProps {
  /** Content to copy */
  text: string;
  /** Label for console.log identification */
  label?: string;
  /** Compact mode for inline use */
  compact?: boolean;
}

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
    feedback === 'logged' ? 'Logged' :
    null;

  return (
    <TouchableOpacity
      style={[s.copyBtn, compact && s.copyBtnCompact]}
      onPress={handleCopy}
      activeOpacity={0.7}
    >
      <Text style={[s.copyBtnText, compact && s.copyBtnTextCompact]}>
        {feedbackLabel ?? 'Copy'}
      </Text>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  copyBtn: {
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    alignSelf: 'flex-end',
  },
  copyBtnCompact: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  copyBtnText: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  copyBtnTextCompact: {
    fontSize: 10,
  },
});
