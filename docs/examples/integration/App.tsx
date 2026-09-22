import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { Button, Text, View } from 'react-native';
import { debug, withDebugToolkit } from 'react-native-debug-toolkit';
import { debugConfig } from './debug.config';
import { sessionSource, updateSession } from './source';
import type { SessionSnapshot } from './source';
import { Verification } from './Verification';

const SessionContext = createContext<SessionSnapshot>({ accountId: null, count: 0 });
function BusinessScreen() {
  const session = useContext(SessionContext);
  return <View>
    <Text>Local identity: {session.accountId ?? 'none'}; count: {session.count}</Text>
    <Button title="Increment" onPress={() => updateSession({ count: session.count + 1 })} />
    <Button title="Inspect" onPress={() => debug.open()} />
    <Verification />
  </View>;
}
function App() {
  const session = useSyncExternalStore(sessionSource.subscribe, sessionSource.getSnapshot);
  useEffect(() => {
    let mounted = true;
    void debug.ready().then(result => {
      if (mounted && ['ready', 'empty'].includes(result.features.track?.phase ?? '')) {
        debug.track('example_ready', { marker: `integration-${Date.now()}` });
      }
    });
    return () => { mounted = false; };
  }, []);
  return <SessionContext.Provider value={session}><BusinessScreen /></SessionContext.Provider>;
}
export default withDebugToolkit(App, debugConfig);
