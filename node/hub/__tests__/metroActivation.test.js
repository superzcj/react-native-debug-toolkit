const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { withDebugToolkitMetro } = require('../../metro');
const { enableState, readState } = require('../../metro/activation');

describe('Metro Hub activation', () => {
  let projectRoot;

  beforeEach(() => { projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-metro-')); });
  afterEach(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  it('provides a stopped state and preserves the host resolver', () => {
    const fallback = jest.fn(() => ({ type: 'sourceFile', filePath: '/other.js' }));
    const config = { projectRoot, resolver: { resolveRequest: fallback } };
    const wrapped = withDebugToolkitMetro(config);
    const context = { originModulePath: path.resolve(__dirname, '../../../src/utils/hubActivation.ts') };
    const state = wrapped.resolver.resolveRequest(context, './defaultHubActivation', 'ios');

    expect(JSON.parse(fs.readFileSync(state.filePath, 'utf8'))).toEqual({ enabled: false });
    expect(wrapped.resolver.resolveRequest(context, 'other-module', 'ios')).toEqual({ type: 'sourceFile', filePath: '/other.js' });
    expect(fallback).toHaveBeenCalledWith(context, 'other-module', 'ios');
    expect(config.resolver.resolveRequest).toBe(fallback);
  });

  it('uses Metro default resolution when no host resolver exists', () => {
    const wrapped = withDebugToolkitMetro({ resolver: {} }, { projectRoot });
    const context = { resolveRequest: jest.fn(() => ({ type: 'empty' })) };
    expect(wrapped.resolver.resolveRequest(context, 'other-module', 'android')).toEqual({ type: 'empty' });
    expect(context.resolveRequest).toHaveBeenCalledWith(context, 'other-module', 'android');
  });

  it('requires a project root from the config or options', () => {
    expect(() => withDebugToolkitMetro({ resolver: {} })).toThrow('requires a projectRoot');
  });

  it('keeps a running Hub and clears stale activation during Metro startup', () => {
    enableState(projectRoot, process.pid, process.pid, 3900);
    withDebugToolkitMetro({ projectRoot, resolver: {} });
    expect(readState(projectRoot)).toEqual({ enabled: true, ownerPid: process.pid, hubPid: process.pid, port: 3900 });

    enableState(projectRoot, -1, process.pid, 3900);
    withDebugToolkitMetro({ projectRoot, resolver: {} });
    expect(readState(projectRoot)).toEqual({ enabled: false });
  });
});
