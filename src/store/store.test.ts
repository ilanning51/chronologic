import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { EMPTY, type Action } from '../model/reducer';
import { STORAGE_KEY } from './storage';
import { createStore, persist, useWorld } from './store';

const newTrack: Action = { type: 'newTrack', id: 't', goalId: 'g', title: 'Ship', origin: { x: 1, y: 2 }, now: 5 };

test('the store reduces and notifies, and persist writes every change', () => {
  const store = createStore(EMPTY);
  const seen = vi.fn();
  store.subscribe(seen);
  const setItem = vi.fn();
  persist(store, { setItem });

  store.dispatch(newTrack);

  expect(store.getState().tracks).toHaveLength(1);
  expect(seen).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEY);
  expect(JSON.parse(setItem.mock.calls[0][1] as string).tracks).toHaveLength(1);
});

test('an action that changes nothing does not notify', () => {
  const store = createStore(EMPTY);
  const seen = vi.fn();
  store.subscribe(seen);
  store.dispatch({ type: 'move', id: 'missing', x: 0, y: 0, now: 0 });
  expect(seen).not.toHaveBeenCalled();
});

test('unsubscribing stops the notifications', () => {
  const store = createStore(EMPTY);
  const seen = vi.fn();
  const stop = store.subscribe(seen);
  stop();
  store.dispatch(newTrack);
  expect(seen).not.toHaveBeenCalled();
});

test('useWorld reads the store and re-renders on change', () => {
  const store = createStore(EMPTY);
  const { result } = renderHook(() => useWorld(store));
  expect(result.current.tracks).toEqual([]);
  act(() => {
    store.dispatch(newTrack);
  });
  expect(result.current.stops.map((s) => s.title)).toEqual(['Ship']);
});
