# Forklifts & Funiculars — Agent Instructions

## Run, Build, Verify

```bash
npm install
npm run dev          # Vite dev server on :5173
npm run build        # runs `tsc --noEmit` first, then `vite build` → dist/
npm run preview      # preview the production build locally
```

No lint, no test, no CI. TypeScript strict mode is the only type guarantee.

## Repo Structure

```
src/main.ts          — DOM wiring, input polling (keyboard + Gamepad API), game loop start
src/game/engine.ts   — GameEngine: init, loadLevel, tick loop, physics step, undo, HUD emission
src/game/types.ts    — Shared interfaces (LevelSpec, CargoSpawnSpec, ControlInput, HudSnapshot)
src/game/levels.ts   — LEVELS[] data array + FORKLIFT_MASS_TONS, STATION_Y constants
src/game/forklift.ts — Forklift class: kinematics, rear-wheel steer, pallet pickup/release
src/game/funicular.ts — FunicularSystem: kinematic twin-car movement, counterweight balance, dispatch
src/game/cargo.ts    — CargoItem, createCargoItem, syncCargoMesh, resetCargoToSpawn
src/game/camera.ts   — OverheadCameraController: 3/4 follow, stepped rotate, overview toggle
src/game/audio.ts    — SoundEngine: procedural Web Audio foley (no external audio files)
src/game/world.ts    — WorldEnvironment: scene setup, stations, tracks, weighbridges, drop zones
src/game/textures.ts — Procedural canvas texture generators (crate labels, signs, drop zones)
index.html           — Single HTML file with canvas + HUD overlay (no components)
vite.config.ts       — base: './', host: true, port: 5173
```

## Key Architecture Facts

- **Single-player browser game** — Three.js renderer + Rapier3D WASM physics, no backend.
- **Fixed timestep physics** — `GameEngine.tick()` accumulates real `dt`, steps Rapier at `1/60 s` fixed intervals. Never modify the accumulator pattern.
- **Level data is inline** — `src/game/levels.ts` exports `LEVELS[]`. Adding a level means pushing an object into this array; no external file loading.
- **Zero external assets** — All textures are procedural canvas (`src/game/textures.ts`). All audio is procedural Web Audio oscillators (`src/game/audio.ts`).
- **No build artifacts to clean** — `dist/` is the only output; delete it manually if needed.

## Forklift & Physics Gotchas

- Forklift body rotation is locked (`lockRotations()`). Visual tilt is a separate THREE.Group (`chassisTiltGroup`) for pitch/roll feedback — don't try to rotate the physics body for body lean.
- Forklift uses **kinematic-position-based** rigid body for cargo (when carried) and funicular-latched cargo. Always switch body type back to `Dynamic` when releasing.
- The pickup detection checks horizontal distance < 0.88m AND vertical fork-height alignment AND forward dot product > 0.75. Don't change these thresholds without testing.
- Fork heights: `MIN_FORK_H = 0.07`, `MAX_FORK_H = 2.45`. Mast tilt: `MIN_TILT = -0.14` (back/cradle), `MAX_TILT = 0.17` (forward/unload).
- `pickupCooldown = 0.28s` prevents re-pickup of just-released cargo.

## Funicular Counterweight Logic

- `tryDispatch()` checks `computeWeights()` — both cars must satisfy `deltaMax` (per-level) and `maxCarLoadTons` (default 8t).
- During transit, latched cargo/forklift use `KinematicPositionBased` and are moved by delta inheritance from car position changes — no physics solver needed.
- On arrival, all kinematic bodies are restored to `Dynamic` with zero velocity. Never skip this or you get stuck kinematic bodies.

## Camera

- 3/4 overhead at 47° pitch, 35° FOV. `Z`/`C` rotates in 90° steps; right-click drag is smooth orbit.
- `Tab` toggles Diorama Overview (zooms camera to distance 60, centers on `(0, 5.2, 0.5)`).
- During funicular transit, camera auto-extends distance by +6.0 for better framing.

## Saving

- Completed levels saved to `localStorage` under key `forklifts_funiculars_completed_v1`.
- `GameEngine.loadSaveData()` / `saveData()` handle this. No server, no IndexedDB.

## Adding Cargo Types or Level Content

1. Add the new `CargoKind` string to `src/game/types.ts` `CargoKind` type.
2. Extend the palette in `src/game/textures.ts` `createCrateTexture()`.
3. Update `src/game/levels.ts` with new `CargoSpawnSpec` entries and `DropZoneSpec` entries in the target level's `cargo[]` and `dropZones[]` arrays.
4. No code changes needed in engine, forklift, or funicular for new cargo data.

## Constraints from Toolchain

- `tsconfig.json`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`, `module: ESNext`, `target: ES2022`, `moduleResolution: bundler`.
- `vite.config.ts`: `base: './'` for GitHub Pages static deploy. Do not change this.
- Rapier3D WASM must be initialized before creating the physics world (`await RAPISER.init()` in `GameEngine.init()`).

## Reference

- Full game design document: `docs/game_design_document.md` (v0.2 draft)
