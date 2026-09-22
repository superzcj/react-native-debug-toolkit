import React, { createContext, useContext, useCallback, useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, FontWeight, Radius, Spacing } from '../theme/layout';
import { copyToComputer, describeCopyResult } from '../../utils/copyToComputer';
import type { CopyAction } from '../../types/debug';
import { t } from '../../i18n';

interface CopyButtonProps {
  text: string;
  label?: string;
  compact?: boolean;
  copy?: CopyAction;
}

/** The active host injects the same action used by its public facade. */
export const CopyActionContext = createContext<CopyAction>((text, options) =>
  copyToComputer(text, { ...options, enabled: false, channels: {} }));

export const CopyButton: React.FC<CopyButtonProps> = ({ text, label, compact, copy }) => {
  const hostCopy = useContext(CopyActionContext);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const handleCopy = useCallback(async () => {
    if (busy) { return; }
    setBusy(true);
    try {
      const result = await (copy ?? hostCopy)(text, { label });
      if (mounted.current) { setFeedback(describeCopyResult(result)); }
    } catch {
      if (mounted.current) { setFeedback('Copy failed'); }
    } finally {
      if (mounted.current) { setBusy(false); }
    }
  }, [text, label, busy, copy, hostCopy]);

  if (!text) { return null; }

  return (
    <TouchableOpacity
      style={[s.copyBtn, compact && s.copyBtnCompact, feedback && s.copyBtnFeedback]}
      onPress={handleCopy}
      disabled={busy}
      activeOpacity={0.7}
    >
      <Text style={[s.copyBtnText, feedback && s.copyBtnTextFeedback]}>
        {feedback ?? t('common.copy')}
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
