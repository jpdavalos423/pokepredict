import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ApiConfig } from './config';
import { loadApiConfig } from './config';
import { type ApiReadRepository, DynamoApiReadRepository } from './data/read-repository';

export interface ApiDependencies {
  repo: ApiReadRepository;
  cursorSigningSecret: string;
  now: () => Date;
}

export function createApiDependencies(config: ApiConfig = loadApiConfig()): ApiDependencies {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.awsRegion }));

  return {
    repo: new DynamoApiReadRepository(ddb, config),
    cursorSigningSecret: config.cursorSigningSecret,
    now: () => new Date()
  };
}
