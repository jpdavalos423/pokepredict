import type { PipelineEventContext } from '@pokepredict/shared';

export interface PlaceholderResult {
  ok: true;
  step: 'FetchRaw' | 'Normalize' | 'ComputeSignals' | 'AlertsEval';
  runId: string;
  source: string;
  mode: PipelineEventContext['mode'];
  note: string;
}

export function logStep(
  step: PlaceholderResult['step'],
  context: PipelineEventContext
): void {
  console.log(
    JSON.stringify({
      level: 'info',
      service: 'pokepredict-pipeline',
      step,
      runId: context.runId,
      source: context.source,
      mode: context.mode,
      message: 'Phase 0 placeholder handler executed.'
    })
  );
}

export function placeholderResult(
  step: PlaceholderResult['step'],
  context: PipelineEventContext
): PlaceholderResult {
  return {
    ok: true,
    step,
    runId: context.runId,
    source: context.source,
    mode: context.mode,
    note: 'Placeholder only. Real logic starts in Phase 1+'
  };
}
