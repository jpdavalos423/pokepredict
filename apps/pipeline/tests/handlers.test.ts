import { describe, expect, it } from 'vitest';
import type { PipelineEventContext } from '@pokepredict/shared';
import { handler as alertsEvalHandler } from '../src/handlers/alertsEval';
import { handler as computeSignalsHandler } from '../src/handlers/computeSignals';
import { handler as fetchRawHandler } from '../src/handlers/fetchRaw';
import { handler as normalizeHandler } from '../src/handlers/normalize';

const event: PipelineEventContext = {
  runId: 'run_123',
  source: 'tcgplayer',
  mode: 'manual'
};

describe('pipeline placeholder handlers', () => {
  it('returns placeholder results for all handlers', async () => {
    const [fetchRaw, normalize, computeSignals, alertsEval] = await Promise.all([
      fetchRawHandler(event),
      normalizeHandler(event),
      computeSignalsHandler(event),
      alertsEvalHandler(event)
    ]);

    expect(fetchRaw.step).toBe('FetchRaw');
    expect(normalize.step).toBe('Normalize');
    expect(computeSignals.step).toBe('ComputeSignals');
    expect(alertsEval.step).toBe('AlertsEval');
    expect(alertsEval.ok).toBe(true);
  });
});
