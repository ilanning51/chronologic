import { describe, expect, it } from 'vitest';
import { isProject, isShadow } from './day';
import { withDay, withLife } from '../test/fixtures';

describe('the three kinds of track', () => {
  const world = withLife();
  const plain = world.tracks.find((t) => !t.day && !t.life)!;
  const life = world.tracks.find((t) => t.life)!;
  const day = withDay().tracks.find((t) => t.day)!;

  it('calls only a plain track a project', () => {
    expect(isProject(plain)).toBe(true);
    expect(isProject(day)).toBe(false);
    expect(isProject(life)).toBe(false);
  });

  it('calls the day and the life line shadows, and a plain track not', () => {
    expect(isShadow(day)).toBe(true);
    expect(isShadow(life)).toBe(true);
    expect(isShadow(plain)).toBe(false);
  });
});

describe('withLife', () => {
  it('lists its ring on one project and on the life line, beside two bare markers', () => {
    const world = withLife();
    const life = world.tracks.filter((t) => t.life);
    expect(life).toHaveLength(1);
    const listing = (id: string) => world.tracks.filter((t) => t.stops.includes(id));
    const onLife = life[0].stops;
    const rings = onLife.filter((id) => listing(id).length === 2);
    const markers = onLife.filter((id) => listing(id).length === 1);
    expect(rings).toHaveLength(1);
    expect(markers).toHaveLength(2);
    expect(listing(rings[0]).filter((t) => !t.life)).toHaveLength(1);
  });
});
