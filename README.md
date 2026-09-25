# Mini Tycoon Rush

A lightweight, mobile-first idle-tycoon game built in plain HTML/CSS/JS
(no frameworks, no build step). Grow a small shop into a global factory
empire across 10 levels.

## Run it

No installation needed — it's a static site.

- **Easiest:** double-click `index.html` to open it in a browser.
- **Recommended (avoids some browser file:// quirks):** serve it locally:
  ```
  cd mini-tycoon-rush
  python3 -m http.server 8000
  ```
  then open `http://localhost:8000`.

Works on desktop and mobile browsers. No build tools, no npm install.

## How to play

1. Tap **📦 PRODUCE** to make products (adds to Stock).
2. Tap **🛒 SELL** to sell all current Stock for Cash.
3. Tap **⚙️ UPGRADE** to spend Cash on a permanent upgrade — it increases
   how much you produce per tap and how much each product sells for.
4. Clear each level's objective (shown in the Objective card) to advance.
   There's no timer — take as long as you like.
5. Complete Level 10 (**Tycoon Empire**) to win.
6. Optional: tap **SHARE GAME → UNLOCK VIP** to unlock a gold VIP factory
   skin and VIP title at the end. This is purely cosmetic — the game is
   fully completable without it.

## Project structure

```
mini-tycoon-rush/
  index.html          Markup + screen structure (main screen, overlays)
  game.css             All styling (tokens at the top of the file)
  game.js               All game logic, in separate systems:
                          GameState, SaveManager, LevelManager,
                          EconomyManager, FactoryManager, UIManager,
                          AnimationManager, AudioManager, VIPManager,
                          EventManager, Game (orchestrator)
  assets/              Empty — kept for future real art; the shipped
                        game draws its factory/machines procedurally
                        (CSS + emoji) so it needs zero image assets.
  audio/               Empty — kept for future real sound files; the
                        shipped game generates its sound effects live
                        with the Web Audio API (see "About the audio"
                        below), so it needs zero audio files.
  README.md            This file
```

## About the audio

The spec called for mp3 files (click, produce, sell, upgrade, level-up,
celebration). Since binary audio assets can't be generated here, every
sound is instead **synthesized live** with the Web Audio API
(`AudioManager` in `game.js` — short oscillator "blips" for each action).
This keeps the game dependency-free and small, and it degrades silently:
if Web Audio is unavailable, the game simply plays no sound and nothing
breaks. If you'd rather ship real mp3s later, drop them in `/audio/` and
swap `AudioManager`'s `tone()` calls for `new Audio('audio/x.mp3').play()`.

## About the art

Rather than static image files, the factory scene is built procedurally
in `FactoryManager` (in `game.js`) from CSS shapes + emoji, styled with
CSS animations (`game.css`). It evolves visually across all 10 levels
(shop → store → workshop → factory → industrial plant → global empire)
and gets a gold "VIP" treatment once VIP is unlocked. If you want to
swap in real illustrated art later, replace the emoji strings in the
`STAGE_ART` object in `game.js` with `<img>`/sprite references, and drop
the corresponding files into `/assets/`.

## Save system

`SaveManager` (in `game.js`) is a small, isolated wrapper around
`localStorage` with just two methods: `save(state)` / `load()`. All game
progress funnels through `GameState.serialize()` / `restore()`, so
swapping the storage backend later (e.g. for a YouTube Playables–provided
save API) only means editing `SaveManager` — nothing else in the game
needs to change.

## YouTube Playables notes

This build is **not yet submitted or certified** as a Playable — it's a
locally-runnable prototype built to Playables' general constraints:

- Pure web tech (HTML/CSS/JS), no engine dependency, uses standard
  Canvas (for the confetti effect) — no WebGL requirement.
- Mobile-first, touch-friendly, portrait-friendly, responsive down to
  narrow phone widths, no horizontal scrolling.
- No dependency on any Playables-specific API for core gameplay — the
  game runs fully standalone. A `playables.js` integration stub is the
  natural next step (not included here) for wiring up any
  platform-specific save/analytics hooks later, kept isolated from the
  core game exactly the way `SaveManager` already is.
- As of this writing, developer access to YouTube Playables is in early
  access — you apply via Google's interest form before you can submit a
  game for review. Actual submission/certification requirements should
  be checked against Google's current Playables developer docs before
  shipping, since that process can change.

## What was tested

Because this environment can't run a real browser, testing was done two
ways:

1. **Logic simulation** — a standalone script re-runs the exact same
   level/economy constants and rules as `game.js` (produce/sell/upgrade
   math, objective thresholds, level-advance logic) under three
   different play strategies, and asserts: every level 1–10 is
   reachable and completable, cash/stock/upgrades never go negative or
   `NaN`, and the game reaches the Level 10 completion state.
   All three strategies passed.
2. **Static checks** — `game.js` was syntax-checked, and every DOM
   element ID referenced in `game.js` was cross-checked against
   `index.html` to confirm there are no dangling references (a common
   source of "button does nothing" bugs).

Before shipping, it's worth a manual pass in a real mobile browser to
sanity-check animation timing/feel and touch-target sizing, which can't
be fully verified without a live renderer.
