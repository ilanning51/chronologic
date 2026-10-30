import { useSyncExternalStore } from 'react';
import { reduce, type Action } from '../model/reducer';
import type { World } from '../model/types';
import { save } from './storage';

export interface Store {
  getState(): World;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
}

/** One world, one reducer, listeners told only when something actually changed. */
export function createStore(initial: World): Store {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(action) {
      const next = reduce(state, action);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
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
