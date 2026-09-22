import { DevConnectTabV4 } from './DevConnectTabV4';
import { extractIpv4SubnetPrefix } from './hubAddressRecommendations';
import { hubClient, normalizeHubEndpoint, type HubClient } from '../../utils/HubClient';
import { getPreference, KEYS } from '../../utils/debugPreferences';
import { getDeviceLocalIp, getNativeAppInfo, nativeIsDebugBuild, resolveAppId } from './nativeDevConnect';
import { resolveAndApplyHubEndpoint } from './resolveAndApplyHubEndpoint';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type { FeatureContext, FeatureDriver } from '../../core/runtimeTypes';
import type { DevConnectV4Config, DevConnectV4State } from './types';

export type { DevConnectV4Config, DevConnectV4State } from './types';
export { nativeIsDebugBuild } from './nativeDevConnect';
export { resolveAndApplyHubEndpoint } from './resolveAndApplyHubEndpoint';

const owners = new WeakMap<HubClient, symbol>();
export interface DevConnectFeature extends DebugFeature<DevConnectV4State>, FeatureDriver {}

export function createDevConnectFeature(
  config: DevConnectV4Config = {},
  dependencies: { client?: HubClient; isDebugBuild?: boolean } = {},
): DevConnectFeature {
  const client = dependencies.client ?? hubClient;
  const configuredEndpoint = config.endpoint ? normalizeHubEndpoint(config.endpoint) || config.endpoint : '';
  const listeners = new Set<DebugFeatureListener>();
  let context: FeatureContext | undefined;
  let lifecycle: AbortController | undefined;
  let probe: AbortController | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryAttempt = 0;
  let releases: Array<() => void> = [];
  let debugBuild = false;
  let owner: symbol | undefined;
  const current = () => !!owner && owners.get(client) === owner && !!context?.isCurrent()
    && !context.signal.aborted && !lifecycle?.signal.aborted;
  const state: DevConnectV4State = {
    appId: resolveAppId(config.appId, undefined), canonicalEndpoint: configuredEndpoint,
    configuredEndpoint, subnetPrefix: null, client, isCurrent: current,
  };
  const notify = () => {
    if (!current()) { return; }
    listeners.forEach(listener => { try { listener(); } catch { /* isolated observer */ } });
  };
  const cancelDiscovery = () => {
    probe?.abort(); probe = undefined;
    if (retry !== undefined) { clearTimeout(retry); retry = undefined; }
  };
  const resolveEndpoint = async (): Promise<string | null> => {
    if (!current() || !state.appId) { return null; }
    cancelDiscovery();
    const request = new AbortController();
    probe = request;
    const resolved = await resolveAndApplyHubEndpoint(configuredEndpoint || null, {
      client, signal: request.signal, isDev: debugBuild,
      isCurrent: () => current() && probe === request,
    });
    if (!current() || probe !== request || request.signal.aborted) { return null; }
    state.canonicalEndpoint = client.getEffectiveEndpoint() || resolved || configuredEndpoint;
    notify();
    return resolved;
  };
  state.resolveEndpoint = resolveEndpoint;
  const discover = async () => {
    const signal = lifecycle?.signal;
    const pending = resolveEndpoint();
    const request = probe;
    const resolved = await pending;
    if (!current() || lifecycle?.signal !== signal || probe !== request) { return; }
    if (resolved) {
      retryAttempt = 0;
      client.connect({ live: true });
    } else {
      retry = setTimeout(() => { retry = undefined; void discover(); }, Math.min(1000 * 2 ** retryAttempt++, 30000));
    }
  };
  const dispose = () => {
    lifecycle?.abort();
    context?.signal.removeEventListener('abort', dispose);
    cancelDiscovery();
    releases.forEach(release => release()); releases = [];
    if (owner && owners.get(client) === owner) { owners.delete(client); client.disconnect(); }
    owner = undefined;
  };
  const start = async (ctx: FeatureContext) => {
    if (current() || ctx.signal.aborted || !ctx.isCurrent()) { return; }
    if (owner) { dispose(); }
    context = ctx; owner = Symbol('connect'); owners.set(client, owner);
    lifecycle = new AbortController();
    const started = lifecycle;
    ctx.signal.addEventListener('abort', dispose, { once: true });
    const [saved, localIp, info, nativeDebug] = await Promise.all([
      getPreference(KEYS.hubEndpoint).catch(() => null), getDeviceLocalIp(), getNativeAppInfo(), nativeIsDebugBuild(),
    ]);
    if (!current() || lifecycle !== started) { return; }
    debugBuild = dependencies.isDebugBuild ?? nativeDebug ?? (typeof __DEV__ !== 'undefined' && __DEV__);
    state.appId = resolveAppId(config.appId, info?.nativeApplicationId);
    state.subnetPrefix = localIp ? extractIpv4SubnetPrefix(localIp) : null;
    if ((config.appId !== undefined && !state.appId) || (config.endpoint !== undefined && !normalizeHubEndpoint(config.endpoint))) {
      const path = config.appId !== undefined && !state.appId ? 'connect.appId' : 'connect.endpoint';
      state.reason = `Invalid ${path}.`;
      ctx.setStatus({ phase: 'error', issues: [{ path, message: state.reason }] }); notify(); return;
    }
    if (!state.appId) {
      state.reason = 'App identity unavailable. Set connect.appId.';
      ctx.setStatus({ phase: 'unavailable', issues: [{ path: 'connect.appId', message: state.reason }] }); notify(); return;
    }
    state.reason = undefined;
    client.setDebugBuild(debugBuild);
    client.configure({ appId: state.appId, endpoint: configuredEndpoint || null });
    if (!current()) { return; }
    const manual = saved ? normalizeHubEndpoint(saved) : null;
    if (manual) { client.setRuntimeEndpoint(manual); }
    if (!current()) { return; }
    state.canonicalEndpoint = manual || configuredEndpoint;
    releases.push(client.subscribeStatus(notify));
    releases.push(client.subscribeEndpoint(() => {
      cancelDiscovery(); retryAttempt = 0;
      state.canonicalEndpoint = client.getEffectiveEndpoint() || configuredEndpoint;
      notify();
      if (debugBuild && current()) { void discover(); }
    }));
    ctx.setStatus({ phase: 'ready', issues: [] }); notify();
    if (debugBuild && current()) { void discover(); }
  };
  return {
    name: 'devConnect', label: 'Connect', renderContent: DevConnectTabV4,
    start, dispose, cleanup: dispose,
    setup() {
      const controller = new AbortController();
      return start({ owner: Symbol('connect-setup'), signal: controller.signal, isCurrent: () => !controller.signal.aborted, setStatus() {} });
    },
    getSnapshot: () => ({ ...state, canonicalEndpoint: current() ? client.getEffectiveEndpoint() || state.canonicalEndpoint : state.canonicalEndpoint }),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
