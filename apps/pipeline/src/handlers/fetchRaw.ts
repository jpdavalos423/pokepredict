import {
  type FetchRawResult,
  fetchRawResultSchema,
  type RawFetchPayload,
  type RawPriceRecord,
  type StartRunResult,
  startRunResultSchema
} from '@pokepredict/shared';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { loadPipelineConfig } from '../config/env';
import { FixturePriceSourceProvider } from '../providers/fixture-source';
import type { PriceSourceProvider } from '../providers/types';
import { buildRawS3Key, logInfo } from './common';

export interface FetchRawDependencies {
  now: () => string;
  fetchRecords: (input: StartRunResult) => Promise<RawPriceRecord[]>;
  putRawPayload: (key: string, payload: RawFetchPayload) => Promise<void>;
}

export function createFetchRawHandler(deps: FetchRawDependencies): (event: StartRunResult) => Promise<FetchRawResult> {
  return async function fetchRawHandler(event: StartRunResult): Promise<FetchRawResult> {
    const input = startRunResultSchema.parse(event);
    const records = await deps.fetchRecords(input);
    const rawS3Key = buildRawS3Key(input.source, input.asOf, input.runId);

    const payload: RawFetchPayload = {
      runId: input.runId,
      asOf: input.asOf,
      source: input.source,
      mode: input.mode,
      records
    };

    await deps.putRawPayload(rawS3Key, payload);

    const result: FetchRawResult = {
      ...input,
      rawS3Key,
      rawRecordCount: records.length,
      fetchedAt: deps.now()
    };

    fetchRawResultSchema.parse(result);

    logInfo('Fetched and archived raw pricing payload.', {
      step: 'FetchRaw',
      runId: result.runId,
      source: result.source,
      rawS3Key: result.rawS3Key,
      rawRecordCount: result.rawRecordCount
    });

    return result;
  };
}

function createProviderRegistry(): Record<string, PriceSourceProvider> {
  return {
    fixture: new FixturePriceSourceProvider()
  };
}

function createDefaultDependencies(): FetchRawDependencies {
  const cfg = loadPipelineConfig();
  const s3 = new S3Client({ region: cfg.awsRegion });
  const providers = createProviderRegistry();

  return {
    now: () => new Date().toISOString(),
    fetchRecords: async (input: StartRunResult) => {
      const provider = providers[input.source];
      if (!provider) {
        throw new Error(`Unsupported source: ${input.source}`);
      }
      return provider.fetch(input);
    },
    putRawPayload: async (key: string, payload: RawFetchPayload) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.rawBucket,
          Key: key,
          ContentType: 'application/json',
          Body: JSON.stringify(payload)
        })
      );
    }
  };
}

let defaultHandler: ((event: StartRunResult) => Promise<FetchRawResult>) | undefined;

export async function handler(event: StartRunResult): Promise<FetchRawResult> {
  if (!defaultHandler) {
    defaultHandler = createFetchRawHandler(createDefaultDependencies());
  }
  return defaultHandler(event);
}
