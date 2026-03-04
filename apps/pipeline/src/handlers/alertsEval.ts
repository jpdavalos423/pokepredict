import type { PipelineEventContext } from '@pokepredict/shared';
import { logInfo } from './common';

export interface PlaceholderResult {
  ok: true;
  step: 'AlertsEval';
  runId: string;
  source: string;
  mode: PipelineEventContext['mode'];
  note: string;
}

export async function handler(
  event: PipelineEventContext
): Promise<PlaceholderResult> {
  logInfo('Phase 0 placeholder handler executed.', {
    step: 'AlertsEval',
    runId: event.runId,
    source: event.source,
    mode: event.mode
  });

  return {
    ok: true,
    step: 'AlertsEval',
    runId: event.runId,
    source: event.source,
    mode: event.mode,
    note: 'Placeholder only. Real logic starts in Phase 5+'
  };
}
