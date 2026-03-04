import type { PipelineEventContext } from '@pokepredict/shared';
import { logInfo } from './common';

export interface PlaceholderResult {
  ok: true;
  step: 'ComputeSignals';
  runId: string;
  source: string;
  mode: PipelineEventContext['mode'];
  note: string;
}

export async function handler(
  event: PipelineEventContext
): Promise<PlaceholderResult> {
  logInfo('Phase 0 placeholder handler executed.', {
    step: 'ComputeSignals',
    runId: event.runId,
    source: event.source,
    mode: event.mode
  });

  return {
    ok: true,
    step: 'ComputeSignals',
    runId: event.runId,
    source: event.source,
    mode: event.mode,
    note: 'Placeholder only. Real logic starts in Phase 4+'
  };
}
