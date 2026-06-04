import { buildFeatureSummary } from '../../ui/panel/buildFeatureSummary';
import { filterFeatureSnapshot } from '../../ui/panel/filterFeatureSnapshot';
import { Colors } from '../../ui/theme/colors';
import type { AnyDebugFeature } from '../../types';

function mockFeature(name: string): AnyDebugFeature {
  return {
    name,
    label: name,
    setup() {},
    getSnapshot: () => null,
    cleanup() {},
  };
}

// ─── buildFeatureSummary ───────────────────────────────

describe('buildFeatureSummary', () => {
  it('network: counts requests, bad, and latest label', () => {
    const f = mockFeature('network');
    const snap = [
      { request: { method: 'GET', url: 'https://api.test.com/users' }, response: { status: 200 } },
      { request: { method: 'POST', url: 'https://api.test.com/orders' }, response: { status: 500 } },
      { request: { method: 'GET', url: 'https://api.test.com/cart' }, error: 'Network Error' },
    ];
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(3);
    expect(s.badCount).toBe(2);
    expect(s.latestLabel).toContain('GET');
    expect(s.supportsBadFilter).toBe(true);
  });

  it('network: empty snapshot', () => {
    const f = mockFeature('network');
    const s = buildFeatureSummary(f, []);
    expect(s.count).toBe(0);
    expect(s.badCount).toBeUndefined();
    expect(s.latestLabel).toBeUndefined();
  });

  it('console: counts logs, bad warn/error', () => {
    const f = mockFeature('console');
    const snap = [
      { level: 'log', data: ['hello'] },
      { level: 'warn', data: ['careful'] },
      { level: 'error', data: ['oops'] },
    ];
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(3);
    expect(s.badCount).toBe(2);
    expect(s.latestLabel).toBe('oops');
  });

  it('console: handles fatal level', () => {
    const f = mockFeature('console');
    const snap = [
      { level: 'fatal', data: ['crash'] },
    ];
    const s = buildFeatureSummary(f, snap);
    expect(s.badCount).toBe(1);
  });

  it('navigation: latest from → to', () => {
    const f = mockFeature('navigation');
    const snap = [
      { from: 'Home', to: 'Cart' },
      { from: 'Cart', to: 'Checkout' },
    ];
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(2);
    expect(s.latestLabel).toBe('Cart → Checkout');
    expect(s.supportsBadFilter).toBe(false);
  });

  it('zustand: latest action and store', () => {
    const f = mockFeature('zustand');
    const snap = [
      { action: 'increment', storeName: 'counterStore' },
      { action: 'addItem', storeName: 'cartStore' },
    ];
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(2);
    expect(s.latestLabel).toBe('addItem @ cartStore');
  });

  it('track: latest event name', () => {
    const f = mockFeature('track');
    const snap = [
      { eventName: 'page_view' },
      { eventName: 'add_to_cart' },
    ];
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(2);
    expect(s.latestLabel).toBe('add_to_cart');
  });

  it('environment: shows current environment label', () => {
    const f = mockFeature('environment');
    const snap = {
      environments: [
        { id: 'dev', label: 'Development', host: 'dev.api' },
        { id: 'prod', label: 'Production', host: 'api.prod' },
      ],
      currentEnvironmentId: 'dev',
    };
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(2);
    expect(s.latestLabel).toBe('Development');
    expect(s.statusLabel).toBe('Development');
    expect(s.supportsBadFilter).toBe(false);
  });

  it('devConnect: streaming state', () => {
    const f = mockFeature('devConnect');
    const snap = { streaming: true, computerHost: '192.168.1.5', daemonPort: '3000' };
    const s = buildFeatureSummary(f, snap);
    expect(s.statusLabel).toBe('live 192.168.1.5:3000');
    expect(s.statusColor).toBe(Colors.success);
  });

  it('devConnect: not streaming shows host', () => {
    const f = mockFeature('devConnect');
    const snap = { streaming: false, computerHost: '192.168.1.5', daemonPort: '3000' };
    const s = buildFeatureSummary(f, snap);
    expect(s.statusLabel).toBe('offline 192.168.1.5:3000');
    expect(s.statusColor).toBeUndefined();
  });

  it('unknown feature: generic fallback', () => {
    const f = mockFeature('customAnalytics');
    const snap = [{ a: 1 }, { b: 2 }];
    const s = buildFeatureSummary(f, snap);
    expect(s.count).toBe(2);
    expect(s.capabilityText).toContain('2 items');
    expect(s.supportsBadFilter).toBe(false);
  });
});

// ─── filterFeatureSnapshot ─────────────────────────────

describe('filterFeatureSnapshot', () => {
  it('network Bad: includes 500 and error entries', () => {
    const f = mockFeature('network');
    const snap = [
      { request: { method: 'GET' }, response: { status: 200 } },
      { request: { method: 'POST' }, response: { status: 500 } },
      { request: { method: 'GET' }, error: 'timeout' },
    ];
    const result = filterFeatureSnapshot(f, snap, '', 'bad');
    expect(result).toHaveLength(2);
  });

  it('console Bad: includes warn/error/fatal', () => {
    const f = mockFeature('console');
    const snap = [
      { level: 'log', data: ['ok'] },
      { level: 'warn', data: ['careful'] },
      { level: 'error', data: ['oops'] },
      { level: 'fatal', data: ['crash'] },
    ];
    const result = filterFeatureSnapshot(f, snap, '', 'bad');
    expect(result).toHaveLength(3);
  });

  it('query filter: searches URL, method, console message', () => {
    const f = mockFeature('network');
    const snap = [
      { request: { method: 'GET', url: 'https://api.test.com/users' }, response: { status: 200 } },
      { request: { method: 'POST', url: 'https://api.test.com/orders' }, response: { status: 200 } },
    ];
    const result = filterFeatureSnapshot(f, snap, 'users', 'all');
    expect(result).toHaveLength(1);
  });

  it('query filter: searches console message data', () => {
    const f = mockFeature('console');
    const snap = [
      { level: 'log', data: ['hello world'] },
      { level: 'log', data: ['goodbye'] },
    ];
    const result = filterFeatureSnapshot(f, snap, 'hello', 'all');
    expect(result).toHaveLength(1);
  });

  it('non-array snapshot returned unchanged', () => {
    const f = mockFeature('devConnect');
    const snap = { streaming: true };
    const result = filterFeatureSnapshot(f, snap, 'anything', 'bad');
    expect(result).toBe(snap);
  });

  it('non-bad-filter feature ignores bad mode', () => {
    const f = mockFeature('navigation');
    const snap = [
      { from: 'Home', to: 'Cart' },
      { from: 'Cart', to: 'Checkout' },
    ];
    const result = filterFeatureSnapshot(f, snap, '', 'bad');
    expect(result).toHaveLength(2);
  });

  it('combined bad + query', () => {
    const f = mockFeature('network');
    const snap = [
      { request: { method: 'GET', url: '/users' }, response: { status: 500 } },
      { request: { method: 'POST', url: '/orders' }, response: { status: 500 } },
      { request: { method: 'GET', url: '/users' }, response: { status: 200 } },
    ];
    const result = filterFeatureSnapshot(f, snap, 'users', 'bad');
    expect(result).toHaveLength(1);
  });
});
