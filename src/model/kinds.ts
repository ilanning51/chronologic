import type { Kind } from './types';

export interface KindSpec {
  kind: Kind;
  word: string;
  initial: string;
  color: string;
  /** The pitch of the completion tone for a stretch of this kind. */
  pitchHz: number;
}

export const KINDS: Record<Kind, KindSpec> = {
  deep: { kind: 'deep', word: 'Deep', initial: 'D', color: '#2440A4', pitchHz: 262 },
  shallow: { kind: 'shallow', word: 'Shallow', initial: 'S', color: '#A67C00', pitchHz: 330 },
  body: { kind: 'body', word: 'Body', initial: 'B', color: '#1F7A3A', pitchHz: 392 },
  out: { kind: 'out', word: 'Out', initial: 'O', color: '#C4251F', pitchHz: 440 },
};

/** The order the bullets sit in, left to right. */
export const KIND_ORDER: Kind[] = ['deep', 'shallow', 'body', 'out'];
