import { startRunInputSchema, type StartRunInput, type StartRunResult } from '@pokepredict/shared';
import { ulid } from 'ulid';
import { logInfo } from './common';

export interface StartRunDependencies {
  now: () => string;
  generateRunId: () => string;
}

export function createStartRunHandler(
  deps: StartRunDependencies = {
    now: () => new Date().toISOString(),
    generateRunId: () => ulid()
  }
) {
  return async function startRunHandler(input: StartRunInput): Promise<StartRunResult> {
    const parsed = startRunInputSchema.parse(input);

    const startedAt = deps.now();
    const result: StartRunResult = {
      runId: parsed.runId ?? deps.generateRunId(),
      asOf: parsed.asOf ?? startedAt,
      source: parsed.source,
      mode: parsed.mode,
      startedAt
    };

    logInfo('Initialized pipeline run context.', {
      step: 'StartRun',
      runId: result.runId,
      source: result.source,
      mode: result.mode,
      asOf: result.asOf
    });

    return result;
  };
}

export const handler = createStartRunHandler();
