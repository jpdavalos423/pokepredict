export interface CdkEnvConfig {
  account: string;
  region: string;
  project: string;
  stage: string;
  sourceName: string;
  ingestScheduleCron: string;
  cursorSigningSecretParam: string;
  cursorSigningSecretVersion: number;
}

function readOrDefault(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function readNumberOrDefault(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

export function loadCdkEnvConfig(): CdkEnvConfig {
  const stage = readOrDefault('STAGE', 'dev');
  return {
    account: readOrDefault('CDK_DEFAULT_ACCOUNT', '000000000000'),
    region: readOrDefault('CDK_DEFAULT_REGION', 'us-west-2'),
    project: readOrDefault('PROJECT_NAME', 'pokepredict'),
    stage: readOrDefault('STAGE', 'dev'),
    sourceName: readOrDefault('SOURCE_NAME', 'fixture'),
    ingestScheduleCron: readOrDefault('INGEST_SCHEDULE_CRON', 'cron(0 6 * * ? *)'),
    cursorSigningSecretParam: readOrDefault(
      'CURSOR_SIGNING_SECRET_PARAM',
      `/pokepredict/${stage}/cursor-signing-secret`
    ),
    cursorSigningSecretVersion: readNumberOrDefault('CURSOR_SIGNING_SECRET_VERSION', 1)
  };
}
