import { describe, it, expect, vi, afterEach } from 'vitest';
import { QuotaWatch } from '../QuotaWatch.js';

const BASE_CONFIG = {
  apiKey: 'qw_live_test',
  ingestUrl: 'http://localhost:3001',
  apis: [{ name: 'TestAPI', baseUrl: 'https://api.test.com', limits: {} }],
};

describe('QuotaWatch', () => {
  afterEach(() => {
    QuotaWatch.getInstance()?.destroy();
    vi.unstubAllGlobals();
  });

  it('initializes once (singleton)', () => {
    const a = QuotaWatch.init(BASE_CONFIG);
    const b = QuotaWatch.init(BASE_CONFIG);
    expect(a).toBe(b);
    expect(QuotaWatch.getInstance()).toBe(a);
  });

  it('resolves API name from URL', () => {
    const qw = QuotaWatch.init(BASE_CONFIG);
    expect(qw.resolveApiName('https://api.test.com/v1/endpoint')).toBe('TestAPI');
    expect(qw.resolveApiName('https://other.com/v1/endpoint')).toBeNull();
  });

  it('buffers events up to bufferSize, dropping oldest', () => {
    const qw = QuotaWatch.init({ ...BASE_CONFIG, bufferSize: 3 });
    const event = {
      api: 'TestAPI', endpoint: '/v1/test', method: 'GET', status: 200,
      latencyMs: 100, timestamp: new Date().toISOString(),
      environment: 'test', hit429: false, rateLimitHeaders: {},
    };
    qw.record(event);
    qw.record(event);
    qw.record(event);
    qw.record({ ...event, status: 429 }); // 4th — should drop oldest
    const buffer = (qw as any).buffer as typeof event[];
    expect(buffer).toHaveLength(3);
    expect(buffer[2].status).toBe(429);
  });

  it('flush sends batch to ingest URL and clears buffer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const qw = QuotaWatch.init(BASE_CONFIG);
    qw.record({
      api: 'TestAPI', endpoint: '/v1/test', method: 'POST', status: 200,
      latencyMs: 50, timestamp: new Date().toISOString(),
      environment: 'production', hit429: false, rateLimitHeaders: {},
    });

    await qw.flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/v1/ingest');
    const body = JSON.parse(opts.body as string);
    expect(body.projectApiKey).toBe('qw_live_test');
    expect(body.events).toHaveLength(1);
    expect(body.events[0].api).toBe('TestAPI');
    expect((qw as any).buffer).toHaveLength(0);
  });

  it('flush is silent on network failure (fire-and-forget)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const qw = QuotaWatch.init(BASE_CONFIG);
    qw.record({
      api: 'TestAPI', endpoint: '/test', method: 'GET', status: 200,
      latencyMs: 10, timestamp: new Date().toISOString(),
      environment: 'production', hit429: false, rateLimitHeaders: {},
    });
    await expect(qw.flush()).resolves.toBeUndefined();
  });

  it('flush is no-op when buffer is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const qw = QuotaWatch.init(BASE_CONFIG);
    await qw.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
