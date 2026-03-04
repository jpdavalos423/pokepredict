import { describe, expect, it } from 'vitest';
import { createStartRunHandler } from '../src/handlers/startRun';

describe('startRun handler', () => {
  it('generates runId and stamps asOf when omitted', async () => {
    const handler = createStartRunHandler({
      now: () => '2026-03-04T18:00:00.000Z',
      generateRunId: () => '01HRM2QDV4A9Y0H8FE3V1KX6BY'
    });

    const result = await handler({
      source: 'fixture',
      mode: 'scheduled'
    });

    expect(result.runId).toBe('01HRM2QDV4A9Y0H8FE3V1KX6BY');
    expect(result.asOf).toBe('2026-03-04T18:00:00.000Z');
    expect(result.startedAt).toBe('2026-03-04T18:00:00.000Z');
  });

  it('preserves caller-provided runId and asOf', async () => {
    const handler = createStartRunHandler({
      now: () => '2026-03-04T18:00:00.000Z',
      generateRunId: () => 'generated-id'
    });

    const result = await handler({
      source: 'fixture',
      mode: 'manual',
      runId: 'run_custom_001',
      asOf: '2026-03-03T05:00:00.000Z'
    });

    expect(result.runId).toBe('run_custom_001');
    expect(result.asOf).toBe('2026-03-03T05:00:00.000Z');
    expect(result.startedAt).toBe('2026-03-04T18:00:00.000Z');
  });
});
