import { useLayoutEffect, useRef } from 'react';
import { createQuickAccountsFeature } from './createQuickAccountsFeature';
import { createDefaultLogStorage } from '../../utils/StorageAdapter';
import { DebugToolkit } from '../../core/DebugToolkit';
import type {
  CreateQuickAccountsFeatureOptions,
  QuickAccountItem,
  QuickAccountsFeature,
  QuickAccountsState,
} from './types';

type QuickAccountsCallbacks<TAccount extends QuickAccountItem> = Pick<
  CreateQuickAccountsFeatureOptions<TAccount>,
  'onSwitch' | 'onRollback' | 'onSuccess' | 'onError'
>;

function getState<TAccount extends QuickAccountItem>(
  options: CreateQuickAccountsFeatureOptions<TAccount>,
): QuickAccountsState<TAccount> {
  return {
    items: options.items,
    scopeKey: options.scopeKey,
    contextLabel: options.contextLabel,
    isAuthenticated: options.isAuthenticated,
    currentId: options.currentId,
    currentDetails: options.currentDetails,
  };
}

export function useQuickAccountsFeature<TAccount extends QuickAccountItem>(
  options: CreateQuickAccountsFeatureOptions<TAccount>,
): QuickAccountsFeature<TAccount> {
  const callbacksRef = useRef<QuickAccountsCallbacks<TAccount>>(options);

  const featureRef = useRef<QuickAccountsFeature<TAccount> | null>(null);
  if (!featureRef.current) {
    featureRef.current = createQuickAccountsFeature({
      ...options,
      onSwitch: options.onSwitch ? (account, context) =>
        callbacksRef.current.onSwitch?.(account, context) : undefined,
      onRollback: (account, context) =>
        callbacksRef.current.onRollback?.(account, context),
      onSuccess: (account) => callbacksRef.current.onSuccess?.(account),
      onError: (error, account) =>
        callbacksRef.current.onError?.(error, account),
    }, { active: true, preferenceStorage: createDefaultLogStorage(), closePanel: () => DebugToolkit.closePanel() });
  }

  const feature = featureRef.current;
  useLayoutEffect(() => {
    callbacksRef.current = options;
    if (!options.source) { feature.update(getState(options)); }
    feature.setup();
  }, [feature, options]);

  return feature;
}
