# Killio Frontend

## Killio App runs this same code

Killio App (`../Killio-App`, Rust + Tauri) is not a second frontend: it opens this frontend inside a
native window, for whichever server the user picked. There is nothing to "replicate" by hand, but every
change here ships to the app too, so it must keep working there.

Rules for any change in this repo:

- **App-only behaviour goes through `src/lib/app-shell`.** Use `isKillioApp()` / `killioApp()`. Never
  sniff the user agent, and never call `window.__TAURI_INTERNALS__` directly.
- **App-only UI must render nothing on the web.** Decide after mount (see
  `src/components/app-shell/app-shell-menu-items.tsx`); the server never knows it is the app, so
  deciding during render causes a hydration mismatch.
- **No marketing inside the app.** The app shows sign-in / sign-up or the workspace, never a landing.
  A new public page that a signed-out user can reach from inside the app needs the same
  `isKillioApp()` skip that `src/app/page.tsx` has.
- **Links that leave Killio** (docs, payment pages, social profiles) should call
  `killioApp()?.openExternal(url)` when in the app, so they open in the system browser instead of
  replacing the app window.
- **A new native capability needs both sides in the same change:** the command in
  `Killio-App/src-tauri/src/commands.rs` (plus `build.rs`, `capabilities/default.json`, `init.js`) and
  its typed wrapper in `src/lib/app-shell/index.ts`. Check `info().features` before offering it: older
  installed apps will not have it.
- **Do not break offline.** The app relies on this repo's service worker (`src/app/sw.ts`) and
  `/offline`. `/offline` and `/login` must stay public in `src/middleware.ts`.

Killio App replaces Killio Vault (the Android companion). Device tools for the agent are added to
Killio App, not to Vault.
