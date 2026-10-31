import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/ui.css';
import { trainState } from '../model/train';
import {
  type Camera,
  centerOn,
  HOME,
  interpolate,
  MOTION_SCALE,
  panBy,
  zoomAt,
} from '../plane/camera';
import type { Gesture } from '../plane/gestures';
import type { Point } from '../plane/geometry';
import { layoutTrack } from '../plane/layout';
import { openingCamera } from '../plane/opening';
import { tickMsFor } from '../plane/tick';
import { type Store, useWorld } from '../store/store';
import { Plane } from './Plane';
import { Stop } from './Stop';
import { Track } from './Track';

export interface AppProps {
  store: Store;
  /** The clock the app reads, injectable for tests. */
  now?: () => number;
}

/** How long the camera takes to fly between two views. */
const FLY_MS = 400;

/**
 * Flies the camera to a view over FLY_MS, easing out. A new flight cancels the one in the
 * air, and so does unmounting. Under reduced motion the camera simply arrives.
 */
function useFly(setCamera: (c: Camera) => void) {
  const frame = useRef<number | null>(null);
  const cancel = useCallback(() => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  return useCallback(
    (from: Camera, to: Camera) => {
      cancel();
      if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setCamera(to);
        return;
      }
      const start = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - start) / FLY_MS);
        setCamera(k >= 1 ? to : interpolate(from, to, 1 - (1 - k) ** 3));
        frame.current = k >= 1 ? null : window.requestAnimationFrame(step);
      };
      frame.current = window.requestAnimationFrame(step);
    },
    [cancel, setCamera],
  );
}

/** The v2 plane: every track and stop in screen space, redrawn as the clock ticks. */
export function App({ store, now = Date.now }: AppProps) {
  const world = useWorld(store);
  const [camera, setCamera] = useState(HOME);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const stash = useRef<Camera | null>(null);
  const fly = useFly(setCamera);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [time, setTime] = useState(now);

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The camera starts on the soonest train, once; after that the hand moves it.
  useEffect(() => {
    setCamera(openingCamera(store.getState(), now(), { w: window.innerWidth, h: window.innerHeight }));
  }, []);

  const onZoom = useCallback((p: Point, factor: number) => setCamera((c) => zoomAt(c, p, factor)), []);

  const onGesture = (g: Gesture) => {
    switch (g.type) {
      case 'pan':
        setCamera((c) => panBy(c, g.dx, g.dy));
        return;
      case 'pinch':
        setCamera((c) => panBy(zoomAt(c, g.center, g.factor), g.dx, g.dy));
        return;
      case 'tap':
        if (g.target.kind === 'train') motionZoom(g.target.track);
        return;
      default:
        return; // the other gestures arrive with the tasks that use them
    }
  };

  /** The first tap on a train flies in to follow it; the next flies back to where you were. */
  const motionZoom = (trackId: string) => {
    const c = cameraRef.current;
    const back = stash.current;
    if (back) {
      stash.current = null;
      fly(c, back);
      return;
    }
    const track = store.getState().tracks.find((t) => t.id === trackId);
    if (!track) return;
    const at = trainState(track, new Map(store.getState().stops.map((s) => [s.id, s])), now()).at;
    stash.current = c;
    fly(c, centerOn(c, at, viewport, MOTION_SCALE));
  };

  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const views = world.tracks.map((t) => layoutTrack(t, byId, camera, time, viewport));
  const rolling = views.some((v) => !v.train.parked);

  useEffect(() => {
    if (!rolling) return;
    const id = window.setInterval(() => setTime(now()), tickMsFor(camera.scale));
    return () => window.clearInterval(id);
  }, [rolling, camera.scale, now]);

  return (
    <Plane onGesture={onGesture} onZoom={onZoom} hud={null}>
      {views.map((v) => (
        <Track key={v.id} view={v} />
      ))}
      {views.flatMap((v) => v.stops.map((s) => <Stop key={s.id} stop={s} track={v.id} color={v.color} />))}
    </Plane>
  );
}
