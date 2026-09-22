import { fmt, logToComputer, copyToComputer, describeCopyResult } from '../../utils/copyToComputer';
import { createClipboardFeature } from '../../features/clipboard';

describe('fmt', () => {
  it('formats JSON objects', () => {
    const result = fmt({ a: 1 });
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('parses and re-formats JSON strings', () => {
    const result = fmt('{"a":1}');
    expect(result).toBe('{\n  "a": 1\n}');
  });

  it('returns empty string for null/undefined', () => {
    expect(fmt(null)).toBe('');
    expect(fmt(undefined)).toBe('');
  });

  it('returns string representation for non-JSON strings', () => {
    // 'hello' is valid JSON string — parsed and re-stringified
    expect(fmt('hello')).toBe('hello');
  });
});

describe('logToComputer', () => {
  it('logs content with header and footer', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    logToComputer('test content', 'TestLabel');
    expect(spy).toHaveBeenCalledWith('[DebugToolkit:Copy] ─── TestLabel ───');
    expect(spy).toHaveBeenCalledWith('test content');
    expect(spy).toHaveBeenCalledWith('[DebugToolkit:Copy] ─── END ───');
    spy.mockRestore();
  });

  it('truncates content over 10KB', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const longContent = 'x'.repeat(11 * 1024);
    logToComputer(longContent);
    // Should log truncated content + truncation notice
    expect(spy).toHaveBeenCalledTimes(4);
    spy.mockRestore();
  });
});

describe('copyToComputer', () => {
  it('missing hub does not claim computer delivery or implicitly log', async () => {
    const recordConsole = jest.fn();
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const result = await copyToComputer('hello', { enabled: true, channels: { recordConsole } });
    expect(recordConsole).toHaveBeenCalledWith('hello', undefined);
    expect(result.console.status).toBe('success');
    expect(result.hub.status).toBe('unavailable');
    expect(result.phone.status).toBe('unavailable');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('disabled calls no channels', async () => {
    const copyPhone = jest.fn();
    const recordConsole = jest.fn();
    const sendHub = jest.fn();
    const result = await copyToComputer('hello', { enabled: false, channels: { copyPhone, recordConsole, sendHub } });
    expect(result).toEqual({ status: 'disabled', phone: { status: 'disabled' }, console: { status: 'disabled' }, hub: { status: 'disabled' } });
    expect(copyPhone).not.toHaveBeenCalled();
    expect(recordConsole).not.toHaveBeenCalled();
    expect(sendHub).not.toHaveBeenCalled();
  });

  it('isolates synchronous and asynchronous failures', async () => {
    const sendHub = jest.fn(async () => 'delivered' as const);
    const result = await copyToComputer('text', { label: 'Label', enabled: true, channels: {
      copyPhone: async () => { throw new Error('phone failed'); },
      recordConsole: () => { throw new Error('console failed'); }, sendHub,
    } });
    expect(result.phone).toEqual({ status: 'error', reason: 'phone failed' });
    expect(result.console).toEqual({ status: 'error', reason: 'console failed' });
    expect(result.hub.status).toBe('success');
    expect(sendHub).toHaveBeenCalledWith('text', 'Label');
  });

  it('unconfirmed hub delivery is unavailable; phone success remains independent', async () => {
    const result = await copyToComputer('text', { enabled: true, channels: {
      copyPhone: jest.fn(), sendHub: async () => 'unavailable',
    } });
    expect(result.phone.status).toBe('success');
    expect(result.console.status).toBe('unavailable');
    expect(result.hub.status).toBe('unavailable');
    expect(result.hub.reason).toMatch(/confirm/i);
    expect(describeCopyResult(result)).toContain('Computer delivery was not confirmed.');
  });
});

test('clipboard actions require an active host and are user-triggered only', async () => {
  const copy = jest.fn((text: string) => copyToComputer(text, { enabled: true, channels: {} }));
  const feature = createClipboardFeature({}, copy);
  const controller = new AbortController();
  expect((await feature.getSnapshot().copy('before')).status).toBe('disabled');
  feature.start({ owner: Symbol(), signal: controller.signal, isCurrent: () => true, setStatus: jest.fn() });
  expect(copy).not.toHaveBeenCalled();
  await feature.getSnapshot().copy('during');
  expect(copy).toHaveBeenCalledTimes(1);
  controller.abort();
  expect((await feature.getSnapshot().copy('after')).status).toBe('disabled');
  expect(copy).toHaveBeenCalledTimes(1);
});
