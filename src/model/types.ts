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
  /**
   * A goal's picture, as a small data URL: the thing the line is for, shown as the goal's mural
   * on the plane and in its bubble on the edge. Only a square ever carries one.
   */
  image?: string;
}

/** Heading to stops[leg] since departedAt (ms epoch). leg === stops.length means parked after the goal. */
export interface Train {
  leg: number;
  departedAt: number;
}

/**
 * What makes a track a day line. `date` is the local day it belongs to. `budgets` and `lengths`
 * run alongside `stops`: the project time the day train shadows on each leg, and how long each
 * stop's block is, in seconds. A day after today is `held`: its train waits at its start until
 * the day begins. `placed` marks a day the week window made, whose start and end square it keeps
 * just above its first stop and just below its last.
 */
export interface DayPlan {
  date: string;
  budgets: number[];
  lengths: number[];
  held?: true;
  placed?: true;
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
  /** Set on a day track, one per date. It never keeps a stop alive. */
  day?: DayPlan;
}

export interface World {
  tracks: Track[];
  stops: Stop[];
  lastTouched: string | null;
}
