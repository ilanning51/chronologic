import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/ui.css';
import { buzz } from '../feedback/haptics';
import { pitchFor, playChord, playTone } from '../feedback/sound';
import { dayWith, drawnOnPlane, isDayEnd, isProject, isShadow } from '../model/day';
import { dayOf, nextMidnight, parseDate } from '../model/days';
import { newId } from '../model/ids';
import { isRing, lifeOf, onLife } from '../model/life';
import { tracksOf, undoable, type GoalDragStart } from '../model/reducer';
import type { Size, World } from '../model/types';
import { legSeconds, nextIndex, stateOf, targetIndex, trackRoute, trainState } from '../model/train';
import {
  type Camera,
  centerOn,
  fitPoints,
  HOME,
  interpolate,
  MOTION_SCALE,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from '../plane/camera';
import type { Gesture, Tile } from '../plane/gestures';
import { distance, type Point } from '../plane/geometry';
import { gridFor, GRID_MIN_PX, YEAR } from '../plane/grid';
import { PROJECT_MIN_SCALE, PROJECTS_HIDDEN_FROM, RINGS_HIDDEN_FROM } from '../plane/level';
import { bubbleFor, clearOf } from '../plane/bubbles';
import { applyDaylight } from '../plane/daylight';
import { layoutTrack } from '../plane/layout';
import { routeOf, trainOn } from '../plane/metro';
import { openingCamera } from '../plane/opening';
import { pathLength, routeThrough } from '../plane/routing';
import { bounds, pick, prune, rectOf, type Rect, type Selection } from '../plane/select';
import { nearestStop, snapToAll, snapToLife } from '../plane/snap';
import { soonestTrack } from '../plane/soonest';
import { tickMsFor } from '../plane/tick';
import { BOX_PAD_PX, SNAP_PX, TAP_PX } from '../plane/world';
import { type Store, useWorld } from '../store/store';
import { Bubble } from './Bubble';
import { DayGhost } from './DayGhost';
import { Ghost } from './Ghost';
import { Grid } from './Grid';
import { History, HISTORY_CORNER_PX } from './History';
import { Legend } from './Legend';
import { LegTime } from './LegTime';
import { NameField } from './NameField';
import { pixelate } from './picture';
import { Plane } from './Plane';
import { SelectionBox } from './SelectionBox';
import { Stop } from './Stop';
import { StopEditor } from './StopEditor';
import { labelPlaces, stopsOnce } from './stopsOnce';
import { Track } from './Track';
import { Tray } from './Tray';
import { WeekButton } from './WeekButton';
import { WeekWindow } from './WeekWindow';

export interface AppProps {
  store: Store;
  /** The clock the app reads, injectable for tests. */
  now?: () => number;
  /** Turns a chosen image into the small painted data URL a goal keeps; injectable for tests. */
  picture?: (file: Blob) => Promise<string>;
}

/**
 * The project a stop is the goal of, if any. Read from the world, not from whichever listing is
 * at hand: a goal also on the day is still a goal, whichever line comes first.
 */
function homeOf(world: World, stopId: string) {
  return tracksOf(world, stopId).find(({ track, index }) => isProject(track) && index === track.stops.length - 1)?.track;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A day line's name on a chip: today's is "today", any other's is its weekday. */
function dayName(date: string, now: number): string {
  if (date === dayOf(now)) return 'today';
  return WEEKDAYS[parseDate(date).getDay()];
}

/** How far above its first stop a drawn day starts, and below its last the end square sits, in px. */
const DAY_GAP_PX = 120;

/** How long the camera takes to fly between two views. */
const FLY_MS = 400;

/** How often the paper is asked what time it is. */
const DAYLIGHT_MS = 60_000;

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

/** How often the open week window reads the clock when nothing else does. */
const WEEK_TICK_MS = 30_000;

/** The shapes a tile or a brush puts down: a marker is a square, which only the life line takes. */
type CarriedShape = 'circle' | 'triangle' | 'square';

/** The v2 plane: every track and stop in screen space, redrawn as the clock ticks. */
export function App({ store, now = Date.now, picture = pixelate }: AppProps) {
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
  /** Whether the week window is open over the plane. App state only: it opens closed. */
  const [weekOpen, setWeekOpen] = useState(false);
  const weekOpenRef = useRef(weekOpen);
  weekOpenRef.current = weekOpen;
  /** The tile whose brush is on, if any. App state only: never saved, off at start. */
  const [brush, setBrush] = useState<Tile | null>(null);
  const brushRef = useRef(brush);
  brushRef.current = brush;
  /** The line being drawn with the brush: where on screen the press went down. */
  const lineDraw = useRef<{ from: Point } | null>(null);
  /** The shape being carried from the tray, where it is drawn, and whether it sits on a line. */
  const [ghost, setGhost] = useState<{ shape: CarriedShape; size?: Size; x: number; y: number; snapped: boolean } | null>(null);
  /** The shape and snaps of the tile drag in flight, nearest first; a ref so the drop reads the latest move. */
  const dragTile = useRef<{ shape: CarriedShape; hits: ReturnType<typeof snapToAll> } | null>(null);
  /**
   * The step being split off a stop under the secondary button: its shape and size, the lines
   * it may land on, and the snaps in reach, nearest first.
   */
  const splitDrag = useRef<{ shape: 'circle' | 'triangle'; size: Size; tracks: string[]; hits: ReturnType<typeof snapToAll> } | null>(null);
  /** The sun drag in flight: where it was picked up on screen and the stops gathered, in order. */
  const drawing = useRef<{ from: Point; ids: string[] } | null>(null);
  /** The ghost ink line of the day being drawn, in screen points. */
  const [dayGhost, setDayGhost] = useState<Point[] | null>(null);
  /** The day's-end drag in flight: its day, where the square started, the grip, and whether it added a stop. */
  const endDrag = useRef<{ day: string; start: Point; grip: Point; added: boolean } | null>(null);
  /**
   * The drag of a line's start: its track, the grip, the seconds its train had covered, and
   * whether the first leg's chip shows, as it does only while the train is still on that leg.
   */
  const originDrag = useRef<{ track: string; grip: Point; keep?: number; chip: boolean } | null>(null);
  /** The marquee being drawn: its corners in screen pixels, the ref for the drag, the state to draw. */
  const marquee = useRef<{ from: Point; to: Point } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<Rect | null>(null);
  /** What the last box caught. App state only: it is never part of the saved world. */
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  /**
   * The group drag in flight: the world point under the pointer when it began, where every
   * selected stop and line start was then, and the seconds each touched train had covered. Every
   * move adds the pointer's whole travel to the start points, so the path never matters.
   */
  const groupDrag = useRef<{
    from: Point;
    stops: Record<string, Point>;
    origins: Record<string, Point>;
    keep: Record<string, number>;
  } | null>(null);
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

  // Escape lets go of the box, as a tap on paper does. A field that took the key for itself,
  // to cancel a name or close the editor, keeps the box: one key does one thing.
  // Backspace or Delete takes every stop in the box off the plane, as one step undo puts back.
  // Ctrl+Z undoes and Ctrl+Shift+Z or Ctrl+Y redoes (Cmd on a Mac). In a text field each of
  // these keys is the field's own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        // With the week window open, Escape closes it and nothing else.
        if (weekOpenRef.current) {
          setWeekOpen(false);
          return;
        }
        setSelection(null);
        setBrush(null);
        dropStroke();
        return;
      }
      const el = e.target;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        e.preventDefault();
        history(key === 'y' || e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectionRef.current && !weekOpenRef.current) {
        e.preventDefault();
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The paper takes the hour's tint on open and once a minute after; on close it gives the
  // tokens back their day paper.
  useEffect(() => {
    const root = document.documentElement;
    const tint = () => applyDaylight(root, new Date(now()));
    tint();
    const id = window.setInterval(tint, DAYLIGHT_MS);
    return () => {
      window.clearInterval(id);
      root.style.removeProperty('--paper');
      root.style.removeProperty('--grid');
    };
  }, [now]);

  // The camera starts on the soonest train, once; after that the hand moves it. Yesterday's day
  // goes first, so the camera never opens on it.
  useEffect(() => {
    store.dispatch({ type: 'tick', now: now() });
    setCamera(openingCamera(store.getState(), now(), { w: window.innerWidth, h: window.innerHeight }));
  }, []);

  /**
   * Stops added since the last zoom, drawn whatever the level, so a circle dropped from far
   * away does not vanish the moment it is named. The next zoom lets the level decide again.
   * A ref, not state: adding one always comes with a store dispatch, and clearing it always
   * comes with a camera change, so each is redrawn by the thing that caused it.
   */
  const pinned = useRef(new Set<string>());

  /** The hand moving the camera ends any motion zoom: the next tap on a train follows it afresh. */
  const onZoom = useCallback((p: Point, factor: number) => {
    stash.current = null;
    pinned.current = new Set();
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

  /**
   * A long press opens the editor on any pending stop, or on a dot Not done can put back, judged
   * by the same rule the reducer uses, so the button undoes the stop that was pressed.
   */
  const openEditor = (stopId: string) => {
    const state = store.getState();
    const stop = state.stops.find((s) => s.id === stopId);
    if (!stop) return;
    if (!stop.done || undoable(state, stopId, now())) setEditing(stopId);
  };

  /** Starts dragging a pending stop; a dot is left alone for the whole drag. */
  const startDrag = (g: Extract<Gesture, { type: 'dragStart' }>) => {
    dragging.current = null;
    dragTile.current = null;
    drawing.current = null;
    endDrag.current = null;
    originDrag.current = null;
    groupDrag.current = null;
    lineDraw.current = null;
    splitDrag.current = null;
    const target = g.target;
    if (target.kind === 'brush') {
      // A line or the day is drawn from where the press went down; the step brushes only tap.
      if (brushRef.current === 'line') lineDraw.current = { from: g.at };
      else if (brushRef.current === 'sun') drawing.current = { from: g.at, ids: [] };
      return;
    }
    if (target.kind === 'marquee') {
      marquee.current = { from: g.at, to: g.at };
      setMarqueeBox(rectOf(g.at, g.at));
      return;
    }
    if (target.kind === 'split') {
      startSplit(target.id, g.at);
      return;
    }
    // Anything the box holds drags the whole box; a stop or a start outside it drags alone.
    const held = selectionRef.current && prune(store.getState(), selectionRef.current);
    const grouped =
      target.kind === 'selection' ||
      (target.kind === 'stop' && held?.stops.includes(target.id)) ||
      (target.kind === 'origin' && held?.origins.includes(target.track));
    if (grouped) {
      if (held) startGroupDrag(held, g.at);
      return;
    }
    if (target.kind === 'origin') {
      startOriginDrag(target.track, g.at);
      return;
    }
    // A train's own hit square sits above the start's. A press inside the start's square that the
    // train took is still the start's, so a line just made can be picked up by either end.
    if (target.kind === 'train') {
      const track = store.getState().tracks.find((t) => t.id === target.track);
      if (!track) return;
      const o = worldToScreen(cameraRef.current, track.origin);
      if (Math.abs(g.at.x - o.x) <= TAP_PX / 2 && Math.abs(g.at.y - o.y) <= TAP_PX / 2) startOriginDrag(track.id, g.at);
      return;
    }
    if (target.kind === 'tile') {
      if (target.tile === 'line') return;
      if (target.tile === 'sun') {
        // Nothing is collected where the sun is picked up, only where the finger takes it.
        drawing.current = { from: g.at, ids: [] };
        return;
      }
      dragTile.current = { shape: target.tile, hits: [] };
      carryTile(g.at);
      return;
    }
    if (target.kind !== 'stop') return;
    const state = store.getState();
    const stop = state.stops.find((s) => s.id === target.id);
    if (!stop || stop.done) return;
    const under = screenToWorld(cameraRef.current, g.at);
    if (isDayEnd(state, stop.id)) {
      const grip = { x: stop.x - under.x, y: stop.y - under.y };
      endDrag.current = { day: dayWith(state, stop.id)!.id, start: { x: stop.x, y: stop.y }, grip, added: false };
      return;
    }
    const byId = new Map(state.stops.map((s) => [s.id, s]));
    // A square on the life line, a ring or a bare marker with no home line, slides along it: its
    // leg chip is the life line's, and every project through it keeps its train where it was.
    const life = lifeOf(state);
    if (life?.stops.includes(stop.id)) {
      const projects = tracksOf(state, stop.id).filter(({ track: t }) => isProject(t));
      const keep = Object.fromEntries(projects.map(({ track: t }) => [t.id, trainState(t, byId, now()).seconds]));
      dragging.current = { id: stop.id, track: life.id, goal: false, grip: { x: stop.x - under.x, y: stop.y - under.y }, keep };
      return;
    }
    // A goal drags as its line's goal whichever line its button speaks for, the day's included.
    // A plain stop's leg chip reads a project leg, where it is next or else the first: the day's
    // legs are not time, so a stop speaking for the day must not read one.
    const home = homeOf(state, stop.id);
    const goal = home !== undefined;
    const projects = tracksOf(state, stop.id).filter(({ track: t }) => isProject(t));
    const project = projects.find(({ track: t, index }) => nextIndex(t, byId) === index) ?? projects[0];
    const track = home ?? project?.track;
    if (!track) return;
    const train = trainState(track, byId, now());
    const pending = track.stops.slice(train.leg, -1).filter((id) => !byId.get(id)!.done);
    const ahead = Object.fromEntries(pending.map((id) => [id, { x: byId.get(id)!.x, y: byId.get(id)!.y }]));
    // A shared stop re-routes every line through it; each keeps its own train. A goal drag also
    // moves every pending stop ahead of its train.
    const lines = goal
      ? state.tracks.filter((t) => t.stops.some((id) => id === stop.id || pending.includes(id)))
      : tracksOf(state, stop.id).map((f) => f.track);
    const keep = Object.fromEntries(lines.map((t) => [t.id, trainState(t, byId, now()).seconds]));
    dragging.current = {
      id: stop.id,
      track: track.id,
      goal,
      grip: { x: stop.x - under.x, y: stop.y - under.y },
      keep,
      from: goal ? { train: train.at, goal: { x: stop.x, y: stop.y }, ahead } : undefined,
    };
  };

  /**
   * Picks up the start of a line. While the train is still on the first leg the leg changes
   * length under it and the chip shows; once past the first stop the start is history. The day
   * line's start moves the same way and never shows a chip, as its legs are not time.
   */
  const startOriginDrag = (trackId: string, at: Point) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const under = screenToWorld(cameraRef.current, at);
    const train = trainState(track, new Map(state.stops.map((s) => [s.id, s])), now());
    // Only a train still on the first leg has a leg that changes; any other keeps its own clock.
    const first = isProject(track) && !train.parked && train.leg === 0;
    originDrag.current = {
      track: trackId,
      grip: { x: track.origin.x - under.x, y: track.origin.y - under.y },
      keep: first ? train.seconds : undefined,
      chip: first,
    };
  };

  /** Picks up everything the box holds, done or not, and notes where each train is. */
  const startGroupDrag = (held: Selection, at: Point) => {
    const state = store.getState();
    const byId = new Map(state.stops.map((s) => [s.id, s]));
    const stops = Object.fromEntries(
      state.stops.filter((s) => held.stops.includes(s.id)).map((s) => [s.id, { x: s.x, y: s.y }]),
    );
    const origins = Object.fromEntries(
      state.tracks.filter((t) => held.origins.includes(t.id)).map((t) => [t.id, { x: t.origin.x, y: t.origin.y }]),
    );
    // A train is held to its seconds only where its own leg changes length: one end of the leg
    // moves and the other stays. A leg with both ends in the group, or neither, keeps its clock.
    const keep: Record<string, number> = {};
    for (const t of state.tracks) {
      if (!isProject(t)) continue;
      const train = trainState(t, byId, now());
      if (train.parked) continue;
      const fromMoves = train.leg === 0 ? t.id in origins : t.stops[train.leg - 1] in stops;
      const toMoves = t.stops[train.leg] in stops;
      if (fromMoves !== toMoves) keep[t.id] = train.seconds;
    }
    groupDrag.current = { from: screenToWorld(cameraRef.current, at), stops, origins, keep };
  };

  /** Slides the whole group by the pointer's travel since the drag began. Nothing scales. */
  const dragGroupTo = (at: Point) => {
    const d = groupDrag.current;
    if (!d) return;
    const under = screenToWorld(cameraRef.current, at);
    const dx = under.x - d.from.x;
    const dy = under.y - d.from.y;
    const moved = (points: Record<string, Point>) =>
      Object.fromEntries(Object.entries(points).map(([id, p]) => [id, { x: p.x + dx, y: p.y + dy }]));
    store.dispatch({ type: 'moveGroup', stops: moved(d.stops), origins: moved(d.origins), now: now(), keep: d.keep });
  };

  /** The marquee follows the mouse; letting go keeps what it caught, or nothing. */
  const drawMarquee = (at: Point) => {
    const m = marquee.current;
    if (!m) return;
    m.to = at;
    setMarqueeBox(rectOf(m.from, m.to));
  };
  const dropMarquee = (at: Point) => {
    const m = marquee.current;
    marquee.current = null;
    setMarqueeBox(null);
    if (!m) return;
    const cam = cameraRef.current;
    setSelection(pick(store.getState(), rectOf(screenToWorld(cam, m.from), screenToWorld(cam, at)), dayOf(now())));
  };

  /** Moves the start of the line under the finger, grip and all, and reads back the first leg. */
  const dragOriginTo = (at: Point) => {
    const d = originDrag.current;
    if (!d) return;
    const under = screenToWorld(cameraRef.current, at);
    const x = under.x + d.grip.x;
    const y = under.y + d.grip.y;
    store.dispatch({ type: 'moveOrigin', trackId: d.track, x, y, now: now(), keep: d.keep });
    if (!d.chip) return;
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === d.track);
    if (!track) return;
    const route = trackRoute(track, new Map(state.stops.map((s) => [s.id, s])));
    const shown = worldToScreen(cameraRef.current, track.origin);
    setLegTime({ x: shown.x, y: shown.y, seconds: legSeconds(route, 0) });
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

  /**
   * The lines a shape put down at a world point would join, nearest first. A square is a marker
   * and only the life line takes it; every other shape joins project lines and never the life line.
   */
  const snapsFor = (shape: CarriedShape, p: Point): ReturnType<typeof snapToAll> => {
    const state = store.getState();
    const radius = SNAP_PX / cameraRef.current.scale;
    if (shape !== 'square') return snapToAll(state, p, now(), radius);
    const hit = snapToLife(state, p, now(), radius);
    return hit ? [hit] : [];
  };

  /** Carries a tile: the ghost follows the finger, or sits on the nearest line it would join. */
  const carryTile = (at: Point) => {
    const d = dragTile.current;
    if (!d) return;
    const cam = cameraRef.current;
    d.hits = snapsFor(d.shape, screenToWorld(cam, at));
    const snap = d.hits[0];
    const shown = snap ? worldToScreen(cam, snap.at) : at;
    setGhost({ shape: d.shape, x: shown.x, y: shown.y, snapped: snap !== undefined });
    // On a line the ghost would end a new leg as long as its way along the leg it splits.
    setLegTime(snap ? { x: shown.x, y: shown.y, seconds: snap.offset } : null);
  };

  /**
   * Puts a carried shape down. On a line it is a stop exactly there, so the track's total never
   * changes; where other lines are in reach too, the same stop joins each, staying at the
   * nearest's point; its name field opens. On paper it is nothing.
   */
  const placeCarried = (shape: CarriedShape, size: Size, hits: ReturnType<typeof snapToAll>) => {
    setGhost(null);
    setLegTime(null);
    const [first, ...rest] = hits;
    if (!first) return;
    const id = newId();
    const { x, y } = first.at;
    store.dispatch({ type: 'addStop', trackId: first.trackId, id, shape, size, leg: first.leg, x, y, now: now() });
    for (const hit of rest) store.dispatch({ type: 'join', trackId: hit.trackId, stopId: id, leg: hit.leg, x, y, now: now() });
    pinned.current.add(id);
    setNaming({ id, kind: 'stop', trackId: first.trackId });
  };

  /** Lets go of a tile from the tray: a medium stop where the ghost sat. */
  const dropTile = () => {
    const d = dragTile.current;
    dragTile.current = null;
    placeCarried(d?.shape ?? 'circle', 'medium', d?.hits ?? []);
  };

  /**
   * Picks up a step split off a stop under the secondary button. The step is one shape down the
   * ladder, a square giving a triangle and a triangle or a circle giving a circle, at the stop's
   * own size; the stop itself is as it was. It may land only on the lines the stop is on, ahead
   * of their trains. A dot, and the day's-end square, split nothing.
   */
  const startSplit = (stopId: string, at: Point) => {
    const state = store.getState();
    const stop = state.stops.find((s) => s.id === stopId);
    if (!stop || stop.done || isDayEnd(state, stopId)) return;
    const tracks = tracksOf(state, stopId)
      .filter(({ track }) => isProject(track))
      .map(({ track }) => track.id);
    if (tracks.length === 0) return;
    splitDrag.current = { shape: stop.shape === 'square' ? 'triangle' : 'circle', size: stop.size, tracks, hits: [] };
    carrySplit(at);
  };

  /** Carries the split step along its stop's lines: the ghost sits on the nearest in reach, or follows the pointer. */
  const carrySplit = (at: Point) => {
    const d = splitDrag.current;
    if (!d) return;
    const cam = cameraRef.current;
    d.hits = snapToAll(store.getState(), screenToWorld(cam, at), now(), SNAP_PX / cam.scale).filter((h) => d.tracks.includes(h.trackId));
    const snap = d.hits[0];
    const shown = snap ? worldToScreen(cam, snap.at) : at;
    setGhost({ shape: d.shape, size: d.size, x: shown.x, y: shown.y, snapped: snap !== undefined });
    setLegTime(snap ? { x: shown.x, y: shown.y, seconds: snap.offset } : null);
  };

  /** Lets go of the split step: a stop of its shape and size where the ghost sat. */
  const dropSplit = () => {
    const d = splitDrag.current;
    splitDrag.current = null;
    placeCarried(d?.shape ?? 'circle', d?.size ?? 'medium', d?.hits ?? []);
  };

  /** A tap with a step or marker brush: a medium stop on the line nearest the tap, if one is in reach. */
  const placeStop = (shape: CarriedShape, at: Point) => {
    placeCarried(shape, 'medium', snapsFor(shape, screenToWorld(cameraRef.current, at)));
  };

  /** The line brush in flight: the routed ghost from the press to the pointer, and its time. */
  const drawLineTo = (at: Point) => {
    const d = lineDraw.current;
    if (!d) return;
    const cam = cameraRef.current;
    const route = routeThrough([screenToWorld(cam, d.from), screenToWorld(cam, at)]);
    setDayGhost(route.vertices.map((p) => worldToScreen(cam, p)));
    setLegTime({ x: at.x, y: at.y, seconds: pathLength(route.vertices, 0, route.vertices.length - 1) });
  };

  /** Lifting the line brush makes the line: its start at the press, its goal under the pointer. */
  const dropLine = (at: Point) => {
    const d = lineDraw.current;
    lineDraw.current = null;
    setDayGhost(null);
    setLegTime(null);
    if (!d) return;
    const cam = cameraRef.current;
    const id = newId();
    const goalId = newId();
    const origin = screenToWorld(cam, d.from);
    store.dispatch({ type: 'newTrack', id, goalId, title: '', origin, goal: screenToWorld(cam, at), now: now() });
    setNaming({ id: goalId, kind: 'goal', trackId: id });
  };

  /** A stroke a second finger or the browser took over: whatever it was drawing is thrown away. */
  const dropStroke = () => {
    lineDraw.current = null;
    drawing.current = null;
    setDayGhost(null);
    setLegTime(null);
  };

  /**
   * Letting go of a stop near another line's path joins it there, at the snap point; the line it
   * came from keeps it. Only the release joins, so dragging through a line never does. A goal
   * drag scales its line instead, and joins no project line; released on the life line it joins
   * that, and the stops it scaled on the way go back, so only the goal has moved. A square on the
   * life line only slides along it.
   */
  const joinOnRelease = (d: NonNullable<typeof dragging.current>) => {
    const state = store.getState();
    if (onLife(state, d.id)) return;
    const stop = state.stops.find((s) => s.id === d.id);
    if (!stop) return;
    const cam = cameraRef.current;
    if (d.goal && d.from) {
      const hit = snapToLife(state, stop, now(), SNAP_PX / cam.scale, stop.id);
      if (!hit) return;
      store.dispatch({ type: 'moveGroup', stops: d.from.ahead, origins: {}, now: now(), keep: d.keep });
      store.dispatch({ type: 'join', trackId: hit.trackId, stopId: stop.id, leg: hit.leg, x: hit.at.x, y: hit.at.y, now: now() });
      return;
    }
    // A square never joins: a goal drawn speaking for the day is still its line's goal.
    if (d.goal || homeOf(state, d.id)) return;
    const hit = snapToAll(state, stop, now(), SNAP_PX / cam.scale, stop.id)[0];
    if (hit) store.dispatch({ type: 'join', trackId: hit.trackId, stopId: stop.id, leg: hit.leg, x: hit.at.x, y: hit.at.y, now: now() });
  };

  /** Stops a day can take: pending, listed by some project, not on the life line, and not among `skip`. */
  const dayCandidates = (skip: string[]) => {
    const state = store.getState();
    return state.stops.filter(
      (s) => !s.done && !skip.includes(s.id) && !onLife(state, s.id) && state.tracks.some((t) => isProject(t) && t.stops.includes(s.id)),
    );
  };

  /**
   * Carries the sun: each pending stop the finger passes joins the drawing, in the order reached.
   * Once one has, the ghost starts where the day will, above the first stop, so nothing jumps on
   * release; before that it runs from the pick-up.
   */
  const drawSun = (at: Point) => {
    const d = drawing.current;
    if (!d) return;
    const cam = cameraRef.current;
    const hit = nearestStop(dayCandidates(d.ids), screenToWorld(cam, at), SNAP_PX / cam.scale);
    if (hit) d.ids = [...d.ids, hit.id];
    const byId = new Map(store.getState().stops.map((s) => [s.id, s]));
    const through = d.ids.map((id) => worldToScreen(cam, byId.get(id)!));
    const start = through.length > 0 ? { x: through[0].x, y: through[0].y - DAY_GAP_PX } : d.from;
    setDayGhost([start, ...through, at]);
  };

  /**
   * Lifting the sun draws the day through what it gathered, its end square under the finger and
   * its start just above the first stop. Let go on the last stop gathered, the square goes just
   * below it rather than on top of it. Gathering nothing draws nothing.
   */
  const dropSun = (at: Point) => {
    drawSun(at);
    const d = drawing.current;
    drawing.current = null;
    setDayGhost(null);
    if (!d || d.ids.length === 0) return;
    const cam = cameraRef.current;
    const stops = store.getState().stops;
    const first = stops.find((s) => s.id === d.ids[0])!;
    const last = stops.find((s) => s.id === d.ids[d.ids.length - 1])!;
    const under = screenToWorld(cam, at);
    const gap = DAY_GAP_PX / cam.scale;
    const end = distance(under, last) <= SNAP_PX / cam.scale ? { x: last.x, y: last.y + gap } : under;
    const t = now();
    store.dispatch({
      type: 'newDay',
      id: newId(),
      endId: newId(),
      origin: { x: first.x, y: first.y - gap },
      stops: d.ids,
      end,
      now: t,
      date: dayOf(t),
    });
  };

  /**
   * Moves the day's-end square alone, grip and all, scaling nothing; passing it over a pending
   * stop not yet on the day adds that stop. No leg time shows: the day's legs are not time.
   */
  const dragDayEnd = (at: Point) => {
    const d = endDrag.current;
    if (!d) return;
    const cam = cameraRef.current;
    const under = screenToWorld(cam, at);
    const p = { x: under.x + d.grip.x, y: under.y + d.grip.y };
    store.dispatch({ type: 'moveDayEnd', dayId: d.day, x: p.x, y: p.y, now: now() });
    const day = store.getState().tracks.find((t) => t.id === d.day);
    const hit = day ? nearestStop(dayCandidates(day.stops), p, SNAP_PX / cam.scale) : null;
    if (!hit) return;
    store.dispatch({ type: 'addToDay', dayId: d.day, stopId: hit.id, now: now() });
    if (store.getState().tracks.find((t) => t.id === d.day)?.stops.includes(hit.id)) d.added = true;
  };

  /** A square that added a stop goes back where it was; otherwise it stays where it was let go. */
  const dropDayEnd = (at: Point) => {
    dragDayEnd(at);
    const d = endDrag.current;
    endDrag.current = null;
    if (d?.added) store.dispatch({ type: 'moveDayEnd', dayId: d.day, x: d.start.x, y: d.start.y, now: now() });
  };

  /**
   * Deletes every stop the box holds, as one step. Goals go first, each taking its line and every
   * stop only that line had; what is left goes one by one. A line's start is not a stop and stays
   * unless its goal went. A stop the reducer refuses, such as one on a line already finished, stays.
   */
  const deleteSelected = () => {
    const state = store.getState();
    const held = selectionRef.current && prune(state, selectionRef.current);
    setSelection(null);
    if (!held) return;
    const goals = held.stops.filter((id) => homeOf(state, id));
    const rest = held.stops.filter((id) => !goals.includes(id));
    store.begin();
    for (const id of [...goals, ...rest]) store.dispatch({ type: 'delete', id, now: now() });
    store.end();
    const open = editingRef.current;
    if (open && !store.getState().stops.some((s) => s.id === open)) setEditing(null);
  };

  /** Escape on a name keeps a bare stop, but a goal escaped from is no line at all. */
  const cancelNaming = () => {
    const n = namingRef.current;
    setNaming(null);
    if (n?.kind !== 'goal') return;
    // Straight after the line was made, take that step back whole, so Undo never brings back a
    // line just dismissed; otherwise delete it as before.
    const before = store.previous();
    if (before && !before.stops.some((s) => s.id === n.id)) store.retract();
    else store.dispatch({ type: 'delete', id: n.id, now: now() });
  };

  /**
   * The editor's typing, as one undo step: opened at the first letter, closed when the editor
   * closes or anything else happens on the plane.
   */
  const titleStep = useRef<string | null>(null);
  const endTitleStep = () => {
    if (titleStep.current === null) return;
    titleStep.current = null;
    store.end();
  };
  useEffect(() => endTitleStep, [editing]);

  /**
   * Undo or redo, after settling what is open: an open name is committed (as walking away from
   * it always does) and the editor closes, so neither is left pointing at a stop that is gone.
   */
  const history = (dir: 'undo' | 'redo') => {
    endTitleStep();
    // A drag in flight is one step still being made: taking it back under the hand would split it.
    if (store.inStep()) return;
    (document.activeElement as HTMLElement | null)?.blur();
    setEditing(null);
    if (dir === 'undo') store.undo();
    else store.redo();
    // A world from before midnight may hold yesterday's day; the clock clears it, as on opening.
    store.dispatch({ type: 'tick', now: now() });
    const n = namingRef.current;
    if (n && !store.getState().stops.some((s) => s.id === n.id)) setNaming(null);
  };

  /**
   * A tap on a tile: its brush on, or off if it was on; another tile's brush goes off. A brush and
   * the week window are never on together: taking up a brush closes the window.
   */
  const toggleBrush = (tile: Tile) => {
    setWeekOpen(false);
    setBrush((b) => (b === tile ? null : tile));
  };

  /** Opening the week window puts any brush down, so a press on the plane behind it is a plain one. */
  const toggleWeek = () => {
    if (!weekOpen) setBrush(null);
    setWeekOpen(!weekOpen);
  };

  const onGesture = (g: Gesture) => {
    endTitleStep();
    switch (g.type) {
      case 'pan':
        stash.current = null;
        setCamera((c) => panBy(c, g.dx, g.dy));
        return;
      case 'pinch':
        stash.current = null;
        pinned.current = new Set();
        setCamera((c) => panBy(zoomAt(c, g.center, g.factor), g.dx, g.dy));
        return;
      case 'tap':
        if (g.target.kind === 'train') motionZoom(g.target.track);
        else if (g.target.kind === 'stop') complete(g.target.track, g.target.id);
        else if (g.target.kind === 'split') openEditor(g.target.id); // a secondary click that never moved
        else if (g.target.kind === 'bubble') tapBubble(g.target.track);
        else if (g.target.kind === 'tile') toggleBrush(g.target.tile);
        else if (
          g.target.kind === 'paper' ||
          g.target.kind === 'marquee' ||
          g.target.kind === 'selection' ||
          g.target.kind === 'brush'
        ) {
          setSelection(null);
          setEditing(null);
          setWeekOpen(false);
          // A tap elsewhere commits an open name. A touchscreen blurs only after this tap, so blur now.
          (document.activeElement as HTMLElement | null)?.blur();
          // A brush keeps the tray open; the step brushes place a stop where the tap fell.
          if (!brushRef.current) setTrayOpen(false);
          const b = brushRef.current;
          if (g.target.kind === 'brush' && (b === 'circle' || b === 'triangle' || b === 'square')) {
            store.begin();
            placeStop(b, g.at);
            store.end();
          }
        }
        return;
      case 'longPress':
        if (g.target.kind === 'stop') openEditor(g.target.id);
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
          const state = store.getState();
          // The goal's hold takes its line; the day's-end square's takes the day, and only the day.
          if (homeOf(state, open)) {
            store.dispatch({ type: 'delete', id: open, now: now() });
            setEditing(null);
          } else if (isDayEnd(state, open)) {
            store.dispatch({ type: 'clearDay', dayId: dayWith(state, open)!.id, now: now() });
            setEditing(null);
          }
        }
        return;
      }
      case 'dragStart':
        // Every move of a drag, and whatever its drop adds, is one step for undo.
        store.begin();
        startDrag(g);
        return;
      case 'dragMove':
        if (lineDraw.current) drawLineTo(g.at);
        else if (marquee.current) drawMarquee(g.at);
        else if (groupDrag.current) dragGroupTo(g.at);
        else if (drawing.current) drawSun(g.at);
        else if (endDrag.current) dragDayEnd(g.at);
        else if (originDrag.current) dragOriginTo(g.at);
        else if (splitDrag.current) carrySplit(g.at);
        else if (g.target.kind === 'tile') carryTile(g.at);
        else if (g.target.kind !== 'split') dragTo(g.at);
        return;
      case 'dragEnd':
        try {
          endDragGesture(g);
        } finally {
          store.end();
        }
        return;
      default:
        return; // the other gestures arrive with the tasks that use them
    }
  };

  /** Lets go of whatever the drag was carrying. */
  const endDragGesture = (g: Extract<Gesture, { type: 'dragEnd' }>) => {
    if (g.cancelled) {
      dropStroke();
      return;
    }
    if (lineDraw.current) {
      dropLine(g.at);
      return;
    }
    if (marquee.current) {
      dropMarquee(g.at);
      return;
    }
    if (groupDrag.current) {
      dragGroupTo(g.at);
      groupDrag.current = null;
      return;
    }
    if (drawing.current) {
      dropSun(g.at);
      return;
    }
    if (endDrag.current) {
      dropDayEnd(g.at);
      return;
    }
    if (originDrag.current) {
      dragOriginTo(g.at);
      originDrag.current = null;
      setLegTime(null);
      return;
    }
    if (g.target.kind === 'tile') {
      carryTile(g.at);
      dropTile();
      return;
    }
    if (g.target.kind === 'split') {
      carrySplit(g.at);
      dropSplit();
      return;
    }
    dragTo(g.at);
    if (dragging.current) joinOnRelease(dragging.current);
    dragging.current = null;
    setLegTime(null);
  };

  /**
   * A tap on a bubble cycles what its line points at, except a picture bubble, which flies out
   * until the whole line is in view: the picture is the goal, so there is nothing to cycle to by
   * sight, and the line is what you want to see.
   */
  const tapBubble = (trackId: string) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const stops = new Map(state.stops.map((s) => [s.id, s]));
    const i = targetIndex(track, stops, hiddenOnLife(state));
    const target = i === null ? undefined : stops.get(track.stops[i]);
    if (target?.image === undefined) store.dispatch({ type: 'cycleTarget', trackId });
    else if (track.life) flyToMarker(target);
    else fitLine(track.id);
  };

  /**
   * The squares the life line does not draw at the current zoom, which its bubble never points at:
   * from the 1-year unit up, the rings.
   */
  const hiddenOnLife = (state: World, scale = cameraRef.current.scale) => (id: string) =>
    gridFor(scale).seconds >= RINGS_HIDDEN_FROM && isRing(state, id);

  /** Flies to a life marker without ever landing wider than the 1-year unit, so the marker is drawn. */
  const flyToMarker = (marker: Point) => {
    const c = cameraRef.current;
    stash.current = null;
    pinned.current = new Set();
    fly(c, centerOn(c, marker, viewport, Math.max(c.scale, GRID_MIN_PX / YEAR)));
  };

  /** Flies out, never in, until the line's start and every stop on it are in view with room around them. */
  const fitLine = (trackId: string) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const stops = new Map(state.stops.map((s) => [s.id, s]));
    const points = [track.origin, ...track.stops.flatMap((id) => (stops.has(id) ? [stops.get(id)!] : []))];
    const c = cameraRef.current;
    // Leaving a followed train or a pinned level by this flight is the hand moving the camera.
    stash.current = null;
    pinned.current = new Set();
    const fit = fitPoints(c, points, viewport);
    // A project is not drawn past the 30-day unit, so the fit stops there rather than leaving it blank.
    if (!isProject(track) || fit.scale >= PROJECT_MIN_SCALE) return fly(c, fit);
    fly(c, centerOn(c, screenToWorld(fit, { x: viewport.w / 2, y: viewport.h / 2 }), viewport, PROJECT_MIN_SCALE));
  };

  /** A long press on a bubble flies to the stop it points at, keeping the current scale. */
  const flyToTarget = (trackId: string) => {
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const stops = new Map(state.stops.map((s) => [s.id, s]));
    const i = targetIndex(track, stops, hiddenOnLife(state));
    const target = i === null ? undefined : stops.get(track.stops[i]);
    if (!target) return;
    const c = cameraRef.current;
    fly(c, centerOn(c, target, viewport, c.scale));
  };

  /** The first tap on a train flies in to follow it; the next flies back to where you were. */
  const motionZoom = (trackId: string) => {
    const c = cameraRef.current;
    const back = stash.current;
    pinned.current = new Set();
    if (back) {
      stash.current = null;
      fly(c, back);
      return;
    }
    const state = store.getState();
    const track = state.tracks.find((t) => t.id === trackId);
    if (!track) return;
    // The day train is a shadow: it is where dayState says, not where its legs' own clock would be.
    const at = trainOn(routeOf(state, track, dayOf(now())), stateOf(track, state, now())).at;
    stash.current = c;
    fly(c, centerOn(c, at, viewport, MOTION_SCALE));
  };

  const byId = new Map(world.stops.map((s) => [s.id, s]));
  // The kept box wraps what the selection still names, with its margin, and follows the camera.
  const held = selection && bounds(world, selection);
  const keptBox =
    held &&
    (() => {
      const a = worldToScreen(camera, held);
      const b = worldToScreen(camera, { x: held.x + held.w, y: held.y + held.h });
      const r = rectOf(a, b);
      return { x: r.x - BOX_PAD_PX, y: r.y - BOX_PAD_PX, w: r.w + 2 * BOX_PAD_PX, h: r.h + 2 * BOX_PAD_PX };
    })();
  // The stop being named is kept too, so a zoom with its field open leaves the field a place to be.
  const shown = naming ? new Set([...pinned.current, naming.id]) : pinned.current;
  // Days after tomorrow live only in the week window.
  const views = world.tracks
    .filter((t) => drawnOnPlane(t, dayOf(time)))
    .map((t) => layoutTrack(t, world, camera, time, viewport, shown));
  const rolling = views.some((v) => !v.train.parked);
  // From the 3-month unit up a project is not drawn at all, its train included; only the life line remains.
  const farOut = gridFor(camera.scale).seconds >= PROJECTS_HIDDEN_FROM;

  useEffect(() => {
    if (!rolling) return;
    // Each tick also asks the world whether the day has turned over.
    const id = window.setInterval(() => {
      store.dispatch({ type: 'tick', now: now() });
      setTime(now());
    }, tickMsFor(camera.scale));
    return () => window.clearInterval(id);
  }, [rolling, camera.scale, now, store]);

  // The open week window keeps its now line and its blocks current even when every train is parked.
  useEffect(() => {
    if (!weekOpen) return;
    const id = window.setInterval(() => setTime(now()), WEEK_TICK_MS);
    return () => window.clearInterval(id);
  }, [weekOpen, now]);

  // Midnight turns the day over even when every train is parked and nothing else ticks.
  const [midnight, setMidnight] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => {
      store.dispatch({ type: 'tick', now: now() });
      setTime(now());
      setMidnight((n) => n + 1);
    }, Math.max(0, nextMidnight(now()) - now()));
    return () => window.clearTimeout(id);
  }, [midnight, now, store]);

  // A goal is a goal whichever line its button spoke for; the day's end is neither stop nor goal.
  const editedStop = editing ? byId.get(editing) : undefined;
  const editedHome = editing ? homeOf(world, editing) : undefined;
  const editedDayEnd = editing ? isDayEnd(world, editing) : false;
  // A chip per line the stop can leave, once it is on two or more; a square's home is not one.
  // The life line's last square is no goal, so a ring can leave it from any place on it.
  const onTracks = editing ? tracksOf(world, editing) : [];
  const lines =
    onTracks.length >= 2
      ? onTracks
          .filter(({ track, index }) => track.life || index !== track.stops.length - 1)
          .map(({ track }) => ({
            trackId: track.id,
            color: isShadow(track) ? null : track.color,
            // A chip is named by its line, so chips the same shape can be told apart by ear.
            name: track.life
              ? 'Life'
              : track.day
                ? dayName(track.day.date, time)
                : byId.get(track.stops[track.stops.length - 1])?.title || 'Unnamed',
          }))
      : [];
  const editor =
    editedStop && onTracks.length > 0 ? (
      <StopEditor
        key={editedStop.id}
        stop={editedStop}
        goal={editedHome !== undefined}
        dayEnd={editedDayEnd}
        done={editedStop.done}
        holding={holding}
        lines={lines}
        onEdit={(change) => {
          // Letters typed in one sitting are one step; a shape or size is a step of its own.
          if (change.title !== undefined && change.shape === undefined && change.size === undefined) {
            if (titleStep.current !== editedStop.id) {
              endTitleStep();
              store.begin();
              titleStep.current = editedStop.id;
            }
          } else endTitleStep();
          store.dispatch({ type: 'edit', id: editedStop.id, ...change });
        }}
        onPicture={(file) => {
          const id = editedStop.id;
          // A file the browser cannot read as an image leaves the goal as it was.
          picture(file)
            .then((image) => store.dispatch({ type: 'edit', id, image }))
            .catch(() => undefined);
        }}
        onDelete={() => {
          store.dispatch({ type: 'delete', id: editedStop.id, now: now() });
          setEditing(null);
        }}
        onUndo={() => {
          store.dispatch({ type: 'undo', stopId: editedStop.id, now: now() });
          setEditing(null);
        }}
        onLeave={(trackId) => {
          store.dispatch({ type: 'leave', trackId, stopId: editedStop.id, now: now() });
          // Leaving its last project deletes the stop. The editor is gone with it; clearing
          // `editing` is bookkeeping, so it never points at a deleted id.
          if (!store.getState().stops.some((s) => s.id === editedStop.id)) setEditing(null);
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
    const i = track ? targetIndex(track, byId, hiddenOnLife(world, camera.scale)) : null;
    const target = track && i !== null ? byId.get(track.stops[i]) : undefined;
    if (!track || !target) return [];
    // The life train waiting at the square its bubble points at fills the bubble, as the soonest line's is.
    const filled = track.life ? (() => {
          const state = stateOf(track, world, time);
          return i === state.leg && state.waiting;
        })() : v.id === soonest?.id;
    // The stop may be off the grown viewport and so missing from the view: use its world point.
    const spot = bubbleFor(worldToScreen(camera, target), viewport);
    const at = spot && clearOf(spot, HISTORY_CORNER_PX);
    return at
      ? [
          <Bubble
            key={v.id}
            track={v.id}
            color={v.color}
            day={v.day && !v.tomorrow}
            sketch={v.sketch || v.tomorrow}
            life={track.life !== undefined}
            soonest={filled}
            shape={target.shape}
            title={target.title}
            image={target.image}
            {...at}
          />,
        ]
      : [];
  });
  const hud = (
    <>
      {/* The legend is a solid plate and takes no input: drawn first, it lies under any bubble in its corner. */}
      <Legend camera={camera} />
      {bubbles}
      {legTime && <LegTime {...legTime} />}
      {editor}
      <History canUndo={store.canUndo()} canRedo={store.canRedo()} onUndo={() => history('undo')} onRedo={() => history('redo')} />
      <Tray
        open={trayOpen}
        brush={brush}
        onToggle={() => {
          // Closing the tray puts the brush down with it.
          if (trayOpen) setBrush(null);
          setTrayOpen(!trayOpen);
        }}
        onBrushKey={toggleBrush}
      />
      {nameField}
    </>
  );

  // Each stop once, and its name set beside it on the side that covers least.
  const placedStops = stopsOnce(views, lifeOf(world)?.id);
  const places = labelPlaces(placedStops, views);

  // The week window and its button sit beside the plane, not in it, so neither a press nor a wheel
  // on them ever reaches the map.
  return (
    <>
      <Plane onGesture={onGesture} onZoom={onZoom} hud={hud} brush={brush}>
        <Grid camera={camera} />
        {marqueeBox ? <SelectionBox rect={marqueeBox} live /> : keptBox && <SelectionBox rect={keptBox} live={false} />}
        {views.filter((v) => !farOut || v.day || v.life).map((v) => (
          <Track key={v.id} view={v} />
        ))}
        {placedStops.map((p) => (
          <Stop key={p.stop.id} {...p} place={places.get(p.stop.id) ?? null} />
        ))}
        {ghost && <Ghost {...ghost} />}
        {dayGhost && <DayGhost points={dayGhost} />}
      </Plane>
      {weekOpen && <WeekWindow store={store} now={time} clock={now} />}
      <WeekButton open={weekOpen} onToggle={toggleWeek} />
    </>
  );
}
