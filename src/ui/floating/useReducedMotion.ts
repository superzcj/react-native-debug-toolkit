import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo?.isReduceMotionEnabled?.().then(value => {
      if (active) setEnabled(value);
    }).catch(() => {});
    const subscription = AccessibilityInfo?.addEventListener?.('reduceMotionChanged', setEnabled);
    return () => { active = false; subscription?.remove(); };
  }, []);
  return enabled;
}
