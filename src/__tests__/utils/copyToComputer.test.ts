import { fmt, logToComputer, copyToComputer } from '../../utils/copyToComputer';

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
  it('always logs to console by default', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const result = copyToComputer('test');
    expect(result.success).toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('skips console when silent', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    const result = copyToComputer('test', { silent: true });
    expect(result.success).toBe(true);
    expect(result.method).toBe('none');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
