import { crowdAt } from '../model/crowd';
import { drawnOnPlane } from '../model/day';
import { addDays, dayOf } from '../model/days';
import { tracksOf } from '../model/reducer';
import { nextIndex, stateOf } from '../model/train';
import type { Shape, Size, Track, World } from '../model/types';
import { type Camera, worldToScreen } from './camera';
import { CLIP_MARGIN_PX, clipSegment } from './clip';
import type { Point } from './geometry';
import { gridFor } from './grid';
import { labelsWithRoom } from './labels';
import { showsAt } from './level';
import { roundLine, shiftLine } from './draw';
import { lanesOf, routeOf } from './metro';
import { cutAt, pathLength, pointAlong } from './routing';
import { BEND_PX, LANE_PX } from './world';

export interface StopView {
  id: string;
  x: number;
  y: number;
  shape: Shape;
  size: Size;
  done: boolean;
  title: string;
  /** A goal's picture, drawn as its mural. */
  image?: string;
  label: boolean;
  next: boolean;
  goal: boolean;
  /** The goal of a project line, done or not: its name is set in bold capitals. */
  projectGoal: boolean;
  /** A project's goal, done: a terminus, drawn as a large ink dot that keeps its name. */
  terminus: boolean;
  /** On two or more lines and not done: an interchange, drawn as a ring. */
  ring: boolean;
  /** Dots of crowd, only on the stop the train waits at. */
  crowd: number;
}

export interface TrainView {
  x: number;
  y: number;
  angle: number;
  waiting: boolean;
  parked: boolean;
}

export interface TrackView {
  id: string;
  color: number;
  finished: boolean;
  /** The day line, drawn in ink. */
  day: boolean;
  /** Tomorrow's day line: drawn like a sketch, muted and thin, its train waiting at its start. */
  tomorrow: boolean;
  /** A project line with only its goal, drawn muted and thin. A look, not a state. */
  sketch: boolean;
  /** The road still to come, from the train to the goal, in the line's colour. */
  segments: [Point, Point][];
  /** The road travelled, from the start to the train, drawn muted. */
  behind: [Point, Point][];
  /** The start of the line, in screen pixels: a drag handle with nothing drawn at it. */
  origin: Point;
  stops: StopView[];
  train: TrainView;
  anyInView: boolean;
}

/**
 * Turns a track, the camera and the clock into screen pixels, ready to paint. Only the
 * positions scale with zoom. Segments are cut to the viewport plus a margin and stops
 * outside it are left out, so a month of track at full zoom never reaches the renderer.
 * Stops below the grid's level are left out too, as a map leaves out streets from far away,
 * except the next stop, the goal and any id in `pinned`; the line still routes through them.
 */
export function layoutTrack(
  track: Track,
  world: World,
  camera: Camera,
  now: number,
  viewport: { w: number; h: number },
  pinned: Set<string> = new Set(),
): TrackView {
  const byId = new Map(world.stops.map((s) => [s.id, s]));
  const today = dayOf(now);
  const grown = {
    x: -CLIP_MARGIN_PX,
    y: -CLIP_MARGIN_PX,
    w: viewport.w + 2 * CLIP_MARGIN_PX,
    h: viewport.h + 2 * CLIP_MARGIN_PX,
  };
  const inside = (p: Point) => p.x >= grown.x && p.x <= grown.x + grown.w && p.y >= grown.y && p.y <= grown.y + grown.h;

  // The line as the map draws it, in screen pixels: its chosen bends, its lane wherever it shares
  // a road, and every bend rounded. A line not on the plane has the road to itself.
  const lanes = lanesOf(world, today).get(track.id);
  const route = lanes?.route ?? routeOf(world, track, today);
  const shift = lanes?.shift ?? route.vertices.slice(1).map(() => ({ x: 0, y: 0 }));
  const line = roundLine(
    shiftLine(
      route.vertices.map((v) => worldToScreen(camera, v)),
      route.stationAt,
      shift.map((o) => ({ x: o.x * LANE_PX, y: o.y * LANE_PX })),
    ),
    BEND_PX,
  );
  const state = stateOf(track, world, now);

  // The train is the share of its leg's length the clock has run, along the leg as drawn. The
  // line is cut there: behind it is travelled, ahead is still to come. A parked train has
  // travelled it all, and stands at its last stop.
  const last = line.stationAt[line.stationAt.length - 1];
  const leg = state.parked ? null : { from: line.stationAt[state.leg], to: line.stationAt[state.leg + 1] };
  const share = (() => {
    if (!leg) return 1;
    const planned = pathLength(route.vertices, route.stationAt[state.leg], route.stationAt[state.leg + 1]);
    return planned === 0 ? 1 : state.seconds / planned;
  })();
  const cut = leg
    ? cutAt(line.points, leg.from, leg.to, share * pathLength(line.points, leg.from, leg.to))
    : { behind: line.points, ahead: [] };
  const toSegments = (shown: Point[]): [Point, Point][] => {
    const out: [Point, Point][] = [];
    for (let i = 1; i < shown.length; i++) {
      const clipped = clipSegment(shown[i - 1], shown[i], grown);
      if (clipped) out.push(clipped);
    }
    return out;
  };
  const behind = toSegments(cut.behind);
  const segments = toSegments(cut.ahead);
  const crowd = state.waiting ? crowdAt(track, byId, now) : 0;

  const next = nextIndex(track, byId);
  const goalIndex = track.stops.length - 1;
  const gridSeconds = gridFor(camera.scale).seconds;
  // A stop on this line alone sits in the line's lane. A stop on several sits on its own point,
  // which is the middle of any ribbon through it, since lanes are centred on the road.
  const linesAt = (id: string) => tracksOf(world, id).filter(({ track: t }) => drawnOnPlane(t, today)).length;
  const placed = track.stops.flatMap((id, index) => {
    const stop = byId.get(id)!;
    const at = linesAt(id) >= 2 ? worldToScreen(camera, stop) : line.points[line.stationAt[index + 1]];
    const shown = index === next || index === goalIndex || pinned.has(id) || showsAt(stop.shape, stop.size, gridSeconds);
    return inside(at) && shown ? [{ stop, at, index }] : [];
  });
  const always = new Set<string>();
  for (const p of placed) {
    if (p.index === goalIndex || p.index === next) always.add(p.stop.id);
  }
  const labeled = labelsWithRoom(placed.map((p) => ({ id: p.stop.id, x: p.at.x })), always);
  const stops: StopView[] = placed.map(({ stop, at, index }) => ({
    id: stop.id,
    x: at.x,
    y: at.y,
    shape: stop.shape,
    size: stop.size,
    done: stop.done,
    title: stop.title,
    ...(stop.image !== undefined ? { image: stop.image } : {}),
    label: labeled.has(stop.id),
    next: index === next,
    goal: index === goalIndex,
    projectGoal: index === goalIndex && !track.day,
    terminus: index === goalIndex && !track.day && stop.done,
    ring: !stop.done && linesAt(stop.id) >= 2,
    crowd: index === state.leg ? crowd : 0,
  }));

  const drawn = leg ? pointAlong(line.points, leg.from, leg.to, share) : { at: line.points[last], angle: state.angle };
  const trainAt = drawn.at;
  const train: TrainView = { x: trainAt.x, y: trainAt.y, angle: drawn.angle, waiting: state.waiting, parked: state.parked };

  return {
    id: track.id,
    color: track.color,
    finished: state.parked,
    day: track.day !== undefined,
    tomorrow: track.day !== undefined && track.day.date === addDays(today, 1),
    sketch: !track.day && track.stops.length === 1,
    segments,
    behind,
    origin: line.points[0],
    stops,
    train,
    anyInView: segments.length > 0 || behind.length > 0 || stops.length > 0 || inside(trainAt),
  };
}
