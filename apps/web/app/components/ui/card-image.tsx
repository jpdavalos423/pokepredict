'use client';

import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { buildCardImageCandidates } from '../../../lib/card-image';

interface CardImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  imageUrl?: string | undefined;
  setId: string;
  number: string;
  fallback: ReactNode;
}

export function CardImage({ imageUrl, setId, number, fallback, onError, ...imageProps }: CardImageProps) {
  const candidates = useMemo(
    () => buildCardImageCandidates({ imageUrl, setId, number }),
    [imageUrl, setId, number]
  );
  const candidateKey = candidates.join('||');
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidateKey]);

  const src = candidates[candidateIndex];
  if (!src) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...imageProps}
      src={src}
      onError={(event) => {
        onError?.(event);
        setCandidateIndex((previous) => previous + 1);
      }}
    />
  );
}
