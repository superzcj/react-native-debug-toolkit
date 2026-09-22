import { getDefaultEnvironment, getDisplayEnvironment, getEnvironmentFooterAction, getEnvironmentUrlRows } from '../../features/environment/EnvironmentTab';
import type { EnvironmentState } from '../../types/environment';
const environments = [
  { id: 'prod', title: 'Production', urls: { api: 'https://prod.test', auth: 'https://auth.test' } },
  { id: 'qa', title: 'QA', urls: { api: 'https://qa.test', auth: 'https://qa-auth.test' } },
];
const state: EnvironmentState = { environments, currentEnvironmentId: 'prod', defaultEnvironmentId: 'prod', busy: false, error: null };
test('shows service URLs and current/default choices', () => {
  expect(getEnvironmentUrlRows(environments[0]!)).toEqual([{ label: 'Api', value: 'https://prod.test' }, { label: 'Auth', value: 'https://auth.test' }]);
  expect(getDefaultEnvironment(state)?.id).toBe('prod');
  expect(getDisplayEnvironment({ ...state, currentEnvironmentId: 'qa' })?.id).toBe('qa');
});
test('restore appears only for a non-default selection and not while busy or empty', () => {
  expect(getEnvironmentFooterAction(state)).toBeNull();
  expect(getEnvironmentFooterAction({ ...state, currentEnvironmentId: 'qa' })).toBe('restore');
  expect(getEnvironmentFooterAction({ ...state, currentEnvironmentId: 'qa', busy: true })).toBeNull();
  expect(getEnvironmentFooterAction({ ...state, environments: [], currentEnvironmentId: null, defaultEnvironmentId: null })).toBeNull();
});
