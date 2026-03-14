import { createHash } from 'node:crypto';
import type { CreateAlertRequest } from '@pokepredict/shared';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === 'object') {
    const sorted = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));

    const output: Record<string, unknown> = {};
    for (const [key, child] of sorted) {
      output[key] = canonicalize(child);
    }

    return output;
  }

  return value;
}

export function computeAlertRequestHash(input: CreateAlertRequest): string {
  const canonicalPayload = JSON.stringify(canonicalize(input));
  return createHash('sha256').update(canonicalPayload).digest('hex');
}
