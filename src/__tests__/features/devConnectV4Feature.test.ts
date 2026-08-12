// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DevConnectTabV4 } from '../../features/devConnect/DevConnectTabV4';
import { createDevConnectFeature } from '../../features/devConnect';
import { _resetHubClientForTesting, hubClient } from '../../utils/HubClient';

describe('createDevConnectFeature v4', () => {
  beforeEach(() => {
    _resetHubClientForTesting();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    _resetHubClientForTesting();
  });

  it('uses appId and endpoint to configure and start the shared Hub during feature setup', () => {
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);

    const createV4Feature = createDevConnectFeature as unknown as (config: {
      appId: string;
      endpoint: string;
    }) => ReturnType<typeof createDevConnectFeature>;
    const feature = createV4Feature({
      appId: 'com.example.audit',
      endpoint: 'http://10.20.4.10:3799',
    });

    expect(feature.renderContent).toBe(DevConnectTabV4);
    expect(feature.getSnapshot()).toMatchObject({
      appId: 'com.example.audit',
      canonicalEndpoint: 'http://10.20.4.10:3799',
    });

    feature.setup();

    expect(configure).toHaveBeenCalledWith({
      appId: 'com.example.audit',
      endpoint: 'http://10.20.4.10:3799',
    });
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
