import { Platform } from 'react-native';
import type { DebugAccount, DebugSource } from 'react-native-debug-toolkit';

// For a physical device, replace this host with your computer's LAN IP.
export const DEMO_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const DEMO_API = `http://${DEMO_HOST}:3801`;

export function createDemoSource<T>(initial: T): DebugSource<T> & { publish(value: T): void } {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(value) {
      snapshot = value;
      listeners.forEach(listener => listener());
    },
  };
}

// These are local sample-shop identities, not credentials or a remote login service.
export interface DemoAccount extends DebugAccount { customerType: 'personal' | 'studio' }
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { id: 'personal', title: 'Sam Chen', subtitle: 'Personal shopping', customerType: 'personal' },
  { id: 'studio', title: 'Atelier Studio', subtitle: 'Studio purchasing', customerType: 'studio' },
];
export const demoSession = createDemoSource({
  account: DEMO_ACCOUNTS[0]!,
  environmentId: 'dev',
  environmentTitle: 'Development',
  apiUrl: DEMO_API,
  isAuthenticated: true,
});

export function getDemoApi(): string { return demoSession.getSnapshot().apiUrl; }

export function setDemoEnvironment(environment: { id: string; title: string; urls: Readonly<Record<string, string>> }) {
  demoSession.publish({
    ...demoSession.getSnapshot(),
    environmentId: environment.id,
    environmentTitle: environment.title,
    apiUrl: environment.urls.api!,
  });
}

export async function switchDemoAccount(account: DemoAccount, signal: AbortSignal) {
  await Promise.resolve();
  if (signal.aborted) { return; }
  // Publishing the real session during the switch also updates the account page.
  demoSession.publish({ ...demoSession.getSnapshot(), account, isAuthenticated: true });
}

// Explicit text XHR keeps the JSON body inspectable across RN fetch/Blob versions.
export function checkoutRequest(scenario: 'sold-out' | 'available') {
  return new Promise<{ status: number; ok: boolean; data: { message?: string; orderId?: string } }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const session = demoSession.getSnapshot();
    xhr.open('POST', `${getDemoApi()}/checkout`);
    xhr.timeout = 8000;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-Demo-Scenario', scenario);
    xhr.onload = () => {
      try {
        resolve({ status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, data: JSON.parse(xhr.responseText) });
      } catch (error) { reject(error); }
    };
    xhr.onerror = () => reject(new Error('Demo API unreachable'));
    xhr.ontimeout = () => reject(new Error('Demo API timed out'));
    xhr.send(JSON.stringify({ scenario, productId: 'linen-chair', quantity: 1, currency: 'CNY', accountId: session.account.id }));
  });
}
