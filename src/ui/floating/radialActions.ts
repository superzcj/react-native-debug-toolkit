export const MAX_RADIAL_ACTIONS = 5;
export const ACTION_HIT_SIZE = 52;
const ACTION_CARD_WIDTH = 72;
const ACTION_CARD_HEIGHT = 76;
const ACTION_GAP = 8;

export interface RadialActionLayoutInput {
  origin: { x: number; y: number };
  viewport: { width: number; height: number };
  count: number;
  launcherSize?: number;
}

export interface RadialActionLayout {
  index: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  angle: number;
  mode: 'radial' | 'grid';
}

function makeCard(index: number, centerX: number, centerY: number, width: number, height: number,
  angle: number, mode: RadialActionLayout['mode']): RadialActionLayout {
  return {
    index,
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    width,
    height,
    centerX,
    centerY,
    angle,
    mode,
  };
}

function contains(card: RadialActionLayout, viewport: RadialActionLayoutInput['viewport']): boolean {
  return card.left >= 0 && card.top >= 0
    && card.right <= viewport.width && card.bottom <= viewport.height;
}

function overlaps(a: RadialActionLayout, b: RadialActionLayout): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function overlapsLauncher(card: RadialActionLayout, centerX: number, centerY: number, size: number): boolean {
  const launcher = makeCard(-1, centerX, centerY, size, size, 0, 'radial');
  return overlaps(card, launcher);
}

function validCards(cards: RadialActionLayout[], viewport: RadialActionLayoutInput['viewport'],
  centerX: number, centerY: number, launcherSize: number, origin: RadialActionLayoutInput['origin']): boolean {
  if (!cards.every((card) => contains(card, viewport))) return false;
  if (cards.some((card) => overlapsLauncher(card, centerX, centerY, launcherSize))) return false;
  // Keep the fan on the inside of the nearest screen edge. This gives the
  // launcher a stable emphasis and avoids a card straddling its outer side.
  const distanceToHorizontalEdge = Math.min(centerX, viewport.width - centerX);
  const distanceToVerticalEdge = Math.min(centerY, viewport.height - centerY);
  const isCorner = Math.abs(distanceToHorizontalEdge - distanceToVerticalEdge) < launcherSize * 1.5;
  if (!isCorner && distanceToHorizontalEdge <= distanceToVerticalEdge) {
    const onRight = centerX >= viewport.width / 2;
    if (onRight && cards.some((card) => card.right > origin.x + 0.01)) return false;
    if (!onRight && cards.some((card) => card.left < origin.x + launcherSize - 0.01)) return false;
  } else if (!isCorner) {
    const onBottom = centerY >= viewport.height / 2;
    if (onBottom && cards.some((card) => card.bottom > origin.y + launcherSize + 0.01)) return false;
    if (!onBottom && cards.some((card) => card.top < origin.y - 0.01)) return false;
  }
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      if (overlaps(cards[i]!, cards[j]!)) return false;
    }
  }
  return true;
}

function radialLayout(input: Required<RadialActionLayoutInput>): RadialActionLayout[] | null {
  const centerX = input.origin.x + input.launcherSize / 2;
  const centerY = input.origin.y + input.launcherSize / 2;
  const towardViewport = Math.atan2(input.viewport.height / 2 - centerY, input.viewport.width / 2 - centerX);
  const preferred = Number.isFinite(towardViewport) ? towardViewport : -Math.PI / 2;
  const maxRadius = Math.min(384, Math.hypot(input.viewport.width, input.viewport.height));
  const count = Math.max(1, Math.min(MAX_RADIAL_ACTIONS, Math.floor(input.count)));
  const spans = count === 1 ? [0] : [150, 130, 110, 90, 70];
  const inward = centerX > input.viewport.width / 2 ? Math.PI : 0;
  const diagonal = centerX > input.viewport.width / 2
    ? (centerY > input.viewport.height / 2 ? -3 * Math.PI / 4 : 3 * Math.PI / 4)
    : (centerY > input.viewport.height / 2 ? -Math.PI / 4 : Math.PI / 4);
  // Bounded candidates avoid searching thousands of almost identical fans per frame.
  const orientations = [inward, diagonal, preferred, preferred - Math.PI / 12, preferred + Math.PI / 12,
    preferred - Math.PI / 6, preferred + Math.PI / 6];

  for (let radius = 80; radius <= maxRadius; radius += 8) {
    for (const spanDegrees of spans) {
      for (const orientation of orientations) {
        const span = spanDegrees * Math.PI / 180;
        const cards = Array.from({ length: count }, (_, index) => {
          const angle = orientation - span / 2 + (count === 1 ? 0 : span * index / (count - 1));
          return makeCard(index, centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius,
            ACTION_CARD_WIDTH, ACTION_CARD_HEIGHT, angle, 'radial');
        });
        if (validCards(cards, input.viewport, centerX, centerY, input.launcherSize, input.origin)) return cards;
      }
    }
  }
  return null;
}

function gridLayout(input: Required<RadialActionLayoutInput>): RadialActionLayout[] {
  const count = Math.max(1, Math.min(MAX_RADIAL_ACTIONS, Math.floor(input.count)));
  const availableWidth = Math.max(48, input.viewport.width);
  const columns = Math.max(1, Math.min(count,
    Math.floor((availableWidth + ACTION_GAP) / (ACTION_CARD_WIDTH + ACTION_GAP))));
  const width = Math.max(48, Math.min(ACTION_CARD_WIDTH,
    (availableWidth - ACTION_GAP * (columns - 1)) / columns));
  const height = ACTION_CARD_HEIGHT;
  
  const gridWidth = columns * width + (columns - 1) * ACTION_GAP;
  const left = Math.max(0, (input.viewport.width - gridWidth) / 2);
  // Grid coordinates live inside a scroll container, not the window.
  const top = ACTION_GAP;
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cardLeft = left + column * (width + ACTION_GAP);
    const cardTop = top + row * (height + ACTION_GAP);
    return makeCard(index, cardLeft + width / 2, cardTop + height / 2, width, height, 0, 'grid');
  });
}

export function layoutRadialActions(input: RadialActionLayoutInput): RadialActionLayout[] {
  if (input.count <= 0 || input.viewport.width <= 0 || input.viewport.height <= 0) return [];
  const normalized: Required<RadialActionLayoutInput> = {
    ...input,
    count: Math.min(MAX_RADIAL_ACTIONS, Math.floor(input.count)),
    launcherSize: input.launcherSize ?? 48,
  };
  return radialLayout(normalized) ?? gridLayout(normalized);
}
