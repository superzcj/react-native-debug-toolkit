import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { debug, type AccountsSnapshot, type DebugSource, type DebugToolkitConfig } from 'react-native-debug-toolkit';
import {
  createDemoSource, DEMO_ACCOUNTS, DEMO_HOST, demoSession,
  setDemoEnvironment, switchDemoAccount, type DemoAccount,
} from './demoApi';

export type StoreState = {
  cartItems: Array<{ id: string; title: string; subtitle: string; price: number; quantity: number }>;
  recentlyViewed: string[];
};
export type FlowTabSnapshot = { screen: string; viewedProducts: string[] };
export const INITIAL_STORE: StoreState = { cartItems: [], recentlyViewed: [] };
export const shopSource = createDemoSource(INITIAL_STORE);
export const flowSource = createDemoSource<FlowTabSnapshot>({ screen: 'Explore', viewedProducts: [] });

let lastSession: ReturnType<typeof demoSession.getSnapshot> | undefined;
let accountsSnapshot: AccountsSnapshot<DemoAccount>;
const accountsSource: DebugSource<AccountsSnapshot<DemoAccount>> = {
  getSnapshot() {
    const session = demoSession.getSnapshot();
    if (session !== lastSession) {
      lastSession = session;
      accountsSnapshot = {
        items: DEMO_ACCOUNTS,
        currentId: session.account.id,
        scopeKey: session.environmentId,
        contextLabel: session.environmentTitle,
        isAuthenticated: session.isAuthenticated,
        currentDetails: [{ title: 'Purchasing account', value: session.account.title }],
      };
    }
    return accountsSnapshot;
  },
  subscribe: demoSession.subscribe,
};

const T = {
  background: '#F4EEE4', hero: '#1B3653', surfaceSoft: '#F7EDDF',
  border: '#E5D8C6', text: '#1A2333', textMuted: '#6B7280', textOnHero: '#FFFDF8',
};
function formatPrice(price: number): string { return `¥${price.toFixed(0)}`; }

function CartDebugTab({ snapshot: state }: { snapshot: StoreState }) {
  const snapshot = {
    items: state.cartItems.map(item => ({
      id: item.id, title: item.title, qty: item.quantity, lineTotal: item.price * item.quantity,
    })),
    total: state.cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };
  return (
    <ScrollView style={s.tabScroll} contentContainerStyle={s.tabContent}>
      <View style={[s.tabCard, { backgroundColor: T.hero }]}>
        <Text style={[s.tabCardLabel, { color: T.textOnHero }]}>CART TOTAL</Text>
        <Text style={[s.tabCardValue, { color: T.textOnHero }]}>{formatPrice(snapshot.total)}</Text>
        <Text style={[s.tabCardMeta, { color: T.textOnHero }]}>
          {snapshot.items.length} item{snapshot.items.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {snapshot.items.length > 0 ? (
        snapshot.items.map((item) => (
          <View key={item.id} style={[s.tabRow, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
            <Text style={[s.tabRowTitle, { color: T.text }]}>{item.title}</Text>
            <Text style={[s.tabRowMeta, { color: T.textMuted }]}>
              x{item.qty}  {formatPrice(item.lineTotal)}
            </Text>
          </View>
        ))
      ) : (
        <Text style={[s.tabEmpty, { color: T.textMuted }]}>Cart is empty — add some products.</Text>
      )}
    </ScrollView>
  );
}

function FlowDebugTab({ snapshot }: { snapshot: FlowTabSnapshot }) {
  return (
    <ScrollView style={s.tabScroll} contentContainerStyle={s.tabContent}>
      <View style={[s.tabCard, { backgroundColor: T.hero }]}>
        <Text style={[s.tabCardLabel, { color: T.textOnHero }]}>CURRENT SCREEN</Text>
        <Text style={[s.tabCardValue, { color: T.textOnHero }]}>{snapshot.screen}</Text>
      </View>

      <View style={[s.tabSection, { backgroundColor: T.surfaceSoft, borderColor: T.border }]}>
        <Text style={[s.tabSectionTitle, { color: T.text }]}>Viewed Products</Text>
        {snapshot.viewedProducts.length > 0 ? (
          snapshot.viewedProducts.map((title) => (
            <Text key={title} style={[s.tabBullet, { color: T.text }]}>
              • {title}
            </Text>
          ))
        ) : (
          <Text style={[s.tabEmpty, { color: T.textMuted }]}>No products viewed yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

export const demoDebugConfig = {
  locale: 'zh-CN',
  // No explicit endpoint: Debug builds discover the local Hub.
  connect: { appId: 'com.reactnativedebugtoolkit.demo' },
  environment: {
    defaultId: 'dev',
    items: [
      { id: 'dev', title: 'Development', urls: { api: `http://${DEMO_HOST}:3801` } },
      { id: 'staging', title: 'Staging', urls: { api: `http://${DEMO_HOST}:3802` } },
    ],
    onChange: setDemoEnvironment,
  },
  accounts: { source: accountsSource, onSwitch: (account, { signal }) => switchDemoAccount(account, signal) },
  state: { adapters: [{ id: 'shopStore', ...shopSource }] },
  // This sample uses its own route state; App records explicit debug.navigation events.
  navigation: {},
  track: {},
  tabs: {
    items: [
      { id: 'my-cart', title: 'My Cart', source: shopSource, component: CartDebugTab,
        badge: snapshot => snapshot.cartItems.length
          ? { label: String(snapshot.cartItems.length), color: '#2563EB' } : null },
      { id: 'user-flow', title: 'User Flow', source: flowSource, component: FlowDebugTab },
    ],
  },
  quickActions: {
    items: [
      { id: 'reset-cart', title: 'Reset cart', icon: '↺', onPress: () => shopSource.publish(INITIAL_STORE) },
      { id: 'use-staging', title: 'Staging', icon: '⌁', onPress: () => debug.environment.switchTo('staging') },
      { id: 'personal-account', title: 'Personal', icon: '◎', onPress: () => (
        switchDemoAccount(DEMO_ACCOUNTS[0]!, new AbortController().signal)
      ) },
    ],
  },
} satisfies DebugToolkitConfig<DemoAccount, [StoreState, FlowTabSnapshot]>;

const s = StyleSheet.create({
  tabScroll: { flex: 1, backgroundColor: T.background },
  tabContent: { padding: 16, gap: 12 },
  tabCard: { borderRadius: 18, padding: 16, gap: 6 },
  tabCardLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, opacity: 0.75 },
  tabCardValue: { fontSize: 24, fontWeight: '800', lineHeight: 30 },
  tabCardMeta: { fontSize: 13, fontWeight: '600', opacity: 0.8 },
  tabSection: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  tabSectionTitle: { fontSize: 15, fontWeight: '800' },
  tabRow: { borderRadius: 14, borderWidth: 1, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabRowTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  tabRowMeta: { fontSize: 13, fontWeight: '600' },
  tabBullet: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  tabEmpty: { fontSize: 13, lineHeight: 18 },
});
