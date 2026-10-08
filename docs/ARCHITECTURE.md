# Architecture

- TypeScript + Vite browser SPA, deployed as static assets.
- Project model in `src/model.ts`, stable component and pin identifiers.
- `src/core/netlist.ts`: disjoint-set connectivity from explicit wires and internally connected breadboard rows/rails, including rail splits.
- `src/core/dc.ts`: experimental modified nodal analysis for one ideal DC battery and one approximated LED with resistive networks (parallel resistors allowed). The diode is a fixed 2 V drop, **not** SPICE.
- `src/core/simulator.ts`: compatibility entrypoint for the browser.
- Arduino visuals and code text editor do not execute firmware. No generalized sensor, transient, MCU or instrument simulation.
- `validProject` rejects invalid IDs, pins, malformed wires and unbounded numeric data.
- UI and SVG coordinates are not part of electrical connectivity; moving a part does not break attached wires.

See `docs/ROADMAP.md` for functionality not yet implemented.
