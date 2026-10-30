/** A station is a task. Its shape is its rough size; it never carries a color. */
export type Shape = 'circle' | 'triangle' | 'square';

/** The sort of energy a stretch takes. The kind owns the line's color. */
export type Kind = 'deep' | 'shallow' | 'body' | 'out';

/** The four phrases a stretch can be declared in. */
export type Length = 'hour' | 'couple' | 'half' | 'whole';

export interface Station {
  id: string;
  title: string;
  shape: Shape;
  /** World units. Left is sooner, right is later. */
  x: number;
  /** World units. Vertical position means nothing. */
  y: number;
  /** Reserved for depth. Always 0 in this version. */
  z: 0;
  done: boolean;
}

export interface Stretch {
  kind: Kind;
  length: Length;
  name: string;
  /** Milliseconds since the epoch. The only timestamp in the app. */
  startedAt: number;
  /** Ordered station ids, in the order the line was drawn. */
  line: string[];
}

export interface World {
  stations: Station[];
  stretch: Stretch | null;
  lastLength: Length;
}
