import type { ApiLimitConfig } from '@quotawatch/shared';

export interface QuotaWatchConfig {
  apiKey: string;
  environment?: string;
  ingestUrl?: string;
  /** Max events to buffer before dropping oldest */
  bufferSize?: number;
  /** Flush interval in ms (default: 5000) */
  flushIntervalMs?: number;
  apis: ApiLimitConfig[];
}
