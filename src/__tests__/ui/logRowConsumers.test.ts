import React from 'react';
import type { ReactElement } from 'react';
import { renderConsoleLogRow } from '../../features/console/ConsoleLogTab';
import { renderNativeLogRow } from '../../features/nativeLogs/NativeLogTab';
import { renderNetworkLogRow } from '../../features/network/NetworkLogTab';
import { LogRow } from '../../ui/shared/LogRow';
import type { LogRowProps } from '../../ui/shared/LogRow';

type ElementProps = Record<string, any>;

function propsOf(node: React.ReactNode): ElementProps {
  return (node as ReactElement<ElementProps>).props;
}

function rowProps(element: ReactElement): LogRowProps {
  expect(element.type).toBe(LogRow);
  return element.props as LogRowProps;
}

function textContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(propsOf(node).children).map(textContent).join('');
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
});
