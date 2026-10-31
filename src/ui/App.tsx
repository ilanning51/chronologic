import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/ui.css';
import { buzz } from '../feedback/haptics';
import { pitchFor, playChord, playTone } from '../feedback/sound';
import { nextIndex, trainState } from '../model/train';
import {
  type Camera,
  centerOn,
  HOME,
  interpolate,
  MOTION_SCALE,
  panBy,
  screenToWorld,
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
import { StopEditor } from './StopEditor';
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
  /** The stop whose editor is open, if any. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Whether a finger is holding the delete button. */
  const [holding, setHolding] = useState(false);
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const audio = useRef<AudioContext | null>(null);
  /** The pending stop under a finger, and how far its centre sits from where the finger landed. */
  const dragging = useRef<{ id: string; track: string; goal: boolean; grip: Point } | null>(null);

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

  /** The audio context is made on the first gesture that needs it, as browsers require. */
  const sound = (): AudioContext | null => {
    if (!audio.current && typeof AudioContext !== 'undefined') audio.current = new AudioContext();
    const ctx = audio.current;
    if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  /** Only the stop the train is heading for completes; the goal adds the chord and the buzz. */
  const complete = (trackId: string, stopId: string) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    const stop = state.stops.find((s) => s.id === stopId);
    if (!track || !stop || stop.done || nextIndex(track) !== track.stops.indexOf(stopId)) return;
    const goal = stopId === track.stops[track.stops.length - 1];
    store.dispatch({ type: 'complete', trackId, now: now() });
    const ctx = sound();
    if (ctx) {
      playTone(ctx, pitchFor(track.color));
      if (goal) playChord(ctx);
    }
    if (goal) buzz();
  };

  /** A long press opens the editor on the most recent dot, or on any pending stop. */
  const openEditor = (trackId: string, stopId: string) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    const stop = state.stops.find((s) => s.id === stopId);
    if (!track || !stop) return;
    if (!stop.done || track.stops.indexOf(stopId) === track.train.leg - 1) setEditing(stopId);
  };

  /** Starts dragging a pending stop; a dot is left alone for the whole drag. */
  const startDrag = (g: Extract<Gesture, { type: 'dragStart' }>) => {
    dragging.current = null;
    const target = g.target;
    if (target.kind !== 'stop') return;
    const stop = store.getState().stops.find((s) => s.id === target.id);
    if (!stop || stop.done) return;
    const under = screenToWorld(cameraRef.current, g.at);
    dragging.current = {
      id: stop.id,
      track: target.track,
      goal: target.goal,
      grip: { x: stop.x - under.x, y: stop.y - under.y },
    };
  };

  /** Puts the dragged stop where the finger is, plus the grip so the shape never jumps. */
  const dragTo = (at: Point) => {
    const d = dragging.current;
    if (!d) return;
    const under = screenToWorld(cameraRef.current, at);
    const x = under.x + d.grip.x;
    const y = under.y + d.grip.y;
    if (d.goal) store.dispatch({ type: 'moveGoal', trackId: d.track, x, y, now: now() });
    else store.dispatch({ type: 'move', id: d.id, x, y, now: now() });
  };

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
        else if (g.target.kind === 'stop') complete(g.target.track, g.target.id);
        else if (g.target.kind === 'paper') setEditing(null);
        return;
      case 'longPress':
        if (g.target.kind === 'stop') openEditor(g.target.track, g.target.id);
        return;
      case 'holdStart':
        if (g.target.kind === 'hold' && g.target.id === 'delete') setHolding(true);
        return;
      case 'holdEnd': {
        if (g.target.kind !== 'hold' || g.target.id !== 'delete') return;
        setHolding(false);
        const open = editingRef.current;
        if (g.completed && open) {
          const track = store.getState().tracks.find((t) => t.stops.includes(open));
          if (track && open === track.stops[track.stops.length - 1]) {
            store.dispatch({ type: 'delete', id: open, now: now() });
            setEditing(null);
          }
        }
        return;
      }
      case 'dragStart':
        startDrag(g);
        return;
      case 'dragMove':
        dragTo(g.at);
        return;
      case 'dragEnd':
        dragTo(g.at);
        dragging.current = null;
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

  const editedTrack = editing ? world.tracks.find((t) => t.stops.includes(editing)) : undefined;
  const editedStop = editing ? byId.get(editing) : undefined;
  const editor =
    editedTrack && editedStop ? (
      <StopEditor
        key={editedStop.id}
        stop={editedStop}
        goal={editedTrack.stops[editedTrack.stops.length - 1] === editedStop.id}
        done={editedStop.done}
        holding={holding}
        onEdit={(change) => store.dispatch({ type: 'edit', id: editedStop.id, ...change })}
        onDelete={() => {}}
        onUndo={() => {
          store.dispatch({ type: 'undo', trackId: editedTrack.id, now: now() });
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    ) : null;

  return (
    <Plane onGesture={onGesture} onZoom={onZoom} hud={editor}>
      {views.map((v) => (
        <Track key={v.id} view={v} />
      ))}
      {views.flatMap((v) => v.stops.map((s) => <Stop key={s.id} stop={s} track={v.id} color={v.color} />))}
    </Plane>
  );
}
