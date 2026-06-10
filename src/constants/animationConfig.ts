const config = {
  panel: {
    springFriction: 10,
    springTension: 85,
    backdropDuration: 250,
    backdropOpacity: 0.5,
  },
  tab: {
    fadeOutDuration: 80,
    fadeInDuration: 150,
    slideDuration: 200,
    staggerDelay: 30,
    maxStaggerItems: 15,
  },
  fab: {
    breathDuration: 1500,
    breathScaleMin: 0.97,
    pressScale: 0.94,
    edgeSnapFriction: 7,
    edgeSnapTension: 40,
  },
  badge: {
    bounceScale: 1.3,
    tension: 300,
    friction: 3,
  },
  logItem: {
    tapScale: 1.02,
    tapDuration: 100,
    detailFadeDelay: 50,
    expandFriction: 9,
    expandTension: 60,
  },
  reduceMotion: {
    maxDuration: 200,
  },
  search: {
    slideDuration: 200,
  },
  filter: {
    fadeOutDuration: 150,
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
