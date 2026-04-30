# Demo App

This folder contains the local demo app for `react-native-debug-toolkit`.

Metro resolves `react-native-debug-toolkit` directly to the repository `src/` directory, so any library change can be verified in the demo without publishing a package first.

## What This Demo Does

- Presents a small realistic shopping-style app instead of a generator screen
- Lets you browse products, open details, add to cart, switch tabs, and open profile pages
- Triggers `Network`, `Console`, `Zustand`, `Navigation`, and `Track` logs through normal page interactions

## How To Use It

1. Start the demo app in development mode.
2. Browse the product list, open a product detail page, add it to cart, and switch between `Explore`, `Cart`, and `Profile`.
3. Tap the floating `DBG` button on the screen edge.
4. Open the `Network`, `Console`, `Zustand`, `Navigation`, and `Track` tabs to inspect the logs created by those page interactions.

## Setup

Install dependencies in both places:

```sh
# library root
npm install

# demo app
cd Demo
npm install
```

For iOS, install pods inside `Demo/ios`:

```sh
bundle install
bundle exec pod install
```

## Run The Demo

From `Demo/`:

```sh
npm start
```

In another terminal:

```sh
# Android
npm run android

# iOS
npm run ios
```

## Notes

- The floating button is shown only in development builds.
- You do not need to build the library before running the demo.
- The UI is intentionally simple so the logging flow is easy to understand at a glance.
