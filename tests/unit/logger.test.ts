import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('browser logger', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    delete (window as any).POOL_CONFIG;
    delete (window as any).PoolLogger;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    delete (window as any).POOL_CONFIG;
    delete (window as any).PoolLogger;
  });

  it('suppresses all console output when disabled', async () => {
    document.body.innerHTML = `
      <script
        src="/assets/js/logger.js"
        data-pool-logger-script="true"
        data-console-logging-enabled="false"
        data-verbose-console-logging="true"></script>
    `;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../assets/js/logger.js');

    const logger = (window as any).PoolLogger.createLogger('test');
    logger.log('hello');
    logger.error('boom');

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('suppresses debug output when verbose logging is disabled but keeps errors', async () => {
    document.body.innerHTML = `
      <script
        src="/assets/js/logger.js"
        data-pool-logger-script="true"
        data-console-logging-enabled="true"
        data-verbose-console-logging="false"></script>
    `;

    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../assets/js/logger.js');

    const logger = (window as any).PoolLogger.createLogger('test');
    logger.debug('debug');
    logger.error('error');

    expect(debugSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][1]).toBe('[Pool:test]');
    expect(errorSpy.mock.calls[0][2]).toBe('[ERROR]');
    expect(errorSpy.mock.calls[0][3]).toBe('error');
  });

  it('captures unhandled browser errors through the shared logger', async () => {
    document.body.innerHTML = `
      <script
        src="/assets/js/logger.js"
        data-pool-logger-script="true"
        data-console-logging-enabled="true"
        data-verbose-console-logging="true"></script>
    `;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await import('../../assets/js/logger.js');

    window.dispatchEvent(new ErrorEvent('error', {
      message: 'boom',
      filename: '/app.js',
      lineno: 12,
      colno: 4,
      error: new Error('boom')
    }));

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][1]).toBe('[Pool:window]');
    expect(errorSpy.mock.calls[0][2]).toBe('[ERROR]');
    expect(errorSpy.mock.calls[0][3]).toBe('Unhandled browser error');
  });
});
