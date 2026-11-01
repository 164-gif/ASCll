# ASCII

A browser-first atmospheric RPG prototype where a reactive 3D world is rendered through a glyph/ASCII visual language.

## Current milestone

- Minimal full-screen main menu
- Procedural animated glyph forest backdrop
- Responsive desktop/mobile layout
- Fullscreen API support (`F11` or UI control)
- Accessible DOM-based menu layer
- GitHub Pages deployment through GitHub Actions

## Stack

- TypeScript
- Vite
- Three.js (runtime foundation for the playable world)
- DOM UI over the render surface

The current menu background is a lightweight procedural glyph renderer. The playable milestone will move world rendering into Three.js while keeping simulation, rendering and UI separated.

## Local development

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Project structure

```text
src/
  app/              application composition
  core/             platform/input utilities
  render/           rendering systems and scenes
  ui/               DOM menus and overlays
  simulation/       future renderer-independent game state
  physics/          future Rapier bridge
  diagnostics/      future debug/performance tools
```

See [`docs/architecture.md`](docs/architecture.md) for the planned runtime boundaries.
