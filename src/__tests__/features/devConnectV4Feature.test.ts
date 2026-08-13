// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DevConnectTabV4 } from '../../features/devConnect/DevConnectTabV4';
import { createDevConnectFeature } from '../../features/devConnect';
import { _resetHubClientForTesting, hubClient } from '../../utils/HubClient';

jest.mock('../../features/devConnect/resolveAndApplyHubEndpoint', () => ({
  resolveAndApplyHubEndpoint: jest.fn(async () => 'http://10.20.4.10:3800'),
}));

describe('createDevConnectFeature v4', () => {
  beforeEach(() => {
    _resetHubClientForTesting();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    _resetHubClientForTesting();
  });

  it('uses appId and endpoint to configure and start the shared Hub during feature setup', async () => {
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);
    const { resolveAndApplyHubEndpoint } = jest.requireMock(
      '../../features/devConnect/resolveAndApplyHubEndpoint',
    );

    const feature = createDevConnectFeature({
      appId: 'com.example.audit',
      endpoint: 'http://10.20.4.10:3800',
    });

    expect(feature.renderContent).toBe(DevConnectTabV4);
    expect(feature.getSnapshot()).toMatchObject({
      appId: 'com.example.audit',
      canonicalEndpoint: 'http://10.20.4.10:3800',
    });

    feature.setup();
    await Promise.resolve();
    await Promise.resolve();

    expect(configure).toHaveBeenCalledWith({
      appId: 'com.example.audit',
      endpoint: 'http://10.20.4.10:3800',
    });
    expect(resolveAndApplyHubEndpoint).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('allows Debug setup without a configured endpoint', async () => {
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);

    const feature = createDevConnectFeature({
      appId: 'com.example.audit',
    });

    feature.setup();
    await Promise.resolve();
    await Promise.resolve();

    expect(configure).toHaveBeenCalledWith({
      appId: 'com.example.audit',
      endpoint: null,
    });
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
