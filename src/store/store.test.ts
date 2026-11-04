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

const moveGoal = (x: number): Action => ({ type: 'moveGoal', trackId: 't', x, y: 2, now: 5 });
const goalX = (store: ReturnType<typeof createStore>) => store.getState().stops.find((s) => s.id === 'g')!.x;

test('undo puts back the world before each change, and redo puts it back again', () => {
  const store = createStore(EMPTY);
  expect(store.canUndo()).toBe(false);
  store.dispatch(newTrack);
  store.dispatch(moveGoal(100));
  store.undo();
  expect(goalX(store)).not.toBe(100);
  store.undo();
  expect(store.getState()).toBe(EMPTY);
  expect(store.canUndo()).toBe(false);
  store.redo();
  store.redo();
  expect(goalX(store)).toBe(100);
  expect(store.canRedo()).toBe(false);
});

test('a new change after undo drops what could be redone', () => {
  const store = createStore(EMPTY);
  store.dispatch(newTrack);
  store.dispatch(moveGoal(100));
  store.undo();
  store.dispatch(moveGoal(200));
  expect(store.canRedo()).toBe(false);
});

test('everything between begin and end is one step', () => {
  const store = createStore(EMPTY);
  store.dispatch(newTrack);
  const before = store.getState();
  store.begin();
  store.dispatch(moveGoal(100));
  store.dispatch(moveGoal(200));
  store.dispatch(moveGoal(300));
  store.end();
  store.undo();
  expect(store.getState()).toBe(before);
});

test('a step that changed nothing leaves nothing to undo, and undo notifies', () => {
  const store = createStore(EMPTY);
  store.begin();
  store.dispatch({ type: 'move', id: 'missing', x: 0, y: 0, now: 0 });
  store.end();
  expect(store.canUndo()).toBe(false);
  store.dispatch(newTrack);
  const seen = vi.fn();
  store.subscribe(seen);
  store.undo();
  expect(seen).toHaveBeenCalledTimes(1);
});

test('inStep is true only between begin and end', () => {
  const store = createStore(EMPTY);
  expect(store.inStep()).toBe(false);
  store.begin();
  expect(store.inStep()).toBe(true);
  store.end();
  expect(store.inStep()).toBe(false);
});

test('retract takes back the last step and leaves nothing to redo', () => {
  const store = createStore(EMPTY);
  store.dispatch(newTrack);
  expect(store.previous()).toBe(EMPTY);
  store.retract();
  expect(store.getState()).toBe(EMPTY);
  expect(store.canUndo()).toBe(false);
  expect(store.canRedo()).toBe(false);
  expect(store.previous()).toBeUndefined();
});
