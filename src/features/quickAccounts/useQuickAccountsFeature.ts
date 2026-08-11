import { useLayoutEffect, useRef } from 'react';
import { createQuickAccountsFeature } from './createQuickAccountsFeature';
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
    accounts: options.accounts,
    scopeKey: options.scopeKey,
    contextLabel: options.contextLabel,
    isAuthenticated: options.isAuthenticated,
    currentAccountId: options.currentAccountId,
    currentAccountDetails: options.currentAccountDetails,
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
      onSwitch: (account, context) =>
        callbacksRef.current.onSwitch(account, context),
      onRollback: (account, context) =>
        callbacksRef.current.onRollback?.(account, context),
      onSuccess: (account) => callbacksRef.current.onSuccess?.(account),
      onError: (error, account) =>
        callbacksRef.current.onError?.(error, account),
    });
  }

  const feature = featureRef.current;
  useLayoutEffect(() => {
    callbacksRef.current = options;
    feature.update(getState(options));
  }, [feature, options]);

  return feature;
}
