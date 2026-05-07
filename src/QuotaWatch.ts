import type { QuotaWatchConfig } from './types.js';
import type { ApiCallEvent } from '@quotawatch/shared';

const DEFAULT_INGEST_URL = 'https://ingest.quotawatch.io';
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_BUFFER_SIZE = 500;

export class QuotaWatch {
  private static instance: QuotaWatch | null = null;

  private config: Required<QuotaWatchConfig>;
  private buffer: ApiCallEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private baseUrlMap: Map<string, string> = new Map();

  private constructor(config: QuotaWatchConfig) {
    this.config = {
      environment: 'production',
      ingestUrl: DEFAULT_INGEST_URL,
      bufferSize: DEFAULT_BUFFER_SIZE,
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      ...config,
    };

    // Build base URL → API name lookup
    for (const api of config.apis) {
      this.baseUrlMap.set(api.baseUrl.replace(/\/$/, ''), api.name);
    }

    this.startFlushTimer();
    this.patchGlobalFetch();
  }

  static init(config: QuotaWatchConfig): QuotaWatch {
    if (QuotaWatch.instance) {
      console.warn('[QuotaWatch] Already initialized. Ignoring duplicate init call.');
      return QuotaWatch.instance;
    }
    QuotaWatch.instance = new QuotaWatch(config);
    return QuotaWatch.instance;
  }

  static getInstance(): QuotaWatch | null {
    return QuotaWatch.instance;
  }

  /** @internal */
  private patchGlobalFetch(): void {
    // TODO: implement fetch monkey-patching
    // Will wrap global fetch to intercept outgoing requests
  }

  /** @internal */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.config.flushIntervalMs);
    // Don't block Node.js exit
    this.flushTimer.unref?.();
  }

  /** @internal */
  record(event: ApiCallEvent): void {
    if (this.buffer.length >= this.config.bufferSize) {
      this.buffer.shift(); // drop oldest
    }
    this.buffer.push(event);
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, this.buffer.length);

    try {
      await fetch(`${this.config.ingestUrl}/v1/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectApiKey: this.config.apiKey,
          events: batch,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Fire-and-forget: silently drop on failure
    }
  }

  destroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
    QuotaWatch.instance = null;
  }
}
