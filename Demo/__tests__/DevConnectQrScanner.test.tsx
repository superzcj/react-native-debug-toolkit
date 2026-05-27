import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { DevConnectQrScanner } from '../../src/features/devConnect/DevConnectQrScanner';

jest.mock('../../src/features/devConnect/cameraKit', () => {
  const ReactForMock = require('react');
  return {
    getScannerModule: () => ({
      kind: 'camera-kit',
      CameraKit: {
        CameraType: { Back: 'back' },
        Camera: ({ children, ...props }: { children?: React.ReactNode }) =>
          ReactForMock.createElement('Camera', props, children),
      },
    }),
  };
});

const originalConsoleError = console.error;
let consoleErrorSpy: jest.SpyInstance;

function findTextCount(root: ReactTestRenderer.ReactTestInstance, value: string): number {
  return root.findAll(
    (node) => (node.type as unknown) === 'Text' && node.props.children === value,
  ).length;
}

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

test('renders scanner chrome with one close action', async () => {
  let renderer: ReactTestRenderer.ReactTestRenderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <DevConnectQrScanner
        visible
        onClose={jest.fn()}
        onScanTarget={jest.fn()}
      />,
    );
  });

  expect(findTextCount(renderer!.root, 'Close')).toBe(1);
  expect(findTextCount(renderer!.root, 'Scan Metro QR')).toBe(1);

  await ReactTestRenderer.act(async () => {
    renderer!.unmount();
  });
});
