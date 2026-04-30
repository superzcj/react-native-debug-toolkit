/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

const originalConsoleError = console.error;
let consoleErrorSpy: jest.SpyInstance;

beforeAll(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('react-test-renderer is deprecated')
    ) {
      return;
    }
    originalConsoleError(...args);
  });
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

test('renders correctly', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => [
      {
        id: 1,
        title: 'mock post',
        body: 'mock body',
      },
      {
        id: 2,
        title: 'mock post 2',
        body: 'mock body 2',
      },
    ],
  }) as unknown as typeof fetch;

  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
    await Promise.resolve();
  });

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
