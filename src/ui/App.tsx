import { type ReactNode, useCallback, useRef, useState } from 'react';
import '../styles/ui.css';
import { newId } from '../model/ids';
import { kindVar } from '../model/kinds';
import { fit } from '../model/line';
import { capacity } from '../model/sizes';
import { SPLIT_PIECES } from '../model/slide';
import { remaining } from '../model/stretch';
import type { Kind, Shape, Station as StationData } from '../model/types';
import { type Camera, HOME, panBy, screenToWorld, zoomAt } from '../plane/camera';
import { distance, type Point } from '../plane/geometry';
import type { Gesture } from '../plane/gestures';
import { placeClear } from '../plane/placement';
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

export function App({ store, now = Date.now }: AppProps) {
  const world = useWorld(store);
  const [camera, setCamera] = useState<Camera>(HOME);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  /** Where the finger took hold of a station, so a move never jumps to the finger. */
  const grip = useRef<Point>({ x: 0, y: 0 });

  const updateDraft = (next: Draft | null) => {
    draftRef.current = next;
    setDraft(next);
  };

  const onGesture = useCallback(
    (g: Gesture) => {
      const cam = cameraRef.current;
      switch (g.type) {
        case 'pan':
          setCamera((c) => panBy(c, g.dx, g.dy));
          return;
        case 'pinch':
          setCamera((c) => panBy(zoomAt(c, g.center, g.factor), g.dx, g.dy));
          return;
        case 'tap':
          if (g.target.kind === 'paper') setEditing(null);
          return;
        case 'longPress':
          if (g.target.kind === 'station') setEditing(g.target.id);
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
                length: state.lastLength,
                line: current.ids,
                now: t,
                hour: new Date(t).getHours(),
              });
            }
          } else if (g.target.kind === 'station') {
            const under = screenToWorld(cam, g.at);
            store.dispatch({ type: 'move', id: g.target.id, x: under.x + grip.current.x, y: under.y + grip.current.y });
          }
          return;
        }
        default:
          return;
      }
    },
    [store, now],
  );

  const onZoom = useCallback((at: Point, factor: number) => setCamera((c) => zoomAt(c, at, factor)), []);

  /** A captured station lands at the center of the view, nudged clear of what is there. */
  const addStation = useCallback(
    (title: string, shape: Shape) => {
      const center = screenToWorld(camera, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const taken = store.getState().stations.map(at);
      const place = placeClear(center, taken);
      store.dispatch({ type: 'add', id: newId(), title, shape, x: place.x, y: place.y });
    },
    [camera, store],
  );

  const byId = new Map(world.stations.map((s) => [s.id, s]));
  const editingStation = editing ? (byId.get(editing) ?? null) : null;
  const stretch = world.stretch;
  const lineColor = kindVar(draft ? draft.kind : stretch ? stretch.kind : 'deep');
  const fraction = stretch ? remaining(stretch, now()) : 0;

  let line: ReactNode = null;
  let nextId: string | null = null;
  if (draft) {
    const stations = draft.ids.map((id) => byId.get(id)).filter((s): s is StationData => s !== undefined);
    const { reached } = fit(stations, capacity(world.lastLength));
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
    const stations = stretch.line.map((id) => byId.get(id)).filter((s): s is StationData => s !== undefined);
    const { reached } = fit(stations, capacity(stretch.length));
    const reachedStations = reached.map((id) => byId.get(id)!);
    const next = reachedStations.findIndex((s) => !s.done);
    nextId = next >= 0 ? reachedStations[next].id : null;
    line = <Line points={reachedStations.map(at)} color={lineColor} nextIndex={next >= 0 ? next : null} terminus />;
  }

  return (
    <Plane
      camera={camera}
      lineColor={lineColor}
      onGesture={onGesture}
      onZoom={onZoom}
      hud={
        <Hud
          stretch={stretch}
          fraction={fraction}
          lineColor={lineColor}
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
        <Station key={s.id} station={s} scale={camera.scale} next={s.id === nextId} />
      ))}
    </Plane>
  );
}
