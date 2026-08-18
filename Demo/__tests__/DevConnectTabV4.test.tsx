import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Linking } from 'react-native';

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}), { virtual: true });

import { DevConnectTabV4 } from '../../src/features/devConnect/DevConnectTabV4';
import type { DevConnectV4State } from '../../src/features/devConnect/types';
import type { DebugFeature } from '../../src/types';
import { _resetHubClientForTesting, hubClient } from '../../src/utils/HubClient';

const snapshot: DevConnectV4State = {
  appId: 'com.example.audit',
  canonicalEndpoint: 'http://192.168.1.10:3800',
  configuredEndpoint: 'http://192.168.1.10:3800',
  subnetPrefix: '192.168.1.',
};

const feature: DebugFeature<DevConnectV4State> = {
  name: 'devConnect',
  label: 'Connect',
  setup: () => undefined,
  cleanup: () => undefined,
  getSnapshot: () => snapshot,
};

function pressText(root: ReactTestRenderer.ReactTestInstance, value: string) {
  const text = root.findAll(
    (node) => (node.type as unknown) === 'Text' && node.props.children === value,
  )[0];
  if (!text) throw new Error(`Text not found: ${value}`);
  let node: ReactTestRenderer.ReactTestInstance | null = text;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  if (!node) throw new Error(`No pressable parent for ${value}`);
  node.props.onPress();
}

function hubResponse(status: number, body: Record<string, unknown>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve();
  }
}

describe('DevConnectTabV4 Upload Once', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    _resetHubClientForTesting();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('/sessions') && !String(url).includes('/events')) {
        return hubResponse(201, {
          ok: true,
          sessionId: '123e4567-e89b-42d3-a456-426614174000',
          deviceId: 'test-device',
          expectedSequence: 1,
          ackThrough: 0,
        });
      }
      if (String(url).includes('/events')) {
        return hubResponse(200, { ok: true, ackThrough: 1, expectedSequence: 2, rejected: [] });
      }
      return hubResponse(200, { ok: true });
    });
    (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
    (Linking.openSettings as jest.Mock).mockClear();
  });

  afterEach(() => {
    _resetHubClientForTesting();
    delete (globalThis as unknown as { fetch?: typeof fetchMock }).fetch;
  });

  it('retries an unreachable Hub instead of opening iOS Settings', async () => {
    hubClient.configure({
      appId: 'com.example.audit',
      endpoint: 'http://192.168.1.10:3800',
    });
    hubClient.markDiscoveryFailed(['http://192.168.1.10:3800']);

    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <DevConnectTabV4 snapshot={snapshot} feature={feature} />,
      );
    });

    await ReactTestRenderer.act(async () => {
      pressText(renderer!.root, 'Upload Once');
      await flushPromises();
    });

    expect(Linking.openSettings).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/sessions'))).toBe(true);

    await ReactTestRenderer.act(async () => {
      renderer!.unmount();
    });
  });
});
