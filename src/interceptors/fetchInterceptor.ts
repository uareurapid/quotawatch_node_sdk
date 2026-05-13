import type { QuotaWatch } from '../QuotaWatch.js';

const RATE_LIMIT_HEADER_PREFIXES = [
  'x-ratelimit-',
  'ratelimit-',
  'x-rate-limit-',
  'anthropic-ratelimit-',
];

function extractRateLimitHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase();
    if (RATE_LIMIT_HEADER_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) {
      result[lowerKey] = value;
    }
  });
  return result;
}

export function patchFetch(instance: QuotaWatch): void {
  if ((globalThis.fetch as unknown as { __quotawatch?: boolean }).__quotawatch) return;

  const originalFetch = globalThis.fetch;

  const patchedFetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const startMs = Date.now();
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const apiName = instance.resolveApiName(url);

    const response = await originalFetch(input, init);

    if (apiName) {
      const latencyMs = Date.now() - startMs;
      const method =
        init?.method ??
        (typeof input !== 'string' && !(input instanceof URL)
          ? input.method
          : 'GET');

      try {
        const urlObj = new URL(url);
        instance.record({
          api: apiName,
          endpoint: urlObj.pathname,
          method: method.toUpperCase(),
          status: response.status,
          latencyMs,
          timestamp: new Date().toISOString(),
          environment: instance.getEnvironment(),
          hit429: response.status === 429,
          rateLimitHeaders: extractRateLimitHeaders(response.headers),
        });
      } catch {
        // Never throw from interceptor
      }
    }

    return response;
  };

  (patchedFetch as unknown as { __quotawatch: boolean }).__quotawatch = true;
  globalThis.fetch = patchedFetch as typeof fetch;
}
