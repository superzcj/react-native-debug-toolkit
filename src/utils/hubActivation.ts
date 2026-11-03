import activation from './defaultHubActivation';

export function getHubActivation(): { enabled: boolean; port: number } {
  const port = typeof activation.port === 'number' && Number.isInteger(activation.port)
    && activation.port > 0 && activation.port <= 65535 ? activation.port : 3800;
  return { enabled: typeof __DEV__ !== 'undefined' && __DEV__ && activation.enabled === true, port };
}
