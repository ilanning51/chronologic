import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { EMPTY } from '../model/reducer';
import { STORAGE_KEY } from './storage';
import { createStore, persist, useWorld } from './store';

test('the store reduces and notifies, and persist writes every change', () => {
  const store = createStore(EMPTY);
  const seen = vi.fn();
  store.subscribe(seen);
  const setItem = vi.fn();
  persist(store, { setItem });

  store.dispatch({ type: 'add', id: 'a', title: 'Dentist', shape: 'circle', x: 1, y: 2 });

  expect(store.getState().stations).toHaveLength(1);
  expect(seen).toHaveBeenCalledTimes(1);
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(setItem.mock.calls[0][0]).toBe(STORAGE_KEY);
  expect(JSON.parse(setItem.mock.calls[0][1] as string).stations).toHaveLength(1);
});

test('an action that changes nothing does not notify', () => {
  const store = createStore(EMPTY);
  const seen = vi.fn();
  store.subscribe(seen);
  store.dispatch({ type: 'move', id: 'missing', x: 0, y: 0 });
  expect(seen).not.toHaveBeenCalled();
});

test('unsubscribing stops the notifications', () => {
  const store = createStore(EMPTY);
  const seen = vi.fn();
  const stop = store.subscribe(seen);
  stop();
  store.dispatch({ type: 'add', id: 'a', title: 'x', shape: 'circle', x: 0, y: 0 });
  expect(seen).not.toHaveBeenCalled();
});

test('useWorld reads the store and re-renders on change', () => {
  const store = createStore(EMPTY);
  const { result } = renderHook(() => useWorld(store));
  expect(result.current.stations).toEqual([]);
  act(() => {
    store.dispatch({ type: 'add', id: 'a', title: 'Dentist', shape: 'circle', x: 1, y: 2 });
  });
  expect(result.current.stations.map((s) => s.title)).toEqual(['Dentist']);
});
