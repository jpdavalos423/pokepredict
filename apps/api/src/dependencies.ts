import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ApiConfig } from './config';
import { loadApiConfig } from './config';
import { type ApiReadRepository, DynamoApiReadRepository } from './data/read-repository';

export interface ApiDependencies {
  repo: ApiReadRepository;
  cursorSigningSecret: string;
  now: () => Date;
}

async function resolveCursorSigningSecret(config: ApiConfig): Promise<string> {
  if (config.cursorSigningSecret) {
    return config.cursorSigningSecret;
  }

  if (!config.cursorSigningSecretParam) {
    throw new Error(
      'Missing cursor signing secret configuration. Set CURSOR_SIGNING_SECRET or CURSOR_SIGNING_SECRET_PARAM.'
    );
  }

  const ssm = new SSMClient({ region: config.awsRegion });
  const response = await ssm.send(
    new GetParameterCommand({
      Name: config.cursorSigningSecretParam,
      WithDecryption: true
    })
  );

  const secret = response.Parameter?.Value;
  if (!secret) {
    throw new Error(
      `SSM parameter ${config.cursorSigningSecretParam} did not return a value.`
    );
  }

  return secret;
}

export async function createApiDependencies(
  config: ApiConfig = loadApiConfig()
): Promise<ApiDependencies> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.awsRegion }));
  const cursorSigningSecret = await resolveCursorSigningSecret(config);

  return {
    repo: new DynamoApiReadRepository(ddb, config),
    cursorSigningSecret,
    now: () => new Date()
  };
}
