# React Native Debug Toolkit

[中文文档](README.zh-CN.md)

A dev-only floating debug panel for React Native — inspect network, console, state, navigation and more, right on your device.

> Zero impact on production builds (`__DEV__` only).

## Preview

![demo](demo.gif)
## Features

- **Network** — Auto-intercepts fetch; axios via `axiosInstance` config, inspect requests & responses, copy as cURL
- **Console** — Capture `console.log / info / warn / error`
- **Zustand** — Log state transitions via middleware
- **Navigation** — Track route changes
- **Track** — Record custom analytics events
- **Environment** — Switch API hosts on the fly
- **Clipboard** — Paste text and copy to computer
- **Log Persistence** — Network, Console, Track logs survive app restarts (requires AsyncStorage)

## Installation

```bash
npm install react-native-debug-toolkit
```

Optional — clipboard copy support:

```bash
npm install @react-native-clipboard/clipboard
```

Optional — FAB position & last tab persistence:

```bash
npm install @react-native-async-storage/async-storage
```

Without AsyncStorage these features degrade gracefully to in-memory state.

## Quick Start

```tsx
import { DebugView } from 'react-native-debug-toolkit';

function App() {
  return (
    <DebugView>
      <AppContent />
    </DebugView>
  );
}
```

A floating debug button appears in dev mode. Tap to open the panel, tap × or swipe down to close.

Network (fetch), console, navigation, zustand, track, and clipboard are enabled by default. To capture axios requests, pass your axios instance via the `axiosInstance` config option.

Disable specific features:

```tsx
<DebugView features={{ clipboard: false, zustand: false }}>
  <AppContent />
</DebugView>
```

## Common Patterns

### Navigation Tracking

```tsx
import { useRef } from 'react';
import { DebugView } from 'react-native-debug-toolkit';
import { NavigationContainer } from '@react-navigation/native';

function App() {
  const navRef = useRef(null);
  return (
    <DebugView navigationRef={navRef}>
      <NavigationContainer ref={navRef}>
        <AppContent />
      </NavigationContainer>
    </DebugView>
  );
}
```

### Environment Switching

```tsx
<DebugView
  environments={[
    { id: 'dev',  label: 'Dev',  host: 'dev-api.example.com', color: '#34C759' },
    { id: 'prod', label: 'Prod', host: 'api.example.com',     color: '#FF3B30' },
  ]}
>
  <AppContent />
</DebugView>
```

### Zustand Middleware

```tsx
import { zustandLogMiddleware } from 'react-native-debug-toolkit';

const useStore = create(
  zustandLogMiddleware((set) => ({
    count: 0,
    increment: () => set((s) => ({ count: s.count + 1 }), false, 'increment'),
    //                          ↑ merge  ↑ action name (shown in debug panel)
  }))
);
```

### Custom Events

```tsx
import { addTrackLog } from 'react-native-debug-toolkit';

addTrackLog({ eventName: 'button_click', buttonId: 'submit' });
```

### Network Blacklist & Axios

```tsx
import axios from 'axios';

const api = axios.create({ baseURL: 'https://api.example.com' });

<DebugView
  features={{
    network: {
      maxLogs: 100,
      blacklist: ['/analytics', /\/healthcheck$/],
      axiosInstance: api,
    },
  }}
>
  <AppContent />
</DebugView>
```

## Imperative API

For programmatic control outside React (notifications, deep links, dev-only buttons):

```tsx
import { DebugToolkit } from 'react-native-debug-toolkit';

DebugToolkit.openPanel();
DebugToolkit.clearAll();
DebugToolkit.showLauncher();
DebugToolkit.hideLauncher();
```

Full API: `DebugToolkit` is a singleton with `openPanel`, `closePanel`, `togglePanel`, `clearAll`, `showLauncher`, `hideLauncher`, `addFeature`, `removeFeature`, `destroy`, `features`, `panelOpen`. See TypeScript types for details.

## Peer Dependencies

| Package | Version | Required |
|---------|---------|----------|
| react | >= 18.0.0 | Yes |
| react-native | >= 0.72.0 | Yes |
| @react-native-clipboard/clipboard | >= 1.0.0 | No |
| @react-native-async-storage/async-storage | >= 1.0.0 | No |

## License

MIT
