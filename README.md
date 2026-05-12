# quotawatch

Node.js / TypeScript SDK for [QuotaWatch](https://quotawatch.app) — passive API usage monitoring.

**Never get surprised by a rate limit again.**

## Installation

```bash
npm install quotawatch
```

## Quick start

```typescript
import { QuotaWatch } from 'quotawatch';

const qw = QuotaWatch.init({
  apiKey: 'qw_live_your_key_here',
  ingestUrl: 'https://ingest.quotawatch.app', // http://localhost:3001 for local dev
  environment: 'production',
  apis: [
    {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com',
      limits: { requestsPerMinute: 60, requestsPerDay: 10_000 },
    },
    {
      name: 'Stripe',
      baseUrl: 'https://api.stripe.com',
      limits: { requestsPerDay: 5_000 },
    },
  ],
});

// Your existing fetch() calls are now monitored — no other changes needed.
const res = await fetch('https://api.openai.com/v1/chat/completions', { ... });
```

## Axios

Axios doesn't use `globalThis.fetch`, so it needs an explicit interceptor. Call `patchAxios()` once after `init()`:

```typescript
import axios from 'axios';
import { QuotaWatch, patchAxios } from 'quotawatch';

const qw = QuotaWatch.init({ ... });

// Patch the default axios instance
patchAxios(axios, qw);

// Or patch a custom instance
const client = axios.create({ baseURL: 'https://api.openai.com' });
patchAxios(client, qw);

// Now all calls through axios are monitored automatically
```

> If you create multiple `axios.create()` clients, call `patchAxios()` on each one.

## Supported HTTP clients

| Client | Supported | Notes |
|---|---|---|
| `fetch` (global) | ✅ | Auto-patched on init |
| `axios` | ✅ | Call `patchAxios(instance, qw)` |
| `node-fetch` | ⚠️ | Only if assigned to `globalThis.fetch` |
| `undici` | ⚠️ | Only if assigned to `globalThis.fetch` |

## Manual recording

Use `instance.record()` only for clients that aren't auto-patched (vendor SDKs with bundled HTTP transports, etc.). For `fetch` and Axios, the interceptors handle everything.

```typescript
const qw = QuotaWatch.getInstance();
if (qw) {
  qw.record({
    api: 'MyAPI',           // must match your ApiConfig name
    endpoint: '/v1/resource',
    method: 'POST',
    status: 200,
    latencyMs: 142,
    timestamp: new Date().toISOString(),
    environment: 'production',
    hit429: false,
    rateLimitHeaders: {},
  });
}
```

## How it works

On `init()`, the SDK patches `globalThis.fetch`. Events are buffered and flushed to the ingest API every 5 seconds in a fire-and-forget background task. Your requests always proceed immediately, even if QuotaWatch is unreachable.

No request or response bodies are ever captured. Only: URL path, method, status, latency, and rate limit headers.

## Requirements

- Node.js 18+ (uses native `fetch`)
- TypeScript 5+ (optional but recommended)

## Documentation

Full docs at [quotawatch.app/docs/node](https://quotawatch.app/docs/node)

## License

MIT
