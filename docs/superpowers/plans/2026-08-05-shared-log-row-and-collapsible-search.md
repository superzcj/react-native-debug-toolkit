# Shared Log Row and Collapsible Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give log messages the full card width through one responsive row component, and replace the panel's permanent search row with an in-place expandable search action.

**Architecture:** Add a slot-based `LogRow` that owns primary text truncation and footer wrapping while feature tabs continue to own their badges and data formatting. Keep panel filtering centralized in `FloatPanelView`, but consolidate its query, Bad filter, and search expansion state in a small reducer so tab changes and Clear All share one reset path. Keep `FeatureIntroCard` controlled and render either its normal title region or an expanded search region at the same minimum height.

**Tech Stack:** React 18, React Native 0.76, TypeScript 5.5, Jest 30 with `ts-jest`, existing React Native test mock.

## Global Constraints

- Primary row content defaults to a maximum of exactly `3` lines and accepts a positive caller override.
- Console, Native, Network, Track, Zustand, all four Session History detail row types, and Navigation must use the shared row.
- Environment, Clipboard, DevConnect, Third Party Libraries, and the Session History timeline must remain unchanged.
- Flexible footer metadata may shrink and truncate; trailing metadata must remain legible and wrap as a group when space is insufficient.
- Collapsed search must not occupy a separate row.
- Expanded search must replace the existing title region without changing the header's minimum height.
- A collapsed non-empty query must remain visibly and accessibly active.
- Tab switches and Clear All must reset query, Bad filter, and search expansion together.
- Do not change capture, ordering, detail views, persistence, filtering semantics, or the public `DebugFeature` API.
- Do not add runtime or test dependencies.

---

## File Structure

### Create

- `src/ui/shared/LogRow.tsx` — shared primary-content and responsive-footer layout.
- `src/ui/panel/panelFilterState.ts` — pure reducer for query, Bad filter, and search expansion.
- `src/__tests__/ui/logRow.test.ts` — direct element-tree contract tests for `LogRow`.
- `src/__tests__/ui/logRowConsumers.test.ts` — real row-renderer contracts for every in-scope tab.
- `src/__tests__/ui/panelFilterState.test.ts` — reducer transition and reset tests.
- `src/__tests__/ui/featureIntroCard.test.ts` — collapsed, expanded, active, and hidden search UI contracts.

### Modify

- `src/__tests__/helpers/react-native.mock.js` — expose string host components so pure component element trees can be inspected without a renderer dependency.
- `src/features/console/ConsoleLogTab.tsx` — move level indicator below full-width content.
- `src/features/nativeLogs/NativeLogTab.tsx` — move level and source metadata below full-width content.
- `src/features/network/NetworkLogTab.tsx` — replace its local footer layout with `LogRow`.
- `src/features/track/TrackLogTab.tsx` — move event indicator and property previews below the event name.
- `src/features/zustand/ZustandLogTab.tsx` — move action indicator, store, duration, and time into the shared footer.
- `src/features/navigation/NavigationLogTab.tsx` — make the route transition primary content and move actions into the footer.
- `src/features/sessionHistory/SessionHistoryTab.tsx` — migrate Console, Native, Network, and Track history rows and rename the local row component to avoid a name collision.
- `src/ui/panel/FeatureIntroCard.tsx` — replace the permanent search row with controlled collapsed/expanded states.
- `src/ui/panel/FloatPanelView.tsx` — use the reducer and pass controlled search expansion props.

---

### Task 1: Shared Responsive Log Row

**Files:**
- Create: `src/ui/shared/LogRow.tsx`
- Create: `src/__tests__/ui/logRow.test.ts`
- Modify: `src/__tests__/helpers/react-native.mock.js`

**Interfaces:**
- Consumes: `Colors`, `FontSize`, and `Spacing` from the existing UI theme.
- Produces: `LogRow(props: LogRowProps): React.ReactElement` and `LogRowMetaText(props: LogRowMetaTextProps): React.ReactElement`.

- [ ] **Step 1: Expose inspectable React Native host components in the test mock**

Add these fields at the top of the exported object in `src/__tests__/helpers/react-native.mock.js`:

```js
View: 'View',
Text: 'Text',
Pressable: 'Pressable',
TextInput: 'TextInput',
```

- [ ] **Step 2: Write the failing shared-row tests**

Create `src/__tests__/ui/logRow.test.ts`:

```ts
import React from 'react';
import type { ReactElement } from 'react';
import { LogRow, LogRowMetaText } from '../../ui/shared/LogRow';

type ElementProps = Record<string, any>;

function propsOf(node: React.ReactNode): ElementProps {
  return (node as ReactElement<ElementProps>).props;
}

describe('LogRow', () => {
  it('limits primary content to three lines by default', () => {
    const tree = LogRow({ content: 'line one line two line three line four' });
    const [content] = React.Children.toArray(propsOf(tree).children);

    expect(propsOf(content).numberOfLines).toBe(3);
  });

  it('accepts an explicit primary content line limit', () => {
    const tree = LogRow({ content: 'message', maxContentLines: 1 });
    const [content] = React.Children.toArray(propsOf(tree).children);

    expect(propsOf(content).numberOfLines).toBe(1);
  });

  it('keeps flexible and trailing metadata in separate wrapping groups', () => {
    const metadata = React.createElement('Meta', { id: 'source' });
    const trailing = React.createElement('Trailing', { id: 'time' });
    const tree = LogRow({ content: 'message', metadata, trailingMetadata: trailing });
    const [, footer] = React.Children.toArray(propsOf(tree).children);
    const [metadataGroup, trailingGroup] = React.Children.toArray(propsOf(footer).children);

    expect(propsOf(footer).style).toEqual(expect.objectContaining({
      flexDirection: 'row',
      flexWrap: 'wrap',
    }));
    expect(propsOf(metadataGroup).style).toEqual(expect.objectContaining({
      flexGrow: 1,
      flexShrink: 1,
    }));
    expect(propsOf(trailingGroup).style).toEqual(expect.objectContaining({
      flexShrink: 0,
      marginLeft: 'auto',
    }));
  });

  it('omits the footer when both metadata slots are absent', () => {
    const tree = LogRow({ content: 'message' });

    expect(React.Children.toArray(propsOf(tree).children)).toHaveLength(1);
  });
});

describe('LogRowMetaText', () => {
  it('shrinks and truncates long footer text to one line', () => {
    const tree = LogRowMetaText({ children: 'a very long native source' });

    expect(propsOf(tree).numberOfLines).toBe(1);
    expect(propsOf(tree).ellipsizeMode).toBe('tail');
    expect(propsOf(tree).style).toEqual(expect.arrayContaining([
      expect.objectContaining({ flexGrow: 1, flexShrink: 1, minWidth: 72 }),
    ]));
  });
});
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
rtk npx jest src/__tests__/ui/logRow.test.ts --runInBand --watchman=false
```

Expected: FAIL because `src/ui/shared/LogRow.tsx` does not exist.

- [ ] **Step 4: Implement the minimal shared component**

Create `src/ui/shared/LogRow.tsx`:

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextProps, TextStyle } from 'react-native';
import { Colors } from '../theme/colors';
import { FontSize, Spacing } from '../theme/layout';

export interface LogRowProps {
  content: React.ReactNode;
  maxContentLines?: number;
  contentStyle?: StyleProp<TextStyle>;
  metadata?: React.ReactNode;
  trailingMetadata?: React.ReactNode;
}

export function LogRow({
  content,
  maxContentLines = 3,
  contentStyle,
  metadata,
  trailingMetadata,
}: LogRowProps) {
  const hasMetadata = metadata !== null && metadata !== undefined;
  const hasTrailingMetadata = trailingMetadata !== null && trailingMetadata !== undefined;

  return (
    <View style={styles.row}>
      <Text style={[styles.content, contentStyle]} numberOfLines={maxContentLines}>
        {content}
      </Text>
      {(hasMetadata || hasTrailingMetadata) && (
        <View style={styles.footer}>
          {hasMetadata && <View style={styles.metadata}>{metadata}</View>}
          {hasTrailingMetadata && (
            <View style={styles.trailingMetadata}>{trailingMetadata}</View>
          )}
        </View>
      )}
    </View>
  );
}

export interface LogRowMetaTextProps extends Omit<TextProps, 'numberOfLines'> {
  children: React.ReactNode;
}

export function LogRowMetaText({
  children,
  style,
  ellipsizeMode = 'tail',
  ...rest
}: LogRowMetaTextProps) {
  return (
    <Text
      {...rest}
      style={[styles.metadataText, style]}
      numberOfLines={1}
      ellipsizeMode={ellipsizeMode}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    padding: Spacing.MD,
    gap: Spacing.XS,
  },
  content: {
    color: Colors.text,
    fontSize: FontSize.MD,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.SM,
    rowGap: Spacing.XS,
    minWidth: 0,
  },
  metadata: {
    flexBasis: 96,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 96,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.XS,
    rowGap: Spacing.XXS,
  },
  trailingMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.SM,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  metadataText: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 72,
    color: Colors.textSecondary,
    fontSize: FontSize.XS,
  },
});
```

- [ ] **Step 5: Run the shared-row test and verify GREEN**

Run:

```bash
rtk npx jest src/__tests__/ui/logRow.test.ts --runInBand --watchman=false
```

Expected: PASS with 5 tests.

- [ ] **Step 6: Commit the shared component**

```bash
rtk git add src/ui/shared/LogRow.tsx src/__tests__/ui/logRow.test.ts src/__tests__/helpers/react-native.mock.js
rtk git commit -m "feat: add responsive shared log row"
```

---

### Task 2: Migrate Console, Native, and Network Rows

**Files:**
- Create: `src/__tests__/ui/logRowConsumers.test.ts`
- Modify: `src/features/console/ConsoleLogTab.tsx`
- Modify: `src/features/nativeLogs/NativeLogTab.tsx`
- Modify: `src/features/network/NetworkLogTab.tsx`

**Interfaces:**
- Consumes: `LogRow` and `LogRowMetaText` from Task 1.
- Produces: `renderConsoleLogRow`, `renderNativeLogRow`, and `renderNetworkLogRow`, used directly by their tabs and tests.

- [ ] **Step 1: Write failing consumer-behavior tests**

Create `src/__tests__/ui/logRowConsumers.test.ts`:

```ts
import React from 'react';
import type { ReactElement } from 'react';
import { renderConsoleLogRow } from '../../features/console/ConsoleLogTab';
import { renderNativeLogRow } from '../../features/nativeLogs/NativeLogTab';
import { renderNetworkLogRow } from '../../features/network/NetworkLogTab';
import { LogRow } from '../../ui/shared/LogRow';
import type { LogRowProps } from '../../ui/shared/LogRow';

type ElementProps = Record<string, any>;

function propsOf(node: React.ReactNode): ElementProps {
  return (node as ReactElement<ElementProps>).props;
}

function rowProps(element: ReactElement): LogRowProps {
  expect(element.type).toBe(LogRow);
  return element.props as LogRowProps;
}

function textContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(propsOf(node).children).map(textContent).join('');
}

describe('live log row consumers', () => {
  it('maps Console message, level, and time into the shared row', () => {
    const props = rowProps(renderConsoleLogRow({
      id: 'console-1',
      timestamp: 1,
      level: 'warn',
      data: ['first', 'second'],
    }));

    expect(props.content).toBe('first second');
    expect(textContent(props.metadata)).toContain('⚠');
    expect(props.trailingMetadata).toBeDefined();
    expect(props.maxContentLines).toBeUndefined();
  });

  it('maps Native source metadata below the full message', () => {
    const props = rowProps(renderNativeLogRow({
      id: 'native-1',
      timestamp: 1,
      platform: 'android',
      level: 'info',
      source: 'logcat',
      tag: 'ReactNative',
      message: 'native message',
    }));

    expect(props.content).toBe('native message');
    expect(textContent(props.metadata)).toContain('android / logcat / ReactNative');
    expect(props.trailingMetadata).toBeDefined();
  });

  it('maps Network path and long footer metadata into separate slots', () => {
    const props = rowProps(renderNetworkLogRow({
      id: 'network-1',
      timestamp: 1,
      duration: 1200,
      request: { method: 'GET', url: 'https://api.example.com/orders?q=open' },
      response: { status: 503 },
    }));
    const metadata = textContent(props.metadata);

    expect(props.content).toBe('/orders?q=open');
    expect(metadata).toContain('GET');
    expect(metadata).toContain('503');
    expect(metadata).toContain('1200ms');
    expect(metadata).toContain('api.example.com');
    expect(props.trailingMetadata).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the consumer test and verify RED**

Run:

```bash
rtk npx jest src/__tests__/ui/logRowConsumers.test.ts --runInBand --watchman=false
```

Expected: FAIL because the three production row-renderer exports do not exist.

- [ ] **Step 3: Replace the Console row**

Import `LogRow`. Add this exported renderer before `ConsoleLogTab`, then pass `renderRow={renderConsoleLogRow}` to `LogListScreen`:

```tsx
export function renderConsoleLogRow(item: ConsoleLogEntry) {
  return (
    <LogRow
      content={item.data.map((d) => (
        typeof d === 'string' ? d : safeStringify(d)
      )).join(' ')}
      contentStyle={s.logMessage}
      metadata={(
        <View style={[s.levelDot, { backgroundColor: LEVEL_COLORS[item.level] ?? Colors.textMuted }]}>
          <Text style={s.levelIcon}>{LEVEL_ICONS[item.level] ?? '●'}</Text>
        </View>
      )}
      trailingMetadata={(
        <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      )}
    />
  );
}
```

Delete `cardRow`, `cardContent`, `marginRight`, and `marginTop` row styles. Keep the level dot at `20x20`, and keep `logMessage` and `time` typography unchanged.

- [ ] **Step 4: Replace the Native row**

Import `LogRow` and `LogRowMetaText`. Add this exported renderer before `NativeLogTab`, then pass `renderRow={renderNativeLogRow}`:

```tsx
export function renderNativeLogRow(item: NativeLogEntry) {
  const source = [item.platform, item.source, item.tag].filter(Boolean).join(' / ');
  return (
    <LogRow
      content={item.message}
      contentStyle={s.message}
      metadata={(
        <>
          <View style={[s.level, { backgroundColor: LEVEL_COLORS[item.level] ?? LEVEL_COLORS.unknown }]}>
            <Text style={s.levelText}>{item.level.slice(0, 1).toUpperCase()}</Text>
          </View>
          {!!source && <LogRowMetaText style={s.meta}>{source}</LogRowMetaText>}
        </>
      )}
      trailingMetadata={(
        <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      )}
    />
  );
}
```

Delete `row`, `content`, and the level's `marginRight`. Keep the level at `22x22`. Split the old combined meta style into:

```ts
meta: { fontSize: FontSize.XS, color: Colors.textSecondary },
time: { fontSize: FontSize.XS, color: Colors.textSecondary },
```

- [ ] **Step 5: Replace the Network row**

Import `LogRow` and `LogRowMetaText`. Extract the existing `ok`, `statusColor`, `urlParts`, and `slow` calculations into this exported renderer, then pass `renderRow={renderNetworkLogRow}`:

```tsx
export function renderNetworkLogRow(item: NetworkLogEntry) {
  const ok = !item.error && (!item.response || item.response.status < 400);
  const statusColor = ok ? Colors.success : Colors.error;
  const urlParts = formatUrlParts(item.request.url);
  const slow = item.duration != null && item.duration >= 1000;

  return (
    <LogRow
      content={urlParts.path}
      contentStyle={[s.pathText, !ok && { color: Colors.error }]}
      metadata={(
        <>
          <View style={[s.metaChip, { backgroundColor: getMethodColor(item.request.method) }]}>
            <Text style={s.metaChipText}>{item.request.method}</Text>
          </View>
          <View style={[s.metaChip, { backgroundColor: statusColor }]}>
            <Text style={s.metaChipText}>{statusLabel(item)}</Text>
          </View>
          {item.duration != null && (
            <Text style={[s.metaStat, slow && { color: Colors.warning }]}>
              {item.duration}ms
            </Text>
          )}
          {!!urlParts.host && (
            <LogRowMetaText style={s.hostText}>{urlParts.host}</LogRowMetaText>
          )}
        </>
      )}
      trailingMetadata={(
        <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      )}
    />
  );
}
```

Delete `cardRow`, `cardBody`, and `metaRow`. Keep method/status chip styles and define the remaining text styles as:

```ts
metaStat: {
  fontSize: FontSize.XXS,
  color: Colors.textMuted,
  fontWeight: FontWeight.semibold,
  flexShrink: 0,
},
hostText: {
  fontSize: FontSize.XXS,
  color: Colors.textSecondary,
  fontWeight: FontWeight.semibold,
},
time: { fontSize: FontSize.XXS, color: Colors.textMuted },
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
rtk npx jest src/__tests__/ui/logRow.test.ts src/__tests__/ui/logRowConsumers.test.ts --runInBand --watchman=false
rtk npm run typecheck
```

Expected: both suites PASS and TypeScript exits 0.

- [ ] **Step 7: Commit the first migrations**

```bash
rtk git add src/features/console/ConsoleLogTab.tsx src/features/nativeLogs/NativeLogTab.tsx src/features/network/NetworkLogTab.tsx src/__tests__/ui/logRowConsumers.test.ts
rtk git commit -m "refactor: use shared rows for core logs"
```

---

### Task 3: Migrate Track, Zustand, and Navigation Rows

**Files:**
- Modify: `src/__tests__/ui/logRowConsumers.test.ts`
- Modify: `src/features/track/TrackLogTab.tsx`
- Modify: `src/features/zustand/ZustandLogTab.tsx`
- Modify: `src/features/navigation/NavigationLogTab.tsx`

**Interfaces:**
- Consumes: `LogRow` from Task 1.
- Produces: `renderTrackLogRow`, `renderZustandLogRow`, and `renderNavigationLogRow`, used directly by their tabs and tests.

- [ ] **Step 1: Extend the real consumer tests and verify RED**

Add imports for the three row renderers and `CopyButton` to `logRowConsumers.test.ts`. Add this helper:

```ts
function findElementByType(
  node: React.ReactNode,
  type: React.ElementType,
): ReactElement<ElementProps> | undefined {
  if (!React.isValidElement(node)) return undefined;
  const element = node as ReactElement<ElementProps>;
  if (element.type === type) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElementByType(child, type);
    if (found) return found;
  }
  return undefined;
}
```

Append these cases to the existing `describe` block:

```ts
it('maps Track event previews below the event name', () => {
  const props = rowProps(renderTrackLogRow({
    id: 'track-1',
    timestamp: 1,
    eventName: 'checkout_started',
    campaign: 'spring',
    source: 'banner',
  }));

  expect(props.content).toBe('checkout_started');
  expect(textContent(props.metadata)).toContain('campaign spring');
  expect(textContent(props.metadata)).toContain('source banner');
  expect(props.trailingMetadata).toBeDefined();
});

it('maps Zustand store and duration into footer slots', () => {
  const props = rowProps(renderZustandLogRow({
    id: 'zustand-1',
    timestamp: 1,
    action: 'setUser',
    prevState: null,
    nextState: { id: 1 },
    storeName: 'auth',
    actionCompleteTime: 12,
  }));

  expect(props.content).toBe('setUser');
  expect(textContent(props.metadata)).toContain('auth');
  expect(textContent(props.trailingMetadata)).toContain('12ms');
});

it('keeps Navigation transition full-width and Copy in the footer', () => {
  const props = rowProps(renderNavigationLogRow({
    id: 'navigation-1',
    timestamp: 1,
    action: 'PUSH',
    from: 'Home',
    to: 'Details',
    duration: 18,
  }));
  const copy = findElementByType(props.trailingMetadata, CopyButton);

  expect(props.content).toBe('Home → Details');
  expect(textContent(props.metadata)).toBe('PUSH');
  expect(textContent(props.trailingMetadata)).toContain('18ms');
  expect(copy?.props.text).toBe('PUSH: Home → Details');
  expect(copy?.props.compact).toBe(true);
});
```

Run:

```bash
rtk npx jest src/__tests__/ui/logRowConsumers.test.ts --runInBand --watchman=false
```

Expected: the original three cases PASS; the new imports fail because the row-renderer exports do not exist.

- [ ] **Step 2: Replace the Track row**

Import `LogRow`. Add `renderTrackLogRow(item: TrackLogEntry)` using the following body, then pass `renderRow={renderTrackLogRow}`:

```tsx
export function renderTrackLogRow(item: TrackLogEntry) {
  return (
    <LogRow
    content={item.eventName}
    contentStyle={s.eventName}
    metadata={(
      <>
        <View style={s.eventIcon}><Text style={s.eventIconText}>●</Text></View>
        {Object.entries(item)
          .filter(([key]) => key !== 'id' && key !== 'eventName' && key !== 'timestamp')
          .slice(0, 2)
          .map(([key, value]) => (
            <View key={key} style={s.previewChip}>
              <Text style={s.previewText} numberOfLines={1}>
                <Text style={s.previewKey}>{key}</Text> {String(value ?? '').slice(0, 25)}
              </Text>
            </View>
          ))}
      </>
    )}
    trailingMetadata={(
      <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
    )}
    />
  );
}
```

Delete `cardRow`, `cardContent`, `cardHeader`, and `previewRow`. Remove `marginRight` and `marginTop` from `eventIcon`; keep the remaining icon, preview chip, and text styles.

- [ ] **Step 3: Replace the Zustand row**

Import `LogRow`. Add `renderZustandLogRow(item: ZustandLogEntry)` using the following body, then pass `renderRow={renderZustandLogRow}`:

```tsx
export function renderZustandLogRow(item: ZustandLogEntry) {
  return (
    <LogRow
    content={item.action}
    contentStyle={s.action}
    metadata={(
      <>
        <View style={[s.actionIcon, { backgroundColor: getActionBgColor(item.action) }]}>
          <View style={[s.actionDot, { backgroundColor: getActionColor(item.action) }]} />
        </View>
        {item.storeName && (
          <View style={s.storeBadge}>
            <Text style={s.storeBadgeText}>{item.storeName}</Text>
          </View>
        )}
      </>
    )}
    trailingMetadata={(
      <>
        {item.actionCompleteTime != null && (
          <View style={s.durationBadge}>
            <Text style={s.durationText}>{item.actionCompleteTime}ms</Text>
          </View>
        )}
        <Text style={s.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      </>
    )}
    />
  );
}
```

Delete `cardRow`, `cardContent`, and `cardMeta`. Remove `marginRight` from `actionIcon`. Keep `action`, `storeBadge`, `durationBadge`, and `time` typography.

- [ ] **Step 4: Replace the Navigation row**

Import `LogRow`. Extract the current `renderItem` body into exported `renderNavigationLogRow(item: NavigationLogEntry)` and have `renderItem` return `renderNavigationLogRow(item)`. The exported renderer returns:

```tsx
export function renderNavigationLogRow(item: NavigationLogEntry) {
  return (
    <View style={styles.logItem}>
      <LogRow
    content={`${item.from || '—'} → ${item.to}`}
    contentStyle={styles.routeValue}
    metadata={<Text style={styles.action}>{item.action}</Text>}
    trailingMetadata={(
      <>
        {item.duration != null && <Text style={styles.duration}>{item.duration}ms</Text>}
        <CopyButton
          text={`${item.action}: ${item.from || '—'} → ${item.to}`}
          label="Navigation"
          compact
        />
        <Text style={styles.time}>{new Date(item.timestamp).toLocaleTimeString()}</Text>
      </>
    )}
      />
    </View>
  );
}
```

Remove padding from `logItem` because `LogRow` owns it. Delete `header`, `headerRight`, `routeRow`, and `routeLabel`. Keep:

```ts
routeValue: { fontSize: FontSize.SM, color: Colors.text, lineHeight: 18 },
time: { fontSize: FontSize.XS, color: Colors.textMuted },
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
rtk npx jest src/__tests__/ui/logRow.test.ts src/__tests__/ui/logRowConsumers.test.ts --runInBand --watchman=false
rtk npm run typecheck
```

Expected: all six consumer cases PASS and TypeScript exits 0.

- [ ] **Step 6: Commit the remaining live-tab migrations**

```bash
rtk git add src/features/track/TrackLogTab.tsx src/features/zustand/ZustandLogTab.tsx src/features/navigation/NavigationLogTab.tsx src/__tests__/ui/logRowConsumers.test.ts
rtk git commit -m "refactor: unify event and navigation rows"
```

---

### Task 4: Migrate Session History Detail Rows

**Files:**
- Modify: `src/__tests__/ui/logRowConsumers.test.ts`
- Modify: `src/features/sessionHistory/SessionHistoryTab.tsx`

**Interfaces:**
- Consumes: `LogRow`, `LogRowMetaText`, and existing `FlatSessionLogEntry` conversion.
- Produces: `renderSessionLogRow`, covering Console, Native, Network, and Track history entries.

- [ ] **Step 1: Extend the real consumer tests and verify RED**

Import `renderSessionLogRow` in `logRowConsumers.test.ts` and append these cases:

```ts
it('maps Session History Console entries into the shared row', () => {
  const props = rowProps(renderSessionLogRow({
    id: 'console_logs-0',
    type: 'console_logs',
    timestamp: 1,
    raw: { timestamp: 1, level: 'error', data: ['session', 'failure'] },
  }));

  expect(props.content).toBe('session failure');
  expect(textContent(props.metadata)).toContain('✕');
});

it('maps Session History Native entries without treating them as Track events', () => {
  const props = rowProps(renderSessionLogRow({
    id: 'native_logs-0',
    type: 'native_logs',
    timestamp: 1,
    raw: {
      timestamp: 1,
      level: 'error',
      platform: 'ios',
      source: 'rctLog',
      tag: 'Bridge',
      message: 'native session failure',
    },
  }));

  expect(props.content).toBe('native session failure');
  expect(textContent(props.metadata)).toContain('ios / rctLog / Bridge');
});

it('maps Session History Network entries into content and metadata', () => {
  const props = rowProps(renderSessionLogRow({
    id: 'network_logs-0',
    type: 'network_logs',
    timestamp: 1,
    raw: {
      timestamp: 1,
      request: { method: 'GET', url: 'https://api.example.com/orders' },
      response: { status: 500 },
    },
  }));

  expect(props.content).toBe('/orders');
  expect(textContent(props.metadata)).toContain('GET');
  expect(textContent(props.metadata)).toContain('500');
});

it('maps Session History Track entries into the shared row', () => {
  const props = rowProps(renderSessionLogRow({
    id: 'track_logs-0',
    type: 'track_logs',
    timestamp: 1,
    raw: { timestamp: 1, eventName: 'purchase_completed' },
  }));

  expect(props.content).toBe('purchase_completed');
  expect(props.trailingMetadata).toBeDefined();
});
```

Run:

```bash
rtk npx jest src/__tests__/ui/logRowConsumers.test.ts --runInBand --watchman=false
```

Expected: the six live-row cases PASS; the new import fails because `renderSessionLogRow` does not exist.

- [ ] **Step 2: Import the shared row and rename the local component**

Import `LogRow` and `LogRowMetaText`. Rename local `LogRow` to `SessionLogRow`, make it call the exported renderer, and update the list callback:

```tsx
const SessionLogRow: React.FC<{ entry: FlatSessionLogEntry }> = React.memo(({ entry }) => (
  renderSessionLogRow(entry)
));

renderRow={(item) => <SessionLogRow entry={item} />}
```

- [ ] **Step 3: Implement all four branches in `renderSessionLogRow`**

Start the renderer with:

```tsx
export function renderSessionLogRow(entry: FlatSessionLogEntry) {
  const e = toRecord(entry);
```

Console branch:

```tsx
return (
  <LogRow
    content={msg}
    contentStyle={s.rowMsg}
    metadata={(
      <View style={[s.levelDot, { backgroundColor: LEVEL_COLORS[level] ?? Colors.textMuted }]}>
        <Text style={s.levelIcon}>{LEVEL_ICONS[level] ?? '●'}</Text>
      </View>
    )}
    trailingMetadata={(
      <Text style={s.rowTime}>{new Date(e.timestamp).toLocaleTimeString()}</Text>
    )}
  />
);
```

Native branch, placed before Network:

```tsx
if (entry.type === 'native_logs') {
  const level = e.level ?? 'unknown';
  const source = [e.platform, e.source, e.tag].filter(Boolean).join(' / ');
  return (
    <LogRow
      content={e.message ?? safeStringify(e)}
      contentStyle={s.rowMsg}
      metadata={(
        <>
          <View style={[
            s.levelDot,
            { backgroundColor: LEVEL_COLORS[level] ?? SESSION_LOG_COLORS.native_logs },
          ]}>
            <Text style={s.levelIcon}>{String(level).slice(0, 1).toUpperCase()}</Text>
          </View>
          {!!source && <LogRowMetaText style={s.rowSource}>{source}</LogRowMetaText>}
        </>
      )}
      trailingMetadata={(
        <Text style={s.rowTime}>{new Date(e.timestamp).toLocaleTimeString()}</Text>
      )}
    />
  );
}
```

Network branch:

```tsx
return (
  <LogRow
    content={shortenUrl(url)}
    contentStyle={[s.rowMsg, !ok && { color: Colors.error }]}
    metadata={(
      <>
        <View style={[s.statusDot, { backgroundColor: ok ? Colors.success : Colors.error }]} />
        <Text style={[s.methodText, { color: getMethodColor(method) }]}>{method}</Text>
        {status != null && (
          <View style={[s.miniPill, { backgroundColor: ok ? Colors.success : Colors.error }]}>
            <Text style={s.miniPillText}>{status}</Text>
          </View>
        )}
      </>
    )}
    trailingMetadata={(
      <Text style={s.rowTime}>{new Date(e.timestamp).toLocaleTimeString()}</Text>
    )}
  />
);
```

Track branch:

```tsx
return (
  <LogRow
    content={name}
    contentStyle={s.rowMsg}
    metadata={<View style={s.trackDot} />}
    trailingMetadata={(
      <Text style={s.rowTime}>
        {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ''}
      </Text>
    )}
  />
);
```

Close `renderSessionLogRow` after the Track return. Because `LogFeatureKey` contains exactly Console, Native, Network, and Track, every branch returns a shared row.

- [ ] **Step 4: Remove obsolete Session History row styles**

Delete `rowContent`, `rowBody`, and `rowMeta`. Remove left-column margins from `levelDot` and `trackDot`. Replace `statusBar` with:

```ts
statusDot: { width: 8, height: 8, borderRadius: 4 },
```

Keep `rowMsg`, `rowTime`, `methodText`, `miniPill`, and their typography.

Add the Native source style:

```ts
rowSource: { fontSize: FontSize.XS, color: Colors.textSecondary },
```

- [ ] **Step 5: Run Session History and row regressions**

```bash
rtk npx jest src/__tests__/ui/logRow.test.ts src/__tests__/ui/logRowConsumers.test.ts src/__tests__/features/sessionHistoryCatalog.test.ts --runInBand --watchman=false
rtk npm run typecheck
```

Expected: all suites PASS and TypeScript exits 0.

- [ ] **Step 6: Commit Session History migration**

```bash
rtk git add src/features/sessionHistory/SessionHistoryTab.tsx src/__tests__/ui/logRowConsumers.test.ts
rtk git commit -m "refactor: unify session history log rows"
```

---

### Task 5: Centralize Panel Filter and Search State

**Files:**
- Create: `src/ui/panel/panelFilterState.ts`
- Create: `src/__tests__/ui/panelFilterState.test.ts`

**Interfaces:**
- Consumes: no UI or feature dependencies.
- Produces: `PanelFilterState`, `INITIAL_PANEL_FILTER_STATE`, `PanelFilterAction`, and `panelFilterReducer(state, action)`.

- [ ] **Step 1: Write the failing reducer tests**

Create `src/__tests__/ui/panelFilterState.test.ts`:

```ts
import {
  INITIAL_PANEL_FILTER_STATE,
  panelFilterReducer,
} from '../../ui/panel/panelFilterState';

describe('panelFilterReducer', () => {
  it('updates query, Bad filter, and expansion independently', () => {
    let state = INITIAL_PANEL_FILTER_STATE;

    state = panelFilterReducer(state, { type: 'set-query', query: 'timeout' });
    state = panelFilterReducer(state, { type: 'set-bad', bad: true });
    state = panelFilterReducer(state, { type: 'set-search-expanded', expanded: true });

    expect(state).toEqual({
      searchQuery: 'timeout',
      filterBad: true,
      searchExpanded: true,
    });
  });

  it('resets all filter and search presentation state together', () => {
    const active = {
      searchQuery: 'timeout',
      filterBad: true,
      searchExpanded: true,
    };

    expect(panelFilterReducer(active, { type: 'reset' })).toEqual(
      INITIAL_PANEL_FILTER_STATE,
    );
  });
});
```

- [ ] **Step 2: Run the reducer test and verify RED**

```bash
rtk npx jest src/__tests__/ui/panelFilterState.test.ts --runInBand --watchman=false
```

Expected: FAIL because `panelFilterState.ts` does not exist.

- [ ] **Step 3: Implement the reducer**

Create `src/ui/panel/panelFilterState.ts`:

```ts
export interface PanelFilterState {
  searchQuery: string;
  filterBad: boolean;
  searchExpanded: boolean;
}

export type PanelFilterAction =
  | { type: 'set-query'; query: string }
  | { type: 'set-bad'; bad: boolean }
  | { type: 'set-search-expanded'; expanded: boolean }
  | { type: 'reset' };

export const INITIAL_PANEL_FILTER_STATE: PanelFilterState = {
  searchQuery: '',
  filterBad: false,
  searchExpanded: false,
};

export function panelFilterReducer(
  state: PanelFilterState,
  action: PanelFilterAction,
): PanelFilterState {
  switch (action.type) {
    case 'set-query':
      return { ...state, searchQuery: action.query };
    case 'set-bad':
      return { ...state, filterBad: action.bad };
    case 'set-search-expanded':
      return { ...state, searchExpanded: action.expanded };
    case 'reset':
      return INITIAL_PANEL_FILTER_STATE;
  }
}
```

- [ ] **Step 4: Run the reducer test and verify GREEN**

```bash
rtk npx jest src/__tests__/ui/panelFilterState.test.ts --runInBand --watchman=false
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the reducer**

```bash
rtk git add src/ui/panel/panelFilterState.ts src/__tests__/ui/panelFilterState.test.ts
rtk git commit -m "refactor: centralize panel filter state"
```

---

### Task 6: Add Collapsible Header Search and Wire Resets

**Files:**
- Create: `src/__tests__/ui/featureIntroCard.test.ts`
- Modify: `src/ui/panel/FeatureIntroCard.tsx`
- Modify: `src/ui/panel/FloatPanelView.tsx`

**Interfaces:**
- Consumes: `panelFilterReducer` and `INITIAL_PANEL_FILTER_STATE` from Task 5.
- Produces: controlled `searchExpanded` and `onSearchExpandedChange` props on `FeatureIntroCard`; one stable-height header region in collapsed and expanded states.

- [ ] **Step 1: Write the failing FeatureIntroCard interaction tests**

Create `src/__tests__/ui/featureIntroCard.test.ts`:

```ts
import React from 'react';
import type { ReactElement } from 'react';
import { FeatureIntroCard } from '../../ui/panel/FeatureIntroCard';

type ElementProps = Record<string, any>;

function propsOf(node: React.ReactNode): ElementProps {
  return (node as ReactElement<ElementProps>).props;
}

function findElement(
  node: React.ReactNode,
  predicate: (element: ReactElement<ElementProps>) => boolean,
): ReactElement<ElementProps> | undefined {
  if (!React.isValidElement(node)) return undefined;
  const element = node as ReactElement<ElementProps>;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return undefined;
}

const summary = {
  capabilityText: 'Console logs',
  count: 3,
  supportsBadFilter: true,
};

function renderCard(overrides: Record<string, unknown> = {}) {
  return FeatureIntroCard({
    title: 'Logs',
    summary,
    filterBad: false,
    onFilterBad: jest.fn(),
    searchQuery: '',
    onSearchChange: jest.fn(),
    showSearch: true,
    searchExpanded: false,
    onSearchExpandedChange: jest.fn(),
    ...overrides,
  } as Parameters<typeof FeatureIntroCard>[0] & {
    searchExpanded: boolean;
    onSearchExpandedChange: (expanded: boolean) => void;
  });
}

describe('FeatureIntroCard search', () => {
  it('renders a collapsed search action without a second header row', () => {
    const onSearchExpandedChange = jest.fn();
    const tree = renderCard({ onSearchExpandedChange });
    const open = findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Open search'
    ));
    const input = findElement(tree, (element) => element.props.placeholder === 'Search');

    expect(open).toBeDefined();
    expect(input).toBeUndefined();
    expect(React.Children.toArray(propsOf(tree).children)).toHaveLength(1);
    open?.props.onPress();
    expect(onSearchExpandedChange).toHaveBeenCalledWith(true);
  });

  it('expands search in place and collapses without clearing the query', () => {
    const onSearchChange = jest.fn();
    const onSearchExpandedChange = jest.fn();
    const tree = renderCard({
      searchExpanded: true,
      searchQuery: 'timeout',
      onSearchChange,
      onSearchExpandedChange,
    });
    const input = findElement(tree, (element) => element.props.placeholder === 'Search');
    const done = findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Close search'
    ));

    expect(input?.props.value).toBe('timeout');
    expect(input?.props.autoFocus).toBe(true);
    input?.props.onChangeText('fatal');
    expect(onSearchChange).toHaveBeenCalledWith('fatal');
    done?.props.onPress();
    expect(onSearchExpandedChange).toHaveBeenCalledWith(false);
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(React.Children.toArray(propsOf(tree).children)).toHaveLength(1);
  });

  it('marks a collapsed non-empty query as active', () => {
    const tree = renderCard({ searchQuery: 'timeout' });
    const open = findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Open search'
    ));

    expect(open?.props.accessibilityState).toEqual({
      expanded: false,
      selected: true,
    });
  });

  it('omits the search action when data is not searchable', () => {
    const tree = renderCard({ showSearch: false });

    expect(findElement(tree, (element) => (
      element.props.accessibilityLabel === 'Open search'
    ))).toBeUndefined();
  });

  it('uses the same non-zero minimum height for collapsed and expanded regions', () => {
    const collapsed = renderCard();
    const expanded = renderCard({ searchExpanded: true });
    const [collapsedRegion] = React.Children.toArray(propsOf(collapsed).children);
    const [expandedRegion] = React.Children.toArray(propsOf(expanded).children);
    const collapsedHeight = propsOf(collapsedRegion).style.minHeight;
    const expandedHeight = propsOf(expandedRegion).style.minHeight;

    expect(collapsedHeight).toBeGreaterThan(0);
    expect(expandedHeight).toBe(collapsedHeight);
  });
});
```

- [ ] **Step 2: Run the FeatureIntroCard test and verify RED**

```bash
rtk npx jest src/__tests__/ui/featureIntroCard.test.ts --runInBand --watchman=false
```

Expected: FAIL because FeatureIntroCard still renders the search input as a permanent second row and has no collapsed search action.

- [ ] **Step 3: Make FeatureIntroCard search controlled and in-place**

Change its search props to:

```ts
searchQuery: string;
onSearchChange: (text: string) => void;
showSearch: boolean;
searchExpanded: boolean;
onSearchExpandedChange: (expanded: boolean) => void;
```

Replace the component's return body with one conditional header child:

```tsx
return (
  <View style={styles.bar}>
    {searchExpanded && showSearch ? (
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          accessibilityLabel="Search logs"
          placeholder="Search"
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
          autoFocus
        />
        <Pressable
          style={styles.searchDone}
          accessibilityRole="button"
          accessibilityLabel="Close search"
          onPress={() => onSearchExpandedChange(false)}
        >
          <Text style={styles.searchDoneText}>Done</Text>
        </Pressable>
      </View>
    ) : (
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {metrics.length > 0 && (
            <View style={styles.metricRow}>
              {metrics.map((metric, index) => (
                <Text
                  key={`${metric}-${index}`}
                  style={[styles.metricText, index === metrics.length - 1 && styles.latestMetric]}
                  numberOfLines={1}
                >
                  {metric}
                </Text>
              ))}
            </View>
          )}
        </View>
        <View style={styles.actionBlock}>
          {statusLabel && (
            <View style={[styles.statusChip, statusColor && { backgroundColor: hexWithAlpha(statusColor, '18') }]}>
              <View style={[styles.statusDot, statusColor && { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, statusColor && { color: statusColor }]} numberOfLines={1}>
                {statusLabel}
              </Text>
            </View>
          )}
          <View style={styles.actionRow}>
            {supportsBadFilter && (
              <View style={styles.filterRow}>
                <Pressable style={[styles.chip, !filterBad && styles.chipActive]} onPress={() => onFilterBad(false)}>
                  <Text style={[styles.chipText, !filterBad && styles.chipTextActive]}>All</Text>
                </Pressable>
                <Pressable style={[styles.chip, filterBad && styles.chipBadActive]} onPress={() => onFilterBad(true)}>
                  <Text style={[styles.chipText, filterBad && styles.chipTextBad]}>Bad</Text>
                </Pressable>
              </View>
            )}
            {showSearch && (
              <Pressable
                style={[styles.searchTrigger, !!searchQuery && styles.searchTriggerActive]}
                accessibilityRole="button"
                accessibilityLabel="Open search"
                accessibilityState={{ expanded: false, selected: !!searchQuery }}
                onPress={() => onSearchExpandedChange(true)}
              >
                <Text style={[styles.searchTriggerText, !!searchQuery && styles.searchTriggerTextActive]}>⌕</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    )}
  </View>
);
```

Use the same minimum height for both states and remove the old search margin:

```ts
titleRow: {
  minHeight: 50,
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: Spacing.SM,
},
actionRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: Spacing.XS,
},
searchRow: {
  minHeight: 50,
  flexDirection: 'row',
  alignItems: 'center',
  gap: Spacing.SM,
},
searchInput: {
  flex: 1,
  height: 36,
  borderWidth: 1,
  borderColor: Colors.borderFocus,
  borderRadius: Radius.MD,
  backgroundColor: Colors.surfaceInset,
  paddingHorizontal: Spacing.MD,
  fontSize: FontSize.MD,
  color: Colors.text,
},
searchTrigger: {
  width: 30,
  height: 24,
  borderRadius: Radius.MD,
  borderWidth: 1,
  borderColor: Colors.border,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: Colors.surfaceInset,
},
searchTriggerActive: {
  borderColor: Colors.primary,
  backgroundColor: Colors.primaryGhost,
},
searchTriggerText: { fontSize: FontSize.LG, color: Colors.textSecondary },
searchTriggerTextActive: { color: Colors.primary },
searchDone: {
  height: 32,
  paddingHorizontal: Spacing.SM,
  justifyContent: 'center',
  borderRadius: Radius.MD,
},
searchDoneText: {
  color: Colors.primary,
  fontSize: FontSize.SM,
  fontWeight: FontWeight.semibold,
},
```

- [ ] **Step 4: Wire the reducer into FloatPanelView**

Import `useReducer`, `panelFilterReducer`, and `INITIAL_PANEL_FILTER_STATE`. Replace the three independent filter/search state values with:

```ts
const [filters, dispatchFilters] = useReducer(
  panelFilterReducer,
  INITIAL_PANEL_FILTER_STATE,
);
const { searchQuery, filterBad, searchExpanded } = filters;
```

In the tab-change callback, replace the two existing setter calls with exactly one reset:

```ts
dispatchFilters({ type: 'reset' });
```

In `handleClearAll`, use the same reset before `onClearAll()`:

```ts
const handleClearAll = useCallback(() => {
  dispatchFilters({ type: 'reset' });
  onClearAll();
}, [onClearAll]);
```

Pass controlled callbacks to `FeatureIntroCard`:

```tsx
filterBad={filterBad}
onFilterBad={(bad) => dispatchFilters({ type: 'set-bad', bad })}
searchQuery={searchQuery}
onSearchChange={(query) => dispatchFilters({ type: 'set-query', query })}
showSearch={showSearch}
searchExpanded={searchExpanded}
onSearchExpandedChange={(expanded) => (
  dispatchFilters({ type: 'set-search-expanded', expanded })
)}
```

- [ ] **Step 5: Run search tests and typecheck**

```bash
rtk npx jest src/__tests__/ui/featureIntroCard.test.ts src/__tests__/ui/panelFilterState.test.ts src/__tests__/ui/panelFeatureSummary.test.ts --runInBand --watchman=false
rtk npm run typecheck
```

Expected: all suites PASS and TypeScript exits 0.

- [ ] **Step 6: Commit collapsible search**

```bash
rtk git add src/ui/panel/FeatureIntroCard.tsx src/ui/panel/FloatPanelView.tsx src/__tests__/ui/featureIntroCard.test.ts
rtk git commit -m "feat: collapse panel search into header"
```

---

### Task 7: Full Regression and Narrow-width Verification

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-6.
- Produces: fresh automated and manual evidence against every acceptance criterion.

- [ ] **Step 1: Run all focused UI and Session History tests**

```bash
rtk npx jest src/__tests__/ui/logRow.test.ts src/__tests__/ui/logRowConsumers.test.ts src/__tests__/ui/featureIntroCard.test.ts src/__tests__/ui/panelFilterState.test.ts src/__tests__/ui/panelFeatureSummary.test.ts src/__tests__/ui/featureRail.test.ts src/__tests__/features/sessionHistoryCatalog.test.ts --runInBand --watchman=false
```

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run the complete repository test suite**

```bash
rtk npm test -- --runInBand --watchman=false
```

Expected: Jest exits 0 with zero failed suites.

- [ ] **Step 3: Run static verification**

```bash
rtk npm run typecheck
rtk npm run lint
rtk git diff --check
```

Expected: all three commands exit 0 with no TypeScript errors, lint errors, or whitespace errors.

- [ ] **Step 4: Inspect the final diff against scope**

```bash
rtk git status --short
rtk git diff 5d8591e -- src/ui/shared/LogRow.tsx src/features src/ui/panel src/__tests__/ui src/__tests__/helpers/react-native.mock.js
```

Confirm the diff changes only the seven in-scope row consumers, the shared row, panel search state/UI, and their tests. Confirm detail bodies, feature capture, filtering helpers, and control-oriented tabs are unchanged.

- [ ] **Step 5: Verify narrow-width behavior in the existing Demo**

Launch the Demo in a 390-point-wide iOS simulator or equivalent Android emulator. Generate and inspect these cases:

1. Console message longer than three lines: exactly three preview lines, level below.
2. Native message with long platform/source/tag: three-line message, one-line truncated source, intact time.
3. Network request with long host, status, duration, and time: flexible host truncates and trailing time wraps without overlap.
4. Track event with two property previews: preview chips wrap below the event name.
5. Zustand action with store and duration: footer remains readable on two lines when required.
6. Navigation transition with duration, Copy, and time: full-width route preview and usable Copy action.
7. Search collapsed: only the compact action appears in the header.
8. Search expanded: input replaces the title region without moving the list vertically.
9. Search collapsed with a non-empty query: active search styling remains visible and the list stays filtered.
10. Tab switch and Clear All: query, Bad filter, and expansion all reset.

- [ ] **Step 6: Record the verified result**

If every command and manual case passes, report the exact Jest suite/test counts and the exit status of typecheck and lint. If a baseline failure appears outside the changed files, capture its full command and error separately and do not describe the implementation as fully verified.
