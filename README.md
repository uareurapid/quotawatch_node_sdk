# quotawatch

Node.js / TypeScript SDK for [QuotaWatch](https://quotawatch.io) — passive API usage monitoring.

**Never get surprised by a rate limit again.**

## Installation

```bash
npm install quotawatch
```

## Quick start

```typescript
import { QuotaWatch } from 'quotawatch';

QuotaWatch.init({
  apiKey: 'qw_live_your_key_here',
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
```

## How it works

The SDK monkey-patches `globalThis.fetch`. Every outgoing `fetch()` call matching a configured `baseUrl` is recorded asynchronously — **fire-and-forget**. Your requests always proceed immediately, even if QuotaWatch is unreachable.

No request or response bodies are ever captured. Only: URL path, method, status, latency, and rate limit headers.

## Requirements

- Node.js 18+ (uses native `fetch` and `AbortSignal.timeout`)
- TypeScript 5+ (optional but recommended)

## Documentation

Full docs at [quotawatch.io/docs/node](https://quotawatch.io/docs/node)

## License

MIT
