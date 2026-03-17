function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  const valueType = typeof value;

  if (valueType === 'string') {
    return JSON.stringify(value);
  }

  if (valueType === 'number' || valueType === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }

  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const pairs: string[] = [];

    keys.forEach((key) => {
      const entry = record[key];
      if (entry === undefined) {
        return;
      }

      pairs.push(`${JSON.stringify(key)}:${stableSerialize(entry)}`);
    });

    return `{${pairs.join(',')}}`;
  }

  return JSON.stringify(String(value));
}

function hashFnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash +=
      (hash << 1) +
      (hash << 4) +
      (hash << 7) +
      (hash << 8) +
      (hash << 24);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toKeyPart(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  if (!normalized) {
    return 'unknown';
  }

  return normalized.slice(0, 48);
}

export function buildIdempotencyKey(scope: string, userId: string, payload: unknown): string {
  const serializedPayload = stableSerialize(payload);
  const payloadHash = hashFnv1a(serializedPayload);
  const scopePart = toKeyPart(scope);
  const userPart = toKeyPart(userId);

  return `${scopePart}-${userPart}-${payloadHash}`;
}
