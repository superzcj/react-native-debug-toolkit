import { NativeModules } from 'react-native';
import { createToolkitHost } from '../../core/DebugToolkit';

test('network detail copy is forwarded to Metro without a Hub', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: jest.fn(async () => true) };
  const metroLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const host = createToolkitHost({ enabled: true, connect: { appId: 'com.anonymous.lemon' } });
  host.start();
  try {
    await host.ready;
    const result = await host.actions.copyToComputer('repro-network-payload', { label: 'Response Body' });
    expect(result.console.status).toBe('success');
    expect(result.hub.status).toBe('unavailable');
    expect(metroLog).toHaveBeenCalledWith('[DebugToolkit:Copy]', 'repro-network-payload');
    expect(host.actions.getReport().logs.console).toEqual([
      expect.objectContaining({ data: ['Response Body', 'repro-network-payload'] }),
    ]);
  } finally {
    host.dispose();
    metroLog.mockRestore();
  }
});

test('release copy does not write to the Metro console', async () => {
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: jest.fn(async () => false) };
  const metroLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  const host = createToolkitHost({ enabled: true, connect: { appId: 'com.anonymous.lemon' } });
  host.start();
  try {
    await host.ready;
    const result = await host.actions.copyToComputer('release-payload', { label: 'Response Body' });
    expect(result.console.status).toBe('success');
    expect(metroLog).not.toHaveBeenCalled();
  } finally {
    host.dispose();
    metroLog.mockRestore();
  }
});
