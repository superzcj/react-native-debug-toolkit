import React, { useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { debug, type CopyResult } from 'react-native-debug-toolkit';
import { checkoutRequest, demoSession, getDemoApi } from './demoApi';

export function Showcase({ onAddItem }: { onAddItem: () => void }) {
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [result, setResult] = useState<{ failed: boolean; text: string } | null>(null);
  const session = useSyncExternalStore(demoSession.subscribe, demoSession.getSnapshot);
  const [accountResult, setAccountResult] = useState('');
  const [copyResult, setCopyResult] = useState<CopyResult | null>(null);

  const switchAccount = async () => {
    await debug.ready();
    const outcome = await debug.accounts.switchTo(session.account.id === 'personal' ? 'studio' : 'personal');
    setAccountResult(`Account switch: ${outcome.status}`);
  };

  const copyCheckout = async () => {
    if (!result) { return; }
    await debug.ready();
    setCopyResult(await debug.copyToComputer(result.text, { label: 'Checkout result' }));
  };

  const runCheckout = async (scenario: 'sold-out' | 'available') => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setResult(null);
    setCopyResult(null);
    await debug.ready();
    onAddItem();
    debug.track('checkout_started', { scenario, source: 'showcase' });
    try {
      const response = await checkoutRequest(scenario);
      const { data } = response;
      const failed = !response.ok;
      if (failed) console.warn('[Checkout] Inventory conflict', data);
      else console.info('[Checkout] Order confirmed', data);
      debug.track(failed ? 'checkout_failed' : 'checkout_completed', { status: response.status, scenario });
      setResult({ failed, text: failed
        ? `${response.status} · ${data.message ?? 'Checkout rejected.'}`
        : `${response.status} · Order ${data.orderId} confirmed.` });
    } catch {
      console.warn('[Showcase] Demo API unavailable', { endpoint: getDemoApi() });
      setResult({ failed: true, text: 'API offline. Run npm run demo:api in Demo, then retry.' });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={s.shell}>
      <View style={s.brandRow}>
        <Text style={s.brand}>DEBUG TOOLKIT</Text>
        <Text style={s.local}>LOCAL DEMO</Text>
      </View>
      <Text style={s.title}>Every action.{ '\n' }A clearer picture.</Text>
      <Text style={s.description}>Reproduce a checkout failure. See the evidence in your app, local Hub and AI workflow.</Text>
      <Text style={s.footnote}>{`${session.environmentTitle} · ${session.account.title}`}</Text>
      <View style={s.steps}>
        <Text style={s.step}>01  Reproduce</Text><Text style={s.step}>02  Inspect</Text><Text style={s.step}>03  Connect</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => runCheckout('sold-out')} style={[s.primary, busy && s.disabled]}>
        <Text style={s.primaryText}>{busy ? 'Sending request…' : 'Run failed checkout'}</Text>
        <Text style={s.arrow}>↗</Text>
      </TouchableOpacity>
      <View style={s.actions}>
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => runCheckout('available')} style={s.secondary}>
          <Text style={s.secondaryText}>Try successful request</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={async () => { await debug.ready(); debug.open(); }} style={s.secondary}>
          <Text style={s.secondaryText}>Open inspector ↗</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={switchAccount} style={s.secondary}>
          <Text style={s.secondaryText}>{session.account.id === 'personal' ? 'Switch to studio account' : 'Switch to personal account'}</Text>
        </TouchableOpacity>
      </View>
      {accountResult ? <Text accessibilityLiveRegion="polite" style={s.footnote}>{accountResult}</Text> : null}
      {result && <View accessibilityLiveRegion="polite" style={[s.result, result.failed && s.failure]}>
        <Text style={s.resultText}>{result.text}</Text>
        <Text style={s.resultHint}>Open Net for the response, State for the cart, or Track for analytics events.</Text>
        <TouchableOpacity accessibilityRole="button" onPress={copyCheckout} style={s.secondary}>
          <Text style={s.secondaryText}>Copy checkout result</Text>
        </TouchableOpacity>
      </View>}
      {copyResult ? <Text accessibilityLiveRegion="polite" style={s.footnote}>
        {`Phone: ${copyResult.phone.status} · Console: ${copyResult.console.status} · Hub: ${copyResult.hub.status}`}
      </Text> : null}
      <Text style={s.footnote}>Real HTTP traffic · Synthetic shop data · Local demo accounts</Text>
    </View>
  );
}

const s = StyleSheet.create({
  shell: { backgroundColor: '#142C29', borderRadius: 22, padding: 22, gap: 16 },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: '#D4E8DE', fontSize: 11, fontWeight: '800', letterSpacing: 1.7 },
  local: { color: '#A9C9BD', fontSize: 9, letterSpacing: 1, borderWidth: 1, borderColor: '#426058', padding: 6, borderRadius: 4 },
  title: { color: '#F8F6EF', fontSize: 34, lineHeight: 37, fontWeight: '700', letterSpacing: -1.4 },
  description: { color: '#C1D0C9', fontSize: 14, lineHeight: 21 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  step: { color: '#A9C9BD', fontSize: 10, fontWeight: '600' },
  primary: { backgroundColor: '#D7ECAE', paddingHorizontal: 16, paddingVertical: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryText: { color: '#19362A', fontWeight: '700', fontSize: 15 },
  arrow: { color: '#19362A', fontSize: 21 },
  disabled: { opacity: 0.5 },
  actions: { gap: 6 },
  secondary: { paddingVertical: 8 },
  secondaryText: { color: '#E2E9DB', fontSize: 13, fontWeight: '600' },
  result: { backgroundColor: '#284A3C', padding: 12, borderRadius: 8, gap: 6 },
  failure: { backgroundColor: '#573E2E' },
  resultText: { color: '#FFF4D9', fontSize: 13, fontWeight: '600', lineHeight: 19 },
  resultHint: { color: '#DFD3C2', fontSize: 11, lineHeight: 17 },
  footnote: { color: '#A1B8AC', fontSize: 10 },
});
