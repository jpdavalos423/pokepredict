export interface TcgdexCardIdentityInput {
  id?: string;
  localId?: string;
  set?: { id?: string };
}

export function normalizeTcgdexCardId(candidate: string): string | undefined {
  const compact = candidate.trim().replace(/\s+/g, '').replace(/_/g, '-');
  if (!compact) {
    return undefined;
  }

  const hyphenIndex = compact.lastIndexOf('-');
  if (hyphenIndex <= 0 || hyphenIndex === compact.length - 1) {
    return undefined;
  }

  const setPart = compact.slice(0, hyphenIndex).toLowerCase();
  const localPart = compact.slice(hyphenIndex + 1);

  if (!/^[a-z0-9.-]+$/.test(setPart)) {
    return undefined;
  }

  if (!/^[A-Za-z0-9]+$/.test(localPart)) {
    return undefined;
  }

  return `${setPart}-${localPart}`;
}

export function translateTcgdexCardId(card: TcgdexCardIdentityInput): string | undefined {
  if (typeof card.id === 'string') {
    const normalized = normalizeTcgdexCardId(card.id);
    if (normalized) {
      return normalized;
    }
  }

  if (typeof card.set?.id === 'string' && typeof card.localId === 'string') {
    return normalizeTcgdexCardId(`${card.set.id}-${card.localId}`);
  }

  return undefined;
}
