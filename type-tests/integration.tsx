import React from 'react';
import { withDebugToolkit, debug, type DebugToolkitConfig, type DebugAccount, type AccountsSnapshot, type DebugSource, type DebugQuickAction } from '../src';
// @ts-expect-error Old bootstrap and default export were removed.
import initializeDebugToolkit from '../src';
// @ts-expect-error Old factories, Provider, hooks and utility exports were removed.
import { DebugView, DebugToolkitProvider, useDebugToolkit, createNetworkFeature, createDebugTab, addTrackLog, copyToComputer } from '../src';
const empty = { accounts: {}, environment: {}, tabs: {} } satisfies DebugToolkitConfig;
const disabled = { accounts: { enabled: false } } satisfies DebugToolkitConfig;
declare const someBoolean: boolean;
const toggled = { accounts: { enabled: someBoolean } } satisfies DebugToolkitConfig;
const itemsOnly = { accounts: { items: [{ id: 'a', title: 'A' }] } } satisfies DebugToolkitConfig;
const callbackOnly = { accounts: { onSwitch: (account) => { account.title.toUpperCase(); } } } satisfies DebugToolkitConfig;
function App(props: { greeting: string }) { return <>{props.greeting}</>; }
const Wrapped = withDebugToolkit(App, {
  accounts: {
    items: [{ id: 'a', title: 'A', tenantId: 42 }],
    onSwitch: (account, { signal }) => { account.tenantId.toFixed(); const cancelled: boolean = signal.aborted; void cancelled; },
  },
});
const validApp = <Wrapped greeting="hello" />;
// @ts-expect-error Required App props survive wrapping.
const missingProps = <Wrapped />;
// @ts-expect-error App prop types survive wrapping.
const invalidProps = <Wrapped greeting={42} />;
declare const TypedApp: React.ComponentType<{ greeting: string }>;
const TypedWrapped = withDebugToolkit(TypedApp);
const typedApp = <TypedWrapped greeting="hello" />;
interface MyAccount extends DebugAccount { tenantId: number }
interface CartSnapshot { total: number }
const cartSource: DebugSource<CartSnapshot> = { getSnapshot: () => ({ total: 10 }), subscribe: () => () => {} };
const accountsSource: DebugSource<AccountsSnapshot<MyAccount>> = { getSnapshot: () => ({ items: [{ id: 'a', title: 'A', tenantId: 1 }] }), subscribe: () => () => {} };
const Cart = ({ snapshot }: { snapshot: CartSnapshot }) => <>{snapshot.total}</>;
const Plain = () => null;
const mixed = {
  accounts: { source: accountsSource, onSwitch: (account) => { account.tenantId.toFixed(); } },
  tabs: { items: [{ id: 'cart', title: 'Cart', source: cartSource, component: Cart, badge: (snapshot) => ({ label: String(snapshot.total), color: 'red' }) }, { id: 'plain', title: 'Plain', component: Plain }] },
} satisfies DebugToolkitConfig<MyAccount, readonly [CartSnapshot, never]>;
const MixedApp = withDebugToolkit(App, mixed);
const mixedApp = <MixedApp greeting="hi" />;
// @ts-expect-error Mixed tabs do not erase App props.
const badMixedApp = <MixedApp />;
const plain = { tabs: { items: [{ id: 'plain', title: 'Plain', component: Plain }] } } satisfies DebugToolkitConfig;
const quickAction: DebugQuickAction = { id: 'refresh', title: 'Refresh', icon: '↻', onPress: async () => undefined };
const quickActions = { quickActions: { items: [quickAction], enabled: true } } satisfies DebugToolkitConfig;
// @ts-expect-error Feature boolean is not supported.
const oldShape = { network: true } satisfies DebugToolkitConfig;
// @ts-expect-error Feature arrays are not supported.
const arrayShape = { environment: [] } satisfies DebugToolkitConfig;
// @ts-expect-error A bare navigation ref is not a feature config.
const bareRef = { navigation: { current: null } } satisfies DebugToolkitConfig;
// @ts-expect-error Provided records must have title.
const invalidAccount = { accounts: { items: [{ id: 'a' }] } } satisfies DebugToolkitConfig;
// @ts-expect-error Provided records must have id.
const missingId = { accounts: { items: [{ title: 'A' }] } } satisfies DebugToolkitConfig;
// @ts-expect-error Source and static items are mutually exclusive.
const conflictingItems = { accounts: { source: accountsSource, items: [] } } satisfies DebugToolkitConfig<MyAccount>;
// @ts-expect-error Source and static authentication data are mutually exclusive.
const conflictingCurrent = { accounts: { source: accountsSource, currentId: 'a' } } satisfies DebugToolkitConfig<MyAccount>;
// @ts-expect-error Provided account source snapshots must contain items.
const badSource = { accounts: { source: { getSnapshot: () => ({ currentId: 'a' }), subscribe: () => () => {} } } } satisfies DebugToolkitConfig;
// @ts-expect-error Provided tabs must have a component.
const missingComponent = { tabs: { items: [{ id: 'bad', title: 'Bad' }] } } satisfies DebugToolkitConfig;
const WrongCart = ({ snapshot }: { snapshot: { text: string } }) => <>{snapshot.text}</>;
// @ts-expect-error Component snapshot must match source snapshot.
const wrongSnapshot = { tabs: { items: [{ id: 'cart', title: 'Cart', source: cartSource, component: WrongCart }] } } satisfies DebugToolkitConfig<DebugAccount, readonly [CartSnapshot]>;
const navigation = { navigation: { ref: { current: { isReady: () => true, getCurrentRoute: () => ({ name: 'Home' }), getRootState: () => ({}), addListener: (_event: 'state', _callback: () => void) => () => {} } } } } satisfies DebugToolkitConfig;
// @ts-expect-error Ref methods are required when current is non-null.
const invalidRef = { navigation: { ref: { current: {} } } } satisfies DebugToolkitConfig;

debug.track('checkout', { total: 20 });
debug.state('cart', { action: 'add', before: 0, after: 1 });
debug.navigation({ action: 'navigate', to: 'Cart' });
void debug.environment.switchTo('staging');
debug.clear('state');
// @ts-expect-error clear only accepts the six current log features.
debug.clear('environment');
// @ts-expect-error Old log feature key is unsupported.
debug.clear('zustand');
class ClassApp extends React.Component<{ title: string }> { title() { return this.props.title; } render() { return null; } }
const ClassWrapped = withDebugToolkit(ClassApp);
const classApp = <ClassWrapped title="Shop" ref={React.createRef<ClassApp>()} />;
declare const classInstance: React.ComponentRef<typeof ClassWrapped>;
const classTitle: string = classInstance.title();
const callbackClassApp = <ClassWrapped title="Shop" ref={instance => { instance?.title().toUpperCase(); }} />;
// @ts-expect-error A class ref must preserve the specific App instance methods.
const wrongClassRef = <ClassWrapped title="Shop" ref={React.createRef<React.Component<{ title: string }>>()} />;
const RefApp = React.forwardRef<{ reload(): void }, { title: string }>(() => null);
const RefWrapped = withDebugToolkit(RefApp);
const refApp = <RefWrapped title="Shop" ref={React.createRef<{ reload(): void }>()} />;
// @ts-expect-error Ref types survive wrapping.
const wrongRef = <RefWrapped title="Shop" ref={React.createRef<{ count: number }>()} />;
