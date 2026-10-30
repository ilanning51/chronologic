import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import '../styles/ui.css';
import { buzz } from '../feedback/haptics';
import { pitchFor, playChord, playTone } from '../feedback/sound';
import { newId } from '../model/ids';
import { kindVar } from '../model/kinds';
import { fit, reachedStations } from '../model/line';
import { capacity } from '../model/sizes';
import { SPLIT_PIECES } from '../model/slide';
import { isOver, remaining } from '../model/stretch';
import type { Kind, Length, Shape, Station as StationData } from '../model/types';
import { type Camera, centerOn, HOME, panBy, screenToWorld, STRETCH_ZOOM, zoomAt } from '../plane/camera';
import { distance, type Point } from '../plane/geometry';
import type { Gesture } from '../plane/gestures';
import { placeClear } from '../plane/placement';
import { routeThrough, trainOn } from '../plane/routing';
import { HIT_RADIUS_PX } from '../plane/world';
import { type Store, useWorld } from '../store/store';
import { Hud } from './Hud';
import { Line } from './Line';
import { Plane } from './Plane';
import { Station } from './Station';

export interface AppProps {
  store: Store;
  /** The clock the app reads, injectable for tests. */
  now?: () => number;
}

/** A line being drawn from a bullet: the kind, the stations passed so far, the finger. */
interface Draft {
  kind: Kind;
  ids: string[];
  pointer: Point;
}

const at = (s: StationData): Point => ({ x: s.x, y: s.y });

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

/** How often the pie is redrawn while a stretch runs. */
const CLOCK_TICK_MS = 1000;

/** How long the camera takes to fly to the train. */
const FLY_MS = 400;

export function App({ store, now = Date.now }: AppProps) {
  const world = useWorld(store);
  const [camera, setCamera] = useState<Camera>(HOME);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const [holding, setHolding] = useState(false);
  const [pendingKind, setPendingKind] = useState<Kind | null>(null);
  const [pendingLength, setPendingLength] = useState<Length | null>(null);
  const pendingLengthRef = useRef<Length | null>(null);
  const [, setTick] = useState(0);
  const [flying, setFlying] = useState(false);
  const flyTimer = useRef<number | null>(null);
  const audio = useRef<AudioContext | null>(null);
  /** Where the finger took hold of a station, so a move never jumps to the finger. */
  const grip = useRef<Point>({ x: 0, y: 0 });

  const stretch = world.stretch;
  const nowMs = now();

  // The pie is redrawn once a second while a stretch runs; time itself is read from the clock.
  useEffect(() => {
    if (!stretch) return;
    const id = window.setInterval(() => setTick((t) => t + 1), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, [stretch]);

  // The stretch ends by itself when the pie empties, even after a sleep: one quiet chord, one haptic.
  useEffect(() => {
    if (stretch && isOver(stretch, nowMs)) {
      store.dispatch({ type: 'end' });
      if (audio.current) playChord(audio.current);
      buzz();
    }
  });

  useEffect(
    () => () => {
      if (flyTimer.current !== null) window.clearTimeout(flyTimer.current);
    },
    [],
  );

  /** The audio context is made on the first gesture that needs it, as browsers require. */
  const sound = (): AudioContext | null => {
    if (!audio.current && typeof AudioContext !== 'undefined') audio.current = new AudioContext();
    const ctx = audio.current;
    if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') void ctx.resume();
    return ctx;
  };

  const updateDraft = (next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  /** A tap on a station: completes it when it is on the line, restores it when done. */
  const activate = (id: string) => {
    const state = store.getState();
    const station = state.stations.find((s) => s.id === id);
    if (!station) return;
    if (station.done) {
      store.dispatch({ type: 'restore', id });
    } else if (state.stretch?.line.includes(id)) {
      store.dispatch({ type: 'complete', id });
      const ctx = sound();
      if (ctx) playTone(ctx, pitchFor(state.stretch.kind));
    }
  };

  /** The camera flies to the train at the stretch zoom, so the next station is on screen. */
  const flyToTrain = () => {
    const { stations, next } = reachedStations(store.getState());
    if (stations.length === 0) return;
    const train = trainOn(routeThrough(stations.map(at)), Math.max(0, next));
    setFlying(true);
    if (flyTimer.current !== null) window.clearTimeout(flyTimer.current);
    flyTimer.current = window.setTimeout(() => setFlying(false), FLY_MS);
    setCamera((c) => centerOn(c, train.at, viewport(), STRETCH_ZOOM));
  };

  // On opening with a stretch running, the first thing on screen is the train and the next station.
  useEffect(() => {
    flyToTrain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onGesture = (g: Gesture) => {
    const cam = cameraRef.current;
    switch (g.type) {
      case 'pan':
        setCamera((c) => panBy(c, g.dx, g.dy));
        return;
      case 'pinch':
        setCamera((c) => panBy(zoomAt(c, g.center, g.factor), g.dx, g.dy));
        return;
      case 'tap':
        if (g.target.kind === 'paper') {
          setEditing(null);
          setPendingKind(null);
        } else if (g.target.kind === 'station') activate(g.target.id);
        else if (g.target.kind === 'clock') flyToTrain();
        return;
      case 'longPress':
        if (g.target.kind === 'station') setEditing(g.target.id);
        return;
      case 'holdStart':
        if (g.target.kind === 'clock') setHolding(true);
        return;
      case 'holdEnd':
        if (g.target.kind === 'clock') {
          setHolding(false);
          if (g.completed) store.dispatch({ type: 'end' });
        }
        return;
      case 'dragStart': {
        if (g.target.kind === 'bullet') {
          updateDraft({ kind: g.target.line, ids: [], pointer: screenToWorld(cam, g.at) });
        } else if (g.target.kind === 'station') {
          const id = g.target.id;
          const station = store.getState().stations.find((s) => s.id === id);
          if (!station) return;
          const under = screenToWorld(cam, g.at);
          grip.current = { x: station.x - under.x, y: station.y - under.y };
        }
        return;
      }
      case 'dragMove': {
        const under = screenToWorld(cam, g.at);
        if (g.target.kind === 'bullet') {
          const current = draftRef.current;
          if (!current) return;
          const radius = HIT_RADIUS_PX / cam.scale;
          const hit = store
            .getState()
            .stations.find((s) => !s.done && !current.ids.includes(s.id) && distance(at(s), under) < radius);
          updateDraft({ ...current, ids: hit ? [...current.ids, hit.id] : current.ids, pointer: under });
        } else if (g.target.kind === 'station') {
          store.dispatch({ type: 'move', id: g.target.id, x: under.x + grip.current.x, y: under.y + grip.current.y });
        }
        return;
      }
      case 'dragEnd': {
        if (g.target.kind === 'bullet') {
          const current = draftRef.current;
          updateDraft(null);
          if (!current || current.ids.length === 0) return;
          const state = store.getState();
          if (state.stretch) {
            store.dispatch({ type: 'redraw', kind: current.kind, line: current.ids });
          } else {
            const t = now();
            store.dispatch({
              type: 'start',
              kind: current.kind,
              length: pendingLengthRef.current ?? state.lastLength,
              line: current.ids,
              now: t,
              hour: new Date(t).getHours(),
            });
          }
          setPendingKind(null);
          pendingLengthRef.current = null;
          setPendingLength(null);
        } else if (g.target.kind === 'station') {
          const under = screenToWorld(cam, g.at);
          store.dispatch({ type: 'move', id: g.target.id, x: under.x + grip.current.x, y: under.y + grip.current.y });
        }
        return;
      }
      default:
        return;
    }
  };

  const onZoom = useCallback((p: Point, factor: number) => setCamera((c) => zoomAt(c, p, factor)), []);

  /** A captured station lands at the center of the view, nudged clear of what is there. */
  const addStation = (title: string, shape: Shape) => {
    const center = screenToWorld(camera, { x: viewport().w / 2, y: viewport().h / 2 });
    const taken = store.getState().stations.map(at);
    const place = placeClear(center, taken);
    store.dispatch({ type: 'add', id: newId(), title, shape, x: place.x, y: place.y });
  };

  const byId = new Map(world.stations.map((s) => [s.id, s]));
  const editingStation = editing ? (byId.get(editing) ?? null) : null;
  const lineColor = kindVar(draft ? draft.kind : stretch ? stretch.kind : 'deep');
  const fraction = stretch ? remaining(stretch, nowMs) : 0;

  let line: ReactNode = null;
  let nextId: string | null = null;
  const length = pendingLength ?? world.lastLength;

  if (draft) {
    const stations = draft.ids.map((id) => byId.get(id)).filter((s): s is StationData => s !== undefined);
    const { reached } = fit(stations, capacity(stretch ? stretch.length : length));
    const allFit = reached.length === stations.length;
    line = (
      <Line
        points={reached.map((id) => at(byId.get(id)!))}
        tail={allFit ? draft.pointer : undefined}
        color={lineColor}
        nextIndex={null}
        terminus={!allFit}
      />
    );
  } else if (stretch) {
    const { stations, next } = reachedStations(world);
    nextId = next >= 0 ? stations[next].id : null;
    line = <Line points={stations.map(at)} color={lineColor} nextIndex={next >= 0 ? next : null} terminus />;
  }

  return (
    <Plane
      camera={camera}
      lineColor={lineColor}
      flying={flying}
      onGesture={onGesture}
      onZoom={onZoom}
      hud={
        <Hud
          stretch={stretch}
          fraction={fraction}
          lineColor={lineColor}
          holding={holding}
          onFlyToTrain={flyToTrain}
          onRename={(name) => store.dispatch({ type: 'rename', name })}
          pendingKind={pendingKind}
          length={length}
          onPickKind={(kind) => setPendingKind((current) => (current === kind ? null : kind))}
          onPickLength={(picked) => {
            pendingLengthRef.current = picked;
            setPendingLength(picked);
          }}
          onAdd={addStation}
          editing={editingStation}
          onEdit={(change) => {
            if (editing) store.dispatch({ type: 'edit', id: editing, ...change });
          }}
          onSplit={() => {
            if (!editingStation) return;
            const ids = Array.from({ length: SPLIT_PIECES[editingStation.shape] }, () => newId());
            store.dispatch({ type: 'split', id: editingStation.id, ids });
            setEditing(null);
          }}
          onDelete={() => {
            if (editing) store.dispatch({ type: 'delete', id: editing });
            setEditing(null);
          }}
          onCloseEditor={() => setEditing(null)}
        />
      }
    >
      {line}
      {world.stations.map((s) => (
        <Station key={s.id} station={s} scale={camera.scale} next={s.id === nextId} onActivate={() => activate(s.id)} />
      ))}
    </Plane>
  );
}
