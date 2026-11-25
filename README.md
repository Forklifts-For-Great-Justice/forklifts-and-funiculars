# Forklifts & Funiculars (Web Prototype)

A **3/4 overhead**, 3D stylized low-poly physics logistics & delivery puzzle game built for the web with **Three.js**, **Rapier3D WASM**, **TypeScript**, and **Vite**.

See [Game Design Document](docs/game_design_document.md) for full game requirements, mechanics, and roadmap.

## Features Implemented (Vertical Slice)
- **Rear-Wheel-Steer Forklift:** Smooth tight turning, precision crawl (`Shift`), hydraulic mast lift (`R`/`F`), mast tilt (`Q`/`E`), deck lock (`Space`), horn (`H`), and overhead pallet footprint & fork-pocket alignment cues.
- **Linked Twin-Car Funicular:** Two cable-coupled wedge cars crossing a midpoint passing loop, automated station safety gates, rotating upper bullwheel, diegetic station arch balance gauges, zero-jitter onboard riding, and remote unmanned dispatch (`G` / `Enter`).
- **Counterweight Logistics Puzzles (3 Levels):**
  1. **Valley Depot:** First ride & multi-pallet loading (`Delta Max: 4t`).
  2. **The Counterweight:** Dispatch `2t` stone ballast unmanned on Car A so your `2t` forklift + `2t` heavy crate can ride Car B uphill (`Delta Max: 2t`).
  3. **Alpine Two-Way Swap:** Coordinate uphill heavy/supply deliveries and downhill fragile alpine wine (`Delta Max: 2t`) with fragile drop detection & Undo Trip (`Backspace`).
- **3/4 Overhead Camera & Controls:** Stepped `90°` camera rotation (`Z`/`C`), click-drag orbit, wheel zoom, Diorama Overview toggle (`Tab`), full Keyboard + HTML5 Gamepad API support, and procedural Web Audio foley.

## Run Locally

```bash
npm install
npm run dev
```

## Production Static Build

```bash
npm run build
npm run preview
```

Output lands in `dist/` and deploys to any static web host with no special COOP/COEP headers required.
