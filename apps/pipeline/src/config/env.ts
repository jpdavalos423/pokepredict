export interface PipelineConfig {
  rawBucket: string;
  sourceName: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadPipelineConfig(): PipelineConfig {
  return {
    rawBucket: required('RAW_BUCKET'),
    sourceName: required('SOURCE_NAME')
  };
}
