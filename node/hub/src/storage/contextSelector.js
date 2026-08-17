'use strict';

const { isValidTimestampMs, parseIsoInstant, toIsoInstant } = require('../protocol/time');

const PREVIEW_CHAR_LIMIT = 1024;
const DEFAULT_MAX_EVENTS = 200;
const DEFAULT_ERROR_LIMIT = 50;
const DEFAULT_ADJACENT = 3;

function remember(list, value, limit) {
  list.push(value);
  if (list.length > limit) {
    list.shift();
  }
}

function eventTimeMs(event, timeBasis) {
  if (timeBasis === 'event') {
    return isValidTimestampMs(event.timestamp) ? event.timestamp : NaN;
  }
  if (timeBasis === 'received') {
    return parseIsoInstant(event.receivedAt) ?? NaN;
  }
  return NaN;
}

function eventMatchesWindow(event, options = {}) {
  const {
    sinceMs = -Infinity,
    untilMs = Infinity,
    timeBasis = 'event',
    throughSequence = Infinity,
  } = options;
  if (timeBasis !== 'event' && timeBasis !== 'received') {
    return false;
  }
  if (Number.isFinite(throughSequence) && event.sequence > throughSequence) {
    return false;
  }
  const time = eventTimeMs(event, timeBasis);
  if (!Number.isFinite(time)) {
    return false;
  }
  return sinceMs <= time && time <= untilMs;
}

function isFailureAnchor(event) {
  return event.severity === 'error'
    || event.severity === 'fatal'
    || (event.type === 'network'
      && Boolean(event.data?.error || Number(event.data?.response?.status) >= 400));
}

function projectContextEvent(event) {
  const serialized = JSON.stringify(event.data ?? null);
  const needsPreview = serialized.length > PREVIEW_CHAR_LIMIT;
  const projected = {
    entryId: event.entryId,
    type: event.type,
    timestamp: event.timestamp,
    receivedAt: event.receivedAt,
    sequence: event.sequence,
    severity: event.severity,
    data: needsPreview
      ? { _preview: true, _entryId: event.entryId }
      : event.data,
    preview: needsPreview
      ? {
        contentTrust: 'trusted-control',
        isPreview: true,
        entryId: event.entryId,
      }
      : {
        contentTrust: 'trusted-control',
        isPreview: false,
        entryId: null,
      },
  };
  return projected;
}

function toIsoRange(minMs, maxMs) {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs)) {
    return null;
  }
  const since = toIsoInstant(minMs);
  const until = toIsoInstant(maxMs);
  if (since == null || until == null) {
    return null;
  }
  return { since, until };
}

function selectContextFromEvents(eventsIterable, options = {}) {
  const {
    sinceMs = -Infinity,
    untilMs = Infinity,
    timeBasis = 'event',
    throughSequence = Infinity,
    maxEvents = DEFAULT_MAX_EVENTS,
    errorLimit = DEFAULT_ERROR_LIMIT,
    adjacent = DEFAULT_ADJACENT,
    session = {},
  } = options;

  if (timeBasis !== 'event' && timeBasis !== 'received') {
    throw new Error(`unknown timeBasis: ${timeBasis}`);
  }

  const latestMatched = [];
  const previousMatched = [];
  const anchorGroups = [];
  const totalByType = Object.create(null);
  let matched = 0;
  let invalidTimestampCount = 0;
  let minEvent = Infinity;
  let maxEvent = -Infinity;
  let minReceived = Infinity;
  let maxReceived = -Infinity;

  for (const event of eventsIterable) {
    if (Number.isFinite(throughSequence) && event.sequence > throughSequence) {
      continue;
    }

    if (timeBasis === 'event' && !isValidTimestampMs(event.timestamp)) {
      invalidTimestampCount += 1;
      continue;
    }

    const time = eventTimeMs(event, timeBasis);
    if (!Number.isFinite(time) || time < sinceMs || time > untilMs) {
      continue;
    }

    matched += 1;
    totalByType[event.type] = (totalByType[event.type] || 0) + 1;

    if (isValidTimestampMs(event.timestamp)) {
      minEvent = Math.min(minEvent, event.timestamp);
      maxEvent = Math.max(maxEvent, event.timestamp);
    }
    const receivedMs = parseIsoInstant(event.receivedAt);
    if (receivedMs != null) {
      minReceived = Math.min(minReceived, receivedMs);
      maxReceived = Math.max(maxReceived, receivedMs);
    }

    if (isFailureAnchor(event)) {
      remember(anchorGroups, {
        anchor: event,
        before: previousMatched.slice(-adjacent),
        after: [],
      }, errorLimit);
    }

    for (const group of anchorGroups) {
      if (group.anchor.sequence === event.sequence) {
        continue;
      }
      if (event.sequence > group.anchor.sequence && group.after.length < adjacent) {
        group.after.push(event);
      }
    }

    remember(previousMatched, event, adjacent);
    remember(latestMatched, event, maxEvents);
  }

  const selectedMap = new Map();
  const tryAdd = (event) => {
    if (!event || selectedMap.has(event.sequence) || selectedMap.size >= maxEvents) {
      return;
    }
    selectedMap.set(event.sequence, event);
  };

  for (let i = anchorGroups.length - 1; i >= 0; i -= 1) {
    tryAdd(anchorGroups[i].anchor);
  }
  for (let i = anchorGroups.length - 1; i >= 0; i -= 1) {
    const group = anchorGroups[i];
    for (const neighbor of group.before) {
      tryAdd(neighbor);
    }
    for (const neighbor of group.after) {
      tryAdd(neighbor);
    }
  }
  for (let i = latestMatched.length - 1; i >= 0; i -= 1) {
    tryAdd(latestMatched[i]);
  }

  const selectedEvents = [...selectedMap.values()].sort((a, b) => a.sequence - b.sequence);
  const projected = selectedEvents.map(projectContextEvent);
  const previewed = projected.filter((event) => event.preview.isPreview).length;
  const selectedByType = Object.create(null);
  for (const event of projected) {
    selectedByType[event.type] = (selectedByType[event.type] || 0) + 1;
  }

  const warnings = [];
  if (session.syncState === 'paused') {
    warnings.push('session_paused');
  }
  if (session.truncated) {
    warnings.push('session_truncated');
  }
  if (matched > projected.length) {
    warnings.push('events_omitted');
  }
  if (invalidTimestampCount > 0) {
    warnings.push(`invalid_event_timestamp:${Math.min(invalidTimestampCount, 99)}`);
  }

  const observedTypes = Object.keys(totalByType).sort();
  const completeness = {
    matched,
    selected: projected.length,
    omitted: Math.max(0, matched - projected.length),
    previewed,
    observedTypes,
    totalByType: { ...totalByType },
    syncState: session.syncState || 'live',
    connectionState: session.connectionState || 'active',
    warnings,
    invalidTimestampCount,
    ranges: {
      event: toIsoRange(minEvent, maxEvent),
      received: toIsoRange(minReceived, maxReceived),
    },
  };

  return {
    events: projected,
    selectedByType,
    completeness,
    eventTimeRange: completeness.ranges.event,
    receivedTimeRange: completeness.ranges.received,
  };
}

module.exports = {
  eventTimeMs,
  eventMatchesWindow,
  isFailureAnchor,
  projectContextEvent,
  selectContextFromEvents,
};
