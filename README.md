# Circuits

[简体中文](README.zh-CN.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md)

Circuits is an **independent, open-source browser circuit workbench** written in TypeScript + Vite. Its long-term goal is functional parity with Tinkercad Circuits, not reproduction of Autodesk's proprietary code, branding, or artwork.

> **v0.2.0-alpha.6 — experimental prototype.** This is **not** a complete Tinkercad Circuits replica, SPICE simulator, or functioning Arduino emulator.

## Implemented

- SVG editor with a 12-kind component palette: battery, resistor, LED, breadboard, Arduino Uno, switch, pushbutton, potentiometer, capacitor, buzzer, multimeter, servo
- Add, drag, rotate, select, Shift-select, marquee-select, group-move, batch-rotate/delete and wire components by pin; wire selection, color editing and deletion
- Undo/redo, multi-project browser library, duplicate/open/delete projects, versioned JSON import/export, zoom, grid snapping, editable wire bends, drag-to-reconnect wire endpoints, resistor/LED breadboard lead insertion with auto-snap, and text-only Arduino sketch editor
- Breadboard connectivity: five-hole strips, separated sides, independent power rails split into two segments
- Experimental DC modified nodal analysis for **one battery + one LED** with resistor networks (including parallel paths), plus a toggleable ideal two-terminal switch
- Import schema validation and Node unit tests

**Simulation limitations:** a fixed 2 V LED forward drop is a teaching approximation; other depicted parts do not have runnable electrical models. There is no microcontroller code execution, SPICE/transient simulation, oscilloscope or real multimeter simulation. Unsupported wired parts are not silently treated as real simulations.

## Development

Requires Node.js 22.12+.

```sh
npm install
npm run typecheck
npm test
npm run test:e2e # requires: npx playwright install chromium
npm run build
npm run dev
```

## CI and GitHub Pages

Pushes to `main` run `.github/workflows/ci.yml` (TypeScript, tests, production build), and always preserve a successful `circuits-dist` build artifact.

**One-time setup:** repository administrator must visit [Settings → Pages](https://github.com/rushairer/Circuits/settings/pages) and choose **GitHub Actions** as the build and deployment source. Until then, CI can be green but the Pages deployment is explicitly skipped. Once enabled, the workflow also performs an HTTP smoke test against the published site after deployment. Trigger **Run workflow** in [Actions](https://github.com/rushairer/Circuits/actions/workflows/ci.yml) or push another commit.

Expected URL **only after a successful deployment**: https://rushairer.github.io/Circuits/.

## Scope and licensing

See [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md), and [AGENTS.md](AGENTS.md). This independent project is not affiliated with Autodesk or Tinkercad. Original project code is MIT licensed.

### Keyboard operation

Tab focuses components; Enter/Space selects a focused component (Shift adds/removes). Ctrl/Cmd+A selects all components. Arrow keys nudge the selected set, Alt+Arrow nudges by one world unit, Delete removes selected parts, and Ctrl/Cmd+Z undoes one batch.
