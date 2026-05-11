import { describe, it, expect, vi, afterEach } from 'vitest';
import { QuotaWatch } from '../QuotaWatch.js';

const BASE_CONFIG = {
  apiKey: 'qw_live_test',
  ingestUrl: 'http://localhost:3001',
  apis: [{ name: 'OpenAI', baseUrl: 'https://api.openai.com', limits: {} }],
};

describe('fetch interceptor', () => {
  afterEach(() => {
    QuotaWatch.getInstance()?.destroy();
    vi.unstubAllGlobals();
  });

  it('records matching fetch calls', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{}', {
        status: 200,
        headers: { 'x-ratelimit-remaining': '42' },
      })
    );
    vi.stubGlobal('fetch', mockFetch);

    const qw = QuotaWatch.init(BASE_CONFIG);
    await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });

    expect((qw as any).buffer).toHaveLength(1);
    const event = (qw as any).buffer[0];
    expect(event.api).toBe('OpenAI');
    expect(event.endpoint).toBe('/v1/chat/completions');
    expect(event.method).toBe('POST');
    expect(event.status).toBe(200);
    expect(event.rateLimitHeaders['x-ratelimit-remaining']).toBe('42');
  });

  it('does not record non-matching fetch calls', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })));
    const qw = QuotaWatch.init(BASE_CONFIG);
    await fetch('https://other-api.com/v1/test');
    expect((qw as any).buffer).toHaveLength(0);
  });

  it('marks hit429 when status is 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })));
    const qw = QuotaWatch.init(BASE_CONFIG);
    await fetch('https://api.openai.com/v1/embeddings');
    expect((qw as any).buffer[0].hit429).toBe(true);
  });
});
