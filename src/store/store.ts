import { useSyncExternalStore } from 'react';
import { reduce, type Action } from '../model/reducer';
import type { World } from '../model/types';
import { save } from './storage';

export interface Store {
  getState(): World;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
  /** Puts back the world as it was before the last step; the step can be redone. */
  undo(): void;
  /** Puts back the last step undone. */
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Everything dispatched from here until end() is one step: a whole drag undoes at once. */
  begin(): void;
  end(): void;
}

/** How many steps back undo can go. */
export const HISTORY_LIMIT = 100;

/** The clock's own changes are not the hand's, so undo never steps through them. */
const UNRECORDED = new Set<Action['type']>(['tick']);

/**
 * One world, one reducer, listeners told only when something actually changed. Every change is
 * a step undo can take back: the world before it goes on `past`. The reducer never mutates a
 * world, so keeping the old one is enough; nothing is copied.
 */
export function createStore(initial: World): Store {
  let state = initial;
  let past: World[] = [];
  let future: World[] = [];
  /** Open between begin() and end(); `recorded` once the step's starting world is on `past`. */
  let step: { recorded: boolean } | null = null;
  const listeners = new Set<() => void>();
  const set = (next: World) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      if (!UNRECORDED.has(action.type) && !step?.recorded) {
        past = [...past, state].slice(-HISTORY_LIMIT);
        future = [];
        if (step) step.recorded = true;
      }
      set(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    undo() {
      const previous = past[past.length - 1];
      if (!previous) return;
      past = past.slice(0, -1);
      future = [...future, state];
      step = null;
      set(previous);
    },
    redo() {
      const next = future[future.length - 1];
      if (!next) return;
      future = future.slice(0, -1);
      past = [...past, state];
      step = null;
      set(next);
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    begin() {
      step = { recorded: false };
    },
    end() {
      step = null;
    },
  };
}

/** Saves the world after every change. Returns a function that stops doing so. */
export function persist(store: Store, storage: Pick<Storage, 'setItem'>): () => void {
  return store.subscribe(() => save(storage, store.getState()));
}

export function useWorld(store: Store): World {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
