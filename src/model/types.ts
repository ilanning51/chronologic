/** A stop is a task. Its shape and size say roughly how big it is; it never carries a color. */
export type Shape = 'circle' | 'triangle' | 'square';
export type Size = 'small' | 'medium' | 'large';

/** What a track's edge bubble points at. Named so it never clashes with the recognizer's pointer Target. */
export type BubbleTarget = 'next' | 'subgoal' | 'goal';

export interface Stop {
  id: string;
  title: string;
  shape: Shape;
  size: Size;
  /** Screen-plane position. Free on the plane; the track routes through it. */
  x: number;
  y: number;
  done: boolean;
}

/** Heading to stops[leg] since departedAt (ms epoch). leg === stops.length means parked after the goal. */
export interface Train {
  leg: number;
  departedAt: number;
}

export interface Track {
  id: string;
  /** Index into the palette. */
  color: number;
  origin: { x: number; y: number };
  /** Stop ids in order; the last is the goal. */
  stops: string[];
  train: Train;
  target: BubbleTarget;
}

export interface World {
  tracks: Track[];
  stops: Stop[];
  lastTouched: string | null;
}
