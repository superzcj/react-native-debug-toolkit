import React, { createContext, useContext, useCallback, useState, useLayoutEffect, useRef } from 'react';
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
  const action = copy ?? hostCopy;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const pending = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    generation.current += 1;
    pending.current = undefined;
    setFeedback(null);
    setBusy(false);
    // Invalidate before any late completion can publish into changed props or an unmounted button.
    return () => { generation.current += 1; };
  }, [text, label, action]);

  const handleCopy = useCallback(async () => {
    const request = generation.current;
    if (pending.current === request) { return; }
    pending.current = request;
    setBusy(true);
    setFeedback(null);
    const current = () => generation.current === request;
    try {
      const result = await action(text, { label });
      if (current()) { setFeedback(describeCopyResult(result)); }
    } catch {
      if (current()) { setFeedback('Copy failed'); }
    } finally {
      if (current()) { pending.current = undefined; setBusy(false); }
    }
  }, [text, label, action]);

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
