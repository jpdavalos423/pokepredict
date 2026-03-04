import type { PipelineEventContext } from '@pokepredict/shared';
import { logStep, placeholderResult, type PlaceholderResult } from './common';

export async function handler(
  event: PipelineEventContext
): Promise<PlaceholderResult> {
  logStep('ComputeSignals', event);
  return placeholderResult('ComputeSignals', event);
}
