import { useCallback, useRef, useState } from 'react';
import '../styles/ui.css';
import { newId } from '../model/ids';
import { kindVar } from '../model/kinds';
import { SPLIT_PIECES } from '../model/slide';
import { remaining } from '../model/stretch';
import type { Shape } from '../model/types';
import { type Camera, HOME, panBy, screenToWorld, zoomAt } from '../plane/camera';
import type { Point } from '../plane/geometry';
import type { Gesture } from '../plane/gestures';
import { placeClear } from '../plane/placement';
import { type Store, useWorld } from '../store/store';
import { Hud } from './Hud';
import { Plane } from './Plane';
import { Station } from './Station';

export interface AppProps {
  store: Store;
  /** The clock the app reads, injectable for tests. */
  now?: () => number;
}

export function App({ store, now = Date.now }: AppProps) {
  const world = useWorld(store);
  const [camera, setCamera] = useState<Camera>(HOME);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const [editing, setEditing] = useState<string | null>(null);
  /** Where the finger took hold of a station, so a move never jumps to the finger. */
  const grip = useRef<Point>({ x: 0, y: 0 });

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
          if (g.target.kind !== 'station') return;
          const id = g.target.id;
          const station = store.getState().stations.find((s) => s.id === id);
          if (!station) return;
          const under = screenToWorld(cam, g.at);
          grip.current = { x: station.x - under.x, y: station.y - under.y };
          return;
        }
        case 'dragMove':
        case 'dragEnd': {
          if (g.target.kind !== 'station') return;
          const under = screenToWorld(cam, g.at);
          store.dispatch({ type: 'move', id: g.target.id, x: under.x + grip.current.x, y: under.y + grip.current.y });
          return;
        }
        default:
          return;
      }
    },
    [store],
  );

  const onZoom = useCallback((at: Point, factor: number) => setCamera((c) => zoomAt(c, at, factor)), []);

  /** A captured station lands at the center of the view, nudged clear of what is there. */
  const addStation = useCallback(
    (title: string, shape: Shape) => {
      const center = screenToWorld(camera, { x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const taken = store.getState().stations.map((s) => ({ x: s.x, y: s.y }));
      const at = placeClear(center, taken);
      store.dispatch({ type: 'add', id: newId(), title, shape, x: at.x, y: at.y });
    },
    [camera, store],
  );

  const editingStation = editing ? (world.stations.find((s) => s.id === editing) ?? null) : null;

  const stretch = world.stretch;
  const lineColor = kindVar(stretch ? stretch.kind : 'deep');
  const fraction = stretch ? remaining(stretch, now()) : 0;
  const nextId = stretch ? (stretch.line.find((id) => !world.stations.find((s) => s.id === id)?.done) ?? null) : null;

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
      {world.stations.map((s) => (
        <Station key={s.id} station={s} scale={camera.scale} next={s.id === nextId} />
      ))}
    </Plane>
  );
}
