import { describe, expect, it } from 'vitest';
import { ROUTES, canonical, clean, findRoute, fromOldHash } from './routes';

describe('routes', () => {
  it('treats a trailing slash as the same page', () => {
    expect(clean('/help/')).toBe('/help');
    expect(clean('/')).toBe('/');
    expect(clean('')).toBe('/');
    expect(findRoute('/privacy/')?.path).toBe('/privacy');
  });

  it('gives the guides list its folder address', () => {
    expect(canonical('/guides')).toBe('/guides/');
    expect(canonical('/help')).toBe('/help');
    expect(findRoute('/guides/')?.path).toBe('/guides');
  });

  it('turns old hash links into real addresses', () => {
    expect(fromOldHash('#/help')).toBe('/help');
    expect(fromOldHash('#/')).toBe('/');
    expect(fromOldHash('#/how')).toBe('/#how');
    expect(fromOldHash('#main')).toBeNull();
    expect(fromOldHash('')).toBeNull();
  });

  it('gives every page its own title and description', () => {
    const titles = new Set(ROUTES.map((r) => r.title));
    const paths = new Set(ROUTES.map((r) => r.path));
    expect(titles.size).toBe(ROUTES.length);
    expect(paths.size).toBe(ROUTES.length);
    for (const r of ROUTES) {
      expect(r.description.length).toBeGreaterThan(20);
      expect(r.description.length).toBeLessThan(170);
    }
  });
});
