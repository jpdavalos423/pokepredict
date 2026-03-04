export function logInfo(message: string, fields: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      level: 'info',
      service: 'pokepredict-pipeline',
      message,
      ...fields
    })
  );
}

export function logWarn(message: string, fields: Record<string, unknown>): void {
  console.warn(
    JSON.stringify({
      level: 'warn',
      service: 'pokepredict-pipeline',
      message,
      ...fields
    })
  );
}

export async function streamToString(body: unknown): Promise<string> {
  if (!body) {
    return '';
  }

  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body).toString('utf-8');
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    'transformToString' in body &&
    typeof (body as { transformToString: unknown }).transformToString === 'function'
  ) {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(chunk));
    }
  }

  return Buffer.concat(chunks).toString('utf-8');
}

export function toCents(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return Math.round(value * 100);
}

export function buildRawS3Key(source: string, asOf: string, runId: string): string {
  const dt = new Date(asOf);
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`Invalid asOf timestamp: ${asOf}`);
  }

  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const hh = String(dt.getUTCHours()).padStart(2, '0');

  return `raw/${source}/${yyyy}/${mm}/${dd}/${hh}/${runId}.json`;
}

export function isIncomingAsOfNewer(
  existingAsOf: string | undefined,
  incomingAsOf: string
): boolean {
  if (!existingAsOf) {
    return true;
  }
  return incomingAsOf > existingAsOf;
}
