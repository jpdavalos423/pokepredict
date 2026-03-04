export interface CdkEnvConfig {
  account: string;
  region: string;
  project: string;
  stage: string;
}

function readOrDefault(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function loadCdkEnvConfig(): CdkEnvConfig {
  return {
    account: readOrDefault('CDK_DEFAULT_ACCOUNT', '000000000000'),
    region: readOrDefault('CDK_DEFAULT_REGION', 'us-west-2'),
    project: readOrDefault('PROJECT_NAME', 'pokepredict'),
    stage: readOrDefault('STAGE', 'dev')
  };
}
