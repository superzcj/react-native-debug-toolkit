import { layoutRadialActions } from '../../ui/floating/radialActions';

function rectanglesOverlap(a: { left: number; top: number; right: number; bottom: number }, b: typeof a): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

describe('layoutRadialActions', () => {
  test('keeps every five-action card inside a corner viewport without overlap', () => {
    const cards = layoutRadialActions({
      origin: { x: 256, y: 20 },
      viewport: { width: 320, height: 568 },
      count: 5,
    });

    expect(cards).toHaveLength(5);
    expect(cards.every((card) => card.mode === 'radial')).toBe(true);
    for (const card of cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.top).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(320);
      expect(card.bottom).toBeLessThanOrEqual(568);
      expect(card.width).toBeGreaterThanOrEqual(48);
      expect(card.height).toBeGreaterThanOrEqual(72);
    }
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        expect(rectanglesOverlap(cards[i]!, cards[j]!)).toBe(false);
      }
    }
  });

  test('uses a compact inward fan for a mid-side launcher', () => {
    const cards = layoutRadialActions({
      origin: { x: 256, y: 250 },
      viewport: { width: 320, height: 568 },
      count: 3,
    });

    expect(cards).toHaveLength(3);
    expect(Math.max(...cards.map((card) => card.right))).toBeLessThan(256);
    expect(Math.min(...cards.map((card) => card.left))).toBeGreaterThanOrEqual(0);
  });

  test('reports the visible orb center separately from the label card center', () => {
    const card = layoutRadialActions({
      origin: { x: 256, y: 20 },
      viewport: { width: 320, height: 568 },
      count: 1,
    })[0]!;

    expect(card.orbCenterX).toBe(card.centerX);
    expect(card.orbCenterY).toBe(card.top + 29);
    expect(card.orbCenterY).not.toBe(card.centerY);
  });

  test('falls back to a usable grid when a tiny viewport cannot fit the arc', () => {
    const cards = layoutRadialActions({
      origin: { x: 19, y: 136 },
      viewport: { width: 86, height: 320 },
      count: 5,
    });

    expect(cards).toHaveLength(5);
    expect(cards.every((card) => card.mode === 'grid')).toBe(true);
    expect(cards.every((card) => card.left >= 0 && card.top >= 0 && card.right <= 86)).toBe(true);
    // The fallback is scrollable and does not compress targets to fit the window.
    expect(cards[4]!.bottom).toBeGreaterThan(320);
    for (let i = 1; i < cards.length; i += 1) expect(cards[i]!.top).toBeGreaterThanOrEqual(cards[i - 1]!.bottom);
  });
});

test.each([
  [16, 16], [256, 16], [16, 504], [256, 504], [16, 240], [256, 240],
])('five full action targets avoid clipping and each other at %i,%i', (x, y) => {
  const cards = layoutRadialActions({ origin: { x, y }, viewport: { width: 320, height: 568 }, count: 5 });
  expect(cards.every(card => card.mode === 'radial')).toBe(true);
  for (const card of cards) {
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(320);
    expect(card.top).toBeGreaterThanOrEqual(0);
    expect(card.bottom).toBeLessThanOrEqual(568);
    expect(rectanglesOverlap(card, { left: x, top: y, right: x + 48, bottom: y + 48 })).toBe(false);
  }
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) expect(rectanglesOverlap(cards[i]!, cards[j]!)).toBe(false);
  }
});

// The circles, rather than their labels, follow the arc around the launcher.
test('visible orbs share a radius and leave room for selected feedback at screen edges', () => {
  for (const origin of [{ x: 16, y: 16 }, { x: 256, y: 16 }, { x: 256, y: 504 }]) {
    const cards = layoutRadialActions({ origin, viewport: { width: 320, height: 568 }, count: 5 });
    expect(cards.every(card => card.mode === 'radial')).toBe(true);
    const radii = cards.map(card => Math.hypot(card.orbCenterX - origin.x - 24, card.orbCenterY - origin.y - 24));
    for (const radius of radii) expect(radius).toBeCloseTo(radii[0]!, 5);
    for (const card of cards) {
      const selectedRadius = 42 / 2 * 1.06;
      expect(card.orbCenterX - selectedRadius).toBeGreaterThanOrEqual(8);
      expect(card.orbCenterY - selectedRadius).toBeGreaterThanOrEqual(8);
      expect(card.orbCenterX + selectedRadius).toBeLessThanOrEqual(312);
      expect(card.orbCenterY + selectedRadius).toBeLessThanOrEqual(560);
    }
  }
});
