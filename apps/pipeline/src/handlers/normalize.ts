import type { PipelineEventContext } from '@pokepredict/shared';
import { logStep, placeholderResult, type PlaceholderResult } from './common';

export async function handler(
  event: PipelineEventContext
): Promise<PlaceholderResult> {
  logStep('Normalize', event);
  return placeholderResult('Normalize', event);
}
