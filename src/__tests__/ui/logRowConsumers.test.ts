import React from 'react';
import type { ReactElement } from 'react';
import { renderConsoleLogRow } from '../../features/console/ConsoleLogTab';
import { renderNativeLogRow } from '../../features/nativeLogs/NativeLogTab';
import { renderNetworkLogRow } from '../../features/network/NetworkLogTab';
import { renderTrackLogRow } from '../../features/track/TrackLogTab';
import { renderZustandLogRow } from '../../features/zustand/ZustandLogTab';
import { renderNavigationLogRow } from '../../features/navigation/NavigationLogTab';
import { renderSessionLogRow } from '../../features/sessionHistory/SessionHistoryTab';
import { CopyButton } from '../../ui/shared/CopyButton';
import { LogRow } from '../../ui/shared/LogRow';
import type { LogRowProps } from '../../ui/shared/LogRow';

type ElementProps = Record<string, any>;

function propsOf(node: React.ReactNode): ElementProps {
  return (node as ReactElement<ElementProps>).props;
}

function rowProps(element: ReactElement): LogRowProps {
  if (element.type === LogRow) {
    return element.props as LogRowProps;
  }
  const nested = findElementByType(element, LogRow);
  expect(nested).toBeDefined();
  return nested!.props as LogRowProps;
}

function textContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(propsOf(node).children).map(textContent).join('');
}

function findElementByType(
  node: React.ReactNode,
  type: React.ElementType,
): ReactElement<ElementProps> | undefined {
  if (!React.isValidElement(node)) return undefined;
  const element = node as ReactElement<ElementProps>;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElementByType(child, type);
    if (found) return found;
  }
  return undefined;
}

describe('live log row consumers', () => {
  it('maps Console message, level, and time into the shared row', () => {
    const props = rowProps(renderConsoleLogRow({
      id: 'console-1',
      timestamp: 1,
      level: 'warn',
      data: ['first', 'second'],
    }));

    expect(props.content).toBe('first second');
    expect(textContent(props.metadata)).toContain('⚠');
    expect(props.trailingMetadata).toBeDefined();
    expect(props.maxContentLines).toBeUndefined();
  });

  it('maps Native source metadata below the full message', () => {
    const props = rowProps(renderNativeLogRow({
      id: 'native-1',
      timestamp: 1,
      platform: 'android',
      level: 'info',
      source: 'logcat',
      tag: 'ReactNative',
      message: 'native message',
    }));

    expect(props.content).toBe('native message');
    expect(textContent(props.metadata)).toContain('android / logcat / ReactNative');
    expect(props.trailingMetadata).toBeDefined();
  });

  it('maps Network path and long footer metadata into separate slots', () => {
    const props = rowProps(renderNetworkLogRow({
      id: 'network-1',
      timestamp: 1,
      duration: 1200,
      request: { method: 'GET', url: 'https://api.example.com/orders?q=open' },
      response: { status: 503 },
    }));
    const metadata = textContent(props.metadata);

    expect(props.content).toBe('/orders?q=open');
    expect(metadata).toContain('GET');
    expect(metadata).toContain('503');
    expect(metadata).toContain('1200ms');
    expect(metadata).toContain('api.example.com');
    expect(props.trailingMetadata).toBeDefined();
  });

  it('maps Track event previews below the event name', () => {
    const props = rowProps(renderTrackLogRow({
      id: 'track-1',
      timestamp: 1,
      eventName: 'checkout_started',
      campaign: 'spring',
      source: 'banner',
    }));

    expect(props.content).toBe('checkout_started');
    expect(textContent(props.metadata)).toContain('campaign spring');
    expect(textContent(props.metadata)).toContain('source banner');
    expect(props.trailingMetadata).toBeDefined();
  });

  it('puts changed keys in the title and store name in the footer', () => {
    const props = rowProps(renderZustandLogRow({
      id: 'zustand-1',
      timestamp: 1,
      action: 'setState',
      prevState: { id: null, setUser: () => undefined },
      nextState: { id: 1, setUser: () => undefined },
      storeName: 'auth',
      actionCompleteTime: 12,
    }));

    expect(props.content).toBe('id');
    expect(textContent(props.metadata)).toContain('auth');
    expect(textContent(props.metadata)).not.toContain('setState');
    expect(textContent(props.trailingMetadata)).toContain('12ms');
  });

  it('keeps a named Zustand action as a footer badge when title is changed keys', () => {
    const props = rowProps(renderZustandLogRow({
      id: 'zustand-2',
      timestamp: 1,
      action: 'setUser',
      prevState: { id: null },
      nextState: { id: 1 },
      storeName: 'auth',
    }));

    expect(props.content).toBe('id');
    expect(textContent(props.metadata)).toContain('auth');
    expect(textContent(props.metadata)).toContain('setUser');
  });

  it('falls back to named action as title when there is no key diff', () => {
    const props = rowProps(renderZustandLogRow({
      id: 'zustand-3',
      timestamp: 1,
      action: 'hydrate',
      prevState: null,
      nextState: { id: 1 },
      storeName: 'auth',
    }));

    expect(props.content).toBe('hydrate');
    expect(textContent(props.metadata)).toContain('auth');
  });

  it('keeps Navigation transition full-width and Copy in the footer', () => {
    const props = rowProps(renderNavigationLogRow({
      id: 'navigation-1',
      timestamp: 1,
      action: 'PUSH',
      from: 'Home',
      to: 'Details',
      duration: 18,
    }));
    const copy = findElementByType(props.trailingMetadata, CopyButton);

    expect(props.content).toBe('Home → Details');
    expect(textContent(props.metadata)).toBe('PUSH');
    expect(textContent(props.trailingMetadata)).toContain('18ms');
    expect(copy?.props.text).toBe('PUSH: Home → Details');
    expect(copy?.props.compact).toBe(true);
  });
});

describe('session history log row consumers', () => {
  it('maps Session History Console entries into the shared row', () => {
    const props = rowProps(renderSessionLogRow({
      id: 'console_logs-0',
      type: 'console_logs',
      timestamp: 1,
      raw: { timestamp: 1, level: 'error', data: ['session', 'failure'] },
    }));

    expect(props.content).toBe('session failure');
    expect(textContent(props.metadata)).toContain('✕');
  });

  it('maps Session History Native entries without treating them as Track events', () => {
    const props = rowProps(renderSessionLogRow({
      id: 'native_logs-0',
      type: 'native_logs',
      timestamp: 1,
      raw: {
        timestamp: 1,
        level: 'error',
        platform: 'ios',
        source: 'rctLog',
        tag: 'Bridge',
        message: 'native session failure',
      },
    }));

    expect(props.content).toBe('native session failure');
    expect(textContent(props.metadata)).toContain('ios / rctLog / Bridge');
  });

  it('maps Session History Network entries into content and metadata', () => {
    const props = rowProps(renderSessionLogRow({
      id: 'network_logs-0',
      type: 'network_logs',
      timestamp: 1,
      raw: {
        timestamp: 1,
        request: { method: 'GET', url: 'https://api.example.com/orders' },
        response: { status: 500 },
      },
    }));

    expect(props.content).toBe('/orders');
    expect(textContent(props.metadata)).toContain('GET');
    expect(textContent(props.metadata)).toContain('500');
  });

  it('maps Session History Track entries into the shared row', () => {
    const props = rowProps(renderSessionLogRow({
      id: 'track_logs-0',
      type: 'track_logs',
      timestamp: 1,
      raw: { timestamp: 1, eventName: 'purchase_completed' },
    }));

    expect(props.content).toBe('purchase_completed');
    expect(props.trailingMetadata).toBeDefined();
  });
});
