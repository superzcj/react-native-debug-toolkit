# Demo App

Demo for local development. Metro resolves package imports to repository `src/`.

## Covers

- shopping flow: list, detail, cart, profile
- Network / Console / Zustand / Navigation / Track logs
- raw XHR test: `Profile` -> `Dev Tools` -> `XHR GET`
- Desktop Logs: `Send Once` / `Start Live Sync`

## Run

```sh
npm install
cd Demo
npm install
npm start
```

Then:

```sh
npm run ios
npm run android
```

iOS pods:

```sh
cd Demo/ios
bundle install
bundle exec pod install
```

## Test Desktop Logs

From repository root:

```sh
node bin/debug-toolkit.js --daemon-only
```

Open:

```text
http://127.0.0.1:3799/console
```

In app: `DBG` -> gear -> `Send Once` or `Start Live Sync`.

Real device: phone browser must open `http://<mac-ip>:3799/health`.
