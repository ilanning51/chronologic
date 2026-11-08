import { crowdAt } from '../model/crowd';
import { drawnOnPlane, isProject } from '../model/day';
import { addDays, dayOf } from '../model/days';
import { tracksOf } from '../model/reducer';
import { nextIndex, stateOf } from '../model/train';
import type { Shape, Size, Track, World } from '../model/types';
import { type Camera, worldToScreen } from './camera';
import { CLIP_MARGIN_PX, clipSegment } from './clip';
import type { Point } from './geometry';
import { gridFor } from './grid';
import { labelsWithRoom } from './labels';
import { PROJECTS_HIDDEN_FROM, RINGS_HIDDEN_FROM, showsAt } from './level';
import { roundLine, shiftLine } from './draw';
import { lanesOf, routeOf } from './metro';
import { cutAt, pathLength, pointAlong } from './routing';
import { BEND_CUT_PX, LANE_PX } from './world';

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
  /** A done square on the life line: a small ink square that keeps its name. */
  landmark: boolean;
  /** On two or more lines and not done: an interchange, drawn as a ring. */
  ring: boolean;
  /**
   * Where this line's lane crosses the stop, square across the road it shares there: the stop's
   * own point moved by the line's lane arriving, or leaving where that lane is wider. The stop's
   * own point when the line has the road alone.
   */
  lane: Point;
  /** Dots of crowd, only on the stop the train waits at. */
  crowd: number;
}

export interface TrainView {
  x: number;
  y: number;
  angle: number;
  waiting: boolean;
  parked: boolean;
  /** The life train waiting at a project's goal on the life line: not drawn, so the goal reads as its project's. */
  underGoal: boolean;
}

export interface TrackView {
  id: string;
  color: number;
  finished: boolean;
  /** The day line, drawn in ink. */
  day: boolean;
  /** Tomorrow's day line: drawn like a sketch, muted and thin, its train waiting at its start. */
  tomorrow: boolean;
  /** The life line, drawn in ink and wider, edge to edge. */
  life: boolean;
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
 * Wide enough, whole lines go: a project line draws nothing from the 3-month unit up, and the
 * life line drops its rings from the 1-year unit up, keeping bare markers and done squares.
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
  const width = lanes?.width ?? shift.map(() => 1);
  const line = roundLine(
    shiftLine(
      route.vertices.map((v) => worldToScreen(camera, v)),
      route.stationAt,
      shift.map((o) => ({ x: o.x * LANE_PX, y: o.y * LANE_PX })),
      width.map((n) => ((n - 1) / 2) * LANE_PX),
    ),
    BEND_CUT_PX,
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
  const gridSeconds = gridFor(camera.scale).seconds;
  const hidden = isProject(track) && gridSeconds >= PROJECTS_HIDDEN_FROM;
  // The life line runs the whole width of the view at its height, whatever its stops: its first
  // and last segments are carried out to the clip bounds, on either side of the train.
  const reach = (points: Point[], side: 'left' | 'right'): Point[] => {
    if (!track.life) return points;
    const from = side === 'left' ? points[0] : points[points.length - 1];
    const x = side === 'left' ? Math.min(grown.x, from.x) : Math.max(grown.x + grown.w, from.x);
    const end = { x, y: from.y };
    return side === 'left' ? [end, ...points] : [...points, end];
  };
  const trailing = cut.ahead.length > 0 ? cut.ahead : cut.behind.slice(-1);
  const behind = hidden ? [] : toSegments(reach(cut.behind, 'left'));
  const segments = hidden ? [] : toSegments(reach(trailing, 'right'));
  const crowd = state.waiting ? crowdAt(track, byId, now) : 0;

  const next = nextIndex(track, byId);
  const goalIndex = track.stops.length - 1;
  // A stop on this line alone sits in the line's lane. A stop on several sits on its own point,
  // which is the middle of any ribbon through it, since lanes are centred on the road.
  const laneAt = (station: number): Point => {
    const v = route.stationAt[station];
    const sides = [shift[v - 1], shift[v]].filter((o): o is Point => o !== undefined);
    const widest = sides.reduce((a, b) => (Math.hypot(b.x, b.y) > Math.hypot(a.x, a.y) + 1e-6 ? b : a), { x: 0, y: 0 });
    const own = worldToScreen(camera, route.vertices[v]);
    return { x: own.x + widest.x * LANE_PX, y: own.y + widest.y * LANE_PX };
  };
  const linesAt = (id: string) => tracksOf(world, id).filter(({ track: t }) => drawnOnPlane(t, today)).length;
  const placed = track.stops.flatMap((id, index) => {
    if (hidden) return [];
    const stop = byId.get(id)!;
    if (track.life && gridSeconds >= RINGS_HIDDEN_FROM && !stop.done && tracksOf(world, id).some(({ track: t }) => isProject(t))) return [];
    const at = linesAt(id) >= 2 ? worldToScreen(camera, stop) : line.points[line.stationAt[index + 1]];
    const shown = index === next || index === goalIndex || pinned.has(id) || showsAt(stop.shape, stop.size, gridSeconds);
    return inside(at) && shown ? [{ stop, at, index }] : [];
  });
  const always = new Set<string>();
  for (const p of placed) {
    if (p.index === goalIndex || p.index === next || (track.life && p.stop.done)) always.add(p.stop.id);
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
    projectGoal: index === goalIndex && isProject(track),
    terminus: index === goalIndex && isProject(track) && stop.done,
    landmark: track.life !== undefined && stop.done,
    // The life line is no line to change trains on: its square is its project's goal, drawn as one.
    ring: !stop.done && tracksOf(world, stop.id).filter(({ track: t }) => !t.life && drawnOnPlane(t, today)).length >= 2,
    lane: laneAt(index + 1),
    crowd: index === state.leg ? crowd : 0,
  }));

  const drawn = leg ? pointAlong(line.points, leg.from, leg.to, share) : { at: line.points[last], angle: state.angle };
  const trainAt = drawn.at;
  // The life train waiting at a project's goal, while that goal is drawn, stands beneath it unseen:
  // the goal is its project's, drawn as it would be lying on the line.
  const waitsAt = state.waiting && !state.parked ? track.stops[state.leg] : undefined;
  const underGoal =
    track.life !== undefined &&
    waitsAt !== undefined &&
    gridSeconds < RINGS_HIDDEN_FROM &&
    tracksOf(world, waitsAt).some(({ track: t }) => isProject(t));
  const train: TrainView = { x: trainAt.x, y: trainAt.y, angle: drawn.angle, waiting: state.waiting, parked: state.parked, underGoal };

  return {
    id: track.id,
    color: track.color,
    finished: state.parked && !track.life,
    day: track.day !== undefined,
    tomorrow: track.day !== undefined && track.day.date === addDays(today, 1),
    life: track.life !== undefined,
    sketch: isProject(track) && track.stops.length === 1,
    segments,
    behind,
    origin: line.points[0],
    stops,
    train,
    anyInView: segments.length > 0 || behind.length > 0 || stops.length > 0 || !hidden && inside(trainAt),
  };
}
