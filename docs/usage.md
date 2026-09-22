# Feature usage

[中文](usage.zh-CN.md) · [Integration](integration.md) · [Configuration](configuration.md)

withDebugToolkit(App) supplies all twelve features. Empty business data is normal. Feature objects add data/callbacks; sources carry dynamic values.

The complete example includes [App.tsx](examples/integration/App.tsx), [debug.config.tsx](examples/integration/debug.config.tsx), [source.ts](examples/integration/source.ts) and [Verification.tsx](examples/integration/Verification.tsx): local account switching, stable external store, Context bridge, State adapter and custom component. All imports and variables are defined.

| Action | Public API |
| --- | --- |
| Capture/language settings | network.maxLogs/excludeUrls, console.maxLogs, native filters, locale |
| State | state.adapters with id/getSnapshot/subscribe, or debug.state(id, event) |
| Navigation | navigation.ref or debug.navigation(event) |
| Analytics | debug.track(name, data?) |
| Service URL switching | environment.items/defaultId/onChange |
| Accounts | accounts.items/onSwitch or source; debug.accounts methods |
| Business panels | tabs.items with component and optional source |
| Copy/clear/report | debug.copyToComputer, debug.clear, debug.getReport |
| Panel/readiness | debug.open(), debug.close(), debug.ready() |

See the [full reference](configuration.md) for defaults, source XOR, callbacks, cancellation, Context boundaries, disk caps and copy results. Zustand's optional adapter is imported from react-native-debug-toolkit/adapters/zustand; ordinary subscriptions produce change events, not inferred business action names. Stores/routers/analytics are not discovered automatically.

[Hub commands and browser language](setup.md) are separate from SDK configuration. [Demo](https://github.com/superzcj/react-native-debug-toolkit/blob/main/Demo/README.md) validates both empty and fully configured business data.
