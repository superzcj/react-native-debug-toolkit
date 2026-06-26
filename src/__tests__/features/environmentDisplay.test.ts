import {
  getDefaultEnvironment,
  getDisplayEnvironment,
  getEnvironmentFooterAction,
  getEnvironmentUrlRows,
  isDefaultEnvironment,
  shouldShowRestartBlocker,
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

  it('marks managed default environment without selecting it', () => {
    const state: EnvironmentState = {
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: null,
      restartRequired: false,
      environments: [],
    };

    expect(isDefaultEnvironment(state, 'prod')).toBe(true);
    expect(isDefaultEnvironment(state, 'qa')).toBe(false);
  });

  it('uses default environment for display when managed state has no selection', () => {
    const state: EnvironmentState = {
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: null,
      restartRequired: false,
      environments: [
        {
          mode: 'managed',
          id: 'prod',
          label: 'Production',
          urls: { app: 'https://api.example.com' },
        },
        {
          mode: 'managed',
          id: 'qa',
          label: 'QA',
          urls: { app: 'https://qa-api.example.com' },
        },
      ],
    };

    expect(getDisplayEnvironment(state)?.id).toBe('prod');
  });

  it('uses active environment for display when managed state is selected', () => {
    const state: EnvironmentState = {
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: 'qa',
      restartRequired: true,
      environments: [
        {
          mode: 'managed',
          id: 'prod',
          label: 'Production',
          urls: { app: 'https://api.example.com' },
        },
        {
          mode: 'managed',
          id: 'qa',
          label: 'QA',
          urls: { app: 'https://qa-api.example.com' },
        },
      ],
    };

    expect(getDisplayEnvironment(state)?.id).toBe('qa');
  });

  it('keeps the built-in default environment visible separately from active selection', () => {
    const state: EnvironmentState = {
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: 'qa',
      restartRequired: false,
      environments: [
        {
          mode: 'managed',
          id: 'prod',
          label: 'Production',
          urls: { app: 'https://api.example.com' },
        },
        {
          mode: 'managed',
          id: 'qa',
          label: 'QA',
          urls: { app: 'https://qa-api.example.com' },
        },
      ],
    };

    expect(getDefaultEnvironment(state)?.id).toBe('prod');
  });

  it('only shows footer actions when there is an explicit selected environment', () => {
    expect(getEnvironmentFooterAction({
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: null,
      restartRequired: false,
      environments: [],
    })).toBeNull();

    expect(getEnvironmentFooterAction({
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: 'qa',
      restartRequired: false,
      environments: [],
    })).toBe('restore');

    expect(getEnvironmentFooterAction({
      mode: 'legacy',
      defaultEnvironmentId: null,
      currentEnvironmentId: 'dev',
      restartRequired: false,
      environments: [],
    })).toBe('reset');
  });

  it('blocks the environment tab after a managed environment change', () => {
    expect(shouldShowRestartBlocker({
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: 'qa',
      restartRequired: true,
      environments: [],
    })).toBe(true);

    expect(shouldShowRestartBlocker({
      mode: 'managed',
      defaultEnvironmentId: 'prod',
      currentEnvironmentId: null,
      restartRequired: false,
      environments: [],
    })).toBe(false);
  });
});
