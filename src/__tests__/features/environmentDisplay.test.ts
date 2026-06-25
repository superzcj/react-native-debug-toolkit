import {
  getEnvironmentUrlRows,
  isDefaultEnvironment,
} from '../../features/environment/EnvironmentTab';
import type { EnvironmentListItem, EnvironmentState } from '../../types';

describe('environment display helpers', () => {
  it('shows concrete URL rows for managed environments', () => {
    const env: EnvironmentListItem = {
      mode: 'managed',
      id: 'prod',
      label: 'Production',
      urls: {
        auth: 'https://auth.example.com',
        app: 'https://api.example.com',
        crmeb: 'https://api.example.com/shop',
        h5: 'https://m.example.com',
      },
    };

    expect(getEnvironmentUrlRows(env)).toEqual([
      { label: 'Auth', value: 'https://auth.example.com' },
      { label: 'App', value: 'https://api.example.com' },
      { label: 'Crmeb', value: 'https://api.example.com/shop' },
      { label: 'H5', value: 'https://m.example.com' },
    ]);
  });

  it('shows legacy host as a concrete row', () => {
    const env: EnvironmentListItem = {
      mode: 'legacy',
      id: 'dev',
      label: 'Development',
      host: 'dev.api.example.com',
    };

    expect(getEnvironmentUrlRows(env)).toEqual([
      { label: 'Host', value: 'dev.api.example.com' },
    ]);
  });

  it('marks managed default environment even before user switches', () => {
    const state: EnvironmentState = {
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: 'prod',
      environments: [],
    };

    expect(isDefaultEnvironment(state, 'prod')).toBe(true);
    expect(isDefaultEnvironment(state, 'qa')).toBe(false);
  });
});
