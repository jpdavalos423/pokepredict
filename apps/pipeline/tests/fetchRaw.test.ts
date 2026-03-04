import { describe, expect, it } from 'vitest';
import type {
  RawFetchPayload,
  RawPriceRecord,
  StartRunResult
} from '@pokepredict/shared';
import { createFetchRawHandler } from '../src/handlers/fetchRaw';

describe('fetchRaw handler', () => {
  it('archives raw payload and returns key metadata', async () => {
    const captured: { key?: string; payload?: RawFetchPayload } = {};

    const records: RawPriceRecord[] = [
      {
        sourceCardId: 'sv3-198',
        recordedAt: '2026-03-04T18:00:00.000Z',
        marketPrice: 112.34,
        lowPrice: 98,
        highPrice: 130,
        currency: 'USD'
      }
    ];

    const handler = createFetchRawHandler({
      now: () => '2026-03-04T18:01:00.000Z',
      fetchRecords: async () => records,
      putRawPayload: async (key, payload) => {
        captured.key = key;
        captured.payload = payload;
      }
    });

    const run: StartRunResult = {
      runId: 'run_123',
      asOf: '2026-03-04T18:00:00.000Z',
      source: 'fixture',
      mode: 'manual',
      startedAt: '2026-03-04T18:00:00.000Z'
    };

    const result = await handler(run);

    expect(result.rawS3Key).toBe('raw/fixture/2026/03/04/18/run_123.json');
    expect(result.rawRecordCount).toBe(1);
    expect(result.fetchedAt).toBe('2026-03-04T18:01:00.000Z');

    expect(captured.key).toBe('raw/fixture/2026/03/04/18/run_123.json');
    expect(captured.payload?.runId).toBe('run_123');
    expect(captured.payload?.records).toHaveLength(1);
  });
});
