# v4 DevConnect LAN address assistance

## Goal

Make the Hub address usable in a Toolkit-enabled internal or Release build when
the build has no configured Hub endpoint. A phone on the same LAN should show
its detected IPv4 subnet prefix so the tester can enter only the computer
address suffix. A configured endpoint remains an explicit recommended choice.

## Sources and precedence

The Toolkit restores the native `getLocalIp` capability that existed in v3:

- iOS prefers the `en0` IPv4 address, then any non-loopback IPv4 address.
- Android prefers an active `wlan*` or `eth*` IPv4 address, then any active
  non-loopback IPv4 address.
- JavaScript derives `a.b.c.` only from a valid IPv4 address. No prefix is
  shown when the address is unavailable or unsuitable.

The address field resolves in this order:

1. A previously accepted manual Hub endpoint saved in the Toolkit-owned MMKV.
2. The host App's configured `features.devConnect.endpoint`, normally compiled
   from `JX_DEBUG_LOG_HUB_URL` or `EXPO_PUBLIC_DEBUG_LOG_HUB_URL`.
3. Empty input, with LAN recommendations when native detection succeeds.

Clearing the input removes the saved manual endpoint and returns to the
configured endpoint or an empty field. A recommendation never silently starts
uploading or replaces a configured/manual endpoint.

## UI and behavior

The existing full Hub address field remains the authoritative input and still
accepts a normalized HTTP address with an optional port.

Below it, the Toolkit shows recommendations in this fixed order:

1. `a.b.c.` from the phone's current LAN IPv4. Tapping it fills that prefix and
   focuses the field, allowing the tester to type only the computer IP's final
   one to three digits.
2. The configured complete endpoint. It is shown only when one exists; tapping
   it fills the exact normalized address.

The two recommendations are separate even when they describe the same subnet:
the first accelerates changing the computer suffix, while the second restores
the build's recommended Hub. If there is no detected prefix, only the configured
endpoint recommendation is shown. If neither exists, the field keeps the usual
empty-address validation and supports complete manual entry.

Submitting or blurring a valid manual address sets the runtime endpoint and
persists its normalized value. Invalid text remains editable and shows the
existing validation message. Existing `Upload Once` and live-log controls keep
their current explicit-start behavior.

## Scope and verification

This is a Toolkit-only change: JX continues to pass its optional endpoint from
Expo `extra`; no LAN IP is committed to JX source or an App manifest.

Tests cover IPv4-prefix derivation, native source contracts for `getLocalIp`,
manual endpoint persistence and clear-to-configured fallback, recommendation
ordering/selection, and the existing Hub connection behavior.
