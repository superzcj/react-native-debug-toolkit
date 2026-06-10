const config = {
  panel: {
    springFriction: 8,
    springTension: 100,
    backdropDuration: 300,
    backdropOpacity: 0.6,
  },
  tab: {
    fadeOutDuration: 120,
    fadeInDuration: 200,
    slideDuration: 280,
    staggerDelay: 50,
    maxStaggerItems: 15,
  },
  fab: {
    breathDuration: 1200,
    breathScaleMin: 0.90,
    pressScale: 0.88,
    edgeSnapFriction: 6,
    edgeSnapTension: 50,
  },
  badge: {
    bounceScale: 1.6,
    tension: 400,
    friction: 2,
  },
  logItem: {
    tapScale: 1.06,
    tapDuration: 150,
    detailFadeDelay: 80,
    expandFriction: 7,
    expandTension: 80,
  },
  reduceMotion: {
    maxDuration: 200,
  },
  search: {
    slideDuration: 280,
  },
  filter: {
    fadeOutDuration: 200,
  },
} as const;

type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

type AnimationConfig = DeepReadonly<typeof config>;

function capDuration(duration: number, reduceMotion: boolean): number {
  return reduceMotion ? Math.min(duration, config.reduceMotion.maxDuration) : duration;
}

export function getPanelConfig(reduceMotion: boolean) {
  return {
    ...config.panel,
    backdropDuration: capDuration(config.panel.backdropDuration, reduceMotion),
    useSpring: !reduceMotion,
  };
}

export function getTabConfig(reduceMotion: boolean) {
  return {
    ...config.tab,
    fadeOutDuration: capDuration(config.tab.fadeOutDuration, reduceMotion),
    fadeInDuration: capDuration(config.tab.fadeInDuration, reduceMotion),
    slideDuration: capDuration(config.tab.slideDuration, reduceMotion),
    staggerDelay: reduceMotion ? 0 : config.tab.staggerDelay,
    useStagger: !reduceMotion,
  };
}

export function getFabConfig(reduceMotion: boolean) {
  return {
    ...config.fab,
    breathDuration: capDuration(config.fab.breathDuration, reduceMotion),
    useBreathing: !reduceMotion,
  };
}

export function getBadgeConfig() {
  return config.badge;
}

export function getLogItemConfig(reduceMotion: boolean) {
  return {
    ...config.logItem,
    tapDuration: capDuration(config.logItem.tapDuration, reduceMotion),
    detailFadeDelay: reduceMotion ? 0 : config.logItem.detailFadeDelay,
    useSpring: !reduceMotion,
  };
}

export function getSearchConfig(reduceMotion: boolean) {
  return {
    ...config.search,
    slideDuration: capDuration(config.search.slideDuration, reduceMotion),
  };
}

export function getFilterConfig(reduceMotion: boolean) {
  return {
    ...config.filter,
    fadeOutDuration: capDuration(config.filter.fadeOutDuration, reduceMotion),
  };
}

export default config as AnimationConfig;
