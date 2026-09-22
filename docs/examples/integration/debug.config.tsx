import React from 'react';
import { Text } from 'react-native';
import type { DebugAccount, DebugToolkitConfig } from 'react-native-debug-toolkit';
import { sessionSource, updateSession } from './source';
import type { SessionSnapshot } from './source';

function SessionPanel({ snapshot }: { snapshot: SessionSnapshot }) {
  return <Text>Local demo identity: {snapshot.accountId ?? 'none'}; count: {snapshot.count}</Text>;
}

export const debugConfig = {
  accounts: {
    items: [{ id: 'tester', title: 'Local demo tester' }],
    onSwitch(account, { signal }) {
      if (signal.aborted) { return; }
      // A runnable local identity demo. Replace with YOUR authentication operation.
      updateSession({ accountId: account.id });
    },
  },
  state: { adapters: [{ id: 'session', ...sessionSource }] },
  tabs: { items: [{ id: 'session-panel', title: 'Session', source: sessionSource, component: SessionPanel }] },
} satisfies DebugToolkitConfig<DebugAccount, readonly [SessionSnapshot]>;
