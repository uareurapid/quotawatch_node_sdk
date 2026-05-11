import type { QuotaWatch } from '../QuotaWatch.js';

const RATE_LIMIT_PREFIXES = ['x-ratelimit-', 'ratelimit-', 'x-rate-limit-'];

function extractRateLimitHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (RATE_LIMIT_PREFIXES.some((p) => key.toLowerCase().startsWith(p))) {
      result[key.toLowerCase()] = Array.isArray(value) ? value[0] : (value ?? '');
    }
  }
  return result;
}

/**
 * Installs a QuotaWatch interceptor on an Axios instance.
 *
 * Call this once per Axios instance after QuotaWatch.init():
 *
 *   import axios from 'axios';
 *   import { patchAxios } from 'quotawatch/axios';
 *   patchAxios(axios);
 *
 * Or for a custom instance:
 *   const client = axios.create({ baseURL: 'https://api.openai.com' });
 *   patchAxios(client);
 */
export function patchAxios(axiosInstanceOrDefault: {
  interceptors: {
    request: { use: (fn: (config: unknown) => unknown) => number };
    response: { use: (onFulfilled: (res: unknown) => unknown, onRejected: (err: unknown) => unknown) => number };
  };
}, instance: QuotaWatch): void {
  const START_KEY = '__qw_start';

  // Tag the request with a start timestamp
  axiosInstanceOrDefault.interceptors.request.use((config: unknown) => {
    (config as Record<string, unknown>)[START_KEY] = Date.now();
    return config;
  });

  // Record on response
  axiosInstanceOrDefault.interceptors.response.use(
    (response: unknown) => {
      const res = response as {
        config: Record<string, unknown>;
        status: number;
        headers: Record<string, string | string[] | undefined>;
        request?: { path?: string; method?: string };
      };

      const startMs = res.config[START_KEY] as number | undefined;
      const latencyMs = startMs != null ? Date.now() - startMs : 0;

      const baseURL = (res.config.baseURL as string | undefined) ?? '';
      const url = (res.config.url as string | undefined) ?? '';
      const fullUrl = url.startsWith('http') ? url : `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;

      const apiName = instance.resolveApiName(fullUrl);
      if (apiName) {
        try {
          const urlObj = new URL(fullUrl);
          instance.record({
            api: apiName,
            endpoint: urlObj.pathname,
            method: ((res.config.method as string | undefined) ?? 'GET').toUpperCase(),
            status: res.status,
            latencyMs,
            timestamp: new Date().toISOString(),
            environment: instance.getEnvironment(),
            hit429: res.status === 429,
            rateLimitHeaders: extractRateLimitHeaders(res.headers),
          });
        } catch {
          // Never throw from interceptor
        }
      }

      return response;
    },
    (error: unknown) => {
      // Also capture error responses (e.g. 429, 5xx that Axios rejects)
      const err = error as { config?: Record<string, unknown>; response?: { status: number; headers: Record<string, string | string[] | undefined> } };
      if (err.config && err.response) {
        const startMs = err.config[START_KEY] as number | undefined;
        const latencyMs = startMs != null ? Date.now() - startMs : 0;
        const baseURL = (err.config.baseURL as string | undefined) ?? '';
        const url = (err.config.url as string | undefined) ?? '';
        const fullUrl = url.startsWith('http') ? url : `${baseURL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        const apiName = instance.resolveApiName(fullUrl);
        if (apiName) {
          try {
            const urlObj = new URL(fullUrl);
            instance.record({
              api: apiName,
              endpoint: urlObj.pathname,
              method: ((err.config.method as string | undefined) ?? 'GET').toUpperCase(),
              status: err.response.status,
              latencyMs,
              timestamp: new Date().toISOString(),
              environment: instance.getEnvironment(),
              hit429: err.response.status === 429,
              rateLimitHeaders: extractRateLimitHeaders(err.response.headers),
            });
          } catch {
            // Never throw from interceptor
          }
        }
      }
      return Promise.reject(error);
    }
  );
}
