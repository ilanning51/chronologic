import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/ui.css';
import { buzz } from '../feedback/haptics';
import { pitchFor, playChord, playTone } from '../feedback/sound';
import { newId } from '../model/ids';
import { DEFAULT_GOAL_SECONDS, tracksOf, type GoalDragStart } from '../model/reducer';
import { legSeconds, nextIndex, targetIndex, trackRoute, trainState } from '../model/train';
import {
  type Camera,
  centerOn,
  fitLeg,
  HOME,
  interpolate,
  MOTION_SCALE,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from '../plane/camera';
import type { Gesture } from '../plane/gestures';
import type { Point } from '../plane/geometry';
import { bubbleFor } from '../plane/bubbles';
import { layoutTrack } from '../plane/layout';
import { openingCamera } from '../plane/opening';
import { placeClear } from '../plane/placement';
import { snapToTracks } from '../plane/snap';
import { soonestTrack } from '../plane/soonest';
import { tickMsFor } from '../plane/tick';
import { SNAP_PX } from '../plane/world';
import { type Store, useWorld } from '../store/store';
import { Bubble } from './Bubble';
import { Ghost } from './Ghost';
import { Grid } from './Grid';
import { Legend } from './Legend';
import { LegTime } from './LegTime';
import { NameField } from './NameField';
import { Plane } from './Plane';
import { Stop } from './Stop';
import { StopEditor } from './StopEditor';
import { stopsOnce } from './stopsOnce';
import { Track } from './Track';
import { Tray } from './Tray';

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
  /**
   * The pending stop under a finger, how far its centre sits from where the finger landed, and
   * the drag's start: the seconds then of every train the drag re-routes, by track id, and, for
   * the goal, the points it scales from.
   */
  const dragging = useRef<{
    id: string;
    track: string;
    goal: boolean;
    grip: Point;
    keep: Record<string, number>;
    from?: GoalDragStart;
  } | null>(null);

  /** Whether the tray of tiles is open. */
  const [trayOpen, setTrayOpen] = useState(false);
  /** The shape being carried from the tray, where it is drawn, and whether it sits on a line. */
  const [ghost, setGhost] = useState<{ shape: 'circle' | 'triangle'; x: number; y: number; snapped: boolean } | null>(null);
  /** The shape and snap of the tile drag in flight; a ref so the drop reads the latest move. */
  const dragTile = useRef<{ shape: 'circle' | 'triangle'; snap: ReturnType<typeof snapToTracks> } | null>(null);
  /** The leg being set by a drag: where its stop is on screen and its planned seconds. */
  const [legTime, setLegTime] = useState<{ x: number; y: number; seconds: number } | null>(null);
  /** The stop or goal whose name field is open. */
  const [naming, setNaming] = useState<{ id: string; kind: 'stop' | 'goal'; trackId: string } | null>(null);
  const namingRef = useRef(naming);
  namingRef.current = naming;

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The camera starts on the soonest train, once; after that the hand moves it.
  useEffect(() => {
    setCamera(openingCamera(store.getState(), now(), { w: window.innerWidth, h: window.innerHeight }));
  }, []);

  /** The hand moving the camera ends any motion zoom: the next tap on a train follows it afresh. */
  const onZoom = useCallback((p: Point, factor: number) => {
    stash.current = null;
    setCamera((c) => zoomAt(c, p, factor));
  }, []);

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
    if (!track || !stop || stop.done) return;
    if (nextIndex(track, new Map(state.stops.map((s) => [s.id, s]))) !== track.stops.indexOf(stopId)) return;
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
    dragTile.current = null;
    const target = g.target;
    if (target.kind === 'tile') {
      if (target.tile === 'line') return;
      dragTile.current = { shape: target.tile, snap: null };
      carryTile(g.at);
      return;
    }
    if (target.kind !== 'stop') return;
    const state = store.getState();
    const stop = state.stops.find((s) => s.id === target.id);
    const track = state.tracks.find((t) => t.id === target.track);
    if (!stop || stop.done || !track) return;
    const byId = new Map(state.stops.map((s) => [s.id, s]));
    const train = trainState(track, byId, now());
    const under = screenToWorld(cameraRef.current, g.at);
    const pending = track.stops.slice(train.leg, -1).filter((id) => !byId.get(id)!.done);
    const ahead = Object.fromEntries(pending.map((id) => [id, { x: byId.get(id)!.x, y: byId.get(id)!.y }]));
    // A shared stop re-routes every line through it; each keeps its own train. A goal drag also
    // moves every pending stop ahead of its train.
    const lines = target.goal
      ? state.tracks.filter((t) => t.stops.some((id) => id === stop.id || pending.includes(id)))
      : tracksOf(state, stop.id).map((f) => f.track);
    const keep = Object.fromEntries(lines.map((t) => [t.id, trainState(t, byId, now()).seconds]));
    dragging.current = {
      id: stop.id,
      track: target.track,
      goal: target.goal,
      grip: { x: stop.x - under.x, y: stop.y - under.y },
      keep,
      from: target.goal ? { train: train.at, goal: { x: stop.x, y: stop.y }, ahead } : undefined,
    };
  };

  /**
   * Puts the dragged stop where the finger is, plus the grip so the shape never jumps. Every move
   * works from the drag's start, so where the finger wandered on the way never matters.
   */
  const dragTo = (at: Point) => {
    const d = dragging.current;
    if (!d) return;
    const under = screenToWorld(cameraRef.current, at);
    const x = under.x + d.grip.x;
    const y = under.y + d.grip.y;
    if (d.goal) store.dispatch({ type: 'moveGoal', trackId: d.track, x, y, now: now(), keep: d.keep, from: d.from });
    else store.dispatch({ type: 'move', id: d.id, x, y, now: now(), keep: d.keep });
    showLegInto(d.track, d.id);
  };

  /** Writes the planned time of the leg arriving at a stop beneath it, read back from the world. */
  const showLegInto = (trackId: string, stopId: string) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    const stop = state.stops.find((s) => s.id === stopId);
    if (!track || !stop) return;
    const route = trackRoute(track, new Map(state.stops.map((s) => [s.id, s])));
    const at = worldToScreen(cameraRef.current, stop);
    setLegTime({ x: at.x, y: at.y, seconds: legSeconds(route, track.stops.indexOf(stopId)) });
  };

  /** Carries a tile: the ghost follows the finger, or sits on the line it would join. */
  const carryTile = (at: Point) => {
    const d = dragTile.current;
    if (!d) return;
    const cam = cameraRef.current;
    d.snap = snapToTracks(store.getState(), screenToWorld(cam, at), now(), SNAP_PX / cam.scale);
    const shown = d.snap ? worldToScreen(cam, d.snap.at) : at;
    setGhost({ shape: d.shape, x: shown.x, y: shown.y, snapped: d.snap !== null });
    // On a line the ghost would end a new leg as long as its way along the leg it splits.
    setLegTime(d.snap ? { x: shown.x, y: shown.y, seconds: d.snap.offset } : null);
  };

  /** Dropping on a line adds a stop exactly there, so the track's total never changes. */
  const dropTile = () => {
    const d = dragTile.current;
    dragTile.current = null;
    setGhost(null);
    setLegTime(null);
    if (!d?.snap) return;
    const id = newId();
    store.dispatch({
      type: 'addStop',
      trackId: d.snap.trackId,
      id,
      shape: d.shape,
      leg: d.snap.leg,
      x: d.snap.at.x,
      y: d.snap.at.y,
      now: now(),
    });
    setNaming({ id, kind: 'stop', trackId: d.snap.trackId });
  };

  /** A new line starts clear of everything at the centre of the view, its goal thirty days out. */
  const newLine = () => {
    const cam = cameraRef.current;
    const state = store.getState();
    const taken = [...state.stops, ...state.tracks.map((t) => t.origin)];
    const origin = placeClear(screenToWorld(cam, { x: viewport.w / 2, y: viewport.h / 2 }), taken, 48 / cam.scale);
    const id = newId();
    const goalId = newId();
    store.dispatch({ type: 'newTrack', id, goalId, title: '', origin, now: now() });
    setNaming({ id: goalId, kind: 'goal', trackId: id });
    const middle = { x: origin.x + DEFAULT_GOAL_SECONDS / 2, y: origin.y };
    setCamera(centerOn(cam, middle, viewport, fitLeg(DEFAULT_GOAL_SECONDS, viewport.w, 1 / 2)));
  };

  /** Escape on a name keeps a bare stop, but a goal escaped from is no line at all. */
  const cancelNaming = () => {
    const n = namingRef.current;
    setNaming(null);
    if (n?.kind === 'goal') store.dispatch({ type: 'delete', id: n.id, now: now() });
  };

  const onGesture = (g: Gesture) => {
    switch (g.type) {
      case 'pan':
        stash.current = null;
        setCamera((c) => panBy(c, g.dx, g.dy));
        return;
      case 'pinch':
        stash.current = null;
        setCamera((c) => panBy(zoomAt(c, g.center, g.factor), g.dx, g.dy));
        return;
      case 'tap':
        if (g.target.kind === 'train') motionZoom(g.target.track);
        else if (g.target.kind === 'stop') complete(g.target.track, g.target.id);
        else if (g.target.kind === 'bubble') store.dispatch({ type: 'cycleTarget', trackId: g.target.track });
        else if (g.target.kind === 'tile') {
          if (g.target.tile === 'line') newLine();
        } else if (g.target.kind === 'paper') {
          setEditing(null);
          setTrayOpen(false);
          // A tap elsewhere commits an open name. A touchscreen blurs only after this tap, so blur now.
          (document.activeElement as HTMLElement | null)?.blur();
        }
        return;
      case 'longPress':
        if (g.target.kind === 'stop') openEditor(g.target.track, g.target.id);
        else if (g.target.kind === 'bubble') flyToTarget(g.target.track);
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
        if (g.target.kind === 'tile') carryTile(g.at);
        else dragTo(g.at);
        return;
      case 'dragEnd':
        if (g.target.kind === 'tile') {
          carryTile(g.at);
          dropTile();
          return;
        }
        dragTo(g.at);
        dragging.current = null;
        setLegTime(null);
        return;
      default:
        return; // the other gestures arrive with the tasks that use them
    }
  };

  /** A long press on a bubble flies to the stop it points at, keeping the current scale. */
  const flyToTarget = (trackId: string) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const stops = new Map(state.stops.map((s) => [s.id, s]));
    const i = targetIndex(track, stops);
    const target = i === null ? undefined : stops.get(track.stops[i]);
    if (!target) return;
    const c = cameraRef.current;
    fly(c, centerOn(c, target, viewport, c.scale));
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
  const views = world.tracks.map((t) => layoutTrack(t, world, camera, time, viewport));
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
        onDelete={() => {
          store.dispatch({ type: 'delete', id: editedStop.id, now: now() });
          setEditing(null);
        }}
        onUndo={() => {
          store.dispatch({ type: 'undo', trackId: editedTrack.id, now: now() });
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    ) : null;

  const named = naming
    ? views.flatMap((v) => v.stops).find((s) => s.id === naming.id)
    : undefined;
  const nameField = naming && (
    <NameField
      key={naming.id}
      x={(named?.x ?? -100) + 24}
      y={(named?.y ?? -100) - 16}
      viewport={viewport}
      label={naming.kind === 'goal' ? 'Line name' : 'Stop title'}
      onCommit={(title) => {
        const id = naming.id;
        store.dispatch({ type: 'edit', id, title });
        // A field replaced by a newer one commits as it goes; the newer one stays open.
        setNaming((n) => (n?.id === id ? null : n));
      }}
      onCancel={cancelNaming}
    />
  );
  const soonest = soonestTrack(world, time);
  const bubbles = views.flatMap((v) => {
    if (!v.anyInView) return [];
    const track = world.tracks.find((t) => t.id === v.id);
    const i = track ? targetIndex(track, byId) : null;
    const target = track && i !== null ? byId.get(track.stops[i]) : undefined;
    if (!track || !target) return [];
    // The stop may be off the grown viewport and so missing from the view: use its world point.
    const at = bubbleFor(worldToScreen(camera, target), viewport);
    return at
      ? [
          <Bubble
            key={v.id}
            track={v.id}
            color={v.color}
            day={v.day}
            soonest={v.id === soonest?.id}
            shape={target.shape}
            title={target.title}
            {...at}
          />,
        ]
      : [];
  });
  const hud = (
    <>
      {bubbles}
      {legTime && <LegTime {...legTime} />}
      {editor}
      <Legend camera={camera} />
      <Tray open={trayOpen} onToggle={() => setTrayOpen((o) => !o)} />
      {nameField}
    </>
  );

  return (
    <Plane onGesture={onGesture} onZoom={onZoom} hud={hud}>
      <Grid camera={camera} />
      {views.map((v) => (
        <Track key={v.id} view={v} />
      ))}
      {stopsOnce(views).map((p) => (
        <Stop key={p.stop.id} {...p} />
      ))}
      {ghost && <Ghost {...ghost} />}
    </Plane>
  );
}
